## Context

当前系统后端 FastAPI 已实现模拟交易、选股、自选股等核心 API，但前端大量页面仍为静态 HTML 原型（TradingPage、QuotePage、AiInsightsPage、BacktestingPage、RiskPage）。AI 洞察、回测、风险监控三个模块后端完全缺失。

## Goals / Non-Goals

**Goals:**
- 将所有静态 HTML 原型页面替换为真实数据驱动的 React TSX 组件
- 基于 CrewAI 实现三个智能分析工作流（AI洞察、回测、风险监控）
- 支持可配置 LLM 提供商（GPT/Claude/Gemini + 自定义 OpenAI Compatible）

**Non-Goals:**
- 不实现实时 WebSocket 行情推送
- 不实现真实券商交易接口对接
- 不实现用户权限分级系统

## Decisions

### 1. CrewAI 架构：每个功能模块独立 Crew

**决策**：AI洞察、回测、风险监控各自一个独立 Crew，不共享。

**理由**：各模块职责差异大，独立 Crew 便于单独调试和扩展；避免单一 Crew 过于复杂。

**替代方案**：统一调度 Crew → 复杂度高，Agent 间上下文污染风险大，放弃。

### 2. CrewAI 任务执行：异步后台任务

**决策**：CrewAI Crew 通过 FastAPI BackgroundTasks 异步执行，结果存入数据库，前端轮询查询。

**理由**：LLM 调用耗时长（10-60秒），同步接口会超时；轮询方案简单可靠，无需引入 WebSocket。

**替代方案**：SSE 流式输出 → 实现复杂，CrewAI 流式支持不稳定，放弃。

### 3. LLM 配置：数据库存储 + 运行时切换

**决策**：LLM 配置（provider/model/api_key/base_url）存入数据库 `llm_config` 表，每次 Crew 执行时动态读取。

**理由**：用户可在 SettingsPage 随时切换 LLM，无需重启服务。

### 4. 前端页面重写策略：保留 HTML 原型作为视觉参考

**决策**：以现有 HTML 原型的 UI 布局为参考，用 React TSX + ECharts 重新实现，不直接复用原型代码。

**理由**：原型为纯静态 HTML，无法与 React 状态管理集成；重写可确保代码质量和一致性。

## Risks / Trade-offs

- **CrewAI 依赖版本**：CrewAI 迭代快，API 变化频繁 → 锁定具体版本号，定期评估升级
- **LLM 费用**：AI洞察/回测频繁调用会产生较高 API 费用 → 增加调用频率限制和缓存机制
- **回测准确性**：PE/PB/ROE 为估算值，回测结果仅供参考 → 在 UI 上明确标注数据来源和免责声明
- **轮询延迟**：前端每 3 秒轮询一次，用户体验略差 → 后续可升级为 SSE

## Migration Plan

1. 后端先新增 CrewAI 相关 API 端点和数据库表（不影响现有功能）
2. 前端逐页替换，每页独立 PR，不影响其他页面
3. LLM 配置默认为空，用户首次使用时引导配置

## Open Questions

- 回测的时间范围默认值？（建议：近1年）
- 风险监控的预警阈值是否允许用户自定义？
