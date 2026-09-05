# QuartSys 前后端对接设计文档

> 本文档核心目标：建立后端 API ↔ 前端原型页面 的完整映射关系，确保每个 UI 组件都有明确的数据来源。

---

## 一、后端 API 全景 (main.py)

### 1.1 认证模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| POST | `/api/login` | JWT登录(返回token) | LoginPage |
| POST | `/api/register` | 用户注册 | LoginPage |
| POST | `/token` | OAuth2标准登录 | LoginPage |
| POST | `/api/reset_password` | 密码重置 | LoginPage |
| GET/PUT | `/api/user/profile` | 查看/更新用户资料 | SettingsPage |

### 1.2 市场数据模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| GET | `/api/market/indices` | 三大指数(上证/深证/创业板) | DashboardPage |
| GET | `/api/market/top-gainers` | 按行业分组的涨幅榜 | DashboardPage |
| GET | `/api/market-temperature/latest` | 市场温度(涨跌家数/热力图) | DashboardPage, AiInsightsPage |
| GET | `/api/news/latest` | 最新20条市场资讯 | DashboardPage |
| GET | `/api/stock/quote/{code}` | 单只股票最新报价 | QuotePage, TradingPage |
| GET | `/api/stock_history/{code}` | K线历史数据(126日) | QuotePage, ScreenerPage |
| GET | `/api/search` | 股票代码/名称模糊搜索 | QuotePage, ScreenerPage, TradingPage |

### 1.3 选股器模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| POST | `/api/screener/query` | 多因子条件筛选 | ScreenerPage |
| GET | `/api/factors/presets` | 获取因子预设列表 | ScreenerPage |
| POST | `/api/factors/presets` | 保存因子预设 | ScreenerPage |
| GET | `/api/factors/presets/{id}` | 获取单个预设详情 | ScreenerPage |
| GET | `/api/results` | 获取历史筛选结果(按日期) | ScreenerPage |
| DELETE | `/api/screener/results` | 清空筛选结果 | ScreenerPage |

### 1.4 AI洞察模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| POST | `/api/ai-insights/run` | 触发AI市场洞察(异步任务) | AiInsightsPage |
| GET | `/api/ai-insights/result/{taskId}` | 查询洞察结果(轮询) | AiInsightsPage |
| POST | `/api/alpha/recommend` | Alpha策略推荐(免费限3条) | AiInsightsPage |
| GET | `/api/position-advice` | 获取最新仓位建议 | AiInsightsPage |
| POST | `/api/position-advice/run` | 触发AI战术分析(异步) | AiInsightsPage |

### 1.5 策略模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| GET | `/api/strategy/list` | 已保存策略列表 | StrategyPage |
| POST | `/api/strategy/generate` | AI生成Python策略代码(CrewAI) | StrategyPage |
| POST | `/api/strategy/test` | 策略代码语法检查 | StrategyPage |
| POST | `/api/strategy/save` | 保存策略 | StrategyPage |

### 1.6 Agent模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| GET | `/api/agents` | Agent列表(含绩效) | BacktestingPage |
| POST | `/api/agents` | 创建Agent | BacktestingPage |
| POST | `/api/agents/{id}/start` | 启动Agent | BacktestingPage |
| POST | `/api/agents/{id}/stop` | 停止Agent | BacktestingPage |
| DELETE | `/api/agents/{id}` | 删除Agent | BacktestingPage |
| GET | `/api/agents/{id}/performance` | Agent每日绩效曲线 | BacktestingPage |

### 1.7 模拟交易模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| GET | `/api/simulation/account` | 账户信息(余额/持仓/总资产) | TradingPage, DashboardPage |
| POST | `/api/simulation/trade` | 执行买卖(100股整数倍校验) | TradingPage |
| GET | `/api/simulation/records` | 交易记录(可按股票代码筛选) | TradingPage |

### 1.8 风控模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| GET | `/api/risk/trend` | 近14天风险值趋势曲线 | RiskPage |
| GET | `/api/risk/events` | 风险事件列表(预警/资金流向) | RiskPage |
| GET | `/api/risk/ai-assessment` | AI风险评估报告(LLM) | RiskPage |
| GET | `/api/risk/fund-flow` | 资金流向桑基图数据 | RiskPage |

