"""Redis-backed admission control for long-running jobs."""

from __future__ import annotations

import os
import time
import uuid
from typing import Optional

from cache_backend import cache_backend


QUEUE_MAX_PENDING = max(1, int(os.getenv("QUEUE_MAX_PENDING", "100")))
QUEUE_GLOBAL_CONCURRENCY = max(1, int(os.getenv("QUEUE_GLOBAL_CONCURRENCY", "4")))
QUEUE_SLOT_TTL_SECONDS = max(60, int(os.getenv("QUEUE_SLOT_TTL_SECONDS", "1500")))
QUEUE_TASK_LEASE_TTL_SECONDS = max(
    60,
    int(os.getenv("QUEUE_TASK_LEASE_TTL_SECONDS", "180")),
)
QUEUE_MIN_CONCURRENCY = max(1, int(os.getenv("QUEUE_MIN_CONCURRENCY", "2")))
QUEUE_MEMORY_LOW_MB = max(256, int(os.getenv("QUEUE_MEMORY_LOW_MB", "1400")))
QUEUE_MEMORY_RECOVER_MB = max(
    QUEUE_MEMORY_LOW_MB + 128,
    int(os.getenv("QUEUE_MEMORY_RECOVER_MB", "2400")),
)
QUEUE_LOAD_HIGH = max(1.0, float(os.getenv("QUEUE_LOAD_HIGH", "6.0")))
QUEUE_LOAD_RECOVER = max(0.5, float(os.getenv("QUEUE_LOAD_RECOVER", "4.0")))
QUEUE_CAPACITY_KEY = "queue:heavy:effective_limit"

ROLE_LIMITS = {
    "normal": 1,
    "free": 1,
    "vip": 3,
    "svip": 6,
    "admin": 4,
}

ROLE_PRIORITIES = {
    "normal": 10,
    "free": 10,
    "vip": 20,
    "svip": 30,
    "admin": 40,
}


def queue_enabled() -> bool:
    value = str(os.getenv("QUEUE_ENABLED") or "").strip().lower()
    if value in {"0", "false", "no", "off"}:
        return False
    if value in {"1", "true", "yes", "on"}:
        return True
    return bool(os.getenv("CELERY_BROKER_URL") or os.getenv("REDIS_URL"))


def broker_ready() -> bool:
    if not queue_enabled() or not cache_backend.available():
        return False
    try:
        from celery_app import celery_app

        with celery_app.connection_for_write() as connection:
            connection.ensure_connection(max_retries=1)
        return True
    except Exception as exc:
        cache_backend._mark_redis_failed(exc)
        return False


def enqueue_smart_research(payload: dict, *, priority: int = 5) -> str:
    if not broker_ready():
        raise RuntimeError("后台任务队列不可用，请检查 Redis 和 Celery 配置")
    from celery_app import celery_app

    result = celery_app.send_task(
        "quantsys.smart_research",
        kwargs=payload,
        queue="research",
        priority=max(0, min(9, int(priority))),
    )
    return str(result.id)


def enqueue_named_task(
    task_name: str,
    payload: dict,
    *,
    queue: str = "long_tasks",
    priority: int = 5,
) -> str:
    if not broker_ready():
        raise RuntimeError("后台任务队列不可用，请检查 Redis 和 Celery 配置")
    from celery_app import celery_app

    result = celery_app.send_task(
        str(task_name),
        kwargs=payload,
        queue=queue,
        priority=max(0, min(9, int(priority))),
    )
    return str(result.id)


def normalized_role(role: Optional[str]) -> str:
    value = str(role or "normal").strip().lower()
    return value if value in ROLE_LIMITS else "normal"


def user_concurrency_limit(role: Optional[str]) -> int:
    return ROLE_LIMITS[normalized_role(role)]


def recommended_concurrency(
    available_memory_mb: Optional[float],
    load_1m: Optional[float],
    *,
    current_limit: Optional[int] = None,
) -> int:
    """Return a hysteresis-based heavy-task limit for one 4C8G host."""
    configured = QUEUE_GLOBAL_CONCURRENCY
    minimum = min(configured, QUEUE_MIN_CONCURRENCY)
    current = max(minimum, min(configured, int(current_limit or configured)))
    memory_value = float(available_memory_mb) if available_memory_mb is not None else None
    load_value = float(load_1m) if load_1m is not None else None
    if (
        (memory_value is not None and memory_value <= QUEUE_MEMORY_LOW_MB)
        or (load_value is not None and load_value >= QUEUE_LOAD_HIGH)
    ):
        return minimum
    if current <= minimum:
        memory_recovered = memory_value is None or memory_value >= QUEUE_MEMORY_RECOVER_MB
        load_recovered = load_value is None or load_value <= QUEUE_LOAD_RECOVER
        if memory_recovered and load_recovered:
            return configured
        return minimum
    return configured


