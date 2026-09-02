import { getToken, clearAuth } from "./shared/auth";

const normalize = (v: string) => (v || "").trim().replace(/\/+$/, "");

type ApiErrorKind =
  | "config"
  | "auth"
  | "forbidden"
  | "network"
  | "http"
  | "timeout";

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
  skipAuth?: boolean;
  skipAnalytics?: boolean;
};

type StreamHandlers = {
  onDelta?: (delta: string) => void;
  onEvent?: (event: any) => void;
};

const SCREENER_REQUEST_TIMEOUT_MS = 45_000;
const SMART_RESEARCH_REQUEST_TIMEOUT_MS = 90_000;
const BACKTEST_REQUEST_TIMEOUT_MS = 300_000;
const ANALYTICS_VISITOR_KEY = "quartsys_analytics_visitor";
const ANALYTICS_SESSION_KEY = "quartsys_analytics_session";
const ANALYTICS_LAST_ACTIVE_KEY = "quartsys_analytics_last_active";
const ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export type AnalyticsEventPayload = {
  event_type?: "page_view" | "page_leave" | "page_duration" | "module_usage" | "funnel";
  session_key?: string;
  visitor_key?: string;
  path?: string;
  title?: string;
  referrer?: string;
  source_type?: string;
  source?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  region?: string;
  duration_seconds?: number;
  is_entry?: boolean;
  is_exit?: boolean;
  module_key?: string;
  module_label?: string;
  action?: string;
  success?: boolean;
  result_count?: number;
  duration_ms?: number;
  meta?: Record<string, unknown>;
};

function safeStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Analytics must never break product flows.
  }
}

function randomAnalyticsId(prefix: string) {
  const cryptoApi = typeof window !== "undefined" ? window.crypto : undefined;
  const value =
    cryptoApi && "randomUUID" in cryptoApi
      ? cryptoApi.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

export function getAnalyticsIdentity() {
  const now = Date.now();
  let visitorKey = safeStorageGet(ANALYTICS_VISITOR_KEY);
  if (!visitorKey) {
    visitorKey = randomAnalyticsId("visitor");
    safeStorageSet(ANALYTICS_VISITOR_KEY, visitorKey);
  }
  let sessionKey = safeStorageGet(ANALYTICS_SESSION_KEY);
  const lastActive = Number(safeStorageGet(ANALYTICS_LAST_ACTIVE_KEY) || 0);
  if (!sessionKey || !lastActive || now - lastActive > ANALYTICS_SESSION_TIMEOUT_MS) {
    sessionKey = randomAnalyticsId("session");
    safeStorageSet(ANALYTICS_SESSION_KEY, sessionKey);
  }
  safeStorageSet(ANALYTICS_LAST_ACTIVE_KEY, String(now));
  return { visitorKey, sessionKey };
}

function analyticsHeaders() {
  const identity = getAnalyticsIdentity();
  return {
    "X-Quartsys-Session": identity.sessionKey,
    "X-Quartsys-Visitor": identity.visitorKey,
  };
}

function inferAnalyticsDevice(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (ua.includes("ipad") || ua.includes("tablet")) return "pad";
  if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) return "mobile";
  return "pc";
}

function inferAnalyticsBrowser(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (ua.includes("micromessenger")) return "WeChat";
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("firefox/")) return "Firefox";
  if (ua.includes("chrome/") || ua.includes("crios/")) return "Chrome";
  if (ua.includes("safari/")) return "Safari";
  return "Other";
}

function inferAnalyticsOs(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iOS";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macOS";
  if (ua.includes("linux")) return "Linux";
  return "Other";
}

function sourceFromLocation() {
  const params = new URLSearchParams(window.location.search || "");
  const source = params.get("utm_source") || params.get("source") || params.get("from") || "";
  if (source) return { source_type: "promotion", source };
  return {};
}

function buildAnalyticsPayload(payload: AnalyticsEventPayload): AnalyticsEventPayload {
  const identity = getAnalyticsIdentity();
  const userAgent = navigator.userAgent || "";
  return {
    session_key: identity.sessionKey,
    visitor_key: identity.visitorKey,
    device_type: inferAnalyticsDevice(userAgent),
    browser: inferAnalyticsBrowser(userAgent),
    os: inferAnalyticsOs(userAgent),
    referrer: document.referrer || "",
    ...sourceFromLocation(),
    ...payload,
  };
}

export function recordAnalyticsEvent(payload: AnalyticsEventPayload) {
  return request("/public/analytics/event", {
    method: "POST",
    body: JSON.stringify(buildAnalyticsPayload(payload)),
    timeoutMs: 8_000,
    skipAuth: false,
    skipAnalytics: true,
  }).catch(() => null);
}

export function sendAnalyticsBeacon(payload: AnalyticsEventPayload) {
  const body = JSON.stringify(buildAnalyticsPayload(payload));
  const url = `${getApiBase()}/public/analytics/event`;
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    return navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  }
  void recordAnalyticsEvent(payload);
  return false;
}

function inferResultCount(body: any): number | undefined {
  if (Array.isArray(body)) return body.length;
  if (!body || typeof body !== "object") return undefined;
  for (const key of ["results", "items", "rows", "stocks", "data", "sessions", "tasks"]) {
    const value = body[key];
    if (Array.isArray(value)) return value.length;
  }
  if (typeof body.total === "number") return body.total;
  if (typeof body.count === "number") return body.count;
  return undefined;
}