### 1.9 自选模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| GET | `/api/watchlist` | 获取自选分组(含颜色) | DashboardPage, ScreenerPage |
| POST | `/api/watchlist` | 添加股票到自选 | ScreenerPage, AiInsightsPage |
| DELETE | `/api/watchlist` | 从自选移除 | DashboardPage |
| POST | `/api/watchlist/group` | 创建自选分组 | DashboardPage |
| DELETE | `/api/watchlist/group` | 删除自选分组 | DashboardPage |
| POST | `/api/watchlist/group_color` | 更新分组颜色 | DashboardPage |

### 1.10 配置/辅助模块
| 方法 | 端点 | 功能 | 前端对应页面 |
|------|------|------|-------------|
| GET/POST | `/api/llm-config` | LLM配置(Provider/Model/Key) | SettingsPage |
| POST | `/api/llm-config/test` | 验证LLM配置格式 | SettingsPage |
| GET | `/api/notifications` | 通知列表 | AppShell(顶部栏) |
| POST | `/api/notifications/read` | 标记通知已读 | AppShell |
| GET | `/api/logs` | 后端操作日志 | SettingsPage |
| GET | `/api/health` | 健康检查 | AppShell |

---

## 二、前端原型页面 ↔ 后端 API 映射矩阵

### 2.1 Dashboard (market_dashboard_updated)

```
┌─────────────────────────────────────────────────────────────┐
│  DashboardPage 首页仪表盘                                    │
├─────────────────────────────────────────────────────────────┤
│  区域: 顶部指数卡片                                          │
│  原型: 4张指数卡片 (SSE INDEX / SZSE COMP / CHINEXT / SSE50) │
│  API:  GET /api/market/indices                               │
│  字段:  name, close, change_pct                              │
├─────────────────────────────────────────────────────────────┤
│  区域: 左侧持仓列表(Holding)                                 │
│  原型: 股票代码/名称/价格/涨跌幅表格                         │
│  API:  GET /api/simulation/account                           │
│  字段:  positions[].stock_code, stock_name, current_price    │
│  计算:  涨跌幅需后端补充或前端计算                           │
├─────────────────────────────────────────────────────────────┤
│  区域: 自选分组(Watch)                                       │
│  原型: 分组Tab切换                                           │
│  API:  GET /api/watchlist                                    │
│  字段:  groups[].name, stocks[].code, stocks[].name          │
├─────────────────────────────────────────────────────────────┤
│  区域: 涨幅榜(TOP GAINERS)                                   │
│  原型: 行业卡片 + 领涨股列表                                 │
│  API:  GET /api/market/top-gainers                           │
│  字段:  industry, avg_change, stocks[].name, change_pct      │
├─────────────────────────────────────────────────────────────┤
│  区域: 全球风险仪表盘(GLOBAL RISK)                           │
│  原型: 半圆仪表盘 + 风险指标                                 │
│  API:  GET /api/market-temperature/latest                    │
│  字段:  avg_change 映射为风险分数(0-100)                     │
├─────────────────────────────────────────────────────────────┤
│  区域: 市场情报(MARKET INTELLIGENCE)                         │
│  原型: 时间线式新闻列表(BULLISH/BEARISH/NEUTRAL标签)         │
│  API:  GET /api/news/latest                                  │
│  字段:  title, time, source                                  │
│  注意:  后端无情感标签，需前端根据标题关键词推断或统一显示   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 AI Insights (ai_market_insights)

```
┌─────────────────────────────────────────────────────────────┐
│  AiInsightsPage AI市场洞察                                   │
├─────────────────────────────────────────────────────────────┤
│  区域: 宏观与地缘政治分析(Macro & Geopolitics)               │
│  原型: 左侧文字总结 + 右侧5维雷达图                          │
│  API:  POST /api/ai-insights/run → GET /api/ai-insights/result/{id} │
│  字段:  summary, dimensions{policy,liquidity,sentiment,economy,geopolitics} │
│  动作:  点击"刷新"触发run，轮询result直到status=done        │
├─────────────────────────────────────────────────────────────┤
│  区域: 市场温度计(MARKET THERMOMETER)                        │
│  原型: 横向温度计 + 风格箱(3x3网格)                          │
│  API:  GET /api/market-temperature/latest                    │
│  字段:  rise_count, fall_count, avg_change, heatmap_data     │
│  注意:  风格箱(Style Box)后端无数据，需用heatmap_data映射    │
├─────────────────────────────────────────────────────────────┤
│  区域: Alpha选股(Strategy Alpha Picks)                       │
│  原型: 股票卡片(名称/代码/星级/AI逻辑/买入止损目标价)        │
│  API:  POST /api/alpha/recommend                             │
│  字段:  stock_name, stock_code, stars, ai_logic, buy_price, stop_loss, target_price │
│  限制:  免费用户只显示前3条，第4条显示锁定UI                 │
├─────────────────────────────────────────────────────────────┤
│  区域: 仓位建议(Suggested Allocation)                        │
│  原型: 环形图 + 战术姿态文字                                 │
│  API:  GET /api/position-advice                              │
│  字段:  position_ratio, attack[], defense[], neutral         │
│  动作:  点击"分析"触发 POST /api/position-advice/run         │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Screener (stock_screener_reference_layout)