def _host_capacity_snapshot() -> tuple[Optional[float], Optional[float]]:
    available_mb = None
    load_1m = None
    try:
        with open("/proc/meminfo", "r", encoding="ascii") as handle:
            for line in handle:
                if line.startswith("MemAvailable:"):
                    available_mb = float(line.split()[1]) / 1024.0
                    break
    except Exception:
        available_mb = None
    try:
        load_1m = float(os.getloadavg()[0])
    except Exception:
        load_1m = None
    return available_mb, load_1m


def effective_global_concurrency() -> int:
    client = cache_backend.redis
    if client is None:
        return QUEUE_GLOBAL_CONCURRENCY
    try:
        value = client.get(QUEUE_CAPACITY_KEY)
        return max(
            1,
            min(QUEUE_GLOBAL_CONCURRENCY, int(value or QUEUE_GLOBAL_CONCURRENCY)),
        )
    except Exception as exc:
        cache_backend._mark_redis_failed(exc)
        return QUEUE_GLOBAL_CONCURRENCY


def refresh_capacity_limit() -> dict:
    """Adjust admission only; already-running jobs are allowed to finish."""
    available_mb, load_1m = _host_capacity_snapshot()
    current = effective_global_concurrency()
    recommended = recommended_concurrency(
        available_mb,
        load_1m,
        current_limit=current,
    )
    client = cache_backend.redis
    if client is not None:
        try:
            client.set(QUEUE_CAPACITY_KEY, recommended, ex=120)
        except Exception as exc:
            cache_backend._mark_redis_failed(exc)
    return {
        "configured_limit": QUEUE_GLOBAL_CONCURRENCY,
        "effective_limit": recommended,
        "available_memory_mb": round(available_mb, 1) if available_mb is not None else None,
        "load_1m": round(load_1m, 2) if load_1m is not None else None,
    }


