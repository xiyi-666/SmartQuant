(function () {
  const api = window.QuartSysApi;
  if (!api) return;

  const tickerInput = document.querySelector('input[value="BTC/USDT"]') || document.querySelectorAll('input[type="text"]')[0];
  const qtyInput = document.querySelector('input[value="0.45"]') || document.querySelectorAll('input[type="text"]')[1];
  const buyBtn = Array.from(document.querySelectorAll('button')).find((b) => /BUY\/UP/i.test(b.textContent || ''));
  const sellBtn = Array.from(document.querySelectorAll('button')).find((b) => /SELL\/DOWN/i.test(b.textContent || ''));
  const navNode = document.querySelector('p.font-mono.text-2xl.font-bold.text-white');
  const availableNode = Array.from(document.querySelectorAll('span.text-on-surface-variant')).find((s) => /Available Funds/i.test(s.textContent || ''))?.nextElementSibling;
  const posValueNode = Array.from(document.querySelectorAll('span.text-on-surface-variant')).find((s) => /Position Value/i.test(s.textContent || ''))?.nextElementSibling;
  const tbody = document.querySelector('section table tbody');

  const status = document.createElement('div');
  status.className = 'text-xs text-slate-400 px-6 py-2';
  const main = document.querySelector('main');
  if (main) {
    main.insertBefore(status, main.firstChild);
  }

  function setStatus(text, isError) {
    status.textContent = text || '';
    status.className = `text-xs px-6 py-2 ${isError ? 'text-red-400' : 'text-slate-400'}`;
  }

  function normalizeCode(raw) {
    const val = (raw || '').trim();
    if (!val) return '';
    return val.split('/')[0];
  }

  function renderPositions(rows) {
    if (!tbody) return;
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      tbody.innerHTML = '<tr><td class="px-6 py-6 text-slate-500" colspan="6">No active positions</td></tr>';
      return;
    }

    tbody.innerHTML = list.map((p) => {
      const profit = Number(p.profit || 0);
      const profitColor = profit >= 0 ? 'text-green-400' : 'text-red-400';
      return `
        <tr class="hover:bg-white/5 transition-colors group">
          <td class="px-6 py-4 text-xs font-bold text-white">${p.stock_code}</td>
          <td class="px-6 py-4 text-xs text-slate-400">SPOT</td>
          <td class="px-6 py-4 text-right font-mono text-xs text-on-surface-variant">${Number(p.quantity || 0).toFixed(0)}</td>
          <td class="px-6 py-4 text-right font-mono text-xs text-on-surface-variant">${Number(p.avg_price || 0).toFixed(2)}</td>
          <td class="px-6 py-4 text-right font-mono text-xs text-white">${Number(p.current_price || 0).toFixed(2)}</td>
          <td class="px-6 py-4 text-right"><span class="font-mono text-xs ${profitColor} font-bold">${profit >= 0 ? '+' : ''}${profit.toFixed(2)}</span></td>
        </tr>
      `;
    }).join('');
  }

  async function loadAccount() {
    try {
      const data = await api.get('/simulation/account');
      const total = Number(data.total_assets || 0);
      const balance = Number(data.balance || 0);
      const positions = Array.isArray(data.positions) ? data.positions : [];
      const posVal = positions.reduce((s, p) => s + Number(p.market_value || 0), 0);

      if (navNode) navNode.textContent = `$${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      if (availableNode) availableNode.textContent = `$${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      if (posValueNode) posValueNode.textContent = `$${posVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      renderPositions(positions);
      setStatus('Account synced', false);
    } catch (e) {
      setStatus(e.message || '账户同步失败', true);
    }
  }

  async function trade(side) {
    const rawCode = tickerInput ? tickerInput.value : '';
    const code = normalizeCode(rawCode);
    const qRaw = qtyInput ? qtyInput.value : '100';
    let qty = Math.max(100, Math.floor(Number(qRaw) || 100));
    if (side === 'buy') {
      qty = Math.floor(qty / 100) * 100;
      if (qty < 100) qty = 100;
    }

    if (!code) {
      setStatus('请输入交易代码', true);
      return;
    }

    try {
      let quote = null;
      try {
        quote = await api.get(`/stock/quote/${encodeURIComponent(code)}`);
      } catch (e) {
        quote = { close: 1 };
      }

      await api.post('/simulation/trade', {
        stock_code: code,
        stock_name: code,
        price: Number(quote.close || 1),
        quantity: qty,
        trade_type: side,
      });
      setStatus(`${side === 'buy' ? '买入' : '卖出'}成功: ${code} x ${qty}`, false);
      await loadAccount();
    } catch (e) {
      setStatus(e.message || '交易失败', true);
    }
  }

  if (buyBtn) {
    buyBtn.addEventListener('click', () => trade('buy'));
  }
  if (sellBtn) {
    sellBtn.addEventListener('click', () => trade('sell'));
  }

  const fromUrl = new URLSearchParams(window.location.search).get('code');
  if (fromUrl && tickerInput) {
    tickerInput.value = fromUrl;
  }
  if (qtyInput && (!qtyInput.value || Number(qtyInput.value) < 100)) {
    qtyInput.value = '100';
  }

  loadAccount();
  setInterval(loadAccount, 8000);
})();
