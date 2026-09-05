## ADDED Requirements

### Requirement: ScreenerPage 初始查询代码从后端获取
ScreenerPage SHALL 在初始化时从后端获取初始股票代码，不得硬编码为固定值。

#### Scenario: 成功获取初始代码
- **WHEN** 页面挂载时
- **THEN** 系统从 `/watchlist` 取第一个股票代码作为初始趋势查询目标

#### Scenario: 自选列表为空时的 fallback
- **WHEN** `/watchlist` 返回空列表或请求失败
- **THEN** 系统使用 `"000001"` 作为默认初始代码
