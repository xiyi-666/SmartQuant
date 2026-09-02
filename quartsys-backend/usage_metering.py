# -*- coding: utf-8 -*-
"""Normalize LLM token usage and calculate model costs."""

from __future__ import annotations

import json
import math
import re
from collections.abc import Mapping
from typing import Any


_CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_TOKEN_KEYS = {
    "prompt_tokens",
    "completion_tokens",
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "cached_tokens",
    "promptTokenCount",
    "candidatesTokenCount",
    "cachedContentTokenCount",
}


def _mapping(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, Mapping):
        return dict(value)
    for method_name in ("model_dump", "dict", "to_dict"):
        method = getattr(value, method_name, None)
        if callable(method):
            try:
                result = method()
                if isinstance(result, Mapping):
                    return dict(result)
            except Exception:
                pass
    result: dict[str, Any] = {}
    for key in (
        "usage",
        "usage_metadata",
        "usageMetadata",
        "token_usage",
        "usage_metrics",
        "prompt_tokens",
        "completion_tokens",
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
        "prompt_tokens_details",
        "input_tokens_details",
    ):
        try:
            item = getattr(value, key)
        except Exception:
            continue
        if item is not None:
            result[key] = item
    return result


def _number(value: Any) -> int:
    try:
        return max(0, int(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        return str(value)


def estimate_tokens(value: Any) -> int:
    """Estimate tokens without requiring a tokenizer dependency."""
    text = _text(value).strip()
    if not text:
        return 0
    cjk_count = len(_CJK_RE.findall(text))
    non_cjk_count = max(0, len(text) - cjk_count)
    return max(1, cjk_count + math.ceil(non_cjk_count / 4))


def messages_text(messages: Any) -> str:
    if not isinstance(messages, (list, tuple)):
        return _text(messages)
    parts: list[str] = []
    for item in messages:
        if isinstance(item, Mapping):
            role = str(item.get("role") or "user")
            content = _text(item.get("content"))
            parts.append(f"{role}: {content}")
        else:
            parts.append(_text(item))
    return "\n".join(parts)


def _usage_payload(raw_usage: Any) -> dict[str, Any]:
    payload = _mapping(raw_usage)
    if not payload:
        return {}
    for key in ("usage", "usage_metadata", "usageMetadata", "token_usage", "usage_metrics"):
        nested = _mapping(payload.get(key))
        if nested:
            return nested
    return payload


def normalize_token_usage(
    raw_usage: Any = None,
    *,
    provider: str = "",
    input_text: Any = "",
    output_text: Any = "",
    allow_estimate: bool = True,
) -> dict[str, Any]:
    payload = _usage_payload(raw_usage)
    explicit = bool(payload and (_TOKEN_KEYS.intersection(payload.keys()) or payload.get("total_tokens")))

    prompt_details = _mapping(
        payload.get("prompt_tokens_details") or payload.get("input_tokens_details")
    )
    cache_read = _number(
        payload.get("cache_read_input_tokens")
        or payload.get("cache_read_tokens")
        or payload.get("cached_tokens")
        or payload.get("cachedContentTokenCount")
        or prompt_details.get("cached_tokens")
        or prompt_details.get("cache_read_tokens")
    )
    cache_write = _number(
        payload.get("cache_creation_input_tokens")
        or payload.get("cache_write_tokens")
        or payload.get("cache_creation_tokens")
    )
    if cache_write <= 0:
        cache_write = _number(payload.get("cache_creation_tokens_5m")) + _number(
            payload.get("cache_creation_tokens_1h")
        )

    raw_input = _number(
        payload.get("prompt_tokens")
        or payload.get("input_tokens")
        or payload.get("promptTokenCount")
    )
    output_tokens = _number(
        payload.get("completion_tokens")
        or payload.get("output_tokens")
        or payload.get("candidatesTokenCount")
    )

    normalized_provider = str(provider or "").strip().lower()
    if normalized_provider in {"anthropic", "claude"}:
        input_tokens = raw_input
    else:
        input_tokens = max(0, raw_input - cache_read - cache_write)

    used_estimate = False
    if allow_estimate and input_tokens <= 0 and input_text:
        input_tokens = estimate_tokens(input_text)
        used_estimate = True
    if allow_estimate and output_tokens <= 0 and output_text:
        output_tokens = estimate_tokens(output_text)
        used_estimate = True

    if explicit and used_estimate:
        source = "mixed"
    elif explicit:
        source = "upstream"
    elif allow_estimate:
        source = "estimated"
    else:
        source = "unreported"

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": cache_read,
        "cache_write_tokens": cache_write,
        "total_tokens": input_tokens + output_tokens + cache_read + cache_write,
        "source": source,
    }


def merge_token_usages(*items: Any) -> dict[str, Any]:
    total = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "total_tokens": 0,
        "source": "estimated",
    }
    sources: set[str] = set()
    for raw in items:
        item = raw if isinstance(raw, Mapping) else normalize_token_usage(raw)
        for key in (
            "input_tokens",
            "output_tokens",
            "cache_read_tokens",
            "cache_write_tokens",
        ):
            total[key] += _number(item.get(key))
        source = str(item.get("source") or "").strip()
        if source:
            sources.add(source)
    total["total_tokens"] = sum(
        total[key]
        for key in (
            "input_tokens",
            "output_tokens",
            "cache_read_tokens",
            "cache_write_tokens",
        )
    )
    if "mixed" in sources or len(sources) > 1:
        total["source"] = "mixed"
    elif sources:
        total["source"] = next(iter(sources))
    return total


def extract_token_usage(value: Any, *, provider: str = "") -> dict[str, Any]:
    """Aggregate usage metadata from CrewAI, LangChain, or provider responses."""
    seen: set[int] = set()

    def walk(item: Any) -> list[dict[str, Any]]:
        if item is None or isinstance(item, (str, bytes, int, float, bool)):
            return []
        item_id = id(item)
        if item_id in seen:
            return []
        seen.add(item_id)

        payload = _mapping(item)
        if payload:
            direct = _usage_payload(payload)
            if direct and (_TOKEN_KEYS.intersection(direct.keys()) or direct.get("total_tokens")):
                return [normalize_token_usage(direct, provider=provider)]
            values: list[dict[str, Any]] = []
            for child in payload.values():
                values.extend(walk(child))
            return values
        if isinstance(item, (list, tuple, set)):
            values = []
            for child in item:
                values.extend(walk(child))
            return values
        return []

    usages = walk(value)
    return merge_token_usages(*usages) if usages else normalize_token_usage(provider=provider)


def calculate_cost_micros(usage: Mapping[str, Any], pricing: Mapping[str, Any]) -> dict[str, int]:
    """Rates are USD per one million tokens; output is micro-USD."""
    components = {
        "input_cost_micros": int(
            round(_number(usage.get("input_tokens")) * float(pricing.get("input_per_million") or 0))
        ),
        "output_cost_micros": int(
            round(_number(usage.get("output_tokens")) * float(pricing.get("output_per_million") or 0))
        ),
        "cache_read_cost_micros": int(
            round(
                _number(usage.get("cache_read_tokens"))
                * float(pricing.get("cache_read_per_million") or 0)
            )
        ),
        "cache_write_cost_micros": int(
            round(
                _number(usage.get("cache_write_tokens"))
                * float(pricing.get("cache_write_per_million") or 0)
            )
        ),
    }
    components["total_cost_micros"] = sum(components.values())
    return components
