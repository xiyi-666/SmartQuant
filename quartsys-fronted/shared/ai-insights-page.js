(function () {
  const api = window.QuartSysApi;
  if (!api) return;

  const main = document.querySelector("main");
  const status = document.createElement("div");
  status.className = "text-xs text-slate-400 mb-4";
  const header = main ? main.querySelector("header") : null;
  if (header && header.parentElement) header.parentElement.insertBefore(status, header.nextSibling);

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.className = `text-xs mb-4 ${isError ? "text-red-400" : "text-slate-400"}`;
  }

  function fixGarbledText() {
    const replacements = [
      [/鈻\?/g, "•"],
      [/鈫\?/g, "→"]
    ];
    const all = Array.from(document.querySelectorAll("body *"));
    all.forEach((el) => {
      if (!el.childNodes || el.childNodes.length !== 1 || el.childNodes[0].nodeType !== Node.TEXT_NODE) return;
      let txt = el.textContent || "";
      replacements.forEach(([re, to]) => {
        txt = txt.replace(re, to);
      });
      el.textContent = txt;
    });
  }

  function updateRefreshTime() {
    const node = Array.from(document.querySelectorAll("p")).find((p) =>
      /Refreshed at/i.test(p.textContent || "")
    );
    if (!node) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    node.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500"></span> Refreshed at ${hh}:${mm} CST | <span class="text-primary">Next update in 15m</span>`;
  }

  function updateMacroText(results) {
    const panel = Array.from(document.querySelectorAll("div")).find((d) =>
      /Macro & Geopolitics Analysis/i.test(d.textContent || "")
    );
    if (!panel) return;
    const content = panel.parentElement ? panel.parentElement.querySelector("p.mb-3") : null;
    if (!content) return;
    const count = results.length;
    content.innerHTML = `当前筛选系统命中 <strong class="text-on-surface">${count}</strong> 只候选股。市场结构偏向“风险平衡”，建议优先关注量价协同与均线趋势。`;
  }

  function renderPickCards(results) {
    const cards = Array.from(document.querySelectorAll("section .glass-card"));
    if (!cards.length || !results.length) return;
    const picks = results.slice(0, 2);
    picks.forEach((item, idx) => {
      const card = cards[idx];
      if (!card) return;
      const nameNode = card.querySelector("h4.font-headline");
      const codeNode = card.querySelector("p.font-mono");
      const metric = card.querySelectorAll(".grid.grid-cols-3 .font-mono.font-bold.text-sm");
      if (nameNode) nameNode.textContent = item.name || `Pick-${idx + 1}`;
      if (codeNode) codeNode.textContent = item.code || "-";

      const price = Number(item.price || 0);
      const ma60 = Number(item.ma60 || price || 1);
      const buy = price;
      const stop = Math.max(0.01, Math.min(price * 0.95, ma60 * 0.98));
      const target = Math.max(price * 1.08, ma60 * 1.06);
      if (metric[0]) metric[0].textContent = buy.toFixed(2);
      if (metric[1]) metric[1].textContent = stop.toFixed(2);
      if (metric[2]) metric[2].textContent = target.toFixed(2);

      const actionBtns = card.querySelectorAll("button");
      const watchBtn = Array.from(actionBtns).find((b) => /watchlist/i.test(b.textContent || ""));
      const backtestBtn = Array.from(actionBtns).find((b) => /backtest/i.test(b.textContent || ""));

      if (watchBtn && !watchBtn.dataset.bound) {
        watchBtn.dataset.bound = "1";
        watchBtn.addEventListener("click", async function () {
          try {
            await api.post("/watchlist", {
              group_name: "AI精选",
              code: item.code,
              name: item.name,
              color: "#8b5cf6"
            });
            setStatus(`已加入自选：${item.code}`, false);
          } catch (e) {
            setStatus(e.message || "加入自选失败", true);
          }
        });
      }

      if (backtestBtn && !backtestBtn.dataset.bound) {
        backtestBtn.dataset.bound = "1";
        backtestBtn.addEventListener("click", function () {
          window.location.href = `../backtesting_agent_analysis/code.html?code=${encodeURIComponent(item.code)}`;
        });
      }
    });
  }

  function bindGenerateAction() {
    const textarea = document.querySelector("textarea");
    const genBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Generate Strategy/i.test(b.textContent || "")
    );
    if (!textarea || !genBtn || genBtn.dataset.bound) return;

    genBtn.dataset.bound = "1";
    genBtn.addEventListener("click", async function () {
      const prompt = (textarea.value || "").trim();
      if (!prompt) {
        setStatus("请先输入策略描述", true);
        return;
      }
      const lower = prompt.toLowerCase();
      const conditions = [];
      if (lower.includes("ma") || lower.includes("均线")) conditions.push("ma60");
      if (lower.includes("volume") || lower.includes("成交量")) conditions.push("volume");
      if (lower.includes("candlestick") || lower.includes("阴阳") || lower.includes("rsi")) conditions.push("yin_yang");
      if (!conditions.length) conditions.push("ma60");

      try {
        await api.post("/params", {
          ma_days: 60,
          ma_proximity_threshold: 0.15,
          ma_trend_days: 30,
          volume_check_days: 30,
          volume_spike_ratio: 2.0,
          post_spike_days_count: 5,
          yin_yang_check_days: 20,
          ma_short_days: 20,
          ma_long_days: 60,
          slope_threshold: 15.0,
          enabled_conditions: conditions,
          match_mode: "all"
        });
        setStatus(`策略参数已同步：${conditions.join(", ")}`, false);
      } catch (e) {
        setStatus(e.message || "策略参数同步失败", true);
      }
    });
  }

  async function load() {
    try {
      fixGarbledText();
      updateRefreshTime();
      const results = await api.get("/results");
      const rows = Array.isArray(results) ? results : [];
      updateMacroText(rows);
      renderPickCards(rows);
      bindGenerateAction();
      setStatus(`AI Insights 已联动，候选股 ${rows.length} 条`, false);
    } catch (e) {
      setStatus(e.message || "AI Insights 同步失败", true);
    }
  }

  load();
})();
