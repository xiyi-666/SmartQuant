## Why

当前项目的前后端“接口是否存在”问题基本已经解决，但“接口是否真正可用于现有 UI”仍存在明显缺口。现状包括前端 API 基址自动探测本地端口、多个页面仍保留 demo/fallback 运营数据，以及后端风险、通知、策略生成、Agent 生命周期等接口仍依赖硬编码、随机值或占位实现，导致页面展示与真实后端状态不一致。

当前最高优先级不是扩展新功能，而是确保现有 UI 不发生大改、后端联接稳定不出错、用户可见的基本功能全部可靠可用，并将已知高风险问题纳入自动化修复与自动化回归检查范围，避免修一处坏一处。

在不改变现有前端 UI 结构、样式和交互布局的前提下，需要把这些剩余联接缺口补齐，让每个现有页面都基于真实后端数据、真实用户上下文和可追踪的错误状态运行，而不是继续混用示例数据与占位逻辑。

## What Changes

- 以“现有 UI 不变”为最高硬约束，梳理并补齐 Dashboard、AI Insights、Backtesting、Risk、Trading、Settings 等页面仍在使用的 demo/fallback/占位数据源。
- 以“后端联接稳定不出错”为第一目标，优先清理字段契约错误、API 基址漂移、JWT 用户态错位、日志与通知等绕过统一封装的调用路径。
- 以“基本功能先完整可用”为交付底线，优先保障登录、首页数据、风险页、交易页、回测页、设置页核心读写链路闭环。
- 明确由后端适配现有前端消费 DTO，而不是通过改前端视觉结构或页面层字段猜测来迁就接口漂移。
- 收敛前端 API 基址解析逻辑，移除打包行为里的硬编码本地端口探测，改为显式配置优先的稳定联接策略。
- 移除后端已暴露接口中的硬编码、随机值与静态占位返回，尤其是风险趋势、风险事件、资金流向、策略生成失败路径、Alpha 推荐降级路径和 Agent start/stop 生命周期。
- 将用户资料、Agent、通知等运行态数据切换到 JWT 用户上下文，去除 `user_id=1` 和内存通知列表等单用户/单进程假设。
- 为关键页面定义成功、空态、失败三类响应语义，以及六个 P0 页面允许的空态表现，确保前端保持现有布局但不再展示伪业务数据。
- 为高风险对接点补充自动化修复防线，包括字段契约检查、联调冒烟脚本、关键接口回归测试和页面空态/错误态验证。
- 补充联接验证与文档更新，形成“页面 -> API -> 数据来源 -> 降级行为”的可执行核对清单，确保后续实施不引入 UI 回归。

## Capabilities

### New Capabilities
- `ui-stable-page-binding`: 在不改变现有页面视觉结构的前提下，将剩余运营数据面板切换为真实 API 驱动，并使用加载/空态/错误态替代 demo 数据。
- `integration-config-hardening`: 将前端 API 联接地址、后端 JWT 密钥和示例配置改为显式配置驱动，移除源码中的硬编码运行地址和敏感默认值。
- `backend-placeholder-elimination`: 将当前 UI 依赖的后端占位实现替换为真实计算、持久化结果或前端可消费的稳定 DTO / 结构化失败响应，不再返回随机/静态/伪造业务数据。
- `authenticated-user-runtime-state`: 将 profile、agent、notification 等运行态能力绑定到真实登录用户，并保证通知与读状态可持久化。

### Modified Capabilities

## Impact

- 前端：`quartsys-fronted/src/api.ts`、`quartsys-fronted/src/pages/*.tsx`、`quartsys-fronted/src/shared/*.ts`
- 文档与配置：`quartsys-fronted/docs/FRONTEND_BACKEND_INTEGRATION.md`、`quartsys-fronted/.env.example`、`quartsys-fronted/README.md`
- 后端：`quartsys-backend/main.py` 以及与通知、风控快照、用户上下文相关的数据模型/辅助函数
- 自动化保障：关键接口契约检查、冒烟验证脚本、页面级空态/错误态回归测试
- 数据与运行环境：JWT/LLM/API 基址配置、通知持久化、风险快照或同类持久化数据表、Agent 后台执行状态
