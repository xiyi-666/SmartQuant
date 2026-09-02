# -*- coding: utf-8 -*-
"""LLM 工厂：根据数据库配置动态初始化 CrewAI LLM"""
import os

from sqlalchemy.orm import Session
from models import LLMConfig


def _first_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value:
            return value.strip()
    return None


def _decrypt_api_key(api_key: str | None) -> str | None:
    if api_key and api_key.startswith("fernet:"):
        try:
            from cryptography.fernet import Fernet

            fernet_key = os.getenv("FERNET_KEY", "").encode()
            if len(fernet_key) == 44:
                f = Fernet(fernet_key)
                return f.decrypt(api_key[7:].encode()).decode()
        except Exception:
            pass
    return api_key


def get_llm_config(
    db: Session,
    user_id: int | None = None,
    *,
    allow_shared_fallback: bool = True,
) -> dict:
    cfg = None
    if user_id is not None:
        cfg = db.query(LLMConfig).filter(LLMConfig.user_id == user_id).first()
    if cfg is None and allow_shared_fallback:
        query = db.query(LLMConfig)
        try:
            cfg = query.filter(LLMConfig.user_id.is_(None)).first()
        except AttributeError:
            cfg = query.first()
        if cfg is None:
            cfg = db.query(LLMConfig).first()
    fallback_api_key = _first_env(
        "LLM_API_KEY",
        "ASSISTANT_AI_API_KEY",
        "OPENAI_API_KEY",
        "VITE_ASSISTANT_AI_API_KEY",
        "VITE_OPENAI_API_KEY",
    )
    fallback_model = _first_env("LLM_MODEL", "ASSISTANT_AI_MODEL", "OPENAI_MODEL")
    fallback_base_url = _first_env(
        "LLM_BASE_URL",
        "ASSISTANT_AI_BASE_URL",
        "OPENAI_BASE_URL",
        "VITE_ASSISTANT_AI_BASE_URL",
        "VITE_OPENAI_BASE_URL",
    )
    if not cfg:
        return {
            "provider": "openai",
            "model": fallback_model or "gpt-5.5",
            "api_key": fallback_api_key if allow_shared_fallback else None,
            "base_url": fallback_base_url if allow_shared_fallback else None,
        }
    api_key = _decrypt_api_key(cfg.api_key)
    return {
        "provider": cfg.provider,
        "model": cfg.model or fallback_model or "gpt-5.5",
        "api_key": api_key or (fallback_api_key if allow_shared_fallback else None),
        "base_url": cfg.base_url or (fallback_base_url if allow_shared_fallback else None),
    }


def _with_provider_prefix(prefix: str, model: str) -> str:
    model = (model or "").strip()
    return model if model.startswith(f"{prefix}/") else f"{prefix}/{model}"


def build_crewai_llm(
    db: Session,
    model_override: str = None,
    user_id: int | None = None,
    *,
    allow_shared_fallback: bool = True,
    resolved_config: dict | None = None,
):
    """返回 CrewAI 可用的 LLM 实例"""
    cfg = resolved_config or get_llm_config(
        db, user_id=user_id, allow_shared_fallback=allow_shared_fallback
    )
    provider = cfg["provider"]
    model = model_override or cfg["model"]
    api_key = cfg["api_key"]
    base_url = cfg["base_url"]

    try:
        from crewai import LLM
    except Exception as exc:
        raise RuntimeError(
            "CrewAI 或其依赖不可用，请运行 "
            "pip install crewai==0.80.0 setuptools==80.9.0；"
            f"当前错误: {type(exc).__name__}: {exc}"
        ) from exc

    if provider == "openai":
        kwargs = {"model": _with_provider_prefix("openai", model), "api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url.rstrip("/")
        return LLM(**kwargs)
    elif provider == "anthropic":
        return LLM(model=_with_provider_prefix("anthropic", model), api_key=api_key)
    elif provider == "google":
        return LLM(model=_with_provider_prefix("gemini", model), api_key=api_key)
    elif provider == "custom":
        return LLM(
            model=_with_provider_prefix("openai", model),
            api_key=api_key,
            base_url=base_url.rstrip("/") if base_url else None,
        )
    else:
        raise ValueError(f"不支持的 provider: {provider}")
