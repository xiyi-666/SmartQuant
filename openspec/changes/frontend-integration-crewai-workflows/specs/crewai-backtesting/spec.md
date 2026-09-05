## ADDED Requirements

### Requirement: 触发回测分析
用户 SHALL 能选择策略参数和时间范围触发回测 Crew。

#### Scenario: 触发回测
- **WHEN** 用户配置参数并点击"开始回测"
- **THEN** 调用 POST /api/backtesting/run，返回任务 ID

#### Scenario: 查询回测结果
- **WHEN** 前端轮询 GET /api/backtesting/result/{task_id}
- **THEN** 返回状态和回测绩效数据（收益率、最大回撤、夏普比率）

### Requirement: 回测 Crew 组成
后端 SHALL 实现包含三个 Agent 的 Crew：数据准备 Agent、策略回测 Agent、绩效评估 Agent。

#### Scenario: 回测执行完成
- **WHEN** Crew 执行完毕
- **THEN** 生成包含净值曲线数据和绩效指标的回测报告

### Requirement: 回测结果可视化
页面 SHALL 用 ECharts 展示净值曲线和绩效指标。

#### Scenario: 渲染净值曲线
- **WHEN** 回测结果返回
- **THEN** 渲染折线图展示策略净值 vs 基准（沪深300）
