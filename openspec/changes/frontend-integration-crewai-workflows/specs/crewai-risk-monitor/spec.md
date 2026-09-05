## ADDED Requirements

### Requirement: 持仓风险分析
系统 SHALL 基于当前模拟账户持仓计算风险指标。

#### Scenario: 加载风险数据
- **WHEN** 用户进入风险监控页
- **THEN** 调用 GET /api/risk/analysis，返回集中度、波动率、VaR 等指标

### Requirement: 风险 Crew 组成
后端 SHALL 实现包含三个 Agent 的 Crew：持仓分析 Agent、风险计算 Agent、预警 Agent。

#### Scenario: 风险 Crew 执行
- **WHEN** 触发风险分析
- **THEN** 计算持仓集中度风险、个股波动率、组合 VaR

### Requirement: 风险预警
系统 SHALL 在风险指标超过阈值时显示预警信息。

#### Scenario: 触发预警
- **WHEN** 单只股票持仓占比超过 30%
- **THEN** 页面显示集中度风险预警提示
