## ADDED Requirements

### Requirement: AI对话生成策略代码
左侧 SHALL 提供与 AI 对话的界面，基于选股参数生成策略逻辑代码。

#### Scenario: 选择参数组合
- **WHEN** 用户选择某个参数组合
- **THEN** 参数自动填入对话上下文，AI 基于该参数生成策略代码

#### Scenario: 生成策略代码
- **WHEN** 用户发送对话请求
- **THEN** 调用 POST /api/strategy/generate，返回策略逻辑代码显示在右侧编辑器

### Requirement: 策略代码测试
右侧 SHALL 提供策略代码测试功能，验证策略能否正常运行。

#### Scenario: 运行测试
- **WHEN** 用户点击"测试运行"
- **THEN** 调用 POST /api/strategy/test，返回运行结果（成功/失败/错误信息）

### Requirement: 复制与下载策略
用户 SHALL 能复制策略代码到剪贴板或下载为文件。

#### Scenario: 复制代码
- **WHEN** 用户点击"复制"
- **THEN** 策略代码复制到剪贴板

#### Scenario: 下载代码
- **WHEN** 用户点击"下载"
- **THEN** 浏览器下载 .py 格式策略文件

### Requirement: 保存策略
用户 SHALL 能将参数组合与策略代码一起保存，供回测页调用。

#### Scenario: 保存策略
- **WHEN** 用户点击"保存策略"并输入名称
- **THEN** 调用 POST /api/strategy/save，将参数组合 + 代码存入数据库

#### Scenario: 回测页调用
- **WHEN** 用户在 BacktestingPage 选择策略
- **THEN** 调用 GET /api/strategy/list 获取已保存策略列表
