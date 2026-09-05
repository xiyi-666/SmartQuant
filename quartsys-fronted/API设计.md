# API设计（前端联调约定）

## 背景

控制面板（Dashboard）新增交互需求：

- 持仓 / 自选 点击后查看股票走势（弹窗）
- 涨幅榜 / 行业龙头 点击后查看股票走势（弹窗）
- 市场情报 点击后查看新闻详情（弹窗，类似公众号文章详情）

其中**股票走势接口不新增后端接口**，直接复用选股器已使用接口。

---

## 1. 股票查询与走势接口（复用现有）

### 1.1 搜索股票

- Method: `GET`
- Path: `/search`
- Query: `q` (string)
- 前端封装：`api.searchStocks(q)`

用途：

- 在控制面板弹窗中可用于代码/名称补全（如后续扩展）

### 1.2 股票历史走势（ECharts）

- Method: `GET`
- Path: `/stock_history/{code}`
- Path Param: `code`（如 `600875.SH`、`002594.SZ`、`300750.SZ`）
- 前端封装：`api.getStockHistory(code)`

用途：

- 控制面板中持仓/自选、涨幅榜/行业龙头卡片点击后，弹窗内展示 K 线/收盘线走势
- 与选股器使用同一数据源和解析逻辑，保持一致

建议代码规范：

- 6 位数字代码统一补交易所后缀：
  - `60/68/90` 开头 -> `.SH`
  - 其他 -> `.SZ`

---

## 2. 新闻详情接口（建议）

> 当前页面可先使用静态模拟详情；若后端提供新闻库，建议按如下接口联调。

### 2.1 新闻列表

- Method: `GET`
- Path: `/news`
- Query（可选）：
  - `category`：如 `all` / `ai_signal`
  - `limit`：条数

返回示例：

```json
[
  {
    "id": "news_20260408_001",
    "title": "PBOC maintains key policy rates, markets react with cautious optimism.",
    "event": "央行政策利率维持不变",
    "author": "QUANT_OS 市场组",
    "summary": "The central bank's decision...",
    "published_at": "2026-04-08 14:22:15",
    "tag": "BULLISH"
  }
]
```

### 2.2 新闻详情

- Method: `GET`
- Path: `/news/{id}`

返回示例：

```json
{
  "id": "news_20260408_001",
  "title": "PBOC maintains key policy rates, markets react with cautious optimism.",
  "event": "央行政策利率维持不变",
  "author": "QUANT_OS 市场组",
  "content": "完整新闻正文...",
  "published_at": "2026-04-08 14:22:15",
  "tag": "BULLISH"
}
```

用途：

- 控制面板“市场情报”标题点击后，弹窗展示类似公众号详情页：标题、事件、通讯作者、正文

---

## 3. 前端实现约定

- 交互统一采用弹窗（Modal）
- 股票弹窗统一使用 ECharts 渲染走势图
- 若 `stock_history` 暂无数据：显示“无数据”提示，不中断 UI
- 中英文切换通过现有 `EN/中文` 按钮处理

---

## 4. 当前前端已接入 API（src/api.ts）

已存在且可直接复用：

- `api.searchStocks(q)` -> `/search`
- `api.getStockHistory(code)` -> `/stock_history/{code}`

无需新增股票相关后端接口。
