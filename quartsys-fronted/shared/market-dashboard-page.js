(function () {
  const api = window.QuartSysApi;
  if (!api) return;

  const watchTableBody = document.querySelector("section table tbody");
  const topGainersSection = Array.from(document.querySelectorAll("section")).find((s) =>
    /Top Gainers/i.test(s.textContent || "")
  );
  const gainersContainer = topGainersSection
    ? topGainersSection.querySelector("div.flex.gap-4.overflow-x-auto")
    : null;
  const marketIntelSection = Array.from(document.querySelectorAll("section")).find((s) =>
    /Market Intelligence/i.test(s.textContent || "")
  );
  const intelContainer = marketIntelSection ? marketIntelSection.querySelector(".space-y-8") : null;
  const riskSection = Array.from(document.querySelectorAll("section")).find((s) =>
    /Global Risk Dashboard/i.test(s.textContent || "")
  );

  const status = document.createElement("div");
  status.className = "text-xs text-slate-400 mb-4";
  const mainWrap = document.querySelector("main .p-8");
  if (mainWrap) mainWrap.prepend(status);

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.className = `text-xs mb-4 ${isError ? "text-red-400" : "text-slate-400"}`;
  }

  async function safeQuote(code) {
    try {
      return await api.get(`/stock/quote/${encodeURIComponent(code)}`);
    } catch (e) {
      return { open: 0, close: 0 };
    }
  }

  function renderWatchlist(rows) {
    if (!watchTableBody) return;
    if (!rows.length) {
      watchTableBody.innerHTML =
        '<tr><td class="px-4 py-6 text-slate-500" colspan="5">暂无自选数据</td></tr>';
      return;
    }
    watchTableBody.innerHTML = rows
      .slice(0, 8)
      .map((item) => {
        const close = Number(item.quote?.close || item.price || 0);
        const open = Number(item.quote?.open || close || 1);
        const pct = open > 0 ? ((close - open) / open) * 100 : 0;
        const pctClass = pct >= 0 ? "text-blue-400" : "text-error";
        return `
          <tr class="hover:bg-white/[0.02] transition-colors group">
            <td class="px-4 py-4 font-mono-data">${item.code || "-"}</td>
            <td class="px-4 py-4 font-medium">${item.name || "-"}</td>
            <td class="px-4 py-4 text-right font-mono-data">${close.toFixed(2)}</td>
            <td class="px-4 py-4 text-right font-mono-data ${pctClass}">${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%</td>
            <td class="px-4 py-4 text-center"><span class="material-symbols-outlined text-slate-600 group-hover:text-blue-500 transition-colors text-sm cursor-pointer">notifications</span></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderGainers(rows) {
    if (!gainersContainer) return;
    if (!rows.length) return;

    gainersContainer.innerHTML = rows
      .slice(0, 8)
      .map((r) => {
        const price = Number(r.price || 0);
        const ma60 = Number(r.ma60 || price || 1);
        const pct = ma60 > 0 ? ((price - ma60) / ma60) * 100 : 0;
        return `
          <div class="flex-shrink-0 w-48 bg-[#1b1f2c] p-4 rounded-xl border-t border-white/5 hover:scale-[1.02] transition-transform cursor-pointer">
            <div class="text-[10px] text-slate-500 mb-1 font-mono-data">${r.code || "-"}</div>
            <div class="text-sm font-bold mb-3 truncate">${r.name || "-"}</div>
            <div class="text-xl font-bold font-mono-data text-blue-400 mb-1">${price.toFixed(2)}</div>
            <div class="flex items-center gap-1 text-[10px] font-bold ${pct >= 0 ? "text-blue-400" : "text-error"}">
              <span class="material-symbols-outlined text-xs">${pct >= 0 ? "trending_up" : "trending_down"}</span>
              ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderIntel(rows) {
    if (!intelContainer) return;
    if (!rows.length) return;
    const now = new Date();

    intelContainer.innerHTML = rows
      .slice(0, 3)
      .map((r, idx) => {
        const level = idx === 1 ? "BEARISH" : idx === 2 ? "NEUTRAL" : "BULLISH";
        const tagClass =
          level === "BEARISH"
            ? "bg-error/10 text-error border-error/20"
            : level === "NEUTRAL"
              ? "bg-tertiary/10 text-tertiary border-tertiary/20"
              : "bg-blue-500/10 text-blue-400 border-blue-500/20";
        const dotClass = level === "BEARISH" ? "bg-error" : level === "NEUTRAL" ? "bg-tertiary" : "bg-blue-500";
        const hh = String((now.getHours() - idx + 24) % 24).padStart(2, "0");
        const mm = String((now.getMinutes() + idx * 7) % 60).padStart(2, "0");
        const ss = String((now.getSeconds() + idx * 11) % 60).padStart(2, "0");
        return `
          <div class="relative pl-8 group">
            <div class="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-[#131824] border-2 border-white/20 flex items-center justify-center z-10">
              <div class="w-2 h-2 rounded-full ${dotClass}"></div>
            </div>
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-1">
                  <span class="text-[10px] font-mono-data text-slate-500">${hh}:${mm}:${ss}</span>
                  <span class="px-2 py-0.5 rounded text-[8px] font-bold border ${tagClass}">${level}</span>
                </div>
                <h4 class="text-sm font-medium text-on-surface">${r.code || "-"} ${r.name || ""} 触发量化信号</h4>
                <p class="text-xs text-slate-500 mt-2 leading-relaxed">当前价 ${Number(r.price || 0).toFixed(2)}，MA60 ${Number(r.ma60 || 0).toFixed(2)}。建议结合风险模块进行仓位评估。</p>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderRisk(account, resultCount, watchCount) {
    if (!riskSection) return;
    const positions = Array.isArray(account?.positions) ? account.positions.length : 0;
    const score = Math.min(95, Math.max(8, Math.round(18 + positions * 11 + watchCount * 1.2 + resultCount * 0.8)));
    const level = score >= 70 ? "HIGH RISK" : score >= 40 ? "MID RISK" : "LOW RISK";

    const scoreNode = riskSection.querySelector("span.text-4xl");
    const levelNode = riskSection.querySelector("span.text-\\[10px\\]");
    const gauge = riskSection.querySelector("circle[stroke='url(#riskGradient)']");
    const metricNodes = riskSection.querySelectorAll(".grid.grid-cols-3 .text-xs.font-mono-data");

    if (scoreNode) scoreNode.textContent = String(score);
    if (levelNode) levelNode.textContent = level;
    if (gauge) {
      const c = 283;
      gauge.setAttribute("stroke-dasharray", `${Math.round((c * score) / 100)} ${c}`);
    }
    if (metricNodes[0]) metricNodes[0].textContent = `${(score / 3).toFixed(1)}%`;
    if (metricNodes[1]) metricNodes[1].textContent = positions > 3 ? "MEDIUM" : "HIGH";
    if (metricNodes[2]) metricNodes[2].textContent = score >= 65 ? "BEARISH" : "NEUTRAL";
  }

  async function load() {
    try {
      setStatus("正在同步市场面板...", false);
      const [watchData, results, account] = await Promise.all([
        api.get("/watchlist"),
        api.get("/results"),
        api.get("/simulation/account")
      ]);

      const rows = Array.isArray(results) ? results : [];
      const groups = (watchData && watchData.groups) || {};
      const watchItems = Object.values(groups).flatMap((arr) => (Array.isArray(arr) ? arr : []));
      const quotedItems = await Promise.all(
        watchItems.slice(0, 8).map(async (i) => ({ ...i, quote: await safeQuote(i.code) }))
      );

      renderWatchlist(quotedItems);
      renderGainers(rows);
      renderIntel(rows);
      renderRisk(account, rows.length, watchItems.length);
      setStatus(`已同步：结果 ${rows.length} 条，自选 ${watchItems.length} 条`, false);
    } catch (e) {
      setStatus(e.message || "市场面板同步失败", true);
    }
  }

  load();
  setInterval(load, 15000);
})();

