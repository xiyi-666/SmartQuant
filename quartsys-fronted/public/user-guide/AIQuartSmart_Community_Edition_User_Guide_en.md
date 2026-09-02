# AIQuartSmart Community Edition User Guide

This guide covers self-hosting and the local quantitative research workflow. The community edition uses providers configured by the operator and never connects to a project production gateway. Official AI Insights, Smart Research, AI Analysts and official AI risk assessment are not included.

> This software is for research and paper trading. It is not investment advice, a return promise or a live trading instruction. Check third-party terms before using any data or model provider.

## 1. Sign in and initialize

Start the backend and frontend, open the frontend URL and register an account. An administrator should initialize the database, change the initial password, review site settings and confirm permissions. Demo mode, onboarding and each provider can be toggled independently.

## 2. Configure data sources

Set the database and providers in the backend `.env`. Start with Mock, then use CSV or write a provider for your environment.

```text
your deployment -> your configured source -> third-party service -> local API/UI
```

Keep API keys, cookies and licensed data out of frontend source. Review terms, rate limits, attribution, caching and retention requirements before enabling a provider.

## 3. Import a CSV universe

Place a user-maintained CSV at any local path and import it with `import_security_universe.py --file`. The community release does not include quote collectors or scheduled update scripts.

```csv
code,name,industry,area,board,asset_type
600519,Kweichow Moutai,Consumer,China,Main,stock
hk00700,Tencent,Internet,Hong Kong,HK,stock
usAAPL,Apple,Technology,United States,NASDAQ,stock
510300,CSI 300 ETF,Index Fund,China,ETF,etf
```

Run `python import_security_universe.py --file ./path/to/your-universe.csv` to import a local universe. The community release does not include quote collectors or scheduled update scripts.

## 4. Screening and factors

Search securities in Market Data and Screener, create a watchlist and combine conditions. Factor pages support built-in factors, expression validation, previews and custom factors. Results remain in your deployment database.

## 5. Strategies, backtests and paper trading

Write rules in the strategy workbench, choose a universe, dates, initial capital and benchmark, then run a backtest. Review return, drawdown, volatility, turnover and trade details before binding a strategy to a paper account. No live broker is connected.

Commission is `max(trade_value * rate, minimum_commission)`. The UI uses ten-thousandths: `1` means 0.01%. The default minimum is CNY 5; administrators can change it per market, and zero means charge the actual rate without a floor.

## 6. Custom risk rules and optional AI

Risk pages show provider metrics and rules configured by the operator. The community edition has no official risk score or dynamic weighting; define your own thresholds, notifications and actions. You may connect an API, Agent or Workflow in your environment and are responsible for model costs, logs and data compliance.

## 7. Demo mode and onboarding

These are independent settings and default to enabled. Administrators can set a demo username and toggle each feature. Identical demo requests prefer browser cache to avoid repeated model calls. Onboarding uses step animations and can be skipped, resumed or completed.

## 8. Troubleshooting and security

If data is empty, check provider credentials, trading dates, ticker format and rate limits; switch to Mock or CSV offline. Do not commit keys, cookies, restricted data files, production URLs or user data. Restrict administrator access and back up the local database.
