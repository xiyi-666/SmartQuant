(function () {
  const api = window.QuartSysApi;
  if (!api) return;

  const params = new URLSearchParams(window.location.search);
  const requestedCode = (params.get("code") || "").trim();
  const titleNode = document.querySelector("h2.font-headline");
  const codeNode = document.querySelector("span.bg-surface-container-high");
  const lastNode = document.querySelector("span.font-mono.text-3xl");
  const changeNode = document.querySelector("span.font-mono.text-xs.font-medium");
  const statsPanel = Array.from(document.querySelectorAll("h3")).find((h) =>
    /Market Stats/i.test(h.textContent || "")
  );

  const status = document.createElement("div");
  status.className = "text-[10px] text-slate-400 font-mono";
  const footer = document.querySelector(".px-5.py-3");
  if (footer) footer.prepend(status);

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.className = `text-[10px] font-mono ${isError ? "text-red-400" : "text-slate-400"}`;
  }

  function normalizeCode(codeLike) {
    return (codeLike || "").split(".")[0].split("/")[0].trim();
  }

  function detectCurrentCode() {
    if (requestedCode) return normalizeCode(requestedCode);
    if (codeNode) return normalizeCode(codeNode.textContent);
    return "";
  }

  async function loadStock() {
    const code = detectCurrentCode();
    if (!code) {
      setStatus("缺少股票代码参数", true);
      return;
    }

    try {
      let quote = await api.get(`/stock/quote/${encodeURIComponent(code)}`);
      const search = await api.get(`/search?q=${encodeURIComponent(code)}`);
      const stockName = Array.isArray(search) && search[0] ? search[0].name : code;

      const open = Number(quote.open || 0);
      const close = Number(quote.close || 0);
      const high = Number(quote.high || 0);
      const low = Number(quote.low || 0);
      const prev = open || close || 1;
      const diff = close - prev;
      const pct = prev > 0 ? (diff / prev) * 100 : 0;

      if (titleNode) titleNode.textContent = stockName;
      if (codeNode) codeNode.textContent = `${code}.SH`;
      if (lastNode) {
        lastNode.textContent = close.toFixed(2);
        lastNode.className = `font-mono text-3xl font-bold ${diff >= 0 ? "text-primary" : "text-error"}`;
      }
      if (changeNode) {
        changeNode.textContent = `${diff >= 0 ? "+" : ""}${diff.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
        changeNode.className = `font-mono text-xs font-medium ${diff >= 0 ? "text-primary" : "text-error"}`;
      }

      if (statsPanel && statsPanel.parentElement) {
        const values = statsPanel.parentElement.querySelectorAll("span.font-mono.text-sm");
        if (values[0]) values[0].textContent = open.toFixed(2);
        if (values[1]) values[1].textContent = prev.toFixed(2);
        if (values[2]) values[2].textContent = high.toFixed(2);
        if (values[3]) values[3].textContent = low.toFixed(2);
      }

      bindActions(code, stockName, close);
      setStatus(`行情已刷新：${code}`, false);
    } catch (e) {
      setStatus(e.message || "行情加载失败", true);
    }
  }

  function bindActions(code, stockName, price) {
    const buttons = Array.from(document.querySelectorAll("button"));
    const starBtn = buttons.find((b) => (b.innerHTML || "").includes("star"));
    const closeBtn = buttons.find((b) => (b.innerHTML || "").includes("close"));
    const quickBuyBtn = buttons.find((b) => /Quick Buy/i.test(b.textContent || ""));
    const quickSellBtn = buttons.find((b) => /Quick Sell/i.test(b.textContent || ""));

    if (starBtn && !starBtn.dataset.bound) {
      starBtn.dataset.bound = "1";
      starBtn.addEventListener("click", async function () {
        try {
          await api.post("/watchlist", {
            group_name: "详情关注",
            code,
            name: stockName,
            color: "#4d8eff"
          });
          setStatus(`已加入自选：${code}`, false);
        } catch (e) {
          setStatus(e.message || "加入自选失败", true);
        }
      });
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "1";
      closeBtn.addEventListener("click", function () {
        if (window.history.length > 1) window.history.back();
        else window.location.href = "../market_dashboard_updated/code.html";
      });
    }

    if (quickBuyBtn && !quickBuyBtn.dataset.bound) {
      quickBuyBtn.dataset.bound = "1";
      quickBuyBtn.addEventListener("click", async function () {
        try {
          await api.post("/simulation/trade", {
            stock_code: code,
            stock_name: stockName,
            price: Number(price || 0),
            quantity: 100,
            trade_type: "buy"
          });
          setStatus(`模拟买入成功：${code} x100`, false);
        } catch (e) {
          setStatus(e.message || "买入失败", true);
        }
      });
    }

    if (quickSellBtn && !quickSellBtn.dataset.bound) {
      quickSellBtn.dataset.bound = "1";
      quickSellBtn.addEventListener("click", async function () {
        try {
          await api.post("/simulation/trade", {
            stock_code: code,
            stock_name: stockName,
            price: Number(price || 0),
            quantity: 100,
            trade_type: "sell"
          });
          setStatus(`模拟卖出成功：${code} x100`, false);
        } catch (e) {
          setStatus(e.message || "卖出失败", true);
        }
      });
    }
  }

  loadStock();
})();

