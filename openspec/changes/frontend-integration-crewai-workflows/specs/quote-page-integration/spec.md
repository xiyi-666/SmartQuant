## ADDED Requirements

### Requirement: 动态股票代码传入
QuotePage SHALL 接收 URL 参数或路由 state 中的股票代码，并据此加载数据。

#### Scenario: 从选股页跳转
- **WHEN** 用户在 ScreenerPage 点击某只股票
- **THEN** 路由跳转至 /quote?code=XXXXXX，QuotePage 读取 code 参数

#### Scenario: 无代码参数
- **WHEN** 用户直接访问 /quote 无参数
- **THEN** 页面显示搜索框，引导用户输入股票代码

### Requirement: K线图展示
页面 SHALL 调用 GET /api/stock_history/{code} 并用 ECharts 渲染 K 线图。

#### Scenario: 加载 K 线数据
- **WHEN** 股票代码确定后
- **THEN** 系统请求历史数据并渲染蜡烛图，含成交量子图

### Requirement: 最新行情展示
页面 SHALL 展示股票最新价格、涨跌幅、成交量等基础行情数据。

#### Scenario: 加载行情
- **WHEN** 页面加载
- **THEN** 调用 GET /api/stock/quote/{code} 并展示行情卡片
