## ADDED Requirements

### Requirement: 风险趋势分析（柱形图）
页面 SHALL 展示实时风险值计算结果，每小时更新，用柱形图展示。

#### Scenario: 加载风险趋势
- **WHEN** 用户进入风险页
- **THEN** 调用 GET /api/risk/trend，渲染风险值历史柱形图（ECharts bar）

### Requirement: 资金流向与经济指数
页面 SHALL 展示关键经济指数表现统计。

#### Scenario: 加载经济指数
- **WHEN** 用户查看资金流向模块
- **THEN** 调用 GET /api/market/indices，展示关键经济指数表现

### Requirement: 重大风险事件时间线
页面 SHALL 展示国内外重大风险事件时间线，并以卡片形式展示评估结果。

#### Scenario: 加载风险事件
- **WHEN** 用户查看风险事件模块
- **THEN** 调用 GET /api/risk/events，返回事件列表并渲染时间线卡片

### Requirement: AI 策略评估
页面 SHALL 通过接口获取当前 AI 策略评估结果。

#### Scenario: 加载 AI 评估
- **WHEN** 用户查看 AI 策略评估模块
- **THEN** 调用 GET /api/risk/ai-assessment，展示当前策略风险评估内容

### Requirement: 系统性资金流向图
页面 SHALL 展示资金流向监控图，反映市场资金流入流出情况。

#### Scenario: 加载资金流向
- **WHEN** 用户查看资金流向图
- **THEN** 调用 GET /api/risk/fund-flow，渲染资金流向可视化图表
