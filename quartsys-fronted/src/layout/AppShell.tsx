import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  Bolt,
  BookOpen,
  BarChart3,
  BrainCircuit,
  ChartCandlestick,
  Coins,
  DollarSign,
  History,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { LANGUAGE_SELECT_OPTIONS, useLanguage, type LanguageMode } from "../shared/language";
import AssistantFab from "./AssistantFab";
import { api } from "../api";
import { pickBestSecurityMatch } from "../shared/securitySearch";
import {
  canAccessPath,
  clearAuth,
  firstAccessiblePath,
  getAuthUser,
  hasPermission,
  ROUTE_PERMISSIONS,
  ROLE_LABELS,
  setAuthUser,
} from "../shared/auth";
import {
  formatMarketTime,
  isMarketTradingSession,
  MARKET_DEFINITIONS,
  MARKET_ORDER,
  useMarket,
} from "../shared/market";
import { useTheme } from "../shared/theme";
import { COMMUNITY_EDITION } from "../shared/edition";

const NAV_ITEMS: Array<{
  to: string;
  Icon: LucideIcon;
  key: string;
  permission: string;
}> = [
  { to: "/dashboard", Icon: LayoutDashboard, key: "dashboard", permission: ROUTE_PERMISSIONS["/dashboard"] },
  { to: "/screener", Icon: Search, key: "screener", permission: ROUTE_PERMISSIONS["/screener"] },
  { to: "/quote", Icon: ChartCandlestick, key: "quote", permission: ROUTE_PERMISSIONS["/quote"] },
  { to: "/strategy", Icon: BrainCircuit, key: "strategyAi", permission: ROUTE_PERMISSIONS["/strategy"] },
  { to: "/factor-mining", Icon: Network, key: "factorMining", permission: ROUTE_PERMISSIONS["/factor-mining"] },
  { to: "/backtesting", Icon: History, key: "backtesting", permission: ROUTE_PERMISSIONS["/backtesting"] },
  { to: "/risk", Icon: ShieldCheck, key: "riskMonitor", permission: ROUTE_PERMISSIONS["/risk"] },
  { to: "/ai-insights", Icon: Sparkles, key: "aiInsights", permission: ROUTE_PERMISSIONS["/ai-insights"] },
  { to: "/smart-research", Icon: BookOpen, key: "smartResearch", permission: ROUTE_PERMISSIONS["/smart-research"] },
  { to: "/agent-analysis", Icon: Network, key: "agentAnalysis", permission: ROUTE_PERMISSIONS["/agent-analysis"] },
  { to: "/trading", Icon: LineChart, key: "trading", permission: ROUTE_PERMISSIONS["/trading"] },
  ...(!COMMUNITY_EDITION ? [{ to: "/revenue", Icon: DollarSign, key: "revenue", permission: ROUTE_PERMISSIONS["/revenue"] }] : []),
  ...(!COMMUNITY_EDITION ? [{ to: "/analytics", Icon: BarChart3, key: "analytics", permission: ROUTE_PERMISSIONS["/analytics"] }] : []),
  ...(!COMMUNITY_EDITION ? [{ to: "/token-cost", Icon: Coins, key: "tokenCost", permission: ROUTE_PERMISSIONS["/token-cost"] }] : []),
  { to: "/settings", Icon: Settings, key: "settings", permission: ROUTE_PERMISSIONS["/settings"] },
];

const ROLE_LABELS_EN: Record<string, string> = {
  admin: "Administrator",
  normal: "Community User",
  user: "Community User",
  vip: "Community User",
  svip: "Community User",
};

function roleText(role: string | undefined, lang: "zh" | "en") {
  const key = String(role || "user").toLowerCase();
  if (lang === "zh") return ROLE_LABELS[key] || role || "用户";
  return ROLE_LABELS_EN[key] || role || "User";
}

