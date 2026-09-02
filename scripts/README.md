# AIQuartSmart Community Edition Frontend

This folder now uses `React + React Router` as the primary frontend architecture.
Static prototype HTML files are used as source templates and replicated into TSX routes.

## React Run

```bash
npm install
npm run dev
```

Open: `http://127.0.0.1:15473`

## Routes

- `/login`
- `/dashboard`
- `/ai-insights`
- `/screener`
- `/strategy`
- `/backtesting`
- `/risk`
- `/trading`
- `/settings`
- `/quote`

## API Base

Primary API base resolution order:
1. `localStorage.quartsys_api_base`
2. `VITE_API_BASE_URL`
3. Dev-only fallback probe (`http://<current-host>:18427/api`)

Production does not rely on implicit localhost probing.

Optional override:

```js
localStorage.setItem("quartsys_api_base", "http://127.0.0.1:18427/api");
```

Or use `.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:18427/api
```

## Default Login

- Username: `admin`
- Password: `admin`

The backend auto-creates this account at startup if missing.

## Read-only Load Probe

Use `scripts/load_test.py` from the project root:

```bash
python scripts/load_test.py \
  --url http://127.0.0.1:18427/api/health/live \
  --requests 1000 --concurrency 200 --rps 200 --json
```

The script refuses non-health URLs by default and reports success rate, error
types, p50/p95/p99 latency and achieved RPS. Add `--allow-non-health` only for
a confirmed idempotent read-only endpoint.

The community release intentionally excludes data collectors, bulk update
scripts, scheduled jobs, and deployment-unit templates. Configure a provider
or your own adapter in the deployment environment.
