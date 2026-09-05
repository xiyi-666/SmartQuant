## Why

当前系统大量页面（模拟交易、行情详情、AI洞察、回测分析、风险监控）仍为静态 HTML 原型，与后端完全脱节，无法为用户提供真实数据交互。同时缺乏智能分析能力，需要引入 CrewAI 工作流驱动 AI 洞察、回测和风险监控功能。

## What Changes

- **前端对接**：将模拟交易页、行情详情页、市场总览页从静态 HTML 原型替换为真实 API 数据驱动的 React TSX 组件
- **CrewAI 工作流**：为 AI 洞察、回测分析、风险监控三个模块分别实现独立的 CrewAI Crew，每个 Crew 包含多个专职 Agent
- **LLM 配置系统**：支持 GPT / Claude / Gemini 及自定义 OpenAI Compatible 接口（可配置 base_url + api_key）
- **后端新增 API**：为三个 CrewAI 模块新增对应的 FastAPI 端点，支持异步任务触发和结果查询
- **前端新增页面**：将 AI洞察、回测、风险监控页面从静态原型升级为与 CrewAI 后端交互的动态页面

## Capabilities

### New Capabilities
- `trading-page-integration`: 模拟交易页前端与后端 API 完整对接（买卖下单、持仓展示、交易记录）
- `quote-page-integration`: 行情详情页动态化，支持传入股票代码展示 K 线和实时行情
- `dashboard-integration`: 市场总览页补全与后端数据绑定
- `crewai-ai-insights`: AI 市场洞察 CrewAI 工作流（市场分析 + 新闻解读 + 报告生成 Agent）
- `crewai-backtesting`: 回测分析 CrewAI 工作流（数据准备 + 策略回测 + 绩效评估 Agent）
- `crewai-risk-monitor`: 风险监控 CrewAI 工作流（持仓分析 + 风险计算 + 预警 Agent）
- `llm-config`: 可配置 LLM 提供商系统（GPT/Claude/Gemini + 自定义 OpenAI Compatible 接口）

### Modified Capabilities

## Impact

- **后端**：`quartsys-backend/main.py` 新增 CrewAI 相关 API 端点；新增 `crews/` 目录存放各 Crew 实现；`requirements.txt` 新增 `crewai`、`crewai-tools` 依赖
- **前端**：`quartsys-fronted/src/pages/` 下 TradingPage、QuotePage、DashboardPage、AiInsightsPage、BacktestingPage、RiskPage 全部重写为真实数据驱动；`src/api.ts` 新增对应 API 方法
- **配置**：新增 LLM 配置存储（数据库或配置文件），前端 SettingsPage 新增 LLM 配置 UI
