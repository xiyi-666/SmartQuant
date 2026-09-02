# -*- coding: utf-8 -*-
"""AI洞察动态分析 Crew：5维度市场分析"""
import json
import re


AI_INSIGHT_DIMENSIONS = ["趋势", "动量", "估值", "情绪", "风险"]

FALLBACK_SUMMARIES = {
    "趋势": "LLM 鉴权或网络异常，暂未生成趋势研判；请先检查模型配置后重新触发。",
    "动量": "LLM 鉴权或网络异常，暂未生成动量研判；当前分数为中性占位。",
    "估值": "LLM 鉴权或网络异常，暂未生成估值研判；当前分数为中性占位。",
    "情绪": "LLM 鉴权或网络异常，暂未生成情绪研判；当前分数为中性占位。",
    "风险": "LLM 鉴权或网络异常，暂未生成风险研判；请检查 API Key 与 Base URL 是否匹配。",
}


def _sanitize_error_message(err: Exception) -> str:
    message = str(err)
    message = re.sub(r"sk-[A-Za-z0-9_\-\*]{6,}", "sk-****", message)
    return message[:240]


def _friendly_error_summary(message: str) -> str:
    lower = message.lower()
    if any(
        marker in lower
        for marker in (
            "ssleoferror",
            "ssl",
            "tls",
            "httpsconnectionpool",
            "max retries exceeded",
            "read timed out",
            "timeout",
            "connection reset",
        )
    ):
        return (
            "分析失败：模型服务连接失败。当前 Base URL 在 HTTPS/TLS 连接或响应阶段中断，"
            "请检查设置中心「AI配置」中的服务地址是否为 OpenAI 兼容 /v1 地址，"
            f"API Key 与模型 gpt-5.5 是否匹配。错误信息：{message}"
        )
    if any(
        marker in lower
        for marker in (
            "authentication",
            "incorrect api key",
            "invalid api key",
            "unauthorized",
            "401",
            "403",
            "鉴权",
            "api key",
        )
    ):
        return (
            "分析失败：模型鉴权失败。请检查设置中心「AI配置」中的 API Key、"
            f"Base URL 与模型名称是否匹配。错误信息：{message}"
        )
    return (
        "分析失败：LLM 模型端点配置异常。请检查设置中心「AI配置」中的 API Key、"
        f"Base URL 与模型名称是否匹配。错误信息：{message}"
    )


def build_ai_insights_error_result(err: Exception) -> dict:
    dimensions = {d: 50 for d in AI_INSIGHT_DIMENSIONS}
    message = _sanitize_error_message(err)
    return {
        "status": "failed",
        "dimensions": dimensions,
        "summary": _friendly_error_summary(message),
        "analysis_list": [
            {"dimension": d, "score": dimensions[d], "summary": FALLBACK_SUMMARIES[d]}
            for d in AI_INSIGHT_DIMENSIONS
        ],
    }


def run_ai_insights(llm) -> dict:
    """执行5维度AI洞察分析，返回 dimensions/summary/analysis_list"""
    try:
        from crewai import Agent, Task, Crew

        dimensions = AI_INSIGHT_DIMENSIONS

        agents = [
            Agent(role=f"{d}分析师", goal=f"分析市场{d}维度", backstory=f"专注{d}分析的量化研究员", llm=llm, verbose=False)
            for d in dimensions
        ]

        tasks = [
            Task(
                description=f"对当前A股市场{d}维度进行简短分析，给出0-100评分和1-2句摘要。返回JSON: {{\"score\": <int>, \"summary\": \"<str>\"}}",
                expected_output=f"{d}维度JSON评分",
                agent=agents[i],
            )
            for i, d in enumerate(dimensions)
        ]

        crew = Crew(agents=agents, tasks=tasks, verbose=False)
        results = crew.kickoff()

        dim_scores = {}
        analysis_list = []
        for i, d in enumerate(dimensions):
            raw = str(tasks[i].output.raw if hasattr(tasks[i], "output") else "")
            try:
                start = raw.find("{")
                end = raw.rfind("}") + 1
                data = json.loads(raw[start:end]) if start >= 0 else {}
                score = int(data.get("score", 50))
                summary = str(data.get("summary", raw[:100]))
            except Exception:
                score = 50
                summary = raw[:100]
            dim_scores[d] = score
            analysis_list.append({"dimension": d, "score": score, "summary": summary})

        overall = sum(dim_scores.values()) // len(dim_scores)
        return {
            "status": "done",
            "dimensions": dim_scores,
            "summary": f"综合评分 {overall}/100，市场整体{'偏强' if overall >= 60 else '偏弱'}",
            "analysis_list": analysis_list,
        }
    except Exception as e:
        return build_ai_insights_error_result(e)
