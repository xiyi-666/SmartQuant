## ADDED Requirements

### Requirement: 持仓和自选股列表从后端获取
DashboardPage SHALL 在初始化时通过 API 获取持仓代码列表和自选股代码列表，不得使用硬编码数组。

#### Scenario: 成功加载持仓和自选列表
- **WHEN** 页面挂载时
- **THEN** 系统调用后端接口获取持仓代码和自选股代码，并用返回数据替换硬编码列表

#### Scenario: 接口失败时降级
- **WHEN** 后端接口返回错误或超时
- **THEN** 系统显示空列表，不崩溃，不使用硬编码数据

### Requirement: 股票行情数据从后端实时获取
DashboardPage SHALL 通过 `/screener/query` 接口获取股票价格和涨幅，不得使用硬编码的价格/涨幅作为初始展示值。

#### Scenario: 行情数据加载中状态
- **WHEN** 接口请求未完成时
- **THEN** 系统显示加载占位符，不展示硬编码价格

#### Scenario: 行情数据加载成功
- **WHEN** `/screener/query` 返回数据
- **THEN** 系统用接口返回的价格和涨幅更新展示