```
┌─────────────────────────────────────────────────────────────┐
│  ScreenerPage 智能选股器                                     │
├─────────────────────────────────────────────────────────────┤
│  区域: 因子过滤器(Factor Filters)                            │
│  原型: PE/PB/ROE滑块 + 自定义因子复选框                      │
│  API:  GET /api/factors/presets (加载预设)                   │
│        POST /api/factors/presets (保存预设)                  │
│  字段:  presets[].name, config[].{factor, min, max, logic}  │
├─────────────────────────────────────────────────────────────┤
│  区域: 股票趋势查询(Stock Trend Query)                       │
│  原型: 搜索框 + K线图(SVG)                                   │
│  API:  GET /api/stock_history/{code}                         │
│        GET /api/search?q= (搜索提示)                         │
│  字段:  data[]=[date,open,close,high,low,volume]             │
├─────────────────────────────────────────────────────────────┤
│  区域: 筛选结果(Filter Results)                              │
│  原型: 匹配数量 + 市值分布条 + PE分布                        │
│  API:  POST /api/screener/query                              │
│  字段:  rows[].{code,name,price,pe_ratio,pb_ratio,roe}       │
│  计算:  市值分布和PE分布需前端统计                           │
├─────────────────────────────────────────────────────────────┤
│  区域: 结果表格                                              │
│  原型: Ticker/Company/Score/Price/P/E/ROE/Sentiment/Actions  │
│  API:  POST /api/screener/query (同上)                       │
│  字段:  同上，Score后端无该字段，可用stars或自定义计算       │
│  动作:  收藏(star)→POST /api/watchlist                     │
│         加自选(+)→POST /api/watchlist                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Strategy AI (strategy_ai_sidebar_update)

```
┌─────────────────────────────────────────────────────────────┐
│  StrategyPage AI策略引擎                                     │
├─────────────────────────────────────────────────────────────┤
│  区域: AI对话区                                              │
│  原型: 聊天记录(用户描述/AI回复) + 输入框                    │
│  API:  POST /api/strategy/generate                           │
│  字段:  prompt, buy_condition, profit_target, stop_loss, holding_period │
│  返回:  {code: "Python代码"}                                 │
├─────────────────────────────────────────────────────────────┤
│  区域: 逻辑参数(Logic Parameters)                            │
│  原型: 买入条件下拉框/止盈滑块/止损滑块/持仓周期             │
│  API:  作为参数传入 /api/strategy/generate                   │
│  字段:  buy_condition, profit_target, stop_loss, holding_period │
├─────────────────────────────────────────────────────────────┤
│  区域: 代码预览(Code Preview)                                │
│  原型: strategy_v1.py 代码高亮区                             │
│  API:  来自 /api/strategy/generate 返回的 code 字段          │
│  动作:  测试 → POST /api/strategy/test                       │
│         保存 → POST /api/strategy/save                       │
├─────────────────────────────────────────────────────────────┤
│  区域: 已保存策略(Saved Agent Strategies)                    │
│  原型: 策略卡片列表(名称/收益率/修改时间)                    │
│  API:  GET /api/strategy/list                                │
│  字段:  id, name, updated_at                                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.5 Backtesting (backtesting_agent_analysis)

