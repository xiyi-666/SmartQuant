## 1. 基础设施与依赖

- [ ] 1.1 后端 requirements.txt 新增 crewai、crewai-tools 依赖
- [ ] 1.2 创建 quartsys-backend/crews/ 目录结构
- [ ] 1.3 数据库新增表：ai_insight_tasks、market_temperature、alpha_recommendations、position_advice、llm_config、user subscription 字段

## 2. LLM 配置系统

- [ ] 2.1 后端实现 GET/POST /api/llm-config 接口
- [ ] 2.2 实现 LLM 工厂函数，根据配置动态初始化 CrewAI LLM（openai/anthropic/gemini/custom）
- [ ] 2.3 重写 SettingsPage.tsx，实现独立 Tab 布局（Subscription / Preferences / API Management / LLM Config）
- [ ] 2.4 Subscription Tab：套餐展示 + 与 user.subscription 字段后端对接
- [ ] 2.5 Preferences Tab：主题切换（深色/浅色）+ 偏好持久化
- [ ] 2.6 API Management Tab：Exchange Provider / API Key / Secret Hash 保存
- [ ] 2.7 LLM Config Tab：provider 下拉 / model / api_key / base_url（custom时显示）
- [ ] 2.8 LLM Config Tab：连接测试按钮，验证配置可用性

## 3. 筛选页（ScreenerPage）增强

- [ ] 3.1 后端筛选接口支持 AND/OR 逻辑参数（修改 POST /api/screener/query）
- [ ] 3.2 后端支持历史日期筛选（date 参数回填）
- [ ] 3.3 前端实现4个条件的 AND/OR 逻辑切换 UI
- [ ] 3.4 前端实现高级参数面板（MA周期/偏离阈值/放量倍数/连阴天数/斜率阈值）
- [ ] 3.5 前端 K 线图本地计算 MA5/MA10/MA20/MA30/MA60 并渲染
- [ ] 3.6 前端 K 线成交量子图涨红跌绿柱状图，默认显示最近126个交易日
- [ ] 3.7 前端 K 线叠加交易买卖点 Pin 标注，调用 GET /api/simulation/records?code=
- [ ] 3.8 前端实现批量勾选股票并加入自选（选择目标分组）
- [ ] 3.9 前端自选模式下查看 K 线 + 移除自选按钮
- [ ] 3.10 前端策略保存对话框（策略名输入），调用 POST /api/factors/presets
- [ ] 3.11 前端策略加载下拉，调用 GET /api/factors/presets 回填表单

## 4. 模拟交易页前端对接

- [ ] 4.1 重写 TradingPage.tsx，移除 ReplicaPage 依赖
- [ ] 4.2 实现账户信息栏（总资产/余额/持仓市值）调用 GET /api/simulation/account
- [ ] 4.3 实现持仓列表组件（代码/名称/数量/均价/现价/盈亏）
- [ ] 4.4 实现下单面板（股票代码搜索 + 数量输入 + 买入/卖出按钮）
- [ ] 4.5 实现交易记录 Tab，调用 GET /api/simulation/records
- [ ] 4.6 实现错误处理（余额不足/T+1限制提示）

## 5. 行情详情页前端对接

- [ ] 5.1 重写 QuotePage.tsx，支持 URL 参数 ?code= 传入股票代码
- [ ] 5.2 实现行情头部卡片（名称/代码/最新价/涨跌幅/成交量）
- [ ] 5.3 实现 ECharts K线图 + 成交量子图，调用 GET /api/stock_history/{code}
- [ ] 5.4 无参数时展示搜索框，调用 GET /api/search?q=
- [ ] 5.5 ScreenerPage 股票点击跳转至 /quote?code=XXXXXX

## 6. 市场总览页（DashboardPage）

- [ ] 6.1 实现市场指数展示，调用 GET /api/market/indices
- [ ] 6.2 实现个人持仓列表，调用 GET /api/simulation/account
- [ ] 6.3 实现自选股分组展示 + 新增分组，调用 GET/POST /api/watchlist
- [ ] 6.4 实现风险看板数据展示，调用 GET /api/risk/analysis
- [ ] 6.5 后端实现 GET /api/market/top-gainers?date= 涨幅榜与行业龙头接口
- [ ] 6.6 前端实现涨幅榜日期筛选，默认5条 + 子窗口查看全部
- [ ] 6.7 实现市场资讯列表，调用 GET /api/news/latest
- [ ] 6.8 后端实现 GET /api/news/latest（akshare 新闻接口封装）
- [ ] 6.9 实现 AI 信号 Tab，调用 GET /api/screener/signals

## 7. AI洞察 - AI动态分析模块

- [ ] 7.1 创建 crews/ai_insights_crew.py（5个维度Agent：政策/资金/情绪/全球/经济）
- [ ] 7.2 后端实现 POST /api/ai-insights/run 和 GET /api/ai-insights/result/{task_id}
- [ ] 7.3 后端实现 GET /api/ai-insights/history
- [ ] 7.4 后端配置每小时定时任务触发 AI 分析
- [ ] 7.5 前端实现雷达图（ECharts，5维度评分）
- [ ] 7.6 前端实现左侧摘要和分析列表展示

