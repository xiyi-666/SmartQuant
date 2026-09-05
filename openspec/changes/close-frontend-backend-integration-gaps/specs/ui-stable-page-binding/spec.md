## ADDED Requirements

### Requirement: 页面运行态数据必须优先使用真实 API 结果
系统 SHALL 在保持现有页面 UI 结构不变的前提下，为 Dashboard、AI Insights、Backtesting、Risk、Trading、Settings 等页面优先渲染真实 API 返回的数据，而不是页面内置的 demo 或 fallback 业务数据。

#### Scenario: API 成功返回页面数据
- **WHEN** 页面初始化请求成功完成
- **THEN** 系统使用接口返回结果填充现有卡片、表格和图表区域，不再注入页面内置示例业务记录

#### Scenario: API 返回空结果
- **WHEN** 接口成功返回空数组、空对象或无可展示记录
- **THEN** 系统保持当前 UI 布局并展示空态说明，不使用示例业务数据补满页面

### Requirement: 页面联接失败必须暴露可解释状态
系统 SHALL 在页面依赖接口失败、超时或鉴权失败时，展示与当前 UI 兼容的错误或加载状态，而不是静默切换到伪造业务数据。

#### Scenario: 页面请求超时或网络失败
- **WHEN** 页面依赖接口请求失败或超时
- **THEN** 系统在对应现有区域展示错误态或重试提示，并保留页面布局稳定

#### Scenario: 页面请求返回未授权
- **WHEN** 页面接口返回 401 或 403
- **THEN** 系统清晰提示当前登录态失效或权限不足，不使用匿名示例数据继续渲染

### Requirement: 前端页面不得混入仅用于视觉演示的业务 fallback
系统 SHALL 移除现有页面中仅用于视觉演示的排名卡、推荐卡、仓位行和同类业务 fallback 数据源。

#### Scenario: 回测页无 agent 数据
- **WHEN** BacktestingPage 请求成功但 agent 列表为空
- **THEN** 系统展示空列表或空态提示，不渲染示例收益排行数据

#### Scenario: 交易页无持仓数据
- **WHEN** TradingPage 账户持仓为空
- **THEN** 系统展示空持仓提示，不渲染 Figma demo 持仓行

### Requirement: UI 修复不得通过结构性重写页面完成
系统 SHALL 将联接问题修复限制在数据绑定、状态处理和局部展示层，不得通过大改页面结构或更换核心视觉布局来规避问题。

#### Scenario: 修复页面联接问题
- **WHEN** 某页面存在接口字段错误、空态问题或 fallback 数据问题
- **THEN** 系统在保持现有视觉结构和交互层级不变的前提下完成修复

### Requirement: Dashboard 页面空态不得回退到示例行情与资讯
系统 SHALL 在 Dashboard 无真实指数、涨幅榜、新闻或自选股数据时保留现有区块布局，并展示空态说明，而不是注入示例行情和资讯记录。

#### Scenario: Dashboard 关键面板无数据
- **WHEN** Dashboard 依赖接口成功返回空结果
- **THEN** 系统保留现有卡片、榜单和资讯区域布局，但不渲染示例指数、示例个股、示例涨幅榜或示例新闻

### Requirement: Risk 页面不得使用静态风控业务块补位
系统 SHALL 在 Risk 页面无真实趋势、事件、资金流向或 AI 评估结果时展示对应空态或错误态，不得回退到 `figmaEvents`、`figmaAiAssessment`、`figmaFundFlow` 等静态业务块。

#### Scenario: Risk 面板缺少真实风控数据
- **WHEN** 风控相关接口返回空结果或结构化失败
- **THEN** 系统保留现有图表和信息面板布局，并展示空态或错误信息，而不是渲染静态示例业务内容

### Requirement: Trading 页面持仓区域不得渲染演示仓位
系统 SHALL 仅使用真实账户 DTO 中的持仓结果填充 Trading 页面；当账户无持仓时，页面显示空持仓状态，而不是回退到 Figma demo positions。

#### Scenario: 交易账户无持仓
- **WHEN** `/api/simulation/account` 成功返回空 `positions`
- **THEN** 系统展示空持仓提示，不渲染演示仓位行

### Requirement: Backtesting 页面不得渲染示例收益排行
系统 SHALL 在回测或 Agent 结果为空时保留现有排行榜区域，但不得使用 `fallbackRankings` 伪造收益排行。

#### Scenario: 回测页无排行数据
- **WHEN** 回测结果或排行接口返回空结果
- **THEN** 系统展示空列表或空态提示，不渲染示例收益排行卡片

### Requirement: AI Insights 页面不得补视觉演示推荐卡
系统 SHALL 在 AI 推荐或洞察结果为空、失败或未生成时保留现有推荐区布局，但不得使用 `figmaRecommendations` 或同类视觉演示数据补位。

#### Scenario: AI 推荐暂不可用
- **WHEN** 推荐接口返回空结果或失败
- **THEN** 系统展示空态、失败原因或等待生成状态，不渲染演示推荐卡

### Requirement: Settings 页面日志区域不得使用 mock 数据
系统 SHALL 通过统一 API 调用路径获取日志和设置相关运行数据；当无日志可展示时，保留现有 UI 布局并显示空态，不得使用 `MOCK_LOGS` 或页面内直连 fallback 数据。

#### Scenario: 设置页无日志记录
- **WHEN** 日志接口返回空结果或请求失败
- **THEN** 系统展示空态或错误态，不渲染 mock 日志内容
