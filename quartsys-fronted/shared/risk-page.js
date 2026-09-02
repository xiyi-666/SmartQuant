(function () {
  const api = window.QuartSysApi;
  if (!api) return;

  const main = document.querySelector("main .p-8");
  const status = document.createElement("div");
  status.className = "text-xs text-slate-400 mb-4";
  if (main) main.prepend(status);

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.className = `text-xs mb-4 ${isError ? "text-red-400" : "text-slate-400"}`;
  }

  function getMetricValueNode(label) {
    const labelNode = Array.from(document.querySelectorAll("span")).find((n) =>
      (n.textContent || "").toLowerCase().includes(label.toLowerCase())
    );
    if (!labelNode) return null;
    return labelNode.parentElement ? labelNode.parentElement.querySelector("span.text-2xl") : null;
  }

  function updateTopRibbon(score, var95, beta) {
    const scoreNode = getMetricValueNode("Global Risk Score");
    const varNode = getMetricValueNode("VAR (95%)");
    const betaNode = getMetricValueNode("Beta Exposure");
    if (scoreNode) {
      const level = score >= 70 ? "HIGH" : score >= 40 ? "MID" : "LOW";
      scoreNode.innerHTML = `${score.toFixed(1)} <span class="text-xs font-normal text-slate-400 uppercase tracking-widest">${level}</span>`;
    }
    if (varNode) varNode.textContent = `${var95 >= 0 ? "+" : ""}${var95.toFixed(1)}K`;
    if (betaNode) betaNode.textContent = beta.toFixed(2);
  }

  function updateRiskBars(score) {
    const bars = Array.from(document.querySelectorAll("div.h-64 > div.flex-1"));
    if (!bars.length) return;
    bars.forEach((bar, idx) => {
      const base = 20 + ((idx * 9 + score) % 48);
      bar.style.height = `${base}%`;
    });
  }

  function updateCapitalFlow(watchGroups) {
    const panel = Array.from(document.querySelectorAll("div")).find((n) =>
      /Capital Flow \(Top Indices\)/i.test(n.textContent || "")
    );
    if (!panel) return;
    const flowRows = panel.querySelectorAll(".space-y-4 > .flex.flex-col.gap-1");
    const entries = Object.entries(watchGroups || {});
    flowRows.forEach((row, idx) => {
      const [name, items] = entries[idx] || [`Sector-${idx + 1}`, []];
      const count = Array.isArray(items) ? items.length : 0;
      const flow = (count * 0.35 + 0.2) * (idx % 2 === 0 ? 1 : -1);
      const nameNode = row.querySelector("span");
      const valueNode = row.querySelector("span:last-child");
      const bar = row.querySelector("div.h-full");
      if (nameNode) nameNode.textContent = name;
      if (valueNode) {
        valueNode.textContent = `${flow >= 0 ? "+" : "-"}$${Math.abs(flow).toFixed(1)}B`;
        valueNode.className = `mono-text ${flow >= 0 ? "text-green-400" : "text-error"}`;
      }
      if (bar) bar.style.width = `${Math.min(95, 15 + count * 18)}%`;
    });
  }

  function updateEvents(results) {
    const cards = Array.from(document.querySelectorAll("h4.font-bold.text-sm.mb-2"));
    if (!cards.length) return;
    cards.slice(0, 4).forEach((h4, idx) => {
      const r = results[idx];
      if (!r) return;
      h4.textContent = `${r.code} ${r.name} 信号事件`;
      const p = h4.parentElement ? h4.parentElement.querySelector("p") : null;
      if (p) {
        p.textContent = `筛选价 ${Number(r.price || 0).toFixed(2)}，MA60 ${Number(r.ma60 || 0).toFixed(2)}。建议结合回测模块确认仓位。`;
      }
    });
  }

  function updateAiAssessment(score, account) {
    const para = Array.from(document.querySelectorAll("p")).find((n) =>
      /System detects/i.test(n.textContent || "")
    );
    if (!para) return;
    const positions = Array.isArray(account?.positions) ? account.positions.length : 0;
    const stance = score >= 70 ? "防御" : score >= 40 ? "平衡" : "进攻";
    para.innerHTML = `系统检测当前风险评分 <span class="text-secondary font-bold">${score.toFixed(1)}</span>，持仓数量 ${positions}。建议采用 <strong class="text-on-surface">${stance}</strong> 配置并动态管理止损。`;
  }

  async function load() {
    try {
      setStatus("正在同步风险监控数据...", false);
      const [account, results, watchData] = await Promise.all([
        api.get("/simulation/account"),
        api.get("/results"),
        api.get("/watchlist")
      ]);
      const positions = Array.isArray(account?.positions) ? account.positions : [];
      const totalAssets = Number(account?.total_assets || 0);
      const resultCount = Array.isArray(results) ? results.length : 0;
      const score = Math.min(95, Math.max(5, 22 + positions.length * 10 + resultCount * 1.1));
      const var95 = -(totalAssets * (score / 100) * 0.015) / 1000;
      const beta = Math.min(1.8, 0.55 + positions.length * 0.08 + resultCount * 0.01);

      updateTopRibbon(score, var95, beta);
      updateRiskBars(score);
      updateCapitalFlow((watchData && watchData.groups) || {});
      updateEvents(Array.isArray(results) ? results : []);
      updateAiAssessment(score, account);
      setStatus(`风险页已更新：评分 ${score.toFixed(1)}`, false);
    } catch (e) {
      setStatus(e.message || "风险页同步失败", true);
    }
  }

  load();
  setInterval(load, 20000);
})();

