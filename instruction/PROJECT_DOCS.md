# QuartSys 项目功能文档

## 一、项目概述

QuartSys（KINETIC_MONOLITH）是一个面向 A 股市场的量化投资平台，提供选股、回测、AI 洞察、风险监控等功能。

**技术栈**
- 后端：FastAPI + SQLAlchemy + SQLite/PostgreSQL + CrewAI + APScheduler
- 前端：React 18 + TypeScript + ECharts + Vite
- AI：CrewAI（多 Agent 框架）+ OpenAI/Anthropic/自定义 LLM

---

## 二、后端功能模块

### 2.1 认证模块 `/api/auth`

| 端点 | 方法 | 功能 | 认证 |
|------|------|------|------|
| `/api/login` | POST | 用户名密码登录，返回 JWT Token | 否 |
| `/token` | POST | OAuth2 标准登录 | 否 |
| `/api/register` | POST | 用户注册 | 否 |
| `/api/reset_password` | POST | 密码重置（需旧密码） | 否 |
| `/api/user/profile` | GET/PUT | 查看/更新用户信息 | 是 |

**JWT 配置**：有效期 7 天，算法 HS256，密钥从 `.env` 读取。

### 2.2 市场数据模块

| 端点 | 方法 | 功能 | 数据来源 |
|------|------|------|---------|
| `/api/market/indices` | GET | 三大指数（上证/深证/创业板） | akshare |
| `/api/market/top-gainers` | GET | 行业涨幅榜（前5行业+个股） | DB计算 |
| `/api/market-temperature/latest` | GET | 市场温度（涨跌家数/均涨跌幅） | DB |
| `/api/news/latest` | GET | 最新20条财经新闻 | akshare |
| `/api/stock/quote/{code}` | GET | 单只股票最新行情 | DB |
| `/api/stock_history/{code}` | GET | K线历史数据 | DB |
| `/api/search` | GET | 股票代码/名称模糊搜索 | DB |

### 2.3 选股器模块

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/screener/query` | POST | 多因子条件筛选（支持 CTE 引擎） |
| `/api/factors/presets` | GET/POST | 获取/保存因子预设 |
| `/api/factors/presets/{id}` | GET/DELETE | 获取/删除单个预设 |
| `/api/results` | GET | 获取历史筛选结果 |
| `/api/screener/results` | DELETE | 清空筛选结果 |

**筛选因子**（方案B CTE引擎）：
- `ma60`：MA均线贴近（价格在MA60上下15%内且MA60上升）
- `volume`：放量突破（当日量≥前日×3倍）
- `yin_yang`：阴阳量价背离（量能由阴线贡献但价格上涨）
- `dual_ma`：双均线金叉（MA5上穿MA10）
- `deviation`：偏离值策略（价格在MA20-MA60之间且MA20斜率>15°）

### 2.4 自选股模块

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/watchlist` | GET | 获取自选股（按分组，含颜色） |
| `/api/watchlist` | POST | 添加到自选股 |
| `/api/watchlist` | DELETE | 从分组移除股票 |
| `/api/watchlist/group` | DELETE | 删除整个分组 |
| `/api/watchlist/group_color` | POST | 更新分组颜色 |

### 2.5 AI 洞察模块

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/ai-insights/run` | POST | 触发AI市场洞察（异步，CrewAI） |
| `/api/ai-insights/result/{id}` | GET | 查询洞察结果（轮询） |
| `/api/alpha/recommend` | POST | Alpha策略推荐 |
| `/api/position-advice` | GET | 获取仓位建议 |
| `/api/position-advice/run` | POST | 触发AI战术分析 |

**AI洞察维度**：趋势、动量、估值、情绪、风险（各0-100分）

### 2.6 策略模块

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/strategy/list` | GET | 获取策略列表 |
| `/api/strategy/generate` | POST | AI生成策略代码（LLM） |
| `/api/strategy/test` | POST | 语法检查策略代码 |
| `/api/strategy/save` | POST | 保存策略 |
| `/api/strategy/groups` | GET/POST | 策略分组管理 |