function analyticsModuleForRequest(path: string, method: string, success: boolean, body: any) {
  const cleanPath = path.split("?")[0];
  const resultCount = inferResultCount(body);
  if (cleanPath === "/login" && method === "POST") {
    return { module_key: "auth", module_label: "登录注册", action: success ? "login_success" : "login_failed" };
  }
  if (cleanPath === "/register" && method === "POST") {
    return { module_key: "auth", module_label: "登录注册", action: success ? "register_success" : "register_failed" };
  }
  if (cleanPath === "/search") {
    return {
      module_key: "stock_search",
      module_label: "股票搜索",
      action: success ? (Number(resultCount || 0) > 0 ? "search_success" : "search_no_results") : "search_failed",
      result_count: resultCount,
    };
  }
  if (cleanPath.startsWith("/stock/quote") || cleanPath.startsWith("/stock/f10")) {
    return { module_key: "stock_detail", module_label: "股票详情", action: "view_stock_detail" };
  }
  if (cleanPath.startsWith("/stock_history") || cleanPath.startsWith("/stock_intraday") || cleanPath.startsWith("/market/")) {
    return { module_key: "market_data", module_label: "行情数据", action: "market_data_access", result_count: resultCount };
  }
  if (cleanPath === "/screener/query") {
    return { module_key: "screener", module_label: "选股器", action: "screener_query", result_count: resultCount };
  }
  if (cleanPath.startsWith("/factors/")) {
    return { module_key: "factor_filter", module_label: "因子筛选", action: "factor_action", result_count: resultCount };
  }
  if (cleanPath === "/backtest/run") {
    return { module_key: "backtest", module_label: "回测分析", action: "backtest_run" };
  }
  if (cleanPath === "/ai-insights/run") {
    return { module_key: "ai_insights", module_label: "AI 洞察", action: "ai_insights_start" };
  }
  if (cleanPath === "/smart-research/run") {
    return { module_key: "smart_research", module_label: "智能研究", action: "smart_research_start" };
  }
  if (cleanPath.startsWith("/agent-analysis/sessions")) {
    return { module_key: "agent_analysis", module_label: "AI分析师", action: method === "POST" ? "discussion_start" : "discussion_view" };
  }
  if (cleanPath.startsWith("/risk/")) {
    return { module_key: "risk_monitor", module_label: "风险监控", action: "risk_refresh" };
  }
  if (cleanPath === "/watchlist" && method === "POST") {
    return { module_key: "watchlist", module_label: "自选股", action: "watchlist_add" };
  }
  if (cleanPath.startsWith("/watchlist") && method === "DELETE") {
    return { module_key: "watchlist", module_label: "自选股", action: "watchlist_delete" };
  }
  if (cleanPath === "/simulation/trade") {
    return { module_key: "paper_trade", module_label: "模拟交易", action: "paper_trade" };
  }
  if (cleanPath === "/subscription/self") {
    return { module_key: "subscription", module_label: "订阅入口", action: "subscription_click" };
  }
  if (cleanPath.includes("/subscription/") && cleanPath.endsWith("/pay")) {
    return { module_key: "payment", module_label: "支付", action: "payment_started" };
  }
  return null;
}

function trackRequestAnalytics(path: string, method: string, success: boolean, status: number, durationMs: number, body: any) {
  if (path.startsWith("/public/analytics")) return;
  const usage = analyticsModuleForRequest(path, method, success, body);
  if (!usage) return;
  void recordAnalyticsEvent({
    event_type: "module_usage",
    path,
    success,
    duration_ms: durationMs,
    meta: { status },
    ...usage,
  });
}

export class ApiClientError extends Error {
  kind: ApiErrorKind;
  status?: number;
  payload?: unknown;

  constructor(
    kind: ApiErrorKind,
    message: string,
    status?: number,
    payload?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.kind = kind;
    this.status = status;
    this.payload = payload;
  }
}

function getApiCandidates() {
  const envBase = normalize((import.meta as any).env.VITE_API_BASE_URL || "");
  const runtimeBase = normalize(
    localStorage.getItem("quartsys_api_base") || "",
  );
  const isDev = (import.meta as any).env.DEV === true;

  if (isDev) {
    const candidates = ["/api"];
    if (envBase) candidates.push(envBase);
    return [...new Set(candidates)];
  }

  const candidates: string[] = [];
  if (runtimeBase) candidates.push(runtimeBase);
  if (envBase && envBase !== runtimeBase) candidates.push(envBase);

  if (candidates.length === 0) {
    const host = window.location.hostname || "127.0.0.1";
    candidates.push(normalize(`${window.location.protocol}//${host}:18427/api`));
  }

  return [...new Set(candidates.filter(Boolean))];
}

export function getApiBase() {
  return getApiCandidates()[0];
}

