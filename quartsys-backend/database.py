import os
from typing import Dict

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DEFAULT_DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'quart.db')}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)


def process_role() -> str:
    """Return the current process role before creating the SQLAlchemy engine."""
    explicit = str(os.getenv("QUARTSYS_PROCESS_ROLE") or "").strip().lower()
    if explicit in {"api", "worker", "scheduler", "maintenance", "cli"}:
        return explicit
    if str(os.getenv("QUARTSYS_CELERY_WORKER") or "").strip() == "1":
        return "worker"
    if str(os.getenv("QUARTSYS_ENABLE_SCHEDULER") or "").strip() == "1":
        return "scheduler"
    return "api"


def database_pool_settings(role: str | None = None) -> Dict[str, int]:
    """Resolve a conservative per-process pool without multiplying DB usage."""
    resolved_role = str(role or process_role()).strip().lower()
    defaults = {
        "api": (3, 2),
        "worker": (2, 1),
        "scheduler": (2, 1),
        "maintenance": (1, 1),
        "cli": (2, 1),
    }
    default_size, default_overflow = defaults.get(resolved_role, defaults["api"])
    env_prefix = {
        "api": "DB_API",
        "worker": "DB_WORKER",
        "scheduler": "DB_SCHEDULER",
        "maintenance": "DB_MAINTENANCE",
        "cli": "DB_CLI",
    }.get(resolved_role, "DB_API")
    pool_size = int(
        os.getenv(f"{env_prefix}_POOL_SIZE")
        or os.getenv("DB_POOL_SIZE")
        or default_size
    )
    max_overflow = int(
        os.getenv(f"{env_prefix}_MAX_OVERFLOW")
        or os.getenv("DB_MAX_OVERFLOW")
        or default_overflow
    )
    return {
        "pool_size": max(1, pool_size),
        "max_overflow": max(0, max_overflow),
        "pool_timeout": max(1, int(os.getenv("DB_POOL_TIMEOUT", "15"))),
        "pool_recycle": max(60, int(os.getenv("DB_POOL_RECYCLE", "1800"))),
    }

if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif DATABASE_URL.startswith(("postgresql", "postgres")):
    connect_args = {
        "connect_timeout": max(1, int(os.getenv("DB_CONNECT_TIMEOUT", "5"))),
        "application_name": f"quartsys-{process_role()}",
    }
else:
    connect_args = {}
engine_options = {
    "pool_pre_ping": True,
    "future": True,
    "connect_args": connect_args,
}
if not DATABASE_URL.startswith("sqlite"):
    engine_options.update(database_pool_settings())
engine = create_engine(
    DATABASE_URL,
    **engine_options,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

# 创建 Base 类，用于继承
Base = declarative_base()


# 获取数据库会话的依赖函数
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
