"""Durable Celery task entrypoints. Heavy application imports stay lazy."""

from __future__ import annotations

import os
import socket
import threading
from datetime import datetime, timedelta, timezone

os.environ.setdefault("QUARTSYS_PROCESS_ROLE", "worker")
os.environ.setdefault("QUARTSYS_CELERY_WORKER", "1")
os.environ.setdefault("QUARTSYS_ENABLE_SCHEDULER", "0")

from celery.exceptions import Retry, SoftTimeLimitExceeded
from celery.signals import worker_process_init

from celery_app import celery_app
from database import SessionLocal, engine
from models import AIInsightTask, RiskAssessmentTask, ScreenerTask, SmartResearchTask, User
from cache_backend import cache_backend
from queue_runtime import (
    QUEUE_TASK_LEASE_TTL_SECONDS,
    acquire_execution_slot,
    acquire_task_lease,
    enqueue_smart_research,
    enqueue_named_task,
    record_worker_heartbeat,
    refresh_execution_slot,
)

@worker_process_init.connect
def _start_worker_heartbeat(**kwargs) -> None:
    engine.dispose(close=False)
    cache_backend.reset_after_fork()
    worker_id = f"{socket.gethostname()}:{os.getpid()}"

    def heartbeat() -> None:
        while True:
            record_worker_heartbeat(worker_id)
            threading.Event().wait(15)

    threading.Thread(
        target=heartbeat,
        name=f"celery-heartbeat-{os.getpid()}",
        daemon=True,
    ).start()


def _mark_task(task_id: int, **values) -> None:
    db = SessionLocal()
    try:
        row = db.query(SmartResearchTask).filter(SmartResearchTask.id == task_id).first()
        if row:
            for key, value in values.items():
                setattr(row, key, value)
            db.commit()
    finally:
        db.close()


GENERIC_TASK_MAX_ATTEMPTS = max(1, int(os.getenv("QUEUE_TASK_MAX_ATTEMPTS", "3")))
ADMISSION_RETRY_LIMIT = max(100, int(os.getenv("QUEUE_ADMISSION_RETRY_LIMIT", "1000")))
ACTIVE_TASK_HEARTBEAT_SECONDS = max(
    90,
    int(
        os.getenv(
            "QUEUE_TASK_ACTIVE_HEARTBEAT_SECONDS",
            str(QUEUE_TASK_LEASE_TTL_SECONDS),
        )
    ),
)


def _mark_model_task(model, task_id: int, **values) -> None:
    db = SessionLocal()
    try:
        row = db.query(model).filter(model.id == int(task_id)).first()
        if row:
            for key, value in values.items():
                setattr(row, key, value)
            db.commit()
    finally:
        db.close()


def _load_model_task(model, task_id: int):
    db = SessionLocal()
    try:
        return db.query(model).filter(model.id == int(task_id)).first()
    finally:
        db.close()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _task_datetime_is_recent(value, seconds: int) -> bool:
    if not value:
        return False
    try:
        candidate = value
        if candidate.tzinfo is None:
            candidate = candidate.replace(tzinfo=timezone.utc)
        return (_utc_now() - candidate).total_seconds() < max(1, int(seconds))
    except Exception:
        return False


