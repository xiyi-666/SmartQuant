## ADDED Requirements

### Requirement: LLM 提供商配置
用户 SHALL 能在 SettingsPage 配置 LLM 提供商、模型、API Key 和 base_url。

#### Scenario: 保存配置
- **WHEN** 用户填写 LLM 配置并保存
- **THEN** 调用 POST /api/llm-config，配置存入数据库

#### Scenario: 加载配置
- **WHEN** 用户进入设置页
- **THEN** 调用 GET /api/llm-config 并回填表单

### Requirement: 支持多提供商
系统 SHALL 支持 OpenAI、Anthropic Claude、Google Gemini 及自定义 OpenAI Compatible 接口。

#### Scenario: 自定义接口
- **WHEN** 用户选择"自定义"提供商并填写 base_url
- **THEN** CrewAI 使用该 base_url 初始化 LLM 客户端

### Requirement: 配置验证
系统 SHALL 在保存前验证 LLM 配置可用性。

#### Scenario: 验证失败
- **WHEN** API Key 无效或 base_url 不可达
- **THEN** 显示错误提示，不保存配置