```
┌─────────────────────────────────────────────────────────────┐
│  BacktestingPage 回测与Agent分析                             │
├─────────────────────────────────────────────────────────────┤
│  区域: AI诊断横幅                                            │
│  原型: 顶部提示条(AgentXXX表现优异...)                       │
│  API:  无直接API，可静态展示或从Agent列表动态生成            │
├─────────────────────────────────────────────────────────────┤
│  区域: Agent多绩效曲线(Agent Multi-Performance)              │
│  原型: 折线图(多条Agent收益曲线) + 时间周期切换              │
│  API:  GET /api/agents/{id}/performance (每个Agent)          │
│  字段:  date, total_assets, daily_return                     │
│  图表:  用ECharts绘制，X轴=date, Y轴=累计收益率              │
├─────────────────────────────────────────────────────────────┤
│  区域: 收益率排名(Yield Ranking)                             │
│  原型: 右侧排名列表(Agent名称/收益率/进度条)                 │
│  API:  GET /api/agents (返回total_return)                    │
│  字段:  name, total_return                                   │
├─────────────────────────────────────────────────────────────┤
│  区域: Agent舰队管理(Agent Fleet Management)                 │
│  原型: 表格(Agent身份/策略类型/执行状态/收益率/回撤/操作)    │
│  API:  GET /api/agents                                       │
│        POST /api/agents/{id}/start                           │
│        POST /api/agents/{id}/stop                            │
│        DELETE /api/agents/{id}                               │
│  字段:  id, name, status, total_return                       │
│  注意:  回撤(drawdown)后端无该字段，需前端计算或隐藏         │
└─────────────────────────────────────────────────────────────┘
```

### 2.6 Risk Monitor (risk_monitor_updated)

