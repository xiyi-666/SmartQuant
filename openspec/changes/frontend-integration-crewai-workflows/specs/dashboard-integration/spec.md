## ADDED Requirements

### Requirement: 市场指数展示
页面 SHALL 展示主要市场指数（上证指数、深证成指、创业板指、科创50）的实时数据。

#### Scenario: 加载指数数据
- **WHEN** 用户进入 Dashboard
- **THEN** 调用 GET /api/market/indices，展示各指数当前点位和涨跌幅

### Requirement: 个人持仓展示
页面 SHALL 展示当前模拟账户持仓列表。

#### Scenario: 加载持仓
- **WHEN** 用户进入 Dashboard
- **THEN** 调用 GET /api/simulation/account，渲染持仓列表（代码/名称/数量/盈亏）

### Requirement: 自选股分组管理
用户 SHALL 能查看自选股分组，并自定义新增分组。

#### Scenario: 查看分组
- **WHEN** 用户进入 Dashboard
- **THEN** 调用 GET /api/watchlist，按分组渲染自选股列表

#### Scenario: 新增分组
- **WHEN** 用户点击"新增分组"并输入名称
- **THEN** 调用 POST /api/watchlist/group，创建新分组

### Requirement: 风险看板
页面 SHALL 展示由接口和 Agent 计算的风险统计数据。

#### Scenario: 加载风险数据
- **WHEN** 用户进入 Dashboard
- **THEN** 调用 GET /api/risk/analysis，展示持仓集中度、波动率等风险指标卡片

### Requirement: 涨幅榜与行业龙头
页面 SHALL 支持按日期筛选，展示当日涨幅前5行业及各板块涨幅最大个股。

#### Scenario: 加载涨幅榜
- **WHEN** 用户选择日期
- **THEN** 调用 GET /api/market/top-gainers?date=，返回涨幅前5行业及龙头股，默认展示5条

#### Scenario: 查看全部
- **WHEN** 用户点击"查看全部"
- **THEN** 弹出子窗口展示完整涨幅榜列表

### Requirement: 市场资讯
页面 SHALL 展示从新闻接口获取的市场资讯列表。

#### Scenario: 加载资讯
- **WHEN** 用户进入市场情报模块
- **THEN** 调用 GET /api/news/latest，展示新闻标题、来源、时间列表

### Requirement: AI信号
页面 SHALL 展示基于选股结果生成的 AI 交易信号。

#### Scenario: 加载AI信号
- **WHEN** 用户切换到 AI 信号 Tab
- **THEN** 调用 GET /api/screener/signals，展示近期选股结果作为买入信号列表