def _admit_model_task(task_self, model, task_id: int):
    """Return an execution slot, retrying only while waiting for capacity."""
    db = SessionLocal()
    lease = None
    slot = None
    try:
        row = db.query(model).filter(model.id == int(task_id)).with_for_update().first()
        if not row:
            return "missing", None, None
        current_status = str(getattr(row, "status", "") or "")
        if current_status in {"done", "cancelled"}:
            return "terminal", None, None
        if current_status == "failed":
            return "failed", None, None
        if current_status == "running" and _task_datetime_is_recent(
            getattr(row, "heartbeat_at", None) or getattr(row, "started_at", None),
            ACTIVE_TASK_HEARTBEAT_SECONDS,
        ):
            # The DB heartbeat remains the second line of duplicate-execution
            # protection if Redis briefly loses the renewable task lease.
            return "wait", None, None
        if int(getattr(row, "attempt_count", 0) or 0) >= GENERIC_TASK_MAX_ATTEMPTS:
            row.status = "failed"
            row.queue_status = "failed"
            row.failure_class = row.failure_class or "attempts_exhausted"
            row.finished_at = _utc_now()
            db.commit()
            return "failed", None, None
        lease = acquire_task_lease(f"{model.__tablename__}:{int(task_id)}")
        if lease is None:
            return "wait", None, None
        user = db.query(User).filter(User.id == row.user_id).first()
        role = getattr(user, "role", "normal") if user else "normal"
        slot = acquire_execution_slot(int(row.user_id), role, scope="heavy")
        if slot is None:
            lease.release()
            return "wait", None, None
        now = _utc_now()
        row.status = "running"
        row.queue_status = "running"
        row.attempt_count = int(getattr(row, "attempt_count", 0) or 0) + 1
        row.started_at = row.started_at or now
        row.heartbeat_at = now
        db.commit()
        return "run", slot, lease
    except Exception:
        if slot is not None:
            slot.release()
        if lease is not None:
            lease.release()
        raise
    finally:
        db.close()


def _start_model_heartbeat(model, task_id: int, slot, lease):
    stop = threading.Event()

    def heartbeat() -> None:
        while not stop.wait(30):
            try:
                refresh_execution_slot(slot)
                lease.refresh()
                _mark_model_task(model, task_id, heartbeat_at=_utc_now())
            except Exception as exc:
                # One transient Redis/DB failure must not permanently stop the
                # heartbeat thread while the task itself is still progressing.
                print(f"[queue-heartbeat] task={task_id} refresh failed: {exc}")

    thread = threading.Thread(
        target=heartbeat,
        name=f"queued-task-heartbeat-{task_id}",
        daemon=True,
    )
    thread.start()
    return stop, thread


def _model_attempt_count(model, task_id: int) -> int:
    row = _load_model_task(model, task_id)
    return int(getattr(row, "attempt_count", 0) or 0) if row else GENERIC_TASK_MAX_ATTEMPTS


def _retry_model_task(
    task_self,
    model,
    task_id: int,
    *,
    failure_class: str,
    countdown: int,
    exc: Exception | None = None,
):
    attempts = _model_attempt_count(model, task_id)
    if attempts < GENERIC_TASK_MAX_ATTEMPTS:
        _mark_model_task(
            model,
            task_id,
            status="pending",
            queue_status="retryable",
            failure_class=failure_class,
        )
        if exc is None:
            raise task_self.retry(countdown=countdown)
        raise task_self.retry(exc=exc, countdown=countdown)
    _mark_model_task(
        model,
        task_id,
        status="failed",
        queue_status="failed",
        failure_class=failure_class,
        finished_at=_utc_now(),
    )
    return {"status": "failed", "task_id": task_id, "failure_class": failure_class}