```
┌─────────────────────────────────────────────────────────────┐
│  RiskPage 风控监控                                           │
├─────────────────────────────────────────────────────────────┤
│  区域: 顶部风险指标栏                                        │
│  原型: GLOBAL RISK SCORE / VaR / BETA EXPOSURE / HEARTBEAT   │
│  API:  GET /api/risk/trend (最新值作为当前风险分)            │
│  字段:  后端无VaR/Beta字段，可用风险值映射                   │
├─────────────────────────────────────────────────────────────┤
│  区域: 风险趋势分析(Risk Trend Analysis)                     │
│  原型: 柱状图(14天风险值) + 1H/4H/1D切换                     │
│  API:  GET /api/risk/trend                                   │
│  字段:  data[].{date, value}                                 │
│  图表:  ECharts柱状图                                        │
├─────────────────────────────────────────────────────────────┤
│  区域: 资金流向(Capital Flow)                                │
│  原型: 行业资金流入流出横向条形图                            │
│  API:  GET /api/risk/fund-flow                               │
│  字段:  nodes[].name, links[].{source,target,value}          │
│  图表:  ECharts桑基图或横向条形图                            │
├─────────────────────────────────────────────────────────────┤
│  区域: 重大风险事件时间线(Major Risk Event Timeline)         │
│  原型: 卡片时间线(时间/标题/描述/标签)                       │
│  API:  GET /api/risk/events                                  │
│  字段:  time, title, desc, level, tags                       │
├─────────────────────────────────────────────────────────────┤
│  区域: AI策略评估(AI Strategy Assessment)                    │
│  原型: 文字评估 + 风险分数变化/置信度                        │
│  API:  GET /api/risk/ai-assessment                           │
│  字段:  返回文本字符串                                       │
├─────────────────────────────────────────────────────────────┤
│  区域: 系统性资金流向图(Systemic Flow Diagram)               │
│  原型: 桑基图(RETAIL_DESK/INST_FLOW → CORE_ALGO/HEDGE_OFS)   │
│  API:  GET /api/risk/fund-flow (同上)                        │
│  图表:  ECharts桑基图                                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.7 Trading (trading_terminal)

```
┌─────────────────────────────────────────────────────────────┐
│  TradingPage 交易终端                                        │
├─────────────────────────────────────────────────────────────┤
│  区域: 账户资金(Account Capital)                             │
│  原型: 总资产(NAV TOTAL)大数字 + 可用资金/持仓市值           │
│  API:  GET /api/simulation/account                           │
│  字段:  total_assets, balance, total_assets - balance        │
├─────────────────────────────────────────────────────────────┤
│  区域: K线图 + TDX_BRIDGE状态                                │
│  原型: 右侧K线(与QuotePage类似)                              │
│  API:  GET /api/stock_history/{code}                         │
│  字段:  data[]=[date,open,close,high,low,volume]             │
├─────────────────────────────────────────────────────────────┤
│  区域: 下单面板(MARKET/LIMIT)                                │
│  原型: 股票代码/数量输入 + BUY/SELL按钮                      │
│  API:  POST /api/simulation/trade                            │
│  字段:  stock_code, trade_type("buy"/"sell"), quantity       │
│  校验:  数量>=100, 买入为100整数倍                           │
├─────────────────────────────────────────────────────────────┤
│  区域: 活跃持仓(ACTIVE POSITIONS)                            │
│  原型: 表格(资产/类型/数量/入场价/市价/盈亏)                 │
│  API:  GET /api/simulation/account (positions字段)           │
│  字段:  positions[].{stock_code,stock_name,quantity,avg_price,current_price,market_value} │
│  计算:  盈亏 = (current_price - avg_price) * quantity        │
└─────────────────────────────────────────────────────────────┘
```

### 2.8 Quote Detail (quote_pop_up_detail)

```
┌─────────────────────────────────────────────────────────────┐
│  QuotePage 行情详情                                          │
├─────────────────────────────────────────────────────────────┤
│  区域: 股票标题                                              │
│  原型: 名称/代码/交易所/行业 + 价格/涨跌幅                   │
│  API:  GET /api/stock/quote/{code}                           │
│  字段:  code, close, 需结合search获取name/industry           │
├─────────────────────────────────────────────────────────────┤
│  区域: K线图(1D/1W/1M/ALL)                                   │
│  原型: 蜡烛图 + 成交量 + MA均线                              │
│  API:  GET /api/stock_history/{code}                         │
│  字段:  data[]=[date,open,close,high,low,volume]             │
│  图表:  ECharts K线+成交量组合图                             │
├─────────────────────────────────────────────────────────────┤
│  区域: 市场统计(MARKET STATS)                                │
│  原型: Open/Close/High/Low                                   │
│  API:  GET /api/stock/quote/{code}                           │
│  字段:  open, close, high, low, volume                       │
├─────────────────────────────────────────────────────────────┤
│  区域: 估值(VALUATION)                                       │
│  原型: Market Cap / P/E Ratio / Volume                       │
│  API:  后端无直接字段，需从screener查询获取                  │
│  状态:  ⚠️ 后端待补充                                        │
├─────────────────────────────────────────────────────────────┤
│  区域: 快捷交易按钮                                          │
│  原型: QUICK SELL / QUICK BUY                                │
│  API:  POST /api/simulation/trade                            │
│  动作:  点击跳转到TradingPage并预填代码                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.9 Settings (user_center_settings)

