"""Run the application's idempotent schema/bootstrap migrations once.

Production API, Celery and scheduler processes disable startup migrations so
that multiple workers do not compete for DDL locks or repeat full-table work.
"""

from __future__ import annotations

import os

os.environ["QUARTSYS_PROCESS_ROLE"] = "maintenance"
os.environ["QUARTSYS_ENABLE_SCHEDULER"] = "0"
os.environ["QUARTSYS_RUN_STARTUP_MIGRATIONS"] = "1"

import main  # noqa: E402,F401

print("QuartSys database migrations completed.")
