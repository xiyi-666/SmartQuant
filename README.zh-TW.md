<div align="center">

# AIQuartSmart Community Edition

面向自部署環境的開源量化研究與模擬交易平台

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md)

</div>

---

AIQuartSmart Community Edition 提供從行情接入到策略驗證的基礎能力。平台只負責統一介面、計算與展示；資料源、AI 服務及風控邏輯由部署者自行選擇與配置。

## ✨ 功能概覽

- 行情查詢、證券搜尋與 Provider 介面
- Mock、CSV 及使用者自訂資料適配器
- 多因子選股、因子表達式與策略範本
- 本地回測、基礎績效指標與模擬交易
- 使用者自訂風險規則、指標與 AI 擴充介面
- 可獨立開關的演示模式與動態新手引導

社群版不提供官方 AI 市場洞察、智慧研究、AI 分析師、官方 AI 風險評估、授權資料聚合、訂閱支付及企業 SLA。需要完整能力時，可瀏覽 [官方完整版](https://www.goldenaiquant.cn/)，或在自己的環境接入相應服務。

## 🚀 快速開始

### 環境需求

- Python 3.10+
- Node.js 18+
- Redis（僅啟用生產任務佇列時需要）

### 啟動後端

```bash
cd quartsys-backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 18427
```

### 啟動前端

另開終端執行：

```bash
cd quartsys-fronted
npm install
cp .env.example .env.local
# 在 .env.local 設定 VITE_API_BASE_URL=http://127.0.0.1:18427/api
npm run dev
```

開啟 <http://localhost:15473>。首次執行後，請立即修改管理員密碼與 `SECRET_KEY`。

## ⚙️ 資料源與設定

社群版不會預設連線專案生產資料閘道。資料請求從使用者自己的部署環境直接存取已設定的 Provider：

```text
使用者部署 → 使用者設定 Provider → 使用者環境直連第三方服務 → 社群版統一介面與展示
```

請先閱讀 [DATA_SOURCES.md](DATA_SOURCES.md)，再設定 `.env` 與 Provider。使用者需自行確認第三方服務的授權、限流、快取、署名及使用範圍條款。請勿提交 API Key、Cookie、授權資料檔案或歷史資料快照。

## 🧭 社群版使用流程

社群版適合部署在個人電腦、家庭伺服器、雲端主機或企業內網中。建議依照以下流程使用：

1. **部署服務**：啟動 FastAPI 後端與 React 前端，完成管理員帳號初始化。
2. **設定資料源**：選擇 Mock、CSV 或第三方 Provider。社群版預設不連線專案生產資料閘道。
3. **建立證券池**：使用 CSV 匯入股票、ETF、基金、REITs、債券等標的，並按需補充產業、地區與板塊資訊。
4. **研究與驗證**：在本地完成選股、因子設定、策略撰寫與回測，檢查收益、回撤、波動率等指標。
5. **模擬交易**：使用紙面交易驗證策略與風險規則；確認結果後，再由部署者自行決定是否接入真實交易系統。
6. **接入自有 AI（可選）**：社群版僅提供擴充介面。使用者可設定自己的 AI API、Agent 或 Workflow，不會自動使用平台的付費 AI 服務。

社群版的核心原則是「資料與服務由使用者掌控」：資料源憑據保存在使用者環境，計算在使用者部署中完成，平台只提供統一介面、策略工具與展示層。

## 📥 CSV 匯入證券與市場資料

社群版支援使用 CSV 建立本地證券池，可匯入 A 股、港股、美股、ETF、基金、公募 REITs、債券、可轉債及其他自訂標的。CSV 由使用者維護，平台不會替使用者購買或分發受限資料。

### 1. 準備 CSV

將使用者維護的證券池 CSV 放在任意本地路徑。社群版不會隨附行情抓取、批量更新或定時任務腳本。

支援欄位：`code`、`name`、`industry`、`area`、`board`、`asset_type`。`asset_type` 可選值包括 `stock`、`etf`、`fund`、`reit`、`trust`、`bond`、`convertible_bond` 與 `derivative`。

```csv
code,name,industry,area,board,asset_type
hk00700,騰訊控股,網際網路服務,香港,港股,stock
usAAPL,蘋果,消費電子,美國,美股,stock
510300,滬深300ETF,指數基金,中國,ETF,etf
508000,REIT 範例,基礎設施,中國,公募 REITs,reit
fund:000001,基金範例,混合基金,中國,基金,fund
trust:QH001,信託範例,信託,中國,信託,trust
```

開放式基金使用 `fund:<code>`，信託使用 `trust:<id>`，避免與股票代碼衝突。其他交易所標的可直接填寫交易代碼。

### 2. 匯入證券池

```bash
cd quartsys-backend
python import_security_universe.py --file ./path/to/your-universe.csv
```

匯入工具只寫入本地資料庫，不存取第三方服務。需要行情更新時，請在自己的部署環境選擇並設定 Provider，或設定 `QUARTSYS_DATA_ADAPTER_MODULE` 接入自有適配器。欄位說明請參閱 [DATA_SOURCES.md](DATA_SOURCES.md)。

## 💰 交易佣金

管理員可在「設定中心 → 交易參數」按市場設定費率與最低佣金：

```text
佣金 = max(成交金額 × 費率, 最低佣金)
```

設定頁面使用「萬分比」輸入，填寫 `1` 代表萬 1（`0.01%`）。A 股預設費率為萬 1，最低佣金為 5 元；也可改為按實際費率計算。

## 🎬 演示模式與新手引導

兩項功能彼此獨立，預設均開啟，可由系統管理員在後台分別開關：

- **演示模式**：指定測試帳號並顯示演示提示，建議綁定唯讀權限或模擬交易帳號。
- **新手引導**：新使用者首次登入時展示步驟動畫，可上一步、下一步、略過、完成或點擊步驟圓點跳轉。

演示模式下，相同 AI 請求會優先使用演示帳號瀏覽器的本地快取，避免每次演示重複呼叫模型。快取不會上傳到平台伺服器。

## 🔒 社群版邊界

| 社群版開放 | 社群版不內建 |
| --- | --- |
| 行情、搜尋、選股、因子、策略、回測、模擬交易 | 官方 AI 市場洞察 |
| Mock/CSV/自訂 Provider | 智慧研究、AI 分析師與第三方聯網研究編排 |
| 使用者自訂風險規則與 AI 介面 | 官方 AI 風險評估、動態權重與推薦邏輯 |
| 演示模式與新手引導 | 授權資料聚合、清洗、受限資料與私有生產閘道 |

社群版不包含任何專案品牌圖示、Logo 或品牌資源。使用者部署時可替換為自己的名稱、圖示與主題。

## 🧩 專案結構

```text
quartsys-backend/   FastAPI、SQLAlchemy、資料 Provider 與模擬交易
quartsys-fronted/   React、TypeScript、Vite 與介面
instruction/        部署與開發文件
DATA_SOURCES.md     資料源責任與合規說明
LICENSE              Apache License 2.0
```

更多文件：

- [後端與資料更新（含語言切換）](quartsys-backend/README.md)
- [部署說明](instruction/DEPLOYMENT.md)

## 📮 聯絡與支援

- 官方完整版：<https://www.goldenaiquant.cn/>
- QQ：`1049674092`
- 微信：`W1049674092`
- 使用問題、部署回饋與功能建議，歡迎透過 QQ 聯絡。
- 贊助入口可在 GitHub 儲存庫的 `Sponsor` 按鈕中設定；目前儲存庫未內建收款連結。

## 📄 授權條款

社群版原始碼使用 [Apache License 2.0](LICENSE)。授權只適用於本專案原始碼；第三方資料、服務名稱、商標、圖示和 Logo 仍受各自權利人的條款約束。付費資料服務、生產 AI 流程與私有閘道不屬於本儲存庫授權範圍。
