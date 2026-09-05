## Context

前端项目（React + TypeScript + Vite）已有 `src/api.ts` 统一封装后端请求，但 `DashboardPage` 和 `ScreenerPage` 中存在大量硬编码数据作为初始值或 fallback。后端（Python/Quart）已运行在 8010 端口，提供 `/watchlist`、`/screener/query`、`/factors/presets` 等接口。

## Goals / Non-Goals

**Goals:**
- 移除 `DashboardPage` 中硬编码的持仓/自选股代码、价格、涨幅数据
- 移除 `ScreenerPage` 中固定的初始查询代码
- 在 `api.ts` 中补充缺失的接口封装（持仓列表、自选列表、行情摘要）
- 保持所有页面 UI 结构、布局、样式完全不变

**Non-Goals:**
- 不修改后端代码
- 不重构 UI 组件结构
- 不处理 `TradingPage`、`RiskPage`、`BacktestingPage` 等静态 HTML 渲染页面
- 不引入新的状态管理库

## Decisions

**1. 复用现有 `api.ts` 模式**
直接在 `api.ts` 中新增函数，与现有风格一致（fetch + Bearer token），不引入 axios 或 react-query。

**2. 持仓/自选列表接口**
后端已有 `/watchlist` 接口返回自选股。持仓数据若后端无专用接口，则复用 `/simulation/account` 中的持仓字段，或从 `/watchlist` 中按标记区分。

**3. 行情数据保持现有轮询机制**
`DashboardPage` 已有每 20s 轮询 `/screener/query` 的逻辑，移除硬编码后该机制继续工作，无需改动轮询逻辑。

**4. ScreenerPage 初始代码**
从 `/watchlist` 取第一个股票代码作为初始查询目标，若接口返回空则保留 `"000001"` 作为最终 fallback。

## Risks / Trade-offs

- **后端接口字段不匹配** → 在 `api.ts` 中做字段映射，前端适配后端返回格式
- **接口加载延迟导致空白闪烁** → 保留现有 loading 状态处理，初始渲染显示骨架屏或空列表
- **持仓接口可能不存在** → 先检查 `/simulation/account` 返回结构，必要时后端新增 `/portfolio` 接口