def _execute_queued_model_task(
    task_self,
    model,
    task_id: int,
    runner,
    *,
    refund=None,
):
    admission, slot, lease = _admit_model_task(task_self, model, task_id)
    if admission == "wait":
        raise task_self.retry(
            countdown=min(60, 10 + (int(task_self.request.retries or 0) * 5))
        )
    if admission != "run" or slot is None or lease is None:
        if admission == "failed" and refund is not None:
            row = _load_model_task(model, task_id)
            refund(str(getattr(row, "failure_class", "") or "terminal_failure"))
        return {"status": admission, "task_id": task_id}

    stop, thread = _start_model_heartbeat(model, task_id, slot, lease)
    try:
        result = runner() or {}
        status = str(result.get("status") or "done") if isinstance(result, dict) else "done"
        refund_required = bool(
            isinstance(result, dict) and result.get("refund_required")
        )
        failure_class = (
            str(result.get("failure_class") or "degraded_fallback")
            if isinstance(result, dict)
            else "degraded_fallback"
        )
        if refund_required:
            if refund is not None:
                refund(failure_class)
            _mark_model_task(
                model,
                task_id,
                queue_status="completed",
                failure_class=failure_class,
                heartbeat_at=_utc_now(),
                finished_at=_utc_now(),
            )
            return {"task_id": task_id, **result}
        system_failure = bool(
            isinstance(result, dict)
            and (result.get("system_failure") or status == "failed")
        )
        if system_failure:
            final = _retry_model_task(
                task_self,
                model,
                task_id,
                failure_class=str(result.get("failure_class") or "upstream_error"),
                countdown=min(120, 20 * (_model_attempt_count(model, task_id) + 1)),
            )
            if refund is not None:
                refund(str(final.get("failure_class") or "upstream_error"))
            return final
        _mark_model_task(
            model,
            task_id,
            queue_status="completed",
            failure_class=None,
            heartbeat_at=_utc_now(),
            finished_at=_utc_now(),
        )
        return {"task_id": task_id, **(result if isinstance(result, dict) else {})}
    except Retry:
        raise
    except SoftTimeLimitExceeded:
        final = _retry_model_task(
            task_self,
            model,
            task_id,
            failure_class="timeout",
            countdown=min(120, 30 * (_model_attempt_count(model, task_id) + 1)),
        )
        if refund is not None:
            refund("timeout")
        return final
    except Exception as exc:
        final = _retry_model_task(
            task_self,
            model,
            task_id,
            failure_class="worker_error",
            countdown=min(120, 20 * (_model_attempt_count(model, task_id) + 1)),
            exc=exc,
        )
        if refund is not None:
            refund("worker_error")
        return final
    finally:
        stop.set()
        thread.join(timeout=1)
        slot.release()
        lease.release()