function formatSearchExchange(code?: string, fullCode?: string, board?: string, lang: "zh" | "en" = "zh") {
  const normalized = (fullCode || code || "").toUpperCase();
  if (normalized.endsWith(".SH")) return lang === "zh" ? "上交所" : "SSE";
  if (normalized.endsWith(".SZ")) return lang === "zh" ? "深交所" : "SZSE";
  if (normalized.endsWith(".BJ")) return lang === "zh" ? "北交所" : "BSE";
  if (normalized.endsWith(".HK") || normalized.startsWith("HK")) {
    return lang === "zh" ? "港交所" : "HKEX";
  }
  if (normalized.endsWith(".US") || normalized.startsWith("US")) {
    return lang === "zh" ? "美股" : "US";
  }
  const digits = String(code || "").replace(/\D/g, "");
  if (/^(600|601|603|605|688|689)/.test(digits)) return lang === "zh" ? "上交所" : "SSE";
  if (/^(000|001|002|003|300|301)/.test(digits)) return lang === "zh" ? "深交所" : "SZSE";
  if (/^(4|8|9)/.test(digits)) return lang === "zh" ? "北交所" : "BSE";
  return board || (lang === "zh" ? "交易所" : "Exchange");
}


function GlobalSearch() {
  const { lang } = useLanguage();
  const { market, definition } = useMarket();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{code:string;name:string;full_code?:string;board?:string}[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const requestSequence = useRef(0);
  const navigate = useNavigate();

  const openResult = (result: { code: string }) => {
    requestSequence.current += 1;
    setQ("");
    setResults([]);
    setSearchState("idle");
    navigate(`/quote?code=${encodeURIComponent(result.code)}`);
  };

  const submitSearch = async () => {
    const query = q.trim();
    if (!query) return;
    const requestId = ++requestSequence.current;
    setResults([]);
    setSearchState("loading");
    try {
      const response = await api.searchStocks(query, market);
      if (requestSequence.current !== requestId) return;
      const bestMatch = pickBestSecurityMatch(Array.isArray(response) ? response : [], query);
      if (bestMatch) {
        openResult(bestMatch);
        return;
      }
      setSearchState("empty");
    } catch {
      if (requestSequence.current === requestId) setSearchState("error");
    }
  };

  useEffect(() => {
    const query = q.trim();
    const requestId = ++requestSequence.current;
    setResults([]);
    if (!query) {
      setSearchState("idle");
      return;
    }
    setSearchState("loading");
    const t = setTimeout(() => {
      api
        .searchStocks(query, market)
        .then((r:any) => {
          if (requestSequence.current !== requestId) return;
          const matches = Array.isArray(r) ? r : [];
          setResults(matches);
          setSearchState(matches.length ? "idle" : "empty");
        })
        .catch(() => {
          if (requestSequence.current === requestId) setSearchState("error");
        });
    }, 300);
    return () => {
      clearTimeout(t);
    };
  }, [q, market]);

  return (
    <form className="qs-global-search" onSubmit={(event) => { event.preventDefault(); void submitSearch(); }}>
      <button
        className="qs-global-search-submit"
        type="submit"
        aria-label={lang === "zh" ? "搜索并打开最匹配标的" : "Search and open best match"}
        title={lang === "zh" ? "搜索" : "Search"}
      >
        <Search size={16} aria-hidden="true" />
      </button>
      <input
        value={q} onChange={e=>setQ(e.target.value)}
        placeholder={lang === "zh" ? `搜索${definition.labelZh}代码或名称` : `Search ${definition.labelEn}`}
        aria-label={lang === "zh" ? `搜索${definition.labelZh}股票` : `Search ${definition.labelEn} securities`}
      />
      {results.length>0 && (
        <div className="qs-global-search-results">
          {results.slice(0,8).map(r=>(
            <button key={r.code} type="button" onClick={()=>openResult(r)}
              className="qs-global-search-result">
              <span>{r.code}</span>
              <strong>{r.name}</strong>
              <small>{formatSearchExchange(r.code, r.full_code, r.board, lang)}</small>
            </button>
          ))}
        </div>
      )}
      {q.trim() && searchState !== "loading" && results.length === 0 && (
        <div className="qs-global-search-message" role="status">
          {searchState === "error"
            ? (lang === "zh" ? "搜索暂时不可用，请稍后重试" : "Search is temporarily unavailable. Try again later.")
            : (lang === "zh" ? "未找到匹配标的" : "No matching security found")}
        </div>
      )}
    </form>
  );
}

export default function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t, languageMode, setLanguageMode, lang } = useLanguage();
  const { market, setMarket, definition } = useMarket();
  const { theme, toggleTheme } = useTheme();
  const brandName = lang === "zh" ? "QaurtSmart" : "QaurtSmart";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [notifs, setNotifs] = useState<any[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(
    () => localStorage.getItem("quartsys_avatar_url") || "",
  );
  const [profileName, setProfileName] = useState(
    () => localStorage.getItem("quartsys_user") || "U",
  );
  const [profileRole, setProfileRole] = useState(
    () => getAuthUser()?.role || "user",
  );
  const [profilePermissionsKey, setProfilePermissionsKey] = useState(
    () => JSON.stringify(getAuthUser()?.permissions || []),
  );
  const [aiConnected, setAiConnected] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [demoMode, setDemoMode] = useState(false);
  const unreadCount = notifs.filter((n) => !n.read).length;
  const accessibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => hasPermission(item.permission)),
    [profileName, profileRole, profilePermissionsKey],
  );
  const canUseNotifications = hasPermission("notifications.manage");
  const canUseTrading = hasPermission("trading.use");
  const canUseAssistant = hasPermission("assistant.use");

  useEffect(() => {
    let cancelled = false;
    if (COMMUNITY_EDITION) {
      localStorage.removeItem("quartsys_demo_mode_active");
    }
    api.getPublicSiteSettings().then((settings: any) => {
      if (cancelled) return;
      const user = getAuthUser();
      const configuredDemoUser = String(settings?.demo_username || "").trim().toLowerCase();
      const currentUser = String(user?.username || "").trim().toLowerCase();
      const activeDemo = !COMMUNITY_EDITION && Boolean(settings?.demo_mode_enabled) && (!configuredDemoUser || configuredDemoUser === currentUser);
      setDemoMode(activeDemo);
      if (activeDemo) localStorage.setItem("quartsys_demo_mode_active", "1");
      else localStorage.removeItem("quartsys_demo_mode_active");
      const seenKey = `quartsys_onboarding_seen:${String(user?.id || user?.username || "user")}`;
      if (settings?.onboarding_enabled !== false && !localStorage.getItem(seenKey)) {
        setOnboardingVisible(true);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const closeOnboarding = () => {
    const user = getAuthUser();
    localStorage.setItem(`quartsys_onboarding_seen:${String(user?.id || user?.username || "user")}`, "1");
    setOnboardingVisible(false);
  };

  const onboardingSteps = lang === "zh"
    ? [
        { icon: "⌂", title: "先看懂市场", text: "从控制面板和行情页开始，查看指数、自选标的和最新行情。" },
        { icon: "⌕", title: "筛选研究标的", text: "使用选股器和因子条件，建立自己的研究股票池。" },
        { icon: "✦", title: "配置策略与因子", text: "创建因子、策略和参数，把研究想法固化为可复用流程。" },
        { icon: "◒", title: "回测并检查风险", text: "运行回测，结合你自己配置的风险规则评估结果。" },
        { icon: "↗", title: "模拟交易", text: "最后在模拟账户中验证策略，熟悉下单、持仓和交易记录。" },
      ]
    : [
        { icon: "⌂", title: "Explore the market", text: "Start with the dashboard and quote pages to review indices and watchlists." },
        { icon: "⌕", title: "Screen securities", text: "Use the screener and factors to build your own research universe." },
        { icon: "✦", title: "Configure strategies", text: "Create reusable factors, strategies and parameters for your workflow." },
        { icon: "◒", title: "Backtest and review risk", text: "Run a backtest and evaluate it with your own risk rules." },
        { icon: "↗", title: "Paper trade", text: "Validate the workflow in a simulated account before using real tools." },
      ];

  const loadNotifications = useCallback(async () => {
    if (!canUseNotifications) {
      setNotifs([]);
      return;
    }
    try {
      const payload: any = await api.getNotifications();
      setNotifs(Array.isArray(payload) ? payload : []);
    } catch {
      // Notification refresh must not interrupt the current page workflow.
    }
  }, [canUseNotifications]);

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t, lang]);

  useEffect(() => {
    let cancelled = false;
    api
      .getLLMConfig()
      .then((data: any) => {
        if (!cancelled) setAiConnected(Boolean(data?.api_key_configured || data?.api_key));
      })
      .catch(() => {
        if (!cancelled) setAiConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileRole, profilePermissionsKey]);

  useEffect(() => {
    if (!canUseNotifications) {
      setNotifs([]);
      return;
    }
    void loadNotifications();
    const intervalId = window.setInterval(() => void loadNotifications(), 30_000);
    const refreshOnFocus = () => void loadNotifications();
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("quartsys:notifications-refresh", refreshOnFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("quartsys:notifications-refresh", refreshOnFocus);
    };
  }, [canUseNotifications, loadNotifications]);

  useEffect(() => {
    const syncProfile = () => {
      setAvatarUrl(localStorage.getItem("quartsys_avatar_url") || "");
      setProfileName(localStorage.getItem("quartsys_user") || "U");
      setProfileRole(getAuthUser()?.role || "user");
      (api as any)
        .getUserProfile()
        .then((d: any) => {
          const nextName = d?.username || "U";
          const nextAvatar = d?.avatar_url || "";
          setAuthUser(d);
          setProfileName(nextName);
          setAvatarUrl(nextAvatar);
          setProfileRole(d?.role || "user");
          setProfilePermissionsKey(JSON.stringify(d?.permissions || []));
        })
        .catch(() => {});
    };
    syncProfile();
    window.addEventListener("quartsys:profile-updated", syncProfile);
    return () => window.removeEventListener("quartsys:profile-updated", syncProfile);
  }, []);

  useEffect(() => {
    if (!canAccessPath(pathname)) {
      navigate(firstAccessiblePath(), { replace: true });
    }
  }, [pathname, navigate, profileName, profileRole, profilePermissionsKey]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // 自动刷新：读取设置页配置
  useEffect(() => {
    const prefs = JSON.parse(localStorage.getItem("quartsys_prefs") || "{}");
    if (!prefs.autoRefresh) return;
    const interval = (prefs.refreshInterval || 30) * 1000;
    const timer = window.setInterval(() => window.dispatchEvent(new Event("quartsys:refresh")), interval);
    return () => window.clearInterval(timer);
  }, []);

  // Close notifications on outside click
  useEffect(() => {
    if (!showNotifs) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest(".notif-dropdown") &&
        !target.closest(".qs-topbar-icon")
      ) {
        setShowNotifs(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showNotifs]);

  useEffect(() => {
    if (!showUserMenu) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".qs-user-menu-wrap")) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showUserMenu]);

  const logout = () => {
    clearAuth();
    setShowUserMenu(false);
    navigate("/login", { replace: true });
  };

  return (
    <div
      className={`qs-shell-root ${sidebarCollapsed ? "qs-shell-collapsed" : ""}`}
    >
      {!COMMUNITY_EDITION && demoMode && <div className="qs-demo-banner">{lang === "zh" ? "演示模式：当前账号用于功能演示，数据和交易均为模拟结果。" : "Demo mode: this account is for feature demonstrations; data and trades are simulated."}</div>}
      {onboardingVisible && <div className="qs-onboarding-mask" role="dialog" aria-modal="true"><div className="qs-onboarding-card qs-onboarding-animated"><div className="qs-onboarding-head"><span>{lang === "zh" ? "新手引导" : "Getting started"}</span><button type="button" onClick={closeOnboarding} aria-label={lang === "zh" ? "跳过引导" : "Skip onboarding"}><X size={17} /></button></div><div className="qs-onboarding-progress"><span style={{ width: `${((onboardingStep + 1) / onboardingSteps.length) * 100}%` }} /></div><div className="qs-onboarding-step-icon">{onboardingSteps[onboardingStep].icon}</div><div className="qs-onboarding-step-content" key={onboardingStep}><h2>{onboardingSteps[onboardingStep].title}</h2><p>{onboardingSteps[onboardingStep].text}</p></div><div className="qs-onboarding-step-dots">{onboardingSteps.map((_, index) => <button key={index} type="button" className={index === onboardingStep ? "active" : ""} onClick={() => setOnboardingStep(index)} aria-label={`${index + 1}`} />)}</div><div className="qs-onboarding-actions"><button className="figma-btn" type="button" onClick={closeOnboarding}>{lang === "zh" ? "跳过" : "Skip"}</button><div><button className="figma-btn" type="button" disabled={onboardingStep === 0} onClick={() => setOnboardingStep((step) => Math.max(0, step - 1))}>{lang === "zh" ? "上一步" : "Back"}</button><button className="figma-btn figma-btn-primary" type="button" onClick={() => onboardingStep >= onboardingSteps.length - 1 ? closeOnboarding() : setOnboardingStep((step) => step + 1)}>{onboardingStep >= onboardingSteps.length - 1 ? (lang === "zh" ? "完成" : "Finish") : (lang === "zh" ? "下一步" : "Next")}</button></div></div></div></div>}
      {/* ── Sidebar ── */}
      <aside
        id="qs-primary-navigation"
        className={`qs-sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`}
      >
        <div className="qs-sidebar-header">
          <div className="qs-sidebar-logo">
            <div className="qs-sidebar-logo-placeholder" aria-hidden="true">QR</div>
          </div>
          <div className="qs-sidebar-brand">
            <h2>{brandName}</h2>
            <p>{t("systemActive") || "SELF-HOSTED WORKSPACE"}</p>
          </div>
          <button
            className="qs-mobile-sidebar-close"
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label={lang === "zh" ? "关闭导航" : "Close navigation"}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav
          key={`sidebar-nav-${lang}`}
          className="qs-sidebar-nav no-scrollbar notranslate"
          translate="no"
          lang={lang === "zh" ? "zh-CN" : "en"}
        >
          {accessibleNavItems.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(item.to + "/");
            const NavIcon = item.Icon;
            return (
              <Link
                key={`${lang}-${item.to}`}
                to={item.to}
                className={`qs-nav-item ${active ? "active" : ""}`}
                onClick={() => {
                  setShowNotifs(false);
                  setMobileSidebarOpen(false);
                }}
              >
                <NavIcon className="qs-nav-svg-icon" aria-hidden="true" strokeWidth={2} />
                <span>{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="qs-sidebar-footer">
          {canUseTrading && (
            <button
              className="qs-execute-btn"
              onClick={() => {
                navigate("/trading");
                setShowNotifs(false);
                setMobileSidebarOpen(false);
              }}
            >
              <Bolt size={16} aria-hidden="true" />
              <span className="qs-execute-label">
                {lang === "zh" ? "模拟下单" : "Paper Trade"}
              </span>
            </button>
          )}
        </div>
      </aside>

      <button
        className={`qs-mobile-sidebar-backdrop ${mobileSidebarOpen ? "visible" : ""}`}
        type="button"
        onClick={() => setMobileSidebarOpen(false)}
        aria-label={lang === "zh" ? "关闭导航" : "Close navigation"}
        aria-hidden={!mobileSidebarOpen}
        tabIndex={mobileSidebarOpen ? 0 : -1}
      />

      {/* ── Top Bar ── */}
      <header className="qs-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="qs-mobile-menu-btn"
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label={lang === "zh" ? "打开导航" : "Open navigation"}
            aria-controls="qs-primary-navigation"
            aria-expanded={mobileSidebarOpen}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <button
            className="qs-collapse-btn"
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={
              sidebarCollapsed
                ? lang === "zh" ? "展开侧边栏" : "Expand sidebar"
                : lang === "zh" ? "收起侧边栏" : "Collapse sidebar"
            }
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={19} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={19} aria-hidden="true" />
            )}
          </button>
          <GlobalSearch />
        </div>

        <div className="qs-topbar-right">
          <div
            className="qs-market-switch"
            role="group"
            aria-label={lang === "zh" ? "切换市场" : "Switch market"}
          >
            {MARKET_ORDER.map((item) => {
              const itemDefinition = MARKET_DEFINITIONS[item];
              const active = item === market;
              return (
                <button
                  key={item}
                  type="button"
                  className={active ? "active" : ""}
                  aria-pressed={active}
                  title={lang === "zh" ? itemDefinition.labelZh : itemDefinition.labelEn}
                  onClick={() => setMarket(item)}
                >
                  <span className={`qs-market-dot market-${item.toLowerCase()}`} />
                  {lang === "zh" ? itemDefinition.labelZh : itemDefinition.shortLabel}
                </button>
              );
            })}
          </div>

          <span className="qs-market-status">
            <span className={isMarketTradingSession(market, now) ? "is-open" : ""}>
              {isMarketTradingSession(market, now)
                ? lang === "zh" ? "开盘" : "Open"
                : lang === "zh" ? "休市" : "Closed"}
            </span>
            <span
              className="qs-market-clock"
            >
              {definition.shortLabel} {formatMarketTime(market, now)}
            </span>
          </span>

          <select
            className="lang-btn lang-select"
            value={languageMode}
            onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
            aria-label={lang === "zh" ? "切换语言" : "Switch language"}
          >
            {LANGUAGE_SELECT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            className="qs-topbar-icon"
            type="button"
            title={theme === "dark" ? (lang === "zh" ? "切换浅色主题" : "Use light theme") : (lang === "zh" ? "切换深色主题" : "Use dark theme")}
            aria-label={theme === "dark" ? (lang === "zh" ? "切换浅色主题" : "Use light theme") : (lang === "zh" ? "切换深色主题" : "Use dark theme")}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>

          <div className="qs-topbar-icons">
            <div
              className="qs-topbar-icon"
              title={
                aiConnected
                  ? lang === "zh" ? "AI连接状态：已连接" : "AI status: connected"
                  : lang === "zh" ? "AI连接状态：未连接" : "AI status: disconnected"
              }
              style={{ cursor: "default" }}
            >
              <Activity
                size={18}
                aria-hidden="true"
                className={`qs-ai-connection-icon ${aiConnected ? "is-connected" : "is-disconnected"}`}
              />
            </div>

            <button
              className="qs-topbar-icon"
              type="button"
              title={lang === "zh" ? "参考文档" : "Reference docs"}
              aria-label={lang === "zh" ? "参考文档" : "Reference docs"}
              onClick={() => navigate("/help")}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
              }}
            >
              <BookOpen size={18} aria-hidden="true" />
            </button>

            {canUseNotifications && (
            <div style={{ position: "relative" }}>
              <button
                className="qs-topbar-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotifs((v) => !v);
                }}
                style={{
                  background: "none",
                  border: "none",
                  position: "relative",
                }}
              >
                <Bell size={18} aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="notif-badge">{unreadCount}</span>
                )}
              </button>
              {showNotifs && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-header">
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {lang === "zh" ? "通知" : "Notifications"}
                    </span>
                    <button
                      onClick={() => {
                        (api as any)
                          .markNotificationRead()
                          .then(() =>
                            (api as any)
                              .getNotifications()
                              .then((d: any) =>
                                setNotifs(Array.isArray(d) ? d : []),
                              ),
                          );
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: 12,
                        color: "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      {lang === "zh" ? "全部已读" : "Mark all read"}
                    </button>
                  </div>
                  <div style={{ maxHeight: 256, overflowY: "auto" }}>
                    {notifs.length === 0 ? (
                      <p
                        style={{
                          padding: "12px 16px",
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
                        {lang === "zh" ? "暂无通知" : "No notifications"}
                      </p>
                    ) : (
                      notifs.map((n) => (
                        <div
                          key={n.id}
                          className={`notif-item ${n.read ? "" : "unread"}`}
                          onClick={() => {
                            (api as any)
                              .markNotificationRead(n.id)
                              .then(() =>
                                setNotifs((ns) =>
                                  ns.map((x) =>
                                    x.id === n.id ? { ...x, read: true } : x,
                                  ),
                                ),
                              );
                            setShowNotifs(false);
                          }}
                        >
                          <p
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--text-primary)",
                            }}
                          >
                            {n.title}
                          </p>
                          <p
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                              marginTop: 2,
                            }}
                          >
                            {n.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>

          <div className="qs-user-menu-wrap">
            <button
              className="qs-user-avatar"
              type="button"
              title={`${lang === "zh" ? "用户信息设置" : "Profile settings"} · ${roleText(profileRole, lang)}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowNotifs(false);
                setShowUserMenu((prev) => !prev);
              }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={lang === "zh" ? "用户头像" : "User avatar"} />
              ) : (
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>
                  {(profileName || "U").charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            {showUserMenu && (
              <div className="qs-user-menu">
                <div className="qs-user-menu-meta">
                  <strong>{profileName || (lang === "zh" ? "用户" : "User")}</strong>
                  <span>{roleText(profileRole, lang)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate("/settings?tab=profile");
                  }}
                >
                  <UserRound size={17} aria-hidden="true" />
                  {lang === "zh" ? "个人信息" : "Profile"}
                </button>
                <button type="button" onClick={logout} className="danger">
                  <LogOut size={17} aria-hidden="true" />
                  {lang === "zh" ? "退出登录" : "Log out"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="qs-route-main">
        <Outlet />
      </main>

      {!COMMUNITY_EDITION && canUseAssistant && <AssistantFab />}
    </div>
  );
}
