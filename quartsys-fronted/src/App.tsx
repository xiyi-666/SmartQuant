import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./layout/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";
import { api, sendAnalyticsBeacon } from "./api";
import {
  clearAuth,
  firstAccessiblePath,
  getAuthUser,
  hasPermission,
  isLoggedIn,
  ROUTE_PERMISSIONS,
  setAuthUser,
} from "./shared/auth";
import FactorMiningPage from "./pages/FactorMiningPage";
import HelpPage from "./pages/HelpPage";
import BacktestingPage from "./pages/BacktestingPage";
import DashboardPage from "./pages/DashboardPage";
import EpayCheckoutPage from "./pages/EpayCheckoutPage";
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import LegalPage from "./pages/LegalPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import QuotePage from "./pages/QuotePage";
import ReplicaPage from "./pages/ReplicaPage";
import RevenuePage from "./pages/RevenuePage";
import RiskPage from "./pages/RiskPage";
import ScreenerPage from "./pages/ScreenerPage";
import SettingsPage from "./pages/SettingsPage";
import StrategyPage from "./pages/StrategyPage";
import TradingPage from "./pages/TradingPage";
import TokenCostPage from "./pages/TokenCostPage";
import { useLanguage } from "./shared/language";
import { COMMUNITY_EDITION } from "./shared/edition";

function RootRedirect() {
  return <Navigate to="/" replace />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage();
  const lt = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [ready, setReady] = useState(() => Boolean(getAuthUser()?.permissions?.length));
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!isLoggedIn() || ready) return;
    let cancelled = false;
    setAuthError("");
    api
      .getCurrentUser()
      .then((res: any) => {
        if (!cancelled) {
          setAuthUser(res?.user || res);
          setReady(true);
        }
      })
      .catch((error: any) => {
        if (!cancelled) {
          setAuthError(
            error?.message ||
              lt(
                "用户权限加载失败，请检查后端服务",
                "Failed to load account permissions. Check the backend service.",
              ),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (authError) {
    return (
      <div className="qs-route-loading">
        <div style={{ display: "grid", gap: 12, textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: "var(--text-primary)" }}>
            {lt("用户权限加载失败", "Permission Loading Failed")}
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.6 }}>
            {authError}
            {lt(
              "。请确认后端服务已在 18427 端口启动，然后刷新页面。",
              ". Confirm the backend service is running on port 18427, then refresh the page.",
            )}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            <button className="figma-btn figma-btn-primary" onClick={() => window.location.reload()}>
              {lt("重新加载", "Reload")}
            </button>
            <button
              className="figma-btn"
              onClick={() => {
                clearAuth();
                window.location.href = "/login";
              }}
            >
              {lt("重新登录", "Sign In Again")}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="qs-route-loading" lang={lang === "zh" ? "zh-CN" : "en"}>
        {lt("正在加载用户权限...", "Loading account permissions...")}
      </div>
    );
  }
  return <>{children}</>;
}

function ForbiddenPage() {
  const { lang } = useLanguage();
  const lt = (zh: string, en: string) => (lang === "zh" ? zh : en);
  return (
    <div className="figma-page-header">
      <div>
        <h1>{lt("无权访问", "Access Denied")}</h1>
        <p>
          {lt(
            "当前账号没有访问该功能的权限，请联系系统管理员调整角色。",
            "This account does not have permission to access this feature. Contact an administrator to adjust the role.",
          )}
        </p>
      </div>
    </div>
  );
}

function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  if (hasPermission(permission)) return <>{children}</>;
  const fallback = firstAccessiblePath();
  if (fallback === location.pathname) return <ForbiddenPage />;
  return <Navigate to={fallback} replace />;
}

function AnalyticsRouteTracker() {
  const location = useLocation();
  const lastPageRef = useRef<{ path: string; title: string; startedAt: number } | null>(null);

  useEffect(() => {
    const now = Date.now();
    const path = `${location.pathname}${location.search || ""}`;
    const previous = lastPageRef.current;
    if (previous && previous.path !== path) {
      void api.recordAnalyticsEvent({
        event_type: "page_leave",
        path: previous.path,
        title: previous.title,
        duration_seconds: Math.round((now - previous.startedAt) / 1000),
        is_exit: true,
      });
    }
    void api.recordAnalyticsEvent({
      event_type: "page_view",
      path,
      title: document.title,
      referrer: document.referrer,
      is_entry: !previous,
    });
    lastPageRef.current = { path, title: document.title, startedAt: now };
  }, [location.pathname, location.search]);

  useEffect(() => {
    const flushCurrentPage = () => {
      const current = lastPageRef.current;
      if (!current) return;
      sendAnalyticsBeacon({
        event_type: "page_leave",
        path: current.path,
        title: current.title,
        duration_seconds: Math.round((Date.now() - current.startedAt) / 1000),
        is_exit: true,
      });
    };
    window.addEventListener("pagehide", flushCurrentPage);
    return () => {
      window.removeEventListener("pagehide", flushCurrentPage);
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AnalyticsRouteTracker />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/guide" element={<HelpPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Navigate to="/login?mode=register" replace />} />
        <Route path="/legal/:doc" element={<LegalPage />} />
        {!COMMUNITY_EDITION && <Route path="/payment/epay" element={<RequireAuth><EpayCheckoutPage /></RequireAuth>} />}
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/dashboard" element={<RequirePermission permission={ROUTE_PERMISSIONS["/dashboard"]}><DashboardPage /></RequirePermission>} />
          <Route path="/screener" element={<RequirePermission permission={ROUTE_PERMISSIONS["/screener"]}><ScreenerPage /></RequirePermission>} />
          <Route path="/strategy" element={<RequirePermission permission={ROUTE_PERMISSIONS["/strategy"]}><StrategyPage /></RequirePermission>} />
          <Route path="/factor-mining" element={<RequirePermission permission={ROUTE_PERMISSIONS["/factor-mining"]}><FactorMiningPage /></RequirePermission>} />
          <Route path="/backtesting" element={<RequirePermission permission={ROUTE_PERMISSIONS["/backtesting"]}><BacktestingPage /></RequirePermission>} />
          <Route path="/risk" element={<RequirePermission permission={ROUTE_PERMISSIONS["/risk"]}><RiskPage /></RequirePermission>} />
          <Route path="/trading" element={<RequirePermission permission={ROUTE_PERMISSIONS["/trading"]}><TradingPage /></RequirePermission>} />
          {!COMMUNITY_EDITION && <Route path="/revenue" element={<RequirePermission permission={ROUTE_PERMISSIONS["/revenue"]}><RevenuePage /></RequirePermission>} />}
          {!COMMUNITY_EDITION && <Route path="/analytics" element={<RequirePermission permission={ROUTE_PERMISSIONS["/analytics"]}><AnalyticsPage /></RequirePermission>} />}
          {!COMMUNITY_EDITION && <Route path="/token-cost" element={<RequirePermission permission={ROUTE_PERMISSIONS["/token-cost"]}><TokenCostPage /></RequirePermission>} />}
          <Route path="/settings" element={<RequirePermission permission={ROUTE_PERMISSIONS["/settings"]}><SettingsPage /></RequirePermission>} />
          <Route path="/help" element={<Navigate to="/guide" replace />} />
          <Route path="/quote" element={<RequirePermission permission={ROUTE_PERMISSIONS["/quote"]}><QuotePage /></RequirePermission>} />
          <Route path="/replica" element={<RequirePermission permission={ROUTE_PERMISSIONS["/replica"]}><ReplicaPage html="" /></RequirePermission>} />
        </Route>
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </ErrorBoundary>
  );
}
