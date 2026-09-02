(function () {
  const path = (window.location.pathname || "").replace(/\\/g, "/").toLowerCase();
  const isAuthPage = path.includes("/auth_login_registration/");
  const api = window.QuartSysApi;

  const ROUTES = [
    {
      id: "dashboard",
      segment: "/market_dashboard_updated/",
      href: "../market_dashboard_updated/code.html",
      icon: "dashboard",
      en: "Dashboard",
      zh: "控制面板",
    },
    {
      id: "ai",
      segment: "/ai_market_insights/",
      href: "../ai_market_insights/code.html",
      icon: "auto_awesome",
      en: "AI Insights",
      zh: "AI洞察",
      iconClass: "text-purple-400",
    },
    {
      id: "screener",
      segment: "/stock_screener_reference_layout/",
      href: "../stock_screener_reference_layout/code.html",
      icon: "query_stats",
      en: "Screener",
      zh: "选股器",
    },
    {
      id: "strategy",
      segment: "/strategy_ai_sidebar_update/",
      href: "../strategy_ai_sidebar_update/code.html",
      icon: "psychology",
      en: "Strategy AI",
      zh: "AI策略",
    },
    {
      id: "backtesting",
      segment: "/backtesting_agent_analysis/",
      href: "../backtesting_agent_analysis/code.html",
      icon: "history_edu",
      en: "Backtesting",
      zh: "回测分析",
    },
    {
      id: "risk",
      segment: "/risk_monitor_updated/",
      href: "../risk_monitor_updated/code.html",
      icon: "security",
      en: "Risk Monitor",
      zh: "风险监控",
    },
    {
      id: "trading",
      segment: "/trading_terminal/",
      href: "../trading_terminal/code.html",
      icon: "monitoring",
      en: "Trading",
      zh: "交易终端",
    },
    {
      id: "settings",
      segment: "/user_center_settings/",
      href: "../user_center_settings/code.html",
      icon: "settings",
      en: "Settings",
      zh: "系统设置",
    },
  ];

  const I18N = {
    en: {
      marketOpen: "Market: OPEN",
      systemActive: "System Active",
      newStrategy: "NEW_STRATEGY",
      support: "Support",
      logs: "Logs",
      logoutTitle: "Click to logout",
      logoutConfirm: "Confirm logout?",
      languageBtn: "中文",
      aiAssistant: "AI Assistant",
      openAi: "Open AI Insights",
      close: "Close",
      aiHint: "Drag freely. Click to open panel.",
    },
    zh: {
      marketOpen: "市场：开盘",
      systemActive: "系统运行中",
      newStrategy: "新建策略",
      support: "支持",
      logs: "日志",
      logoutTitle: "点击退出登录",
      logoutConfirm: "确认退出登录？",
      languageBtn: "EN",
      aiAssistant: "AI 助手",
      openAi: "打开 AI 洞察",
      close: "关闭",
      aiHint: "可自由拖动，点击打开面板。",
    },
  };

  function getLang() {
    const saved = localStorage.getItem("quartsys_lang");
    if (saved === "zh" || saved === "en") return saved;
    return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function setLang(lang) {
    localStorage.setItem("quartsys_lang", lang);
  }

  function getToken() {
    if (!api || typeof api.getToken !== "function") return "";
    return api.getToken();
  }

  function logout() {
    try {
      if (api && typeof api.setToken === "function") api.setToken("");
      localStorage.removeItem("user");
      localStorage.removeItem("quartsys_user");
      window.location.href = "../auth_login_registration/code.html";
    } catch (e) {
      console.error(e);
    }
  }

  function getActiveRouteId() {
    const matched = ROUTES.find((r) => path.includes(r.segment));
    return matched ? matched.id : "";
  }

  function renderTopBar(lang) {
    const t = I18N[lang];
    return `
      <div class="flex items-center gap-8">
        <span class="text-xl font-bold tracking-tighter text-blue-500 dark:text-blue-400 font-['Space_Grotesk']">KINETIC_MONOLITH</span>
        <nav class="hidden md:flex items-center gap-6">
          <span id="qs-market-pill" class="text-blue-400 font-bold border-b-2 border-blue-500 py-1 h-14 flex items-center">${t.marketOpen}</span>
          <span id="qs-top-clock" class="text-slate-500 font-medium hover:text-blue-300 transition-colors duration-200 cursor-pointer font-['JetBrains_Mono']">CST 00:00:00</span>
        </nav>
      </div>
      <div class="flex items-center gap-4">
        <button id="qs-lang-toggle" class="px-2.5 py-1 rounded-lg text-xs border border-white/10 text-slate-300 hover:text-white hover:border-blue-400/40 transition-colors">${t.languageBtn}</button>
        <div class="relative group">
          <span class="material-symbols-outlined text-slate-400 group-hover:text-blue-400 cursor-pointer">sensors</span>
        </div>
        <div class="relative group">
          <span class="material-symbols-outlined text-slate-400 group-hover:text-blue-400 cursor-pointer">notifications</span>
          <span class="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"></span>
        </div>
        <div class="w-8 h-8 rounded-full overflow-hidden border border-white/10">
          <img alt="User Profile Avatar" data-alt="close-up portrait of a professional trader in a dark studio setting with blue ambient tech lighting" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCUmj94QB-nOoL2n5gqJ8Ui8GNG6NPB1xYdKP4nBb0u3fM1LMTkdu9uv_luzMjhEgUgM7uyyliQmbXW9NOzMnnccngqDJyRVanJuAhbq1sxmCCQF0LHkKok6ILcvS3I5tEvHQRLdQ5Ol5yVXF7lE-KU4EQyHvHWjKkoWLX1EdGZHORm5LhbRfL7JYzEJOXfNa4A9cfQ34UYad7IkrMt2KAoiIT11Cdfd9CKo78zlW0YWQXS5y8j2TQusvQD2nVDUMpXULLD0YhYaeo" />
        </div>
      </div>
    `;
  }

  function renderSideBar(lang, activeId) {
    const t = I18N[lang];
    const navHtml = ROUTES.map((r) => {
      const active = r.id === activeId;
      const navClass = active
        ? "group flex items-center px-4 py-3 gap-3 bg-blue-500/10 text-blue-400 border-r-2 border-blue-500 transition-all duration-300"
        : "group flex items-center px-4 py-3 gap-3 text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-300";
      const iconClass = r.iconClass || "";
      const label = lang === "zh" ? r.zh : r.en;
      return `
        <a class="${navClass}" href="${r.href}" data-route-id="${r.id}">
          <span class="material-symbols-outlined ${iconClass}">${r.icon}</span>
          <span class="font-['Inter'] text-sm font-medium tracking-wide">${label}</span>
        </a>
      `;
    }).join("");

    return `
      <div class="p-6">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-blue-400">monitoring</span>
          </div>
          <div>
            <h2 class="font-['Space_Grotesk'] text-lg font-black text-white leading-tight">QUANT_OS</h2>
            <p class="text-[10px] uppercase tracking-widest text-blue-500/80 font-bold">${t.systemActive}</p>
          </div>
        </div>
        <button id="qs-new-strategy-btn" class="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl font-bold text-sm tracking-tight hover:shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-sm">add</span>
          ${t.newStrategy}
        </button>
      </div>
      <nav class="flex-1 overflow-y-auto px-3 space-y-1 no-scrollbar">${navHtml}</nav>
      <div class="p-4 mt-auto border-t border-white/5 bg-[#0a0e1a]/50">
        <div class="flex items-center justify-around gap-2">
          <button class="flex flex-col items-center gap-1 text-slate-500 hover:text-white transition-colors" data-shell-action="support">
            <span class="material-symbols-outlined text-lg">help</span>
            <span class="text-[10px] font-medium font-['Inter']">${t.support}</span>
          </button>
          <button class="flex flex-col items-center gap-1 text-slate-500 hover:text-white transition-colors" data-shell-action="logs">
            <span class="material-symbols-outlined text-lg">terminal</span>
            <span class="text-[10px] font-medium font-['Inter']">${t.logs}</span>
          </button>
        </div>
      </div>
    `;
  }

  function ensureShellLayout() {
    const lang = getLang();
    const activeId = getActiveRouteId();

    let header = document.querySelector("body > header");
    if (!header) {
      header = document.createElement("header");
      document.body.prepend(header);
    }
    header.className = "fixed top-0 w-full z-50 flex items-center justify-between px-6 bg-[#131824] border-b border-white/5 h-14 shadow-[0_2px_10px_rgba(59,130,246,0.1)]";
    header.innerHTML = renderTopBar(lang);

    let aside = document.querySelector("body > aside");
    if (!aside) {
      aside = document.createElement("aside");
      if (header.nextSibling) {
        document.body.insertBefore(aside, header.nextSibling);
      } else {
        document.body.appendChild(aside);
      }
    }
    aside.className = "fixed left-0 top-0 h-full w-64 flex flex-col z-40 bg-[#131824] border-r border-white/5 pt-14";
    aside.innerHTML = renderSideBar(lang, activeId);

    const main = document.querySelector("main");
    if (main) {
      main.classList.add("pt-14");
      main.classList.add("h-screen");
      main.classList.add("overflow-y-auto");
      main.classList.remove("ml-64");
      main.classList.add("pl-64");
    }
  }

  function bindShellActions() {
    const lang = getLang();
    const t = I18N[lang];

    const langBtn = document.getElementById("qs-lang-toggle");
    if (langBtn && !langBtn.dataset.bound) {
      langBtn.dataset.bound = "1";
      langBtn.addEventListener("click", function () {
        setLang(getLang() === "zh" ? "en" : "zh");
        ensureShellLayout();
        bindShellActions();
        updateClock();
        mountAssistant();
      });
    }

    const strategyBtn = document.getElementById("qs-new-strategy-btn");
    if (strategyBtn && !strategyBtn.dataset.bound) {
      strategyBtn.dataset.bound = "1";
      strategyBtn.addEventListener("click", function () {
        window.location.href = "../strategy_ai_sidebar_update/code.html";
      });
    }

    const avatar = document.querySelector("header img[alt='User Profile Avatar']");
    if (avatar && !avatar.dataset.bound) {
      avatar.dataset.bound = "1";
      avatar.style.cursor = "pointer";
      avatar.title = t.logoutTitle;
      avatar.addEventListener("click", function () {
        if (window.confirm(t.logoutConfirm)) logout();
      });
    }

    document.querySelectorAll("[data-shell-action='support']").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        window.location.href = "../user_center_settings/code.html";
      });
    });

    document.querySelectorAll("[data-shell-action='logs']").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        window.location.href = "../backtesting_agent_analysis/code.html";
      });
    });
  }

  function updateClock() {
    const node = document.getElementById("qs-top-clock");
    if (!node) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    node.textContent = `CST ${hh}:${mm}:${ss}`;
  }

  function ensureAssistantStyles() {
    if (document.getElementById("qs-assistant-style")) return;
    const style = document.createElement("style");
    style.id = "qs-assistant-style";
    style.textContent = `
      #qs-assistant-fab {
        position: fixed;
        width: 56px;
        height: 56px;
        border: 0;
        border-radius: 16px;
        background: linear-gradient(135deg, #2563eb, #4f46e5, #7c3aed);
        color: #fff;
        box-shadow: 0 8px 28px rgba(79, 70, 229, 0.55);
        z-index: 80;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
      }
      #qs-assistant-fab:active { cursor: grabbing; }
      #qs-assistant-panel {
        position: fixed;
        width: 220px;
        background: rgba(19, 24, 36, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        box-shadow: 0 10px 30px rgba(2, 6, 23, 0.6);
        color: #dbe4ff;
        z-index: 81;
        padding: 12px;
      }
      #qs-assistant-panel button {
        width: 100%;
        margin-top: 8px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(37, 99, 235, 0.2);
        color: #dbe4ff;
        font-size: 12px;
      }
      #qs-assistant-panel button:hover {
        border-color: rgba(99, 102, 241, 0.5);
        background: rgba(37, 99, 235, 0.35);
      }
    `;
    document.head.appendChild(style);
  }

  function removeLegacyFloatingAssistants() {
    const fixedNodes = Array.from(document.querySelectorAll("button.fixed, div.fixed, a.fixed"));
    fixedNodes.forEach((node) => {
      const cls = String(node.className || "");
      if (!/bottom-/.test(cls) || !/right-/.test(cls)) return;
      if (!/psychology/i.test(node.textContent || "")) return;
      if (node.id === "qs-assistant-fab" || node.id === "qs-assistant-panel") return;
      node.style.display = "none";
    });
  }

  function getAssistantPosition() {
    try {
      const raw = localStorage.getItem("quartsys_assistant_pos");
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (typeof p.x !== "number" || typeof p.y !== "number") return null;
      return p;
    } catch (e) {
      return null;
    }
  }

  function clampPosition(x, y) {
    const maxX = Math.max(8, window.innerWidth - 64);
    const maxY = Math.max(8, window.innerHeight - 64);
    return {
      x: Math.max(8, Math.min(x, maxX)),
      y: Math.max(8, Math.min(y, maxY)),
    };
  }

  function placeAssistant(fab, panel, x, y) {
    const clamped = clampPosition(x, y);
    fab.style.left = `${clamped.x}px`;
    fab.style.top = `${clamped.y}px`;

    if (!panel) return;
    const panelX = clamped.x - 170;
    const panelY = clamped.y - 10;
    const p = clampPosition(panelX, panelY);
    panel.style.left = `${p.x}px`;
    panel.style.top = `${p.y}px`;
  }

  function mountAssistant() {
    ensureAssistantStyles();
    removeLegacyFloatingAssistants();

    const lang = getLang();
    const t = I18N[lang];

    let fab = document.getElementById("qs-assistant-fab");
    if (!fab) {
      fab = document.createElement("button");
      fab.id = "qs-assistant-fab";
      fab.innerHTML = '<span class="material-symbols-outlined text-2xl">psychology</span>';
      document.body.appendChild(fab);
    }

    let panel = document.getElementById("qs-assistant-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "qs-assistant-panel";
      panel.style.display = "none";
      document.body.appendChild(panel);
    }
    panel.innerHTML = `
      <div class="text-sm font-semibold">${t.aiAssistant}</div>
      <div class="text-xs text-slate-400 mt-1">${t.aiHint}</div>
      <button id="qs-open-ai">${t.openAi}</button>
      <button id="qs-close-ai">${t.close}</button>
    `;

    const stored = getAssistantPosition();
    const startX = stored ? stored.x : window.innerWidth - 84;
    const startY = stored ? stored.y : window.innerHeight - 120;
    placeAssistant(fab, panel, startX, startY);

    const openBtn = panel.querySelector("#qs-open-ai");
    const closeBtn = panel.querySelector("#qs-close-ai");
    if (openBtn) {
      openBtn.addEventListener("click", function () {
        panel.style.display = "none";
        window.location.href = "../ai_market_insights/code.html";
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        panel.style.display = "none";
      });
    }

    if (fab.dataset.dragBound === "1") return;
    fab.dataset.dragBound = "1";

    let dragging = false;
    let moved = false;
    let dx = 0;
    let dy = 0;

    fab.addEventListener("pointerdown", function (e) {
      dragging = true;
      moved = false;
      const rect = fab.getBoundingClientRect();
      dx = e.clientX - rect.left;
      dy = e.clientY - rect.top;
      fab.setPointerCapture(e.pointerId);
    });

    fab.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      moved = true;
      const x = e.clientX - dx;
      const y = e.clientY - dy;
      placeAssistant(fab, panel, x, y);
    });

    fab.addEventListener("pointerup", function () {
      if (!dragging) return;
      dragging = false;
      const rect = fab.getBoundingClientRect();
      const clamped = clampPosition(rect.left, rect.top);
      localStorage.setItem("quartsys_assistant_pos", JSON.stringify(clamped));
      if (!moved) {
        panel.style.display = panel.style.display === "none" ? "block" : "none";
      }
    });

    window.addEventListener("resize", function () {
      const rect = fab.getBoundingClientRect();
      placeAssistant(fab, panel, rect.left, rect.top);
    });
  }

  if (!isAuthPage && !getToken()) {
    window.location.href = "../auth_login_registration/code.html";
    return;
  }

  if (isAuthPage) return;

  ensureShellLayout();
  bindShellActions();
  updateClock();
  mountAssistant();
  window.setInterval(updateClock, 1000);
})();

