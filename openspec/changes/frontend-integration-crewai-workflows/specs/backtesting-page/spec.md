## ADDED Requirements

### Requirement: Agent 回测管理
页面 SHALL 支持基于已保存策略创建 Agent 进行回测和实时运行测试。

#### Scenario: 创建回测 Agent
- **WHEN** 用户选择策略并点击"创建回测"
- **THEN** 调用 POST /api/agents，创建回测 Agent 并启动

#### Scenario: 实时运行测试
- **WHEN** 用户点击"实时运行"
- **THEN** Agent 基于当前市场数据实时执行策略逻辑并返回信号

### Requirement: 策略表现统计面板
页面顶部 SHALL 展示所有 Agent 的策略表现数据。

#### Scenario: 加载统计面板
- **WHEN** 用户进入回测页
- **THEN** 调用 GET /api/agents，展示策略涨跌曲线（ECharts 折线图）和收益排行

### Requirement: Agent 管理
页面 SHALL 支持查看、启动、停止、删除 Agent。

#### Scenario: 查看 Agent 列表
- **WHEN** 用户进入回测页
- **THEN** 展示所有 Agent 的状态（运行中/已停止/回测完成）

#### Scenario: 停止 Agent
- **WHEN** 用户点击"停止"
- **THEN** 调用 POST /api/agents/{id}/stop，Agent 状态更新为已停止
