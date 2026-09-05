## ADDED Requirements

### Requirement: 风险接口必须返回可重复解释的数据结果
系统 SHALL 让 `/api/risk/trend`、`/api/risk/events`、`/api/risk/fund-flow` 和 `/api/risk/ai-assessment` 返回基于真实数据源、持久化快照或结构化降级的结果，不得返回随机值或静态示例业务数据。

#### Scenario: 风险趋势数据可用
- **WHEN** 风险趋势接口被调用
- **THEN** 系统返回来自真实计算或已保存快照的时间序列，而不是随机生成的风险分数

#### Scenario: 风险数据暂不可用
- **WHEN** 所需数据源缺失或计算失败
- **THEN** 系统返回结构化空态或错误原因，不返回静态示例事件、示例资金流向或伪造风险评分

### Requirement: 策略生成与 AI 推荐失败路径必须显式可见
系统 SHALL 在策略生成、Alpha 推荐和同类 AI 驱动接口失败时返回结构化失败信息，不得把失败伪装成可执行策略代码或模拟推荐结果。

#### Scenario: 策略生成失败
- **WHEN** `/api/strategy/generate` 内部 LLM 调用失败
- **THEN** 系统返回明确失败状态和错误信息，不返回包含 `TODO` 占位逻辑的伪代码

#### Scenario: Alpha 推荐缺少真实结果
- **WHEN** 推荐计算所需缓存、行情或模型结果不可用
- **THEN** 系统返回明确的空结果或降级原因，不用硬编码推荐逻辑冒充真实分析

### Requirement: Agent 生命周期接口必须具备真实运行语义
系统 SHALL 让 Agent 的 start/stop 行为对应可观测的后台执行状态，而不只是修改数据库字段。

#### Scenario: 启动 Agent
- **WHEN** 客户端调用 `/api/agents/{id}/start`
- **THEN** 系统创建或注册实际后台执行任务，并返回可追踪的运行状态

#### Scenario: 停止 Agent
- **WHEN** 客户端调用 `/api/agents/{id}/stop`
- **THEN** 系统标记并执行实际停止流程，后续状态查询能够反映该停止结果

### Requirement: 后端必须输出现有前端可直接消费的稳定 DTO
系统 SHALL 让关键页面依赖接口适配当前前端消费模型，而不是要求页面通过猜字段、重组结构或替换视觉布局来兼容接口差异。

#### Scenario: 风险趋势接口返回图表点位
- **WHEN** 客户端调用 `/api/risk/trend`
- **THEN** 每个趋势点使用当前页面可直接消费的规范字段名 `value` 表示数值，且不得继续以 `risk_score` 作为页面绑定字段

#### Scenario: 模拟账户接口返回账户与持仓
- **WHEN** 客户端调用 `/api/simulation/account`
- **THEN** 返回 DTO 至少包含 `balance`、`frozen_balance`、`total_assets`、`status`、`positions[]`，且每个持仓项至少包含 `stock_code`、`stock_name`、`quantity`、`avg_price`、`current_price`、`market_value`、`profit`

### Requirement: 关键接口必须区分成功、空态和失败语义
系统 SHALL 在不破坏现有页面绑定的前提下，统一关键接口的响应语义为成功、空态和失败三类，禁止以伪业务数据掩盖真实状态。

#### Scenario: 接口成功但当前无业务数据
- **WHEN** 关键接口成功执行但无可展示记录
- **THEN** 系统返回 `200` 和同形状空 DTO，并附带 `status: "empty"` 或等价元信息，而不是返回示例业务数据

#### Scenario: 接口执行失败或依赖不可用
- **WHEN** 关键接口计算失败、鉴权失败或依赖服务不可用
- **THEN** 系统返回 `4xx/5xx` 与 `{ code, message, details? }` 结构化失败信息，而不是返回静态示例结果或 TODO 占位内容
