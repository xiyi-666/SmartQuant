(function () {
  const api = window.QuartSysApi;
  if (!api) return;

  const tableBody = document.querySelector("section table tbody");
  const rankPanel = Array.from(document.querySelectorAll("h3")).find((h) =>
    /Yield Ranking/i.test(h.textContent || "")
  );
  const topCurve = document.querySelector("path[stroke='#adc6ff']");
  const pauseAllBtn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Pause All/i.test(b.textContent || "")
  );
  const restartAllBtn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Restart All/i.test(b.textContent || "")
  );
  const newBtn = Array.from(document.querySelectorAll("button")).find((b) =>
    /NEW_STRATEGY/i.test(b.textContent || "")
  );

  const status = document.createElement("div");
  status.className = "text-xs text-slate-400 mb-4";
  const mainWrap = document.querySelector("main .p-6");
  if (mainWrap) mainWrap.prepend(status);

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.className = `text-xs mb-4 ${isError ? "text-red-400" : "text-slate-400"}`;
  }

  function toNumber(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function groupByCode(records) {
    const m = {};
    (records || []).forEach((r) => {
      const code = r.stock_code || "UNKNOWN";
      if (!m[code]) m[code] = [];
      m[code].push(r);
    });
    return m;
  }

  function buildAgentRows(records) {
    const groups = groupByCode(records);
    return Object.keys(groups).map((code, idx) => {
      const list = groups[code];
      let pnl = 0;
      let maxLoss = 0;
      list.forEach((r) => {
        const amount = toNumber(r.amount);
        pnl += r.trade_type === "sell" ? amount : -amount;
        maxLoss = Math.min(maxLoss, pnl);
      });
      const base = 100000;
      const yield90 = (pnl / base) * 100;
      const dd = (maxLoss / base) * 100;
      return {
        id: idx + 1,
        name: `Agent-${code}`,
        code,
        status: idx % 3 === 0 ? "Stopped" : "Running",
        strategy: idx % 2 === 0 ? "Momentum / MA" : "Mean Reversion",
        yield90,
        drawdown: dd
      };
    });
  }

  function renderTable(rows) {
    if (!tableBody) return;
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-6 text-slate-500">暂无回测数据</td></tr>';
      return;
    }

    tableBody.innerHTML = rows
      .slice(0, 12)
      .map((a) => {
        const yClass = a.yield90 >= 0 ? "text-primary" : "text-error/80";
        const dClass = a.drawdown <= -8 ? "text-error" : "text-slate-500";
        const sClass =
          a.status === "Running"
            ? "bg-green-500/10 text-green-400"
            : "bg-slate-800 text-slate-400";
        return `
          <tr class="group hover:bg-white/[0.02] transition-colors">
            <td class="px-6 py-4">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded bg-primary/20 flex items-center justify-center">
                  <span class="material-symbols-outlined text-primary text-sm">precision_manufacturing</span>
                </div>
                <div>
                  <div class="text-sm font-bold text-white">${a.name}</div>
                  <div class="text-[10px] text-slate-500 font-mono">UID: QT-${String(a.id).padStart(4, "0")}</div>
                </div>
              </div>
            </td>
            <td class="px-6 py-4"><span class="text-xs text-slate-400 font-medium">${a.strategy}</span></td>
            <td class="px-6 py-4"><span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${sClass} text-[10px] font-bold">${a.status}</span></td>
            <td class="px-6 py-4 text-right font-mono ${yClass} text-sm">${a.yield90 >= 0 ? "+" : ""}${a.yield90.toFixed(2)}%</td>
            <td class="px-6 py-4 text-right font-mono ${dClass} text-sm">${a.drawdown.toFixed(2)}%</td>
            <td class="px-6 py-4 text-right">
              <div class="flex justify-end gap-2">
                <button class="js-view text-xs text-primary hover:underline" data-code="${a.code}">详情</button>
                <button class="js-trade text-xs text-blue-400 hover:underline" data-code="${a.code}">交易</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    tableBody.querySelectorAll(".js-view").forEach((btn) => {
      btn.addEventListener("click", function () {
        window.location.href = `../quote_pop_up_detail/code.html?code=${encodeURIComponent(btn.dataset.code || "")}`;
      });
    });
    tableBody.querySelectorAll(".js-trade").forEach((btn) => {
      btn.addEventListener("click", function () {
        window.location.href = `../trading_terminal/code.html?code=${encodeURIComponent(btn.dataset.code || "")}`;
      });
    });
  }

  function renderRank(rows) {
    if (!rankPanel) return;
    const box = rankPanel.parentElement ? rankPanel.parentElement.parentElement : null;
    if (!box) return;
    const entries = box.querySelectorAll(".relative");
    rows.slice(0, 5).forEach((r, idx) => {
      const node = entries[idx];
      if (!node) return;
      const name = node.querySelector("span.text-sm");
      const pct = node.querySelector("span.font-mono.text-sm");
      const bar = node.querySelector(".h-full");
      if (name) name.textContent = r.name;
      if (pct) pct.textContent = `${r.yield90 >= 0 ? "+" : ""}${r.yield90.toFixed(2)}%`;
      if (bar) bar.style.width = `${Math.max(12, Math.min(100, 30 + Math.abs(r.yield90) * 2))}%`;
    });
  }

  function updateCurve(rows) {
    if (!topCurve || !rows.length) return;
    const sorted = rows
      .slice()
      .sort((a, b) => b.yield90 - a.yield90)
      .slice(0, 6)
      .map((r) => Math.max(-20, Math.min(40, r.yield90)));
    const y0 = 200;
    const p = sorted
      .map((v, i) => `${i === 0 ? "M" : "T"}${i * 140} ${y0 - v * 3}`)
      .join(" ");
    topCurve.setAttribute("d", p);
  }

  async function load() {
    try {
      setStatus("正在同步回测与代理分析...", false);
      const [records, results, account] = await Promise.all([
        api.get("/simulation/records"),
        api.get("/results"),
        api.get("/simulation/account")
      ]);
      const agentRows = buildAgentRows(Array.isArray(records) ? records : []);
      const supplemented = agentRows.length
        ? agentRows
        : (Array.isArray(results) ? results : []).map((r, i) => ({
            id: i + 1,
            name: `Agent-${r.code}`,
            code: r.code,
            status: i % 2 === 0 ? "Running" : "Stopped",
            strategy: "Screener Driven",
            yield90: ((Number(r.price || 0) - Number(r.ma60 || 0)) / Math.max(1, Number(r.ma60 || 1))) * 100,
            drawdown: -Math.random() * 8
          }));

      supplemented.sort((a, b) => b.yield90 - a.yield90);
      renderTable(supplemented);
      renderRank(supplemented);
      updateCurve(supplemented);

      const aumNode = Array.from(document.querySelectorAll("span")).find((n) =>
        /TOTAL_AUM/i.test(n.textContent || "")
      );
      if (aumNode) {
        aumNode.textContent = `TOTAL_AUM: $${toNumber(account?.total_assets || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      }
      setStatus(`回测页已更新：代理 ${supplemented.length} 个`, false);
    } catch (e) {
      setStatus(e.message || "回测页加载失败", true);
    }
  }

  if (pauseAllBtn) {
    pauseAllBtn.addEventListener("click", function () {
      setStatus("模拟暂停：当前版本仅展示数据，不控制真实代理。", false);
    });
  }
  if (restartAllBtn) {
    restartAllBtn.addEventListener("click", load);
  }
  if (newBtn) {
    newBtn.addEventListener("click", function () {
      window.location.href = "../strategy_ai_sidebar_update/code.html";
    });
  }

  load();
  setInterval(load, 20000);
})();