@celery_app.task(
    bind=True,
    name="quantsys.smart_research",
    acks_late=True,
    reject_on_worker_lost=True,
    # Admission retries do not count as execution retries. Actual execution
    # attempts are persisted in SmartResearchTask.attempt_count and capped at 3.
    max_retries=1000,
)
def smart_research(self, task_id: int, **payload):
    """Run one user batch with global and per-user admission control."""
    admission, slot, lease = _admit_model_task(
        self,
        SmartResearchTask,
        int(task_id),
    )
    if admission == "wait":
        raise self.retry(countdown=min(60, 10 + (self.request.retries * 15)))
    if admission != "run" or slot is None or lease is None:
        if admission == "failed":
            from main import _refund_smart_research_task

            _refund_smart_research_task(int(task_id), "terminal_failure")
        return {"status": admission, "task_id": task_id}
    slot_stop = threading.Event()
    slot_thread = None

    def renew_slot() -> None:
        while not slot_stop.wait(30):
            try:
                refresh_execution_slot(slot)
                lease.refresh()
                _mark_task(int(task_id), heartbeat_at=datetime.now(timezone.utc))
            except Exception as exc:
                print(f"[research-heartbeat] task={task_id} refresh failed: {exc}")

    slot_thread = threading.Thread(
        target=renew_slot,
        name=f"research-slot-{task_id}",
        daemon=True,
    )
    slot_thread.start()

    try:
        from main import _run_smart_research_task

        result = _run_smart_research_task(
            int(task_id),
            int(payload["user_id"]),
            payload["symbols"],
            payload["analysis_date"],
            payload["analysts"],
            bool(payload["use_trading_agents"]),
            int(payload["max_debate_rounds"]),
            int(payload["max_risk_rounds"]),
            payload.get("model_override"),
            payload.get("language", "zh"),
            queue_managed=True,
        )
        check_db = SessionLocal()
        try:
            current = check_db.query(SmartResearchTask).filter(SmartResearchTask.id == int(task_id)).first()
            task_status = str(current.status if current else "failed")
            execution_attempts = int(current.attempt_count or 0) if current else 3
        finally:
            check_db.close()
        if (
            task_status == "failed"
            and isinstance(result, dict)
            and result.get("system_failure")
            and execution_attempts < 3
        ):
            _mark_task(
                int(task_id),
                status="pending",
                queue_status="retryable",
                failure_class="upstream_error",
            )
            raise self.retry(countdown=min(120, 20 * (self.request.retries + 1)))
        _mark_task(
            int(task_id),
            queue_status="completed" if task_status == "done" else "failed",
            finished_at=datetime.now(timezone.utc),
            failure_class=None if task_status == "done" else "upstream_retries_exhausted",
        )
        if task_status == "failed" and isinstance(result, dict) and result.get("system_failure"):
            from main import _refund_smart_research_task

            _refund_smart_research_task(int(task_id), "upstream_retries_exhausted")
        return {"status": task_status, "task_id": task_id, "result": result or {}}
    except Retry:
        raise
    except SoftTimeLimitExceeded:
        attempt_db = SessionLocal()
        try:
            attempt_row = attempt_db.query(SmartResearchTask).filter(SmartResearchTask.id == int(task_id)).first()
            execution_attempts = int(attempt_row.attempt_count or 0) if attempt_row else 3
        finally:
            attempt_db.close()
        if execution_attempts < 3:
            _mark_task(int(task_id), status="pending", queue_status="retryable", failure_class="timeout")
            raise self.retry(countdown=min(120, 30 * (self.request.retries + 1)))
        _mark_task(int(task_id), status="failed", queue_status="failed", failure_class="timeout")
        from main import _refund_smart_research_task

        _refund_smart_research_task(int(task_id), "timeout")
        return {"status": "failed", "task_id": task_id, "failure_class": "timeout"}
    except Exception as exc:
        attempt_db = SessionLocal()
        try:
            attempt_row = attempt_db.query(SmartResearchTask).filter(SmartResearchTask.id == int(task_id)).first()
            execution_attempts = int(attempt_row.attempt_count or 0) if attempt_row else 3
        finally:
            attempt_db.close()
        if execution_attempts < 3:
            _mark_task(
                int(task_id),
                status="pending",
                queue_status="retryable",
                failure_class="worker_error",
            )
            raise self.retry(
                exc=exc,
                countdown=min(120, 20 * (self.request.retries + 1)),
            )
        _mark_task(
            int(task_id),
            status="failed",
            queue_status="failed",
            failure_class="worker_retries_exhausted",
            finished_at=datetime.now(timezone.utc),
        )
        from main import _refund_smart_research_task

        _refund_smart_research_task(int(task_id), "worker_retries_exhausted")
        return {
            "status": "failed",
            "task_id": task_id,
            "failure_class": "worker_retries_exhausted",
        }
    finally:
        slot_stop.set()
        if slot_thread is not None:
            slot_thread.join(timeout=1)
        if slot is not None:
            slot.release()
        if lease is not None:
            lease.release()


