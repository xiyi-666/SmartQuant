# -*- coding: utf-8 -*-
"""战术观察 Crew：进攻/防御/中性三种市场信号分析"""
import json

import usage_metering


MARKET_TACTICAL_DEFAULTS = {
    "CN": {
        "label": "A股",
        "attack": ["科技成长", "高端制造", "消费复苏"],
        "defense": ["银行", "公用事业", "高股息"],
    },
    "HK": {
        "label": "港股",
        "attack": ["互联网平台", "创新药", "可选消费"],
        "defense": ["电信运营", "公用事业", "高股息央企"],
    },
    "US": {
        "label": "美股",
        "attack": ["半导体", "云计算软件", "工业自动化"],
        "defense": ["医疗保健", "公用事业", "必选消费"],
    },
}


def _market_defaults(market: str) -> dict:
    market_code = str(market or "CN").strip().upper()
    return MARKET_TACTICAL_DEFAULTS.get(market_code, MARKET_TACTICAL_DEFAULTS["CN"])


def build_tactical_advice_fallback(
    reason: str = "",
    position_ratio: float = 0.6,
    market: str = "CN",
) -> dict:
    """Return a display-safe tactical advice payload when CrewAI is unavailable."""
    defaults = _market_defaults(market)
    return {
        "position_ratio": position_ratio,
        "attack": defaults["attack"],
        "defense": defaults["defense"],
        "neutral": (
            f"{defaults['label']}当前先按市场宽度与板块强弱展示中性市场观察。"
            f"市场信号强度约 {position_ratio * 100:.0f}%，用于研究参考，不构成仓位建议。"
        ),
        "attack_reason": "偏进攻方向优先关注资金持续流入、趋势强于指数且成交额放大的板块。",
        "defense_reason": "偏防御方向优先关注低波动、高股息和现金流稳定的板块。",
        "analysis_source": "structured_market_context_fallback",
    }


def run_tactical_advice(
    llm,
    position_ratio: float = 0.6,
    market: str = "CN",
) -> dict:
    """执行战术分析，返回市场信号强度/attack/defense/neutral"""
    try:
        from crewai import Agent, Task, Crew

        defaults = _market_defaults(market)
        advisor = Agent(
            role="量化策略顾问",
            goal="基于当前市场状态给出进攻/防御/中性三种战术观察",
            backstory="资深量化策略师，擅长多情景战术规划",
            llm=llm,
            verbose=False,
        )

        task = Task(
            description=(
                f"当前研究市场为{defaults['label']}，市场信号强度 {position_ratio*100:.0f}%。"
                "请给出进攻/防御/中性三种战术观察方向，每种2-3个行业，并给出简短理由。"
                "不得输出买入、卖出、荐股、目标价或建议仓位等投资建议。"
                '返回JSON: {"position_ratio": <float 0-1>, "attack": ["行业1","行业2"], '
                '"defense": ["行业1","行业2"], "neutral": "中性评估摘要", '
                '"attack_reason": "...", "defense_reason": "..."}'
            ),
            expected_output="战术建议JSON",
            agent=advisor,
        )

        crew = Crew(agents=[advisor], tasks=[task], verbose=False)
        crew_result = crew.kickoff()

        raw = str(task.output.raw if hasattr(task, "output") else "")
        start, end = raw.find("{"), raw.rfind("}") + 1
        data = json.loads(raw[start:end]) if start >= 0 else {}
        usage = usage_metering.extract_token_usage(
            [crew_result, getattr(crew, "usage_metrics", None)]
        )
        if not usage.get("total_tokens"):
            usage = usage_metering.normalize_token_usage(
                input_text=task.description,
                output_text=raw,
            )
        return {
            "position_ratio": float(data.get("position_ratio", position_ratio)),
            "attack": data.get("attack", defaults["attack"]),
            "defense": data.get("defense", defaults["defense"]),
            "neutral": data.get("neutral", "市场处于均衡状态，当前仅展示研究观察。"),
            "attack_reason": data.get("attack_reason", ""),
            "defense_reason": data.get("defense_reason", ""),
            "_usage": usage,
            "_usage_input": task.description,
            "_usage_output": raw,
        }
    except Exception as e:
        return build_tactical_advice_fallback(str(e), position_ratio, market)
