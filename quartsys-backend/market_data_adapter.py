"""Optional user-owned market-data adapter for the community edition.

The community repository does not bundle market-data collection or scheduled
update implementations. Set ``QUARTSYS_DATA_ADAPTER_MODULE`` to a Python module
available in the deployment environment when automatic refresh behavior is
required. The module may implement any of the functions delegated below.
"""

from __future__ import annotations

import importlib
import os
from datetime import date
from types import ModuleType
from typing import Any


class DataAdapterNotConfigured(RuntimeError):
    """Raised when an operation requires a user-supplied data adapter."""


GLOBAL_START_DATE = date(2000, 1, 1)
_provider: ModuleType | None = None
_provider_name = ""


def _load_provider() -> ModuleType | None:
    global _provider, _provider_name
    module_name = os.getenv("QUARTSYS_DATA_ADAPTER_MODULE", "").strip()
    if not module_name:
        _provider = None
        _provider_name = ""
        return None
    if module_name == __name__:
        raise DataAdapterNotConfigured("数据适配器不能指向 market_data_adapter 自身")
    if _provider is None or _provider_name != module_name:
        try:
            _provider = importlib.import_module(module_name)
        except Exception as exc:
            raise DataAdapterNotConfigured(
                f"无法加载用户数据适配器 {module_name!r}: {exc.__class__.__name__}"
            ) from exc
        _provider_name = module_name
    return _provider


def _delegate(name: str, *args: Any, default: Any = None, required: bool = False, **kwargs: Any) -> Any:
    provider = _load_provider()
    callback = getattr(provider, name, None) if provider else None
    if callable(callback):
        return callback(*args, **kwargs)
    if required:
        raise DataAdapterNotConfigured(
            "未配置市场数据更新实现；请设置 QUARTSYS_DATA_ADAPTER_MODULE 接入自己的 Provider"
        )
    return default


def update_single_stock(code: str, name: str = "") -> Any:
    return _delegate("update_single_stock", code, name, default=0)


def run_update(*args: Any, **kwargs: Any) -> Any:
    return _delegate("run_update", *args, required=True, **kwargs)


def backfill_missing_daily_fields(*args: Any, **kwargs: Any) -> Any:
    return _delegate("backfill_missing_daily_fields", *args, required=True, **kwargs)


def update_date_range(*args: Any, **kwargs: Any) -> Any:
    return _delegate("update_date_range", *args, required=True, **kwargs)


def update_by_date_range(*args: Any, **kwargs: Any) -> Any:
    return _delegate("update_by_date_range", *args, required=True, **kwargs)


def update_recent(*args: Any, **kwargs: Any) -> Any:
    return _delegate("update_recent", *args, required=True, **kwargs)


def refresh_stock_range(*args: Any, **kwargs: Any) -> Any:
    return _delegate("refresh_stock_range", *args, required=True, **kwargs)


def is_stock_marked_unavailable(stock: Any) -> bool:
    delegated = _delegate("is_stock_marked_unavailable", stock, default=None)
    if delegated is not None:
        return bool(delegated)
    status = str(getattr(stock, "data_status", "") or "").strip().lower()
    return status in {"no_rows", "error", "delisted", "skipped"}


def stock_unavailable_message(stock: Any) -> str:
    delegated = _delegate("stock_unavailable_message", stock, default=None)
    if delegated:
        return str(delegated)
    reason = str(getattr(stock, "data_status_reason", "") or "").strip()
    return reason or "当前部署没有该标的的数据，请导入数据或配置自己的 Provider"


def is_st_or_delisted(name: str) -> bool:
    delegated = _delegate("is_st_or_delisted", name, default=None)
    if delegated is not None:
        return bool(delegated)
    normalized = str(name or "").strip().upper()
    return normalized.startswith(("ST", "*ST")) or "退" in normalized


def mark_failed_code(code: str, reason: str = "") -> Any:
    return _delegate("mark_failed_code", code, reason, default=None)


def clear_failed_code(code: str) -> Any:
    return _delegate("clear_failed_code", code, default=None)


def handle_worker_update_request(payload: dict[str, Any]) -> dict[str, Any]:
    delegated = _delegate("handle_worker_update_request", payload, default=None)
    if isinstance(delegated, dict):
        return delegated
    return {
        "success": False,
        "message": "社区版未配置用户自有市场数据适配器",
    }
