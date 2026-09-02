export type AuthUser = {
  id?: number;
  username: string;
  email?: string;
  role?: string;
  permissions?: string[];
  avatar_url?: string;
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "系统管理员",
  normal: "社区用户",
  user: "社区用户",
  vip: "社区用户",
  svip: "社区用户",
};

export const ROUTE_PERMISSIONS: Record<string, string> = {
  "/dashboard": "dashboard.view",
  "/screener": "screener.use",
  "/quote": "quote.view",
  "/strategy": "strategy.manage",
  "/factor-mining": "factors.manage",
  "/backtesting": "backtest.run",
  "/risk": "risk.view",
  "/ai-insights": "ai.insights",
  "/smart-research": "smart_research.use",
  "/agent-analysis": "agent_analysis.use",
  "/trading": "trading.use",
  "/revenue": "system.manage",
  "/analytics": "system.manage",
  "/token-cost": "system.manage",
  "/settings": "settings.view",
  "/replica": "system.manage",
};

export const ROUTE_ORDER = [
  "/dashboard",
  "/quote",
  "/screener",
  "/strategy",
  "/factor-mining",
  "/backtesting",
  "/risk",
  "/ai-insights",
  "/smart-research",
  "/agent-analysis",
  "/trading",
  "/revenue",
  "/analytics",
  "/token-cost",
  "/settings",
  "/replica",
] as const;

const AUTH_USER_KEY = "quartsys_auth_user";
const AUTH_PERMISSIONS_VERSION_KEY = "quartsys_permissions_version";
const AUTH_PERMISSIONS_VERSION = "2026-07-10-agent-analysis-v1";

function normalizePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function normalizeAuthUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const username = String(raw.username || "").trim();
  if (!username) return null;
  return {
    id: typeof raw.id === "number" ? raw.id : undefined,
    username,
    email: String(raw.email || ""),
    role: String(raw.role || "user"),
    permissions: normalizePermissions(raw.permissions),
    avatar_url: String(raw.avatar_url || ""),
  };
}

export function getToken() {
  return localStorage.getItem("quartsys_token") || localStorage.getItem("token") || "";
}

export function setToken(token: string) {
  if (!token) {
    localStorage.removeItem("quartsys_token");
    localStorage.removeItem("token");
    return;
  }
  localStorage.setItem("quartsys_token", token);
  localStorage.setItem("token", token);
}

export function clearAuth() {
  localStorage.removeItem("quartsys_token");
  localStorage.removeItem("token");
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_PERMISSIONS_VERSION_KEY);
  localStorage.removeItem("quartsys_user");
  localStorage.removeItem("quartsys_avatar_url");
  localStorage.removeItem("quartsys_role");
  localStorage.removeItem("quartsys_permissions");
  localStorage.removeItem("user");
}

export function isLoggedIn() {
  return Boolean(getToken());
}

export function setAuthUser(user: unknown) {
  const normalized = normalizeAuthUser(user);
  if (!normalized) return;
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalized));
  localStorage.setItem(AUTH_PERMISSIONS_VERSION_KEY, AUTH_PERMISSIONS_VERSION);
  localStorage.setItem("quartsys_user", normalized.username);
  localStorage.setItem("quartsys_role", normalized.role || "user");
  localStorage.setItem(
    "quartsys_permissions",
    JSON.stringify(normalized.permissions || []),
  );
  if (normalized.avatar_url) {
    localStorage.setItem("quartsys_avatar_url", normalized.avatar_url);
  } else {
    localStorage.removeItem("quartsys_avatar_url");
  }
}

export function getAuthUser(): AuthUser | null {
  const permissionsAreFresh =
    localStorage.getItem(AUTH_PERMISSIONS_VERSION_KEY) === AUTH_PERMISSIONS_VERSION;
  const stored = localStorage.getItem(AUTH_USER_KEY);
  if (stored) {
    try {
      const normalized = normalizeAuthUser(JSON.parse(stored));
      if (normalized) {
        return permissionsAreFresh
          ? normalized
          : { ...normalized, permissions: [] };
      }
    } catch {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  }

  const username = localStorage.getItem("quartsys_user") || localStorage.getItem("user") || "";
  if (!username) return null;

  let permissions: string[] = [];
  try {
    permissions = normalizePermissions(JSON.parse(localStorage.getItem("quartsys_permissions") || "[]"));
  } catch {
    permissions = [];
  }

  return {
    username,
    role: localStorage.getItem("quartsys_role") || "user",
    permissions: permissionsAreFresh ? permissions : [],
    avatar_url: localStorage.getItem("quartsys_avatar_url") || "",
  };
}

export function getPermissions() {
  return getAuthUser()?.permissions || [];
}

export function hasPermission(permission?: string) {
  if (!permission) return true;
  return getPermissions().includes(permission);
}

export function hasAnyPermission(permissions: string[]) {
  if (permissions.length === 0) return true;
  const current = getPermissions();
  return permissions.some((permission) => current.includes(permission));
}

export function canAccessPath(pathname: string) {
  if (!pathname || pathname === "/") return true;
  const matched = ROUTE_ORDER.find(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return matched ? hasPermission(ROUTE_PERMISSIONS[matched]) : true;
}

export function firstAccessiblePath() {
  return ROUTE_ORDER.find((route) => hasPermission(ROUTE_PERMISSIONS[route])) || "/settings";
}