@celery_app.task(name="quantsys.recover_tasks")
def recover_tasks():
    """Reset expired running tasks; scheduler invokes this periodically."""
    # The database watchdog is intentionally kept in a small task so it can run
    # independently of the API process.
    from datetime import datetime, timedelta, timezone

    db = SessionLocal()
    recovered = 0
    to_enqueue = []
    invalid_payload_refunds = []
    try:
        threshold = datetime.now(timezone.utc) - timedelta(minutes=30)
        rows = (
            db.query(SmartResearchTask)
            .filter(
                (
                    (SmartResearchTask.queue_status == "running")
                    & (
                        (SmartResearchTask.heartbeat_at < threshold)
                        | (
                            SmartResearchTask.heartbeat_at.is_(None)
                            & (SmartResearchTask.started_at < threshold)
                        )
                    )
                )
                | (
                    (SmartResearchTask.queue_status.in_(["queued", "retryable"]))
                    & SmartResearchTask.queue_task_id.is_(None)
                ),
            )
            .with_for_update()
            .all()
        )
        for row in rows:
            old_queue_task_id = row.queue_task_id
            if old_queue_task_id:
                try:
                    from celery_app import celery_app

                    celery_app.control.revoke(old_queue_task_id, terminate=False)
                except Exception:
                    pass
            row.status = "pending"
            row.queue_status = "queued"
            row.failure_class = "worker_lost"
            row.queue_task_id = None
            payload = None
            try:
                payload = __import__("json").loads(row.queue_payload_json or "")
            except Exception:
                payload = None
            if _queue_payload_is_valid("quantsys.smart_research", payload):
                to_enqueue.append(
                    (
                        row.id,
                        payload,
                        int(row.queue_priority or 10),
                    )
                )
            else:
                row.status = "failed"
                row.queue_status = "failed"
                row.failure_class = "invalid_queue_payload"
                row.error = "任务恢复数据损坏，无法重新执行"
                row.finished_at = _utc_now()
                invalid_payload_refunds.append(("smart_research", int(row.id)))
            recovered += 1
        db.commit()
    finally:
        db.close()
    refunded_tasks = _refund_recovery_failures(invalid_payload_refunds)
    enqueued = 0
    for task_id, payload, priority in to_enqueue:
        try:
            queue_task_id = enqueue_smart_research(
                payload,
                priority=max(0, min(9, priority // 5)),
            )
            _mark_task(task_id, queue_task_id=queue_task_id, queue_status="queued")
            enqueued += 1
        except Exception:
            _mark_task(task_id, queue_status="retryable", failure_class="requeue_failed")
    generic_recovered, generic_enqueued, generic_refunded = _recover_short_background_tasks()
    return {
        "recovered": recovered + generic_recovered,
        "enqueued": enqueued + generic_enqueued,
        "refunded_tasks": refunded_tasks + generic_refunded,
    }


def _queue_payload_is_valid(task_name: str, payload) -> bool:
    if not isinstance(payload, dict):
        return False
    required_keys = {
        "quantsys.smart_research": {
            "task_id",
            "user_id",
            "symbols",
            "analysis_date",
            "analysts",
            "use_trading_agents",
            "max_debate_rounds",
            "max_risk_rounds",
        },
        "quantsys.ai_insights": {"task_id", "user_id"},
        "quantsys.risk_assessment": {"task_id", "user_id"},
        "quantsys.screener": {"task_id", "user_id", "payload"},
    }.get(str(task_name), set())
    return bool(required_keys) and required_keys.issubset(payload)


def _refund_recovery_failures(items) -> int:
    """Refund terminal recovery failures after the recovery transaction closes."""
    if not items:
        return 0
    from main import (
        _refund_ai_insight_task,
        _refund_risk_assessment_task,
        _refund_smart_research_task,
    )

    refunders = {
        "smart_research": _refund_smart_research_task,
        "ai_insights": _refund_ai_insight_task,
        "risk_assessment": _refund_risk_assessment_task,
    }
    completed = 0
    for task_kind, task_id in items:
        refund = refunders.get(str(task_kind))
        if refund is None:
            continue
        try:
            refunded_amount = refund(int(task_id), "invalid_queue_payload")
            if int(refunded_amount or 0) > 0:
                completed += 1
        except Exception as exc:
            print(f"[task-recovery] refund failed kind={task_kind} task={task_id}: {exc}")
    return completed


def _recover_short_background_tasks() -> tuple[int, int, int]:
    """Requeue stale AI/risk/screener rows from their durable DB payloads."""
    task_specs = (
        (AIInsightTask, "quantsys.ai_insights", "long_tasks", "ai_insights"),
        (RiskAssessmentTask, "quantsys.risk_assessment", "long_tasks", "risk_assessment"),
        (ScreenerTask, "quantsys.screener", "long_tasks", None),
    )
    threshold = _utc_now() - timedelta(minutes=30)
    recovered = 0
    to_enqueue = []
    invalid_payload_refunds = []
    db = SessionLocal()
    try:
        for model, task_name, queue_name, refund_kind in task_specs:
            try:
                rows = (
                    db.query(model)
                    .filter(
                        (
                            (model.queue_status == "running")
                            & (
                                (model.heartbeat_at < threshold)
                                | (
                                    model.heartbeat_at.is_(None)
                                    & (model.started_at < threshold)
                                )
                            )
                        )
                        | (
                            (model.queue_status.in_(["queued", "retryable"]))
                            & model.queue_task_id.is_(None)
                        )
                    )
                    .with_for_update()
                    .all()
                )
            except Exception:
                db.rollback()
                continue
            for row in rows:
                old_queue_task_id = row.queue_task_id
                if old_queue_task_id:
                    try:
                        celery_app.control.revoke(old_queue_task_id, terminate=False)
                    except Exception:
                        pass
                row.status = "pending"
                row.queue_status = "queued"
                row.failure_class = "worker_lost"
                row.queue_task_id = None
                payload = None
                try:
                    payload = __import__("json").loads(row.queue_payload_json or "")
                except Exception:
                    payload = None
                if not _queue_payload_is_valid(task_name, payload):
                    row.status = "failed"
                    row.queue_status = "failed"
                    row.failure_class = "invalid_queue_payload"
                    row.error = "任务恢复数据损坏，无法重新执行"
                    row.finished_at = _utc_now()
                    if refund_kind:
                        invalid_payload_refunds.append((refund_kind, int(row.id)))
                    recovered += 1
                    continue
                to_enqueue.append(
                    (
                        row.id,
                        model,
                        task_name,
                        queue_name,
                        payload,
                        int(row.queue_priority or 10),
                    )
                )
                recovered += 1
        db.commit()
    finally:
        db.close()

    refunded_tasks = _refund_recovery_failures(invalid_payload_refunds)

    enqueued = 0
    for task_id, model, task_name, queue_name, payload, priority in to_enqueue:
        try:
            queue_task_id = enqueue_named_task(
                task_name,
                payload,
                queue=queue_name,
                priority=max(0, min(9, int(priority // 5))),
            )
            _mark_model_task(
                model,
                task_id,
                queue_task_id=queue_task_id,
                queue_status="queued",
            )
            enqueued += 1
        except Exception:
            _mark_model_task(
                model,
                task_id,
                queue_status="retryable",
                failure_class="requeue_failed",
            )
    return recovered, enqueued, refunded_tasks


@celery_app.task(
    bind=True,
    name="quantsys.ai_insights",
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=ADMISSION_RETRY_LIMIT,
)
def ai_insights(self, task_id: int, user_id: int, model_override=None, market="CN"):
    from main import _refund_ai_insight_task, _run_ai_insights_task

    return _execute_queued_model_task(
        self,
        AIInsightTask,
        task_id,
        lambda: _run_ai_insights_task(task_id, user_id, model_override, market),
        refund=lambda reason: _refund_ai_insight_task(task_id, reason),
    )


@celery_app.task(
    bind=True,
    name="quantsys.risk_assessment",
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=ADMISSION_RETRY_LIMIT,
)
def risk_assessment(self, task_id: int, user_id: int, **_payload):
    from main import _refund_risk_assessment_task, _run_risk_assessment_task

    return _execute_queued_model_task(
        self,
        RiskAssessmentTask,
        task_id,
        lambda: _run_risk_assessment_task(task_id, user_id),
        refund=lambda reason: _refund_risk_assessment_task(task_id, reason),
    )


@celery_app.task(
    bind=True,
    name="quantsys.screener",
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=ADMISSION_RETRY_LIMIT,
)
def screener(self, task_id: int, user_id: int, payload: dict):
    from main import _run_screener_task

    return _execute_queued_model_task(
        self,
        ScreenerTask,
        task_id,
        lambda: _run_screener_task(task_id, user_id, payload),
    )
