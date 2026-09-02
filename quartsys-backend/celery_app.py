"""Celery application configuration for durable background work."""

from __future__ import annotations

import os

from celery import Celery


def _required_url(name: str, fallback_name: str = "REDIS_URL") -> str:
    value = str(os.getenv(name) or os.getenv(fallback_name) or "").strip()
    if not value:
        raise RuntimeError(
            f"{name} 未配置。生产环境需要配置 Redis Broker/Result Backend。"
        )
    return value


broker_url = _required_url("CELERY_BROKER_URL")
result_backend = str(os.getenv("CELERY_RESULT_BACKEND") or broker_url).strip()

celery_app = Celery(
    "quantsys",
    broker=broker_url,
    backend=result_backend,
    include=["celery_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    broker_transport_options={
        "visibility_timeout": int(os.getenv("CELERY_VISIBILITY_TIMEOUT", "14400")),
        "queue_order_strategy": "priority",
        "priority_steps": list(range(10)),
    },
    task_default_queue="default",
    task_default_exchange="quantsys",
    task_default_exchange_type="direct",
    task_routes={
        "quantsys.smart_research": {"queue": "research"},
        "quantsys.ai_insights": {"queue": "long_tasks"},
        "quantsys.risk_assessment": {"queue": "long_tasks"},
        "quantsys.screener": {"queue": "long_tasks"},
        "quantsys.recover_tasks": {"queue": "maintenance"},
    },
    # A batch can contain 15 symbols. Per-symbol upstream timeouts remain
    # bounded, while the batch gets enough time to process serially.
    task_time_limit=int(os.getenv("CELERY_TASK_TIME_LIMIT", "10800")),
    task_soft_time_limit=int(os.getenv("CELERY_TASK_SOFT_TIME_LIMIT", "10200")),
    result_expires=int(os.getenv("CELERY_RESULT_EXPIRES", "86400")),
)
