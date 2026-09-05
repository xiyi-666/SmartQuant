## ADDED Requirements

### Requirement: 个人资料接口必须绑定当前登录用户
系统 SHALL 基于 JWT 中的当前用户上下文读取和更新 profile，而不是固定操作单一用户记录。

#### Scenario: 已登录用户读取个人资料
- **WHEN** 已认证用户调用 `/api/user/profile`
- **THEN** 系统返回该用户自己的用户名和邮箱，而不是固定用户或默认管理员资料

#### Scenario: 已登录用户更新个人资料
- **WHEN** 已认证用户提交 profile 更新请求
- **THEN** 系统只修改该用户自己的资料，并沿用统一密码哈希策略校验旧密码和写入新密码

### Requirement: 通知中心必须为用户提供持久化读状态
系统 SHALL 为通知列表和已读状态提供与用户绑定的持久化存储，不得依赖进程内全局列表。

#### Scenario: 获取通知列表
- **WHEN** 已登录用户调用 `/api/notifications`
- **THEN** 系统返回该用户的通知列表及其已读状态，服务重启后结果仍然存在

#### Scenario: 标记通知已读
- **WHEN** 已登录用户调用 `/api/notifications/read`
- **THEN** 系统持久化更新对应通知或全部通知的已读状态，后续请求可见相同结果

### Requirement: 用户运行态数据必须按登录用户隔离
系统 SHALL 让 Agent、通知和后续依赖用户身份的运行态数据按当前登录用户隔离，避免多个用户共享同一运行态记录。

#### Scenario: 创建 Agent
- **WHEN** 已登录用户调用 `/api/agents`
- **THEN** 新建 Agent 记录绑定当前用户，而不是固定写入默认用户 ID

#### Scenario: 多用户分别查看运行态数据
- **WHEN** 不同用户分别查询自己的 Agent 或通知数据
- **THEN** 系统仅返回各自所属记录，不泄露其他用户的运行态信息

### Requirement: Agent 运行状态必须遵循显式状态机
系统 SHALL 为 Agent 运行态暴露稳定状态机和值班字段，至少包括 `stopped`、`pending`、`running`、`stopping`、`failed`、`completed` 六种状态，以及 `status_reason`、`updated_at`、`last_run_at?`、`last_error?` 等辅助字段。

#### Scenario: 查询 Agent 列表或详情
- **WHEN** 已登录用户读取自己的 Agent 列表或单个 Agent
- **THEN** 每条记录都返回枚举状态和对应的时间/原因字段，使前端能够在不改 UI 结构的前提下展示真实运行态

#### Scenario: Agent 启动失败或运行异常
- **WHEN** Agent 启动失败、运行时抛错或停止流程异常
- **THEN** 系统将状态更新为 `failed` 或保留在 `stopping` 后的明确结果状态，并填充 `last_error`、`status_reason`、`updated_at`