def queue_priority(role: Optional[str], enqueued_at: Optional[float] = None) -> int:
    """Tier priority plus bounded waiting-time aging."""
    base = ROLE_PRIORITIES[normalized_role(role)]
    if not enqueued_at:
        return base
    waited_minutes = max(0, int((time.time() - float(enqueued_at)) / 60))
    return base + min(20, waited_minutes // 5)


def _zset_acquire(key: str, token: str, limit: int, ttl: int) -> bool:
    client = cache_backend.redis
    if client is None:
        return False
    now = time.time()
    expires_at = now + ttl
    script = """
    redis.call('zremrangebyscore', KEYS[1], '-inf', ARGV[1])
    local count = redis.call('zcard', KEYS[1])
    if count < tonumber(ARGV[2]) then
      redis.call('zadd', KEYS[1], ARGV[3], ARGV[4])
      redis.call('expire', KEYS[1], tonumber(ARGV[5]))
      return 1
    end
    return 0
    """
    try:
        return bool(
            client.eval(
                script,
                1,
                key,
                now,
                limit,
                expires_at,
                token,
                ttl,
            )
        )
    except Exception as exc:
        cache_backend._mark_redis_failed(exc)
        return False


def _zset_release(key: str, token: str) -> None:
    client = cache_backend.redis
    if client is None:
        return
    try:
        client.zrem(key, token)
    except Exception as exc:
        cache_backend._mark_redis_failed(exc)


class ExecutionSlot:
    def __init__(
        self,
        global_token: str,
        user_token: str,
        user_id: int,
        scope: str = "heavy",
    ):
        self.global_token = global_token
        self.user_token = user_token
        self.user_id = user_id
        self.scope = str(scope or "heavy").strip() or "heavy"
        self.global_key = f"queue:{self.scope}:global"
        self.user_key = f"queue:{self.scope}:user:{self.user_id}"

    def release(self) -> None:
        _zset_release(self.global_key, self.global_token)
        _zset_release(self.user_key, self.user_token)


class TaskLease:
    """Short renewable lease preventing duplicate delivery execution."""

    def __init__(self, key: str, token: str, ttl: int):
        self.key = key
        self.token = token
        self.ttl = max(60, int(ttl))

    def refresh(self) -> bool:
        client = cache_backend.redis
        if client is None:
            return False
        script = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('expire', KEYS[1], tonumber(ARGV[2]))
        end
        return 0
        """
        try:
            return bool(client.eval(script, 1, self.key, self.token, self.ttl))
        except Exception as exc:
            cache_backend._mark_redis_failed(exc)
            return False

    def release(self) -> None:
        client = cache_backend.redis
        if client is None:
            return
        try:
            client.eval(
                "if redis.call('get', KEYS[1]) == ARGV[1] then "
                "return redis.call('del', KEYS[1]) else return 0 end",
                1,
                self.key,
                self.token,
            )
        except Exception as exc:
            cache_backend._mark_redis_failed(exc)


def acquire_task_lease(
    task_key: str,
    *,
    ttl: int = QUEUE_TASK_LEASE_TTL_SECONDS,
) -> Optional[TaskLease]:
    """Acquire a renewable idempotency lease for one durable DB task."""
    client = cache_backend.redis
    if client is None:
        return None
    normalized_key = str(task_key or "").strip()
    if not normalized_key:
        return None
    lease_key = f"queue:task-lease:{normalized_key}"
    token = uuid.uuid4().hex
    safe_ttl = max(60, int(ttl))
    try:
        if not client.set(lease_key, token, nx=True, ex=safe_ttl):
            return None
        return TaskLease(lease_key, token, safe_ttl)
    except Exception as exc:
        cache_backend._mark_redis_failed(exc)
        return None


def acquire_execution_slot(
    user_id: int,
    role: Optional[str],
    *,
    scope: str = "heavy",
) -> Optional[ExecutionSlot]:
    """Acquire global and per-user slots atomically enough for worker admission."""
    if not cache_backend.available():
        return None
    global_token = uuid.uuid4().hex
    user_token = uuid.uuid4().hex
    normalized_scope = str(scope or "heavy").strip() or "heavy"
    global_key = f"queue:{normalized_scope}:global"
    user_key = f"queue:{normalized_scope}:user:{int(user_id)}"
    if not _zset_acquire(
        global_key,
        global_token,
        effective_global_concurrency(),
        QUEUE_SLOT_TTL_SECONDS,
    ):
        return None
    if not _zset_acquire(
        user_key,
        user_token,
        user_concurrency_limit(role),
        QUEUE_SLOT_TTL_SECONDS,
    ):
        _zset_release(global_key, global_token)
        return None
    return ExecutionSlot(global_token, user_token, int(user_id), normalized_scope)


def refresh_execution_slot(slot: ExecutionSlot) -> bool:
    client = cache_backend.redis
    if client is None:
        return False
    now = time.time()
    try:
        client.zadd(
            slot.global_key,
            {slot.global_token: now + QUEUE_SLOT_TTL_SECONDS},
        )
        client.zadd(
            slot.user_key,
            {slot.user_token: now + QUEUE_SLOT_TTL_SECONDS},
        )
        client.expire(slot.global_key, QUEUE_SLOT_TTL_SECONDS)
        client.expire(slot.user_key, QUEUE_SLOT_TTL_SECONDS)
        return True
    except Exception as exc:
        cache_backend._mark_redis_failed(exc)
        return False


def queue_health(scope: str = "heavy") -> dict:
    client = cache_backend.redis
    if client is None:
        return {
            "available": False,
            "global_active": None,
            "global_limit": QUEUE_GLOBAL_CONCURRENCY,
            "effective_limit": QUEUE_GLOBAL_CONCURRENCY,
            "active_workers": 0,
        }
    try:
        now = time.time()
        normalized_scope = str(scope or "heavy").strip() or "heavy"
        client.zremrangebyscore(f"queue:{normalized_scope}:global", "-inf", now)
        client.zremrangebyscore("health:celery:workers", "-inf", now)
        active = int(client.zcard(f"queue:{normalized_scope}:global") or 0)
        workers = int(client.zcard("health:celery:workers") or 0)
        effective_limit = effective_global_concurrency()
        return {
            "available": True,
            "global_active": active,
            "global_limit": QUEUE_GLOBAL_CONCURRENCY,
            "effective_limit": effective_limit,
            "active_workers": workers,
        }
    except Exception as exc:
        cache_backend._mark_redis_failed(exc)
        return {
            "available": False,
            "global_active": None,
            "global_limit": QUEUE_GLOBAL_CONCURRENCY,
            "effective_limit": QUEUE_GLOBAL_CONCURRENCY,
            "active_workers": 0,
        }


def record_worker_heartbeat(worker_id: str, ttl: int = 45) -> bool:
    client = cache_backend.redis
    if client is None:
        return False
    try:
        now = time.time()
        client.zremrangebyscore("health:celery:workers", "-inf", now)
        client.zadd("health:celery:workers", {str(worker_id): now + max(15, int(ttl))})
        client.expire("health:celery:workers", max(60, int(ttl) * 2))
        return True
    except Exception as exc:
        cache_backend._mark_redis_failed(exc)
        return False
