## Why

前端页面大量使用硬编码数据（固定股票列表、价格、涨幅、持仓/自选代码），导致展示内容与真实后端数据脱节。需要将所有静态 mock 数据替换为通过后端 API 动态获取，同时保留现有 UI 结构和布局不变。

## What Changes

- 将 `DashboardPage` 中硬编码的持仓/自选股代码列表改为从后端接口获取
- 将 `DashboardPage` 中固定的股票价格/涨幅 fallback 数据替换为实时接口数据
- 为 `DashboardPage` 的涨幅榜、行业龙头、市场资讯等区块对接后端接口
- 将 `ScreenerPage` 中固定的初始查询代码和因子预设改为从后端获取
- 扩展 `src/api.ts`，补充缺失的后端接口封装（持仓、自选、行情、资讯等）
- 保留所有页面的 UI 结构、布局、样式不变

## Capabilities

### New Capabilities

- `dashboard-data-api`: DashboardPage 持仓、自选、涨幅榜、行业龙头、市场资讯数据全部通过后端接口获取
- `screener-init-api`: ScreenerPage 初始股票代码和因子预设从后端接口加载

### Modified Capabilities

## Impact

- `quartsys-fronted/src/pages/DashboardPage.tsx`：移除硬编码数组，改为 API 调用
- `quartsys-fronted/src/pages/ScreenerPage.tsx`：初始代码改为 API 获取
- `quartsys-fronted/src/api.ts`：新增持仓、自选、行情摘要、资讯等接口封装
- 不影响后端代码，不改变任何 UI 组件结构
