# AIQuartSmart Community Edition Backend

[简体中文](#简体中文) · [繁體中文](#繁體中文) · [English](#english)

本文件将后端部署、数据源和数据更新说明集中在一个文档中。点击上方语言即可跳转。

## 简体中文

这是面向自部署量化研究社区版的 FastAPI 后端，提供本地 API、数据 Provider、因子研究、策略回测和模拟交易。后端不会默认连接项目生产数据网关，也不托管模型服务。

## 功能范围

- 由部署者配置的市场行情和证券搜索
- Mock、CSV 及用户自定义 Provider
- 因子预设、自定义因子、选股和策略模板
- 本地回测与基础绩效指标
- 模拟账户、交易记录和可配置佣金规则
- 用户自定义风险指标及可选的自有 AI 接口
- 演示模式和动画新手引导

官方 AI 洞察、智能研究、AI 分析师、官方 AI 风险评估、支持工单和托管式第三方研究在社区部署中停用。源码可保留兼容接口，但不需要生产凭据或私有网关。

## 环境要求

- Python 3.10 或更高版本
- 本地使用 SQLite；共享部署可使用 PostgreSQL
- 仅在启用持久任务队列时需要 Redis

## 本地启动

```bash
cd quartsys-backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 18427
```

API 地址为 `http://127.0.0.1:18427`。首次创建数据库时可设置 `QUARTSYS_RUN_STARTUP_MIGRATIONS=1`。

## 环境变量

请从 `.env.example` 开始，至少修改：

- `DATABASE_URL`：SQLite 或 PostgreSQL 连接地址
- `SECRET_KEY`：本部署专用的随机长密钥
- `QUARTSYS_COMMUNITY_EDITION=1`：保持社区版受限接口关闭
- `QUARTSYS_DATA_ADAPTER_MODULE`：可选的用户自有行情适配器模块

模型密钥、Provider 凭据和服务地址只保存在部署环境中，不要写入 React 源码、CSV 或 API 响应。

## 数据源模式

请求路径如下：

```text
你的部署环境 → 你配置的 Provider → 第三方服务
                         → AIQuartSmart Community Edition API 与界面
```

社区版不会默认连接项目生产数据网关。启用 Provider 前，请确认其服务条款、认证方式、限流、署名、缓存和使用限制。Mock 与 CSV 适合离线开发和测试。

## CSV 证券池导入

社区版使用 `import_security_universe.py` 导入用户维护的 A 股、港股、美股、ETF、基金、REIT、债券和可转债证券池。工具只写入本地数据库，不包含行情抓取或定时更新逻辑。

```csv
code,name,industry,area,board,asset_type
600519,贵州茅台,白酒,中国,主板,stock
hk00700,腾讯控股,互联网服务,香港,港股,stock
usAAPL,Apple,Technology,United States,NASDAQ,stock
510300,沪深300ETF,指数基金,中国,ETF,etf
fund:000001,示例基金,混合基金,中国,基金,fund
```

将 CSV 放在任意本地路径，并通过 `import_security_universe.py --file` 导入。

```bash
python import_security_universe.py --file ./path/to/your-universe.csv
```

开放式基金可使用 `fund:<code>`，信托可使用 `trust:<id>`，避免与股票代码冲突。

## API 概览

常用接口：

- `GET /api/health/live`、`GET /api/health/ready`
- `POST /api/register`、`POST /api/login`
- `GET /api/stock/quote/{code}`、`GET /api/stock_history/{code}`
- `GET /api/results`、`POST /api/screen`
- `GET|POST /api/factors/*`
- `GET|POST /api/strategy/*`
- `GET|POST /api/simulation/*`
- `GET /api/market/*`

本地开发时 FastAPI OpenAPI 位于 `/docs`。

## 佣金设置

佣金公式为 `max(成交金额 × 费率, 最低佣金)`。界面使用万分比，填 `1` 代表万 1（0.01%）。模拟交易默认费率为 1、最低佣金为 5 元；管理员可按市场调整，最低佣金设为 0 即按实际费率计算。

## 演示模式与新手引导

两者相互独立且默认开启。管理员可在站点设置中指定测试账号并分别开关。演示账号的相同请求会优先使用浏览器缓存，减少重复调用 AI；新手引导使用步骤动画，可跳过、返回或完成。

## 测试

```bash
python -m unittest discover -s tests -p "test_contract_*.py"
python -m py_compile main.py
```

如需稳定性测试，请使用临时 SQLite 数据库并关闭任务队列和调度器，不要连接生产库。

## 安全与数据责任

部署者负责 Provider 授权、凭据、保存期限、限流、第三方条款以及向用户展示的数据。不要提交 API Key、Cookie、受限数据文件、支付密钥或生产网址。本软件用于研究和模拟交易，不构成投资建议或真实交易系统。

## 许可证

源代码采用 [Apache License 2.0](../LICENSE)。Provider 返回的数据、服务名称、商标、图标和 Logo 仍受其权利人条款约束。

---

## 繁體中文

這是可自託管量化研究社群版的 FastAPI 後端，提供本地 API、資料來源介面、因子研究、策略回測與模擬交易。後端不包含專案營運的資料閘道或託管模型服務。

## 功能範圍

- 依部署者設定的市場行情與證券搜尋
- Mock、CSV 及自行撰寫的資料 Provider
- 因子預設、客製因子、選股與策略範本
- 本地回測及基本績效指標
- 模擬帳戶、交易紀錄與可設定佣金規則
- 使用者自訂風險指標及可選的自有 AI 整合
- 演示模式與動畫新手引導設定

官方 AI 市場洞察、智能研究、AI 分析師、官方 AI 風險評估、支援工單及託管第三方研究在社群部署中停用。原始碼可保留相容介面，但不需要生產憑證或私有閘道。

## 環境需求

- Python 3.10 或更新版本
- 本地使用 SQLite；多人部署可使用 PostgreSQL
- Redis 僅在啟用持久任務佇列時需要

## 本地啟動

```bash
cd quartsys-backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 18427
```

API 位於 `http://127.0.0.1:18427`。首次建立資料庫時可設定 `QUARTSYS_RUN_STARTUP_MIGRATIONS=1`。

## 環境變數

請從 `.env.example` 開始，至少修改：`DATABASE_URL`、唯一的長 `SECRET_KEY`、`QUARTSYS_COMMUNITY_EDITION=1`。如需行情更新，請設定 `QUARTSYS_DATA_ADAPTER_MODULE` 接入自有適配器。模型金鑰與 Provider 憑證只應存放在部署環境，不能放入前端或提交至 Git。

## 資料來源模式

```text
你的部署環境 -> 你設定的 Provider -> 第三方服務
                                  -> AIQuartSmart Community Edition API 與介面
```

社群版不會預設連線專案生產資料閘道。啟用 Provider 前，請確認服務條款、驗證方式、速率限制、署名、快取及使用限制。Mock 與 CSV 適合離線開發與測試。

## CSV 證券池匯入

社群版使用 `import_security_universe.py` 匯入使用者維護的 A 股、港股、美股、ETF、基金、REIT、債券及可轉債證券池。工具只寫入本地資料庫，不包含行情抓取或定時更新邏輯。

```csv
code,name,industry,area,board,asset_type
600519,貴州茅台,白酒,中國,主板,stock
hk00700,騰訊控股,網際網路服務,香港,港股,stock
usAAPL,Apple,Technology,United States,NASDAQ,stock
510300,滬深300ETF,指數基金,中國,ETF,etf
fund:000001,示例基金,混合基金,中國,基金,fund
```

將 CSV 放在任意本地路徑，並透過 `import_security_universe.py --file` 匯入。

```bash
python import_security_universe.py --file ./path/to/your-universe.csv
```

## API 概覽

常用端點：`/api/health/live`、`/api/login`、`/api/register`、`/api/stock/quote/{code}`、`/api/results`、`/api/screen`、`/api/factors/*`、`/api/strategy/*`、`/api/simulation/*`、`/api/market/*`。本地開發時 FastAPI OpenAPI 位於 `/docs`。

## 佣金設定

佣金計算為 `max(成交金額 × 費率, 最低佣金)`。介面使用萬分比，填寫 `1` 代表萬 1（0.01%）。模擬交易預設費率為 1、最低佣金 5 元；管理員可按市場調整，最低佣金設為 0 即按實際費率計算。

## 演示模式與新手引導

兩者互相獨立且預設開啟。管理員可在站點設定中指定演示帳號並分別開關。演示帳號的回應會優先快取在瀏覽器，避免導覽時重複呼叫 AI；動畫引導可跳過、返回或完成。

## 測試與安全

```bash
python -m unittest discover -s tests -p "test_contract_*.py"
python -m py_compile main.py
```

部署者需自行負責 Provider 授權、憑證、保存期限、速率與第三方條款。請勿提交 API 金鑰、Cookie、受限資料檔、付款密鑰或生產網址。此軟體僅供研究與模擬，不構成投資建議或真實交易系統。

## 授權

原始碼採用 [Apache License 2.0](../LICENSE)。Provider 回傳資料、服務名稱、商標、圖示與 Logo 受其權利人條款約束。

---

## English

FastAPI backend for the self-hosted quantitative research community edition.
It provides local APIs, provider interfaces, factor research, strategy
backtesting and paper trading. It does not include a project-operated data
gateway or hosted model service.

## Scope

- Quotes and security search for operator-configured markets
- Mock, CSV and user-written data providers
- Factor presets, custom factors, screening and strategy templates
- Local backtesting with basic performance metrics
- Paper-trading accounts, records and configurable commission rules
- User-configured risk indicators and optional user-owned AI integrations
- Demo mode and animated onboarding settings

Official AI market insight, Smart Research, AI Analysts, official AI risk
assessment, support tickets and hosted third-party research are disabled in the
community deployment. Compatibility contracts may remain in source, but no
production credentials or private gateway are required.

## Requirements and local start

- Python 3.10+
- SQLite for local use or PostgreSQL for shared deployments
- Redis only when the durable task queue is enabled

```bash
cd quartsys-backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 18427
```

The API runs at `http://127.0.0.1:18427`. Set
`QUARTSYS_RUN_STARTUP_MIGRATIONS=1` for a first run against a new database.

## Environment and data sources

Change `DATABASE_URL`, a unique `SECRET_KEY`, and keep
`QUARTSYS_COMMUNITY_EDITION=1`. Set `QUARTSYS_DATA_ADAPTER_MODULE` only when
you provide your own market-data adapter. Keep all provider
credentials and model keys in the deployment environment, never in the web
bundle or Git.

Requests intentionally follow this path:

```text
your deployment -> your configured provider -> third-party service
                  -> AIQuartSmart Community Edition API and UI
```

The community edition never defaults to a project production gateway. Review
provider terms, authentication, rate limits, attribution, caching and usage
restrictions before enabling a provider. Mock and CSV providers are suitable
for offline development and tests.

## CSV security-universe import

`import_security_universe.py` imports a user-maintained universe for A-shares, Hong
Kong shares, U.S. shares, ETFs, funds, REITs, bonds and convertible bonds.
Columns are `code,name,industry,area,board`; `asset_type` is optional.

```csv
code,name,industry,area,board,asset_type
600519,Kweichow Moutai,Consumer,China,Main,stock
hk00700,Tencent,Internet,Hong Kong,HK,stock
usAAPL,Apple,Technology,United States,NASDAQ,stock
510300,CSI 300 ETF,Index Fund,China,ETF,etf
fund:000001,Example Fund,Mixed Fund,China,Fund,fund
```

Place it at `security_universe.csv` or set
the CSV path passed to `import_security_universe.py --file`.

```bash
python import_security_universe.py --file ./path/to/your-universe.csv
```

## API overview

Common endpoints are `/api/health/live`, `/api/login`, `/api/register`,
`/api/stock/quote/{code}`, `/api/results`, `/api/screen`, `/api/factors/*`,
`/api/strategy/*`, `/api/simulation/*` and `/api/market/*`. FastAPI OpenAPI is
available at `/docs` during local development.

## Commission settings

Commission is `max(trade_value * rate, minimum_commission)`. The UI uses
ten-thousandths: `1` means 0.01% (one basis point). Paper trading defaults to
rate `1` and a CNY 5 minimum. Administrators can change values per market; set
the minimum to zero to charge the actual rate without a floor.

## Demo mode and onboarding

These are independent settings and default to enabled. Administrators can set
the demo username and toggle each feature in site settings. Demo responses are
cached in the demo account's browser so a walkthrough does not repeatedly call
an AI provider. The animated onboarding can be skipped, resumed and completed.

## Tests, security and license

```bash
python -m unittest discover -s tests -p "test_contract_*.py"
python -m py_compile main.py
```

The operator is responsible for provider permissions, credentials, retention,
rate limits and third-party terms. Do not commit API keys, cookies, restricted
data files, payment secrets or production URLs. This is a research and
simulation tool, not investment advice or a live-trading system.

Source code is released under [Apache License 2.0](../LICENSE). Provider data,
service names, trademarks, icons and logos remain subject to their owners'
terms.
