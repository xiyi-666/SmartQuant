## ADDED Requirements

### Requirement: 量化筛选条件组合
用户 SHALL 能配置4个筛选条件的任意 AND/OR 组合并触发筛选。

条件：ma60（60日线附近）、volume（短期放量）、yin_yang（连阴不跌）、deviation（偏离值策略）。

#### Scenario: 触发筛选
- **WHEN** 用户配置条件并点击"筛选"
- **THEN** 调用 POST /api/screener/query，结果持久化入库并展示列表

#### Scenario: AND/OR 组合
- **WHEN** 用户切换条件间的逻辑关系
- **THEN** 筛选请求携带 logic 参数（and/or），后端按对应逻辑执行

### Requirement: 高级参数配置
用户 SHALL 能配置各条件的高级参数。

参数：MA周期、偏离阈值、放量倍数、放量后观察天数、连阴天数、MA20斜率阈值。

#### Scenario: 展开高级参数
- **WHEN** 用户点击"高级设置"
- **THEN** 展开参数配置面板，各参数有默认值

### Requirement: K线行情展示
点击股票 SHALL 展示完整 K 线图，前端本地计算均线。

展示：MA5/MA10/MA20/MA30/MA60、成交量子图（涨红跌绿）、交易买卖点 Pin 标注、默认显示最近126个交易日。

#### Scenario: 点击股票加载K线
- **WHEN** 用户点击筛选结果中的股票
- **THEN** 调用 GET /api/stock_history/{code}，前端计算5条均线并渲染

#### Scenario: 交易标记
- **WHEN** K线加载完成
- **THEN** 调用 GET /api/simulation/records?code=，将买卖点以 Pin 形式标注在对应日期

### Requirement: 自选池管理
用户 SHALL 能管理自选股分组，并从筛选结果批量加入自选。

#### Scenario: 批量加入自选
- **WHEN** 用户勾选多只股票并点击"加入自选"
- **THEN** 调用 POST /api/watchlist 批量写入，支持选择目标分组

#### Scenario: 自选模式查看K线
- **WHEN** 用户在自选模式下点击股票
- **THEN** 展示该股 K 线，并提供"移除自选"按钮

### Requirement: 策略管理
用户 SHALL 能保存当前筛选参数为命名策略，并在筛选时加载已保存策略。

#### Scenario: 保存策略
- **WHEN** 用户输入策略名并保存
- **THEN** 调用 POST /api/factors/presets，保存参数组合

#### Scenario: 加载策略
- **WHEN** 用户选择已保存策略
- **THEN** 调用 GET /api/factors/presets/{id}，回填表单参数

#### Scenario: 历史日期筛选
- **WHEN** 用户选择历史日期并执行筛选
- **THEN** 筛选请求携带 date 参数，后端基于该日期数据回填筛选