async function request(path: string, options: ApiRequestInit = {}) {
  const candidates = getApiCandidates();
  const runtimeBase = normalize(
    localStorage.getItem("quartsys_api_base") || "",
  );
  if (candidates.length === 0) {
    throw new ApiClientError(
      "config",
      "API base 未配置。请设置 VITE_API_BASE_URL 或 quartsys_api_base。",
    );
  }

  let networkError: Error | null = null;

  const {
    timeoutMs,
    skipAuth = false,
    skipAnalytics = false,
    signal: externalSignal,
    ...fetchOptions
  } = options;

  for (const base of candidates) {
    const timeoutEnabled = typeof timeoutMs === "number" && timeoutMs > 0;
    const controller = timeoutEnabled ? new AbortController() : null;
    let didTimeout = false;
    let timeoutId: number | undefined;
    const abortFromExternalSignal = () => controller?.abort();

    try {
      if (controller && externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          externalSignal.addEventListener("abort", abortFromExternalSignal, {
            once: true,
          });
        }
      }
      if (controller && timeoutMs) {
        timeoutId = window.setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, timeoutMs);
      }

      const token = skipAuth ? "" : getToken();
      const method = (fetchOptions.method || "GET").toUpperCase();
      const requestStartedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const hasBody =
        fetchOptions.body !== undefined && fetchOptions.body !== null;
      const defaultHeaders: Record<string, string> = {
        ...analyticsHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      // 避免给 GET/HEAD 强加 application/json，触发不必要的 CORS 预检
      if (hasBody && method !== "GET" && method !== "HEAD") {
        defaultHeaders["Content-Type"] = "application/json";
      }

      const response = await fetch(`${base}${path}`, {
        ...fetchOptions,
        signal: controller?.signal ?? externalSignal,
        headers: {
          ...defaultHeaders,
          ...(fetchOptions.headers || {}),
        },
      });

      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
      const durationMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
          requestStartedAt,
      );
      if (!skipAnalytics) {
        trackRequestAnalytics(path, method, response.ok, response.status, durationMs, body);
      }

      if (!response.ok) {
        const detail =
          typeof body === "object" && body !== null
            ? ((body as any).detail ?? body)
            : body;
        const message =
          typeof detail === "string"
            ? detail
            : ((detail as any)?.message ||
                (detail as any)?.error?.message ||
                JSON.stringify(detail || {}));
        if (response.status === 401) {
          if (!skipAuth) {
            clearAuth();
            window.location.href = "/login";
          }
          throw new ApiClientError(
            "auth",
            message || "登录已过期，请重新登录",
            response.status,
            body,
          );
        }
        if (response.status === 403) {
          throw new ApiClientError(
            "forbidden",
            message || "没有权限执行该操作",
            response.status,
            body,
          );
        }
        throw new ApiClientError(
          "http",
          message || "请求失败",
          response.status,
          body,
        );
      }

      if (!(import.meta as any).env.DEV && base !== runtimeBase) {
        localStorage.setItem("quartsys_api_base", base);
      }

      return body;
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (didTimeout) {
        const seconds = Math.round((timeoutMs || 0) / 1000);
        throw new ApiClientError(
          "timeout",
          `请求超过 ${seconds} 秒仍未返回，请减少筛选条件或稍后重试。`,
        );
      }
      if ((error as any)?.name === "AbortError") {
        throw new ApiClientError("network", "请求已取消");
      }
      if (!(error instanceof TypeError)) throw error;
      networkError = error;
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (controller && externalSignal) {
        externalSignal.removeEventListener("abort", abortFromExternalSignal);
      }
    }
  }

  throw (
    networkError ||
    new ApiClientError("network", "后端不可达，请检查服务和网络连接")
  );
}

function filenameFromDisposition(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/"/g, ""));
    } catch {
      return fallback;
    }
  }
  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] || fallback;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

async function downloadApiFile(
  path: string,
  fallbackFilename: string,
  options: ApiRequestInit = {},
) {
  const candidates = getApiCandidates();
  const {
    timeoutMs,
    skipAuth = false,
    skipAnalytics: _skipAnalytics,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  let networkError: Error | null = null;

  for (const base of candidates) {
    const timeoutEnabled = typeof timeoutMs === "number" && timeoutMs > 0;
    const controller = timeoutEnabled ? new AbortController() : null;
    let didTimeout = false;
    let timeoutId: number | undefined;
    const abortFromExternalSignal = () => controller?.abort();

    try {
      if (controller && externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
        }
      }
      if (controller && timeoutMs) {
        timeoutId = window.setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, timeoutMs);
      }

      const token = skipAuth ? "" : getToken();
      const response = await fetch(`${base}${path}`, {
        ...fetchOptions,
        signal: controller?.signal ?? externalSignal,
        headers: {
          ...analyticsHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(fetchOptions.headers || {}),
        },
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const body = contentType.includes("application/json")
          ? await response.json()
          : await response.text();
        const detail =
          typeof body === "object" && body !== null
            ? ((body as any).detail ?? body)
            : body;
        const message =
          typeof detail === "string"
            ? detail
            : ((detail as any)?.message ||
                (detail as any)?.error?.message ||
                JSON.stringify(detail || {}));
        if (response.status === 401) {
          if (!skipAuth) {
            clearAuth();
            window.location.href = "/login";
          }
          throw new ApiClientError("auth", message || "登录已过期，请重新登录", response.status, body);
        }
        if (response.status === 403) {
          throw new ApiClientError("forbidden", message || "没有权限执行该操作", response.status, body);
        }
        throw new ApiClientError("http", message || "下载失败", response.status, body);
      }

      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
        fallbackFilename,
      );
      triggerDownload(blob, filename);
      return { filename };
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (didTimeout) {
        const seconds = Math.round((timeoutMs || 0) / 1000);
        throw new ApiClientError("timeout", `下载超过 ${seconds} 秒仍未返回，请稍后重试。`);
      }
      if ((error as any)?.name === "AbortError") {
        throw new ApiClientError("network", "下载已取消");
      }
      if (!(error instanceof TypeError)) throw error;
      networkError = error;
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (controller && externalSignal) {
        externalSignal.removeEventListener("abort", abortFromExternalSignal);
      }
    }
  }

  throw (
    networkError ||
    new ApiClientError("network", "后端不可达，请检查服务和网络连接")
  );
}

