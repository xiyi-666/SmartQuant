<div align="center">

# QaurtSmart

An open, self-hosted platform for quantitative research and paper trading

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md)

</div>

---

QaurtSmart covers the fundamentals from market-data access to strategy validation. It provides the common API, calculations, and UI; operators choose and configure their own data sources, AI services, and risk logic.

## ✨ Features

- Market quotes, security search, and provider interfaces
- Mock, CSV, and custom data adapters
- Multi-factor screening, factor expressions, and strategy templates
- Local backtesting, core performance metrics, and paper trading
- User-defined risk rules, indicators, and AI extension interfaces

The community edition does not include official AI market insights, smart research, multi-analyst collaboration, AI risk assessment, licensed-data aggregation, subscriptions, payments, or enterprise SLAs. It retains a single AI analyst entry for user-configured models and prompts. For the complete product, visit the [Official Full Edition](https://www.goldenaiquant.cn/), or connect your own services in your deployment.

## 🚀 Quick start

### Requirements

- Python 3.10+
- Node.js 18+
- Redis (only when the production task queue is enabled)

### Start the backend

```bash
cd quartsys-backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 18427
```

### Start the frontend

In another terminal:

```bash
cd quartsys-fronted
npm install
cp .env.example .env.local
# Set VITE_API_BASE_URL=http://127.0.0.1:18427/api in .env.local
npm run dev
```

Open <http://localhost:15473>. Change the administrator password and `SECRET_KEY` immediately after the first run.

## ⚙️ Data sources and configuration

The community edition does not default to a project-operated production data gateway. Requests go directly from the user's deployment to the configured provider:

```text
User deployment → User-configured provider → Direct third-party request → Unified community API and UI
```

Read [DATA_SOURCES.md](DATA_SOURCES.md) before configuring `.env` and providers. Operators are responsible for provider licensing, rate limits, caching, attribution, and usage terms. Never commit API keys, cookies, licensed data files, or bulk historical snapshots.

## 🧭 How to use the community edition

The community edition is designed for a personal computer, home server, cloud VM, or private network. A typical workflow is:

1. **Deploy the services**: start the FastAPI backend and React frontend, then initialize the administrator account.
2. **Configure data sources**: choose Mock, CSV, or a third-party provider. The community edition does not connect to the project's production gateway by default.
3. **Build a security universe**: import stocks, ETFs, funds, REITs, bonds, and other instruments with CSV; add industry, region, and board metadata when available.
4. **Research and validate**: run screening, configure factors, write strategies, and backtest locally. Review return, drawdown, volatility, and other metrics.
5. **Paper trade**: validate strategies and risk rules with simulated orders. Only the operator decides whether to connect a real trading system later.
6. **Connect your own AI (optional)**: the community edition exposes extension interfaces for your AI API, agents, or workflows. It does not automatically use the platform's paid AI services.

The guiding principle is user control: provider credentials stay in your environment, calculations run in your deployment, and the platform supplies common APIs, strategy tools, and presentation.

## 📥 CSV import for securities and markets

The community edition can build a local security universe from CSV. You can import A-shares, Hong Kong and US stocks, ETFs, funds, public REITs, bonds, convertible bonds, and other custom instruments. The operator supplies the CSV; the platform does not purchase or redistribute restricted data.

### 1. Prepare a CSV

Place a user-maintained security-universe CSV at any local path. The community edition does not ship quote collectors, bulk update scripts, or scheduled data jobs.

Supported columns are `code`, `name`, `industry`, `area`, `board`, and `asset_type`. Valid `asset_type` values include `stock`, `etf`, `fund`, `reit`, `trust`, `bond`, `convertible_bond`, and `derivative`.

```csv
code,name,industry,area,board,asset_type
hk00700,Tencent,Internet services,Hong Kong,HK stock,stock
usAAPL,Apple,Consumer electronics,United States,US stock,stock
510300,CSI 300 ETF,Index fund,China,ETF,etf
508000,REIT example,Infrastructure,China,Public REIT,reit
fund:000001,Fund example,Balanced fund,China,Fund,fund
trust:QH001,Trust example,Trust,China,Trust,trust
```

Use `fund:<code>` for open-ended funds and `trust:<id>` for trusts so their identifiers cannot collide with stock codes. Other exchange-listed instruments can use their exchange code directly.

### 2. Import the universe

```bash
cd quartsys-backend
python import_security_universe.py --file ./path/to/your-universe.csv
```

The importer only writes to the local database and never calls third-party services. For quotes, choose and configure a provider in your own deployment, or set `QUARTSYS_DATA_ADAPTER_MODULE` to load your adapter. See [DATA_SOURCES.md](DATA_SOURCES.md) for the field contract.

## 💰 Trading commissions

Administrators can configure a fee rate and minimum fee per market under “Settings → Trading Parameters”:

```text
commission = max(trade amount × fee rate, minimum fee)
```

The UI accepts a rate in ten-thousandths: entering `1` means 1 bp (`0.01%`). The default A-share rate is 1 bp with a minimum fee of 5 CNY; operators may switch to pure actual-rate billing.

## 🔒 Community scope

| Included | Not bundled |
| --- | --- |
| Quotes, search, screening, factors, strategies, backtests, paper trading | Official AI market insights |
| Mock/CSV/custom providers, single AI analyst | Smart research, multi-analyst collaboration, and third-party web-research orchestration |
| User-defined risk rules and AI interfaces | Official AI risk assessment, dynamic weights, and recommendation logic |
| Single AI analyst (one analyst, one round) | Multi-analyst collaboration, multi-agent orchestration, and smart research |

The community edition contains no project brand icons, logos, or branded assets. Operators may replace the name, icons, and theme with their own.

## 🧩 Project layout

```text
quartsys-backend/   FastAPI, SQLAlchemy, data providers, and paper trading
quartsys-fronted/   React, TypeScript, Vite, and UI
instruction/        Deployment and development documentation
DATA_SOURCES.md     Data-source responsibilities and compliance
LICENSE              Apache License 2.0
```

More documentation:

- [Backend and data updates (language switch)](quartsys-backend/README.md)
- [Deployment guide](instruction/DEPLOYMENT.md)

## 📮 Contact and support

- Official Full Edition: <https://www.goldenaiquant.cn/>
- QQ: `1049674092`
- WeChat: `W1049674092`
- For usage questions, deployment feedback, and feature suggestions, contact us via QQ.
- A sponsorship entry can be configured through the GitHub repository's `Sponsor` button; no payment link is embedded in this repository yet.

## 📄 License

The community source code is licensed under the [Apache License 2.0](LICENSE). This license applies to the project source code only. Third-party data, service names, trademarks, icons, and logos remain subject to their respective rights and terms. Paid data services, production AI workflows, and private gateways are outside the scope of this repository's license.
