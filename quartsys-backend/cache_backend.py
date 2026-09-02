"""Shared Redis-backed cache primitives used by the API and task workers."""

from __future__ import annotations

import os
import random
import threading
import time
import uuid
import base64
import zlib
from collections import OrderedDict
from contextlib import contextmanager
from typing import Iterator, Optional


def _env_bool(name: str, default: bool = False) -> bool:
    value = str(os.getenv(name, "1" if default else "0")).strip().lower()
    return value in {"1", "true", "yes", "on"}


class CacheBackend:
    """Redis first, bounded in-memory fallback for local development."""

    def __init__(self) -> None:
        self.redis_url = str(os.getenv("REDIS_URL") or "").strip()
        self.environment = str(os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "development").lower()
        self.require_redis = _env_bool(
            "CACHE_REQUIRE_REDIS",
            self.environment in {"production", "prod"},
        )
        self.allow_memory_fallback = _env_bool(
            "CACHE_ALLOW_MEMORY_FALLBACK",
            not self.require_redis,
        )
        self.l1_enabled = _env_bool("CACHE_L1_ENABLED", False)
        self.memory_max_entries = max(100, int(os.getenv("CACHE_MEMORY_MAX_ENTRIES") or 5000))
        self.compress_threshold = max(
            4096,
            int(os.getenv("CACHE_COMPRESS_THRESHOLD_BYTES") or 65536),
        )
        self.max_value_bytes = max(
            self.compress_threshold,
            int(os.getenv("CACHE_MAX_VALUE_BYTES") or 5 * 1024 * 1024),
        )
        self.default_jitter_ratio = max(
            0.0,
            min(0.25, float(os.getenv("CACHE_TTL_JITTER_RATIO") or 0.1)),
        )
        self.memory_cache: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._memory_lock = threading.RLock()
        self._local_locks: dict[str, threading.Lock] = {}
        self._local_locks_guard = threading.Lock()
        self._redis = None
        self._last_connect_attempt = 0.0
        self._last_error = ""
        self._stats_lock = threading.Lock()
        self._stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "set_failures": 0,
            "redis_errors": 0,
            "compressed_values": 0,
        }
        self._connect(force=True)

    def _increment(self, name: str, amount: int = 1) -> None:
        with self._stats_lock:
            self._stats[name] = int(self._stats.get(name, 0)) + int(amount)

    @property
    def redis(self):
        self._connect()
        return self._redis

    def _connect(self, *, force: bool = False) -> None:
        if self._redis is not None or not self.redis_url:
            return
        now = time.monotonic()
        if not force and now - self._last_connect_attempt < 5:
            return
        self._last_connect_attempt = now
        try:
            import redis

            client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                health_check_interval=30,
                retry_on_timeout=True,
            )
            client.ping()
            self._redis = client
            self._last_error = ""
        except Exception as exc:  # Redis can recover after process startup.
            self._redis = None
            self._last_error = str(exc)

    def _mark_redis_failed(self, exc: Exception) -> None:
        self._last_error = str(exc)
        self._redis = None
        self._increment("redis_errors")

    def reset_after_fork(self) -> None:
        """Discard inherited sockets before a prefork worker reconnects."""
        self._redis = None
        self._last_connect_attempt = 0.0
        self._connect(force=True)

    def available(self) -> bool:
        client = self.redis
        if client is None:
            return False
        try:
            client.ping()
            return True
        except Exception as exc:
            self._mark_redis_failed(exc)
            return False

    def status(self) -> dict:
        redis_ok = self.available()
        with self._stats_lock:
            stats = dict(self._stats)
        total_reads = int(stats.get("hits", 0)) + int(stats.get("misses", 0))
        return {
            "redis_configured": bool(self.redis_url),
            "redis_available": redis_ok,
            "memory_fallback": bool(self.allow_memory_fallback),
            "required": bool(self.require_redis),
            "last_error": self._last_error if not redis_ok else "",
            "stats": {
                **stats,
                "hit_rate": (
                    round(float(stats.get("hits", 0)) / total_reads, 4)
                    if total_reads
                    else None
                ),
            },
        }

    def _memory_get(self, key: str) -> Optional[str]:
        now = time.time()
        with self._memory_lock:
            cached = self.memory_cache.get(key)
            if not cached:
                return None
            expires_at, value = cached
            if expires_at < now:
                self.memory_cache.pop(key, None)
                return None
            self.memory_cache.move_to_end(key)
            return value

    def _memory_set(self, key: str, value: str, ttl: int) -> None:
        with self._memory_lock:
            self.memory_cache[key] = (time.time() + ttl, value)
            self.memory_cache.move_to_end(key)
            while len(self.memory_cache) > self.memory_max_entries:
                self.memory_cache.popitem(last=False)

    def get(self, key: str) -> Optional[str]:
        client = self.redis
        if client is not None:
            try:
                value = client.get(key)
                if value is not None:
                    self._increment("hits")
                    return self._decode_value(value)
                if self.l1_enabled:
                    value = self._decode_value(self._memory_get(key))
                    self._increment("hits" if value is not None else "misses")
                    return value
                self._increment("misses")
                return None
            except Exception as exc:
                self._mark_redis_failed(exc)
        if self.allow_memory_fallback:
            value = self._decode_value(self._memory_get(key))
            self._increment("hits" if value is not None else "misses")
            return value
        self._increment("misses")
        return None

    def wait_for_value(
        self,
        key: str,
        *,
        timeout: float = 2.0,
        interval: float = 0.05,
    ) -> Optional[str]:
        """Wait briefly for the request holding a cache-fill lock to publish."""
        deadline = time.monotonic() + max(0.0, float(timeout))
        sleep_for = max(0.01, min(0.5, float(interval)))
        while time.monotonic() < deadline:
            value = self.get(key)
            if value is not None:
                return value
            time.sleep(sleep_for)
        return None

    def _encode_value(self, value: str) -> Optional[str]:
        raw = str(value).encode("utf-8")
        if len(raw) >= self.compress_threshold:
            compressed = zlib.compress(raw, level=5)
            encoded = "zlib:" + base64.b64encode(compressed).decode("ascii")
            self._increment("compressed_values")
        else:
            encoded = str(value)
        if len(encoded.encode("utf-8")) > self.max_value_bytes:
            return None
        return encoded

    @staticmethod
    def _decode_value(value: Optional[str]) -> Optional[str]:
        if value is None or not str(value).startswith("zlib:"):
            return value
        try:
            compressed = base64.b64decode(str(value)[5:].encode("ascii"))
            return zlib.decompress(compressed).decode("utf-8")
        except Exception:
            return None

    def set(self, key: str, value: str, *, ex: int = 60, jitter: bool = True) -> bool:
        ttl = max(1, int(ex or 60))
        if jitter and self.default_jitter_ratio:
            ttl += random.randint(0, max(1, int(ttl * self.default_jitter_ratio)))
        stored_value = self._encode_value(value)
        if stored_value is None:
            self._increment("set_failures")
            return False
        client = self.redis
        if client is not None:
            try:
                client.set(key, stored_value, ex=ttl)
                if self.l1_enabled:
                    self._memory_set(key, stored_value, ttl)
                self._increment("sets")
                return True
            except Exception as exc:
                self._mark_redis_failed(exc)
        if self.allow_memory_fallback:
            self._memory_set(key, stored_value, ttl)
            self._increment("sets")
            return True
        self._increment("set_failures")
        return False

    def delete(self, key: str) -> None:
        with self._memory_lock:
            self.memory_cache.pop(key, None)
        client = self.redis
        if client is not None:
            try:
                client.delete(key)
            except Exception as exc:
                self._mark_redis_failed(exc)

    def _local_lock(self, key: str) -> threading.Lock:
        with self._local_locks_guard:
            return self._local_locks.setdefault(key, threading.Lock())

    @contextmanager
    def lock(self, key: str, *, timeout: int = 30) -> Iterator[bool]:
        """Acquire a non-blocking distributed lock, with a local dev fallback."""
        lock_key = f"lock:{key}"
        token = uuid.uuid4().hex
        client = self.redis
        if client is not None:
            try:
                acquired = bool(client.set(lock_key, token, nx=True, ex=max(1, timeout)))
            except Exception as exc:
                self._mark_redis_failed(exc)
                yield False
                return
            try:
                yield acquired
            finally:
                if acquired:
                    try:
                        client.eval(
                            "if redis.call('get', KEYS[1]) == ARGV[1] then "
                            "return redis.call('del', KEYS[1]) else return 0 end",
                            1,
                            lock_key,
                            token,
                        )
                    except Exception:
                        pass
            return

        if not self.allow_memory_fallback:
            yield False
            return
        local_lock = self._local_lock(lock_key)
        acquired = local_lock.acquire(blocking=False)
        try:
            yield acquired
        finally:
            if acquired:
                local_lock.release()


cache_backend = CacheBackend()
