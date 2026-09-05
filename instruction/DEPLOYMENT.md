# AIQuartSmart Community Edition 部署与维护指南

## 一、环境要求

| 组件 | 最低版本 | 推荐 |
|------|---------|------|
| Python | 3.10+ | 3.11 |
| Node.js | 18+ | 20 LTS |
| Redis | 6+ | 7（生产必需，用于缓存和任务队列） |
| PostgreSQL | 14+（可选） | 15（生产推荐） |
| SQLite | 3.35+ | 内置（开发用） |

---

## 二、本地开发启动

### 后端

```bash
cd quartsys-backend

# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，至少设置 SECRET_KEY

# 启动（开发模式）
uvicorn main:app --reload --port 18427
```

### 前端

```bash
cd quartsys-fronted

npm install

# 开发模式
npm run dev

# 或指定后端地址
VITE_API_BASE_URL=http://localhost:18427/api npm run dev
```

---

## 三、环境变量配置（`.env`）

```env
# 必填
SECRET_KEY=your-strong-random-secret-key-here

# 数据库（默认 SQLite）
DATABASE_URL=sqlite:///./quant.db
# PostgreSQL 示例：
# DATABASE_URL=postgresql://user:password@localhost:5432/quartsys

# Redis（生产必填；开发环境可关闭队列）
REDIS_URL=redis://localhost:16389/0

# Durable queue uses separate Redis databases from the cache.
CELERY_BROKER_URL=redis://localhost:16389/1
CELERY_RESULT_BACKEND=redis://localhost:16389/2
QUEUE_ENABLED=1
QUEUE_MAX_PENDING=100
QUEUE_GLOBAL_CONCURRENCY=4
QUEUE_MIN_CONCURRENCY=2
QUEUE_TASK_LEASE_TTL_SECONDS=180
QUEUE_TASK_ACTIVE_HEARTBEAT_SECONDS=180
CACHE_REQUIRE_REDIS=1
CACHE_ALLOW_MEMORY_FALLBACK=0

# JWT
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080  # 7天

# 安全
ALLOWED_ORIGINS=http://localhost:15473,http://localhost:15474
```

**安全提示**：`SECRET_KEY` 必须设置为强随机字符串，生产环境绝对不能使用默认值。

生成强密钥：
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## 四、生产部署

### 方式A：直接部署（推荐小规模）

**后端**
```bash
# 安装 gunicorn
pip install gunicorn

# 启动（4个 worker）
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:18427 \
  --timeout 120 \
  --access-logfile /var/log/quartsys/access.log
```

**前端构建**
```bash
cd quartsys-fronted
npm run build
# 产物在 dist/ 目录，用 nginx 托管
```

**Nginx 配置示例**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/quartsys-fronted/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:18427;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # 流式响应（SSE）
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### 方式B：Docker 部署

```dockerfile
# quartsys-backend/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "18427"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: ./quartsys-backend
    ports: ["18427:18427"]
    env_file: ./quartsys-backend/.env
    volumes:
      - ./data:/app/data
    depends_on: [redis]

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--port", "16389"]
    ports: ["16389:16389"]

  frontend:
    build: ./quartsys-fronted
    ports: ["15473:80"]
    environment:
      - VITE_API_BASE_URL=http://backend:18427/api
```

---

## 五、数据库维护

社区版启动时会执行幂等数据库初始化。需要生产迁移、备份、队列和定时任务时，
请由部署者在自己的基础设施中配置；本仓库不提供 systemd 单元、行情更新脚本或
定时调度实现。

### 数据备份

```bash
# SQLite 备份
cp quant.db quant.db.backup.$(date +%Y%m%d)

# PostgreSQL 备份
pg_dump quartsys > backup_$(date +%Y%m%d).sql
```

### 股票数据更新

```bash
# 手动触发全量更新（需要后端运行）
curl -X POST http://localhost:18427/api/update_data \
  -H "Authorization: Bearer YOUR_TOKEN"

# 补充 PE/市值数据（首次部署后执行）
cd quartsys-backend
python scripts/patch_fundamentals.py --all
```

---

## 六、LLM 配置

在设置页（`/settings` → LLM CONFIG）配置，或直接调用 API：

```bash
curl -X POST http://localhost:18427/api/llm-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "provider": "openai",
    "model": "deepseek-v4-flash",
    "api_key": "sk-xxx",
    "base_url": "https://api.openai.com/v1"
  }'
```

**支持的 Provider**：openai / anthropic / google / custom（兼容 OpenAI 接口的任意服务）

---

## 七、常见问题

**Q: 启动报错 `ModuleNotFoundError: No module named 'akshare'`**
```bash
pip install akshare
```

**Q: K线数据为空**

需要先触发数据更新：
```bash
curl -X POST http://localhost:18427/api/update_data -H "Authorization: Bearer TOKEN"
```

**Q: CrewAI 调用超时**

检查 LLM 配置是否正确，或增加超时时间（默认60秒）。

**Q: Redis 连接失败**

Redis 为可选组件，不配置 `REDIS_URL` 时系统自动降级为无缓存模式，功能不受影响，仅性能略降。

**Q: 前端无法连接后端**

在设置页 API Tab 中配置正确的后端地址，或设置环境变量 `VITE_API_BASE_URL`。

---

## 八、日志位置

| 日志 | 位置 |
|------|------|
| 后端运行日志 | `quartsys-backend/backend.out.log` |
| 后端错误日志 | `quartsys-backend/backend.err.log` |
| 前端构建日志 | `quartsys-fronted/frontend.out.log` |
| 系统日志（API） | `GET /api/logs` |