async function streamSse(
  path: string,
  options: RequestInit = {},
  handlers: StreamHandlers = {},
) {
  const candidates = getApiCandidates();
  let networkError: Error | null = null;

  for (const base of candidates) {
    try {
      const token = getToken();
      const method = (options.method || "GET").toUpperCase();
      const hasBody = options.body !== undefined && options.body !== null;
      const response = await fetch(`${base}${path}`, {
        ...options,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: "text/event-stream",
          ...(hasBody && method !== "GET" && method !== "HEAD"
            ? { "Content-Type": "application/json" }
            : {}),
          ...(options.headers || {}),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ApiClientError(
          "http",
          body || `请求失败 (${response.status})`,
          response.status,
          body,
        );
      }
      if (!response.body) {
        throw new ApiClientError("network", "浏览器不支持流式响应");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      const emit = (raw: string) => {
        const data = raw.trim();
        if (!data || data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          handlers.onEvent?.(parsed);
          if (typeof parsed.delta === "string") {
            fullText += parsed.delta;
            handlers.onDelta?.(parsed.delta);
          }
        } catch {
          fullText += data;
          handlers.onDelta?.(data);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || "";
        parts.forEach((part) => {
          const data = part
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          emit(data);
        });
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        const data = buffer
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        emit(data);
      }
      return fullText;
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (!(error instanceof TypeError)) throw error;
      networkError = error;
    }
  }

  throw (
    networkError ||
    new ApiClientError("network", "后端不可达，请检查服务和网络连接")
  );
}

export const api = {
  getApiBase,
  getHealth: () => request("/health"),
  login: (payload: { username: string; password: string; captcha_token?: string }) =>
    request("/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAuthSecurityPublic: () =>
    request("/auth/security/public", { timeoutMs: 20_000, skipAuth: true }),
  getPublicSiteSettings: () =>
    request("/public/site-settings", { timeoutMs: 20_000, skipAuth: true }),
  getPublicCustomerServiceAiSettings: () =>
    request("/public/customer-service-ai/settings", {
      timeoutMs: 20_000,
      skipAuth: true,
    }),
  chatPublicCustomerServiceAi: (payload: any) =>
    request("/public/customer-service-ai/chat", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 60_000,
      skipAuth: true,
    }),
  createPublicCustomerServiceTicket: (payload: any) =>
    request("/public/customer-service-ai/tickets", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
      skipAuth: true,
    }),
  recordAnalyticsEvent,
  recordPublicAdEvent: (payload: any) =>
    request("/public/ad-events", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 8_000,
      skipAuth: true,
    }),
  getAdminSiteSettings: () => request("/admin/site-settings", { timeoutMs: 20_000 }),
  saveAdminSiteSettings: (payload: any) =>
    request("/admin/site-settings", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    }),
  getAuthSecurity: () => request("/auth/security"),
  saveAuthSecurity: (payload: any) =>
    request("/auth/security", { method: "POST", body: JSON.stringify(payload) }),
  testAuthSmtp: (payload: any) =>
    request("/auth/security/test-smtp", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    }),
  sendAuthEmailCode: (payload: {
    email: string;
    purpose?: string;
    username?: string;
    captcha_token?: string;
  }) =>
    request("/auth/email-code", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    }),
  authTelegram: (payload: any) =>
    request("/auth/telegram", { method: "POST", body: JSON.stringify(payload) }),
  listPasskeys: () => request("/auth/passkeys"),
  savePasskey: (payload: any) =>
    request("/auth/passkeys", { method: "POST", body: JSON.stringify(payload) }),
  deletePasskey: (credentialId: string) =>
    request(`/auth/passkeys/${encodeURIComponent(credentialId)}`, { method: "DELETE" }),
  getCheckinStatus: (month?: string) =>
    request(`/checkin${month ? `?month=${encodeURIComponent(month)}` : ""}`),
  doCheckin: () => request("/checkin", { method: "POST" }),
  getCurrentUser: () => request("/auth/me", { timeoutMs: 8_000 }),
  getPermissionDefinitions: () => request("/auth/permissions"),
  listAdminUsers: () => request("/admin/users"),
  updateAdminUserRole: (userId: number, role: string, permissions?: string[]) =>
    request(`/admin/users/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role, permissions }),
    }),
  getSimulationAccount: (market = "CN") =>
    request(`/simulation/account?market=${encodeURIComponent(market)}`),
  getSimulationFeeSettings: () => request("/simulation/fee-settings"),
  getAdminSimulationFeeSettings: () => request("/admin/simulation/fee-settings"),
  saveAdminSimulationFeeSettings: (settings: any) =>
    request("/admin/simulation/fee-settings", {
      method: "POST",
      body: JSON.stringify({ settings }),
    }),
  getTradeRecords: (market = "CN") =>
    request(`/simulation/records?market=${encodeURIComponent(market)}`),
  getTradeRecordsByCode: (code: string, market = "CN") =>
    request(
      `/simulation/records?code=${encodeURIComponent(code)}&market=${encodeURIComponent(market)}`,
    ),
  addToWatchlist: (payload: {
    group_name: string;
    code: string;
    name: string;
  }) =>
    request("/watchlist", { method: "POST", body: JSON.stringify(payload) }),
  getMarketIndices: (market = "CN") =>
    request(`/market/indices?market=${encodeURIComponent(market)}`),
  getMarketIndexHistory: (code: string, days = 180) =>
    request(
      `/market/index-history?code=${encodeURIComponent(code)}&days=${days}`,
      { timeoutMs: 20_000 },
    ),
  getMarketIndexConstituents: (code: string, limit = 80) =>
    request(
      `/market/index-constituents?code=${encodeURIComponent(code)}&limit=${limit}`,
      { timeoutMs: 20_000 },
    ),
  createWatchlistGroup: (payload: { group_name: string; color?: string }) =>
    request("/watchlist/group", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getTopGainers: (
    date?: string,
    groupBy: "industry" | "board" = "industry",
    market = "CN",
  ) =>
    request(
      `/market/top-gainers?group_by=${encodeURIComponent(groupBy)}&market=${encodeURIComponent(market)}${date ? `&date=${date}` : ""}`,
      { timeoutMs: 30_000 },
    ),
  getConceptConstituents: (concept: string, code?: string) =>
    request(
      `/market/concept-constituents?concept=${encodeURIComponent(concept)}${code ? `&code=${encodeURIComponent(code)}` : ""}`,
      { timeoutMs: 30_000 },
    ),
  getMarketGroupConstituents: (group: string, market = "CN", limit = 300) =>
    request(
      `/market/group-constituents?group=${encodeURIComponent(group)}&market=${encodeURIComponent(market)}&limit=${encodeURIComponent(String(limit))}`,
      { timeoutMs: 20_000 },
    ),
  getIndustryHistory: (
    industry: string,
    days = 180,
    groupBy: "industry" | "board" = "industry",
    market = "CN",
  ) =>
    request(
      `/market/industry-history?industry=${encodeURIComponent(industry)}&days=${days}&group_by=${encodeURIComponent(groupBy)}&market=${encodeURIComponent(market)}`,
      { timeoutMs: 20_000 },
    ),
  getLatestNews: () => request("/news/latest"),
  getDashboardNews: (market = "CN") =>
    request(`/news/dashboard?market=${encodeURIComponent(market)}`, { timeoutMs: 20_000 }),
  runAiInsights: (payload: { model?: string; market?: string } = {}) =>
    request("/ai-insights/run", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 15_000,
    }),
  getAiInsightsResult: (taskId: number) =>
    request(`/ai-insights/result/${taskId}`),
  runSmartResearch: (payload: {
    symbols: string[];
    market?: string;
    analysis_date?: string;
    analysts?: string[];
    use_trading_agents?: boolean;
    max_debate_rounds?: number;
    max_risk_rounds?: number;
    model?: string;
    language?: "zh" | "en";
  }) =>
    request("/smart-research/run", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: SMART_RESEARCH_REQUEST_TIMEOUT_MS,
    }),
  quoteSmartResearch: (payload: {
    symbols: string[];
    market?: string;
    analysis_date?: string;
    analysts?: string[];
    use_trading_agents?: boolean;
    max_debate_rounds?: number;
    max_risk_rounds?: number;
    model?: string;
  }) =>
    request("/smart-research/quote", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  getSmartResearchResult: (taskId: number) =>
    request(`/smart-research/result/${taskId}`, {
      timeoutMs: SMART_RESEARCH_REQUEST_TIMEOUT_MS,
    }),
  listSmartResearchTasks: (limit = 20) =>
    request(`/smart-research/tasks?limit=${encodeURIComponent(String(limit))}`),
  getSmartResearchReportUrl: (taskId: number) =>
    `${getApiBase()}/smart-research/report/${taskId}.md`,
  getSmartResearchReportFormatUrl: (taskId: number, format: "md" | "pdf" | "docx") =>
    `${getApiBase()}/smart-research/report/${taskId}.${format}`,
  listFinancialAgents: () =>
    request("/agent-analysis/agents", { timeoutMs: 30_000 }),
  getAgentAnalysisCapabilities: () =>
    request("/agent-analysis/capabilities", { timeoutMs: 30_000 }),
  saveAgentAnalysisSettings: (payload: any) =>
    request("/agent-analysis/settings", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  createFinancialAgent: (payload: any) =>
    request("/agent-analysis/agents", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  updateFinancialAgent: (agentId: number, payload: any) =>
    request(`/agent-analysis/agents/${agentId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  deleteFinancialAgent: (agentId: number) =>
    request(`/agent-analysis/agents/${agentId}`, { method: "DELETE" }),
  listAgentAnalysisSessions: () =>
    request("/agent-analysis/sessions", { timeoutMs: 30_000 }),
  quoteAgentAnalysisSession: (payload: any) =>
    request("/agent-analysis/quote", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  createAgentAnalysisSession: (payload: any) =>
    request("/agent-analysis/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  getAgentAnalysisSession: (sessionId: number) =>
    request(`/agent-analysis/sessions/${sessionId}`, { timeoutMs: 30_000 }),
  quoteAgentAnalysisMessage: (sessionId: number, payload: any) =>
    request(`/agent-analysis/sessions/${sessionId}/quote`, {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  postAgentAnalysisMessage: (sessionId: number, payload: any) =>
    request(`/agent-analysis/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  deleteAgentAnalysisSession: (sessionId: number) =>
    request(`/agent-analysis/sessions/${sessionId}`, { method: "DELETE" }),
  getAgentAnalysisReportUrl: (sessionId: number) =>
    `${getApiBase()}/agent-analysis/sessions/${sessionId}/report.md`,
  getMarketTemperature: (market = "CN", forceRefresh = false) => {
    const params = new URLSearchParams({ market });
    if (forceRefresh) params.set("force_refresh", "true");
    return request(`/market-temperature/latest?${params.toString()}`, {
      timeoutMs: 8_000,
    });
  },
  getResults: () => request("/results"),
  getWatchlist: () => request("/watchlist"),
  searchStocks: (q: string, market = "CN") =>
    request(`/search?q=${encodeURIComponent(q)}&market=${encodeURIComponent(market)}`),
  getStockHistory: (code: string, adjust: "none" | "qfq" | "hfq" = "none") =>
    request(`/stock_history/${encodeURIComponent(code)}?adjust=${encodeURIComponent(adjust)}`),
  getStockIntraday: (code: string) =>
    request(`/stock_intraday/${encodeURIComponent(code)}`, { timeoutMs: 12_000 }),
  queryScreener: (payload: any) =>
    request("/screener/query", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: SCREENER_REQUEST_TIMEOUT_MS,
    }),
  createScreenerTask: (payload: any) =>
    request("/screener/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 15_000,
    }),
  getScreenerTask: (taskId: number) => request(`/screener/tasks/${taskId}`),
  listScreenerTasks: (limit = 20) =>
    request(`/screener/tasks?limit=${encodeURIComponent(String(limit))}`),
  listFactorPresets: () => request("/factors/presets"),
  saveFactorPreset: (payload: { name: string; config: any[] }) =>
    request("/factors/presets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getFactorPreset: (id: number) => request(`/factors/presets/${id}`),
  executeTrade: (payload: {
    stock_code: string;
    trade_type: string;
    quantity: number;
    price?: number;
    market?: string;
  }) =>
    request("/simulation/trade", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listSimulationAutomationStrategies: () =>
    request("/simulation/automation/strategies"),
  listStrategyAutomations: (market = "CN") =>
    request(`/simulation/automation?market=${encodeURIComponent(market)}`),
  saveStrategyAutomation: (payload: any) =>
    request("/simulation/automation", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  startStrategyAutomation: (id: number) =>
    request(`/simulation/automation/${id}/start`, { method: "POST" }),
  stopStrategyAutomation: (id: number) =>
    request(`/simulation/automation/${id}/stop`, { method: "POST" }),
  runStrategyAutomation: (id: number) =>
    request(`/simulation/automation/${id}/run`, {
      method: "POST",
      timeoutMs: 60_000,
    }),
  deleteStrategyAutomation: (id: number) =>
    request(`/simulation/automation/${id}`, { method: "DELETE" }),
  getStockQuote: (code: string) =>
    request(`/stock/quote/${encodeURIComponent(code)}`),
  getStockF10: (code: string, refresh = false) =>
    request(
      `/stock/f10/${encodeURIComponent(code)}${refresh ? "?refresh=true" : ""}`,
      { timeoutMs: 45_000 },
    ),
  getDocumentPreviewUrl: (url: string) =>
    `${getApiBase()}/document/preview?url=${encodeURIComponent(url)}`,
  getDocumentViewerUrl: (url: string, title?: string) =>
    `${getApiBase()}/document/viewer?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || "公司文档")}`,
  getAssistantSkills: () => request("/assistant/skills"),
  streamAssistantStructured: (
    payload: any,
    handlers?: StreamHandlers,
    signal?: AbortSignal,
  ) =>
    streamSse(
      "/chat/structured/stream",
      {
        method: "POST",
        body: JSON.stringify(payload),
        signal,
      },
      handlers,
    ),
  getAdminAssistantSkills: () => request("/admin/assistant/skills"),
  saveAdminAssistantSkills: (payload: any) =>
    request("/admin/assistant/skills", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAdminAssistantResearchTools: () => request("/admin/assistant/research-tools"),
  saveAdminAssistantResearchTools: (payload: any) =>
    request("/admin/assistant/research-tools", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAdminCustomerServiceAiSettings: () =>
    request("/admin/customer-service-ai/settings", { timeoutMs: 20_000 }),
  saveAdminCustomerServiceAiSettings: (payload: any) =>
    request("/admin/customer-service-ai/settings", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    }),
  listAdminCustomerServiceTickets: (limit = 50) =>
    request(`/admin/customer-service-ai/tickets?limit=${encodeURIComponent(String(limit))}`),
  getLLMConfig: () => request("/llm-config"),
  getLLMModelOptions: () => request("/llm-model-options"),
  saveLLMModelOptions: (payload: any) =>
    request("/llm-model-options", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  saveLLMConfig: (payload: any) =>
    request("/llm-config", { method: "POST", body: JSON.stringify(payload) }),
  testLLMConfig: (payload: any) =>
    request("/llm-config/test", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  getSubscriptionPlans: () => request("/subscription/plans"),
  getSubscriptionSelf: () => request("/subscription/self"),
  redeemSubscriptionCode: (payload: { code: string }) =>
    request("/subscription/redeem", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createEpaySubscriptionPayment: (payload: {
    plan_id?: number;
    plan_key?: string;
    payment_method?: string;
    return_url?: string;
  }) =>
    request("/subscription/epay/pay", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createStripeSubscriptionPayment: (payload: {
    plan_id?: number;
    plan_key?: string;
    return_url?: string;
  }) =>
    request("/subscription/stripe/pay", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createEpayCreditRecharge: (payload: {
    amount_cents: number;
    payment_method?: string;
    return_url?: string;
  }) =>
    request("/subscription/credits/epay/pay", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createStripeCreditRecharge: (payload: {
    amount_cents: number;
    return_url?: string;
  }) =>
    request("/subscription/credits/stripe/pay", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createRewardAdSession: (payload: { provider?: string }) =>
    request("/subscription/reward-ads/session", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  completeRewardAdSession: (payload: { session_token: string }) =>
    request("/subscription/reward-ads/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAdminSubscriptionPlans: () => request("/admin/subscription/plans"),
  createAdminSubscriptionPlan: (payload: any) =>
    request("/admin/subscription/plans", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAdminSubscriptionPlan: (planId: number, payload: any) =>
    request(`/admin/subscription/plans/${planId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listAdminRedeemCodes: () => request("/admin/redeem-codes"),
  createAdminRedeemCode: (payload: any) =>
    request("/admin/redeem-codes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAdminRedeemCode: (codeId: number, payload: any) =>
    request(`/admin/redeem-codes/${codeId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  disableAdminRedeemCode: (codeId: number) =>
    request(`/admin/redeem-codes/${codeId}`, { method: "DELETE" }),
  listAdminRedeemCodeUses: (codeId: number) =>
    request(`/admin/redeem-codes/${codeId}/uses`),
  getAdminPaymentSettings: () => request("/admin/payment-settings"),
  saveAdminPaymentSettings: (payload: any) =>
    request("/admin/payment-settings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAdminBillingSettings: () => request("/admin/billing-settings"),
  saveAdminBillingSettings: (payload: any) =>
    request("/admin/billing-settings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAdminNewsSettings: () => request("/admin/news-settings"),
  saveAdminNewsSettings: (payload: any) =>
    request("/admin/news-settings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAdminTokenCostPricing: () =>
    request("/admin/token-cost/pricing", { timeoutMs: 20_000 }),
  saveAdminTokenCostPricing: (payload: any) =>
    request("/admin/token-cost/pricing", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    }),
  getAdminTokenCostDashboard: (filters: {
    days?: number;
    userId?: number;
    moduleKey?: string;
    model?: string;
    page?: number;
    pageSize?: number;
  } = {}) => {
    const params = new URLSearchParams();
    params.set("days", String(filters.days || 30));
    params.set("page", String(filters.page || 1));
    params.set("page_size", String(filters.pageSize || 10));
    if (filters.userId) params.set("user_id", String(filters.userId));
    if (filters.moduleKey) params.set("module_key", filters.moduleKey);
    if (filters.model) params.set("model", filters.model);
    return request(`/admin/token-cost/dashboard?${params.toString()}`, {
      timeoutMs: 30_000,
    });
  },
  getAdminRevenueDashboard: (filters: {
    days?: number;
    userId?: number;
    usdCny?: number;
    homepageEcpmCny?: number;
    rewardedEcpmCny?: number;
  } = {}) => {
    const params = new URLSearchParams();
    params.set("days", String(filters.days || 30));
    params.set("usd_cny", String(filters.usdCny || 7.2));
    params.set("homepage_ecpm_cny", String(filters.homepageEcpmCny || 20));
    params.set("rewarded_ecpm_cny", String(filters.rewardedEcpmCny || 60));
    if (filters.userId) params.set("user_id", String(filters.userId));
    return request(`/admin/revenue/dashboard?${params.toString()}`, {
      timeoutMs: 30_000,
    });
  },
  getAdminAnalyticsDashboard: (filters: { days?: number } = {}) => {
    const params = new URLSearchParams();
    params.set("days", String(filters.days || 30));
    return request(`/admin/analytics/dashboard?${params.toString()}`, {
      timeoutMs: 30_000,
    });
  },
  listLLMModels: (payload: any) =>
    request("/llm-config/models", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    }),
  runAlphaRecommend: (payload: { strategy_name?: string; limit?: number; market?: string }) =>
    request("/alpha/recommend", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAlphaRecommendationSettings: () => request("/alpha/settings"),
  getAdminAlphaRecommendationSettings: () => request("/admin/alpha/settings"),
  saveAdminAlphaRecommendationSettings: (payload: any) =>
    request("/admin/alpha/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getPositionAdvice: (market = "CN") =>
    request(`/position-advice?market=${encodeURIComponent(market)}`),
  runPositionAdvice: (payload: { model?: string; market?: string } = {}) =>
    request("/position-advice/run", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listStrategies: () => request("/strategy/list"),
  getStrategy: (id: number) => request(`/strategy/${id}`),
  previewStrategyStockPool: (payload: {
    factor_ids: number[];
    factor_specs?: any[];
    limit?: number;
    universe_limit?: number;
    date?: string;
  }) =>
    request("/strategy/stock-pool/preview", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    }),
  generateStrategy: (payload: any) =>
    request("/strategy/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  generateStrategyStream: (payload: any, handlers?: StreamHandlers) =>
    streamSse(
      "/strategy/generate/stream",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      handlers,
    ),
  testStrategy: (payload: any) =>
    request("/strategy/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  saveStrategy: (payload: any) =>
    request("/strategy/save", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listAgents: () => request("/agents"),
  createAgent: (payload: {
    name: string;
    strategy_id?: number;
    strategy_name?: string;
    agent_type?: string;
    factor_ids?: number[];
  }) => request("/agents", { method: "POST", body: JSON.stringify(payload) }),
  seedBacktestAgents: () => request("/agents/seed-backtest", { method: "POST" }),
  startAgent: (id: number) =>
    request(`/agents/${id}/start`, { method: "POST" }),
  stopAgent: (id: number) => request(`/agents/${id}/stop`, { method: "POST" }),
  deleteAgent: (id: number) => request(`/agents/${id}`, { method: "DELETE" }),
  getAgentPerformance: (id: number) => request(`/agents/${id}/performance`),
  getBenchmark: (startDate: string, endDate: string, code = "sh000300") =>
    request(
      `/backtest/benchmark?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&code=${encodeURIComponent(code)}`,
    ),
  runBacktest: (payload: {
    strategy_code: string;
    market?: string;
    start_date: string;
    end_date?: string;
    initial_capital?: number;
    commission?: number;
    factor_ids?: number[];
    factor_specs?: any[];
    max_stocks?: number;
  }) =>
    request("/backtest/run", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: BACKTEST_REQUEST_TIMEOUT_MS,
    }),
  getRiskTrend: (days = 14, market = "CN") =>
    request(`/risk/trend?days=${days}&market=${encodeURIComponent(market)}`),
  getRiskSectorOptions: (market = "CN") =>
    request(`/risk/sector-options?market=${encodeURIComponent(market)}`),
  getRiskMonitorSettings: () => request("/risk/settings"),
  exportRiskMonitorSettings: () => request("/risk/settings/export"),
  saveRiskMonitorSettings: (config: any) =>
    request("/risk/settings", {
      method: "POST",
      body: JSON.stringify({ config }),
    }),
  getAdminRiskEventRules: () => request("/admin/risk/event-rules"),
  saveAdminRiskEventRules: (config: any) =>
    request("/admin/risk/event-rules", {
      method: "POST",
      body: JSON.stringify({ config }),
    }),
  getRiskSystemic: (sectors?: string[], market = "CN") => {
    const params = new URLSearchParams({ market });
    if (sectors?.length) params.set("sectors", sectors.join(","));
    return request(`/risk/systemic?${params.toString()}`);
  },
  getRiskEvents: (market = "CN") =>
    request(`/risk/events?market=${encodeURIComponent(market)}`),
  getRiskAiAssessment: (market = "CN") =>
    request(`/risk/ai-assessment?market=${encodeURIComponent(market)}`),
  runRiskAiAssessment: (options: { useLlm?: boolean; model?: string; market?: string } = {}) =>
    request("/risk/ai-assessment/run", {
      method: "POST",
      body: JSON.stringify({
        use_llm: options.useLlm ?? true,
        model: options.model || undefined,
        market: options.market || "CN",
      }),
      timeoutMs: 15_000,
    }),
  getRiskAssessmentTask: (taskId: number) =>
    request(`/risk/ai-assessment/tasks/${taskId}`),
  listRiskAssessmentTasks: (market = "CN", limit = 10) =>
    request(`/risk/ai-assessment/tasks?market=${encodeURIComponent(market)}&limit=${encodeURIComponent(String(limit))}`),
  getRiskFundFlow: (sectors?: string[], market = "CN") => {
    const params = new URLSearchParams({ market });
    if (sectors?.length) params.set("sectors", sectors.join(","));
    return request(`/risk/fund-flow?${params.toString()}`);
  },
  createSupportTicket: (payload: {
    category: string;
    subject: string;
    message: string;
  }) =>
    request("/support/tickets", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    }),
  listMySupportTickets: (limit = 100) =>
    request(`/support/tickets?limit=${encodeURIComponent(String(limit))}`),
  listAdminSupportTickets: (filters: {
    search?: string;
    status?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  } = {}) => {
    const params = new URLSearchParams({
      search: filters.search || "",
      status: filters.status || "",
      category: filters.category || "",
      page: String(filters.page || 1),
      page_size: String(filters.pageSize || 20),
    });
    return request(`/admin/support/tickets?${params.toString()}`);
  },
  updateAdminSupportTicket: (
    ticketId: number,
    payload: { status?: string; priority?: string; admin_reply?: string },
  ) =>
    request(`/admin/support/tickets/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    }),
  getNotifications: () => request("/notifications"),
  getNotificationWebhooks: () => request("/notification-webhooks"),
  saveNotificationWebhooks: (config: any) =>
    request("/notification-webhooks", {
      method: "POST",
      body: JSON.stringify({ config }),
    }),
  testNotificationWebhook: (payload: {
    provider: string;
    message?: string;
    config?: any;
  }) =>
    request("/notification-webhooks/test", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 8_000,
    }),
  markNotificationRead: (id?: number) =>
    request("/notifications/read", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  getUserProfile: () => request("/user/profile"),
  updateUserProfile: (payload: any) =>
    request("/user/profile", { method: "PUT", body: JSON.stringify(payload) }),
  getUserDataSummary: () => request("/user-data/summary"),
  exportUserData: (sections?: string[]) => {
    const selectedSections = Array.from(new Set((sections || []).map((section) => section.trim()).filter(Boolean)));
    const query = selectedSections.length
      ? `?sections=${encodeURIComponent(selectedSections.join(","))}`
      : "";
    const fallbackFilename =
      selectedSections.length === 1
        ? `quartsys-user-data-${selectedSections[0]}.json`
        : "quartsys-user-data.json";
    return downloadApiFile(`/user-data/export${query}`, fallbackFilename, {
      timeoutMs: 60_000,
    });
  },
  importUserData: (payload: { data: any; mode?: "merge" | "replace" }) =>
    request("/user-data/import", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 90_000,
    }),
  deleteUserData: (payload: { sections: string[]; confirm_text: string }) =>
    request("/user-data/delete", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 60_000,
    }),

  // ---- 因子挖掘模块 ----
  getFactorTemplates: () => request("/factors/templates"),
  getBuiltinFactors: () => request("/factors/builtin"),
  validateFactor: (payload: {
    expression: string;
    params?: Record<string, number>;
    output_type?: string;
  }) =>
    request("/factors/validate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  previewFactor: (payload: {
    expression: string;
    market?: string;
    params?: Record<string, number>;
    output_type?: string;
    filter_min?: number;
    filter_max?: number;
  }) =>
    request("/factors/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  testFactor: (payload: {
    expression: string;
    market?: string;
    params?: Record<string, number>;
    output_type?: string;
    filter_min?: number;
    filter_max?: number;
    limit?: number;
  }) =>
    request("/factors/test", { method: "POST", body: JSON.stringify(payload) }),
  generateFactorDraft: (payload: { prompt: string; model?: string; market?: string }) =>
    request("/factors/generate", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    }),
  listCustomFactors: () => request("/factors/custom"),
  createCustomFactor: (payload: any) =>
    request("/factors/custom", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getCustomFactor: (id: number) => request(`/factors/custom/${id}`),
  updateCustomFactor: (id: number, payload: any) =>
    request(`/factors/custom/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteCustomFactor: (id: number) =>
    request(`/factors/custom/${id}`, { method: "DELETE" }),
  initBuiltinFactors: () =>
    request("/factors/init-builtin", { method: "POST" }),

  // ---- 认证模块补全 ----
  register: (payload: {
    username: string;
    password: string;
    email?: string;
    email_code?: string;
    captcha_token?: string;
  }) =>
    request("/register", { method: "POST", body: JSON.stringify(payload) }),
  resetPassword: (payload: {
    username: string;
    old_password?: string;
    new_password: string;
    email?: string;
    email_code?: string;
    captcha_token?: string;
  }) =>
    request("/reset_password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ---- 自选模块补全 ----
  deleteWatchlist: (payload: { group_name: string; code: string }) =>
    request("/watchlist", { method: "DELETE", body: JSON.stringify(payload) }),
  deleteWatchlistGroup: (payload: { group_name: string }) =>
    request("/watchlist/group", {
      method: "DELETE",
      body: JSON.stringify(payload),
    }),
  renameWatchlistGroup: (payload: { group_name: string; new_group_name: string }) =>
    request("/watchlist/group", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  updateWatchlistGroupColor: (payload: { group_name: string; color: string }) =>
    request("/watchlist/group_color", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ---- 选股模块补全 ----
  deleteScreenerResults: () =>
    request("/screener/results", { method: "DELETE" }),

  // ---- 配置/辅助模块补全 ----
  getLogs: (limit?: number) => request(`/logs?limit=${limit || 100}`),
  exportLogsUrl: (limit?: number) =>
    `${getApiBase()}/logs/export?limit=${encodeURIComponent(String(limit || 5000))}`,
};
