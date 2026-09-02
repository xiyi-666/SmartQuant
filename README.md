<div align="center">

# AIQuartSmart Community Edition

面向自部署环境的开源量化研究与模拟交易平台

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md)

</div>

---

AIQuartSmart Community Edition 提供从行情接入到策略验证的基础能力。平台只负责统一接口、计算和展示；数据源、AI 服务和风控逻辑由部署者自行选择与配置。

## ✨ 功能概览

- 行情查询、证券搜索和 Provider 接口
- Mock、CSV 及用户自定义数据适配器
- 多因子选股、因子表达式和策略模板
- 本地回测、基础绩效指标与模拟交易
- 用户自定义风险规则、指标和 AI 扩展接口

社区版不提供官方 AI 洞察市场、智能研究、多分析师协作、AI 风险评估、授权数据聚合、订阅支付和企业 SLA。社区版保留单 AI 分析师入口，支持用户配置自己的模型与提示词。需要完整能力时，可访问 [官方完整版](https://www.goldenaiquant.cn/)，或在自己的环境中接入相应服务。

## 🚀 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- Redis（仅启用生产任务队列时需要）

### 启动后端

```bash
cd quartsys-backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 18427
```

### 启动前端

另开终端执行：

```bash
cd quartsys-fronted
npm install
cp .env.example .env.local
# 在 .env.local 中设置 VITE_API_BASE_URL=http://127.0.0.1:18427/api
npm run dev
```

访问 <http://localhost:15473>。首次运行后，请立即修改管理员密码和 `SECRET_KEY`。

## ⚙️ 数据源与配置

社区版不会默认连接项目生产数据网关。数据请求从用户自己的部署环境直接访问已配置的 Provider：

```text
用户部署 → 用户配置 Provider → 用户环境直连第三方服务 → 社区版统一接口与展示
```

请先阅读 [DATA_SOURCES.md](DATA_SOURCES.md)，再配置 `.env` 和 Provider。用户需要自行确认第三方服务的授权、限流、缓存、署名及使用范围条款。请勿提交 API Key、Cookie、授权数据文件或历史数据快照。

## 🧭 使用流程

社区版适合部署在个人电脑、家庭服务器、云主机或企业内网中。推荐按以下流程使用：

1. **部署服务**：启动 FastAPI 后端和 React 前端，完成管理员账号初始化。
2. **配置数据源**：选择 Mock、CSV 或第三方 Provider。社区版默认不连接项目生产数据网关。
3. **建立证券池**：使用 CSV 导入股票、ETF、基金、REITs、债券等标的，并按需补充行业、地区和板块信息。
4. **研究与验证**：在本地完成选股、因子配置、策略编写和回测，检查收益、回撤、波动率等指标。
5. **模拟交易**：使用纸面交易验证策略和风险规则；确认结果后，再由部署者自行决定是否接入真实交易系统。
6. **接入自有 AI（可选）**：社区版仅提供扩展接口。用户可以配置自己的 AI API、Agent 或 Workflow，不会自动使用平台的付费 AI 服务。

社区版的核心原则是“数据和服务由用户掌控”：数据源凭据保存在用户环境，计算在用户部署中完成，平台只提供统一接口、策略工具和展示层。

## 📥 CSV 导入证券与市场数据

社区版支持使用 CSV 建立本地证券池，可导入 A 股、港股、美股、ETF、基金、公募 REITs、债券、可转债及其他自定义标的。CSV 由用户维护，平台不会替用户购买或分发受限数据。

### 1. 准备 CSV

将用户维护的证券池 CSV 放在任意本地路径。社区版不会随附行情抓取、批量更新或定时任务脚本。

支持的列：`code`、`name`、`industry`、`area`、`board`、`asset_type`。其中 `asset_type` 可选值包括 `stock`、`etf`、`fund`、`reit`、`trust`、`bond`、`convertible_bond` 和 `derivative`。

```csv
code,name,industry,area,board,asset_type
hk00700,腾讯控股,互联网服务,香港,港股,stock
usAAPL,苹果,消费电子,美国,美股,stock
510300,沪深300ETF,指数基金,中国,ETF,etf
508000,REIT示例,基础设施,中国,公募REITs,reit
fund:000001,基金示例,混合基金,中国,基金,fund
trust:QH001,信托示例,信托,中国,信托,trust
```

开放式基金使用 `fund:<code>`，信托使用 `trust:<id>`，避免与股票代码冲突。其他交易所标的可直接填写交易代码。

### 2. 导入证券池

```bash
cd quartsys-backend
python import_security_universe.py --file ./path/to/your-universe.csv
```

导入工具只写入本地数据库，不访问第三方服务。需要行情更新时，请在自己的部署环境中选择并配置 Provider，或设置 `QUARTSYS_DATA_ADAPTER_MODULE` 接入自有适配器。字段说明见 [DATA_SOURCES.md](DATA_SOURCES.md)。

## 💰 交易佣金

管理员可在“设置中心 → 交易参数”按市场配置费率和最低佣金：

```text
佣金 = max(成交金额 × 费率, 最低佣金)
```

设置页面使用“万分比”输入，填写 `1` 表示万 1（`0.01%`）。A 股默认费率为万 1，最低佣金为 5 元；也可以改为按实际费率计算。

## 🔒 社区版

| 社区版开放 | 社区版不内置 |
| --- | --- |
| 行情、搜索、选股、因子、策略、回测、模拟交易 | 官方 AI 洞察市场 |
| Mock/CSV/自定义 Provider、单 AI 分析师 | 智能研究、多分析师协作和第三方联网研究编排 |
| 用户自定义风险规则和 AI 接口 | 官方 AI 风险评估、动态权重和推荐逻辑 |
| 单 AI 分析师（一次一位、单轮） | 多分析师协作、多 Agent 编排、智能研究 |

社区版不包含任何项目品牌图标、Logo 或品牌资源。用户部署时可替换为自己的名称、图标和主题。

## 🧩 项目结构

```text
quartsys-backend/   FastAPI、SQLAlchemy、数据 Provider 和模拟交易
quartsys-fronted/   React、TypeScript、Vite 和界面
instruction/        部署与开发文档
DATA_SOURCES.md     数据源责任与合规说明
LICENSE              Apache License 2.0
```

更多文档：

- [后端与数据更新（含语言切换）](quartsys-backend/README.md)
- [部署说明](instruction/DEPLOYMENT.md)

## 📮 联系与支持

- 官方完整版：<https://www.goldenaiquant.cn/>
- QQ：`1049674092`
- 微信：`W1049674092`
- 使用问题、部署反馈和功能建议，欢迎通过 QQ 联系。
- 赞助入口可在 GitHub 仓库的 `Sponsor` 按钮中配置；当前仓库未内置收款链接。

## 📄 许可证

社区版源代码使用 [Apache License 2.0](LICENSE)。许可证只适用于本项目源代码；第三方数据、服务名称、商标、图标和 Logo 仍受各自权利人的条款约束。付费数据服务、生产 AI 流程和私有网关不属于本仓库授权范围。