## 8. AI洞察 - 市场温度计模块

- [ ] 8.1 后端实现市场温度计计算逻辑（涨跌家数/平均涨跌幅/上涨下跌个股均幅）
- [ ] 8.2 后端实现 POST /api/market-temperature/calculate 和 GET /api/market-temperature/latest
- [ ] 8.3 后端配置开盘时段（09:30-15:00）每30分钟定时任务
- [ ] 8.4 前端实现风格箱热力图（价值/成长 × 大盘/中盘/小盘，ECharts heatmap）

## 9. AI洞察 - 策略Alpha推荐模块

- [ ] 9.1 后端实现 POST /api/alpha/recommend（策略选股 + 前10推荐计算）
- [ ] 9.2 后端 User 表新增 subscription 字段，实现订阅权限校验
- [ ] 9.3 前端实现策略选择器下拉框
- [ ] 9.4 前端实现卡片轮播（默认3张，左右滑动，含股票/星级/AI逻辑/买入止损目标价）
- [ ] 9.5 前端实现加入自选按钮，调用 POST /api/watchlist
- [ ] 9.6 前端实现权限锁定卡片展示（第4张起显示锁定状态）

## 10. AI洞察 - 仓位配置与战术观点模块

- [ ] 10.1 创建 crews/tactical_advice_crew.py（进攻/防御/中性 Agent）
- [ ] 10.2 后端实现 GET /api/position-advice（仓位建议计算）
- [ ] 10.3 后端实现 POST /api/tactical-advice/run 和 GET /api/tactical-advice/result/{task_id}
- [ ] 10.4 前端实现三栏战术展示（进攻行业/防御行业/中性评估）
- [ ] 10.5 前端实现仓位建议可视化（仪表盘或进度条）

## 11. 策略编辑页（StrategyPage）

- [ ] 11.1 后端数据库新增 strategies 表（name/params_json/code/created_at）
- [ ] 11.2 后端实现 POST /api/strategy/generate（AI生成策略代码）
- [ ] 11.3 后端实现 POST /api/strategy/test（策略代码沙箱测试）
- [ ] 11.4 后端实现 POST /api/strategy/save 和 GET /api/strategy/list
- [ ] 11.5 重写 StrategyPage.tsx：左侧 AI 对话 + 参数组合选择器
- [ ] 11.6 前端实现右侧代码编辑器（Monaco Editor 或 CodeMirror）
- [ ] 11.7 前端实现复制/下载/测试/保存按钮

## 12. 回测分析页（BacktestingPage）

- [ ] 12.1 后端实现 POST /api/agents（创建回测 Agent）
- [ ] 12.2 后端实现 POST /api/agents/{id}/stop 和 GET /api/agents
- [ ] 12.3 后端实现 GET /api/agents/{id}/performance（策略涨跌曲线数据）
- [ ] 12.4 重写 BacktestingPage.tsx：顶部统计面板（涨跌曲线 + 收益排行）
- [ ] 12.5 前端实现 Agent 列表管理（状态/启动/停止/删除）
- [ ] 12.6 前端实现策略选择器，调用 GET /api/strategy/list

## 13. 风险监控页（RiskPage）

- [ ] 13.1 后端实现 GET /api/risk/trend（风险值历史，每小时更新）
- [ ] 13.2 后端实现 GET /api/risk/events（重大风险事件时间线）
- [ ] 13.3 后端实现 GET /api/risk/ai-assessment（AI策略评估）
- [ ] 13.4 后端实现 GET /api/risk/fund-flow（资金流向数据）
- [ ] 13.5 重写 RiskPage.tsx：风险趋势柱形图（ECharts bar，每小时刷新）
- [ ] 13.6 前端实现经济指数表现统计，调用 GET /api/market/indices
- [ ] 13.7 前端实现风险事件时间线卡片展示
- [ ] 13.8 前端实现 AI 策略评估模块
- [ ] 13.9 前端实现资金流向图（ECharts sankey 或 flow 图）

## 14. AppShell 导航优化

- [ ] 13.1 移除 AppShell 侧边栏底部"NEW_STRATEGY"按钮
- [ ] 13.2 SettingsPage 新增 Support Tab（帮助与支持内容）
- [ ] 13.3 SettingsPage 新增 Logs Tab（系统操作日志列表，调用 GET /api/logs）
- [ ] 13.4 后端实现 GET /api/logs 接口（记录用户操作日志）

## 14. 通知系统与个人信息

- [ ] 14.1 后端实现 GET /api/notifications 和 POST /api/notifications/read
- [ ] 14.2 前端顶部通知铃铛实现下拉消息列表（未读数角标）
- [ ] 14.3 前端实现消息已读/全部已读功能
- [ ] 14.4 SettingsPage 新增 Profile Tab（头像/用户名/邮箱/密码修改）
- [ ] 14.5 后端实现 PUT /api/user/profile 接口