### 2.7 回测与Agent模块

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/agents` | GET/POST | Agent列表/创建 |
| `/api/agents/{id}/start` | POST | 启动Agent |
| `/api/agents/{id}/stop` | POST | 停止Agent |
| `/api/agents/{id}/backtest` | POST | 启动回测 |
| `/api/agents/{id}/performance` | GET | 获取资产曲线 |
| `/api/agents/{id}/performance` | GET | `?granularity=1H\|1D\|5D` |

**回测引擎流程**：
1. 读取Agent配置（strategy_config）
2. 重置账户（清空持仓/记录，恢复初始资金）
3. 遍历交易日历，每 `screening_interval` 天执行选股
4. 加载策略代码，构造 context 对象执行买卖
5. 每日写入 AgentDailyPerformance 快照

### 2.8 模拟交易模块

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/simulation/account` | GET | 账户信息（余额/持仓/总资产） |
| `/api/simulation/trade` | POST | 手动下单 |
| `/api/simulation/records` | GET | 交易记录 |

**交易规则**：T+1（当日买入不可当日卖出），手续费 max(5元, 万分之一)

### 2.9 风险监控模块

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/risk/score` | GET | 综合风险评分（事件驱动型） |
| `/api/risk/positions` | GET | 个股风险监控 |
| `/api/risk/market-advice` | GET | 市场风险建议（CrewAI） |
| `/api/risk/fund-flow` | GET | 北向资金监控 |
| `/api/risk/events` | GET | 风险事件列表 |
| `/api/risk/ai-assessment` | GET | AI风险评估 |

**风险评分算法**：盘面分(40%) + 事件分(40%) + 北向分(20%)

### 2.10 LLM 助手模块

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/assistant/chat` | POST | 智能问答（工具调用+流式返回） |
| `/api/llm-config` | GET/POST | LLM配置管理 |
| `/api/llm-config/test` | POST | 测试LLM连接 |

**助手工具链**：top_gainers / market_temperature / market_news / stock_detail / user_positions / risk_score / strategy_list / screening_history / northbound_flow / agent_performance

### 2.11 系统管理

| 端点 | 方法 | 功能 | 权限 |
|------|------|------|------|
| `/api/update_data` | POST | 触发股票数据更新 | admin |
| `/api/health` | GET | 健康检查 | 否 |
| `/api/logs` | GET | 查看后端日志 | 是 |
| `/api/notifications` | GET | 获取通知列表 | 是 |

---

## 三、前端页面功能

### 3.1 控制面板（DashboardPage）
- 三大指数实时行情卡片
- 持仓列表（Tab切换：持仓/自选）
- 自选分组：点击股票展开迷你K线（最近30日）
- 涨幅榜：行业聚合 + 查看前20个股
- 市场资讯：CrewAI情感分析（BULLISH/BEARISH/NEUTRAL）
- 全局风险仪表盘

### 3.2 AI洞察页（AiInsightsPage）
- 宏观与地缘政治评估：5维度分析（趋势/动量/估值/情绪/风险）
- 雷达图：右侧可视化各维度评分
- 市场温度计：上涨红/下跌绿，支持日历筛选
- Alpha策略推荐：LLM生成或历史记录降级
- 建议仓位：环形图 + 战术视图

### 3.3 选股器（ScreenerPage）
- 因子筛选：5个CTE因子 + 自定义因子，支持增删/启停
- 策略分组：保存/加载/删除预设
- K线图：默认展示最近6个月，Slider查看历史
- 筛选结果：行业板块聚合按钮，CSV导出
- Add to Watchlist：弹出分组选择器

### 3.4 策略AI页（StrategyPage）
- AI对话生成策略代码（CodeMirror编辑器）
- 策略库：分组管理，支持创建/删除/重命名分组
- 策略加载：点击策略库条目加载代码到编辑器
- AI优化：对现有策略进行LLM优化

### 3.5 因子挖掘页（FactorMiningPage）
- 因子表达式编辑器（支持MA/EMA/RSI等函数）
- 因子库：内置因子 + 用户自定义因子
- 与选股页联动：启用的因子出现在选股器因子列表中
- 快速筛选预览

