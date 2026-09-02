import os
import sys
import time
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from cache_backend import CacheBackend
from database import database_pool_settings, process_role
import queue_runtime

with patch.dict(
    os.environ,
    {
        "CELERY_BROKER_URL": "redis://127.0.0.1:16389/1",
        "CELERY_RESULT_BACKEND": "redis://127.0.0.1:16389/2",
    },
    clear=False,
):
    import celery_tasks

from models import AIInsightTask


class CacheBackendTests(unittest.TestCase):
    def make_backend(self, **env):
        values = {
            "REDIS_URL": "",
            "APP_ENV": "development",
            "CACHE_REQUIRE_REDIS": "0",
            "CACHE_ALLOW_MEMORY_FALLBACK": "1",
            "CACHE_MEMORY_MAX_ENTRIES": "100",
            "CACHE_TTL_JITTER_RATIO": "0",
            **env,
        }
        with patch.dict(os.environ, values, clear=False):
            return CacheBackend()

    def test_large_values_round_trip_through_compression(self):
        backend = self.make_backend(CACHE_COMPRESS_THRESHOLD_BYTES="4096")
        value = "market-data-" * 10000
        self.assertTrue(backend.set("large", value, ex=60))
        stored = backend.memory_cache["large"][1]
        self.assertTrue(stored.startswith("zlib:"))
        self.assertEqual(value, backend.get("large"))

    def test_memory_cache_is_bounded(self):
        backend = self.make_backend(CACHE_MEMORY_MAX_ENTRIES="100")
        for index in range(120):
            backend.set(f"key-{index}", str(index), ex=60)
        self.assertEqual(100, len(backend.memory_cache))
        self.assertIsNone(backend.get("key-0"))
        self.assertEqual("119", backend.get("key-119"))

    def test_production_can_disable_memory_fallback(self):
        backend = self.make_backend(
            APP_ENV="production",
            CACHE_REQUIRE_REDIS="1",
            CACHE_ALLOW_MEMORY_FALLBACK="0",
        )
        self.assertFalse(backend.set("key", "value", ex=60))
        self.assertIsNone(backend.get("key"))

    def test_lock_does_not_swallow_body_exceptions(self):
        backend = self.make_backend()

        with self.assertRaisesRegex(RuntimeError, "body failed"):
            with backend.lock("test-lock") as acquired:
                self.assertTrue(acquired)
                raise RuntimeError("body failed")


