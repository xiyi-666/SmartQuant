(function () {
  const api = window.QuartSysApi;
  if (!api) return;

  const tableBody = document.querySelector('table tbody');
  const runBtn = Array.from(document.querySelectorAll('button')).find((b) => /NEW_STRATEGY/i.test(b.textContent || ''));
  const watchAllBtn = Array.from(document.querySelectorAll('button')).find((b) => /Watch All/i.test(b.textContent || ''));
  const stockQueryInput = document.querySelector('input[placeholder="NVDA"]');
  const filterInput = document.querySelector('input[placeholder*="Filter by ticker"]');
  const countNode = document.querySelector('span.text-5xl');

  if (!tableBody) return;

  const status = document.createElement('div');
  status.className = 'text-xs text-slate-400 p-4 border-b border-white/5';
  const tableCard = tableBody.closest('.bg-surface-container-low');
  if (tableCard) {
    tableCard.insertBefore(status, tableCard.firstChild);
  }

  let allRows = [];

  function setStatus(text, isError) {
    status.textContent = text || '';
    status.className = `text-xs p-4 border-b border-white/5 ${isError ? 'text-red-400' : 'text-slate-400'}`;
  }

  function renderRows(rows) {
    const list = rows || [];
    if (countNode) countNode.textContent = String(list.length);

    if (!list.length) {
      tableBody.innerHTML = '<tr><td class="px-6 py-6 text-slate-500" colspan="8">No data</td></tr>';
      return;
    }

    tableBody.innerHTML = list.slice(0, 120).map((r) => {
      const slope = Number(r.slope || 0);
      const slopeColor = slope >= 0 ? 'text-green-400' : 'text-red-400';
      return `
        <tr class="hover:bg-white/[0.02] transition-colors group">
          <td class="px-6 py-4 font-mono font-bold text-primary">${r.code || ''}</td>
          <td class="px-6 py-4 text-xs font-medium">${r.name || ''}</td>
          <td class="px-6 py-4 text-amber-400">${'★'.repeat(4)}</td>
          <td class="px-6 py-4 font-mono text-sm">${Number(r.price || 0).toFixed(2)}</td>
          <td class="px-6 py-4 font-mono text-sm text-slate-400">${Number(r.ma60 || 0).toFixed(2)}</td>
          <td class="px-6 py-4 font-mono text-sm ${slopeColor}">${slope.toFixed(2)}%</td>
          <td class="px-6 py-4 text-xs text-slate-400">${r.industry || '-'}</td>
          <td class="px-6 py-4 text-right">
            <button class="js-add-watch p-1 hover:text-white transition-colors ml-2" data-code="${r.code || ''}" data-name="${r.name || ''}">
              <span class="material-symbols-outlined text-lg">add_circle</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tableBody.querySelectorAll('.js-add-watch').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api.post('/watchlist', {
            group_name: '默认分组',
            code: btn.getAttribute('data-code'),
            name: btn.getAttribute('data-name'),
            color: '#3b82f6',
          });
          setStatus(`已加入自选: ${btn.getAttribute('data-code')}`, false);
        } catch (e) {
          setStatus(e.message || '加入自选失败', true);
        }
      });
    });
  }

  async function loadResults() {
    try {
      setStatus('Loading screener results...', false);
      const rows = await api.get('/results');
      allRows = Array.isArray(rows) ? rows : [];
      renderRows(allRows);
      setStatus(`Loaded ${allRows.length} records`, false);
    } catch (e) {
      setStatus(e.message || '获取结果失败', true);
      renderRows([]);
    }
  }

  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      try {
        setStatus('Running screen task...', false);
        await api.post('/screen', {
          params: { enabled_conditions: ['ma60'], match_mode: 'all', ma_proximity_threshold: 0.15 },
        });
        await loadResults();
      } catch (e) {
        setStatus(e.message || '筛选失败', true);
      }
    });
  }

  if (watchAllBtn) {
    watchAllBtn.addEventListener('click', async () => {
      try {
        const top = allRows.slice(0, 30);
        await Promise.all(top.map((r) => api.post('/watchlist', {
          group_name: '默认分组',
          code: r.code,
          name: r.name,
          color: '#3b82f6',
        })));
        setStatus(`已批量加入 ${top.length} 条自选`, false);
      } catch (e) {
        setStatus(e.message || '批量加入失败', true);
      }
    });
  }

  if (filterInput) {
    filterInput.addEventListener('input', () => {
      const kw = (filterInput.value || '').trim().toLowerCase();
      if (!kw) {
        renderRows(allRows);
        return;
      }
      const filtered = allRows.filter((r) => `${r.code || ''} ${r.name || ''}`.toLowerCase().includes(kw));
      renderRows(filtered);
    });
  }

  if (stockQueryInput) {
    stockQueryInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = (stockQueryInput.value || '').trim();
      if (!q) return;
      try {
        const hit = await api.get(`/search?q=${encodeURIComponent(q)}`);
        const target = (Array.isArray(hit) && hit[0] && hit[0].code) ? hit[0].code : q;
        const quote = await api.get(`/stock/quote/${encodeURIComponent(target)}`);
        const strongs = Array.from(document.querySelectorAll('strong.text-white'));
        if (strongs[0]) strongs[0].textContent = Number(quote.open || 0).toFixed(2);
        if (strongs[1]) strongs[1].textContent = Number(quote.high || 0).toFixed(2);
        if (strongs[2]) strongs[2].textContent = Number(quote.low || 0).toFixed(2);
        const closeNode = document.querySelector('span.text-green-400.font-bold');
        if (closeNode) closeNode.textContent = `C: ${Number(quote.close || 0).toFixed(2)}`;
        setStatus(`已更新行情: ${target}`, false);
      } catch (err) {
        setStatus(err.message || '查询行情失败', true);
      }
    });
  }

  loadResults();
})();