### 3.6 回测分析页（BacktestingPage）
- Agent管理：创建/启动/停止/删除
- 回测引擎：支持start_date/end_date/step_days/start_offset
- 基准线：上证/深证/创业板/科创50/北证50
- 时间维度：1H/1D/5D图表切换
- 统计指标：总收益率/年化/最大回撤/夏普比率/胜率

### 3.7 风险监控页（RiskPage）
- 综合风险评分（0-100，事件驱动型）
- 持仓股票风险监控：急跌预警/利空新闻/走势评估
- 市场风险建议：CrewAI生成报告和对冲策略
- 北向资金监控：今日净流入/近20日趋势/板块排名

### 3.8 交易终端页（TradingPage）
- 模拟账户：余额/持仓/总资产
- 手动下单：买入/卖出，T+1校验
- Agent选择器：查看不同Agent账户状态
- 交易信号面板：实时显示买卖信号

### 3.9 行情页（QuotePage）
- 股票搜索（防抖300ms）
- K线图：MA5/10/20/30/60，成交量子图
- 时间范围：1D/1W/1M/YTD/ALL
- OHLCV数据展示

### 3.10 设置页（SettingsPage）
- LLM配置：Provider/Model/API Key/Base URL
- 偏好设置：主题/市场/图表风格/通知/刷新间隔
- 个人信息：用户名/邮箱/密码修改
- API配置：后端地址配置
- 日志查看

### 3.11 全局组件
- **AppShell**：侧边栏导航 + 顶部栏（市场状态/通知/用户菜单）
- **AssistantFab**：AI助手浮动按钮，支持工具调用联动

---

## 四、数据库模型

| 表名 | 用途 |
|------|------|
| `users` | 用户账户（含role字段） |
| `stocks` | 股票基本信息（含pe_ratio/market_cap） |
| `daily_prices` | 日线K线数据 |
| `watchlist_sql` | 自选股（含user_id/group_name/color） |
| `factor_filter_presets` | 因子预设 |
| `screening_results_sql` | 历史筛选结果 |
| `strategies` | 策略代码（含group_id） |
| `strategy_groups` | 策略分组 |
| `agents` | 回测/模拟Agent |
| `agent_simulation_accounts` | Agent账户 |
| `agent_positions` | Agent持仓 |
| `agent_daily_performance` | Agent每日资产快照 |
| `simulation_account` | 手动模拟账户 |
| `simulation_positions` | 手动模拟持仓 |
| `simulation_trade_records` | 交易记录 |
| `ai_insight_tasks` | AI洞察任务 |
| `market_temperature` | 市场温度历史 |
| `alpha_recommendations` | Alpha推荐记录 |
| `position_advice` | 仓位建议记录 |
| `llm_config` | LLM配置 |
| `risk_trend_snapshots` | 风险趋势快照 |
| `news_cache` | 新闻缓存（含情感标签） |
| `trading_signals` | 交易信号记录 |
| `notifications` | 系统通知 |
| `custom_factors` | 自定义因子 |
| `audit_logs` | 操作审计日志 |

---

## 五、定时任务

| 任务 | 触发时间 | 功能 |
|------|---------|------|
| `background_update_task` | 手动触发 | 全量股票数据更新 |
| `scheduled_ai_insights` | 每日15:30 | AI市场洞察分析 |
| `scheduled_market_temperature` | 每日15:30 | 市场温度计算 |
| `run_agent_trading` | 每日15:30 | Agent自动交易执行 |
| `risk_score_calculation` | 每日15:30 | 事件驱动风险评分 |

---

## 六、CrewAI Agent 配置

| Crew | 用途 | Agent数量 |
|------|------|---------|
| `ai_insights_crew` | 5维度市场分析 | 5个（各维度分析师） |
| `tactical_advice_crew` | 仓位建议与战术分析 | 2个 |
| `news_crew` | 新闻情感分析 | 2个（获取员+分析员） |
| `risk_crew` | 事件驱动风险评分 | 3个（盘面+事件+综合） |

所有 Crew 使用统一的 LLM 配置（`/api/llm-config`），不可用时降级到规则引擎。