class QueueRuntimeTests(unittest.TestCase):
    def test_role_concurrency_limits(self):
        self.assertEqual(1, queue_runtime.user_concurrency_limit("normal"))
        self.assertEqual(3, queue_runtime.user_concurrency_limit("vip"))
        self.assertEqual(6, queue_runtime.user_concurrency_limit("svip"))
        self.assertEqual(4, queue_runtime.user_concurrency_limit("admin"))

    def test_waiting_time_ages_queue_priority(self):
        current = queue_runtime.queue_priority("normal")
        aged = queue_runtime.queue_priority("normal", time.time() - 60 * 30)
        self.assertGreater(aged, current)

    def test_default_queue_capacity_matches_single_host_plan(self):
        self.assertEqual(100, queue_runtime.QUEUE_MAX_PENDING)
        self.assertEqual(4, queue_runtime.QUEUE_GLOBAL_CONCURRENCY)

    def test_capacity_reduces_under_memory_or_load_pressure(self):
        self.assertEqual(
            2,
            queue_runtime.recommended_concurrency(900, 1.0, current_limit=4),
        )
        self.assertEqual(
            2,
            queue_runtime.recommended_concurrency(3000, 8.0, current_limit=4),
        )

    def test_capacity_recovers_with_hysteresis(self):
        self.assertEqual(
            2,
            queue_runtime.recommended_concurrency(1800, 3.0, current_limit=2),
        )
        self.assertEqual(
            4,
            queue_runtime.recommended_concurrency(2600, 2.0, current_limit=2),
        )

    def test_recovery_payload_validation_requires_task_contract(self):
        self.assertTrue(
            celery_tasks._queue_payload_is_valid(
                "quantsys.ai_insights",
                {"task_id": 1, "user_id": 2, "market": "CN"},
            )
        )
        self.assertTrue(
            celery_tasks._queue_payload_is_valid(
                "quantsys.screener",
                {"task_id": 3, "user_id": 2, "payload": {}},
            )
        )
        self.assertFalse(
            celery_tasks._queue_payload_is_valid(
                "quantsys.risk_assessment",
                {"task_id": 4},
            )
        )
        self.assertFalse(
            celery_tasks._queue_payload_is_valid("quantsys.unknown", {})
        )

    def test_recovery_refunds_only_charged_task_types(self):
        fake_main = types.ModuleType("main")
        smart_refund = unittest.mock.Mock(return_value=100)
        insight_refund = unittest.mock.Mock(return_value=50)
        risk_refund = unittest.mock.Mock(return_value=30)
        fake_main._refund_smart_research_task = smart_refund
        fake_main._refund_ai_insight_task = insight_refund
        fake_main._refund_risk_assessment_task = risk_refund

        with patch.dict(sys.modules, {"main": fake_main}):
            refunded = celery_tasks._refund_recovery_failures(
                [
                    ("smart_research", 10),
                    ("ai_insights", 11),
                    ("risk_assessment", 12),
                    ("screener", 13),
                ]
            )

        self.assertEqual(3, refunded)
        smart_refund.assert_called_once_with(10, "invalid_queue_payload")
        insight_refund.assert_called_once_with(11, "invalid_queue_payload")
        risk_refund.assert_called_once_with(12, "invalid_queue_payload")

    def test_fresh_database_heartbeat_blocks_duplicate_execution(self):
        row = SimpleNamespace(
            status="running",
            heartbeat_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            attempt_count=1,
        )
        query = unittest.mock.Mock()
        query.filter.return_value.with_for_update.return_value.first.return_value = row
        database = unittest.mock.Mock()
        database.query.return_value = query

        with patch.object(celery_tasks, "SessionLocal", return_value=database), patch.object(
            celery_tasks,
            "acquire_task_lease",
        ) as acquire_lease:
            result = celery_tasks._admit_model_task(
                SimpleNamespace(),
                AIInsightTask,
                42,
            )

        self.assertEqual(("wait", None, None), result)
        acquire_lease.assert_not_called()
        database.close.assert_called_once()


class DatabasePoolTests(unittest.TestCase):
    def test_process_role_prefers_explicit_role(self):
        with patch.dict(
            os.environ,
            {
                "QUARTSYS_PROCESS_ROLE": "scheduler",
                "QUARTSYS_CELERY_WORKER": "1",
            },
            clear=False,
        ):
            self.assertEqual("scheduler", process_role())

    def test_worker_pool_uses_role_specific_limits(self):
        with patch.dict(
            os.environ,
            {
                "DB_POOL_SIZE": "20",
                "DB_MAX_OVERFLOW": "30",
                "DB_WORKER_POOL_SIZE": "2",
                "DB_WORKER_MAX_OVERFLOW": "1",
            },
            clear=False,
        ):
            settings = database_pool_settings("worker")
        self.assertEqual(2, settings["pool_size"])
        self.assertEqual(1, settings["max_overflow"])


class QueueContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main_text = (BACKEND_ROOT / "main.py").read_text(encoding="utf-8")
        cls.model_text = (BACKEND_ROOT / "models.py").read_text(encoding="utf-8")

    def test_smart_research_submission_uses_durable_queue(self):
        self.assertIn("enqueue_smart_research", self.main_text)
        self.assertIn('"TASK_QUEUE_FULL"', self.main_text)
        self.assertIn('"/api/smart-research/queue/status"', self.main_text)

    def test_queue_managed_batch_does_not_create_nested_executor(self):
        self.assertIn("if queue_managed:", self.main_text)
        self.assertIn("for index, symbol in enumerate(symbols):", self.main_text)

    def test_task_model_persists_recovery_payload_and_billing(self):
        self.assertIn("queue_payload_json = Column(Text", self.model_text)
        self.assertIn("charged_credits = Column(Integer", self.model_text)
        self.assertIn("refunded_credits = Column(Integer", self.model_text)

    def test_readiness_checks_database_cache_and_queue(self):
        self.assertIn('"/api/health/ready"', self.main_text)
        self.assertIn('checks = {"database": False, "cache": False, "queue": True}', self.main_text)


if __name__ == "__main__":
    unittest.main()