```
┌─────────────────────────────────────────────────────────────┐
│  SettingsPage 用户中心设置                                   │
├─────────────────────────────────────────────────────────────┤
│  区域: 左侧Tab导航                                           │
│  原型: Profile & Billing / Preferences / API Config / Security │
│  状态:  当前React实现为: 订阅/偏好/API管理/LLM配置/支持/日志/个人信息 │
├─────────────────────────────────────────────────────────────┤
│  区域: 订阅等级(Subscription Tiers)                          │
│  原型: Public($0) / Pro($49) / Premium($199)                │
│  API:  后端无订阅管理API                                     │
│  状态:  ⚠️ 前端静态展示                                      │
├─────────────────────────────────────────────────────────────┤
│  区域: 偏好设置(Preferences)                                 │
│  原型: 主题切换/系统托盘/交易提醒开关                        │
│  API:  后端无用户偏好存储API                                 │
│  状态:  ⚠️ 前端localStorage存储                              │
├─────────────────────────────────────────────────────────────┤
│  区域: API管理(API Management)                               │
│  原型: EXCHANGE PROVIDER / API KEY / SECRET HASH             │
│  API:  GET/POST /api/llm-config                              │
│  字段:  provider, model, api_key, base_url                   │
├─────────────────────────────────────────────────────────────┤
│  区域: 个人信息(Profile & Billing)                           │
│  原型: 用户名/邮箱/密码修改                                  │
│  API:  GET/PUT /api/user/profile                             │
│  字段:  username, email, old_password, new_password          │
├─────────────────────────────────────────────────────────────┤
│  区域: 支持(Support)                                         │
│  原型: FAQ列表                                               │
│  API:  无                                                    │
│  状态:  前端静态内容                                         │
├─────────────────────────────────────────────────────────────┤
│  区域: 日志(Logs)                                            │
│  原型: 操作日志列表                                          │
│  API:  GET /api/logs                                         │
│  字段:  line, content                                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.10 Login (auth_login_registration)

```
┌─────────────────────────────────────────────────────────────┐
│  LoginPage 登录/注册                                         │
├─────────────────────────────────────────────────────────────┤
│  区域: 登录表单                                              │
│  原型: TERMINAL ID / ACCESS KEY / AUTHENTICATE               │
│  API:  POST /api/login 或 /token                             │
│  字段:  username, password                                   │
│  动作:  登录成功存储token到localStorage                      │
├─────────────────────────────────────────────────────────────┤
│  区域: 注册入口                                              │
│  原型: "Switch to Register"                                  │
│  API:  POST /api/register                                    │
│  字段:  username, password, email                            │
├─────────────────────────────────────────────────────────────┤
│  区域: 第三方登录                                            │
│  原型: WeChat / Alipay                                       │
│  API:  后端无OAuth接口                                       │
│  状态:  ⚠️ 前端静态展示                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、对接状态总览

### 3.1 完全就绪 (✅ 可直接对接)
| 页面 | 数据区域 | API | 备注 |
|------|---------|-----|------|
| Dashboard | 市场指数 | `/market/indices` | 数据完整 |
| Dashboard | 涨幅榜 | `/market/top-gainers` | 数据完整 |
| Dashboard | 市场新闻 | `/news/latest` | 数据完整 |
| Dashboard | 市场温度 | `/market-temperature/latest` | 数据完整 |
| Dashboard | 账户持仓 | `/simulation/account` | 数据完整 |
| Dashboard | 自选分组 | `/watchlist` | 数据完整 |
| AI Insights | 雷达图+总结 | `/ai-insights/*` | 异步任务+轮询 |
| AI Insights | Alpha推荐 | `/alpha/recommend` | 免费限3条 |
| AI Insights | 仓位建议 | `/position-advice` | 异步任务 |
| Screener | 多因子筛选 | `/screener/query` | 数据完整 |
| Screener | 因子预设 | `/factors/presets` | CRUD完整 |
| Screener | K线图 | `/stock_history/{code}` | 数据完整 |
| Strategy | AI生成代码 | `/strategy/generate` | CrewAI驱动 |
| Strategy | 策略CRUD | `/strategy/*` | 完整CRUD |
| Backtesting | Agent管理 | `/agents/*` | 完整CRUD+启停 |
| Backtesting | 绩效曲线 | `/agents/{id}/performance` | 数据完整 |
| Trading | 账户信息 | `/simulation/account` | 数据完整 |
| Trading | 下单 | `/simulation/trade` | 含校验逻辑 |
| Trading | 交易记录 | `/simulation/records` | 数据完整 |
| Risk | 风险趋势 | `/risk/trend` | 14天数据 |
| Risk | 风险事件 | `/risk/events` | 静态示例 |
| Risk | AI评估 | `/risk/ai-assessment` | LLM驱动 |
| Risk | 资金流向 | `/risk/fund-flow` | 桑基图数据 |
| Quote | K线数据 | `/stock_history/{code}` | 数据完整 |
| Quote | 实时报价 | `/stock/quote/{code}` | 数据完整 |
| Settings | LLM配置 | `/llm-config` | 完整CRUD |
| Settings | 用户资料 | `/user/profile` | 完整CRUD |
| Settings | 日志 | `/logs` | 只读 |

