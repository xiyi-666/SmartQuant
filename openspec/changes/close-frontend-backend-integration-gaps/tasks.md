## 0. P0 优先清理清单

- [ ] 0.1 固化最高约束：后续修复不得大改现有 UI 结构，只允许调整数据绑定、状态处理和必要的局部展示
- [ ] 0.2 固化“后端适配前端消费 DTO”原则，明确不得以改前端视觉结构或页面层字段猜测来解决接口漂移
- [ ] 0.3 统一关键接口成功 / 空态 / 失败响应语义，并形成可执行 DTO 契约清单
- [ ] 0.4 修正 `RiskPage` 与 `/api/risk/trend` 的字段契约错误，统一趋势数值字段为 `value` 并补自动化校验
- [ ] 0.5 定义 `/api/simulation/account` 最小 DTO 字段集，并核对 Trading / Dashboard 相关资产展示的消费契约
- [ ] 0.6 打通 JWT current user 到 profile、agent、notification 的真实用户闭环，移除 `user_id=1` 和固定 profile 用户假设
- [ ] 0.7 清理 Dashboard、Risk、Trading、Backtesting、AI Insights、Settings 中会掩盖真实问题的 fallback / demo / mock 业务数据，并建立主流程冒烟检查

## 1. 配置与联接基线收敛

- [ ] 1.1 收敛 `quartsys-fronted/src/api.ts` 的 API 基址解析逻辑，改为显式配置优先并限制本地开发兜底范围
- [ ] 1.2 统一日志和辅助请求也走 `quartsys-fronted/src/api.ts` 或共享 client 封装，消除 Settings 页直接 `fetch` 带来的联接分叉
- [ ] 1.3 清理 `quartsys-fronted/.env.example`、`quartsys-fronted/README.md` 中的真实密钥和误导性默认地址，改为安全占位值
- [ ] 1.4 将 `quartsys-backend/main.py` 中的 `SECRET_KEY` 迁移为环境变量或部署配置读取
- [ ] 1.5 为前后端联调补充统一的配置说明、日志路径约定和配置错误提示语义

## 2. 用户上下文与运行态隔离

- [ ] 2.1 为后端补齐从 JWT 解析 current user 的公共依赖，并接入 profile、agent、notification 相关接口
- [ ] 2.2 重构 `/api/user/profile` 读写逻辑，移除 `user.id=1` 假设并统一密码哈希方案
- [ ] 2.3 为通知能力新增持久化存储模型或表结构，替换内存 `_notifications` 列表
- [ ] 2.4 调整 `/api/agents` 创建与查询逻辑，使 Agent 记录绑定真实登录用户并按用户隔离返回
- [ ] 2.5 为 Agent 定义稳定状态机枚举与辅助字段（`status_reason`、`updated_at`、`last_run_at`、`last_error`），并统一列表 / 详情返回契约

## 3. 后端占位实现清理

- [ ] 3.1 重构 `/api/risk/trend`，移除随机值生成逻辑并输出当前 Risk 页面可直接消费的稳定 DTO
- [ ] 3.2 重构 `/api/risk/events`，移除静态示例事件并改为真实规则生成或结构化空态
- [x] 3.3 重构 `/api/risk/fund-flow`，移除静态桑基图节点并接入真实计算结果或可解释空态
- [x] 3.4 收敛 `/api/risk/ai-assessment` 的降级行为，失败时返回结构化失败而非伪业务文案
- [ ] 3.5 重构 `/api/strategy/generate` 失败路径，移除 `TODO` 占位代码返回
- [ ] 3.6 审核 `/api/alpha/recommend` 的降级逻辑，确保空结果或失败原因可被前端明确消费
- [ ] 3.7 补齐 `/api/simulation/account` 最小字段集、空持仓语义和资产汇总字段，确保前端无需补字段
- [x] 3.8 为 `/api/agents/{id}/start` 和 `/api/agents/{id}/stop` 增加可观测后台执行状态、停止语义和失败原因

## 4. 前端页面数据绑定替换

- [ ] 4.1 清理 `DashboardPage.tsx` 中的指数、个股、涨幅榜、新闻静态 fallback，改为空态或真实返回
- [ ] 4.2 清理 `RiskPage.tsx` 中的 `figmaEvents`、`figmaAiAssessment`、`figmaFundFlow` 等静态业务块，改为真实结果或空态
- [ ] 4.3 清理 `TradingPage.tsx` 中的 Figma demo positions，改为真实持仓或空态
- [ ] 4.4 清理 `BacktestingPage.tsx` 中的 `fallbackRankings`，改为空态 / 错误态展示
- [ ] 4.5 清理 `AiInsightsPage.tsx` 中仅用于视觉补位的推荐卡 fallback，改为真实结果或空态
- [ ] 4.6 清理 `SettingsPage.tsx` 中的 `MOCK_LOGS` 和绕过统一封装的日志请求路径
- [ ] 4.7 为 Dashboard、Risk、Trading、Backtesting、AI Insights、Settings 统一补充 loading、empty、error 三类状态，确保现有 UI 结构不变
- [ ] 4.8 统一六个关键页面在 401/403 鉴权失效场景下的展示语义，禁止回退到匿名示例数据

## 5. 自动化修复与验证

- [x] 5.1 为关键接口增加字段契约检查，覆盖 `risk/trend`、`simulation/account`、profile、notification、agent、`strategy/generate` 等高风险返回结构
- [x] 5.2 将 API 字段契约测试设为第一道自动化门禁，优先阻断 DTO 漂移
- [ ] 5.3 建立 `登录 -> Dashboard` 主流程自动化冒烟，作为第二道自动化门禁
- [ ] 5.4 建立 Dashboard、Risk、Trading、Backtesting、AI Insights、Settings 六个关键页面的空态 / 错误态 / 未授权回归检查，作为第三道自动化门禁
- [ ] 5.5 为 profile、notification、risk、agent lifecycle 和 `strategy/generate` 增加最小可回归测试或脚本验证
- [x] 5.6 更新 `quartsys-fronted/docs/FRONTEND_BACKEND_INTEGRATION.md`，标记已清理与仍待处理的联接缺口
- [ ] 5.7 记录剩余外部数据源依赖、部署配置项和上线前检查清单，避免后续联调阶段重复踩坑
