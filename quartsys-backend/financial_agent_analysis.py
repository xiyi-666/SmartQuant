# -*- coding: utf-8 -*-
"""Pure helpers for configurable multi-agent financial discussions."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Iterable


ALLOWED_STANCES = {"bullish", "bearish", "neutral", "mixed"}
ALLOWED_BLOCK_TYPES = {"markdown", "table", "chart", "image", "code", "callout", "metrics"}
ALLOWED_CHART_TYPES = {"line", "bar", "radar", "pie", "scatter"}


def default_financial_agent_profiles() -> list[dict]:
    return [
        {
            "name": "巴菲特价值分析师",
            "category": "value",
            "icon": "landmark",
            "color": "#b45309",
            "description": "从长期现金流、估值、安全边际和资本配置审视企业。",
            "system_prompt": (
                "你是一名遵循巴菲特价值投资框架的金融分析师。重点分析商业模式是否易懂、"
                "长期自由现金流、资本回报率、管理层资本配置、护城河、估值与安全边际。"
                "区分优秀公司与优秀价格，明确无法从现有数据验证的部分，禁止使用名人语气进行角色扮演。"
            ),
            "tools": ["database", "f10", "news", "web_search"],
            "skills": ["serenity"],
        },
        {
            "name": "芒格质量分析师",
            "category": "quality",
            "icon": "badge-check",
            "color": "#047857",
            "description": "关注护城河、管理层质量、会计质量和长期复利能力。",
            "system_prompt": (
                "你是一名质量投资分析师。使用多学科思维评估护城河、客户黏性、行业结构、"
                "管理层诚信、财务报表质量、再投资空间和永久性资本损失风险。主动寻找反证。"
            ),
            "tools": ["database", "f10", "news", "web_search"],
            "skills": ["serenity"],
        },
        {
            "name": "彼得林奇成长分析师",
            "category": "growth",
            "icon": "trending-up",
            "color": "#dc2626",
            "description": "分析成长来源、行业空间、业绩兑现和估值匹配度。",
            "system_prompt": (
                "你是一名成长股研究分析师。判断增长来自行业扩张、份额提升、产品周期还是一次性因素，"
                "重点核验收入利润增速、订单、产能、客户结构、估值与增长匹配度，并识别叙事过热风险。"
            ),
            "tools": ["database", "f10", "news", "web_search"],
            "skills": ["serenity"],
        },
        {
            "name": "技术趋势分析师",
            "category": "technical",
            "icon": "chart-candlestick",
            "color": "#2563eb",
            "description": "利用趋势、动量、成交量、波动率和关键价位分析交易结构。",
            "system_prompt": (
                "你是一名技术与市场微观结构分析师。只使用已提供的价格、成交量、波动率和资金数据，"
                "分析趋势、动量、支撑阻力、量价配合、拥挤度与失效条件，不把技术信号描述为确定预测。"
            ),
            "tools": ["database", "news"],
            "skills": [],
        },
        {
            "name": "宏观地缘分析师",
            "category": "macro",
            "icon": "globe-2",
            "color": "#7c3aed",
            "description": "评估利率、汇率、政策、地缘冲突和全球产业链传导。",
            "system_prompt": (
                "你是一名宏观与地缘政治分析师。分析利率、流动性、汇率、关税、制裁、战争与政策事件"
                "如何沿需求、成本、供应链、风险偏好和估值渠道影响目标。区分事实、情景和推演。"
            ),
            "tools": ["news", "web_search", "database"],
            "skills": ["serenity"],
        },
        {
            "name": "情绪新闻分析师",
            "category": "sentiment",
            "icon": "newspaper",
            "color": "#0891b2",
            "description": "聚合新闻、市场讨论和事件热度，识别情绪方向与叙事变化。",
            "system_prompt": (
                "你是一名新闻与市场情绪分析师。基于新闻时效、来源强度、叙事扩散、分歧程度和市场反应"
                "评估短期情绪。无讨论不等于中性，无数据必须明确标注，弱来源不得覆盖公告和监管信息。"
            ),
            "tools": ["news", "web_search", "database"],
            "skills": ["serenity"],
        },
        {
            "name": "组合风险官",
            "category": "risk",
            "icon": "shield-alert",
            "color": "#334155",
            "description": "从波动、回撤、流动性、事件尾部风险和仓位约束提出反对意见。",
            "system_prompt": (
                "你是投资委员会的独立风险官。优先寻找导致观点失效的证据，评估波动、回撤、流动性、"
                "估值压缩、财务质量、政策与事件尾部风险，并给出可观察的预警条件和仓位约束。"
            ),
            "tools": ["database", "f10", "news", "web_search"],
            "skills": ["serenity"],
        },
    ]


def json_loads_or(value: Any, fallback: Any) -> Any:
    if value is None or value == "":
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        parsed = json.loads(str(value))
        return fallback if parsed is None else parsed
    except Exception:
        return fallback


def normalize_tool_keys(value: Any) -> list[str]:
    allowed = {"database", "f10", "news", "web_search"}
    raw = value if isinstance(value, list) else []
    result: list[str] = []
    for item in raw:
        key = str(item or "").strip().lower()
        if key in allowed and key not in result:
            result.append(key)
    return result


def normalize_skill_keys(value: Any) -> list[str]:
    raw = value if isinstance(value, list) else []
    result: list[str] = []
    for item in raw:
        key = re.sub(r"[^a-z0-9_\-]+", "_", str(item or "").strip().lower()).strip("_-")[:64]
        if key and key not in result:
            result.append(key)
    return result[:12]


def normalize_mcp_servers(value: Any) -> list[dict]:
    raw = value if isinstance(value, list) else []
    result: list[dict] = []
    for item in raw[:8]:
        if not isinstance(item, dict):
            continue
        endpoint = str(item.get("endpoint") or "").strip()[:1000]
        tool = str(item.get("tool") or item.get("tool_name") or "").strip()[:120]
        if not endpoint or not tool:
            continue
        result.append(
            {
                "name": str(item.get("name") or "MCP").strip()[:80],
                "endpoint": endpoint,
                "tool": tool,
                "enabled": bool(item.get("enabled", True)),
                "arguments": item.get("arguments") if isinstance(item.get("arguments"), dict) else {},
            }
        )
    return result


def _extract_json_object(raw: str) -> dict | None:
    text = str(raw or "").strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    if fence:
        try:
            parsed = json.loads(fence.group(1).strip())
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None
    return None


def normalize_rich_blocks(value: Any, fallback_markdown: str = "") -> list[dict]:
    raw = value if isinstance(value, list) else []
    blocks: list[dict] = []
    for item in raw[:24]:
        if not isinstance(item, dict):
            continue
        block_type = str(item.get("type") or "").strip().lower()
        if block_type not in ALLOWED_BLOCK_TYPES:
            continue
        if block_type == "markdown":
            content = str(item.get("content") or item.get("text") or "").strip()
            if content:
                blocks.append({"type": "markdown", "content": content[:30000]})
        elif block_type == "table":
            columns = [str(cell)[:120] for cell in (item.get("columns") or [])][:12]
            rows = []
            for row in (item.get("rows") or [])[:80]:
                if isinstance(row, list):
                    rows.append([str(cell)[:1000] for cell in row[: len(columns)]])
            if columns and rows:
                blocks.append({"type": "table", "columns": columns, "rows": rows})
        elif block_type == "chart":
            chart_type = str(item.get("chart_type") or item.get("chartType") or "bar").lower()
            if chart_type not in ALLOWED_CHART_TYPES:
                chart_type = "bar"
            categories = [str(cell)[:80] for cell in (item.get("categories") or [])][:120]
            series = []
            for row in (item.get("series") or [])[:12]:
                if not isinstance(row, dict):
                    continue
                data = []
                for cell in (row.get("data") or [])[:120]:
                    try:
                        data.append(float(cell))
                    except (TypeError, ValueError):
                        data.append(None)
                series.append({"name": str(row.get("name") or "数据")[:80], "data": data})
            if series:
                blocks.append(
                    {
                        "type": "chart",
                        "chart_type": chart_type,
                        "title": str(item.get("title") or "")[:160],
                        "categories": categories,
                        "series": series,
                    }
                )
        elif block_type == "image":
            url = str(item.get("url") or "").strip()[:1500]
            if url.startswith(("https://", "http://", "data:image/")):
                blocks.append(
                    {
                        "type": "image",
                        "url": url,
                        "alt": str(item.get("alt") or "研究图片")[:200],
                        "caption": str(item.get("caption") or "")[:500],
                    }
                )
        elif block_type == "code":
            content = str(item.get("content") or "").strip()
            if content:
                blocks.append(
                    {
                        "type": "code",
                        "language": re.sub(r"[^a-z0-9_+\-]+", "", str(item.get("language") or "text").lower())[:32],
                        "content": content[:30000],
                    }
                )
        elif block_type == "callout":
            content = str(item.get("content") or item.get("text") or "").strip()
            if content:
                tone = str(item.get("tone") or "info").lower()
                blocks.append({"type": "callout", "tone": tone[:24], "content": content[:4000]})
        elif block_type == "metrics":
            metrics = []
            for metric in (item.get("items") or [])[:12]:
                if isinstance(metric, dict) and metric.get("label") is not None:
                    metrics.append(
                        {
                            "label": str(metric.get("label"))[:100],
                            "value": str(metric.get("value") or "--")[:100],
                            "trend": str(metric.get("trend") or "neutral")[:24],
                        }
                    )
            if metrics:
                blocks.append({"type": "metrics", "items": metrics})
    if not blocks and fallback_markdown.strip():
        blocks.append({"type": "markdown", "content": fallback_markdown.strip()[:30000]})
    return blocks


def parse_agent_response(raw: str) -> dict:
    payload = _extract_json_object(raw) or {}
    markdown = str(
        payload.get("markdown")
        or payload.get("analysis")
        or payload.get("content")
        or (raw if not payload else "")
        or ""
    ).strip()
    stance = str(payload.get("stance") or "neutral").strip().lower()
    if stance not in ALLOWED_STANCES:
        stance = "neutral"
    try:
        confidence = max(0, min(100, int(float(payload.get("confidence", 50)))))
    except (TypeError, ValueError):
        confidence = 50
    evidence = []
    for item in (payload.get("evidence") or [])[:12]:
        if isinstance(item, dict):
            evidence.append(
                {
                    "title": str(item.get("title") or "证据")[:240],
                    "source": str(item.get("source") or "")[:160],
                    "url": str(item.get("url") or "")[:1000],
                }
            )
    return {
        "markdown": markdown,
        "stance": stance,
        "confidence": confidence,
        "evidence": evidence,
        "blocks": normalize_rich_blocks(payload.get("blocks"), markdown),
    }


def build_agent_prompts(
    profile: dict,
    subject: str,
    research_context: dict,
    transcript: list[dict],
    skill_text: str = "",
    mcp_context: list[dict] | None = None,
) -> tuple[str, str]:
    history = [
        {
            "sender": item.get("sender_name"),
            "type": item.get("sender_type"),
            "round": item.get("round_no"),
            "content": str(item.get("content_markdown") or "")[:5000],
        }
        for item in transcript[-30:]
    ]
    system_prompt = (
        f"{profile.get('system_prompt') or ''}\n\n"
        "你正在参加一个多分析师投资委员会。必须回应其他分析师和用户已经提出的关键观点，"
        "明确支持、反对或需要核验之处。只能使用提供的数据和证据，禁止虚构财务数据、新闻、图片或链接。"
        "输出一个 JSON 对象，字段为 markdown、stance、confidence、evidence、blocks。"
        "stance 只能是 bullish、bearish、neutral、mixed；confidence 为 0-100。"
        "blocks 支持 markdown、table、chart、image、code、callout、metrics。"
        "图表只能使用上下文中的数值；没有可靠图片 URL 时不要输出 image。"
        "markdown 应包含：核心判断、证据、对其他观点的回应、风险与失效条件。"
    )
    if skill_text:
        system_prompt += f"\n\n# 挂载 Skill\n{skill_text[:24000]}"
    user_prompt = (
        f"# 讨论主题\n{subject}\n\n"
        f"# 数据与工具上下文\n{json.dumps(research_context, ensure_ascii=False, default=str)[:42000]}\n\n"
        f"# MCP 工具结果\n{json.dumps(mcp_context or [], ensure_ascii=False, default=str)[:12000]}\n\n"
        f"# 当前讨论记录\n{json.dumps(history, ensure_ascii=False, default=str)[:30000]}"
    )
    return system_prompt, user_prompt


def build_local_agent_response(profile: dict, context: dict, reason: str = "") -> dict:
    targets = context.get("targets") or []
    target = targets[0] if targets else {}
    latest = target.get("latest") or {}
    recent = target.get("recent_stats") or {}
    category = str(profile.get("category") or "general")
    name = str(profile.get("name") or "分析师")
    lines = [f"### {name}", ""]
    stance = "neutral"
    confidence = 45
    if target:
        price_display = latest.get("price_display")
        if not price_display:
            symbol = str(target.get("currency_symbol") or "")
            price_display = f"{symbol}{latest.get('close', '--')}"
        change_value = latest.get("change_pct")
        change_display = (
            f"{float(change_value):+.2f}%"
            if isinstance(change_value, (int, float))
            else "--"
        )
        lines.append(
            f"目标为 **{target.get('code', '')} {target.get('name', '')}**，"
            f"最新价 {price_display}，当日涨跌幅 {change_display}。"
        )
    if category in {"value", "quality"}:
        lines.extend(
            [
                f"当前数据库估值字段：PE {target.get('pe_ratio', '--')}、PB {target.get('pb_ratio', '--')}、ROE {target.get('roe', '--')}%。",
                "现有字段不足以直接确认自由现金流、负债结构和管理层资本配置，结论应保持审慎。",
            ]
        )
    elif category == "growth":
        concepts = "、".join(
            str(item.get("name") if isinstance(item, dict) else item)
            for item in (target.get("concepts") or [])[:6]
            if (item.get("name") if isinstance(item, dict) else item)
        ) or "暂无"
        lines.extend([f"行业/概念线索：{target.get('industry') or '--'}；{concepts}。", "需要用业绩和订单验证成长叙事是否兑现。"])
    elif category == "technical":
        change20 = recent.get("change_20d_pct")
        change60 = recent.get("change_60d_pct")
        lines.append(f"20日涨跌幅 {change20 if change20 is not None else '--'}%，60日涨跌幅 {change60 if change60 is not None else '--'}%。")
        if isinstance(change20, (int, float)):
            stance = "bullish" if change20 > 5 else "bearish" if change20 < -5 else "neutral"
            confidence = 58
        lines.append(f"20日波动率 {recent.get('daily_volatility_20d_pct', '--')}%，技术观点必须设置失效价位。")
    elif category == "macro":
        headlines = [str(item.get("title") or "") for item in (context.get("news") or {}).get("items", [])[:5]]
        lines.append("最新新闻线索：" + ("；".join(headlines) if headlines else "当前新闻源未返回足够内容。"))
    elif category == "sentiment":
        news_count = len((context.get("news") or {}).get("items") or [])
        web_count = len((context.get("web_search") or {}).get("items") or [])
        lines.append(f"本轮可用新闻 {news_count} 条、联网搜索 {web_count} 条。无样本不代表情绪中性。")
    elif category == "risk":
        lines.extend(
            [
                f"20日波动率 {recent.get('daily_volatility_20d_pct', '--')}%，60日区间 {recent.get('low_60d', '--')} - {recent.get('high_60d', '--')}。",
                "建议把仓位、止损、流动性和事件风险作为决策前置条件。",
            ]
        )
        stance = "mixed"
        confidence = 55
    else:
        lines.append("当前采用系统数据库和新闻工具形成基础判断，仍需结合更多证据交叉验证。")
    if reason:
        lines.extend(["", f"> 外部模型本轮未完成，已使用本地证据摘要：{reason[:300]}"])
    markdown = "\n\n".join(line for line in lines if line is not None)
    return {
        "markdown": markdown,
        "stance": stance,
        "confidence": confidence,
        "evidence": [],
        "blocks": normalize_rich_blocks([], markdown),
    }


def build_moderator_prompts(subject: str, context: dict, transcript: list[dict]) -> tuple[str, str]:
    system = (
        "你是投资委员会主持人。综合所有分析师和用户观点，区分事实、推断和分歧，不以多数票代替证据。"
        "只返回 JSON 对象，字段：markdown、stance、confidence、decision、risk_level、key_points、"
        "disagreements、watch_items、blocks。stance 只能是 bullish、bearish、neutral、mixed。"
        "markdown 必须包含结论、主要证据、关键分歧、风险、触发条件与下一步核验。"
        "不得承诺收益，不得虚构上下文中不存在的数据或链接。"
    )
    compact_messages = [
        {
            "sender": item.get("sender_name"),
            "type": item.get("sender_type"),
            "round": item.get("round_no"),
            "stance": (item.get("meta") or {}).get("stance"),
            "confidence": (item.get("meta") or {}).get("confidence"),
            "content": str(item.get("content_markdown") or "")[:6000],
        }
        for item in transcript[-60:]
    ]
    user = (
        f"# 主题\n{subject}\n\n"
        f"# 核心数据\n{json.dumps(context, ensure_ascii=False, default=str)[:36000]}\n\n"
        f"# 委员会记录\n{json.dumps(compact_messages, ensure_ascii=False, default=str)[:50000]}"
    )
    return system, user


def parse_moderator_response(raw: str, transcript: list[dict]) -> dict:
    payload = _extract_json_object(raw) or {}
    if not payload:
        return build_local_final_result(transcript, str(raw or ""))
    stance = str(payload.get("stance") or "neutral").lower()
    if stance not in ALLOWED_STANCES:
        stance = "neutral"
    try:
        confidence = max(0, min(100, int(float(payload.get("confidence", 50)))))
    except (TypeError, ValueError):
        confidence = 50
    markdown = str(payload.get("markdown") or payload.get("content") or "").strip()
    return {
        "markdown": markdown,
        "stance": stance,
        "confidence": confidence,
        "decision": str(payload.get("decision") or "继续观察")[:200],
        "risk_level": str(payload.get("risk_level") or "中")[:40],
        "key_points": [str(item)[:500] for item in (payload.get("key_points") or [])[:12]],
        "disagreements": [str(item)[:500] for item in (payload.get("disagreements") or [])[:12]],
        "watch_items": [str(item)[:500] for item in (payload.get("watch_items") or [])[:12]],
        "blocks": normalize_rich_blocks(payload.get("blocks"), markdown),
    }


def build_local_final_result(transcript: list[dict], reason: str = "") -> dict:
    votes = {"bullish": 0, "bearish": 0, "neutral": 0, "mixed": 0}
    confidences: list[int] = []
    for item in transcript:
        if item.get("sender_type") != "agent":
            continue
        meta = item.get("meta") or {}
        stance = str(meta.get("stance") or "neutral")
        votes[stance if stance in votes else "neutral"] += 1
        try:
            confidences.append(int(meta.get("confidence") or 50))
        except (TypeError, ValueError):
            pass
    top = sorted(votes.items(), key=lambda item: item[1], reverse=True)
    stance = top[0][0] if top and top[0][1] > 0 else "neutral"
    if len(top) > 1 and top[0][1] == top[1][1]:
        stance = "mixed"
    confidence = round(sum(confidences) / len(confidences)) if confidences else 45
    stance_label = {"bullish": "偏多", "bearish": "偏空", "neutral": "中性", "mixed": "分歧"}[stance]
    markdown = (
        "## 委员会结论\n\n"
        f"综合观点为 **{stance_label}**，平均置信度 **{confidence}/100**。"
        "该结论反映当前可用证据，不构成收益承诺。\n\n"
        "### 关键分歧\n\n"
        f"看多 {votes['bullish']}、看空 {votes['bearish']}、中性 {votes['neutral']}、分歧 {votes['mixed']}。\n\n"
        "### 下一步\n\n"
        "核验最新公告、业绩数据、关键价格区间和重大事件进展，再决定是否调整仓位。"
    )
    if reason:
        markdown += f"\n\n> 主持模型未完成，使用本地投票汇总：{reason[:300]}"
    return {
        "markdown": markdown,
        "stance": stance,
        "confidence": confidence,
        "decision": "继续观察并核验证据",
        "risk_level": "中",
        "key_points": [],
        "disagreements": [f"多空票数：{json.dumps(votes, ensure_ascii=False)}"],
        "watch_items": ["公告与业绩", "关键价位", "行业与政策事件"],
        "blocks": normalize_rich_blocks([], markdown),
    }


def confidence_chart_block(messages: Iterable[dict]) -> dict | None:
    categories: list[str] = []
    values: list[float] = []
    for item in messages:
        if item.get("sender_type") != "agent":
            continue
        meta = item.get("meta") or {}
        try:
            value = float(meta.get("confidence"))
        except (TypeError, ValueError):
            continue
        categories.append(str(item.get("sender_name") or "Agent")[:30])
        values.append(value)
    if not values:
        return None
    return {
        "type": "chart",
        "chart_type": "bar",
        "title": "分析师置信度",
        "categories": categories,
        "series": [{"name": "置信度", "data": values}],
    }


def build_markdown_report(session: dict, messages: list[dict], result: dict) -> str:
    parts = [
        "# Agent 分析委员会报告",
        "",
        f"- 主题：{session.get('subject') or ''}",
        f"- 类型：{session.get('subject_type') or ''}",
        f"- 股票代码：{session.get('symbol') or '--'}",
        f"- 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## 讨论记录",
        "",
    ]
    for item in messages:
        sender = item.get("sender_name") or item.get("sender_type") or "未知"
        round_no = item.get("round_no") or 0
        parts.extend(
            [
                f"### 第 {round_no} 轮 · {sender}" if round_no else f"### {sender}",
                "",
                str(item.get("content_markdown") or "").strip(),
                "",
            ]
        )
    parts.extend(["## 最终结论", "", str(result.get("markdown") or "").strip(), ""])
    return "\n".join(parts).strip() + "\n"
