## 1. 扩展 api.ts 接口封装

- [x] 1.1 检查后端 `/simulation/account` 返回结构，确认持仓字段格式
- [x] 1.2 在 `api.ts` 中新增 `getPortfolio()` 封装持仓接口
- [x] 1.3 在 `api.ts` 中新增 `getWatchlist()` 封装自选股接口（复用或补充现有）

## 2. DashboardPage 移除硬编码数据

- [x] 2.1 删除 `DASHBOARD_STOCKS` 硬编码数组
- [x] 2.2 删除硬编码的持仓代码列表（`["300750", "002594", ...]`）
- [x] 2.3 删除硬编码的自选股代码列表（`["000001", "600030", ...]`）
- [x] 2.4 页面挂载时调用 `getPortfolio()` 和 `getWatchlist()` 获取代码列表
- [x] 2.5 移除 `fallbackSeries` 伪随机 K 线生成函数，改为接口无数据时显示空状态

## 3. ScreenerPage 移除硬编码初始代码

- [x] 3.1 删除固定初始查询代码 `"000001"`
- [x] 3.2 页面挂载时调用 `getWatchlist()` 取第一个代码作为初始值，失败时 fallback 到 `"000001"`

## 4. 验证

- [ ] 4.1 启动前后端，确认 DashboardPage 持仓/自选列表从接口加载
- [ ] 4.2 确认 ScreenerPage 初始查询代码来自接口
- [ ] 4.3 确认接口失败时页面不崩溃，显示空状态或 fallback
