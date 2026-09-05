## ADDED Requirements

### Requirement: 买入股票
用户 SHALL 能在模拟交易页输入股票代码、数量并提交买入订单。

#### Scenario: 买入成功
- **WHEN** 用户输入有效股票代码和数量，账户余额充足
- **THEN** 系统调用 POST /api/simulation/trade，持仓更新，余额扣减

#### Scenario: 余额不足
- **WHEN** 用户提交买入订单但余额不足
- **THEN** 系统显示错误提示，不执行交易

### Requirement: 卖出股票
用户 SHALL 能选择持仓股票并提交卖出订单。

#### Scenario: 卖出成功
- **WHEN** 用户选择持仓股票并输入卖出数量
- **THEN** 系统调用 POST /api/simulation/trade，持仓减少，余额增加

#### Scenario: T+1 限制
- **WHEN** 用户尝试卖出当日买入的股票
- **THEN** 系统显示 T+1 限制提示，拒绝交易

### Requirement: 持仓展示
页面 SHALL 实时展示当前持仓列表，包含股票代码、名称、数量、均价、当前价、盈亏。

#### Scenario: 加载持仓
- **WHEN** 用户进入交易页
- **THEN** 系统调用 GET /api/simulation/account 并渲染持仓列表

### Requirement: 交易记录
页面 SHALL 展示历史交易记录列表。

#### Scenario: 查看记录
- **WHEN** 用户切换到交易记录 Tab
- **THEN** 系统调用 GET /api/simulation/records 并渲染记录列表
