# QuartSys Backend (Python)

## Run

```bash
pip install -r requirements.txt
cp .env.example .env
python main.py
```

Default URL: `http://127.0.0.1:6667`

## Key APIs

- `POST /api/login`
- `POST /api/register`
- `POST /api/reset_password`
- `GET /api/results`
- `POST /api/screen`
- `GET /api/simulation/account`
- `POST /api/simulation/trade`
- `GET /api/simulation/records`
- `GET /api/agents`
- `POST /api/agents`
- `POST /api/agents/{agent_id}/backtest`
- `GET /api/agents/dashboard/rank`
- `GET /api/agents/dashboard/stats`
- `GET /api/agents/dashboard/trend`
- `GET /api/strategies`
- `GET /api/trading_strategies`
- `POST /api/ai/chat`
