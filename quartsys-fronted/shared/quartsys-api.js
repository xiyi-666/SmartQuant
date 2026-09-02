(function () {
  const savedBase = localStorage.getItem('quartsys_api_base');
  const envBase = window.QUARTSYS_API_BASE;
  const defaultBase = `${window.location.protocol}//${window.location.hostname}:18427/api`;

  function normalizeBase(url) {
    return (url || defaultBase).replace(/\/$/, '');
  }
  let apiBase = normalizeBase(savedBase || envBase || defaultBase);
  const loopbackBase = 'http://127.0.0.1:18427/api';

  function getToken() {
    return localStorage.getItem('token') || localStorage.getItem('quartsys_token') || '';
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('quartsys_token', token);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('quartsys_token');
    }
  }

  function setApiBase(url) {
    apiBase = normalizeBase(url);
    localStorage.setItem('quartsys_api_base', apiBase);
  }

  async function request(path, options) {
    const opts = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const candidates = [apiBase, defaultBase, loopbackBase].map(normalizeBase).filter(Boolean);
    const uniqueCandidates = [...new Set(candidates)];
    let lastNetworkError = null;

    for (const base of uniqueCandidates) {
      try {
        const response = await fetch(`${base}${path}`, {
          method: opts.method || 'GET',
          headers,
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        });

        let data = null;
        try {
          data = await response.json();
        } catch (e) {
          data = null;
        }

        if (!response.ok) {
          const msg = (data && (data.detail || data.message || data.error)) || `HTTP ${response.status}`;
          throw new Error(msg);
        }

        if (base !== apiBase) {
          apiBase = base;
          localStorage.setItem('quartsys_api_base', apiBase);
        }
        return data;
      } catch (error) {
        const isNetworkError = error instanceof TypeError;
        if (!isNetworkError) throw error;
        lastNetworkError = error;
      }
    }

    throw lastNetworkError || new Error('后端不可达');
  }

  window.QuartSysApi = {
    get apiBase() {
      return apiBase;
    },
    setApiBase,
    getToken,
    setToken,
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    delete: (path, body) => request(path, { method: 'DELETE', body }),
  };
})();
