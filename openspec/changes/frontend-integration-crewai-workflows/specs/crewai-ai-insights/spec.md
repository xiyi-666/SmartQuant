## ADDED Requirements

### Requirement: AI动态分析（宏观与地缘分析）
系统 SHALL 通过 CrewAI 工作流对5个维度进行分析并生成评分，每小时执行一次。

5个分析维度：政策面、资金流动性、市场情绪（涨跌家数/权重）、全球局势、经济数据。

#### Scenario: 触发分析
- **WHEN** 定时任务每小时触发，或用户手动点击"刷新分析"
- **THEN** 调用 POST /api/ai-insights/run，启动5维度分析 Crew

#### Scenario: 查询结果
- **WHEN** 前端轮询 GET /api/ai-insights/result/{task_id}
- **THEN** 返回5个维度评分（0-100）、摘要文本、分析列表

#### Scenario: 雷达图展示
- **WHEN** 分析结果返回
- **THEN** 左侧展示摘要和分析列表，右侧渲染5维度 ECharts 雷达图

### Requirement: 市场温度计
系统 SHALL 基于实时行情数据计算市场冷热状态，开盘时段每30分钟执行一次。

计算指标：涨跌家数、平均股价涨跌幅、下跌个股平均跌幅、上涨个股平均涨幅。

#### Scenario: 定时计算
- **WHEN** 开盘时段（09:30-15:00）每30分钟触发
- **THEN** 调用 POST /api/market-temperature/calculate，计算并存储结果

#### Scenario: 热力图展示
- **WHEN** 用户查看市场温度计模块
- **THEN** 调用 GET /api/market-temperature/latest，在风格箱矩阵（价值/成长 × 大盘/中盘/小盘）中渲染热力图

### Requirement: 策略Alpha推荐
系统 SHALL 允许用户选择策略，基于该策略选股并推荐表现前10的股票。

#### Scenario: 选择策略并获取推荐
- **WHEN** 用户选择某个策略
- **THEN** 调用 POST /api/alpha/recommend，返回前10只推荐股票

#### Scenario: 卡片展示
- **WHEN** 推荐结果返回
- **THEN** 默认展示3张卡片，支持左右滑动查看更多；每张卡片含股票名称/星级/AI逻辑/买入价/止损价/目标价

#### Scenario: 加入自选
- **WHEN** 用户点击卡片上的"加入自选"
- **THEN** 调用 POST /api/watchlist 将该股票加入自选

#### Scenario: 权限锁定
- **WHEN** 普通用户查看第4张及以后的卡片
- **THEN** 卡片显示锁定状态，提示需要订阅权限

### Requirement: 仓位配置与战术观点
系统 SHALL 提供仓位建议和进攻/防御/中性三种战术观点。

#### Scenario: 获取仓位建议
- **WHEN** 用户进入仓位配置模块
- **THEN** 调用 GET /api/position-advice，返回建议仓位比例

#### Scenario: Agent工作流输出战术观点
- **WHEN** 触发战术分析
- **THEN** Agent工作流输出进攻端行业列表、防御端行业列表、中性评估摘要

#### Scenario: 展示三种战术
- **WHEN** 战术分析完成
- **THEN** 页面分三栏展示：进攻（推荐行业）、防御（推荐行业）、中性（评估说明）