### 3.2 需要适配 (⚠️ 字段映射或格式转换)
| 页面 | 数据区域 | 问题 | 解决方案 |
|------|---------|------|---------|
| Dashboard | 风险仪表盘 | 原型要求0-100分数，后端返回avg_change | 映射公式: risk_score = min(100, max(0, 50 + avg_change * 10)) |
| Dashboard | 新闻情感标签 | 原型有BULLISH/BEARISH/NEUTRAL标签 | 前端根据标题关键词推断情感，或统一显示为NEUTRAL |
| Screener | Score星级 | 原型有5星评分，后端无该字段 | 可用ROE/PE综合打分，或隐藏该列 |
| Screener | Sentiment情感条 | 原型有情感进度条 | 后端无该字段，可用change_pct映射或隐藏 |
| Backtesting | 回撤(Drawdown) | 原型显示回撤百分比 | 后端无该字段，需前端从performance曲线计算，或隐藏 |
| Backtesting | AI诊断横幅 | 原型有智能诊断提示 | 前端从Agent列表动态生成提示文本 |
| Risk | VaR / Beta | 原型显示VaR和Beta指标 | 后端无该字段，可隐藏或用风险值替代 |
| Quote | 估值数据 | 原型显示Market Cap / P/E | 后端无直接字段，可从screener查询或隐藏 |

### 3.3 后端缺失 (❌ 需后端补充或前端降级)
| 页面 | 数据区域 | 缺失内容 | 建议方案 |
|------|---------|---------|---------|
| Settings | 订阅管理 | 无订阅相关API | 前端静态展示，标注"即将上线" |
| Settings | 用户偏好 | 无偏好存储API | 使用localStorage本地存储 |
| Login | 第三方登录 | 无WeChat/Alipay OAuth | 隐藏第三方登录按钮 |
| Dashboard | 新闻图片 | 后端只返回文字 | 移除原型中的新闻配图占位 |
| Risk | 资金流向实时 | fund-flow为静态示例 | 保持现有静态数据，标注示例 |

---

## 四、对接实施优先级

### P0 - 核心功能 (必须首先完成)
1. **DashboardPage** - 首页是用户第一印象
2. **TradingPage** - 交易是核心功能
3. **LoginPage** - 认证是入口

### P1 - 高频功能 (第二批次)
4. **AiInsightsPage** - AI是产品卖点
5. **ScreenerPage** - 选股是日常操作
6. **QuotePage** - 行情查询高频

### P2 - 进阶功能 (第三批次)
7. **StrategyPage** - 策略生成
8. **BacktestingPage** - Agent管理
9. **RiskPage** - 风控监控

### P3 - 辅助功能 (最后批次)
10. **SettingsPage** - 系统设置

---

## 五、关键技术决策

### 5.1 数据绑定策略
采用 **DOM选择器映射 + 运行时注入**，不修改原型HTML结构：

```typescript
// 每个页面定义选择器映射表
const DashboardSelectors = {
  indices: '.index-card',           // 指数卡片
  positions: '[data-tab="holding"] tbody tr', // 持仓行
  watchlist: '.watch-group',        // 自选分组
  gainers: '.gainer-card',          // 涨幅卡片
  news: '.news-item',               // 新闻项
};

// 绑定函数通过选择器定位并注入数据
function bindIndices(container: HTMLElement, indices: MarketIndex[]) {
  const cards = container.querySelectorAll(DashboardSelectors.indices);
  cards.forEach((card, i) => {
    const data = indices[i];
    if (!data) return;
    // 注入数据...
  });
}
```

### 5.2 异步任务处理 (AI洞察/仓位建议)
```typescript
// 1. 触发任务
const { task_id } = await api.runAiInsights();

// 2. 轮询结果
const result = await poll(
  () => api.getAiInsightsResult(task_id),
  (r) => r.status === 'done',
  2000,  // 每2秒轮询
  120000 // 最多2分钟
);

// 3. 绑定到UI
bindAiRadar(container, result.dimensions);
```

### 5.3 错误降级策略
| 错误类型 | 处理方式 |
|---------|---------|
| 网络断开 | 显示"后端连接失败，请检查网络" |
| 401未授权 | 自动跳转登录页 |
| 数据为空 | 保留UI骨架，显示"暂无数据" |
| 字段缺失 | 隐藏对应UI元素或显示"-" |

---

*文档版本: v2.0*  
*更新日期: 2025-01-27*  
*状态: 接口映射完成，待实施*
