# QuartSys 前后端对接基线（UI 不改版）

更新时间：2026-06-20

## 1. 目标与约束

- 前端页面结构和视觉布局保持稳定，不做大改版。
- 后端优先适配前端既有 DTO 消费方式。
- 不允许业务假数据（demo/mock/fallback）伪装为真实返回。
- 对接语义统一为三类：`success`、`empty`、`failure`。

## 2. API Base 与鉴权

前端 `api.ts` 当前解析顺序：
1. `localStorage.quartsys_api_base`
2. `VITE_API_BASE_URL`
3. 仅在开发模式下探测 `http://<host>:8010/api` → `:8000/api`

说明：
- 生产模式不再依赖隐式 localhost 多端口轮询。
- 客户端错误会区分 `config/auth/forbidden/network/http`。
- 认证仍采用 Bearer Token（`Authorization: Bearer <token>`）。

## 3. 高风险 DTO 契约（当前）

### 3.1 `GET /api/simulation/account`

最小返回字段：
- `balance: number`
- `frozen_balance: number`
- `total_assets: number`
- `status: "ok" | "empty" | "failed"`
- `positions: Array<{ stock_code, stock_name, quantity, avg_price, current_price, market_value, profit }>`

兼容字段：
- `frozen`（保留，等于 `frozen_balance`）

### 3.2 `GET /api/risk/trend`

返回：
- `Array<{ date: string, value: number }>`

说明：
- 不再返回随机 `risk_score` 占位数据。
- 无持仓时返回最近 14 天 `value=0` 的空语义序列。

### 3.3 `GET /api/risk/events`

返回：
- `Array<{ time, title, desc, level, tags[] }>`

说明：
- 不再返回静态 figma 事件占位。
- 无持仓可返回空数组。

### 3.4 `GET /api/risk/fund-flow`

返回：
- `{ nodes: Array<{name}>, links: Array<{source,target,value}>, sectors, northbound, status, error }`

说明：
- 当前没有可靠资金流数据源时返回同形状空态：`nodes: []`、`links: []`、`sectors: []`、`northbound` 全部为 0、`status: "empty"`。
- 禁止返回硬编码北向资金、固定板块或静态桑基图业务值。

### 3.5 `GET /api/risk/ai-assessment`

返回语义：
- 成功：`{ assessment, source: "llm", status: "ok", error: null }`
- 空态：`{ assessment: "", source: "none", status: "empty", error: null }`
- 失败：`{ assessment: "", source: "llm", status: "failed", error }`

说明：
- LLM 未配置或不可用时不再返回固定风险判断文案。

### 3.6 `GET/POST /api/notifications*`

说明：
- 已改为数据库持久化，不再使用内存列表。
- 读取与标记已读按 JWT 当前用户隔离。

### 3.7 `GET/PUT /api/user/profile`

说明：
- 已改为 JWT 当前用户，不再硬编码 `user.id=1`。
- 密码更新统一走 passlib 验证与哈希。

### 3.8 `POST /api/strategy/generate`

返回语义：
- 成功：`{ code, status: "ok", error: null }`
- 空结果：`{ code: "", status: "empty", error: null }`
- 失败：`{ code: "", status: "failed", error: { error: { code, message, details }}}`

### 3.9 `POST /api/alpha/recommend`

返回语义：
- 成功：`{ strategy_name, items, status: "ok", error: null }`
- 空结果：`{ strategy_name, items: [], status: "empty", error: null }`

## 4. 六大关键页面（空态/错态）

覆盖页面：
- Dashboard
- Risk
- Trading
- Backtesting
- AI Insights
- Settings

当前规则：
- 页面可展示 loading、empty、error。
- 不再回填业务演示数据（如 `FALLBACK_*`、`figma*`、`MOCK_LOGS`）。
- UI 组件结构保持原位，仅替换数据分支。

## 5. 自动化门禁顺序

### Gate 1：后端契约

```bash
python -m unittest discover -s quartsys-backend/tests -p "test_contract_*.py"
```

### Gate 2：登录到 Dashboard 烟测

```bash
cd quartsys-fronted
npm run smoke:login-dashboard
```

### Gate 3：六页回归门禁

```bash
cd quartsys-fronted
npm run regression:six-pages
```

## 6. 仍需持续关注

- `agents start/stop` 已返回可观测状态字段，但当前仍未实现完整真实策略执行引擎。
- 前端 smoke/regression 当前为轻量静态门禁（代码绑定和占位数据清理），后续可升级为浏览器级 E2E。
