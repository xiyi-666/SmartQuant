import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Download, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import {
  SiAlipay,
  SiStripe,
  SiTelegram,
  SiTencentqq,
  SiWechat,
  SiWhatsapp,
} from "react-icons/si";
import { Navigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import {
  getAuthUser,
  getToken,
  hasPermission,
  ROLE_LABELS,
  setAuthUser,
  type AuthUser,
} from "../shared/auth";
import {
  saveAiModelState,
  saveAiModuleModels,
  type AiModuleKey,
  type AiModuleModels,
} from "../shared/aiModels";
import { useLanguage, useLangText } from "../shared/language";
import {
  MARKET_DEFINITIONS,
  MARKET_ORDER,
  type MarketCode,
  useMarket,
} from "../shared/market";
import { useTheme, type ThemeMode } from "../shared/theme";
import { presentGoogleRewardedAd } from "../shared/rewardedAds";
import BillingConfigSection from "../components/settings/BillingConfigSection";
import {
  DEFAULT_CUSTOMER_SERVICE_AI_CONFIG,
  normalizeCustomerServiceAiConfig,
  type CustomerServiceAiConfig,
  type CustomerServiceKbFile,
} from "../shared/customerService";
import {
  DEFAULT_PUBLIC_SITE_SETTINGS,
  HOMEPAGE_AD_FORMATS,
  HOMEPAGE_AD_PLATFORMS,
  normalizePublicSiteSettings,
  type HomepageAdFormat,
  type HomepageAdPlatform,
  type PublicHomepageAdBlock,
  type PublicSiteLink,
  type PublicSiteSettings,
} from "../shared/siteConfig";
import { COMMUNITY_EDITION, COMMUNITY_HIDDEN_SETTINGS_TABS } from "../shared/edition";

const TABS = [
  "SUBSCRIPTION",
  "DATA MANAGEMENT",
  "SITE CONFIG",
  "PAYMENT CONFIG",
  "BILLING CONFIG",
  "REDEEM CODES",
  "AUTH SECURITY",
  "NOTIFICATIONS",
  "PREFERENCES",
  "NEWS CONFIG",
  "RISK CONFIG",
  "TRADING CONFIG",
  "AI CONFIG",
  "AI CUSTOMER SERVICE",
  "LOGS",
  "USERS",
  "PROFILE",
] as const;
type Tab = (typeof TABS)[number];
type AdminUser = AuthUser & {
  id: number;
  created_at?: string | null;
  is_current?: boolean;
  role_default_permissions?: string[];
  has_custom_permissions?: boolean;
  subscription?: {
    plan_name?: string;
    plan_key?: string;
    role?: string;
    status?: string;
    expires_at?: string | null;
  } | null;
};

const TAB_LABELS: Record<Tab, string> = {
  SUBSCRIPTION: "订阅",
  "DATA MANAGEMENT": "数据管理",
  "SITE CONFIG": "站点设置",
  "PAYMENT CONFIG": "支付配置",
  "BILLING CONFIG": "计费配置",
  "REDEEM CODES": "兑换码",
  "AUTH SECURITY": "认证安全",
  NOTIFICATIONS: "通知机器人",
  PREFERENCES: "偏好",
  "NEWS CONFIG": "资讯来源",
  "RISK CONFIG": "风险监控",
  "TRADING CONFIG": "交易参数",
  "AI CONFIG": "AI 配置",
  "AI CUSTOMER SERVICE": "AI客服",
  LOGS: "日志",
  USERS: "用户权限",
  PROFILE: "个人信息",
};

const TAB_LABELS_EN: Record<Tab, string> = {
  SUBSCRIPTION: "Subscription",
  "DATA MANAGEMENT": "Data Management",
  "SITE CONFIG": "Site Settings",
  "PAYMENT CONFIG": "Payment Config",
  "BILLING CONFIG": "Billing Config",
  "REDEEM CODES": "Redeem Codes",
  "AUTH SECURITY": "Auth Security",
  NOTIFICATIONS: "Notification Bots",
  PREFERENCES: "Preferences",
  "NEWS CONFIG": "News Sources",
  "RISK CONFIG": "Risk Monitor",
  "TRADING CONFIG": "Trading Parameters",
  "AI CONFIG": "AI Config",
  "AI CUSTOMER SERVICE": "AI Support",
  LOGS: "Logs",
  USERS: "User Permissions",
  PROFILE: "Profile",
};

const SYSTEM_TABS: Tab[] = ["SITE CONFIG", "PAYMENT CONFIG", "BILLING CONFIG", "REDEEM CODES", "AUTH SECURITY", "AI CONFIG", "AI CUSTOMER SERVICE", "NEWS CONFIG", "LOGS", "USERS", "TRADING CONFIG"];
const ROLE_OPTIONS: readonly ("admin" | "normal" | "vip" | "svip")[] = COMMUNITY_EDITION
  ? ["admin", "normal"]
  : ["admin", "normal", "vip", "svip"];
const ROLE_LABELS_EN: Record<string, string> = {
  admin: "Administrator",
  normal: "Community User",
  user: "Community User",
  vip: "Community User",
  svip: "Community User",
};

function normalizedRole(role?: string) {
  const value = String(role || "normal").toLowerCase();
  if (value === "admin" || value === "vip" || value === "svip") return value;
  return "normal";
}

function roleText(role: string | undefined, lt: (zh: string, en: string) => string) {
  const key = normalizedRole(role);
  return lt(ROLE_LABELS[key] || key, ROLE_LABELS_EN[key] || key);
}

type SettingsTabAccess = {
  canManageSystem: boolean;
  canManageNotifications: boolean;
  canViewRisk: boolean;
};

function canViewSettingsTab(tab: Tab, access: SettingsTabAccess) {
  if (COMMUNITY_EDITION && COMMUNITY_HIDDEN_SETTINGS_TABS.has(tab)) return false;
  if (SYSTEM_TABS.includes(tab)) return access.canManageSystem;
  if (tab === "NOTIFICATIONS") return access.canManageNotifications;
  if (tab === "RISK CONFIG") return access.canViewRisk;
  return true;
}

function tabFromQuery(value: string | null): Tab | null {
  const normalized = (value || "").trim().toLowerCase();
  const map: Record<string, Tab> = {
    profile: "PROFILE",
    users: "USERS",
    permissions: "USERS",
    ai: "AI CONFIG",
    "ai-config": "AI CONFIG",
    "ai-customer-service": "AI CUSTOMER SERVICE",
    "customer-service": "AI CUSTOMER SERVICE",
    "customer-service-ai": "AI CUSTOMER SERVICE",
    "ai-service": "AI CUSTOMER SERVICE",
    llm: "AI CONFIG",
    "llm-config": "AI CONFIG",
    risk: "RISK CONFIG",
    "risk-config": "RISK CONFIG",
    "risk-monitor": "RISK CONFIG",
    logs: "LOGS",
    api: "AI CONFIG",
    preferences: "PREFERENCES",
    subscription: "SUBSCRIPTION",
    data: "DATA MANAGEMENT",
    "data-management": "DATA MANAGEMENT",
    "user-data": "DATA MANAGEMENT",
    portability: "DATA MANAGEMENT",
    site: "SITE CONFIG",
    "site-config": "SITE CONFIG",
    branding: "SITE CONFIG",
    payment: "PAYMENT CONFIG",
    "payment-config": "PAYMENT CONFIG",
    payments: "PAYMENT CONFIG",
    billing: "BILLING CONFIG",
    "billing-config": "BILLING CONFIG",
    pricing: "BILLING CONFIG",
    redeem: "REDEEM CODES",
    "redeem-codes": "REDEEM CODES",
    coupons: "REDEEM CODES",
    codes: "REDEEM CODES",
    auth: "AUTH SECURITY",
    "auth-security": "AUTH SECURITY",
    security: "AUTH SECURITY",
    notifications: "NOTIFICATIONS",
    notification: "NOTIFICATIONS",
    webhook: "NOTIFICATIONS",
    webhooks: "NOTIFICATIONS",
    news: "NEWS CONFIG",
    "news-config": "NEWS CONFIG",
    "news-sources": "NEWS CONFIG",
  };
  return map[normalized] || null;
}

function queryFromTab(value: Tab): string {
  const map: Record<Tab, string> = {
    PROFILE: "profile",
    USERS: "users",
    "AI CONFIG": "ai-config",
    "AI CUSTOMER SERVICE": "ai-customer-service",
    "RISK CONFIG": "risk-config",
    LOGS: "logs",
    PREFERENCES: "preferences",
    "NEWS CONFIG": "news-config",
    SUBSCRIPTION: "subscription",
    "DATA MANAGEMENT": "data-management",
    "SITE CONFIG": "site-config",
    "PAYMENT CONFIG": "payment",
    "BILLING CONFIG": "billing-config",
    "REDEEM CODES": "redeem-codes",
    "AUTH SECURITY": "auth-security",
    NOTIFICATIONS: "notifications",
  };
  return map[value];
}

const PROVIDER_LABELS_ZH: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Google Gemini",
  custom: "自定义接口",
};

const PROVIDER_LABELS_EN: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Google Gemini",
  custom: "Custom endpoint",
};

const LLM_PROTOCOL_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Claude" },
  { value: "google", label: "Gemini" },
] as const;

const GLOBAL_PROVIDER_OPTIONS = [
  ...LLM_PROTOCOL_OPTIONS,
  { value: "custom", label: "自定义接口", labelEn: "Custom endpoint" },
] as const;

const AI_MODULE_CONFIGS: {
  key: AiModuleKey;
  title: string;
  titleEn: string;
  desc: string;
  descEn: string;
  costKey?: string;
}[] = [
  { key: "ai_insights", title: "AI洞察", titleEn: "AI Insights", desc: "市场与个股分析", descEn: "Market and equity analysis", costKey: "ai_insights" },
  { key: "factor_generation", title: "AI生成因子", titleEn: "AI Factor Generation", desc: "按描述生成因子草稿", descEn: "Generate factor drafts from descriptions", costKey: "factor_generation" },
  { key: "assistant", title: "量化投研助手", titleEn: "Quant Research Assistant", desc: "投研问答、数据检索与策略编排", descEn: "Research Q&A, data retrieval and strategy orchestration" },
  { key: "smart_research", title: "智能研究", titleEn: "Smart Research", desc: "TradingAgents 多智能体个股研究", descEn: "TradingAgents multi-agent stock research", costKey: "smart_research" },
  { key: "agent_analysis", title: "AI分析师", titleEn: "AI Analysts", desc: "多位金融分析师讨论、追问与研究报告", descEn: "Multi-analyst discussions, follow-ups and research reports", costKey: "agent_analysis_turn" },
  { key: "strategy", title: "AI策略", titleEn: "AI Strategy", desc: "策略代码生成与调试", descEn: "Strategy code generation and debugging", costKey: "strategy_generation" },
  { key: "risk", title: "风险监控", titleEn: "Risk Monitor", desc: "AI风险评估与解释", descEn: "AI-assisted risk assessment and explanation", costKey: "risk_ai_assessment" },
];

type AiModuleProviders = Partial<Record<AiModuleKey, string>>;
type ModelTierKey = "smart" | "advanced" | "ultra";
type ModelTierConfig = {
  key: ModelTierKey;
  label: string;
  label_en: string;
  provider: string;
  model: string;
  multiplier: string;
  min_role: "normal" | "vip" | "svip";
  enabled: boolean;
};

const MODEL_TIER_KEYS: ModelTierKey[] = ["smart", "advanced", "ultra"];
const MODEL_TIER_DEFAULTS: Record<ModelTierKey, ModelTierConfig> = {
  smart: {
    key: "smart",
    label: "智能",
    label_en: "Smart",
    provider: "openai",
    model: "gpt-5.5",
    multiplier: "1",
    min_role: "normal",
    enabled: true,
  },
  advanced: {
    key: "advanced",
    label: "高级",
    label_en: "Advanced",
    provider: "openai",
    model: "gpt-5.5",
    multiplier: "1.25",
    min_role: "vip",
    enabled: true,
  },
  ultra: {
    key: "ultra",
    label: "超强",
    label_en: "Ultra",
    provider: "openai",
    model: "gpt-5.5",
    multiplier: "1.75",
    min_role: "vip",
    enabled: true,
  },
};

const CHINA_SENTIMENT_SOURCE_OPTIONS = [
  {
    key: "mootdx",
    title: "通达信",
    titleEn: "TongDaXin",
    desc: "盘口与A股行情",
    descEn: "Level quotes and A-share market data",
    icon: "candlestick_chart",
  },
  {
    key: "tencent",
    title: "腾讯财经",
    titleEn: "Tencent Finance",
    desc: "个股行情、估值和成交数据",
    descEn: "Quotes, valuation and turnover data",
    icon: "bolt",
  },
  {
    key: "eastmoney",
    title: "东方财富",
    titleEn: "Eastmoney",
    desc: "市场宽度、资金流、公告和研报",
    descEn: "Breadth, fund flow, announcements and reports",
    icon: "monitoring",
  },
  {
    key: "ths",
    title: "同花顺",
    titleEn: "iFinD / THS",
    desc: "热点概念与题材强度，需要 Cookie 时可在下方配置",
    descEn: "Hot concepts and theme strength; configure Cookie below when required",
    icon: "local_fire_department",
  },
  {
    key: "xueqiu",
    title: "雪球",
    titleEn: "Xueqiu",
    desc: "讨论情绪和社区热度，必须配置 Cookie",
    descEn: "Discussion sentiment and community heat; Cookie is required",
    icon: "forum",
  },
] as const;

const DEFAULT_CHINA_SENTIMENT_SOURCES = CHINA_SENTIMENT_SOURCE_OPTIONS.map(
  (item) => item.key,
);

const DEFAULT_TRADINGAGENTS_GLOBAL_NEWS_QUERIES = [
  "Federal Reserve interest rates inflation",
  "S&P 500 earnings GDP economic outlook",
  "geopolitical risk trade war sanctions",
  "ECB Bank of England BOJ central bank policy",
  "oil commodities supply chain energy",
];

function normalizeResearchToolsConfig(raw: any) {
  const config = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const market =
    config.market_data_sources &&
    typeof config.market_data_sources === "object" &&
    !Array.isArray(config.market_data_sources)
      ? config.market_data_sources
      : {};
  const rawSources = market.smart_research_sentiment;
  const sourceItems = Array.isArray(rawSources)
    ? rawSources
    : typeof rawSources === "string"
      ? rawSources.split(/[,;\s]+/)
      : DEFAULT_CHINA_SENTIMENT_SOURCES;
  const allowed = new Set(DEFAULT_CHINA_SENTIMENT_SOURCES);
  const sources = Array.from(
    new Set(
      sourceItems
        .map((item: any) => String(item || "").trim().toLowerCase())
        .filter((item: string) => allowed.has(item)),
    ),
  );
  const tradingagents =
    config.tradingagents &&
    typeof config.tradingagents === "object" &&
    !Array.isArray(config.tradingagents)
      ? config.tradingagents
      : {};
  const globalQueries = Array.isArray(tradingagents.global_news_queries)
    ? tradingagents.global_news_queries
    : DEFAULT_TRADINGAGENTS_GLOBAL_NEWS_QUERIES;
  return {
    config,
    market,
    sources: sources.length ? sources : DEFAULT_CHINA_SENTIMENT_SOURCES,
    xueqiuCookie: String(market.xueqiu_cookie || ""),
    thsCookie: String(market.ths_cookie || ""),
    tradingagents: {
      enableForeignSourcesForCnHk: Boolean(tradingagents.enable_foreign_sources_for_cn_hk),
      newsDataVendor: String(tradingagents.news_data_vendor || "yfinance"),
      newsArticleLimit: Number(tradingagents.news_article_limit ?? 8),
      globalNewsArticleLimit: Number(tradingagents.global_news_article_limit ?? 6),
      globalNewsLookbackDays: Number(tradingagents.global_news_lookback_days ?? 7),
      globalNewsQueriesText: globalQueries
        .map((item: any) => String(item || "").trim())
        .filter(Boolean)
        .join("\n"),
      enableFredMacro: tradingagents.enable_fred_macro !== false,
      fredApiKey: String(tradingagents.fred_api_key || ""),
      enablePredictionMarkets: tradingagents.enable_prediction_markets !== false,
    },
  };
}

function normalizeModuleModels(raw: any, fallback: string): AiModuleModels {
  return AI_MODULE_CONFIGS.reduce<AiModuleModels>((acc, item) => {
    const rawValue = raw?.[item.key];
    const model =
      rawValue && typeof rawValue === "object"
        ? rawValue.model
        : rawValue;
    acc[item.key] = String(model || fallback || "gpt-5.5").trim();
    return acc;
  }, {});
}

function normalizeModelTiers(raw: any, fallbackProvider: string, fallbackModel: string): ModelTierConfig[] {
  const source = Array.isArray(raw)
    ? raw.reduce<Record<string, any>>((acc, item) => {
        const key = String(item?.value || item?.key || "").trim();
        if (MODEL_TIER_KEYS.includes(key as ModelTierKey)) acc[key] = item;
        return acc;
      }, {})
    : raw && typeof raw === "object"
      ? raw
      : {};
  return MODEL_TIER_KEYS.map((key) => {
    const base = MODEL_TIER_DEFAULTS[key];
    const item = source[key] && typeof source[key] === "object" ? source[key] : {};
    return {
      key,
      label: String(item.label || base.label),
      label_en: String(item.label_en || base.label_en),
      provider: String(item.provider || fallbackProvider || base.provider),
      model: String(item.model || fallbackModel || base.model),
      multiplier: String(item.multiplier ?? base.multiplier),
      min_role: (["normal", "vip", "svip"].includes(String(item.min_role)) ? item.min_role : base.min_role) as ModelTierConfig["min_role"],
      enabled: item.enabled !== false,
    };
  });
}

function modelTiersToRecord(items: ModelTierConfig[]) {
  return MODEL_TIER_KEYS.reduce<Record<string, any>>((acc, key) => {
    const base = MODEL_TIER_DEFAULTS[key];
    const item = items.find((entry) => entry.key === key) || base;
    acc[key] = {
      label: String(item.label || base.label).trim(),
      label_en: String(item.label_en || base.label_en).trim(),
      provider: String(item.provider || base.provider).trim(),
      model: String(item.model || base.model).trim(),
      multiplier: Number(item.multiplier || base.multiplier) || Number(base.multiplier),
      min_role: key === "smart" ? "normal" : item.min_role || base.min_role,
      enabled: key === "smart" ? true : item.enabled !== false,
    };
    return acc;
  }, {});
}

function tierOptionsFromModelTiers(items: ModelTierConfig[]) {
  return items.map((item) => ({
    value: item.key,
    label: item.label,
    label_en: item.label_en,
    multiplier: Number(item.multiplier || 1) || 1,
    min_role: item.min_role,
    enabled: item.enabled,
  }));
}

function normalizeModuleModelTiers(raw: any): Partial<Record<AiModuleKey, ModelTierKey>> {
  return AI_MODULE_CONFIGS.reduce<Partial<Record<AiModuleKey, ModelTierKey>>>((acc, item) => {
    const value = String(raw?.[item.key] || "smart").trim();
    acc[item.key] = (MODEL_TIER_KEYS.includes(value as ModelTierKey) ? value : "smart") as ModelTierKey;
    return acc;
  }, {});
}

function modelTierDisplay(value: string, lang: "zh" | "en", tiers?: ModelTierConfig[]) {
  const key = MODEL_TIER_KEYS.includes(value as ModelTierKey) ? value as ModelTierKey : "smart";
  const item = tiers?.find((entry) => entry.key === key) || MODEL_TIER_DEFAULTS[key];
  return lang === "zh" ? item.label : item.label_en;
}

function modelTierMultiplier(value: string, tiers?: ModelTierConfig[]) {
  const key = MODEL_TIER_KEYS.includes(value as ModelTierKey) ? value as ModelTierKey : "smart";
  const item = tiers?.find((entry) => entry.key === key) || MODEL_TIER_DEFAULTS[key];
  const parsed = Number(item.multiplier || 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatMultiplierValue(value: number) {
  if (!Number.isFinite(value)) return "1";
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatModelTierCost(
  tier: ModelTierKey,
  baseCost: number,
  lang: "zh" | "en",
  tiers: ModelTierConfig[],
) {
  const multiplier = modelTierMultiplier(tier, tiers);
  const cost = Math.ceil(Math.max(0, Number(baseCost || 0)) * multiplier);
  const multiplierText = `${formatMultiplierValue(multiplier)}x`;
  return `${modelTierDisplay(tier, lang, tiers)} · ${multiplierText} · ${cost} ${lang === "zh" ? "额度/次" : "credits/call"}`;
}

function normalizeModuleProviders(raw: any, fallback: string): AiModuleProviders {
  return AI_MODULE_CONFIGS.reduce<AiModuleProviders>((acc, item) => {
    const rawValue = raw?.[item.key];
    const provider =
      rawValue && typeof rawValue === "object"
        ? rawValue.provider
        : fallback;
    acc[item.key] = String(provider || fallback || "openai").trim();
    return acc;
  }, {});
}

function buildModuleModelConfigs(
  moduleModels: AiModuleModels,
  moduleProviders: AiModuleProviders,
  fallbackProvider: string,
  fallbackModel: string,
) {
  return AI_MODULE_CONFIGS.reduce<Record<string, { provider: string; model: string }>>(
    (acc, item) => {
      acc[item.key] = {
        provider: String(moduleProviders[item.key] || fallbackProvider || "openai"),
        model: String(moduleModels[item.key] || fallbackModel || "gpt-5.5"),
      };
      return acc;
    },
    {},
  );
}

function mergeModelOptions(models: string[], ...extra: Array<string | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  [...models, ...extra].forEach((item) => {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
}

/* ── Profile Section ──────────────────────────────────────────────────────── */

const PHONE_COUNTRY_OPTIONS = [
  { code: "+86", zh: "中国大陆", en: "Mainland China" },
  { code: "+852", zh: "中国香港", en: "Hong Kong SAR" },
  { code: "+853", zh: "中国澳门", en: "Macao SAR" },
  { code: "+886", zh: "中国台湾", en: "Taiwan" },
  { code: "+1", zh: "美国 / 加拿大", en: "United States / Canada" },
  { code: "+44", zh: "英国", en: "United Kingdom" },
  { code: "+65", zh: "新加坡", en: "Singapore" },
  { code: "+81", zh: "日本", en: "Japan" },
  { code: "+82", zh: "韩国", en: "South Korea" },
  { code: "+61", zh: "澳大利亚", en: "Australia" },
];

function ProfileSection() {
  const lt = useLangText();
  const [profile, setProfile] = useState({
    username: "",
    email: "",
    avatar_url: "",
    phone_country_code: "+86",
    phone_number: "",
    phone_e164: "",
    role: getAuthUser()?.role || "user",
    permissions: getAuthUser()?.permissions || [],
  });
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [msg, setMsg] = useState("");
  const [avatarDragging, setAvatarDragging] = useState(false);

  useEffect(() => {
    (api as any)
      .getUserProfile()
      .then((d: any) => {
        setAuthUser(d);
        setProfile({
          username: d.username || "",
          email: d.email || "",
          avatar_url: d.avatar_url || "",
          phone_country_code: d.phone_country_code || "+86",
          phone_number: d.phone_number || "",
          phone_e164: d.phone_e164 || "",
          role: d.role || "user",
          permissions: Array.isArray(d.permissions) ? d.permissions : [],
        });
      })
      .catch(() => {});
  }, []);

  const handleAvatarFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg(lt("请选择图片文件", "Please choose an image file"));
      return;
    }
    if (file.size > 512 * 1024) {
      setMsg(lt("头像图片请控制在 512KB 以内", "Avatar image must be under 512KB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfile((p) => ({ ...p, avatar_url: String(reader.result || "") }));
      setMsg(lt("头像已载入，点击保存后生效", "Avatar loaded. Save to apply."));
    };
    reader.onerror = () => setMsg(lt("头像读取失败，请重新选择图片", "Failed to read avatar. Please choose another image."));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    try {
      const payload: any = {
        username: profile.username,
        email: profile.email,
        avatar_url: profile.avatar_url.trim(),
        phone_country_code: profile.phone_country_code,
        phone_number: profile.phone_number.trim(),
      };
      if (newPwd) {
        payload.old_password = oldPwd;
        payload.new_password = newPwd;
      }
      const nextProfile = await (api as any).updateUserProfile(payload);
      setAuthUser(nextProfile);
      setProfile((p) => ({
        ...p,
        username: nextProfile.username || profile.username,
        email: nextProfile.email || profile.email,
        avatar_url: nextProfile.avatar_url || "",
        phone_country_code: nextProfile.phone_country_code || "+86",
        phone_number: nextProfile.phone_number || "",
        phone_e164: nextProfile.phone_e164 || "",
        role: nextProfile.role || p.role,
        permissions: Array.isArray(nextProfile.permissions)
          ? nextProfile.permissions
          : p.permissions,
      }));
      window.dispatchEvent(new Event("quartsys:profile-updated"));
      setMsg(lt("保存成功", "Saved"));
      setOldPwd("");
      setNewPwd("");
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="settings-section settings-profile-section">
      <div
        className="settings-section-accent"
        style={{ height: 300, background: "var(--border-light)" }}
      />
      <div className="settings-section-header">
        <h2>{lt("个人信息", "Profile Details")}</h2>
        <p>{lt("更新登录账号、头像、邮箱和密码。", "Update your account, avatar, email and password.")}</p>
      </div>
      <div className="settings-profile-layout">
        <div
          className="settings-profile-avatar"
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            overflow: "hidden",
            border: "1px solid var(--border-light)",
            background: "var(--bg-gray)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--primary)",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={lt("用户头像", "User avatar")}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={() => setMsg(lt("头像链接无法加载，请检查 CDN 地址", "Avatar URL cannot be loaded. Check the CDN URL."))}
            />
          ) : (
            (profile.username || "U").charAt(0).toUpperCase()
          )}
        </div>
        <div className="settings-profile-main">
          <div className="settings-field">
            <label>{lt("头像 CDN 链接", "Avatar CDN URL")}</label>
            <input
              value={profile.avatar_url}
              placeholder="https://cdn.example.com/avatar.png"
              onChange={(e) =>
                setProfile((p) => ({ ...p, avatar_url: e.target.value }))
              }
            />
          </div>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setAvatarDragging(true);
            }}
            onDragLeave={() => setAvatarDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setAvatarDragging(false);
              handleAvatarFile(e.dataTransfer.files?.[0]);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              minHeight: 72,
              padding: "14px 16px",
              border: `1px dashed ${avatarDragging ? "var(--primary)" : "var(--border)"}`,
              borderRadius: "var(--radius-xl)",
              background: avatarDragging ? "var(--primary-light)" : "var(--bg-page)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                {lt("点击上传头像，或拖拽图片到这里", "Click to upload avatar, or drag image here")}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
                {lt("支持 PNG/JPG/WebP，上传图片不超过 512KB。", "PNG/JPG/WebP supported, max 512KB.")}
              </div>
            </div>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 24, color: "var(--primary)" }}
            >
              upload_file
            </span>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                handleAvatarFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="figma-btn"
              style={{ fontSize: 13 }}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = () => handleAvatarFile(input.files?.[0]);
                input.click();
              }}
            >
              {lt("选择本地图片", "Choose Local Image")}
            </button>
            <button
              type="button"
              className="figma-btn"
              style={{ fontSize: 13 }}
              onClick={() => {
                setProfile((p) => ({ ...p, avatar_url: "" }));
                setMsg(lt("头像已清除，点击保存后生效", "Avatar cleared. Save to apply."));
              }}
            >
              {lt("清除头像", "Clear Avatar")}
            </button>
            <span style={{ alignSelf: "center", fontSize: 12, color: "var(--text-muted)" }}>
              {lt("也可直接粘贴 CDN 图片链接。", "You can also paste a CDN image URL.")}
            </span>
          </div>
        </div>
      </div>
      <div className="settings-form-grid">
        <div className="settings-field">
          <label>{lt("用户名", "Username")}</label>
          <input
            value={profile.username}
            onChange={(e) =>
              setProfile((p) => ({ ...p, username: e.target.value }))
            }
          />
        </div>
        <div className="settings-field">
          <label>{lt("邮箱", "Email")}</label>
          <input
            value={profile.email}
            onChange={(e) =>
              setProfile((p) => ({ ...p, email: e.target.value }))
            }
          />
        </div>
        <div className="settings-field">
          <label>{lt("国家 / 地区码", "Country / Region Code")}</label>
          <input
            list="profile-phone-country-codes"
            inputMode="tel"
            placeholder="+86"
            value={profile.phone_country_code}
            onChange={(e) => setProfile((p) => ({ ...p, phone_country_code: e.target.value }))}
          />
          <datalist id="profile-phone-country-codes">
            {PHONE_COUNTRY_OPTIONS.map((item) => (
              <option key={item.code} value={item.code}>
                {lt(item.zh, item.en)}
              </option>
            ))}
          </datalist>
        </div>
        <div className="settings-field">
          <label>{lt("手机号码", "Mobile Number")}</label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={lt("不含国家 / 地区码", "Without country / region code")}
            value={profile.phone_number}
            onChange={(e) => setProfile((p) => ({ ...p, phone_number: e.target.value }))}
          />
          {profile.phone_e164 && (
            <small>{lt("已规范化：", "Normalized: ")}{profile.phone_e164}</small>
          )}
        </div>
        <div className="settings-field">
          <label>{lt("当前角色", "Current Role")}</label>
          <input
            value={roleText(profile.role, lt)}
            readOnly
          />
        </div>
        <div className="settings-field">
          <label>{lt("已授权功能数", "Granted Features")}</label>
          <input value={`${profile.permissions.length}`} readOnly />
        </div>
      </div>
      <div className="settings-profile-password-grid">
        <div className="settings-field">
          <label>{lt("当前密码", "Current Password")}</label>
          <input
            type="password"
            placeholder="••••••••••••••••"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
          />
        </div>
        <div className="settings-field" style={{ marginTop: 16 }}>
          <label>{lt("新密码（可选）", "New Password (optional)")}</label>
          <input
            type="password"
            placeholder="••••••••"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
          />
        </div>
      </div>
      <div
        style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}
      >
        <button className="figma-btn figma-btn-primary" onClick={save}>
          {lt("保存账号信息", "Update Credentials")}
        </button>
      </div>
      {msg && (
        <p style={{ marginTop: 12, fontSize: 14, color: "var(--text-muted)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

/* ── User Data Management Section ─────────────────────────────────────────── */

type UserDataSummarySection = {
  key: string;
  label: string;
  count: number;
};

const USER_DATA_SECTION_META: Record<string, { zh: string; en: string; descZh: string; descEn: string }> = {
  strategies: {
    zh: "策略",
    en: "Strategies",
    descZh: "AI 策略代码、参数和自动化配置",
    descEn: "AI strategy code, parameters and automation settings",
  },
  factors: {
    zh: "因子",
    en: "Factors",
    descZh: "自定义因子表达式、参数和筛选配置",
    descEn: "Custom factor expressions, parameters and filters",
  },
  research_reports: {
    zh: "研究报告",
    en: "Research Reports",
    descZh: "智能研究任务和 AI 洞察报告",
    descEn: "Smart Research tasks and AI Insights reports",
  },
  discussion_records: {
    zh: "讨论记录",
    en: "Discussion Records",
    descZh: "AI 分析师配置、讨论会话和消息",
    descEn: "AI Analyst profiles, sessions and messages",
  },
  watchlist: {
    zh: "自选股",
    en: "Watchlist",
    descZh: "自选分组、股票和颜色标记",
    descEn: "Watchlist groups, symbols and color marks",
  },
  simulation_accounts: {
    zh: "模拟账户",
    en: "Simulation Accounts",
    descZh: "模拟账户、持仓和交易记录",
    descEn: "Paper trading accounts, positions and trade records",
  },
};

function UserDataManagementSection() {
  const lt = useLangText();
  const [sections, setSections] = useState<UserDataSummarySection[]>([]);
  const [confirmText, setConfirmText] = useState("DELETE MY DATA");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteSections, setDeleteSections] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingSection, setExportingSection] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"muted" | "success" | "error">("muted");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const payload: any = await (api as any).getUserDataSummary();
      const nextSections = Array.isArray(payload?.sections) ? payload.sections : [];
      setSections(nextSections);
      setConfirmText(String(payload?.confirm_text || "DELETE MY DATA"));
      setDeleteSections((current) =>
        current.filter((key) => nextSections.some((section: UserDataSummarySection) => section.key === key)),
      );
    } catch (error: any) {
      setMsg(error?.message || lt("用户数据统计加载失败", "Failed to load user data summary"));
      setMsgTone("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  const totalCount = useMemo(
    () => sections.reduce((sum, section) => sum + Number(section.count || 0), 0),
    [sections],
  );

  const toggleDeleteSection = (key: string) => {
    setDeleteSections((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const sectionDisplayName = (key: string) => {
    const meta = USER_DATA_SECTION_META[key];
    return meta ? lt(meta.zh, meta.en) : key;
  };

  const exportData = async (sectionKeys: string[] = []) => {
    const selectedSections = Array.from(new Set(sectionKeys.filter(Boolean)));
    if (selectedSections.length === 1) {
      setExportingSection(selectedSections[0]);
    } else {
      setExporting(true);
    }
    setMsg("");
    try {
      const result: any = await (api as any).exportUserData(selectedSections);
      if (selectedSections.length === 1) {
        const label = sectionDisplayName(selectedSections[0]);
        setMsg(lt(`已导出${label}数据：${result?.filename || "JSON 文件"}`, `${label} data exported: ${result?.filename || "JSON file"}`));
      } else {
        setMsg(lt(`已导出用户数据：${result?.filename || "JSON 文件"}`, `User data exported: ${result?.filename || "JSON file"}`));
      }
      setMsgTone("success");
    } catch (error: any) {
      setMsg(error?.message || lt("导出失败", "Export failed"));
      setMsgTone("error");
    } finally {
      if (selectedSections.length === 1) {
        setExportingSection(null);
      } else {
        setExporting(false);
      }
    }
  };

  const importData = async () => {
    if (!importFile) {
      setMsg(lt("请选择要导入的 JSON 文件", "Choose a JSON file to import"));
      setMsgTone("error");
      return;
    }
    setImporting(true);
    setMsg("");
    try {
      const text = await importFile.text();
      const parsed = JSON.parse(text);
      const result: any = await (api as any).importUserData({
        data: parsed,
        mode: importMode,
      });
      const importedTotal = Object.values(result?.imported || {}).reduce(
        (sum: number, value: any) => sum + Number(value || 0),
        0,
      );
      setMsg(lt(`导入完成，共处理 ${importedTotal} 条记录。`, `Import complete. ${importedTotal} records processed.`));
      setMsgTone("success");
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadSummary();
    } catch (error: any) {
      setMsg(error?.message || lt("导入失败，请确认文件格式", "Import failed. Check the file format."));
      setMsgTone("error");
    } finally {
      setImporting(false);
    }
  };

  const deleteData = async () => {
    if (!deleteSections.length) {
      setMsg(lt("请选择要删除的数据类型", "Choose data sections to delete"));
      setMsgTone("error");
      return;
    }
    if (deleteConfirm !== confirmText) {
      setMsg(lt("确认文本不正确", "Confirmation text is incorrect"));
      setMsgTone("error");
      return;
    }
    setDeleting(true);
    setMsg("");
    try {
      const result: any = await (api as any).deleteUserData({
        sections: deleteSections,
        confirm_text: deleteConfirm,
      });
      const deletedTotal = Object.values(result?.deleted || {}).reduce(
        (sum: number, value: any) => sum + Number(value || 0),
        0,
      );
      setMsg(lt(`已删除 ${deletedTotal} 条用户数据。`, `${deletedTotal} user data records deleted.`));
      setMsgTone("success");
      setDeleteConfirm("");
      setDeleteSections([]);
      await loadSummary();
    } catch (error: any) {
      setMsg(error?.message || lt("删除失败", "Delete failed"));
      setMsgTone("error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="settings-section settings-user-data-section">
      <div className="settings-section-header settings-user-data-header">
        <div>
          <span className="material-symbols-outlined">database</span>
          <h2>{lt("用户数据管理", "User Data Management")}</h2>
        </div>
        <p>
          {lt(
            "策略、因子、研究报告、讨论记录、自选股和模拟账户数据支持自助导出",
            "Strategies, factors, reports, discussions, watchlists and paper account data support self-service export.",
          )}
        </p>
      </div>

      <div className="settings-user-data-summary">
        <div className="settings-user-data-total">
          <span>{lt("当前账号数据", "Current Account Data")}</span>
          <strong>{loading ? "..." : totalCount}</strong>
          <small>{lt("按可迁移数据表统计", "Counted by portable data tables")}</small>
        </div>
        <button className="figma-btn" type="button" onClick={loadSummary} disabled={loading}>
          <RefreshCw size={15} className={loading ? "settings-spin" : ""} />
          {lt("刷新", "Refresh")}
        </button>
      </div>

      <div className="settings-user-data-grid">
        {sections.map((section) => {
          const meta = USER_DATA_SECTION_META[section.key] || {
            zh: section.label || section.key,
            en: section.key,
            descZh: "",
            descEn: "",
          };
          const isSectionExporting = exportingSection === section.key;
          return (
            <div key={section.key} className="settings-user-data-card">
              <label className="settings-user-data-card-select">
                <input
                  type="checkbox"
                  checked={deleteSections.includes(section.key)}
                  onChange={() => toggleDeleteSection(section.key)}
                  aria-label={lt(`选择${meta.zh}`, `Select ${meta.en}`)}
                />
                <span className="settings-user-data-card-text">
                  <strong>{lt(meta.zh, meta.en)}</strong>
                  <span>{lt(meta.descZh, meta.descEn)}</span>
                </span>
              </label>
              <div className="settings-user-data-card-side">
                <b>{Number(section.count || 0)}</b>
                <button
                  className="figma-btn settings-user-data-export-btn"
                  type="button"
                  onClick={() => exportData([section.key])}
                  disabled={loading || exporting || exportingSection !== null}
                >
                  <Download size={13} />
                  {isSectionExporting ? lt("导出中", "Exporting") : lt("导出", "Export")}
                </button>
              </div>
            </div>
          );
        })}
        {!loading && sections.length === 0 && (
          <p className="settings-user-data-empty">{lt("暂无可管理的用户数据。", "No user data is available.")}</p>
        )}
      </div>

      <div className="settings-user-data-actions">
        <div className="settings-user-data-panel">
          <div className="settings-user-data-panel-head">
            <Download size={18} aria-hidden="true" />
            <div>
              <strong>{lt("导出", "Export")}</strong>
              <span>{lt("生成完整 JSON 备份，可用于迁移到其它账号。", "Create a full JSON backup for migration to another account.")}</span>
            </div>
          </div>
          <button className="figma-btn figma-btn-primary" type="button" onClick={() => exportData()} disabled={exporting || exportingSection !== null || loading}>
            <Download size={15} />
            {exporting ? lt("导出中...", "Exporting...") : lt("导出 JSON", "Export JSON")}
          </button>
        </div>

        <div className="settings-user-data-panel">
          <div className="settings-user-data-panel-head">
            <Upload size={18} aria-hidden="true" />
            <div>
              <strong>{lt("导入 / 迁移", "Import / Migrate")}</strong>
              <span>{lt("支持合并导入，也可先清空同类数据后替换。", "Merge into current data or replace matching sections first.")}</span>
            </div>
          </div>
          <div className="settings-user-data-import-row">
            <select value={importMode} onChange={(event) => setImportMode(event.target.value as "merge" | "replace")}>
              <option value="merge">{lt("合并导入", "Merge")}</option>
              <option value="replace">{lt("替换同类数据", "Replace")}</option>
            </select>
            <button className="figma-btn" type="button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} />
              {importFile ? importFile.name : lt("选择文件", "Choose File")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => setImportFile(event.target.files?.[0] || null)}
            />
          </div>
          <button className="figma-btn figma-btn-primary" type="button" onClick={importData} disabled={importing || !importFile}>
            <Upload size={15} />
            {importing ? lt("导入中...", "Importing...") : lt("开始导入", "Start Import")}
          </button>
        </div>

        <div className="settings-user-data-panel danger">
          <div className="settings-user-data-panel-head">
            <Trash2 size={18} aria-hidden="true" />
            <div>
              <strong>{lt("删除", "Delete")}</strong>
              <span>{lt("只删除已勾选的数据类型，不影响账号、订阅和系统配置。", "Only selected sections are deleted. Account, subscription and system settings remain.")}</span>
            </div>
          </div>
          <label className="settings-user-data-confirm">
            <span>{lt("输入确认文本", "Confirmation Text")}: <code>{confirmText}</code></span>
            <input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={confirmText}
            />
          </label>
          <button
            className="figma-btn"
            type="button"
            onClick={deleteData}
            disabled={deleting || !deleteSections.length || deleteConfirm !== confirmText}
          >
            <Trash2 size={15} />
            {deleting ? lt("删除中...", "Deleting...") : lt("删除已选数据", "Delete Selected Data")}
          </button>
        </div>
      </div>

      {msg && <p className={`settings-user-data-message ${msgTone}`}>{msg}</p>}
    </div>
  );
}

/* ── AI Config Section ────────────────────────────────────────────────────── */

type RecommendationWeightKey =
  | "change"
  | "liquidity"
  | "valuation"
  | "turnover"
  | "ma"
  | "quality";

type RecommendationSchemeDraft = {
  key: string;
  label_zh: string;
  label_en: string;
  kind: "balanced" | "momentum" | "reversal";
  description_zh: string;
  description_en: string;
  enabled: boolean;
  weights: Record<RecommendationWeightKey, number>;
  stop_loss_pct: number;
  target_pct: number;
};

type RecommendationSettingsDraft = {
  enabled: boolean;
  section_title_zh: string;
  section_title_en: string;
  prefer_curated_cache: boolean;
  display_fields: string[];
  schemes: RecommendationSchemeDraft[];
};

const RECOMMENDATION_WEIGHT_FIELDS: Array<{
  key: RecommendationWeightKey;
  zh: string;
  en: string;
}> = [
  { key: "change", zh: "涨跌动量", en: "Price Momentum" },
  { key: "liquidity", zh: "流动性", en: "Liquidity" },
  { key: "valuation", zh: "估值", en: "Valuation" },
  { key: "turnover", zh: "换手率", en: "Turnover" },
  { key: "ma", zh: "均线结构", en: "MA Structure" },
  { key: "quality", zh: "盈利质量", en: "Quality" },
];

const DEFAULT_RECOMMENDATION_SETTINGS: RecommendationSettingsDraft = {
  enabled: true,
  section_title_zh: "AI 观察池",
  section_title_en: "AI Watchlist Pool",
  prefer_curated_cache: false,
  display_fields: ["score", "logic", "price_plan"],
  schemes: [],
};

function normalizeRecommendationSettings(value: any): RecommendationSettingsDraft {
  const schemes = Array.isArray(value?.schemes)
    ? value.schemes.map((item: any, index: number) => ({
        key: String(item?.key || `scheme_${index + 1}`),
        label_zh: String(item?.label_zh || "观察方案"),
        label_en: String(item?.label_en || "Observation Scheme"),
        kind: (["momentum", "reversal"].includes(String(item?.kind))
          ? item.kind
          : "balanced") as RecommendationSchemeDraft["kind"],
        description_zh: String(item?.description_zh || ""),
        description_en: String(item?.description_en || ""),
        enabled: item?.enabled !== false,
        weights: Object.fromEntries(
          RECOMMENDATION_WEIGHT_FIELDS.map(({ key }) => [key, Number(item?.weights?.[key] || 0)]),
        ) as Record<RecommendationWeightKey, number>,
        stop_loss_pct: Number(item?.stop_loss_pct || 5),
        target_pct: Number(item?.target_pct || 12),
      }))
    : [];
  return {
    ...DEFAULT_RECOMMENDATION_SETTINGS,
    ...value,
    display_fields: Array.isArray(value?.display_fields)
      ? value.display_fields
      : DEFAULT_RECOMMENDATION_SETTINGS.display_fields,
    schemes,
  };
}

function AIConfigSection() {
  const lt = useLangText();
  const { lang } = useLanguage();
  const authUser = getAuthUser();
  const isSystemAdmin = normalizedRole(authUser?.role) === "admin";
  const [cfg, setCfg] = useState({
    provider: "openai",
    model: "gpt-5.5",
    api_key: "",
    base_url: "https://api.openai.com/v1",
  });
  const [msg, setMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [moduleModels, setModuleModels] = useState<AiModuleModels>(() =>
    normalizeModuleModels({}, "gpt-5.5"),
  );
  const [moduleProviders, setModuleProviders] = useState<AiModuleProviders>(() =>
    normalizeModuleProviders({}, "openai"),
  );
  const [modelTiers, setModelTiers] = useState<ModelTierConfig[]>(() =>
    normalizeModelTiers({}, "openai", "gpt-5.5"),
  );
  const [moduleModelTiers, setModuleModelTiers] = useState<Partial<Record<AiModuleKey, ModelTierKey>>>(() =>
    normalizeModuleModelTiers({}),
  );
  const [modelOptionsText, setModelOptionsText] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keySource, setKeySource] = useState("");
  const [assistantSkillsText, setAssistantSkillsText] = useState("");
  const [assistantSkillsMsg, setAssistantSkillsMsg] = useState("");
  const [assistantSkillsSaving, setAssistantSkillsSaving] = useState(false);
  const [researchToolsText, setResearchToolsText] = useState("");
  const [researchToolsConfig, setResearchToolsConfig] = useState<any>({});
  const [researchToolsMsg, setResearchToolsMsg] = useState("");
  const [researchToolsSaving, setResearchToolsSaving] = useState(false);
  const [researchMarketSources, setResearchMarketSources] = useState<string[]>(
    DEFAULT_CHINA_SENTIMENT_SOURCES,
  );
  const [researchXueqiuCookie, setResearchXueqiuCookie] = useState("");
  const [researchThsCookie, setResearchThsCookie] = useState("");
  const [taForeignSourcesForCnHk, setTaForeignSourcesForCnHk] = useState(false);
  const [taNewsDataVendor, setTaNewsDataVendor] = useState("yfinance");
  const [taNewsArticleLimit, setTaNewsArticleLimit] = useState(8);
  const [taGlobalNewsArticleLimit, setTaGlobalNewsArticleLimit] = useState(6);
  const [taGlobalNewsLookbackDays, setTaGlobalNewsLookbackDays] = useState(7);
  const [taGlobalNewsQueriesText, setTaGlobalNewsQueriesText] = useState(
    DEFAULT_TRADINGAGENTS_GLOBAL_NEWS_QUERIES.join("\n"),
  );
  const [taEnableFredMacro, setTaEnableFredMacro] = useState(true);
  const [taFredApiKey, setTaFredApiKey] = useState("");
  const [taEnablePredictionMarkets, setTaEnablePredictionMarkets] = useState(true);
  const [aiCreditCosts, setAiCreditCosts] = useState<Record<string, number>>({});
  const [recommendationSettings, setRecommendationSettings] =
    useState<RecommendationSettingsDraft>(DEFAULT_RECOMMENDATION_SETTINGS);
  const [recommendationMsg, setRecommendationMsg] = useState("");
  const [recommendationSaving, setRecommendationSaving] = useState(false);

  const hydrateResearchToolsConfig = (raw: any) => {
    const normalized = normalizeResearchToolsConfig(raw);
    setResearchMarketSources(normalized.sources);
    setResearchXueqiuCookie(normalized.xueqiuCookie);
    setResearchThsCookie(normalized.thsCookie);
    setTaForeignSourcesForCnHk(normalized.tradingagents.enableForeignSourcesForCnHk);
    setTaNewsDataVendor(normalized.tradingagents.newsDataVendor);
    setTaNewsArticleLimit(normalized.tradingagents.newsArticleLimit);
    setTaGlobalNewsArticleLimit(normalized.tradingagents.globalNewsArticleLimit);
    setTaGlobalNewsLookbackDays(normalized.tradingagents.globalNewsLookbackDays);
    setTaGlobalNewsQueriesText(normalized.tradingagents.globalNewsQueriesText);
    setTaEnableFredMacro(normalized.tradingagents.enableFredMacro);
    setTaFredApiKey(normalized.tradingagents.fredApiKey);
    setTaEnablePredictionMarkets(normalized.tradingagents.enablePredictionMarkets);
    setResearchToolsConfig(normalized.config);
    setResearchToolsText(JSON.stringify(normalized.config, null, 2));
  };

  const handleResearchToolsTextChange = (value: string) => {
    setResearchToolsText(value);
    try {
      const parsed = value.trim() ? JSON.parse(value) : {};
      const normalized = normalizeResearchToolsConfig(parsed);
      setResearchToolsConfig(normalized.config);
      setResearchMarketSources(normalized.sources);
      setResearchXueqiuCookie(normalized.xueqiuCookie);
      setResearchThsCookie(normalized.thsCookie);
      setTaForeignSourcesForCnHk(normalized.tradingagents.enableForeignSourcesForCnHk);
      setTaNewsDataVendor(normalized.tradingagents.newsDataVendor);
      setTaNewsArticleLimit(normalized.tradingagents.newsArticleLimit);
      setTaGlobalNewsArticleLimit(normalized.tradingagents.globalNewsArticleLimit);
      setTaGlobalNewsLookbackDays(normalized.tradingagents.globalNewsLookbackDays);
      setTaGlobalNewsQueriesText(normalized.tradingagents.globalNewsQueriesText);
      setTaEnableFredMacro(normalized.tradingagents.enableFredMacro);
      setTaFredApiKey(normalized.tradingagents.fredApiKey);
      setTaEnablePredictionMarkets(normalized.tradingagents.enablePredictionMarkets);
    } catch {
      // Keep the explicit form state stable while the advanced JSON is mid-edit.
    }
  };

  const patchResearchMarketConfig = (patch: Record<string, any>) => {
    let current: any = {};
    try {
      current = researchToolsText.trim() ? JSON.parse(researchToolsText) : {};
    } catch {
      current = researchToolsConfig;
    }
    const market =
      current.market_data_sources &&
      typeof current.market_data_sources === "object" &&
      !Array.isArray(current.market_data_sources)
        ? current.market_data_sources
        : {};
    const next = {
      ...current,
      market_data_sources: {
        ...market,
        ...patch,
      },
    };
    setResearchToolsConfig(next);
    setResearchToolsText(JSON.stringify(next, null, 2));
  };

  const patchTradingAgentsConfig = (patch: Record<string, any>) => {
    let current: any = {};
    try {
      current = researchToolsText.trim() ? JSON.parse(researchToolsText) : {};
    } catch {
      current = researchToolsConfig;
    }
    const tradingagents =
      current.tradingagents &&
      typeof current.tradingagents === "object" &&
      !Array.isArray(current.tradingagents)
        ? current.tradingagents
        : {};
    const next = {
      ...current,
      tradingagents: {
        ...tradingagents,
        ...patch,
      },
    };
    setResearchToolsConfig(next);
    setResearchToolsText(JSON.stringify(next, null, 2));
  };

  const patchResearchToolSection = (section: "web_search" | "reader", patch: Record<string, any>) => {
    let current: any = {};
    try {
      current = researchToolsText.trim() ? JSON.parse(researchToolsText) : {};
    } catch {
      current = researchToolsConfig;
    }
    const currentSection = current[section] && typeof current[section] === "object" && !Array.isArray(current[section])
      ? current[section]
      : {};
    const next = { ...current, [section]: { ...currentSection, ...patch } };
    setResearchToolsConfig(next);
    setResearchToolsText(JSON.stringify(next, null, 2));
  };

  const patchResearchEnabledTool = (key: string, enabled: boolean) => {
    let current: any = {};
    try {
      current = researchToolsText.trim() ? JSON.parse(researchToolsText) : {};
    } catch {
      current = researchToolsConfig;
    }
    const enabledTools = current.enabled_tools && typeof current.enabled_tools === "object"
      ? current.enabled_tools
      : {};
    const next = { ...current, enabled_tools: { ...enabledTools, [key]: enabled } };
    setResearchToolsConfig(next);
    setResearchToolsText(JSON.stringify(next, null, 2));
  };

  const toggleResearchMarketSource = (source: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...researchMarketSources, source]))
      : researchMarketSources.filter((item) => item !== source);
    const normalized = next.length ? next : researchMarketSources;
    setResearchMarketSources(normalized);
    patchResearchMarketConfig({ smart_research_sentiment: normalized });
  };

  useEffect(() => {
    api
      .getLLMConfig()
      .then((d: any) => {
        setKeyConfigured(Boolean(d.api_key_configured || d.api_key));
        setKeySource(d.api_key_source || "");
        const defaultModel = d.model || "gpt-5.5";
        const defaultProvider = d.provider || "openai";
        const moduleConfigSource = d.module_model_configs || d.module_models;
        const configuredModels = Array.isArray(d.models)
          ? d.models
          : Array.isArray(d.model_options?.models)
            ? d.model_options.models
            : [defaultModel];
        const modelOptionsPayload = d.model_options || {
          default_model: defaultModel,
          models: configuredModels,
          module_models: d.module_models || {},
          module_model_tiers: d.module_models || {},
          notes: "系统管理员维护可供各 AI 模块选择的模型列表。",
        };
        const nextModuleModels = normalizeModuleModels(moduleConfigSource, defaultModel);
        const nextModuleProviders = normalizeModuleProviders(moduleConfigSource, defaultProvider);
        const nextModelTiers = normalizeModelTiers(
          modelOptionsPayload.model_tiers || modelOptionsPayload.tier_options,
          defaultProvider,
          defaultModel,
        );
        const nextModuleModelTiers = normalizeModuleModelTiers(
          modelOptionsPayload.module_model_tiers || modelOptionsPayload.module_models || d.module_models,
        );
        setCfg({
          provider: defaultProvider,
          model: defaultModel,
          api_key: d.api_key || "",
          base_url: d.base_url || "https://api.openai.com/v1",
        });
        setModelOptions(configuredModels);
        setModelOptionsText(JSON.stringify(modelOptionsPayload, null, 2));
        setModuleModels(nextModuleModels);
        setModuleProviders(nextModuleProviders);
        setModelTiers(nextModelTiers);
        setModuleModelTiers(nextModuleModelTiers);
        saveAiModelState(
          configuredModels,
          defaultModel,
          nextModuleModelTiers as AiModuleModels,
          modelOptionsPayload.tier_options || tierOptionsFromModelTiers(nextModelTiers),
        );
      })
      .catch(() => {
        api.getLLMModelOptions().then((d: any) => {
          const models = Array.isArray(d?.models) ? d.models : ["gpt-5.5"];
          const defaultModel = d?.default_model || models[0] || "gpt-5.5";
          const nextModuleModels = normalizeModuleModels(d?.module_models, defaultModel);
          const nextModelTiers = normalizeModelTiers(d?.model_tiers || d?.tier_options, "openai", defaultModel);
          const nextModuleModelTiers = normalizeModuleModelTiers(d?.module_model_tiers || d?.module_models);
          setModelOptions(models);
          setModelOptionsText(JSON.stringify(d || {
            default_model: defaultModel,
            models,
            module_models: nextModuleModels,
          }, null, 2));
          setModuleModels(nextModuleModels);
          setModelTiers(nextModelTiers);
          setModuleModelTiers(nextModuleModelTiers);
          saveAiModelState(
            models,
            defaultModel,
            nextModuleModelTiers as AiModuleModels,
            d?.tier_options || tierOptionsFromModelTiers(nextModelTiers),
          );
        }).catch(() => {});
      });
  }, []);

  useEffect(() => {
    api
      .getSubscriptionSelf()
      .then((payload: any) => {
        setAiCreditCosts(payload?.costs && typeof payload.costs === "object" ? payload.costs : {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isSystemAdmin) return;
    api
      .getAdminAssistantSkills()
      .then((payload: any) => {
        setAssistantSkillsText(JSON.stringify(payload || { skills: [] }, null, 2));
      })
      .catch((error: any) => {
        setAssistantSkillsMsg(error?.message || "助手 Skill 配置加载失败");
      });
    api
      .getAdminAssistantResearchTools()
      .then((payload: any) => {
        hydrateResearchToolsConfig(payload?.config || payload || {});
      })
      .catch((error: any) => {
        setResearchToolsMsg(error?.message || "投研工具配置加载失败");
      });
    api
      .getAdminAlphaRecommendationSettings()
      .then((payload: any) => {
        setRecommendationSettings(normalizeRecommendationSettings(payload));
      })
      .catch((error: any) => {
        setRecommendationMsg(error?.message || lt("AI 观察池配置加载失败", "Failed to load observation pool settings"));
      });
  }, [isSystemAdmin]);

  const save = async () => {
    try {
      const normalizedModules = normalizeModuleModels(moduleModels, cfg.model || "gpt-5.5");
      const normalizedTierModules = normalizeModuleModelTiers(moduleModelTiers);
      const tierOptions = tierOptionsFromModelTiers(modelTiers);
      if (!isSystemAdmin) {
        setModuleModelTiers(normalizedTierModules);
        saveAiModelState(
          modelOptions,
          cfg.model || modelOptions[0] || "smart",
          normalizedTierModules as AiModuleModels,
          tierOptions,
        );
        setMsg(lt("模型档位选择已保存到当前浏览器，将用于各 AI 功能调用", "Model tier selection saved in this browser for AI features"));
        return;
      }
      if (!cfg.api_key.trim() && !keyConfigured) {
        setMsg(lt("请先填写访问密钥，再保存助手配置", "Enter an access key before saving AI settings"));
        return;
      }
      const normalizedProviders = normalizeModuleProviders(moduleProviders, cfg.provider || "openai");
      let modelOptionsPayload: any = {};
      try {
        modelOptionsPayload = modelOptionsText.trim() ? JSON.parse(modelOptionsText) : {};
      } catch {
        setMsg(lt("可用模型 JSON 格式错误，请修正后再保存", "Available models JSON is invalid. Fix it before saving."));
        return;
      }
      const mergedModels = mergeModelOptions(
        Array.isArray(modelOptionsPayload.models) ? modelOptionsPayload.models : [],
        cfg.model,
        ...Object.values(normalizedModules),
      );
      modelOptionsPayload = {
        ...modelOptionsPayload,
        default_model: modelOptionsPayload.default_model || cfg.model || mergedModels[0] || "gpt-5.5",
        models: mergedModels,
        module_models: normalizedModules,
        module_model_tiers: normalizedTierModules,
        model_tiers: modelTiersToRecord(modelTiers),
      };
      const r: any = await api.saveLLMConfig({
        ...cfg,
        module_models: buildModuleModelConfigs(
          normalizedModules,
          normalizedProviders,
          cfg.provider || "openai",
          cfg.model || "gpt-5.5",
        ),
      });
      const optionsResult: any = await api.saveLLMModelOptions(modelOptionsPayload);
      setKeyConfigured(Boolean(r?.api_key_configured || cfg.api_key.trim()));
      setKeySource("database");
      setModuleModels(normalizedModules);
      setModuleProviders(normalizedProviders);
      const nextModels = Array.isArray(optionsResult?.models) ? optionsResult.models : mergedModels;
      const nextModelTiers = normalizeModelTiers(
        optionsResult?.model_tiers || modelOptionsPayload.model_tiers,
        cfg.provider || "openai",
        cfg.model || "gpt-5.5",
      );
      const nextModuleModelTiers = normalizeModuleModelTiers(
        optionsResult?.module_model_tiers || modelOptionsPayload.module_model_tiers,
      );
      setModelOptions(nextModels);
      setModelOptionsText(JSON.stringify(optionsResult?.models ? {
        default_model: optionsResult.default_model,
        models: optionsResult.models,
        module_models: optionsResult.module_models,
        module_model_tiers: optionsResult.module_model_tiers,
        model_tiers: optionsResult.model_tiers,
        notes: optionsResult.notes,
      } : modelOptionsPayload, null, 2));
      setModelTiers(nextModelTiers);
      setModuleModelTiers(nextModuleModelTiers);
      saveAiModelState(
        nextModels,
        cfg.model || "gpt-5.5",
        nextModuleModelTiers as AiModuleModels,
        tierOptionsFromModelTiers(nextModelTiers),
      );
      setMsg(lt("保存成功，系统级 AI 服务、模型档位和额度倍率已更新", "Saved. System AI service, model tiers and credit multipliers updated."));
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const test = async () => {
    setTesting(true);
    setMsg("");
    try {
      const r: any = await api.testLLMConfig(cfg);
      setMsg(r.message || lt("验证通过", "Test passed"));
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setTesting(false);
    }
  };

  const loadModels = async () => {
    setModelLoading(true);
    setMsg("");
    try {
      const r: any = await api.listLLMModels(cfg);
      const models = Array.isArray(r?.models) ? r.models : [];
      setModelOptions(models);
      const selectedModel = cfg.model || models[0] || "gpt-5.5";
      const normalizedModules = normalizeModuleModels(moduleModels, selectedModel);
      setModuleModels(normalizedModules);
      setModelOptionsText(JSON.stringify({
        default_model: selectedModel,
        models: mergeModelOptions(models, selectedModel, ...Object.values(normalizedModules)),
        module_models: normalizedModules,
        module_model_tiers: normalizeModuleModelTiers(moduleModelTiers),
        model_tiers: modelTiersToRecord(modelTiers),
        notes: "从当前服务地址 /models 拉取后生成。",
      }, null, 2));
      saveAiModelState(
        models,
        selectedModel,
        normalizeModuleModelTiers(moduleModelTiers) as AiModuleModels,
        tierOptionsFromModelTiers(modelTiers),
      );
      if (!cfg.model && models[0]) setCfg((c) => ({ ...c, model: models[0] }));
      setMsg(
        models.length
          ? lt(`已找到 ${models.length} 个可用模型`, `Loaded ${models.length} models`)
          : lt("没有找到可用模型，可继续手动填写模型名称", "No models returned; you can enter one manually"),
      );
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setModelLoading(false);
    }
  };

  const saveAssistantSkills = async () => {
    setAssistantSkillsSaving(true);
    setAssistantSkillsMsg("");
    try {
      const payload = assistantSkillsText.trim()
        ? JSON.parse(assistantSkillsText)
        : { skills: [] };
      const result: any = await api.saveAdminAssistantSkills(payload);
      setAssistantSkillsText(JSON.stringify({ skills: result.skills || [] }, null, 2));
      setAssistantSkillsMsg(lt("助手 Skill 配置已保存", "Assistant skill config saved"));
    } catch (error: any) {
      setAssistantSkillsMsg(error?.message || lt("助手 Skill 配置保存失败", "Failed to save assistant skill config"));
    } finally {
      setAssistantSkillsSaving(false);
    }
  };

  const saveResearchTools = async () => {
    setResearchToolsSaving(true);
    setResearchToolsMsg("");
    try {
      const config = researchToolsText.trim() ? JSON.parse(researchToolsText) : {};
      const result: any = await api.saveAdminAssistantResearchTools({ config });
      hydrateResearchToolsConfig(result?.config || {});
      setResearchToolsMsg(lt("投研工具配置已保存", "Research tool config saved"));
    } catch (error: any) {
      setResearchToolsMsg(error?.message || lt("投研工具配置保存失败", "Failed to save research tool config"));
    } finally {
      setResearchToolsSaving(false);
    }
  };

  const patchRecommendationScheme = (
    index: number,
    patch: Partial<RecommendationSchemeDraft>,
  ) => {
    setRecommendationSettings((current) => ({
      ...current,
      schemes: current.schemes.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
    setRecommendationMsg("");
  };

  const saveRecommendationSettings = async () => {
    setRecommendationSaving(true);
    setRecommendationMsg("");
    try {
      const result: any = await api.saveAdminAlphaRecommendationSettings(recommendationSettings);
      setRecommendationSettings(normalizeRecommendationSettings(result));
      setRecommendationMsg(lt("AI 观察池方案已保存", "Observation pool settings saved"));
    } catch (error: any) {
      setRecommendationMsg(error?.message || lt("AI 观察池方案保存失败", "Failed to save observation pool settings"));
    } finally {
      setRecommendationSaving(false);
    }
  };

  const defaultModelOptions = mergeModelOptions(modelOptions, cfg.model || "gpt-5.5");
  const selectableTierKeys = (
    isSystemAdmin
      ? MODEL_TIER_KEYS
      : modelOptions.filter((model): model is ModelTierKey =>
          MODEL_TIER_KEYS.includes(model as ModelTierKey),
        )
  );
  const visibleTierKeys = selectableTierKeys.length ? selectableTierKeys : (["smart"] as ModelTierKey[]);
  const webSearchConfig = researchToolsConfig?.web_search && typeof researchToolsConfig.web_search === "object"
    ? researchToolsConfig.web_search
    : {};
  const readerConfig = researchToolsConfig?.reader && typeof researchToolsConfig.reader === "object"
    ? researchToolsConfig.reader
    : {};

  return (
    <div className="settings-section settings-ai-config-section">
      <div
        className="settings-section-accent"
        style={{ background: "var(--primary)" }}
      />
      <div className="settings-section-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--text-primary)" }}
          >
            smart_toy
          </span>
          <h2>{lt("AI 模型服务配置", "AI Model Service Config")}</h2>
        </div>
        <p>
          {lt(
            "统一管理模型来源、访问密钥和服务地址，并为每个 AI 功能设置默认模型。",
            "Manage the model source, access key and service URL, then set a default model for each AI feature.",
          )}
        </p>
      </div>
      {isSystemAdmin ? (
        <>
          <div className="settings-form-grid">
            <div className="settings-field">
              <label>{lt("模型来源", "Model Source")}</label>
              <select
                value={cfg.provider}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, provider: e.target.value }))
                }
              >
                {GLOBAL_PROVIDER_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {lt(
                      PROVIDER_LABELS_ZH[p.value] || p.label,
                      PROVIDER_LABELS_EN[p.value] || ("labelEn" in p ? p.labelEn : p.label),
                    )}
                  </option>
                ))}
              </select>
              <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
                {lt(
                  "选择接入的模型协议接口，支持 OpenAI、Claude、Gemini。",
                  "Choose the model protocol interface to connect, including OpenAI, Claude and Gemini.",
                )}
              </p>
            </div>
            <div className="settings-field">
              <label>{lt("默认模型", "Default Model")}</label>
              <div className="settings-default-model-row">
                <div className="settings-module-model-control">
                  <select
                    className="settings-module-model-select"
                    value={cfg.model || defaultModelOptions[0] || "gpt-5.5"}
                    onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
                  >
                    {defaultModelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <span className="settings-module-model-chevron">⌄</span>
                </div>
                <button
                  className="figma-btn"
                  type="button"
                  onClick={loadModels}
                  disabled={modelLoading}
                  style={{ whiteSpace: "nowrap", fontSize: 12 }}
                >
                  {modelLoading ? lt("获取中...", "Loading...") : lt("获取模型", "Fetch")}
                </button>
              </div>
              <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
                {lt("用于生成投研回答、策略代码和因子草稿。", "Used for research answers, strategy code and factor drafts.")}
              </p>
            </div>
          </div>
          <div className="settings-field" style={{ marginTop: 16 }}>
            <label>{lt("访问密钥", "Access Key")}</label>
            <input
              type="password"
              placeholder="sk-inst-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={cfg.api_key}
              onChange={(e) => setCfg((c) => ({ ...c, api_key: e.target.value }))}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: keyConfigured ? "#10B981" : "var(--text-muted)" }}>
      {keyConfigured
                ? lt(
                    `访问密钥已配置${keySource === "environment" ? "（系统环境）" : ""}`,
                    `Access key configured${keySource === "environment" ? " (environment)" : ""}`,
                  )
                : lt(
                    "访问密钥未配置，AI 功能将无法调用上游模型",
                    "Access key is not configured. AI features cannot call upstream models.",
                  )}
            </div>
          </div>
          <div className="settings-field" style={{ marginTop: 16 }}>
            <label>{lt("服务地址", "Service URL")}</label>
            <input
              placeholder="https://api.openai.com/v1"
              value={cfg.base_url}
              onChange={(e) => setCfg((c) => ({ ...c, base_url: e.target.value }))}
            />
          </div>
          <div className="settings-field" style={{ marginTop: 16 }}>
            <label>{lt("可用模型 JSON", "Available Models JSON")}</label>
            <textarea
              className="settings-json-textarea"
              value={modelOptionsText}
              onChange={(event) => setModelOptionsText(event.target.value)}
              spellCheck={false}
              wrap="off"
            />
            <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
              {lt("管理员维护平台允许用户选择的模型列表和各模块默认模型。", "Administrators maintain selectable models and module defaults.")}
            </p>
          </div>
          <div
            style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: "1px solid var(--border-light)",
            }}
          >
            <div className="settings-section-header" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>
                {lt("模型强度档位", "Model Strength Tiers")}
              </h2>
              <p style={{ marginTop: 6 }}>
                {lt(
                  "用户侧只看到别名档位；真实协议、模型和额度倍率由系统管理员统一映射。",
                  "Users only see tier aliases; real protocol, model and credit multiplier are mapped by administrators.",
                )}
              </p>
            </div>
            <div className="settings-module-model-list">
              {modelTiers.map((tier) => {
                const tierModelOptions = mergeModelOptions(modelOptions, cfg.model, tier.model);
                return (
                  <div key={tier.key} className="settings-module-model-card settings-tier-model-card">
                    <div className="settings-module-model-copy">
                      <div className="settings-module-model-title">
                        {modelTierDisplay(tier.key, lang, modelTiers)}
                      </div>
                      <div className="settings-module-model-desc">
                        {lt(
                          tier.key === "smart"
                            ? "免费用户可用的基础智能档位"
                            : tier.key === "advanced"
                              ? "专业版和旗舰版可用的增强档位"
                              : "专业版和旗舰版可用的高强度档位",
                          tier.key === "smart"
                            ? "Base tier available to free users"
                            : tier.key === "advanced"
                              ? "Enhanced tier for paid users"
                              : "High-capability tier for paid users",
                        )}
                      </div>
                    </div>
                    <div className="settings-module-model-fields settings-tier-model-fields">
                      <label className="settings-tier-field">
                        <span>{lt("中文别名", "Chinese Alias")}</span>
                        <input
                          className="figma-input"
                          value={tier.label}
                          onChange={(event) =>
                            setModelTiers((prev) =>
                              prev.map((item) =>
                                item.key === tier.key ? { ...item, label: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder={lt("中文别名", "Chinese alias")}
                        />
                      </label>
                      <label className="settings-tier-field">
                        <span>{lt("英文别名", "English Alias")}</span>
                        <input
                          className="figma-input"
                          value={tier.label_en}
                          onChange={(event) =>
                            setModelTiers((prev) =>
                              prev.map((item) =>
                                item.key === tier.key ? { ...item, label_en: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder={lt("英文别名", "English alias")}
                        />
                      </label>
                      <label className="settings-tier-field">
                        <span>{lt("协议接口", "Protocol")}</span>
                        <div className="settings-module-model-control protocol">
                          <select
                            className="settings-module-model-select"
                            value={tier.provider}
                            onChange={(event) =>
                              setModelTiers((prev) =>
                                prev.map((item) =>
                                  item.key === tier.key ? { ...item, provider: event.target.value } : item,
                                ),
                              )
                            }
                          >
                            {GLOBAL_PROVIDER_OPTIONS.map((protocol) => (
                              <option key={protocol.value} value={protocol.value}>
                                {lt(
                                  PROVIDER_LABELS_ZH[protocol.value] || protocol.label,
                                  PROVIDER_LABELS_EN[protocol.value] || ("labelEn" in protocol ? protocol.labelEn : protocol.label),
                                )}
                              </option>
                            ))}
                          </select>
                          <span className="settings-module-model-chevron">⌄</span>
                        </div>
                      </label>
                      <label className="settings-tier-field tier-model-select-field">
                        <span>{lt("真实模型", "Mapped Model")}</span>
                        <div className="settings-module-model-control tier-model-select-control">
                          <select
                            className="settings-module-model-select"
                            value={tier.model || cfg.model || "gpt-5.5"}
                            onChange={(event) =>
                              setModelTiers((prev) =>
                                prev.map((item) =>
                                  item.key === tier.key ? { ...item, model: event.target.value } : item,
                                ),
                              )
                            }
                          >
                            {tierModelOptions.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                          <span className="settings-module-model-chevron">⌄</span>
                        </div>
                      </label>
                      <label className="settings-tier-field settings-tier-multiplier-field">
                        <span>{lt("额度倍率", "Credit Multiplier")}</span>
                        <input
                          className="figma-input settings-tier-multiplier-input"
                          type="number"
                          min="0.1"
                          max="20"
                          step="0.01"
                          value={tier.multiplier}
                          onChange={(event) =>
                            setModelTiers((prev) =>
                              prev.map((item) =>
                                item.key === tier.key ? { ...item, multiplier: event.target.value } : item,
                              ),
                            )
                          }
                          aria-label={lt("额度倍率", "Credit multiplier")}
                        />
                      </label>
                      <label className="settings-tier-field">
                        <span>{lt("可用套餐", "Available Plan")}</span>
                        <select
                          className="figma-input settings-tier-role-select"
                          value={tier.key === "smart" ? "normal" : tier.min_role}
                          disabled={tier.key === "smart"}
                          onChange={(event) =>
                            setModelTiers((prev) =>
                              prev.map((item) =>
                                item.key === tier.key
                                  ? { ...item, min_role: event.target.value as ModelTierConfig["min_role"] }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="normal">{lt("免费及以上", "Free+")}</option>
                          <option value="vip">{lt("专业版及以上", "VIP+")}</option>
                          <option value="svip">{lt("旗舰版", "SVIP")}</option>
                        </select>
                      </label>
                      <div className="settings-tier-field settings-tier-enabled-field">
                        <span>{lt("状态", "Status")}</span>
                        <label className="settings-payment-switch">
                          <input
                            type="checkbox"
                            checked={tier.key === "smart" || tier.enabled}
                            disabled={tier.key === "smart"}
                            onChange={(event) =>
                              setModelTiers((prev) =>
                                prev.map((item) =>
                                  item.key === tier.key ? { ...item, enabled: event.target.checked } : item,
                                ),
                              )
                            }
                          />
                          <span>{tier.key === "smart" || tier.enabled ? lt("启用", "Enabled") : lt("停用", "Disabled")}</span>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="settings-ai-readonly-card">
          <span className="material-symbols-outlined">verified_user</span>
          <div>
            <strong>{lt("模型服务由系统管理员统一维护", "Model service is managed by administrators")}</strong>
            <p>{lt("你可以在下方为各 AI 功能选择可用模型，不会看到访问密钥或服务地址。", "Choose available models below for each AI feature; keys and service URLs are hidden.")}</p>
          </div>
        </div>
      )}
      <div
        style={{
          marginTop: 22,
          paddingTop: 18,
          borderTop: "1px solid var(--border-light)",
        }}
      >
        <div className="settings-section-header" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>
            {lt("模块模型选择", "Module Model Selection")}
          </h2>
          <p style={{ marginTop: 6 }}>
            {lt(
              "各 AI 功能共用上面的模型来源和访问密钥，只在这里选择各自调用的模型。",
              "AI features share the provider and key above, while each can use a different model.",
            )}
          </p>
        </div>
        <div className="settings-module-model-list">
          {AI_MODULE_CONFIGS.map((item) => {
            const rawTier = moduleModelTiers[item.key] || "smart";
            const currentTier = visibleTierKeys.includes(rawTier) ? rawTier : visibleTierKeys[0];
            const baseCost = item.costKey ? Number(aiCreditCosts[item.costKey] || 0) : 0;
            return (
              <div key={item.key} className="settings-module-model-card">
                <div className="settings-module-model-copy">
                  <div className="settings-module-model-title">
                    {lt(item.title, item.titleEn)}
                  </div>
                  <div className="settings-module-model-desc">
                    {lt(item.desc, item.descEn)}
                  </div>
                  <div className="settings-module-model-cost">
                    {baseCost > 0
                      ? lt(
                          `基础消耗 ${baseCost} AI 使用额度/次，实际扣除按所选模型档位倍率计算。`,
                          `Base cost ${baseCost} credits/call. Final charge follows the selected model tier multiplier.`,
                        )
                      : lt(
                          "该模块按套餐额度或对话次数计量，当前不单独扣 AI 使用额度。",
                          "This module is metered by plan quota or conversations and does not charge separate AI credits.",
                        )}
                  </div>
                </div>
                <div className="settings-module-model-fields">
                  <div className="settings-module-model-control">
                    <select
                      className="settings-module-model-select"
                      value={currentTier}
                      onChange={(event) => {
                        const next = {
                          ...moduleModelTiers,
                          [item.key]: event.target.value,
                        };
                        setModuleModelTiers(next as Partial<Record<AiModuleKey, ModelTierKey>>);
                        saveAiModuleModels(next as AiModuleModels, "smart");
                      }}
                    >
                      {visibleTierKeys.map((tier) => (
                        <option key={tier} value={tier}>
                          {baseCost > 0
                            ? formatModelTierCost(tier, baseCost, lang, modelTiers)
                            : `${modelTierDisplay(tier, lang, modelTiers)} · ${Number(modelTierMultiplier(tier, modelTiers)).toFixed(modelTierMultiplier(tier, modelTiers) % 1 === 0 ? 0 : 1)}x`}
                        </option>
                      ))}
                    </select>
                    <span className="settings-module-model-chevron">⌄</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {isSystemAdmin && (
        <div className="settings-recommendation-config">
          <div className="settings-recommendation-config-header">
            <div>
              <span className="material-symbols-outlined">recommend</span>
              <div>
                <h2>{lt("AI 观察池方案", "AI Watchlist Pool Schemes")}</h2>
                <p>{lt("配置前端展示、观察样本评分权重和每个方案的研究口径。", "Configure presentation, observation scoring weights and research rules for each scheme.")}</p>
              </div>
            </div>
            <label className="settings-payment-switch">
              <input
                type="checkbox"
                checked={recommendationSettings.enabled}
                onChange={(event) => setRecommendationSettings((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span>{recommendationSettings.enabled ? lt("已启用", "Enabled") : lt("已停用", "Disabled")}</span>
            </label>
          </div>

          <div className="settings-recommendation-general-grid">
            <label className="settings-field">
              <span>{lt("中文模块标题", "Chinese Section Title")}</span>
              <input
                value={recommendationSettings.section_title_zh}
                onChange={(event) => setRecommendationSettings((current) => ({ ...current, section_title_zh: event.target.value }))}
              />
            </label>
            <label className="settings-field">
              <span>{lt("英文模块标题", "English Section Title")}</span>
              <input
                value={recommendationSettings.section_title_en}
                onChange={(event) => setRecommendationSettings((current) => ({ ...current, section_title_en: event.target.value }))}
              />
            </label>
          </div>

          <div className="settings-recommendation-display-row">
            <strong>{lt("观察卡片展示", "Card Content")}</strong>
            {[{ key: "score", zh: "评分", en: "Score" }, { key: "logic", zh: "观察理由", en: "Rationale" }, { key: "price_plan", zh: "研究字段", en: "Research Fields" }].map((field) => (
              <label key={field.key}>
                <input
                  type="checkbox"
                  checked={recommendationSettings.display_fields.includes(field.key)}
                  onChange={(event) => setRecommendationSettings((current) => ({
                    ...current,
                    display_fields: event.target.checked
                      ? Array.from(new Set([...current.display_fields, field.key]))
                      : current.display_fields.filter((item) => item !== field.key),
                  }))}
                />
                <span>{lt(field.zh, field.en)}</span>
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={recommendationSettings.prefer_curated_cache}
                onChange={(event) => setRecommendationSettings((current) => ({ ...current, prefer_curated_cache: event.target.checked }))}
              />
              <span>{lt("优先管理员精选观察池", "Prefer Curated Pool")}</span>
            </label>
          </div>

          <div className="settings-recommendation-schemes">
            {recommendationSettings.schemes.map((scheme, index) => (
              <div key={`${scheme.key}-${index}`} className="settings-recommendation-scheme-card">
                <div className="settings-recommendation-scheme-head">
                  <div>
                    <strong>{lt(scheme.label_zh || `方案 ${index + 1}`, scheme.label_en || `Scheme ${index + 1}`)}</strong>
                    <code>{scheme.key}</code>
                  </div>
                  <div>
                    <label className="settings-payment-switch">
                      <input
                        type="checkbox"
                        checked={scheme.enabled}
                        onChange={(event) => patchRecommendationScheme(index, { enabled: event.target.checked })}
                      />
                      <span>{scheme.enabled ? lt("启用", "On") : lt("停用", "Off")}</span>
                    </label>
                    <button
                      type="button"
                      className="token-cost-icon-button"
                      title={lt("删除方案", "Delete scheme")}
                      disabled={recommendationSettings.schemes.length <= 1}
                      onClick={() => setRecommendationSettings((current) => ({ ...current, schemes: current.schemes.filter((_, itemIndex) => itemIndex !== index) }))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="settings-recommendation-scheme-grid">
                  <label className="settings-field">
                    <span>{lt("方案标识", "Scheme Key")}</span>
                    <input value={scheme.key} onChange={(event) => patchRecommendationScheme(index, { key: event.target.value })} />
                  </label>
                  <label className="settings-field">
                    <span>{lt("逻辑类型", "Logic Type")}</span>
                    <select value={scheme.kind} onChange={(event) => patchRecommendationScheme(index, { kind: event.target.value as RecommendationSchemeDraft["kind"] })}>
                      <option value="balanced">{lt("均衡质量", "Balanced")}</option>
                      <option value="momentum">{lt("动量突破", "Momentum")}</option>
                      <option value="reversal">{lt("超跌修复", "Reversal")}</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>{lt("中文名称", "Chinese Name")}</span>
                    <input value={scheme.label_zh} onChange={(event) => patchRecommendationScheme(index, { label_zh: event.target.value })} />
                  </label>
                  <label className="settings-field">
                    <span>{lt("英文名称", "English Name")}</span>
                    <input value={scheme.label_en} onChange={(event) => patchRecommendationScheme(index, { label_en: event.target.value })} />
                  </label>
                  <label className="settings-field settings-recommendation-wide">
                    <span>{lt("中文观察逻辑说明", "Chinese Observation Rationale")}</span>
                    <textarea value={scheme.description_zh} onChange={(event) => patchRecommendationScheme(index, { description_zh: event.target.value })} />
                  </label>
                  <label className="settings-field settings-recommendation-wide">
                    <span>{lt("英文观察逻辑说明", "English Observation Rationale")}</span>
                    <textarea value={scheme.description_en} onChange={(event) => patchRecommendationScheme(index, { description_en: event.target.value })} />
                  </label>
                  <label className="settings-field">
                    <span>{lt("风险阈值 %", "Risk Threshold %")}</span>
                    <input type="number" min="1" max="30" step="0.5" value={scheme.stop_loss_pct} onChange={(event) => patchRecommendationScheme(index, { stop_loss_pct: Number(event.target.value) })} />
                  </label>
                  <label className="settings-field">
                    <span>{lt("观察空间 %", "Observation Range %")}</span>
                    <input type="number" min="2" max="80" step="0.5" value={scheme.target_pct} onChange={(event) => patchRecommendationScheme(index, { target_pct: Number(event.target.value) })} />
                  </label>
                </div>
                <div className="settings-recommendation-weight-grid">
                  {RECOMMENDATION_WEIGHT_FIELDS.map((field) => (
                    <label key={field.key}>
                      <span className="settings-recommendation-weight-head">
                        <b>{lt(field.zh, field.en)}</b>
                        <output>{Math.round(Number(scheme.weights[field.key] || 0) * 100)}%</output>
                      </span>
                      <span className="settings-recommendation-weight-control">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={scheme.weights[field.key]}
                          onChange={(event) => patchRecommendationScheme(index, {
                            weights: { ...scheme.weights, [field.key]: Number(event.target.value) },
                          })}
                        />
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={scheme.weights[field.key]}
                          aria-label={lt(`${field.zh}权重`, `${field.en} weight`)}
                          onChange={(event) => patchRecommendationScheme(index, {
                            weights: { ...scheme.weights, [field.key]: Number(event.target.value) },
                          })}
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="settings-recommendation-actions">
            <button
              type="button"
              className="figma-btn"
              onClick={() => setRecommendationSettings((current) => ({
                ...current,
                schemes: [...current.schemes, {
                  key: `scheme_${current.schemes.length + 1}`,
                  label_zh: "新观察方案",
                  label_en: "New Observation Scheme",
                  kind: "balanced",
                  description_zh: "综合量价、估值、趋势与盈利质量生成观察样本。",
                  description_en: "Builds observation samples from price, liquidity, valuation, trend and quality.",
                  enabled: true,
                  weights: { change: 0.2, liquidity: 0.2, valuation: 0.2, turnover: 0.1, ma: 0.2, quality: 0.1 },
                  stop_loss_pct: 5,
                  target_pct: 12,
                }],
              }))}
            >
              <Plus size={15} />
              {lt("新增方案", "Add Scheme")}
            </button>
            <span>{recommendationMsg}</span>
            <button type="button" className="figma-btn figma-btn-primary" onClick={saveRecommendationSettings} disabled={recommendationSaving}>
              <Save size={15} />
              {recommendationSaving ? lt("保存中...", "Saving...") : lt("保存观察池", "Save Observation Pool")}
            </button>
          </div>
        </div>
      )}
      {isSystemAdmin && (
        <div
          style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: "1px solid var(--border-light)",
          }}
        >
          <div className="settings-section-header" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-symbols-outlined">extension</span>
              <h2 style={{ fontSize: 16, margin: 0 }}>
                {lt("量化投研助手 Skills", "Assistant Skills")}
              </h2>
            </div>
            <p style={{ marginTop: 6 }}>
              {lt(
                "配置量化投研助手可挂载的方法包。当前投研模式会把 Serenity 作为提示词和研究流程使用，不执行远端代码。",
                "Configure method packs mounted by the assistant. Research mode uses Serenity as prompts and workflow only, without executing remote code.",
              )}
            </p>
          </div>
          <div className="settings-field">
            <label>{lt("Skills 配置 JSON", "Skills Config JSON")}</label>
            <textarea
              className="settings-json-textarea"
              value={assistantSkillsText}
              onChange={(event) => setAssistantSkillsText(event.target.value)}
              spellCheck={false}
              wrap="off"
              style={{ minHeight: 240 }}
            />
            <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
              {lt(
                "常用字段：key、name、enabled、mode、keywords、intents、markets、categories、priority、auto_route、local_path、prompt_files、instructions。Skills 会按讨论意图自动路由。",
                "Common fields: key, name, enabled, mode, keywords, intents, markets, categories, priority, auto_route, local_path, prompt_files and instructions. Skills are routed by discussion intent.",
              )}
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 12,
              flexWrap: "wrap",
            }}
          >
            <div className="settings-status-pill">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                psychology
              </span>
              {lt("投研模式使用已启用的 research Skill", "Research mode uses enabled research skills")}
            </div>
            <button
              className="figma-btn"
              type="button"
              onClick={saveAssistantSkills}
              disabled={assistantSkillsSaving}
            >
              {assistantSkillsSaving ? lt("保存中...", "Saving...") : lt("保存 Skills", "Save Skills")}
            </button>
          </div>
          {assistantSkillsMsg && (
            <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>
              {assistantSkillsMsg}
            </p>
          )}
        </div>
      )}
      {isSystemAdmin && (
        <div
          style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: "1px solid var(--border-light)",
          }}
        >
          <div className="settings-section-header" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-symbols-outlined">travel_explore</span>
              <h2 style={{ fontSize: 16, margin: 0 }}>
                {lt("投研工具层", "Research Tool Layer")}
              </h2>
            </div>
            <p style={{ marginTop: 6 }}>
              {lt(
                "配置量化投研助手可调用的数据工具。数据库、F10 和资讯默认启用；联网搜索需要配置搜索服务后开启。",
                "Configure data tools for the assistant. Database, F10 and news are enabled by default; web search requires a configured provider.",
              )}
            </p>
          </div>
          <div className="settings-research-tool-grid">
            {[
              { title: "数据库", titleEn: "Database", desc: "股票基础信息、估值、行情、概念和市场温度", descEn: "Stock profile, valuation, quotes, concepts and market temperature", key: "database" },
              { title: "F10", titleEn: "F10", desc: "公告、研报、财务分析、股东、分红和主营构成", descEn: "Announcements, reports, financials, shareholders, dividends and business mix", key: "f10" },
              { title: "资讯", titleEn: "News", desc: "国内、国际、目标股票相关新闻", descEn: "Domestic, international and target-stock news", key: "news" },
              { title: "联网搜索", titleEn: "Web Search", desc: "Bing、Tavily、SerpAPI、SearxNG 或 DuckDuckGo", descEn: "Bing, Tavily, SerpAPI, SearxNG or DuckDuckGo", key: "web_search" },
            ].map(({ title, titleEn, desc, descEn, key }) => (
              <div key={key} className="settings-research-tool-card">
                <span className="material-symbols-outlined">
                  {key === "database" ? "database" : key === "f10" ? "article" : key === "news" ? "newspaper" : "public"}
                </span>
                <div>
                  <strong>{lt(title, titleEn)}</strong>
                  <p>{lt(desc, descEn)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="settings-research-market-card settings-research-fetch-card">
            <div className="settings-research-market-header">
              <div>
                <h3>{lt("联网搜索与网页抓取", "Web Search & Page Readers")}</h3>
                <p>
                  {lt(
                    "联网搜索和网页抓取可以同时启用。模型本身是否支持原生搜索由上游协议决定；这里的搜索服务和抓取 API 用于补充可核验材料。",
                    "Web search and page readers can run together. Native model search depends on the upstream protocol; these services add verifiable evidence.",
                  )}
                </p>
              </div>
              <span className="settings-status-pill">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>public</span>
                {lt("管理员配置", "Admin configured")}
              </span>
            </div>
            <div className="settings-research-trading-grid">
              <label className="settings-auth-switch">
                <input
                  type="checkbox"
                  checked={Boolean(researchToolsConfig?.enabled_tools?.web_search) && Boolean(webSearchConfig.enabled)}
                  onChange={(event) => {
                    patchResearchEnabledTool("web_search", event.target.checked);
                    patchResearchToolSection("web_search", { enabled: event.target.checked });
                  }}
                />
                <span>{lt("启用联网搜索", "Enable web search")}</span>
              </label>
              <label className="settings-auth-switch">
                <input
                  type="checkbox"
                  checked={Boolean(readerConfig.enabled)}
                  onChange={(event) => patchResearchToolSection("reader", { enabled: event.target.checked })}
                />
                <span>{lt("启用网页抓取", "Enable page reader")}</span>
              </label>
              <div className="settings-field">
                <label>{lt("搜索协议", "Search Provider")}</label>
                <select
                  value={String(webSearchConfig.provider || "searxng")}
                  onChange={(event) => patchResearchToolSection("web_search", { provider: event.target.value })}
                >
                  <option value="tavily">Tavily</option>
                  <option value="bing">Bing</option>
                  <option value="serpapi">SerpAPI</option>
                  <option value="searxng">SearXNG</option>
                  <option value="duckduckgo">DuckDuckGo</option>
                </select>
              </div>
              <div className="settings-field">
                <label>{lt("搜索服务地址", "Search Endpoint")}</label>
                <input
                  value={String(webSearchConfig.endpoint || "")}
                  placeholder="https://api.tavily.com/search"
                  onChange={(event) => patchResearchToolSection("web_search", { endpoint: event.target.value })}
                />
              </div>
              <div className="settings-field">
                <label>{lt("搜索访问密钥", "Search API Key")}</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={String(webSearchConfig.api_key || "")}
                  placeholder={lt("粘贴后保存，前端只显示脱敏值", "Paste to save; the UI masks it after saving")}
                  onChange={(event) => patchResearchToolSection("web_search", { api_key: event.target.value })}
                />
              </div>
              <div className="settings-field">
                <label>{lt("抓取服务", "Reader Provider")}</label>
                <select
                  value={String(readerConfig.provider || "jina")}
                  onChange={(event) => patchResearchToolSection("reader", { provider: event.target.value })}
                >
                  <option value="jina">Jina Reader</option>
                  <option value="firecrawl">Firecrawl</option>
                  <option value="custom">Custom HTTP Reader</option>
                  <option value="direct">Direct HTML</option>
                </select>
              </div>
              <div className="settings-field">
                <label>{lt("抓取服务地址", "Reader Endpoint")}</label>
                <input
                  value={String(readerConfig.endpoint || "")}
                  placeholder="https://r.jina.ai"
                  onChange={(event) => patchResearchToolSection("reader", { endpoint: event.target.value })}
                />
              </div>
              <div className="settings-field">
                <label>{lt("抓取访问密钥", "Reader API Key")}</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={String(readerConfig.api_key || "")}
                  placeholder={lt("Firecrawl/Jina 可选", "Optional for Firecrawl/Jina")}
                  onChange={(event) => patchResearchToolSection("reader", { api_key: event.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="settings-research-market-card">
            <div className="settings-research-market-header">
              <div>
                <h3>{lt("智能研究国内数据源", "Smart Research CN Data Sources")}</h3>
                <p>
                  {lt(
                    "用于情绪分析师和新闻分析师补充 A 股 / 港股上下文。Cookie 会保存到后端系统配置，返回前端时只显示脱敏值。",
                    "Used by sentiment and news analysts to enrich A-share / HK context. Cookies are stored in backend system settings and masked when returned to the UI.",
                  )}
                </p>
              </div>
              <span className="settings-status-pill">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  shield_lock
                </span>
                {lt("仅系统管理员可配置", "Admin only")}
              </span>
            </div>
            <div className="settings-research-source-list">
              {CHINA_SENTIMENT_SOURCE_OPTIONS.map((source) => {
                const checked = researchMarketSources.includes(source.key);
                return (
                  <label
                    key={source.key}
                    className={`settings-research-source-option ${checked ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        toggleResearchMarketSource(source.key, event.target.checked)
                      }
                    />
                    <span className="material-symbols-outlined">{source.icon}</span>
                    <span>
                      <strong>{lt(source.title, source.titleEn)}</strong>
                      <small>{lt(source.desc, source.descEn)}</small>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="settings-research-cookie-grid">
              <div className="settings-field">
                <label>{lt("雪球 Cookie", "Xueqiu Cookie")}</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={researchXueqiuCookie}
                  placeholder="xq_a_token=...; u=..."
                  onChange={(event) => {
                    const value = event.target.value;
                    setResearchXueqiuCookie(value);
                    patchResearchMarketConfig({ xueqiu_cookie: value });
                  }}
                />
                <p>
                  {lt(
                    "雪球源必须配置 Cookie 才能返回行情与讨论。显示为脱敏值时直接粘贴新 Cookie 可覆盖，清空后保存会移除。",
                    "Xueqiu requires a Cookie for quotes and discussions. Paste a new Cookie to replace a masked value, or clear it and save to remove it.",
                  )}
                </p>
              </div>
              <div className="settings-field">
                <label>{lt("同花顺 Cookie", "THS Cookie")}</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={researchThsCookie}
                  placeholder="v=...; other_cookie=..."
                  onChange={(event) => {
                    const value = event.target.value;
                    setResearchThsCookie(value);
                    patchResearchMarketConfig({ ths_cookie: value });
                  }}
                />
                <p>
                  {lt(
                    "同花顺热点概念接口触发反爬时需要 Cookie；不配置时会保留腾讯和东方财富等可用源继续分析。",
                    "THS hot concept endpoints may require a Cookie when anti-bot checks are triggered. Other sources continue to work without it.",
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="settings-research-market-card">
            <div className="settings-research-market-header">
              <div>
                <h3>{lt("TradingAgents 新闻与宏观工具", "TradingAgents News & Macro Tools")}</h3>
                <p>
                  {lt(
                    "配置智能研究中 TradingAgents 的国外新闻检索、FRED 宏观数据和预测市场工具。A股/港股默认只使用国内源。",
                    "Configure TradingAgents foreign news retrieval, FRED macro data and prediction-market tools. CN/HK defaults to domestic sources only.",
                  )}
                </p>
              </div>
              <span className="settings-status-pill">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  travel_explore
                </span>
                {lt("系统级配置", "System scope")}
              </span>
            </div>
            <div className="settings-research-trading-grid">
              <label className="settings-auth-switch">
                <input
                  type="checkbox"
                  checked={taForeignSourcesForCnHk}
                  onChange={(event) => {
                    setTaForeignSourcesForCnHk(event.target.checked);
                    patchTradingAgentsConfig({
                      enable_foreign_sources_for_cn_hk: event.target.checked,
                    });
                  }}
                />
                <span>
                  {lt(
                    "A股/港股也启用国外源",
                    "Use foreign sources for CN/HK",
                  )}
                </span>
              </label>
              <label className="settings-auth-switch">
                <input
                  type="checkbox"
                  checked={taEnableFredMacro}
                  onChange={(event) => {
                    setTaEnableFredMacro(event.target.checked);
                    patchTradingAgentsConfig({ enable_fred_macro: event.target.checked });
                  }}
                />
                <span>{lt("启用 FRED 宏观数据", "Enable FRED macro data")}</span>
              </label>
              <label className="settings-auth-switch">
                <input
                  type="checkbox"
                  checked={taEnablePredictionMarkets}
                  onChange={(event) => {
                    setTaEnablePredictionMarkets(event.target.checked);
                    patchTradingAgentsConfig({
                      enable_prediction_markets: event.target.checked,
                    });
                  }}
                />
                <span>{lt("启用预测市场工具", "Enable prediction markets")}</span>
              </label>
              <div className="settings-field">
                <label>{lt("新闻检索 Vendor", "News Vendor")}</label>
                <select
                  value={taNewsDataVendor}
                  onChange={(event) => {
                    setTaNewsDataVendor(event.target.value);
                    patchTradingAgentsConfig({ news_data_vendor: event.target.value });
                  }}
                >
                  <option value="yfinance">Yahoo Finance / yfinance</option>
                  <option value="alpha_vantage">Alpha Vantage</option>
                </select>
              </div>
              <div className="settings-field">
                <label>{lt("个股新闻条数", "Ticker News Limit")}</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={taNewsArticleLimit}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setTaNewsArticleLimit(value);
                    patchTradingAgentsConfig({ news_article_limit: value });
                  }}
                />
              </div>
              <div className="settings-field">
                <label>{lt("全球新闻条数", "Global News Limit")}</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={taGlobalNewsArticleLimit}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setTaGlobalNewsArticleLimit(value);
                    patchTradingAgentsConfig({ global_news_article_limit: value });
                  }}
                />
              </div>
              <div className="settings-field">
                <label>{lt("全球新闻回看天数", "Global News Lookback Days")}</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={taGlobalNewsLookbackDays}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setTaGlobalNewsLookbackDays(value);
                    patchTradingAgentsConfig({ global_news_lookback_days: value });
                  }}
                />
              </div>
              <div className="settings-field">
                <label>{lt("FRED_API_KEY", "FRED_API_KEY")}</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={taFredApiKey}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  onChange={(event) => {
                    setTaFredApiKey(event.target.value);
                    patchTradingAgentsConfig({ fred_api_key: event.target.value });
                  }}
                />
              </div>
              <div className="settings-field settings-research-query-field">
                <label>{lt("全球新闻搜索词", "Global News Queries")}</label>
                <textarea
                  className="settings-json-textarea"
                  value={taGlobalNewsQueriesText}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTaGlobalNewsQueriesText(value);
                    patchTradingAgentsConfig({
                      global_news_queries: value
                        .split(/\n+/)
                        .map((item) => item.trim())
                        .filter(Boolean),
                    });
                  }}
                  spellCheck={false}
                  style={{ minHeight: 120 }}
                />
                <p>
                  {lt(
                    "每行一个搜索词。A股/港股未开启国外源时，这些搜索词不会参与分析。",
                    "One query per line. These queries are ignored for CN/HK unless foreign sources are enabled.",
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="settings-field" style={{ marginTop: 14 }}>
            <label>{lt("工具配置 JSON", "Tool Config JSON")}</label>
            <textarea
              className="settings-json-textarea"
              value={researchToolsText}
              onChange={(event) => handleResearchToolsTextChange(event.target.value)}
              spellCheck={false}
              wrap="off"
              style={{ minHeight: 300 }}
            />
            <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
              {lt(
                "高级配置会与上方表单同步。联网搜索支持 provider=bing/tavily/serpapi/searxng/duckduckgo；国内源保存在 market_data_sources。",
                "Advanced config syncs with the form above. Web search supports provider=bing/tavily/serpapi/searxng/duckduckgo; CN sources are stored under market_data_sources.",
              )}
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 12,
              flexWrap: "wrap",
            }}
          >
            <div className="settings-status-pill">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                fact_check
              </span>
              {lt("输出会标记证据强度：strong / medium / weak / needs_checking", "Output marks evidence strength: strong / medium / weak / needs_checking")}
            </div>
            <button
              className="figma-btn"
              type="button"
              onClick={saveResearchTools}
              disabled={researchToolsSaving}
            >
              {researchToolsSaving ? lt("保存中...", "Saving...") : lt("保存工具配置", "Save Tool Config")}
            </button>
          </div>
          {researchToolsMsg && (
            <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>
              {researchToolsMsg}
            </p>
          )}
        </div>
      )}
      <div
        style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="settings-status-pill green">
          <span
            className="figma-status-dot green"
            style={{ width: 6, height: 6 }}
          />
          {lt("个人助手配置", "Personal Assistant Config")}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="figma-btn" onClick={save}>
              {isSystemAdmin ? lt("保存系统配置", "Save System Config") : lt("保存模型选择", "Save Model Selection")}
          </button>
          {isSystemAdmin && (
            <button
              className="figma-btn figma-btn-primary"
              onClick={test}
              disabled={testing}
            >
              {testing ? lt("验证中...", "Testing...") : lt("测试配置", "Test Config")}
            </button>
          )}
        </div>
      </div>
      {msg && (
        <p style={{ marginTop: 12, fontSize: 14, color: "var(--text-muted)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

/* ── Logs Section ──────────────────────────────────────────────────────────── */

function LogsSection() {
  const lt = useLangText();
  const [logs, setLogs] = useState<{ line: number; content: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api
      .getLogs(100)
      .then((d: any) => {
        setLogs(Array.isArray(d) ? d : []);
        setError("");
      })
      .catch((e: any) => {
        setLogs([]);
        setError(e?.message || "日志加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  const exportLogs = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await fetch(api.exportLogsUrl(5000), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "日志导出失败");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `quartsys-backend-${Date.now()}.log`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "日志导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>{lt("系统日志", "System Logs")}</h2>
          <p>{lt("查看后端执行日志和接口诊断输出。", "View backend execution and API diagnostics.")}</p>
        </div>
        <button className="figma-btn" type="button" onClick={exportLogs} disabled={exporting}>
          {exporting ? lt("导出中...", "Exporting...") : lt("导出日志", "Export Logs")}
        </button>
      </div>
      <div className="settings-log-terminal">
        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>{lt("加载中...", "Loading...")}</p>
        ) : logs.length > 0 ? (
          logs.map((l) => (
            <div key={l.line} className="settings-log-row">
              <span className="settings-log-time">
                {new Date().toLocaleDateString("zh-CN")}
              </span>
              <span className="settings-log-level info">{lt("[信息]", "[INFO]")}</span>
              <span className="settings-log-msg">{l.content}</span>
            </div>
          ))
        ) : error ? (
          <p style={{ color: "var(--text-muted)" }}>{error}</p>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>{lt("暂无日志", "No logs")}</p>
        )}
        <div
          style={{
            width: 8,
            height: 16,
            background: "var(--text-muted)",
            marginTop: 4,
            animation: "blink 1s step-end infinite",
          }}
        />
      </div>
    </div>
  );
}

function AuthSecuritySection() {
  const lt = useLangText();
  const [settings, setSettings] = useState<any>({});
  const [jsonText, setJsonText] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const providerMeta = [
    { key: "github", label: "GitHub", icon: "code", fields: ["client_id", "client_secret", "scopes"] },
    { key: "discord", label: "Discord", icon: "forum", fields: ["client_id", "client_secret", "scopes"] },
    { key: "oidc", label: "OIDC", icon: "verified_user", fields: ["client_id", "client_secret", "issuer", "authorization_endpoint", "token_endpoint", "userinfo_endpoint", "scopes"] },
    { key: "telegram", label: "Telegram", icon: "send", fields: ["bot_username", "bot_token"] },
    { key: "linuxdo", label: "LinuxDO", icon: "public", fields: ["client_id", "client_secret", "authorization_endpoint", "token_endpoint", "userinfo_endpoint", "scopes"] },
    { key: "wechat", label: "微信", icon: "chat", fields: ["client_id", "client_secret", "authorization_endpoint", "token_endpoint", "userinfo_endpoint", "scopes"] },
    { key: "qq", label: "QQ", icon: "alternate_email", fields: ["client_id", "client_secret", "authorization_endpoint", "token_endpoint", "userinfo_endpoint", "openid_endpoint", "scopes"] },
  ];

  const fieldLabels: Record<string, string> = {
    client_id: "Client ID",
    client_secret: "Client Secret",
    scopes: "授权范围",
    issuer: "Issuer",
    authorization_endpoint: "授权端点",
    token_endpoint: "Token 端点",
    userinfo_endpoint: "用户信息端点",
    openid_endpoint: "OpenID 端点",
    bot_username: "Bot Username",
    bot_token: "Bot Token",
  };
  const fieldLabelsEn: Record<string, string> = {
    client_id: "Client ID",
    client_secret: "Client Secret",
    scopes: "Scopes",
    issuer: "Issuer",
    authorization_endpoint: "Authorization Endpoint",
    token_endpoint: "Token Endpoint",
    userinfo_endpoint: "Userinfo Endpoint",
    openid_endpoint: "OpenID Endpoint",
    bot_username: "Bot Username",
    bot_token: "Bot Token",
  };

  const load = () => {
    setLoading(true);
    api
      .getAuthSecurity()
      .then((data: any) => {
        setSettings(data || {});
        setJsonText(JSON.stringify(data || {}, null, 2));
        setMsg("");
      })
      .catch((e: any) => setMsg(e?.message || lt("认证安全配置加载失败", "Failed to load auth security settings")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const updateSettings = (updater: (draft: any) => any) => {
    setSettings((prev: any) => {
      const draft = JSON.parse(JSON.stringify(prev || {}));
      const next = updater(draft) || draft;
      setJsonText(JSON.stringify(next, null, 2));
      return next;
    });
  };

  const setPath = (path: Array<string>, value: any) => {
    updateSettings((draft) => {
      let cursor = draft;
      path.slice(0, -1).forEach((key) => {
        if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
        cursor = cursor[key];
      });
      cursor[path[path.length - 1]] = value;
      return draft;
    });
  };

  const parseList = (value: string) =>
    value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  const listText = (value: unknown) => (Array.isArray(value) ? value.join("\n") : "");

  const applyJsonToForm = () => {
    try {
      const parsed = JSON.parse(jsonText || "{}");
      setSettings(parsed);
      setJsonText(JSON.stringify(parsed, null, 2));
      setMsg(lt("JSON 已应用到表单，保存后生效", "JSON applied to form. Save to take effect."));
      return parsed;
    } catch {
      setMsg(lt("JSON 格式错误，请检查逗号、引号和括号", "Invalid JSON. Check commas, quotes and braces."));
      return null;
    }
  };

  const save = async () => {
    const payload = settings || {};
    setSaving(true);
    setMsg("");
    try {
      const result: any = await api.saveAuthSecurity(payload);
      setSettings(result || payload);
      setJsonText(JSON.stringify(result || payload, null, 2));
      setMsg(lt("认证安全配置已保存", "Auth security settings saved"));
    } catch (e: any) {
      setMsg(e?.message || lt("保存失败", "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const testSmtp = async () => {
    const payload = settings || {};
    if (!testEmail.trim()) {
      setMsg(lt("请填写测试收件邮箱", "Enter a test recipient email"));
      return;
    }
    setTesting(true);
    setMsg("");
    try {
      const result: any = await api.testAuthSmtp({ ...payload, test_email: testEmail.trim() });
      setMsg(result?.message || lt("测试邮件已发送", "Test email sent"));
    } catch (e: any) {
      setMsg(e?.message || lt("SMTP 测试失败", "SMTP test failed"));
    } finally {
      setTesting(false);
    }
  };

  const providers = settings?.oauth?.providers || {};
  const enabledProviders = Object.entries(providers)
    .filter(([, value]: any) => value?.enabled)
    .map(([key]) => key);

  return (
    <div className="settings-section settings-auth-security-section">
      <div className="settings-section-header">
        <div>
          <h2>{lt("认证安全", "Auth Security")}</h2>
          <p>
            {lt(
              "配置多登录方式、邮箱注册、人机校验、SSRF 防护、签到奖励、Passkey 和日志导出策略。",
              "Configure login methods, SMTP registration, bot checks, SSRF protection, check-in rewards, passkeys and log export.",
            )}
          </p>
        </div>
        <button className="figma-btn" type="button" onClick={load} disabled={loading}>
          {loading ? lt("刷新中...", "Refreshing...") : lt("刷新", "Refresh")}
        </button>
      </div>

      <div className="settings-auth-overview-grid">
        {[
          {
            icon: "key",
            title: lt("基础认证", "Basic Auth"),
            value: settings?.basic_auth?.enabled ? lt("已启用", "Enabled") : lt("已关闭", "Disabled"),
          },
          {
            icon: "hub",
            title: lt("第三方登录", "OAuth Login"),
            value: enabledProviders.length ? enabledProviders.join(" / ") : lt("未启用", "Disabled"),
          },
          {
            icon: "mark_email_read",
            title: lt("SMTP 邮箱注册", "SMTP Email Registration"),
            value: settings?.smtp?.enabled ? lt("已启用", "Enabled") : lt("未启用", "Disabled"),
          },
          {
            icon: "shield_lock",
            title: lt("网站防护", "Site Protection"),
            value: settings?.bot_protection?.enabled || settings?.ssrf?.enabled ? lt("已启用", "Enabled") : lt("未启用", "Disabled"),
          },
        ].map((item) => (
          <div key={item.title} className="settings-auth-overview-card">
            <span className="material-symbols-outlined">{item.icon}</span>
            <small>{item.title}</small>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="settings-auth-card-grid">
        <div className="settings-subcard settings-auth-config-card">
          <div className="settings-preference-card-title">
            <span className="material-symbols-outlined">password</span>
            <strong>{lt("基础认证", "Basic Auth")}</strong>
          </div>
          <label className={`settings-auth-switch ${settings?.basic_auth?.enabled ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={Boolean(settings?.basic_auth?.enabled)}
              onChange={(event) => setPath(["basic_auth", "enabled"], event.target.checked)}
            />
            <span>{lt("允许账号密码登录", "Allow password sign-in")}</span>
          </label>
          <label className={`settings-auth-switch ${settings?.basic_auth?.registration_enabled ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={Boolean(settings?.basic_auth?.registration_enabled)}
              onChange={(event) => setPath(["basic_auth", "registration_enabled"], event.target.checked)}
            />
            <span>{lt("开放邮箱/密码注册", "Allow email/password registration")}</span>
          </label>
          <div className="settings-field" style={{ marginTop: 12 }}>
            <label>{lt("允许注册的邮箱域名", "Allowed registration email domains")}</label>
            <textarea
              value={Array.isArray(settings?.basic_auth?.allowed_email_domains) ? settings.basic_auth.allowed_email_domains.join("\n") : ""}
              onChange={(event) => setPath(
                ["basic_auth", "allowed_email_domains"],
                event.target.value.split(/[\n,;]+/).map((item) => item.trim().replace(/^@/, "")).filter(Boolean),
              )}
              placeholder={lt("留空表示不限；每行一个，例如 qq.com", "Leave empty for any domain; one per line, e.g. company.com")}
              rows={3}
            />
            <small>{lt("开启后，注册与验证码发送只接受名单内的邮箱域名；同一邮箱只能注册一个账号。", "When configured, registration and verification only accept these domains. Each email can be used by one account.")}</small>
          </div>
        </div>

        <div className="settings-subcard settings-auth-config-card">
          <div className="settings-preference-card-title">
            <span className="material-symbols-outlined">fingerprint</span>
            <strong>{lt("通行密钥", "Passkeys")}</strong>
          </div>
          <label className={`settings-auth-switch ${settings?.passkey?.enabled ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={Boolean(settings?.passkey?.enabled)}
              onChange={(event) => setPath(["passkey", "enabled"], event.target.checked)}
            />
            <span>{lt("启用 Passkey / WebAuthn", "Enable Passkey / WebAuthn")}</span>
          </label>
          <div className="settings-auth-field-grid">
            <div className="settings-field">
              <label>RP ID</label>
              <input value={settings?.passkey?.rp_id || ""} onChange={(e) => setPath(["passkey", "rp_id"], e.target.value)} placeholder="example.com" />
            </div>
            <div className="settings-field">
              <label>RP Name</label>
              <input value={settings?.passkey?.rp_name || ""} onChange={(e) => setPath(["passkey", "rp_name"], e.target.value)} placeholder="AIQuartSmart Community Edition" />
            </div>
          </div>
        </div>

        <div className="settings-subcard settings-auth-config-card">
          <div className="settings-preference-card-title">
            <span className="material-symbols-outlined">redeem</span>
            <strong>{lt("签到奖励", "Check-in Rewards")}</strong>
          </div>
          <label className={`settings-auth-switch ${settings?.checkin?.enabled ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={Boolean(settings?.checkin?.enabled)}
              onChange={(event) => setPath(["checkin", "enabled"], event.target.checked)}
            />
            <span>{lt("启用每日签到额度", "Enable daily credit rewards")}</span>
          </label>
          <div className="settings-auth-field-grid">
            <div className="settings-field">
              <label>{lt("最小额度", "Min Credits")}</label>
              <input type="number" min={0} value={settings?.checkin?.min_credits ?? 0} onChange={(e) => setPath(["checkin", "min_credits"], Number(e.target.value))} />
            </div>
            <div className="settings-field">
              <label>{lt("最大额度", "Max Credits")}</label>
              <input type="number" min={0} value={settings?.checkin?.max_credits ?? 0} onChange={(e) => setPath(["checkin", "max_credits"], Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="settings-subcard settings-auth-config-card">
          <div className="settings-preference-card-title">
            <span className="material-symbols-outlined">download</span>
            <strong>{lt("日志维护", "Log Maintenance")}</strong>
          </div>
          <label className={`settings-auth-switch ${settings?.logging?.export_enabled ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={Boolean(settings?.logging?.export_enabled)}
              onChange={(event) => setPath(["logging", "export_enabled"], event.target.checked)}
            />
            <span>{lt("允许管理员导出日志", "Allow admin log export")}</span>
          </label>
          <div className="settings-field">
            <label>{lt("最大导出行数", "Max Export Lines")}</label>
            <input type="number" min={100} max={50000} value={settings?.logging?.max_export_lines ?? 5000} onChange={(e) => setPath(["logging", "max_export_lines"], Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="settings-subcard settings-auth-config-card">
        <div className="settings-preference-card-title">
          <span className="material-symbols-outlined">hub</span>
          <strong>{lt("第三方登录", "OAuth Login")}</strong>
        </div>
        <div className="settings-auth-toolbar">
          <label className={`settings-auth-switch ${settings?.oauth?.enabled ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={Boolean(settings?.oauth?.enabled)}
              onChange={(event) => setPath(["oauth", "enabled"], event.target.checked)}
            />
            <span>{lt("启用 OAuth/OIDC 登录", "Enable OAuth/OIDC login")}</span>
          </label>
          <label className={`settings-auth-switch ${settings?.oauth?.auto_register ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={Boolean(settings?.oauth?.auto_register)}
              onChange={(event) => setPath(["oauth", "auto_register"], event.target.checked)}
            />
            <span>{lt("允许自动创建用户", "Auto-create users")}</span>
          </label>
        </div>
        <div className="settings-field settings-auth-wide-field">
          <label>{lt("回调基础地址", "Callback Base URL")}</label>
          <input
            value={settings?.oauth?.callback_base_url || ""}
            onChange={(e) => setPath(["oauth", "callback_base_url"], e.target.value)}
            placeholder="https://your-domain.com"
          />
        </div>
        <div className="settings-auth-provider-grid">
          {providerMeta.map((provider) => {
            const config = providers?.[provider.key] || {};
            return (
              <div key={provider.key} className={`settings-auth-provider-card ${config.enabled ? "enabled" : ""}`}>
                <div className="settings-auth-provider-head">
                  <span className="material-symbols-outlined">{provider.icon}</span>
                  <strong>{provider.label}</strong>
                  <label className="settings-auth-mini-switch">
                    <input
                      type="checkbox"
                      checked={Boolean(config.enabled)}
                      onChange={(event) => setPath(["oauth", "providers", provider.key, "enabled"], event.target.checked)}
                    />
                    <span>{config.enabled ? lt("启用", "On") : lt("关闭", "Off")}</span>
                  </label>
                </div>
                <div className="settings-auth-provider-fields">
                  {provider.fields.map((field) => (
                    <div key={field} className={field.includes("endpoint") || field === "issuer" ? "settings-field wide" : "settings-field"}>
                      <label>{lt(fieldLabels[field] || field, fieldLabelsEn[field] || fieldLabels[field] || field)}</label>
                      <input
                        type={field.includes("secret") || field.includes("token") ? "password" : "text"}
                        value={config[field] || ""}
                        onChange={(event) => setPath(["oauth", "providers", provider.key, field], event.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-auth-card-grid two">
        <div className="settings-subcard settings-auth-config-card">
          <div className="settings-preference-card-title">
            <span className="material-symbols-outlined">mark_email_read</span>
            <strong>{lt("SMTP 邮箱注册", "SMTP Email Registration")}</strong>
          </div>
          <div className="settings-auth-toolbar">
            <label className={`settings-auth-switch ${settings?.smtp?.enabled ? "active" : ""}`}>
              <input type="checkbox" checked={Boolean(settings?.smtp?.enabled)} onChange={(event) => setPath(["smtp", "enabled"], event.target.checked)} />
              <span>{lt("启用 SMTP", "Enable SMTP")}</span>
            </label>
            <label className={`settings-auth-switch ${settings?.smtp?.require_email_verification ? "active" : ""}`}>
              <input type="checkbox" checked={Boolean(settings?.smtp?.require_email_verification)} onChange={(event) => setPath(["smtp", "require_email_verification"], event.target.checked)} />
              <span>{lt("注册必须验证邮箱", "Require email verification")}</span>
            </label>
            <label className={`settings-auth-switch ${settings?.smtp?.use_tls ? "active" : ""}`}>
              <input type="checkbox" checked={Boolean(settings?.smtp?.use_tls)} onChange={(event) => setPath(["smtp", "use_tls"], event.target.checked)} />
              <span>{lt("加密连接", "Encrypted connection")}</span>
            </label>
          </div>
          <div className="settings-auth-field-grid">
            <div className="settings-field">
              <label>SMTP Host</label>
              <input value={settings?.smtp?.host || ""} onChange={(e) => setPath(["smtp", "host"], e.target.value)} />
            </div>
            <div className="settings-field">
              <label>Port</label>
              <input type="number" value={settings?.smtp?.port ?? 465} onChange={(e) => setPath(["smtp", "port"], Number(e.target.value))} />
            </div>
            <div className="settings-field">
              <label>{lt("账号", "Username")}</label>
              <input value={settings?.smtp?.username || ""} onChange={(e) => setPath(["smtp", "username"], e.target.value)} />
            </div>
            <div className="settings-field">
              <label>{lt("密码", "Password")}</label>
              <input
                type="password"
                value={settings?.smtp?.password || ""}
                onChange={(e) => setPath(["smtp", "password"], e.target.value)}
                placeholder={lt("QQ/163 等请填写 SMTP 授权码", "Use SMTP app password / authorization code")}
              />
            </div>
            <div className="settings-field">
              <label>{lt("发件邮箱", "From Email")}</label>
              <input value={settings?.smtp?.from_email || ""} onChange={(e) => setPath(["smtp", "from_email"], e.target.value)} />
            </div>
            <div className="settings-field">
              <label>{lt("发件名称", "From Name")}</label>
              <input value={settings?.smtp?.from_name || ""} onChange={(e) => setPath(["smtp", "from_name"], e.target.value)} />
            </div>
          </div>
          <p className="settings-auth-help">
            {lt(
              "常用配置：QQ 邮箱为 smtp.qq.com:465 并开启加密连接，密码必须填写 QQ 邮箱后台生成的 SMTP 授权码，不是登录密码；587 端口会使用 STARTTLS。",
              "Common setup: QQ Mail uses smtp.qq.com:465 with encrypted connection. Password must be the SMTP authorization/app password, not the login password. Port 587 uses STARTTLS.",
            )}
          </p>
          <div className="settings-auth-actions inline">
            <input
              className="figma-input"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder={lt("SMTP 测试收件邮箱", "SMTP test recipient")}
            />
            <button className="figma-btn" type="button" onClick={testSmtp} disabled={testing}>
              {testing ? lt("测试中...", "Testing...") : lt("测试 SMTP", "Test SMTP")}
            </button>
          </div>
        </div>

        <div className="settings-subcard settings-auth-config-card">
          <div className="settings-preference-card-title">
            <span className="material-symbols-outlined">shield_lock</span>
            <strong>{lt("机器人保护", "Bot Protection")}</strong>
          </div>
          <div className="settings-auth-toolbar">
            <label className={`settings-auth-switch ${settings?.bot_protection?.enabled ? "active" : ""}`}>
              <input type="checkbox" checked={Boolean(settings?.bot_protection?.enabled)} onChange={(event) => setPath(["bot_protection", "enabled"], event.target.checked)} />
              <span>{lt("启用人机校验", "Enable challenge")}</span>
            </label>
            <label className={`settings-auth-switch ${settings?.bot_protection?.apply_login ? "active" : ""}`}>
              <input type="checkbox" checked={Boolean(settings?.bot_protection?.apply_login)} onChange={(event) => setPath(["bot_protection", "apply_login"], event.target.checked)} />
              <span>{lt("登录校验", "Login")}</span>
            </label>
            <label className={`settings-auth-switch ${settings?.bot_protection?.apply_register ? "active" : ""}`}>
              <input type="checkbox" checked={Boolean(settings?.bot_protection?.apply_register)} onChange={(event) => setPath(["bot_protection", "apply_register"], event.target.checked)} />
              <span>{lt("注册校验", "Register")}</span>
            </label>
          </div>
          <div className="settings-auth-field-grid">
            <div className="settings-field">
              <label>{lt("服务商", "Provider")}</label>
              <select value={settings?.bot_protection?.provider || "turnstile"} onChange={(e) => setPath(["bot_protection", "provider"], e.target.value)}>
                <option value="turnstile">Cloudflare Turnstile</option>
                <option value="recaptcha">Google reCAPTCHA</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Site Key</label>
              <input value={settings?.bot_protection?.site_key || ""} onChange={(e) => setPath(["bot_protection", "site_key"], e.target.value)} />
            </div>
            <div className="settings-field wide">
              <label>Secret Key</label>
              <input type="password" value={settings?.bot_protection?.secret_key || ""} onChange={(e) => setPath(["bot_protection", "secret_key"], e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="settings-subcard settings-auth-config-card">
        <div className="settings-preference-card-title">
          <span className="material-symbols-outlined">security</span>
          <strong>{lt("SSRF 防护", "SSRF Protection")}</strong>
        </div>
        <div className="settings-auth-toolbar">
          <label className={`settings-auth-switch ${settings?.ssrf?.enabled ? "active" : ""}`}>
            <input type="checkbox" checked={Boolean(settings?.ssrf?.enabled)} onChange={(event) => setPath(["ssrf", "enabled"], event.target.checked)} />
            <span>{lt("启用 SSRF 防护", "Enable SSRF protection")}</span>
          </label>
          <label className={`settings-auth-switch ${settings?.ssrf?.allow_private_ip ? "active" : ""}`}>
            <input type="checkbox" checked={Boolean(settings?.ssrf?.allow_private_ip)} onChange={(event) => setPath(["ssrf", "allow_private_ip"], event.target.checked)} />
            <span>{lt("允许私有地址", "Allow private IPs")}</span>
          </label>
          <label className={`settings-auth-switch ${settings?.ssrf?.apply_ip_filter_for_domain ? "active" : ""}`}>
            <input type="checkbox" checked={Boolean(settings?.ssrf?.apply_ip_filter_for_domain)} onChange={(event) => setPath(["ssrf", "apply_ip_filter_for_domain"], event.target.checked)} />
            <span>{lt("域名解析后检查 IP", "Check resolved IPs")}</span>
          </label>
        </div>
        <div className="settings-auth-field-grid ssrf">
          <div className="settings-field">
            <label>{lt("域名过滤模式", "Domain Filter")}</label>
            <select value={settings?.ssrf?.domain_filter_mode || "blacklist"} onChange={(e) => setPath(["ssrf", "domain_filter_mode"], e.target.value)}>
              <option value="blacklist">{lt("黑名单", "Blacklist")}</option>
              <option value="whitelist">{lt("白名单", "Whitelist")}</option>
            </select>
          </div>
          <div className="settings-field">
            <label>{lt("IP 过滤模式", "IP Filter")}</label>
            <select value={settings?.ssrf?.ip_filter_mode || "blacklist"} onChange={(e) => setPath(["ssrf", "ip_filter_mode"], e.target.value)}>
              <option value="blacklist">{lt("黑名单", "Blacklist")}</option>
              <option value="whitelist">{lt("白名单", "Whitelist")}</option>
            </select>
          </div>
          <div className="settings-field">
            <label>{lt("域名列表", "Domains")}</label>
            <textarea value={listText(settings?.ssrf?.domain_list)} onChange={(e) => setPath(["ssrf", "domain_list"], parseList(e.target.value))} placeholder={"example.com\n*.example.com"} />
          </div>
          <div className="settings-field">
            <label>{lt("IP/CIDR 列表", "IP/CIDR List")}</label>
            <textarea value={listText(settings?.ssrf?.ip_list)} onChange={(e) => setPath(["ssrf", "ip_list"], parseList(e.target.value))} placeholder={"203.0.113.10\n203.0.113.0/24"} />
          </div>
          <div className="settings-field">
            <label>{lt("允许端口", "Allowed Ports")}</label>
            <textarea value={listText(settings?.ssrf?.allowed_ports)} onChange={(e) => setPath(["ssrf", "allowed_ports"], parseList(e.target.value))} placeholder={"18427\n15473\n15474\n16389"} />
          </div>
        </div>
      </div>

      <div className="settings-subcard settings-auth-json-card">
        <div className="settings-preference-card-title">
          <span className="material-symbols-outlined">data_object</span>
          <strong>{lt("高级 JSON 配置", "Advanced JSON Config")}</strong>
          <button type="button" className="settings-auth-link-btn" onClick={() => setAdvancedOpen((value) => !value)}>
            {advancedOpen ? lt("收起", "Collapse") : lt("展开", "Expand")}
          </button>
        </div>
        {advancedOpen && (
          <>
            <textarea
              className="settings-json-textarea settings-auth-json-textarea"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              wrap="off"
            />
            <div className="settings-auth-actions inline">
              <button className="figma-btn" type="button" onClick={applyJsonToForm}>
                {lt("应用 JSON 到表单", "Apply JSON to Form")}
              </button>
            </div>
          </>
        )}
        <p className="settings-auth-help">
          {lt(
            "OAuth 支持 GitHub、Discord、OIDC、Telegram、LinuxDO、微信、QQ；敏感字段保存后会脱敏，保留 **** 时不会覆盖原密钥。",
            "OAuth supports GitHub, Discord, OIDC, Telegram, LinuxDO, WeChat and QQ. Secrets are masked after saving; keeping **** will not overwrite existing secrets.",
          )}
        </p>
      </div>

      <div className="settings-subcard settings-auth-save-card">
        <div>
          <strong>{lt("保存认证安全配置", "Save Auth Security Config")}</strong>
          <p>{lt("表单会合并为 JSON 保存到后端系统设置。", "The form is merged into JSON and saved to backend system settings.")}</p>
        </div>
        <button className="figma-btn figma-btn-primary" type="button" onClick={save} disabled={saving}>
          {saving ? lt("保存中...", "Saving...") : lt("保存配置", "Save Config")}
        </button>
      </div>

      {msg && <div className="settings-inline-message">{msg}</div>}
    </div>
  );
}

/* ── Support Section ───────────────────────────────────────────────────────── */

type BrandIconType = "epay" | "stripe" | "feishu" | "wecom" | "telegram";

function BrandIcon({ type }: { type: BrandIconType }) {
  if (type === "stripe") {
    return <SiStripe aria-hidden="true" />;
  }
  if (type === "epay") {
    return <SiAlipay aria-hidden="true" />;
  }
  if (type === "telegram") {
    return <SiTelegram aria-hidden="true" />;
  }
  if (type === "feishu") {
    return <Bot aria-hidden="true" />;
  }
  if (type === "wecom") {
    return (
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <rect width="56" height="56" rx="14" fill="#07C160" />
        <path
          d="M24.1 16.1c-8 0-14.4 5-14.4 11.1 0 3.5 2.1 6.5 5.5 8.6l-1.1 4.1 5-2.4c1.6.5 3.3.8 5 .8 8 0 14.4-5 14.4-11.1S32.1 16.1 24.1 16.1z"
          fill="#fff"
        />
        <path
          d="M34.8 27.6c6.6 0 11.9 4.1 11.9 9.2 0 2.9-1.7 5.4-4.5 7.1l.9 3.5-4.2-2.1c-1.3.4-2.7.6-4.2.6-6.6 0-11.9-4.1-11.9-9.2s5.4-9.1 12-9.1z"
          fill="#D8FFE7"
        />
        <circle cx="19.3" cy="26.6" r="1.8" fill="#07C160" />
        <circle cx="28.8" cy="26.6" r="1.8" fill="#07C160" />
        <circle cx="31.8" cy="36.2" r="1.5" fill="#07C160" />
        <circle cx="39.7" cy="36.2" r="1.5" fill="#07C160" />
      </svg>
    );
  }
  return null;
}

const DEFAULT_WEBHOOK_CONFIG = {
  feishu: { enabled: false, webhook_url: "", secret: "" },
  wecom: { enabled: false, webhook_url: "" },
  telegram: { enabled: false, bot_token: "", chat_id: "", webhook_url: "" },
  scope: {
    risk_events: true,
    ai_insights: true,
    strategy_signals: true,
    trade_events: true,
    system_status: true,
    subscription: false,
  },
  templates: {
    risk_events: "【风险提醒】{title}\n{content}",
    ai_insights: "【AI洞察】{title}\n{content}",
    strategy_signals: "【策略信号】{title}\n{content}",
    trade_events: "【交易提醒】{title}\n{content}",
    system_status: "【系统通知】{title}\n{content}",
    subscription: "【订阅通知】{title}\n{content}",
  },
};

const FALLBACK_NOTIFICATION_SCOPE_OPTIONS: Record<string, string> = {
  risk_events: "风险事件",
  ai_insights: "AI洞察",
  strategy_signals: "策略信号",
  trade_events: "交易提醒",
  system_status: "系统通知",
  subscription: "订阅与额度",
};

const NOTIFICATION_SCOPE_LABELS_EN: Record<string, string> = {
  risk_events: "Risk events",
  ai_insights: "AI insights",
  strategy_signals: "Strategy signals",
  trade_events: "Trade alerts",
  system_status: "System notices",
  subscription: "Subscription and credits",
};

type WebhookProvider = "feishu" | "wecom" | "telegram";

const WEBHOOK_PROVIDERS: {
  key: WebhookProvider;
  name: string;
  nameEn: string;
  desc: string;
  descEn: string;
  icon: string;
}[] = [
  {
    key: "feishu",
    name: "飞书",
    nameEn: "Feishu",
    desc: "用于飞书群机器人提醒、策略触发和系统反馈。",
    descEn: "For Feishu group bot alerts, strategy triggers and system feedback.",
    icon: "forum",
  },
  {
    key: "wecom",
    name: "企业微信",
    nameEn: "WeCom",
    desc: "用于企业微信群提醒、风控事件和运营通知。",
    descEn: "For WeCom group alerts, risk events and operation notices.",
    icon: "groups",
  },
  {
    key: "telegram",
    name: "Telegram",
    nameEn: "Telegram",
    desc: "用于 Telegram bot 推送，适合移动端即时提醒。",
    descEn: "For Telegram bot pushes and mobile realtime alerts.",
    icon: "send",
  },
];

function NotificationBotsSection() {
  const lt = useLangText();
  const authUser = getAuthUser();
  const canAccessNotifications = hasPermission("notifications.manage");
  const [config, setConfig] = useState<any>(DEFAULT_WEBHOOK_CONFIG);
  const [scopeOptions, setScopeOptions] = useState<Record<string, string>>(FALLBACK_NOTIFICATION_SCOPE_OPTIONS);
  const [canManageTemplates, setCanManageTemplates] = useState(
    ["admin", "svip"].includes(String(authUser?.role || "").toLowerCase()),
  );
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState("");

  useEffect(() => {
    if (!canAccessNotifications) return;
    (api as any)
      .getNotificationWebhooks()
      .then((data: any) => {
        setConfig({ ...DEFAULT_WEBHOOK_CONFIG, ...(data?.config || {}) });
        if (data?.scope_options && typeof data.scope_options === "object") {
          setScopeOptions(data.scope_options);
        }
        if (typeof data?.can_manage_templates === "boolean") {
          setCanManageTemplates(data.can_manage_templates);
        }
      })
      .catch(() => {});
  }, [canAccessNotifications]);

  const patchProvider = (provider: WebhookProvider, key: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      [provider]: { ...(prev?.[provider] || {}), [key]: value },
    }));
  };

  const saveConfig = async () => {
    setSaving(true);
    setMsg("");
    try {
      const result: any = await (api as any).saveNotificationWebhooks(config);
      if (result?.config) setConfig({ ...DEFAULT_WEBHOOK_CONFIG, ...result.config });
      if (typeof result?.can_manage_templates === "boolean") {
        setCanManageTemplates(result.can_manage_templates);
      }
      setMsg(lt("机器人 Webhook 配置已保存", "Robot webhook settings saved"));
    } catch (e: any) {
      setMsg(e?.message || lt("保存机器人配置失败", "Failed to save robot settings"));
    } finally {
      setSaving(false);
    }
  };

  const patchScope = (key: string, value: boolean) => {
    setConfig((prev: any) => ({
      ...prev,
      scope: { ...(prev?.scope || DEFAULT_WEBHOOK_CONFIG.scope), [key]: value },
    }));
  };

  const patchTemplate = (key: string, value: string) => {
    if (!canManageTemplates) return;
    setConfig((prev: any) => ({
      ...prev,
      templates: { ...(prev?.templates || DEFAULT_WEBHOOK_CONFIG.templates), [key]: value },
    }));
  };

  const testProvider = async (provider: WebhookProvider) => {
    setTesting(provider);
    setMsg("");
    try {
      const result: any = await (api as any).testNotificationWebhook({
        provider,
        config,
        message: "StockSys webhook test",
      });
      setMsg(result?.status === "ok" ? lt("测试消息已发送", "Test message sent") : lt("测试发送失败", "Test send failed"));
    } catch (e: any) {
      setMsg(e?.message || lt("测试发送失败", "Test send failed"));
    } finally {
      setTesting("");
    }
  };

  if (!canAccessNotifications) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>{lt("通知机器人", "Notification Bots")}</h2>
          <p>{lt("当前账号未开通通知机器人配置权限，请联系系统管理员。", "This account does not have notification bot permission. Contact the administrator.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section settings-notification-section">
      <div
        className="settings-section-accent"
        style={{ background: "var(--brand-accent)" }}
      />
      <div className="settings-section-header">
        <div>
          <h2>{lt("通知机器人", "Notification Bots")}</h2>
          <p>{lt("配置飞书、企业微信和 Telegram 的机器人 Webhook，用于风险提醒、策略反馈和系统通知。", "Configure Feishu, WeCom and Telegram bot webhooks for risk alerts, strategy feedback and system notices.")}</p>
        </div>
      </div>

      <div className="settings-webhook-grid">
        {WEBHOOK_PROVIDERS.map((provider) => {
          const current = config[provider.key] || {};
          const enabled = Boolean(current.enabled);
          return (
            <div
              className={`settings-webhook-card settings-webhook-card-${provider.key}`}
              key={provider.key}
            >
              <div className="settings-webhook-card-header">
                <div className={`settings-webhook-icon settings-webhook-icon-${provider.key}`}>
                  <BrandIcon type={provider.key} />
                </div>
                <div className="settings-webhook-title-block">
                  <h3>{lt(provider.name, provider.nameEn)}</h3>
                  <p>{lt(provider.desc, provider.descEn)}</p>
                </div>
                <label className={`settings-webhook-switch ${enabled ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => patchProvider(provider.key, "enabled", e.target.checked)}
                  />
                  <span>{enabled ? lt("已启用", "Enabled") : lt("未启用", "Disabled")}</span>
                </label>
              </div>

              <div className="settings-webhook-form">
                {provider.key === "telegram" ? (
                  <>
                    <label className="settings-field">
                      <span>Bot Token</span>
                      <input className="figma-input" placeholder="123456:ABC..." value={current.bot_token || ""} onChange={(e) => patchProvider("telegram", "bot_token", e.target.value)} />
                    </label>
                    <label className="settings-field">
                      <span>Chat ID</span>
                      <input className="figma-input" placeholder="-1001234567890" value={current.chat_id || ""} onChange={(e) => patchProvider("telegram", "chat_id", e.target.value)} />
                    </label>
                    <label className="settings-field settings-webhook-field-wide">
                      <span>{lt("Webhook URL（可选）", "Webhook URL (optional)")}</span>
                      <input className="figma-input" placeholder="https://api.telegram.org/bot.../sendMessage" value={current.webhook_url || ""} onChange={(e) => patchProvider("telegram", "webhook_url", e.target.value)} />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="settings-field settings-webhook-field-wide">
                      <span>Webhook URL</span>
                      <input
                        className="figma-input"
                        placeholder={provider.key === "feishu" ? "https://open.feishu.cn/..." : "https://qyapi.weixin.qq.com/..."}
                        value={current.webhook_url || ""}
                        onChange={(e) => patchProvider(provider.key, "webhook_url", e.target.value)}
                      />
                    </label>
                    {provider.key === "feishu" && (
                      <label className="settings-field settings-webhook-field-wide">
                        <span>{lt("签名密钥（可选）", "Signature Secret (optional)")}</span>
                        <input className="figma-input" placeholder={lt("飞书机器人签名密钥", "Feishu bot signature secret")} value={current.secret || ""} onChange={(e) => patchProvider("feishu", "secret", e.target.value)} />
                      </label>
                    )}
                  </>
                )}
              </div>

              <button
                className={`settings-webhook-test-btn settings-webhook-test-btn-${provider.key}`}
                type="button"
                onClick={() => testProvider(provider.key)}
                disabled={testing === provider.key}
              >
                <span className="material-symbols-outlined">
                  {testing === provider.key ? "hourglass_top" : "outgoing_mail"}
                </span>
                {testing === provider.key
                  ? lt("发送中...", "Sending...")
                  : lt(`测试${provider.name}`, `Test ${provider.nameEn}`)}
              </button>
            </div>
          );
        })}
      </div>

      <div className="settings-webhook-scope-card">
        <div className="settings-webhook-block-header">
          <div>
            <h3>{lt("通知范围", "Notification Scope")}</h3>
            <p>{lt("控制哪些类型的事件会推送到已启用的机器人。此页面访问权限由系统管理员在用户权限中配置。", "Control which events are pushed to enabled bots. Page access is managed by administrators in user permissions.")}</p>
          </div>
        </div>
        <div className="settings-webhook-scope-grid">
          {Object.entries(scopeOptions).map(([key, label]) => (
            <label key={key} className="settings-webhook-scope-item">
              <input
                type="checkbox"
                checked={Boolean((config.scope || DEFAULT_WEBHOOK_CONFIG.scope)[key])}
                onChange={(event) => patchScope(key, event.target.checked)}
              />
              <span>{lt(label, NOTIFICATION_SCOPE_LABELS_EN[key] || label)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={`settings-webhook-template-card ${canManageTemplates ? "" : "locked"}`}>
        <div className="settings-webhook-block-header">
          <div>
            <h3>{lt("通知模板", "Notification Templates")}</h3>
            <p>
              {canManageTemplates
                ? lt("可使用 {title}、{content}、{type}、{scope} 变量。", "You can use {title}, {content}, {type}, and {scope}.")
                : lt("通知模板仅旗舰版和系统管理员可配置。", "Notification templates are available only to SVIP and administrators.")}
            </p>
          </div>
          {!canManageTemplates && (
            <span className="settings-template-lock">
              <span className="material-symbols-outlined">lock</span>
              {lt("旗舰版", "SVIP")}
            </span>
          )}
        </div>
        <div className="settings-webhook-template-grid">
          {Object.entries(scopeOptions).map(([key, label]) => (
            <label key={key} className="settings-field">
              <span>{lt(label, NOTIFICATION_SCOPE_LABELS_EN[key] || label)}</span>
              <textarea
                value={(config.templates || DEFAULT_WEBHOOK_CONFIG.templates)[key] || ""}
                onChange={(event) => patchTemplate(key, event.target.value)}
                disabled={!canManageTemplates}
                spellCheck={false}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="settings-webhook-actions">
        <div className={`settings-webhook-message ${msg ? "visible" : ""}`}>{msg}</div>
        <button className="figma-btn figma-btn-primary" type="button" onClick={saveConfig} disabled={saving}>
          <span className="material-symbols-outlined">save</span>
          {saving ? lt("保存中...", "Saving...") : lt("保存全部机器人配置", "Save Bot Settings")}
        </button>
      </div>
    </div>
  );
}

function buildSiteContactItems(
  siteSettings: PublicSiteSettings,
  lt: (zh: string, en: string) => string,
) {
  return [
    { key: "qq" as const, label: "QQ", Icon: SiTencentqq, href: (value: string) => `https://wpa.qq.com/msgrd?v=3&uin=${encodeURIComponent(value)}&site=qq&menu=yes` },
    { key: "wechat" as const, label: lt("微信", "WeChat"), Icon: SiWechat, href: () => "" },
    { key: "telegram" as const, label: "Telegram", Icon: SiTelegram, href: (value: string) => value.startsWith("http") ? value : `https://t.me/${value.replace(/^@/, "")}` },
    { key: "whatsapp" as const, label: "WhatsApp", Icon: SiWhatsapp, href: (value: string) => value.startsWith("http") ? value : `https://wa.me/${value.replace(/\D/g, "")}` },
  ].map((item) => ({ ...item, value: siteSettings.contact[item.key].trim() }))
    .filter((item) => item.value);
}

/* ── Subscription Section ─────────────────────────────────────────────────── */

type SubscriptionPlan = {
  id: number;
  key: string;
  name: string;
  description?: string;
  price_cents: number;
  price?: number;
  currency?: string;
  interval?: string;
  duration_days?: number;
  is_trial?: boolean;
  tier?: "free" | "vip" | "svip";
  role?: string;
  credits: number;
  features?: string[];
  enabled?: boolean;
  sort_order?: number;
  stripe_price_id?: string;
};

type SubscriptionQuote = {
  plan_id: number;
  plan_key: string;
  base_amount_cents: number;
  credit_cents: number;
  amount_cents: number;
  currency?: string;
  eligible: boolean;
  reason?: string;
  is_upgrade?: boolean;
  is_renewal?: boolean;
  is_trial?: boolean;
  carryover_credits?: number;
  duration_days?: number;
};

type RedeemCodeRecord = {
  id: number;
  code: string;
  plan_id: number;
  plan_key?: string;
  plan_name?: string;
  plan_role?: string;
  credits?: number;
  duration_days?: number | null;
  max_uses?: number;
  used_count?: number;
  remaining_uses?: number;
  per_user_limit?: number;
  enabled?: boolean;
  description?: string;
  starts_at?: string | null;
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RedeemCodeForm = {
  code: string;
  plan_id: string;
  credits: string;
  duration_days: string;
  max_uses: string;
  per_user_limit: string;
  enabled: boolean;
  description: string;
  starts_at: string;
  expires_at: string;
};

const EMPTY_REDEEM_FORM: RedeemCodeForm = {
  code: "",
  plan_id: "",
  credits: "",
  duration_days: "",
  max_uses: "1",
  per_user_limit: "1",
  enabled: true,
  description: "",
  starts_at: "",
  expires_at: "",
};

type PaymentChannelStatus = {
  enabled?: boolean;
  label?: string;
  default_method?: string;
  methods?: string[];
};

type EpayMethod = "alipay" | "wxpay" | "qqpay";
type SubscriptionPlanViewKey = "trial" | "month" | "quarter" | "year" | "enterprise";

const EPAY_METHODS: EpayMethod[] = ["alipay", "wxpay", "qqpay"];
const SUBSCRIPTION_PLAN_VIEW_ORDER: SubscriptionPlanViewKey[] = ["trial", "month", "quarter", "year", "enterprise"];
const FREE_PLAN_ASSISTANT_MONTHLY_LIMIT = 20;
const EPAY_CHECKOUT_STORAGE_KEY = "quartsys_epay_checkout";
const EPAY_DISPLAY_NAME = "ePay";

function paymentProviderLabel(providerKey: string) {
  if (providerKey === "epay") return EPAY_DISPLAY_NAME;
  if (providerKey === "stripe") return "Stripe";
  return providerKey;
}

function epayMethodLabel(method: string, lt: (zh: string, en: string) => string) {
  if (method === "wxpay") return lt("微信支付", "WeChat Pay");
  if (method === "qqpay") return lt("QQ 钱包", "QQ Wallet");
  return lt("支付宝", "Alipay");
}

function paymentReturnMessage(status: string | null, lt: (zh: string, en: string) => string) {
  if (status === "timeout") {
    return lt("支付已超时，请重新发起支付。", "Payment timed out. Please start checkout again.");
  }
  if (status === "failed") {
    return lt("支付请求失败，请重新发起支付。", "Checkout failed. Please start checkout again.");
  }
  if (status === "cancelled") {
    return lt("已返回订阅页，支付未完成。", "Returned to plans. Payment was not completed.");
  }
  if (status === "success") {
    return lt("支付处理完成，订阅状态已刷新。", "Payment processed. Subscription status refreshed.");
  }
  return "";
}

function subscriptionExpiryText(
  subscription: { role?: string; expires_at?: string | null } | null | undefined,
  role: string | undefined,
  lt: (zh: string, en: string) => string,
) {
  if (normalizedRole(role) === "admin") {
    return { value: lt("无限期", "No expiry"), hint: lt("系统管理员账户", "Administrator account") };
  }
  if (!subscription || normalizedRole(subscription.role) === "normal") {
    return { value: lt("免费版", "Free plan"), hint: lt("可随时升级套餐", "Upgrade at any time") };
  }
  if (!subscription.expires_at) {
    return { value: lt("持续有效", "Active"), hint: lt("当前套餐未设置到期日", "This plan has no expiry date") };
  }
  const expiresAt = new Date(subscription.expires_at);
  if (Number.isNaN(expiresAt.getTime())) {
    return { value: lt("有效期读取失败", "Expiry unavailable"), hint: "" };
  }
  const remainingDays = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000));
  return {
    value: expiresAt.toLocaleDateString(),
    hint: remainingDays > 0
      ? lt(`剩余 ${remainingDays} 天，到期后自动回到免费版`, `${remainingDays} days remaining; reverts to Free on expiry`)
      : lt("套餐已到期，正在同步免费权限", "Plan expired; syncing Free access"),
  };
}

function formatPlanPrice(plan: SubscriptionPlan, lt: (zh: string, en: string) => string) {
  const key = String(plan.key || "").toLowerCase();
  if (!plan.price_cents) return lt("免费", "Free");
  if (plan.interval === "trial") {
    const unit = key === "vip-full-trial" ? lt("月", "month") : lt("14 天", "14 days");
    return `￥${((plan.price_cents || 0) / 100).toFixed(2)} / ${unit}`;
  }
  const unit = plan.interval === "year"
    ? lt("年", "year")
    : plan.interval === "quarter"
      ? lt("季度", "quarter")
      : lt("月", "month");
  const digits = Number(plan.price_cents || 0) % 100 === 0 ? 0 : 2;
  return `￥${((plan.price_cents || 0) / 100).toFixed(digits)} / ${unit}`;
}

function formatCnyCents(value: number | undefined, digits = 2) {
  return `￥${(Math.max(0, Number(value) || 0) / 100).toFixed(digits)}`;
}

function formatSettingsDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function dateTimeInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function planTierClass(plan: SubscriptionPlan) {
  const key = String(plan.key || plan.role || plan.tier || "").toLowerCase();
  if (key.includes("svip") || key.includes("team")) return "svip";
  if (key.includes("vip") || key.includes("pro")) return "vip";
  return "free";
}

function planVisualTierClass(plan: SubscriptionPlan) {
  const key = String(plan.key || "").toLowerCase();
  if (key === "vip-full-trial") return "svip";
  return planTierClass(plan);
}

function planPeriodRank(plan: SubscriptionPlan) {
  const key = String(plan.key || "").toLowerCase();
  if (key === "free") return 0;
  if (plan.interval === "trial" || key.includes("trial")) return 1;
  if (plan.interval === "month") return 2;
  if (plan.interval === "quarter" || key.includes("quarter")) return 3;
  if (plan.interval === "year") return 4;
  return 5;
}

function planViewForPlan(plan: SubscriptionPlan): SubscriptionPlanViewKey | null {
  const key = String(plan.key || "").toLowerCase();
  if (key === "free") return null;
  if (plan.interval === "trial" || key.includes("trial")) return "trial";
  if (plan.interval === "quarter" || key.includes("quarter")) return "quarter";
  if (plan.interval === "year") return "year";
  return "month";
}

function planViewMultiplier(viewKey: SubscriptionPlanViewKey) {
  if (viewKey === "quarter") return 3;
  if (viewKey === "year") return 12;
  return 1;
}

function planCreditUnit(
  plan: SubscriptionPlan,
  viewKey: SubscriptionPlanViewKey,
  lt: (zh: string, en: string) => string,
) {
  const key = String(plan.key || "").toLowerCase();
  const interval = String(plan.interval || "").toLowerCase();
  if (key === "vip-full-trial") return lt("月", "month");
  if (interval === "trial" || key.includes("trial")) return lt("试用期", "trial");
  if (key === "free") {
    if (viewKey === "quarter") return lt("季度", "quarter");
    if (viewKey === "year") return lt("年", "year");
    return lt("月", "month");
  }
  if (interval === "quarter" || key.includes("quarter")) return lt("月", "month");
  if (interval === "year") return lt("月", "month");
  return lt("月", "month");
}

function displayPlanCredits(plan: SubscriptionPlan, viewKey: SubscriptionPlanViewKey) {
  const credits = Number(plan.credits || 0);
  return String(plan.key || "").toLowerCase() === "free"
    ? credits * planViewMultiplier(viewKey)
    : credits;
}

function planCreditsRenewMonthly(plan: SubscriptionPlan) {
  const key = String(plan.key || "").toLowerCase();
  const interval = String(plan.interval || "").toLowerCase();
  if (key === "free") return false;
  return interval === "quarter" || interval === "year" || key.includes("quarter") || key.includes("year");
}

function planCreditText(
  plan: SubscriptionPlan,
  viewKey: SubscriptionPlanViewKey,
  lt: (zh: string, en: string) => string,
) {
  const credits = displayPlanCredits(plan, viewKey);
  const creditUnit = planCreditUnit(plan, viewKey, lt);
  if (planCreditsRenewMonthly(plan)) {
    return lt(`每月发放 ${credits} AI 使用额度`, `${credits} AI usage credits issued monthly`);
  }
  return lt(`${credits} AI 使用额度 / ${creditUnit}`, `${credits} AI usage credits / ${creditUnit}`);
}

function freePlanFeatureText(
  plan: SubscriptionPlan,
  viewKey: SubscriptionPlanViewKey,
  lt: (zh: string, en: string) => string,
) {
  const multiplier = planViewMultiplier(viewKey);
  const credits = displayPlanCredits(plan, viewKey);
  const assistantLimit = FREE_PLAN_ASSISTANT_MONTHLY_LIMIT * multiplier;
  const periodZh = viewKey === "quarter" ? "每季度" : viewKey === "year" ? "每年" : "每月";
  const periodEn = viewKey === "quarter" ? "quarter" : viewKey === "year" ? "year" : "month";
  const desc =
    viewKey === "quarter"
      ? "免费版按 3 个月口径折算基础额度，适合长期观察和轻量研究"
      : viewKey === "year"
        ? "免费版按 12 个月口径折算基础额度，适合长期体验和轻量研究"
        : "免费版按月发放基础额度，适合体验和轻量研究";
  const descEn =
    viewKey === "quarter"
      ? "Free plan quota shown on a 3-month basis for light research comparison."
      : viewKey === "year"
        ? "Free plan quota shown on a 12-month basis for long-term light usage comparison."
        : "Free plan quota renews monthly for evaluation and light usage.";
  return {
    description: lt(desc, descEn),
    features: lt(
      [
        "行情数据、股票详情、选股器、AI 洞察、因子挖掘、智能研究、AI 分析师和风险监控",
        "AI 分析师使用内置模板，单次最多 2 位分析师、1 轮起步，按额度计费",
        `量化投研助手 ${assistantLimit} 次 / ${periodZh.replace("每", "")}`,
        `${periodZh} ${credits} AI 使用额度`,
        "不含交易终端、AI 策略和回测分析",
      ].join("\n"),
      [
        "Market data, stock details, screener, AI insights, factors, smart research, AI Analysts and risk monitor",
        "AI Analysts: built-in templates, up to 2 analysts and 1 initial round, charged by usage quota",
        `Quant Research Assistant: ${assistantLimit} conversations / ${periodEn}`,
        `${credits} AI usage credits / ${periodEn}`,
        "Trading terminal, AI strategy and backtesting are not included",
      ].join("\n"),
    )
      .split("\n")
      .filter(Boolean),
  };
}

function planViewText(key: SubscriptionPlanViewKey, lt: (zh: string, en: string) => string) {
  const text: Record<SubscriptionPlanViewKey, { label: string; labelEn: string; desc: string; descEn: string; icon: string }> = {
    trial: {
      label: "试用",
      labelEn: "Trial",
      desc: "先体验专业版能力，适合首次评估投研工作流。",
      descEn: "Evaluate professional research workflows before subscribing.",
      icon: "hourglass_top",
    },
    month: {
      label: "月付",
      labelEn: "Monthly",
      desc: "按月开通，适合稳定使用和灵活调整。",
      descEn: "Monthly access for flexible, steady usage.",
      icon: "calendar_month",
    },
    quarter: {
      label: "季付",
      labelEn: "Quarterly",
      desc: "三个月周期，适合阶段性策略研究和组合跟踪。",
      descEn: "Three-month access for strategy research and portfolio tracking.",
      icon: "date_range",
    },
    year: {
      label: "年付",
      labelEn: "Annual",
      desc: "年度周期，适合长期投研和高频使用。",
      descEn: "Annual access for long-term research and heavier usage.",
      icon: "event_available",
    },
    enterprise: {
      label: "企业版",
      labelEn: "Enterprise",
      desc: "面向更大规模服务、私有部署、专属数据源、多人权限和定制投研流程。",
      descEn: "For larger-scale service, private deployment, dedicated data, team permissions and custom workflows.",
      icon: "domain",
    },
  };
  const preset = text[key];
  return {
    label: lt(preset.label, preset.labelEn),
    description: lt(preset.desc, preset.descEn),
    icon: preset.icon,
  };
}

function planBadge(plan: SubscriptionPlan, isCurrent: boolean, lt: (zh: string, en: string) => string) {
  if (isCurrent) return lt("使用中", "In Use");
  if (plan.interval === "trial") return lt("试用", "Trial");
  if (plan.interval === "quarter") return lt("季付优惠", "Quarterly");
  if (plan.interval === "year") return lt("年付优惠", "Annual");
  const tier = planTierClass(plan);
  if (tier === "svip") return lt("高额度", "Premium");
  if (tier === "vip") return lt("常用", "Popular");
  return lt("基础", "Basic");
}

function planDisplayText(
  plan: SubscriptionPlan,
  lt: (zh: string, en: string) => string,
  viewKey: SubscriptionPlanViewKey = "month",
) {
  const displays: Record<string, { name: string; nameEn: string; desc: string; descEn: string; features: string[]; featuresEn: string[] }> = {
    free: {
      name: "免费版",
      nameEn: "Free",
      desc: "提供核心行情与基础 AI 投研能力，适合体验和轻量研究",
      descEn: "Core market data and essential AI research for evaluation and light usage.",
      features: [
        "行情数据、股票详情、选股器、AI 洞察、AI 观察池、因子挖掘、智能研究、AI 分析师和风险监控",
        "AI 观察池按观察额度展示候选样本，不输出交易指令",
        "AI 分析师使用内置模板，单次最多 2 位分析师、1 轮起步，按额度计费",
        "量化投研助手 20 次 / 周期",
        "每月 500 AI 使用额度",
        "不含交易终端、AI 策略和回测分析",
      ],
      featuresEn: [
        "Market data, stock details, screener, AI insights, AI Watchlist Pool, factors, smart research, AI Analysts and risk monitor",
        "AI Watchlist Pool shows observation samples by quota and does not issue trading instructions",
        "AI Analysts: built-in templates, up to 2 analysts and 1 initial round, charged by usage quota",
        "Quant Research Assistant: 20 conversations / cycle",
        "500 AI usage credits / month",
        "Trading terminal, AI strategy and backtesting are not included",
      ],
    },
    vip: {
      name: "专业版·月付",
      nameEn: "VIP Monthly",
      desc: "开放策略、回测和模拟交易能力，适合个人专业投研",
      descEn: "Strategy, backtesting and simulated trading for professional individual research.",
      features: [
        "包含免费版全部能力",
        "AI 观察池按专业版观察额度展示候选样本",
        "开放 AI 策略、回测分析和交易终端",
        "面向个人专业投资者，可创建私有 AI 分析师，单次最多 4 位分析师、2 轮起步",
        "量化投研助手 100 次 / 周期",
        "每月发放 10000 AI 使用额度",
      ],
      featuresEn: [
        "Includes all Free features",
        "AI Watchlist Pool shows observation samples under the VIP observation quota",
        "AI strategy, backtesting and trading terminal",
        "For professional individual investors: create private AI Analysts, up to 4 analysts and 2 initial rounds",
        "Quant Research Assistant: 100 conversations / cycle",
        "10000 AI usage credits issued monthly",
      ],
    },
    "vip-trial": {
      name: "专业版·试用",
      nameEn: "VIP Trial",
      desc: "仅面向从未订阅付费版本的免费新用户，每个账号仅可订阅一次",
      descEn: "A 14-day evaluation for new Free users who have never subscribed to VIP or SVIP. One trial per account.",
      features: [
        "14 天专业版完整功能",
        "开放 AI 策略、回测分析和交易终端",
        "2500 AI 使用额度",
        "仅限从未订阅付费版本的免费新用户，每个账号仅可订阅一次",
      ],
      featuresEn: [
        "14 days of full VIP access",
        "AI strategy, backtesting and trading terminal",
        "2500 AI usage credits",
        "Available once per account and only before any paid-tier subscription",
      ],
    },
    "vip-full-trial": {
      name: "专业版·单月完整试用",
      nameEn: "Pro Full Trial",
      desc: "专业版完整能力单月体验，99 元开通，每个账号仅可订阅一次",
      descEn: "One month of full Pro access for CNY 99. Available once per account.",
      features: [
        "1 个月专业版完整功能",
        "开放 AI 策略、回测分析和交易终端",
        "包含 10000 AI 使用额度",
        "仅限从未订阅试用或付费版本的新用户，每个账号仅可订阅一次",
      ],
      featuresEn: [
        "1 month of full Pro access",
        "AI strategy, backtesting and trading terminal",
        "10000 AI usage credits",
        "Available once per account before any trial or paid-tier subscription",
      ],
    },
    "vip-quarter": {
      name: "专业版·季付",
      nameEn: "VIP Quarterly",
      desc: "一次购买 3 个月专业版，季付价格由管理员按月付价格与优惠率配置",
      descEn: "Three months of VIP access. Quarterly pricing follows the admin configured monthly price and discount.",
      features: [
        "包含专业版全部能力",
        "有效期 90 天，享受季付优惠",
        "每月发放 10000 AI 使用额度",
        "支持升级旗舰版时按剩余价值补差价",
      ],
      featuresEn: [
        "Includes all VIP capabilities",
        "90-day access with quarterly discount",
        "10000 AI usage credits issued monthly",
        "Unused subscription value offsets SVIP upgrades",
      ],
    },
    "vip-year": {
      name: "专业版·年付",
      nameEn: "VIP Annual",
      desc: "一次购买 12 个月专业版，按 10 个月价格计费",
      descEn: "Twelve months of VIP access for the price of ten monthly cycles.",
      features: [
        "包含专业版全部能力",
        "有效期 365 天，价格相当于 10 个月月付",
        "每月发放 10000 AI 使用额度",
        "支持升级旗舰版时按剩余价值补差价",
      ],
      featuresEn: [
        "Includes all VIP capabilities",
        "365-day access with two months saved",
        "10000 AI usage credits issued monthly",
        "Unused subscription value offsets SVIP upgrades",
      ],
    },
    svip: {
      name: "旗舰版·月付",
      nameEn: "SVIP Monthly",
      desc: "提供高额度批量研究与多分析师能力，适合高频和大资金投资者",
      descEn: "Higher quota, batch research and multi-analyst capacity for high-frequency users.",
      features: [
        "包含专业版全部能力",
        "AI 观察池按旗舰版观察额度展示候选样本",
        "更高额度智能研究、AI 策略生成和风险评估",
        "面向高频和大资金投资者，单次最多 6 位 AI 分析师、3 轮起步，可使用管理员批准的 MCP 工具",
        "量化投研助手 200 次 / 周期",
        "每月发放 50000 AI 使用额度",
      ],
      featuresEn: [
        "Includes all VIP features",
        "AI Watchlist Pool shows observation samples under the SVIP observation quota",
        "Higher quota for smart research, AI strategy generation and risk assessment",
        "For high-frequency and larger-capital investors: up to 6 AI Analysts and 3 initial rounds with administrator-approved MCP tools",
        "Quant Research Assistant: 200 conversations / cycle",
        "50000 AI usage credits issued monthly",
      ],
    },
    "svip-quarter": {
      name: "旗舰版·季付",
      nameEn: "SVIP Quarterly",
      desc: "一次购买 3 个月旗舰版，季付价格由管理员按月付价格与优惠率配置",
      descEn: "Three months of SVIP access. Quarterly pricing follows the admin configured monthly price and discount.",
      features: [
        "包含旗舰版全部能力",
        "有效期 90 天，享受季付优惠",
        "每月发放 50000 AI 使用额度",
        "高额度批量研究、AI 分析师和风险评估",
      ],
      featuresEn: [
        "Includes all SVIP capabilities",
        "90-day access with quarterly discount",
        "50000 AI usage credits issued monthly",
        "High-volume research, AI Analysts and risk assessment",
      ],
    },
    "svip-year": {
      name: "旗舰版·年付",
      nameEn: "SVIP Annual",
      desc: "面向高频和大资金投资者的年度高额度方案，按 10 个月价格计费",
      descEn: "Annual high-volume research capacity at ten monthly payments.",
      features: [
        "包含旗舰版全部能力",
        "有效期 365 天，价格相当于 10 个月月付",
        "每月发放 50000 AI 使用额度",
        "高额度批量研究、AI 分析师和风险评估",
      ],
      featuresEn: [
        "Includes all SVIP capabilities",
        "365-day access with two months saved",
        "50000 AI usage credits issued monthly",
        "High-volume research, AI Analysts and risk assessment",
      ],
    },
  };
  const preset = displays[String(plan.key || "").toLowerCase()];
  if (!preset) {
    return {
      name: plan.name,
      description: plan.description,
      features: plan.features || [],
    };
  }
  if (String(plan.key || "").toLowerCase() === "free") {
    const periodText = freePlanFeatureText(plan, viewKey, lt);
    return {
      name: lt(preset.name, preset.nameEn),
      description: periodText.description,
      features: periodText.features,
    };
  }
  return {
    name: lt(preset.name, preset.nameEn),
    description: lt(preset.desc, preset.descEn),
    features: lt(preset.features.join("\n"), preset.featuresEn.join("\n"))
      .split("\n")
      .filter(Boolean),
  };
}

function submitEpayPayment(result: any) {
  const url = String(result?.url || "");
  const data = result?.data || {};
  if (!url) return;
  sessionStorage.setItem(
    EPAY_CHECKOUT_STORAGE_KEY,
    JSON.stringify({
      url,
      data,
      local_callback_unreachable: Boolean(result?.local_callback_unreachable),
      order: result?.order || {},
      created_at: Date.now(),
    }),
  );
  const tradeNo = String(data?.out_trade_no || result?.order?.trade_no || "");
  window.location.href = `/payment/epay${tradeNo ? `?trade_no=${encodeURIComponent(tradeNo)}` : ""}`;
}

function SubscriptionSection() {
  const lt = useLangText();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [billing, setBilling] = useState<any>(null);
  const [siteSettings, setSiteSettings] = useState<PublicSiteSettings>(DEFAULT_PUBLIC_SITE_SETTINGS);
  const [provider, setProvider] = useState<"epay" | "stripe">("epay");
  const [epayMethod, setEpayMethod] = useState<EpayMethod>("alipay");
  const [selectedPlanView, setSelectedPlanView] = useState<SubscriptionPlanViewKey>("month");
  const [loading, setLoading] = useState(true);
  const [payingKey, setPayingKey] = useState("");
  const [rechargeAmountCents, setRechargeAmountCents] = useState(1000);
  const [recharging, setRecharging] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [rewardingProvider, setRewardingProvider] = useState("");
  const [msg, setMsg] = useState("");
  const epayMethodInitializedRef = useRef(false);

  const loadSubscriptionState = () => {
    setLoading(true);
    Promise.all([
      (api as any).getSubscriptionPlans(),
      (api as any).getSubscriptionSelf(),
    ])
      .then(([planPayload, selfPayload]) => {
        setPlans(Array.isArray(planPayload?.plans) ? planPayload.plans : []);
        setBilling(selfPayload || null);
        const presets = selfPayload?.billing?.recharge_presets_cents;
        if (Array.isArray(presets) && presets.length) {
          setRechargeAmountCents((current) =>
            presets.map(Number).includes(current) ? current : Number(presets[0]),
          );
        }
        setMsg(paymentReturnMessage(new URLSearchParams(window.location.search).get("pay"), lt));
      })
      .catch((e: any) => setMsg(e?.message || lt("订阅状态加载失败", "Failed to load subscription state")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSubscriptionState();
    api
      .getPublicSiteSettings()
      .then((payload: any) => setSiteSettings(normalizePublicSiteSettings(payload)))
      .catch(() => {});
  }, []);

  const activeKey = String(
    billing?.active_subscription?.plan_key || (billing?.role === "admin" ? "admin" : ""),
  ).trim().toLowerCase();
  const activeSubscription = billing?.active_subscription || null;
  const subscriptionExpiry = subscriptionExpiryText(activeSubscription, billing?.role, lt);
  const credit = billing?.credit_summary || {};
  const assistantQuota = billing?.assistant_quota || {};
  const paymentChannels = (billing?.payment_channels || {}) as Record<"epay" | "stripe", PaymentChannelStatus>;
  const availableProviders = (["epay", "stripe"] as const).filter(
    (key) => Boolean(paymentChannels?.[key]?.enabled),
  );
  const activeProvider = availableProviders.includes(provider)
    ? provider
    : availableProviders[0];
  const epayMethods = (
    Array.isArray(paymentChannels?.epay?.methods) && paymentChannels.epay.methods.length
      ? paymentChannels.epay.methods
      : EPAY_METHODS
  ).filter((method): method is EpayMethod => EPAY_METHODS.includes(method as EpayMethod));
  const activeEpayMethod = epayMethods.includes(epayMethod)
    ? epayMethod
    : ((paymentChannels?.epay?.default_method as EpayMethod) || epayMethods[0] || "alipay");
  const activePlan = plans.find(
    (plan) => String(plan.key || "").trim().toLowerCase() === activeKey,
  );
  const planQuotes = (billing?.plan_quotes || {}) as Record<string, SubscriptionQuote>;
  const billingConfig = billing?.billing || {};
  const enterprisePlanEnabled = Boolean(billingConfig?.enterprise_plan?.enabled);
  const creditRechargeEnabled = Boolean(billingConfig?.credit_recharge?.enabled);
  const subscriptionPlanViewOrder = enterprisePlanEnabled
    ? SUBSCRIPTION_PLAN_VIEW_ORDER
    : SUBSCRIPTION_PLAN_VIEW_ORDER.filter((key) => key !== "enterprise");
  const effectivePlanView =
    selectedPlanView === "enterprise" && !enterprisePlanEnabled ? "month" : selectedPlanView;
  const rewardedAds = billing?.rewarded_ads || {};
  const visiblePlanKeys = new Set([
    "free",
    "vip-trial",
    "vip-full-trial",
    "vip",
    "vip-quarter",
    "vip-year",
    "svip",
    "svip-quarter",
    "svip-year",
  ]);
  const visiblePlans = plans
    .filter((plan) => visiblePlanKeys.has(String(plan.key || "").toLowerCase()))
    .sort((a, b) => {
      const periodDiff = planPeriodRank(a) - planPeriodRank(b);
      if (periodDiff !== 0) return periodDiff;
      const tierOrder = { free: 0, vip: 1, svip: 2 } as Record<string, number>;
      const tierDiff = tierOrder[planTierClass(a)] - tierOrder[planTierClass(b)];
      if (tierDiff !== 0) return tierDiff;
      return Number(a.sort_order || 0) - Number(b.sort_order || 0);
    });
  const freePlan = visiblePlans.find((plan) => String(plan.key || "").toLowerCase() === "free");
  const planGroups = SUBSCRIPTION_PLAN_VIEW_ORDER.reduce(
    (acc, key) => {
      acc[key] = [];
      return acc;
    },
    {} as Record<SubscriptionPlanViewKey, SubscriptionPlan[]>,
  );
  visiblePlans.forEach((plan) => {
    const viewKey = planViewForPlan(plan);
    if (viewKey) planGroups[viewKey].push(plan);
  });
  const selectedPlans = effectivePlanView === "enterprise"
    ? []
    : [
        ...(freePlan ? [freePlan] : []),
        ...(planGroups[effectivePlanView] || []),
      ];
  const selectedPlanViewText = planViewText(effectivePlanView, lt);
  const enterpriseContacts = buildSiteContactItems(siteSettings, lt);
  const rechargeCredits = Math.floor(
    (Math.max(0, rechargeAmountCents) * Number(billingConfig.credits_per_cny || 100)) / 100,
  );
  const rechargePresets = Array.isArray(billingConfig.recharge_presets_cents)
    ? billingConfig.recharge_presets_cents.map(Number).filter((value: number) => value > 0)
    : [];
  const rechargeMinCents = Number(billingConfig.recharge_min_cents || 100);
  const rechargeMaxCents = Number(billingConfig.recharge_max_cents || 100000);
  const rechargeAmountInvalid =
    rechargeAmountCents < rechargeMinCents || rechargeAmountCents > rechargeMaxCents;
  const commerceEntryCount =
    (creditRechargeEnabled ? 1 : 0) + (rewardedAds?.available ? 1 : 0) + (!credit.unlimited ? 1 : 0);
  const hasMultipleCommerceEntries = commerceEntryCount > 1;
  const activePlanName =
    (activePlan ? planDisplayText(activePlan, lt).name : billing?.active_subscription?.plan_name) ||
    (billing?.role === "admin" ? lt("系统管理员", "Administrator") : lt("未订阅", "Not subscribed"));

  useEffect(() => {
    if (availableProviders.length && !availableProviders.includes(provider)) {
      setProvider(availableProviders[0]);
    }
  }, [availableProviders.join(","), provider]);

  useEffect(() => {
    const preferred = paymentChannels?.epay?.default_method as EpayMethod | undefined;
    if (!epayMethodInitializedRef.current && preferred && epayMethods.includes(preferred)) {
      epayMethodInitializedRef.current = true;
      setEpayMethod(preferred);
      return;
    }
    epayMethodInitializedRef.current = true;
    if (!epayMethods.includes(epayMethod)) {
      setEpayMethod(epayMethods[0] || "alipay");
    }
  }, [epayMethod, epayMethods.join(","), paymentChannels?.epay?.default_method]);

  useEffect(() => {
    const currentView = activePlan ? planViewForPlan(activePlan) : null;
    if (currentView && selectedPlanView !== currentView) {
      setSelectedPlanView(currentView);
    }
  }, [activePlan?.key]);

  useEffect(() => {
    if (!enterprisePlanEnabled && selectedPlanView === "enterprise") {
      setSelectedPlanView("month");
    }
  }, [enterprisePlanEnabled, selectedPlanView]);

  const launchPayment = async (plan: SubscriptionPlan) => {
    const quote = planQuotes[String(plan.id)];
    if (!plan.price_cents) {
      setMsg(lt("免费额度由系统按账号角色自动发放。", "Free quota is assigned automatically by account role."));
      return;
    }
    if (quote && !quote.eligible) {
      setMsg(quote.reason || lt("当前套餐暂不可购买。", "This plan is currently unavailable."));
      return;
    }
    if (!activeProvider) {
      setMsg(lt("暂时未设置支付方式，请联系系统管理员。", "Payment is not configured yet. Contact the administrator."));
      return;
    }
    setPayingKey(plan.key);
    setMsg("");
    try {
      const returnUrl = `${window.location.origin}/settings?tab=subscription`;
      if (activeProvider === "stripe") {
        const result: any = await (api as any).createStripeSubscriptionPayment({
          plan_id: plan.id,
          return_url: returnUrl,
        });
        const payLink = result?.data?.pay_link;
        if (result?.message === "completed") {
          setMsg(lt("套餐已完成升级。", "Plan upgraded successfully."));
          loadSubscriptionState();
          return;
        }
        if (!payLink) throw new Error(lt("支付链接未返回", "Payment link was not returned"));
        window.location.href = payLink;
      } else {
        const result: any = await (api as any).createEpaySubscriptionPayment({
          plan_id: plan.id,
          payment_method: activeEpayMethod,
        });
        if (result?.message === "completed") {
          setMsg(lt("套餐已完成升级。", "Plan upgraded successfully."));
          loadSubscriptionState();
          return;
        }
        submitEpayPayment(result);
      }
    } catch (e: any) {
      setMsg(e?.message || lt("拉起支付失败", "Failed to launch payment"));
    } finally {
      setPayingKey("");
    }
  };

  const launchRecharge = async () => {
    if (!activeProvider) {
      setMsg(lt("暂时未设置支付方式，请联系系统管理员。", "Payment is not configured yet. Contact the administrator."));
      return;
    }
    setRecharging(true);
    setMsg("");
    try {
      const returnUrl = `${window.location.origin}/settings?tab=subscription`;
      if (activeProvider === "stripe") {
        const result: any = await (api as any).createStripeCreditRecharge({
          amount_cents: rechargeAmountCents,
          return_url: returnUrl,
        });
        const payLink = result?.data?.pay_link;
        if (!payLink) throw new Error(lt("支付链接未返回", "Payment link was not returned"));
        window.location.href = payLink;
      } else {
        const result: any = await (api as any).createEpayCreditRecharge({
          amount_cents: rechargeAmountCents,
          payment_method: activeEpayMethod,
        });
        submitEpayPayment(result);
      }
    } catch (error: any) {
      setMsg(error?.message || lt("AI 额度补充支付失败", "Credit recharge checkout failed"));
    } finally {
      setRecharging(false);
    }
  };

  const redeemSubscription = async () => {
    const code = redeemCode.trim();
    if (!code) {
      setMsg(lt("请输入兑换码。", "Enter a redeem code."));
      return;
    }
    setRedeeming(true);
    setMsg("");
    try {
      const result: any = await (api as any).redeemSubscriptionCode({ code });
      if (result?.subscription_state) {
        setBilling(result.subscription_state);
      } else {
        loadSubscriptionState();
      }
      setRedeemCode("");
      setMsg(result?.message || lt("兑换成功，订阅权益已更新。", "Redeemed. Subscription benefits updated."));
    } catch (error: any) {
      setMsg(error?.message || lt("兑换失败，请检查兑换码。", "Redeem failed. Check the code."));
    } finally {
      setRedeeming(false);
    }
  };

  const launchRewardAd = async (providerKey: string) => {
    setRewardingProvider(providerKey);
    setMsg("");
    try {
      const session: any = await (api as any).createRewardAdSession({ provider: providerKey });
      if (session?.launch_mode === "google_gpt") {
        await presentGoogleRewardedAd(
          String(session?.provider_config?.ad_unit_path || ""),
          {
            sdkLoadFailed: lt("Google 奖励广告组件加载失败", "Google Rewarded Ads failed to load"),
            placementMissing: lt("Google 奖励广告位未配置", "Google Rewarded Ads placement is not configured"),
            unsupported: lt("当前设备或广告位不支持奖励广告", "Rewarded ads are not supported on this device or placement"),
            notCompleted: lt("广告未完整观看，本次不发放额度", "The ad was not completed, so no credits were awarded"),
            unavailable: lt("广告暂未填充，请稍后再试", "No rewarded ad is available right now"),
          },
        );
        const completed: any = await (api as any).completeRewardAdSession({
          session_token: session.session_token,
        });
        setMsg(
          lt(
            `广告观看完成，已获得 ${completed?.credits_awarded || session.reward_credits} 额度。`,
            `Ad completed. ${completed?.credits_awarded || session.reward_credits} credits awarded.`,
          ),
        );
        loadSubscriptionState();
        return;
      }
      const launchUrl = String(session?.provider_config?.launch_url || "");
      if (!launchUrl) throw new Error(lt("广告跳转地址未配置", "Ad launch URL is not configured"));
      const target = new URL(launchUrl);
      target.searchParams.set("session_token", session.session_token);
      target.searchParams.set("placement_id", String(session?.provider_config?.placement_id || ""));
      window.open(target.toString(), "_blank", "noopener,noreferrer");
      setMsg(lt("广告已打开，平台回调确认后额度会自动到账。", "Ad opened. Credits arrive after provider callback verification."));
    } catch (error: any) {
      setMsg(error?.message || lt("广告暂不可用，请稍后再试", "Rewarded ad is unavailable. Try again later."));
    } finally {
      setRewardingProvider("");
    }
  };

  return (
    <div className="settings-section settings-subscription-section">
      <div className="settings-section-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--primary)" }}
          >
            card_membership
          </span>
          <h2>{lt("订阅方案", "Subscription Plans")}</h2>
        </div>
        <p>{lt("订阅状态、AI 使用额度和支付入口均由后端管理。", "Plans, AI usage quota and checkout are backend-managed.")}</p>
      </div>

      <div className="settings-subscription-status">
        <div className="settings-subscription-status-main">
          <span>{lt("当前订阅", "Current Plan")}</span>
          <strong>{activePlanName}</strong>
          <small>
            {credit.unlimited
              ? lt("系统管理员无限额度", "Admin unlimited credits")
              : lt("按订阅周期发放 AI 使用额度", "AI usage quota renews by subscription cycle")}
          </small>
        </div>
        <div className="settings-subscription-meter">
          <span>{lt("可用额度", "Available Credits")}</span>
          <strong>
            {credit.unlimited
              ? "∞"
              : `${credit.credits_remaining ?? "—"} / ${credit.credits_total ?? "—"}`}
          </strong>
          {!credit.unlimited && (
            <small>
              {lt("已使用", "Used")} {credit.credits_used ?? 0}
            </small>
          )}
        </div>
        <div className="settings-subscription-meter">
          <span>{lt("助手对话", "Assistant Chats")}</span>
          <strong>
            {assistantQuota.unlimited
              ? "∞"
              : `${assistantQuota.remaining ?? "—"} / ${assistantQuota.limit ?? "—"}`}
          </strong>
          {!assistantQuota.unlimited && (
            <small>
              {lt("已使用", "Used")} {assistantQuota.used ?? 0}
            </small>
          )}
        </div>
        <div className="settings-subscription-meter settings-subscription-expiry">
          <span>{lt("套餐有效期", "Plan Expiry")}</span>
          <strong>{subscriptionExpiry.value}</strong>
          <small>{subscriptionExpiry.hint}</small>
        </div>
        <div className="settings-subscription-pay-state">
          <span>{lt("支付通道", "Payment Channels")}</span>
          <strong className={availableProviders.length ? "ready" : "empty"}>
            {availableProviders.length
              ? availableProviders
                  .map((key) => paymentProviderLabel(key))
                  .join(" / ")
              : lt("暂未设置", "Not configured")}
          </strong>
          <small>
            {availableProviders.length
              ? lt("订阅时将自动跳转可用通道", "Checkout uses the available channel")
              : lt("管理员配置支付后可订阅", "Subscribe after admin enables payment")}
          </small>
        </div>
        <button className="figma-btn" type="button" onClick={loadSubscriptionState}>
          {lt("刷新状态", "Refresh")}
        </button>
      </div>

      <div className="settings-subscription-controls">
        <div className="settings-subscription-payment-controls">
          {availableProviders.length > 0 && (
            <div className="settings-subscription-control-group provider">
              <span>{lt("支付方式", "Payment Method")}</span>
              <div className="settings-subscription-segmented" role="group" aria-label={lt("支付方式", "Payment method")}>
                {availableProviders.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={activeProvider === key ? "active" : ""}
                    onClick={() => setProvider(key)}
                  >
                    {paymentProviderLabel(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeProvider === "epay" && epayMethods.length > 0 && (
            <div className="settings-subscription-control-group provider checkout-method">
              <span>{lt("付款方式", "Checkout Method")}</span>
              <div className="settings-subscription-segmented settings-epay-methods" role="group" aria-label={lt("付款方式", "Checkout method")}>
                {epayMethods.map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={activeEpayMethod === method ? "active" : ""}
                    onClick={() => setEpayMethod(method)}
                  >
                    {epayMethodLabel(method, lt)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="settings-plan-switch-layout">
        <aside className="settings-plan-period-rail" aria-label={lt("方案周期", "Plan period")}>
          {subscriptionPlanViewOrder.map((viewKey) => {
            const viewText = planViewText(viewKey, lt);
            const count = viewKey === "enterprise"
              ? 1
              : Number(planGroups[viewKey]?.length || 0) + (freePlan ? 1 : 0);
            return (
              <button
                key={viewKey}
                type="button"
                className={effectivePlanView === viewKey ? "active" : ""}
                onClick={() => setSelectedPlanView(viewKey)}
              >
                <span className="material-symbols-outlined">{viewText.icon}</span>
                <span>
                  <strong>{viewText.label}</strong>
                  <small>
                    {viewKey === "enterprise"
                      ? lt("业务开通", "Consultation")
                      : count > 0
                        ? lt(`${count} 档对比`, `${count} tiers`)
                        : lt("暂无方案", "No plans")}
                  </small>
                </span>
              </button>
            );
          })}
        </aside>

        <section className="settings-plan-period-content">
          <div className="settings-plan-period-header">
            <span className="settings-plan-badge">{selectedPlanViewText.label}</span>
            <h3>{selectedPlanViewText.label}</h3>
            <p>{selectedPlanViewText.description}</p>
          </div>

          {effectivePlanView === "enterprise" && enterprisePlanEnabled ? (
            <div className="settings-enterprise-panel">
              <div>
                <span className="settings-plan-badge">{lt("企业版", "Enterprise")}</span>
                <h3>{lt("企业版·定制服务", "Enterprise Custom Service")}</h3>
                <p>
                  {lt(
                    "面向更大规模服务、私有部署、专属数据源、多人权限和定制投研流程，需由业务沟通后进行开通。",
                    "For larger-scale service, private deployment, dedicated data sources, team permissions and custom research workflows. Activation requires business consultation.",
                  )}
                </p>
              </div>
              <div className="settings-enterprise-features">
                {[
                  lt("专属模型和数据源接入", "Dedicated model and data integrations"),
                  lt("私有化部署与合规配置", "Private deployment and compliance setup"),
                  lt("多人账号、权限和审计支持", "Multi-user accounts, permissions and audit support"),
                ].map((item) => (
                  <span key={item}>
                    <span className="material-symbols-outlined">check_circle</span>
                    {item}
                  </span>
                ))}
              </div>
              <div className="settings-enterprise-contact-block">
                <strong>{lt("咨询方式", "Contact")}</strong>
                {enterpriseContacts.length > 0 ? (
                  <div className="settings-enterprise-contacts">
                    {enterpriseContacts.map(({ key, label, Icon, value, href }) => {
                      const target = href(value);
                      const content = <><Icon aria-hidden="true" /><span>{label}</span><b>{value}</b></>;
                      return target ? (
                        <a key={key} href={target} target="_blank" rel="noreferrer">{content}</a>
                      ) : (
                        <div key={key}>{content}</div>
                      );
                    })}
                  </div>
                ) : (
                  <p>
                    {lt(
                      "暂未配置公开联系方式，请系统管理员在站点设置中维护。",
                      "No public contact is configured. Administrators can add it in Site Settings.",
                    )}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="settings-plan-grid">
              {(loading ? [] : selectedPlans).map((plan) => {
                const isCurrent = activeKey === String(plan.key || "").trim().toLowerCase();
                const visualTier = planVisualTierClass(plan);
                const isFreePlan = String(plan.key || "").toLowerCase() === "free";
                const display = planDisplayText(plan, lt, effectivePlanView);
                const quote = planQuotes[String(plan.id)];
                const quoteBlocked = Boolean(plan.price_cents && quote && !quote.eligible);
                const hasUpgradeDiscount = Boolean(
                  quote?.eligible &&
                  quote?.is_upgrade &&
                  Number(quote.credit_cents || 0) > 0,
                );
                const payableCents = quote?.eligible
                  ? Number(quote.amount_cents ?? plan.price_cents)
                  : Number(plan.price_cents || 0);
                return (
                  <div
                    key={plan.key}
                    className={`settings-plan-card settings-plan-card-${visualTier} ${isCurrent ? "current" : ""}`}
                  >
                    <div className="settings-plan-card-head">
                      <div>
                        <span className="settings-plan-badge">{planBadge(plan, isCurrent, lt)}</span>
                        <h3>{display.name}</h3>
                        <p>{display.description}</p>
                      </div>
                      <span className="material-symbols-outlined">
                        {visualTier === "svip" ? "workspace_premium" : visualTier === "vip" ? "verified" : "person"}
                      </span>
                    </div>
                    {isCurrent && (
                      <div className="settings-plan-current-state" role="status">
                        <span><span className="material-symbols-outlined">check_circle</span>{lt("套餐使用中", "Plan in use")}</span>
                        <strong>{subscriptionExpiry}</strong>
                      </div>
                    )}
                    <div className={`settings-plan-price ${hasUpgradeDiscount ? "discounted" : ""}`}>
                      {hasUpgradeDiscount && <del>{formatPlanPrice(plan, lt)}</del>}
                      <strong>
                        {hasUpgradeDiscount
                          ? `${formatCnyCents(payableCents)} ${lt("应付", "due")}`
                          : formatPlanPrice(plan, lt)}
                      </strong>
                    </div>
                    <p className="settings-plan-credit">
                      {planCreditText(plan, effectivePlanView, lt)}
                    </p>
                    {quote?.eligible && (quote.is_upgrade || quote.is_renewal) && (
                      <div className="settings-plan-quote">
                        {quote.is_upgrade && (
                          <span>
                            {lt("剩余订阅抵扣", "Unused plan credit")} {formatCnyCents(quote.credit_cents)}
                          </span>
                        )}
                        {quote.is_renewal && <span>{lt("续费将从当前到期日顺延", "Renewal extends from the current expiry date")}</span>}
                        {Number(quote.carryover_credits || 0) > 0 && (
                          <span>
                            {lt("结转剩余额度", "Carry over credits")} {quote.carryover_credits}
                          </span>
                        )}
                      </div>
                    )}
                    {quoteBlocked && <p className="settings-plan-unavailable">{quote?.reason}</p>}
                    <div className="settings-plan-feature-list">
                      {(display.features || []).map((f, i) => (
                        <div key={i}>
                          <span className="material-symbols-outlined">check_circle</span>
                          {f}
                        </div>
                      ))}
                    </div>
                    <button
                      className={`figma-btn settings-plan-action ${isCurrent ? "current" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void launchPayment(plan);
                      }}
                      disabled={
                        isCurrent ||
                        payingKey === plan.key ||
                        plan.price_cents === 0 ||
                        quoteBlocked ||
                        billing?.role === "admin"
                      }
                    >
                      {isCurrent
                        ? lt("使用中", "In Use")
                        : payingKey === plan.key
                        ? lt("拉起支付...", "Opening checkout...")
                        : plan.price_cents === 0
                          ? isCurrent
                            ? lt("当前免费版", "Current Free Plan")
                            : isFreePlan
                              ? lt("免费自动发放", "Granted automatically")
                              : lt("免费额度", "Free Allowance")
                          : quote?.is_renewal
                            ? lt("续费当前方案", "Renew Current Plan")
                            : quote?.is_upgrade
                              ? lt("补差价升级", "Upgrade for the Difference")
                              : quoteBlocked
                                ? lt("暂不可购买", "Unavailable")
                                : lt(`订阅${display.name}`, `Subscribe ${display.name}`)}
                    </button>
                  </div>
                );
              })}
              {loading && <p style={{ color: "var(--text-muted)" }}>{lt("订阅加载中...", "Loading subscriptions...")}</p>}
              {!loading && selectedPlans.length === 0 && (
                <p className="settings-subscription-empty">
                  {lt("当前分类暂无可用订阅方案。", "No plans are available in this category.")}
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {!credit.unlimited && (
        <div className={`settings-subscription-commerce ${hasMultipleCommerceEntries ? "has-reward" : ""}`}>
          <section className="settings-subscription-commerce-card redeem">
            <div className="settings-commerce-card-head">
              <div>
                <span className="material-symbols-outlined">redeem</span>
                <div>
                  <h3>{lt("兑换码兑换", "Redeem Code")}</h3>
                  <p>
                    {lt(
                      "输入管理员发放的兑换码，可直接升级订阅套餐或领取权益额度。",
                      "Enter an administrator-issued code to upgrade your plan or claim benefits.",
                    )}
                  </p>
                </div>
              </div>
              <strong>{lt("权益到账", "Instant")}</strong>
            </div>
            <div className="settings-redeem-checkout">
              <input
                className="figma-input"
                value={redeemCode}
                placeholder={lt("输入兑换码", "Enter redeem code")}
                onChange={(event) => setRedeemCode(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void redeemSubscription();
                }}
              />
              <button
                className="figma-btn figma-btn-primary"
                type="button"
                disabled={redeeming || !redeemCode.trim()}
                onClick={redeemSubscription}
              >
                {redeeming ? lt("兑换中...", "Redeeming...") : lt("立即兑换", "Redeem")}
              </button>
            </div>
          </section>

          {creditRechargeEnabled && (
            <section className="settings-subscription-commerce-card recharge">
              <div className="settings-commerce-card-head">
                <div>
                  <span className="material-symbols-outlined">toll</span>
                  <div>
                    <h3>{lt("AI 额度补充", "AI Usage Top-up")}</h3>
                    <p>
                      {lt(
                        "补充额度用于高消耗 AI 功能，实际到账额度以下方预估为准。",
                        "Top-up quota is used by higher-cost AI features. The estimated received quota is shown below.",
                      )}
                    </p>
                  </div>
                </div>
                <strong>{rechargeCredits.toLocaleString()} {lt("额度", "credits")}</strong>
              </div>

              {rechargePresets.length > 0 && (
                <div className="settings-recharge-presets">
                  {rechargePresets.map((amount: number) => (
                    <button
                      key={amount}
                      type="button"
                      className={rechargeAmountCents === amount ? "active" : ""}
                      onClick={() => setRechargeAmountCents(amount)}
                    >
                      {formatCnyCents(amount, amount % 100 === 0 ? 0 : 2)}
                    </button>
                  ))}
                </div>
              )}

              <div className="settings-recharge-checkout">
                <label>
                  <span>{lt("充值金额", "Recharge Amount")}</span>
                  <div className="settings-recharge-input">
                    <span>￥</span>
                    <input
                      type="number"
                      min={rechargeMinCents / 100}
                      max={rechargeMaxCents / 100}
                      step="0.01"
                      value={rechargeAmountCents / 100}
                      onChange={(event) =>
                        setRechargeAmountCents(Math.max(0, Math.round(Number(event.target.value || 0) * 100)))
                      }
                    />
                  </div>
                  <small>
                    {lt("可充值范围", "Allowed range")} {formatCnyCents(rechargeMinCents)} - {formatCnyCents(rechargeMaxCents)}
                  </small>
                </label>
                <button
                  className="figma-btn figma-btn-primary"
                  type="button"
                  onClick={launchRecharge}
                  disabled={recharging || rechargeAmountInvalid || !activeProvider}
                >
                  {recharging ? lt("拉起支付...", "Opening checkout...") : lt("补充 AI 额度", "Top Up AI Credits")}
                </button>
              </div>
              {!activeProvider && (
                <p className="settings-commerce-note">
                  {lt("管理员尚未配置支付通道，暂时无法充值。", "No payment channel is configured, so recharge is temporarily unavailable.")}
                </p>
              )}
            </section>
          )}

          {rewardedAds?.available && (
            <section className="settings-subscription-commerce-card reward">
              <div className="settings-commerce-card-head">
                <div>
                  <span className="material-symbols-outlined">smart_display</span>
                  <div>
                    <h3>{lt("观看广告得额度", "Watch Ads for Credits")}</h3>
                    <p>{lt("仅完整观看奖励广告后发放额度。", "Credits are granted only after the rewarded ad completes.")}</p>
                  </div>
                </div>
                <strong>+{rewardedAds.reward_credits || 0} {lt("额度/次", "credits/ad")}</strong>
              </div>
              <div className="settings-reward-progress">
                <span>
                  {lt("今日已完成", "Completed today")} {rewardedAds.completed_today || 0} / {rewardedAds.daily_limit || 0}
                </span>
                <span>
                  {lt("剩余", "Remaining")} {rewardedAds.remaining_today || 0}
                </span>
              </div>
              <div className="settings-reward-provider-list">
                {(rewardedAds.providers || []).map((item: any) => (
                  <button
                    key={item.key}
                    className="figma-btn"
                    type="button"
                    disabled={
                      rewardingProvider === item.key ||
                      Number(rewardedAds.remaining_today || 0) <= 0
                    }
                    onClick={() => launchRewardAd(item.key)}
                  >
                    {rewardingProvider === item.key
                      ? lt("正在打开广告...", "Opening ad...")
                      : lt(`使用 ${item.label}`, `Use ${item.label}`)}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {msg && <p style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>{msg}</p>}
    </div>
  );
}

function RedeemCodesSection() {
  const lt = useLangText();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [codes, setCodes] = useState<RedeemCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingCode, setEditingCode] = useState<RedeemCodeRecord | null>(null);
  const [form, setForm] = useState<RedeemCodeForm>(EMPTY_REDEEM_FORM);
  const [confirmDisable, setConfirmDisable] = useState<RedeemCodeRecord | null>(null);
  const [detailCode, setDetailCode] = useState<RedeemCodeRecord | null>(null);
  const [uses, setUses] = useState<any[]>([]);
  const [loadingUses, setLoadingUses] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      (api as any).getAdminSubscriptionPlans(),
      (api as any).listAdminRedeemCodes(),
    ])
      .then(([planPayload, codePayload]) => {
        const nextPlans = Array.isArray(planPayload?.plans) ? planPayload.plans : [];
        setPlans(nextPlans);
        setCodes(Array.isArray(codePayload?.codes) ? codePayload.codes : []);
      })
      .catch((error: any) => setMsg(error?.message || lt("兑换码加载失败", "Failed to load redeem codes")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditingCode(null);
    setForm({
      ...EMPTY_REDEEM_FORM,
      plan_id: plans[0]?.id ? String(plans[0].id) : "",
    });
    setModalMode("create");
    setMsg("");
  };

  const openEdit = (row: RedeemCodeRecord) => {
    setEditingCode(row);
    setForm({
      code: row.code || "",
      plan_id: row.plan_id ? String(row.plan_id) : "",
      credits: row.credits ? String(row.credits) : "",
      duration_days: row.duration_days ? String(row.duration_days) : "",
      max_uses: String(row.max_uses || 1),
      per_user_limit: String(row.per_user_limit || 1),
      enabled: row.enabled !== false,
      description: row.description || "",
      starts_at: dateTimeInputValue(row.starts_at),
      expires_at: dateTimeInputValue(row.expires_at),
    });
    setModalMode("edit");
    setMsg("");
  };

  const selectedPlan = plans.find((plan) => String(plan.id) === String(form.plan_id));

  const saveCode = async () => {
    if (!form.plan_id) {
      setMsg(lt("请选择兑换码关联套餐。", "Select the plan for this code."));
      return;
    }
    const payload = {
      code: form.code.trim() || undefined,
      plan_id: Number(form.plan_id),
      credits: form.credits ? Number(form.credits) : undefined,
      duration_days: form.duration_days ? Number(form.duration_days) : undefined,
      max_uses: Math.max(1, Number(form.max_uses || 1)),
      per_user_limit: Math.max(1, Number(form.per_user_limit || 1)),
      enabled: form.enabled,
      description: form.description,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
    setSaving(true);
    setMsg("");
    try {
      if (modalMode === "edit" && editingCode) {
        await (api as any).updateAdminRedeemCode(editingCode.id, payload);
        setMsg(lt("兑换码已更新。", "Redeem code updated."));
      } else {
        await (api as any).createAdminRedeemCode(payload);
        setMsg(lt("兑换码已创建。", "Redeem code created."));
      }
      setModalMode(null);
      setEditingCode(null);
      loadData();
    } catch (error: any) {
      setMsg(error?.message || lt("保存兑换码失败", "Failed to save redeem code"));
    } finally {
      setSaving(false);
    }
  };

  const disableCode = async () => {
    if (!confirmDisable) return;
    setSaving(true);
    setMsg("");
    try {
      await (api as any).disableAdminRedeemCode(confirmDisable.id);
      setMsg(lt("兑换码已停用。", "Redeem code disabled."));
      setConfirmDisable(null);
      loadData();
    } catch (error: any) {
      setMsg(error?.message || lt("停用兑换码失败", "Failed to disable redeem code"));
    } finally {
      setSaving(false);
    }
  };

  const openUses = async (row: RedeemCodeRecord) => {
    setDetailCode(row);
    setUses([]);
    setLoadingUses(true);
    try {
      const payload: any = await (api as any).listAdminRedeemCodeUses(row.id);
      setUses(Array.isArray(payload?.uses) ? payload.uses : []);
    } catch (error: any) {
      setMsg(error?.message || lt("使用明细加载失败", "Failed to load usage details"));
    } finally {
      setLoadingUses(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard?.writeText(code);
      setMsg(lt("兑换码已复制。", "Redeem code copied."));
    } catch {
      setMsg(code);
    }
  };

  return (
    <div className="settings-section settings-redeem-section">
      <div className="settings-section-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="material-symbols-outlined" style={{ color: "var(--primary)" }}>
            confirmation_number
          </span>
          <h2>{lt("兑换码", "Redeem Codes")}</h2>
        </div>
        <p>
          {lt(
            "由系统管理员生成并分发兑换码，用户可在订阅页兑换对应套餐权益。",
            "Administrators issue codes that users redeem on the subscription page.",
          )}
        </p>
      </div>

      <div className="settings-redeem-toolbar">
        <button className="figma-btn figma-btn-primary" type="button" onClick={openCreate}>
          <span className="material-symbols-outlined">add</span>
          {lt("新增兑换码", "New Code")}
        </button>
        <button className="figma-btn" type="button" onClick={loadData} disabled={loading}>
          <span className="material-symbols-outlined">refresh</span>
          {loading ? lt("刷新中...", "Refreshing...") : lt("刷新", "Refresh")}
        </button>
      </div>

      <div className="settings-redeem-table-wrap">
        <table className="figma-table">
          <thead>
            <tr>
              <th>{lt("兑换码", "Code")}</th>
              <th>{lt("套餐", "Plan")}</th>
              <th>{lt("额度/天数", "Credits / Days")}</th>
              <th>{lt("使用进度", "Usage")}</th>
              <th>{lt("有效期", "Validity")}</th>
              <th>{lt("状态", "Status")}</th>
              <th>{lt("操作", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((row) => (
              <tr key={row.id}>
                <td>
                  <button className="settings-redeem-code-copy" type="button" onClick={() => copyCode(row.code)}>
                    {row.code}
                  </button>
                  {row.description && <small>{row.description}</small>}
                </td>
                <td>
                  <strong>{row.plan_name || row.plan_key || "-"}</strong>
                  <small>{roleText(row.plan_role, lt)}</small>
                </td>
                <td>
                  <strong>{Number(row.credits || 0).toLocaleString()} {lt("额度", "credits")}</strong>
                  <small>{row.duration_days || "-"} {lt("天", "days")}</small>
                </td>
                <td>
                  <strong>{row.used_count || 0} / {row.max_uses || 1}</strong>
                  <small>{lt("单用户", "Per user")} {row.per_user_limit || 1}</small>
                </td>
                <td>
                  <small>{lt("开始", "Start")} {formatSettingsDateTime(row.starts_at)}</small>
                  <small>{lt("结束", "End")} {formatSettingsDateTime(row.expires_at)}</small>
                </td>
                <td>
                  <span className={`settings-redeem-status ${row.enabled ? "active" : "disabled"}`}>
                    {row.enabled ? lt("启用", "Enabled") : lt("停用", "Disabled")}
                  </span>
                </td>
                <td>
                  <div className="settings-redeem-actions">
                    <button className="figma-btn" type="button" onClick={() => openUses(row)}>
                      {lt("明细", "Details")}
                    </button>
                    <button className="figma-btn" type="button" onClick={() => openEdit(row)}>
                      {lt("编辑", "Edit")}
                    </button>
                    <button
                      className="figma-btn"
                      type="button"
                      disabled={!row.enabled}
                      onClick={() => setConfirmDisable(row)}
                    >
                      {lt("停用", "Disable")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && codes.length === 0 && (
              <tr>
                <td colSpan={7}>{lt("暂无兑换码。", "No redeem codes yet.")}</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7}>{lt("兑换码加载中...", "Loading redeem codes...")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <p className="settings-redeem-message">{msg}</p>}

      {modalMode && (
        <div className="settings-redeem-modal-backdrop" role="dialog" aria-modal="true">
          <div className="settings-redeem-modal">
            <header>
              <div>
                <h3>{modalMode === "edit" ? lt("编辑兑换码", "Edit Redeem Code") : lt("新增兑换码", "New Redeem Code")}</h3>
                <p>
                  {lt(
                    "未填写兑换码时系统会自动生成；额度和有效期留空时按所选套餐默认值处理。",
                    "Leave the code empty to auto-generate it. Empty credits and duration use the selected plan defaults.",
                  )}
                </p>
              </div>
              <button className="figma-btn" type="button" onClick={() => setModalMode(null)}>×</button>
            </header>
            <div className="settings-redeem-form-grid">
              <label>
                <span>{lt("兑换码", "Code")}</span>
                <input
                  className="figma-input"
                  value={form.code}
                  placeholder={lt("留空自动生成", "Auto-generate if empty")}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                />
              </label>
              <label>
                <span>{lt("关联套餐", "Plan")}</span>
                <select
                  className="figma-input"
                  value={form.plan_id}
                  onChange={(event) => setForm({ ...form, plan_id: event.target.value })}
                >
                  <option value="">{lt("请选择套餐", "Select a plan")}</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {roleText(plan.role, lt)} · {Number(plan.credits || 0).toLocaleString()} {lt("额度", "credits")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{lt("发放额度", "Credits")}</span>
                <input
                  className="figma-input"
                  type="number"
                  min={0}
                  value={form.credits}
                  placeholder={selectedPlan ? String(selectedPlan.credits || 0) : "0"}
                  onChange={(event) => setForm({ ...form, credits: event.target.value })}
                />
              </label>
              <label>
                <span>{lt("有效天数", "Duration Days")}</span>
                <input
                  className="figma-input"
                  type="number"
                  min={1}
                  value={form.duration_days}
                  placeholder={selectedPlan ? String(selectedPlan.duration_days || 30) : "30"}
                  onChange={(event) => setForm({ ...form, duration_days: event.target.value })}
                />
              </label>
              <label>
                <span>{lt("总可用次数", "Max Uses")}</span>
                <input
                  className="figma-input"
                  type="number"
                  min={1}
                  value={form.max_uses}
                  onChange={(event) => setForm({ ...form, max_uses: event.target.value })}
                />
              </label>
              <label>
                <span>{lt("单用户可用次数", "Per-user Limit")}</span>
                <input
                  className="figma-input"
                  type="number"
                  min={1}
                  value={form.per_user_limit}
                  onChange={(event) => setForm({ ...form, per_user_limit: event.target.value })}
                />
              </label>
              <label>
                <span>{lt("开始时间", "Start Time")}</span>
                <input
                  className="figma-input"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(event) => setForm({ ...form, starts_at: event.target.value })}
                />
              </label>
              <label>
                <span>{lt("结束时间", "End Time")}</span>
                <input
                  className="figma-input"
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(event) => setForm({ ...form, expires_at: event.target.value })}
                />
              </label>
              <label className="settings-redeem-form-wide">
                <span>{lt("说明", "Description")}</span>
                <textarea
                  className="figma-input"
                  rows={3}
                  value={form.description}
                  placeholder={lt("例如：活动赠送专业版 30 天", "Example: campaign gift, 30-day Pro")}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </label>
              <label className="settings-redeem-toggle">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                />
                <span>{lt("启用兑换码", "Enable this code")}</span>
              </label>
            </div>
            <footer>
              <button className="figma-btn" type="button" onClick={() => setModalMode(null)}>
                {lt("取消", "Cancel")}
              </button>
              <button className="figma-btn figma-btn-primary" type="button" onClick={saveCode} disabled={saving}>
                {saving ? lt("保存中...", "Saving...") : lt("保存兑换码", "Save Code")}
              </button>
            </footer>
          </div>
        </div>
      )}

      {confirmDisable && (
        <div className="settings-redeem-modal-backdrop" role="dialog" aria-modal="true">
          <div className="settings-redeem-confirm">
            <h3>{lt("停用兑换码", "Disable Redeem Code")}</h3>
            <p>
              {lt("确认停用", "Confirm disabling")} <strong>{confirmDisable.code}</strong>
              {lt("？停用后用户将无法继续兑换。", "? Users will no longer be able to redeem it.")}
            </p>
            <footer>
              <button className="figma-btn" type="button" onClick={() => setConfirmDisable(null)}>
                {lt("取消", "Cancel")}
              </button>
              <button className="figma-btn figma-btn-primary" type="button" onClick={disableCode} disabled={saving}>
                {saving ? lt("处理中...", "Processing...") : lt("确认停用", "Disable")}
              </button>
            </footer>
          </div>
        </div>
      )}

      {detailCode && (
        <div className="settings-redeem-modal-backdrop" role="dialog" aria-modal="true">
          <div className="settings-redeem-modal settings-redeem-detail-modal">
            <header>
              <div>
                <h3>{lt("兑换明细", "Redeem Details")}</h3>
                <p>{detailCode.code} · {detailCode.plan_name || detailCode.plan_key}</p>
              </div>
              <button className="figma-btn" type="button" onClick={() => setDetailCode(null)}>×</button>
            </header>
            <div className="settings-redeem-uses-list">
              {loadingUses && <p>{lt("明细加载中...", "Loading details...")}</p>}
              {!loadingUses && uses.length === 0 && <p>{lt("暂无兑换记录。", "No redeem records.")}</p>}
              {!loadingUses && uses.map((item) => (
                <div key={item.id} className="settings-redeem-use-row">
                  <div>
                    <strong>{item.username || `${lt("用户", "User")} #${item.user_id}`}</strong>
                    <small>{formatSettingsDateTime(item.created_at)}</small>
                  </div>
                  <span>{Number(item?.meta?.credits || 0).toLocaleString()} {lt("额度", "credits")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const HOMEPAGE_AD_PLATFORM_LABELS_ZH: Record<HomepageAdPlatform, string> = {
  direct: "直客/自营",
  pangle: "穿山甲",
  tencent_ylh: "腾讯优量汇",
  baidu_bqt: "百度百青藤",
  kuaishou: "快手联盟",
  gromore: "GroMore 聚合",
  topon: "TopOn 聚合",
  tradplus: "TradPlus 聚合",
  other: "其它平台",
};

const HOMEPAGE_AD_PLATFORM_LABELS_EN: Record<HomepageAdPlatform, string> = {
  direct: "Direct",
  pangle: "Pangle",
  tencent_ylh: "Tencent Youlianghui",
  baidu_bqt: "Baidu Union",
  kuaishou: "Kuaishou Union",
  gromore: "GroMore Mediation",
  topon: "TopOn Mediation",
  tradplus: "TradPlus Mediation",
  other: "Other",
};

const HOMEPAGE_AD_FORMAT_LABELS_ZH: Record<HomepageAdFormat, string> = {
  markdown: "Markdown",
  html: "HTML",
  svg: "SVG",
};

const HOMEPAGE_AD_FORMAT_LABELS_EN: Record<HomepageAdFormat, string> = {
  markdown: "Markdown",
  html: "HTML",
  svg: "SVG",
};

function CustomerServiceAiSection() {
  const lt = useLangText();
  const canManageSystem = hasPermission("system.manage");
  const [config, setConfig] = useState<CustomerServiceAiConfig>(DEFAULT_CUSTOMER_SERVICE_AI_CONFIG);
  const [jsonText, setJsonText] = useState(JSON.stringify(DEFAULT_CUSTOMER_SERVICE_AI_CONFIG, null, 2));
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"success" | "error" | "muted">("muted");

  const replaceConfig = (nextValue: unknown) => {
    const normalized = normalizeCustomerServiceAiConfig(nextValue);
    setConfig(normalized);
    setJsonText(JSON.stringify(normalized, null, 2));
  };

  const patchConfig = (patch: Partial<CustomerServiceAiConfig>) => {
    replaceConfig({ ...config, ...patch });
    setMsg("");
  };

  const patchKnowledgeBase = <K extends keyof CustomerServiceAiConfig["knowledge_base"]>(
    key: K,
    value: CustomerServiceAiConfig["knowledge_base"][K],
  ) => {
    replaceConfig({
      ...config,
      knowledge_base: {
        ...config.knowledge_base,
        [key]: value,
      },
    });
    setMsg("");
  };

  const load = () => {
    if (!canManageSystem) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg("");
    Promise.allSettled([
      api.getAdminCustomerServiceAiSettings(),
      api.listAdminCustomerServiceTickets(50),
      api.getLLMModelOptions(),
    ])
      .then(([settingsResult, ticketsResult, modelsResult]) => {
        if (settingsResult.status === "fulfilled") {
          const payload: any = settingsResult.value;
          replaceConfig(payload?.config || payload || {});
          setReady(Boolean(payload?.ready));
        } else {
          setMsg(settingsResult.reason?.message || lt("AI客服配置加载失败", "Failed to load AI support config"));
          setMsgTone("error");
        }
        if (ticketsResult.status === "fulfilled") {
          const payload: any = ticketsResult.value;
          setTickets(Array.isArray(payload?.tickets) ? payload.tickets : []);
        }
        if (modelsResult.status === "fulfilled") {
          const payload: any = modelsResult.value;
          setModelOptions(Array.isArray(payload?.models) ? payload.models : []);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [canManageSystem]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const result: any = await api.saveAdminCustomerServiceAiSettings({ config });
      replaceConfig(result?.config || config);
      setReady(Boolean(result?.ready));
      setMsg(
        result?.ready
          ? lt("AI客服配置已保存，首页将显示悬浮客服。", "AI support saved. The homepage widget will be visible.")
          : lt("AI客服配置已保存；未启用或缺少可用 AI 密钥时首页不会显示。", "AI support saved. The widget stays hidden until enabled with an available AI key."),
      );
      setMsgTone("success");
    } catch (error: any) {
      setMsg(error?.message || lt("AI客服配置保存失败", "Failed to save AI support config"));
      setMsgTone("error");
    } finally {
      setSaving(false);
    }
  };

  const applyJson = () => {
    try {
      replaceConfig(jsonText.trim() ? JSON.parse(jsonText) : DEFAULT_CUSTOMER_SERVICE_AI_CONFIG);
      setMsg(lt("JSON 已应用到表单，保存后生效。", "JSON applied to the form. Save to publish."));
      setMsgTone("muted");
    } catch {
      setMsg(lt("JSON 格式错误，请修正后再应用。", "Invalid JSON. Fix it before applying."));
      setMsgTone("error");
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customer-service-ai-config.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importKnowledgeFiles = async (
    files: FileList | null,
    key: "uploaded_files" | "rag_files",
  ) => {
    if (!files?.length) return;
    const imported: CustomerServiceKbFile[] = [];
    for (const file of Array.from(files).slice(0, 8)) {
      const content = (await file.text()).slice(0, 12000);
      if (content.trim()) {
        imported.push({
          name: file.name,
          content,
          type: file.type || "text/plain",
          enabled: true,
        });
      }
    }
    patchKnowledgeBase(key, [...config.knowledge_base[key], ...imported].slice(0, 16));
  };

  const patchKbFile = (
    key: "uploaded_files" | "rag_files",
    index: number,
    patch: Partial<CustomerServiceKbFile>,
  ) => {
    patchKnowledgeBase(
      key,
      config.knowledge_base[key].map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const removeKbFile = (key: "uploaded_files" | "rag_files", index: number) => {
    patchKnowledgeBase(
      key,
      config.knowledge_base[key].filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const patchFaq = (index: number, patch: Partial<CustomerServiceAiConfig["faqs"][number]>) => {
    patchConfig({
      faqs: config.faqs.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };

  const removeFaq = (index: number) => {
    patchConfig({ faqs: config.faqs.filter((_, itemIndex) => itemIndex !== index) });
  };

  if (!canManageSystem) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>{lt("AI客服", "AI Support")}</h2>
          <p>{lt("AI客服配置仅系统管理员可见。", "AI support settings are only available to administrators.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section settings-cs-config-section">
      <div className="settings-section-accent" style={{ background: "var(--primary)" }} />
      <div className="settings-section-header settings-site-config-header">
        <div>
          <div className="token-cost-title-row">
            <Bot size={22} aria-hidden="true" />
            <h2>{lt("AI客服", "AI Support")}</h2>
          </div>
          <p>
            {lt(
              "配置首页悬浮客服。未启用或没有可用 AI 密钥时，首页不会展示悬浮球。",
              "Configure the homepage floating support widget. It remains hidden unless enabled with an available AI key.",
            )}
          </p>
        </div>
        <div className="settings-site-actions">
          <span className={`settings-status-pill ${ready ? "success" : "danger"}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {ready ? "check_circle" : "error"}
            </span>
            {ready ? lt("可展示", "Ready") : lt("未就绪", "Not ready")}
          </span>
          <button className="figma-btn" type="button" onClick={load} disabled={loading || saving}>
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? lt("刷新中...", "Refreshing...") : lt("刷新", "Refresh")}
          </button>
          <button className="figma-btn figma-btn-primary" type="button" onClick={save} disabled={loading || saving}>
            <Save size={15} aria-hidden="true" />
            {saving ? lt("保存中...", "Saving...") : lt("保存客服", "Save Support")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="settings-site-loading">{lt("正在加载 AI客服配置...", "Loading AI support settings...")}</p>
      ) : (
        <div className="settings-cs-grid">
          <section className="settings-subcard settings-cs-card">
            <div className="settings-subcard-header">
              <div>
                <h3>{lt("展示与模型", "Display & Model")}</h3>
                <p>{lt("可复用系统 AI，也可以为客服单独配置 OpenAI 兼容或其他模型接口。", "Reuse system AI or configure a dedicated model endpoint for support.")}</p>
              </div>
            </div>
            <div className="settings-site-form-grid">
              <label className="settings-site-link-toggle settings-cs-toggle">
                <input type="checkbox" checked={config.enabled} onChange={(event) => patchConfig({ enabled: event.target.checked })} />
                <span>{config.enabled ? lt("启用首页客服", "Homepage support enabled") : lt("关闭首页客服", "Homepage support disabled")}</span>
              </label>
              <label className="settings-site-link-toggle settings-cs-toggle">
                <input type="checkbox" checked={config.use_system_ai} onChange={(event) => patchConfig({ use_system_ai: event.target.checked })} />
                <span>{lt("复用系统 AI 配置", "Reuse system AI config")}</span>
              </label>
              <label className="settings-field">
                <span>{lt("显示标题", "Display Title")}</span>
                <input value={config.display_title} onChange={(event) => patchConfig({ display_title: event.target.value })} />
              </label>
              <label className="settings-field">
                <span>{lt("模型服务", "Provider")}</span>
                <select value={config.provider} onChange={(event) => patchConfig({ provider: event.target.value })}>
                  {GLOBAL_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {lt("labelEn" in option ? option.label : PROVIDER_LABELS_ZH[option.value] || option.label, "labelEn" in option ? option.labelEn : PROVIDER_LABELS_EN[option.value] || option.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>{lt("模型", "Model")}</span>
                <input list="customer-service-model-options" value={config.model} onChange={(event) => patchConfig({ model: event.target.value })} />
                <datalist id="customer-service-model-options">
                  {modelOptions.map((model) => <option key={model} value={model} />)}
                </datalist>
              </label>
              <label className="settings-field">
                <span>{lt("API 地址", "API URL")}</span>
                <input value={config.api_url} onChange={(event) => patchConfig({ api_url: event.target.value })} placeholder="https://api.openai.com/v1" />
              </label>
              <label className="settings-field">
                <span>{lt("API 密钥", "API Key")}</span>
                <input type="password" value={config.api_key} onChange={(event) => patchConfig({ api_key: event.target.value })} placeholder={lt("留空则使用系统 AI 密钥", "Leave blank to use system AI key")} />
              </label>
            </div>
            <div className="settings-cs-copy-grid">
              <label className="settings-field">
                <span>{lt("欢迎语", "Welcome Message")}</span>
                <textarea rows={4} value={config.welcome_message} onChange={(event) => patchConfig({ welcome_message: event.target.value })} />
              </label>
              <label className="settings-field">
                <span>{lt("系统提示词", "System Prompt")}</span>
                <textarea rows={7} value={config.system_prompt} onChange={(event) => patchConfig({ system_prompt: event.target.value })} />
              </label>
              <label className="settings-field">
                <span>{lt("产品能力标签", "Capability Tags")}</span>
                <textarea rows={4} value={config.capabilities.join("\n")} onChange={(event) => patchConfig({ capabilities: event.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean) })} />
              </label>
            </div>
          </section>

          <section className="settings-subcard settings-cs-card">
            <div className="settings-subcard-header">
              <div>
                <h3>{lt("知识库", "Knowledge Base")}</h3>
                <p>{lt("支持内部知识、文本知识、文件导入 RAG、图知识库和外部接口知识库。", "Supports internal, text, imported-file RAG, graph and external API knowledge.")}</p>
              </div>
            </div>
            <div className="settings-cs-kb-grid">
              <label className="settings-site-link-toggle settings-cs-toggle">
                <input
                  type="checkbox"
                  checked={config.knowledge_base.internal.enabled}
                  onChange={(event) => patchKnowledgeBase("internal", { ...config.knowledge_base.internal, enabled: event.target.checked })}
                />
                <span>{lt("内部知识库", "Internal KB")}</span>
              </label>
              <label className="settings-field settings-cs-wide">
                <span>{lt("内部知识", "Internal Knowledge")}</span>
                <textarea rows={5} value={config.knowledge_base.internal.text} onChange={(event) => patchKnowledgeBase("internal", { ...config.knowledge_base.internal, text: event.target.value })} />
              </label>
              <label className="settings-site-link-toggle settings-cs-toggle">
                <input
                  type="checkbox"
                  checked={config.knowledge_base.text.enabled}
                  onChange={(event) => patchKnowledgeBase("text", { ...config.knowledge_base.text, enabled: event.target.checked })}
                />
                <span>{lt("文本知识库", "Text KB")}</span>
              </label>
              <label className="settings-field settings-cs-wide">
                <span>{lt("文本知识内容", "Text Knowledge")}</span>
                <textarea rows={5} value={config.knowledge_base.text.content} onChange={(event) => patchKnowledgeBase("text", { ...config.knowledge_base.text, content: event.target.value })} />
              </label>
              <div className="settings-cs-file-tools settings-cs-wide">
                <label className="figma-btn">
                  <Upload size={15} aria-hidden="true" />
                  {lt("上传知识库", "Upload KB")}
                  <input type="file" multiple accept=".txt,.md,.csv,.json,.yaml,.yml" onChange={(event) => importKnowledgeFiles(event.target.files, "uploaded_files")} />
                </label>
                <label className="figma-btn">
                  <Upload size={15} aria-hidden="true" />
                  {lt("导入 RAG 文件", "Import RAG Files")}
                  <input type="file" multiple accept=".txt,.md,.csv,.json,.yaml,.yml" onChange={(event) => importKnowledgeFiles(event.target.files, "rag_files")} />
                </label>
              </div>
              {(["uploaded_files", "rag_files"] as const).map((key) => (
                <div className="settings-cs-file-list settings-cs-wide" key={key}>
                  <strong>{key === "uploaded_files" ? lt("上传知识库文件", "Uploaded KB Files") : lt("RAG 导入文件", "RAG Files")}</strong>
                  {config.knowledge_base[key].length === 0 ? (
                    <p>{lt("暂无文件。", "No files yet.")}</p>
                  ) : (
                    config.knowledge_base[key].map((item, index) => (
                      <div className="settings-cs-file-row" key={`${key}-${item.name}-${index}`}>
                        <label className="settings-site-link-toggle">
                          <input type="checkbox" checked={item.enabled} onChange={(event) => patchKbFile(key, index, { enabled: event.target.checked })} />
                          <span>{item.enabled ? lt("启用", "On") : lt("停用", "Off")}</span>
                        </label>
                        <input value={item.name} onChange={(event) => patchKbFile(key, index, { name: event.target.value })} />
                        <button type="button" className="settings-site-delete-link" onClick={() => removeKbFile(key, index)} aria-label={lt("删除文件", "Delete file")}>
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ))}
              <label className="settings-site-link-toggle settings-cs-toggle">
                <input
                  type="checkbox"
                  checked={config.knowledge_base.graph.enabled}
                  onChange={(event) => patchKnowledgeBase("graph", { ...config.knowledge_base.graph, enabled: event.target.checked })}
                />
                <span>{lt("图知识库", "Graph KB")}</span>
              </label>
              <label className="settings-field settings-cs-wide">
                <span>{lt("图知识库说明", "Graph Notes")}</span>
                <textarea rows={4} value={config.knowledge_base.graph.notes} onChange={(event) => patchKnowledgeBase("graph", { ...config.knowledge_base.graph, notes: event.target.value })} />
              </label>
              <label className="settings-site-link-toggle settings-cs-toggle">
                <input
                  type="checkbox"
                  checked={config.knowledge_base.external.enabled}
                  onChange={(event) => patchKnowledgeBase("external", { ...config.knowledge_base.external, enabled: event.target.checked })}
                />
                <span>{lt("外部知识库", "External KB")}</span>
              </label>
              <div className="settings-site-form-grid settings-cs-wide">
                <label className="settings-field">
                  <span>{lt("接口地址", "Endpoint")}</span>
                  <input value={config.knowledge_base.external.endpoint} onChange={(event) => patchKnowledgeBase("external", { ...config.knowledge_base.external, endpoint: event.target.value })} placeholder="https://..." />
                </label>
                <label className="settings-field">
                  <span>{lt("请求方式", "Method")}</span>
                  <select value={config.knowledge_base.external.method} onChange={(event) => patchKnowledgeBase("external", { ...config.knowledge_base.external, method: event.target.value as "GET" | "POST" })}>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </label>
                <label className="settings-field settings-cs-wide">
                  <span>{lt("外部接口密钥", "External API Key")}</span>
                  <input type="password" value={config.knowledge_base.external.api_key} onChange={(event) => patchKnowledgeBase("external", { ...config.knowledge_base.external, api_key: event.target.value })} />
                </label>
              </div>
            </div>
          </section>

          <section className="settings-subcard settings-cs-card">
            <div className="settings-subcard-header settings-site-links-header">
              <div>
                <h3>{lt("常见回答与推荐问题", "FAQ & Recommended Questions")}</h3>
                <p>{lt("FAQ 会作为客服快捷入口，也会作为模型失败时的兜底回答。", "FAQ appears as quick entries and fallback answers when the model fails.")}</p>
              </div>
              <button className="figma-btn" type="button" onClick={() => patchConfig({ faqs: [...config.faqs, { question: "新问题", answer: "回答内容", enabled: true }] })}>
                <Plus size={15} aria-hidden="true" />
                {lt("新增 FAQ", "Add FAQ")}
              </button>
            </div>
            <div className="settings-cs-faq-list">
              {config.faqs.map((item, index) => (
                <div className="settings-cs-faq-row" key={`${item.question}-${index}`}>
                  <label className="settings-site-link-toggle">
                    <input type="checkbox" checked={item.enabled} onChange={(event) => patchFaq(index, { enabled: event.target.checked })} />
                    <span>{item.enabled ? lt("启用", "On") : lt("停用", "Off")}</span>
                  </label>
                  <input value={item.question} onChange={(event) => patchFaq(index, { question: event.target.value })} placeholder={lt("问题", "Question")} />
                  <textarea value={item.answer} onChange={(event) => patchFaq(index, { answer: event.target.value })} placeholder={lt("回答", "Answer")} rows={3} />
                  <button type="button" className="settings-site-delete-link" onClick={() => removeFaq(index)} aria-label={lt("删除 FAQ", "Delete FAQ")}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <label className="settings-field settings-cs-recommended">
              <span>{lt("推荐问题（每行一个）", "Recommended Questions")}</span>
              <textarea rows={5} value={config.recommended_questions.join("\n")} onChange={(event) => patchConfig({ recommended_questions: event.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean) })} />
            </label>
          </section>

          <section className="settings-subcard settings-cs-card">
            <div className="settings-subcard-header settings-site-links-header">
              <div>
                <h3>{lt("JSON 预览", "JSON Preview")}</h3>
                <p>{lt("支持导入导出完整客服配置；密钥字段从后台读取时会脱敏。", "Import or export the full support config. Secret fields returned by the backend are masked.")}</p>
              </div>
              <div className="settings-cs-json-actions">
                <button className="figma-btn" type="button" onClick={applyJson}>
                  <Upload size={15} aria-hidden="true" />
                  {lt("应用 JSON", "Apply JSON")}
                </button>
                <button className="figma-btn" type="button" onClick={exportJson}>
                  <Download size={15} aria-hidden="true" />
                  {lt("导出", "Export")}
                </button>
              </div>
            </div>
            <textarea
              className="settings-json-textarea settings-cs-json-textarea"
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              spellCheck={false}
              wrap="off"
            />
          </section>

          <section className="settings-subcard settings-cs-card settings-cs-card-wide">
            <div className="settings-subcard-header">
              <div>
                <h3>{lt("最近客服工单", "Recent Support Tickets")}</h3>
                <p>{lt("用于观察首页客服问题类型和后续获客优化。", "Use these to understand support demand and improve acquisition flows.")}</p>
              </div>
            </div>
            <div className="settings-cs-ticket-list">
              {tickets.length === 0 ? (
                <p>{lt("暂无工单。", "No tickets yet.")}</p>
              ) : (
                tickets.map((ticket) => (
                  <article key={ticket.id} className="settings-cs-ticket-row">
                    <div>
                      <strong>#{ticket.id} {ticket.topic || lt("未填写主题", "No topic")}</strong>
                      <span>{ticket.name || lt("匿名用户", "Anonymous")} · {ticket.contact || lt("未留联系方式", "No contact")}</span>
                    </div>
                    <p>{ticket.message}</p>
                    <small>{ticket.created_at ? new Date(ticket.created_at).toLocaleString() : ""}</small>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {msg && <p className={`settings-site-message ${msgTone}`} role="status">{msg}</p>}
    </div>
  );
}

function SiteConfigSection() {
  const lt = useLangText();
  const canManageSystem = hasPermission("system.manage");
  const [settings, setSettings] = useState<PublicSiteSettings>(DEFAULT_PUBLIC_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"success" | "error" | "muted">("muted");

  const loadSettings = () => {
    if (!canManageSystem) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg("");
    api
      .getAdminSiteSettings()
      .then((result: any) => {
        setSettings(normalizePublicSiteSettings(result));
        setMsgTone("muted");
      })
      .catch((error: any) => {
        setMsg(error?.message || lt("站点设置加载失败", "Failed to load site settings"));
        setMsgTone("error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, [canManageSystem]);

  const patchSetting = <K extends keyof PublicSiteSettings>(
    key: K,
    value: PublicSiteSettings[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const patchContact = (key: keyof PublicSiteSettings["contact"], value: string) => {
    setSettings((current) => ({
      ...current,
      contact: { ...current.contact, [key]: value },
    }));
  };

  const patchFooterLink = <K extends keyof PublicSiteLink>(
    index: number,
    key: K,
    value: PublicSiteLink[K],
  ) => {
    setSettings((current) => ({
      ...current,
      footer_links: current.footer_links.map((link, itemIndex) =>
        itemIndex === index ? { ...link, [key]: value } : link,
      ),
    }));
  };

  const patchHomepageTopAd = <K extends keyof PublicHomepageAdBlock>(
    key: K,
    value: PublicHomepageAdBlock[K],
  ) => {
    setSettings((current) => ({
      ...current,
      homepage_ads: {
        ...current.homepage_ads,
        top_banner: { ...current.homepage_ads.top_banner, [key]: value },
      },
    }));
  };

  const patchHomepageSponsor = <K extends keyof PublicHomepageAdBlock>(
    index: number,
    key: K,
    value: PublicHomepageAdBlock[K],
  ) => {
    setSettings((current) => ({
      ...current,
      homepage_ads: {
        ...current.homepage_ads,
        sponsors: current.homepage_ads.sponsors.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [key]: value } : item,
        ),
      },
    }));
  };

  const addFooterLink = () => {
    setSettings((current) => ({
      ...current,
      footer_links: [
        ...current.footer_links,
        {
          key: `custom_${Date.now()}`,
          label_zh: "新导航",
          label_en: "New Link",
          href: "#",
          enabled: true,
        },
      ],
    }));
  };

  const removeFooterLink = (index: number) => {
    setSettings((current) => ({
      ...current,
      footer_links: current.footer_links.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setMsg("");
    try {
      const payload = normalizePublicSiteSettings(settings);
      const result: any = await api.saveAdminSiteSettings(payload);
      setSettings(normalizePublicSiteSettings(result));
      setMsg(lt("站点设置已保存，重新打开首页即可看到更新。", "Site settings saved. Reopen the homepage to see the update."));
      setMsgTone("success");
    } catch (error: any) {
      setMsg(error?.message || lt("站点设置保存失败", "Failed to save site settings"));
      setMsgTone("error");
    } finally {
      setSaving(false);
    }
  };

  const renderHomepageAdEditor = (
    ad: PublicHomepageAdBlock,
    label: string,
    patchAd: <K extends keyof PublicHomepageAdBlock>(
      key: K,
      value: PublicHomepageAdBlock[K],
    ) => void,
  ) => {
    const contentPlaceholder =
      ad.format === "svg"
        ? '<svg viewBox="0 0 320 120" xmlns="http://www.w3.org/2000/svg">...</svg>'
        : ad.format === "html"
          ? '<div class="sponsor-card"><strong>广告主名称</strong><p>核心卖点</p></div>'
          : "### 广告主名称\n一句话卖点，支持图片：![logo](https://...)";
    return (
      <div className={`settings-homepage-ad-editor ${ad.enabled ? "enabled" : ""}`}>
        <div className="settings-homepage-ad-editor-head">
          <label className="settings-site-link-toggle">
            <input
              type="checkbox"
              checked={ad.enabled}
              onChange={(event) => patchAd("enabled", event.target.checked)}
            />
            <span>{ad.enabled ? lt("显示", "Visible") : lt("隐藏", "Hidden")}</span>
          </label>
          <strong>{label}</strong>
          <small>
            {lt(
              "开启且内容不为空才会在首页展示。",
              "Shown on the homepage only when enabled and content is not empty.",
            )}
          </small>
        </div>
        <div className="settings-homepage-ad-grid">
          <label className="settings-field">
            <span>{lt("广告名称", "Ad Name")}</span>
            <input
              value={ad.name}
              onChange={(event) => patchAd("name", event.target.value)}
              placeholder={label}
            />
          </label>
          <label className="settings-field">
            <span>{lt("平台/导入来源", "Platform / Source")}</span>
            <select
              value={ad.platform}
              onChange={(event) => patchAd("platform", event.target.value as HomepageAdPlatform)}
            >
              {HOMEPAGE_AD_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {lt(
                    HOMEPAGE_AD_PLATFORM_LABELS_ZH[platform],
                    HOMEPAGE_AD_PLATFORM_LABELS_EN[platform],
                  )}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span>{lt("素材格式", "Creative Format")}</span>
            <select
              value={ad.format}
              onChange={(event) => patchAd("format", event.target.value as HomepageAdFormat)}
            >
              {HOMEPAGE_AD_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {lt(HOMEPAGE_AD_FORMAT_LABELS_ZH[format], HOMEPAGE_AD_FORMAT_LABELS_EN[format])}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span>{lt("跳转链接", "Click URL")}</span>
            <input
              value={ad.href}
              onChange={(event) => patchAd("href", event.target.value)}
              placeholder="https://... / /register / #about"
            />
          </label>
          <label className="settings-field settings-homepage-ad-content">
            <span>{lt("展示内容", "Display Content")}</span>
            <textarea
              rows={ad.format === "svg" ? 7 : 6}
              value={ad.content}
              onChange={(event) => patchAd("content", event.target.value)}
              placeholder={contentPlaceholder}
            />
          </label>
        </div>
      </div>
    );
  };

  if (!canManageSystem) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>{lt("站点设置", "Site Settings")}</h2>
          <p>{lt("站点信息仅系统管理员可配置。", "Site settings are only available to administrators.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section settings-site-config-section">
      <div className="settings-section-accent" style={{ background: "var(--brand-accent)" }} />
      <div className="settings-section-header settings-site-config-header">
        <div>
          <h2>{lt("站点设置", "Site Settings")}</h2>
          <p>
            {lt(
              "配置首页品牌介绍、广告位、页脚联系方式和导航内容。未开启或未填写内容的广告位不会显示。",
              "Configure homepage branding, ad placements, footer contacts and navigation. Disabled or empty ads stay hidden.",
            )}
          </p>
        </div>
        <div className="settings-site-actions">
          <button className="figma-btn" type="button" onClick={loadSettings} disabled={loading || saving}>
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? lt("刷新中...", "Refreshing...") : lt("刷新", "Refresh")}
          </button>
          <button className="figma-btn figma-btn-primary" type="button" onClick={saveSettings} disabled={loading || saving}>
            <Save size={15} aria-hidden="true" />
            {saving ? lt("保存中...", "Saving...") : lt("保存设置", "Save Settings")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="settings-site-loading">{lt("正在加载站点设置...", "Loading site settings...")}</p>
      ) : (
        <div className="settings-site-grid">
          <section className="settings-subcard settings-site-card">
            <div className="settings-subcard-header"><div><h3>{lt("演示模式", "Demo Mode")}</h3><p>{lt("用于测试账号和产品演示。建议演示账号只使用模拟交易数据。", "For test accounts and product demonstrations. Use paper-trading data for the demo account.")}</p></div></div>
            <label className="settings-site-link-toggle"><input type="checkbox" checked={settings.demo_mode_enabled} onChange={(event) => patchSetting("demo_mode_enabled", event.target.checked)} /><span>{lt("开启演示模式", "Enable demo mode")}</span></label>
            <label className="settings-field"><span>{lt("演示账号用户名（可选）", "Demo username (optional)")}</span><input value={settings.demo_username} onChange={(event) => patchSetting("demo_username", event.target.value)} placeholder={lt("例如 demo", "e.g. demo")} /></label>
          </section>
          <section className="settings-subcard settings-site-card">
            <div className="settings-subcard-header"><div><h3>{lt("新手引导", "Onboarding")}</h3><p>{lt("独立于演示模式控制新用户首次登录时的功能引导。", "Controls first-login guidance independently from demo mode.")}</p></div></div>
            <label className="settings-site-link-toggle"><input type="checkbox" checked={settings.onboarding_enabled} onChange={(event) => patchSetting("onboarding_enabled", event.target.checked)} /><span>{lt("开启新手引导", "Enable onboarding")}</span></label>
          </section>
          <section className="settings-subcard settings-site-card">
            <div className="settings-subcard-header">
              <div>
                <h3>{lt("品牌与联系方式", "Brand & Contacts")}</h3>
                <p>{lt("联系方式为空时不在首页展示；Telegram 和 WhatsApp 支持填写账号或完整链接。", "Empty contacts stay hidden; Telegram and WhatsApp accept an account or full URL.")}</p>
              </div>
            </div>
            <div className="settings-site-form-grid">
              <div className="settings-field">
                <label htmlFor="site-brand-zh">{lt("中文品牌名", "Chinese Brand Name")}</label>
                <input id="site-brand-zh" value={settings.brand_zh} onChange={(event) => patchSetting("brand_zh", event.target.value)} />
              </div>
              <div className="settings-field">
                <label htmlFor="site-brand-en">{lt("英文品牌名", "English Brand Name")}</label>
                <input id="site-brand-en" value={settings.brand_en} onChange={(event) => patchSetting("brand_en", event.target.value)} />
              </div>
              <div className="settings-field">
                <label className="settings-site-contact-label" htmlFor="site-contact-qq"><SiTencentqq aria-hidden="true" />QQ</label>
                <input id="site-contact-qq" inputMode="numeric" placeholder={lt("填写公开 QQ 号码", "Public QQ number")} value={settings.contact.qq} onChange={(event) => patchContact("qq", event.target.value)} />
              </div>
              <div className="settings-field">
                <label className="settings-site-contact-label" htmlFor="site-contact-wechat"><SiWechat aria-hidden="true" />{lt("微信", "WeChat")}</label>
                <input id="site-contact-wechat" placeholder={lt("填写公开微信号", "Public WeChat ID")} value={settings.contact.wechat} onChange={(event) => patchContact("wechat", event.target.value)} />
              </div>
              <div className="settings-field">
                <label className="settings-site-contact-label" htmlFor="site-contact-telegram"><SiTelegram aria-hidden="true" />Telegram</label>
                <input id="site-contact-telegram" placeholder="@username / https://t.me/username" value={settings.contact.telegram} onChange={(event) => patchContact("telegram", event.target.value)} />
              </div>
              <div className="settings-field">
                <label className="settings-site-contact-label" htmlFor="site-contact-whatsapp"><SiWhatsapp aria-hidden="true" />WhatsApp</label>
                <input id="site-contact-whatsapp" inputMode="tel" placeholder="+86... / https://wa.me/..." value={settings.contact.whatsapp} onChange={(event) => patchContact("whatsapp", event.target.value)} />
              </div>
            </div>
          </section>

          <section className="settings-subcard settings-site-card">
            <div className="settings-subcard-header">
              <div>
                <h3>{lt("首页介绍与版权", "Homepage Copy & Copyright")}</h3>
                <p>{lt("分别维护中文和英文内容。", "Maintain Chinese and English content separately.")}</p>
              </div>
            </div>
            <div className="settings-site-copy-grid">
              <div className="settings-field">
                <label htmlFor="site-about-zh">{lt("中文简介", "Chinese Introduction")}</label>
                <textarea id="site-about-zh" className="settings-site-about" rows={5} value={settings.about_zh} onChange={(event) => patchSetting("about_zh", event.target.value)} />
              </div>
              <div className="settings-field">
                <label htmlFor="site-about-en">{lt("英文简介", "English Introduction")}</label>
                <textarea id="site-about-en" className="settings-site-about" rows={5} value={settings.about_en} onChange={(event) => patchSetting("about_en", event.target.value)} />
              </div>
              <div className="settings-field">
                <label htmlFor="site-copyright-zh">{lt("中文版权", "Chinese Copyright")}</label>
                <input id="site-copyright-zh" value={settings.copyright_zh} onChange={(event) => patchSetting("copyright_zh", event.target.value)} />
              </div>
              <div className="settings-field">
                <label htmlFor="site-copyright-en">{lt("英文版权", "English Copyright")}</label>
                <input id="site-copyright-en" value={settings.copyright_en} onChange={(event) => patchSetting("copyright_en", event.target.value)} />
              </div>
            </div>
          </section>

          <section className="settings-subcard settings-site-card settings-site-card-wide">
            <div className="settings-subcard-header">
              <div>
                <h3>{lt("首页广告位", "Homepage Ad Placements")}</h3>
                <p>
                  {lt(
                    "顶部 banner 位于导航栏下方；底部赞助商最多展示 5 个。支持 Markdown、HTML 与 SVG 素材，可用于直客广告或国内广告平台代码片段。",
                    "The top banner appears below the navigation. Up to five sponsor cards appear near the footer. Markdown, HTML and SVG creatives are supported for direct ads or domestic platform snippets.",
                  )}
                </p>
              </div>
            </div>
            <div className="settings-homepage-ad-list">
              {renderHomepageAdEditor(settings.homepage_ads.top_banner, lt("顶部 Banner", "Top Banner"), patchHomepageTopAd)}
              <div className="settings-homepage-sponsor-grid">
                {settings.homepage_ads.sponsors.map((sponsor, index) => (
                  <div key={`homepage-sponsor-${index}`}>
                    {renderHomepageAdEditor(
                      sponsor,
                      lt(`底部赞助商 ${index + 1}`, `Footer Sponsor ${index + 1}`),
                      (key, value) => patchHomepageSponsor(index, key, value),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="settings-subcard settings-site-card settings-site-card-wide">
            <div className="settings-subcard-header settings-site-links-header">
              <div>
                <h3>{lt("页脚导航", "Footer Navigation")}</h3>
                <p>{lt("支持站内路径、页面锚点和 HTTPS 外部链接，最多保存 12 项。", "Supports internal paths, page anchors and HTTPS links, up to 12 items.")}</p>
              </div>
              <button className="figma-btn" type="button" onClick={addFooterLink} disabled={settings.footer_links.length >= 12}>
                <Plus size={15} aria-hidden="true" />
                {lt("新增导航", "Add Link")}
              </button>
            </div>

            <div className="settings-site-link-list">
              {settings.footer_links.map((link, index) => (
                <div className="settings-site-link-row" key={`${link.key}-${index}`}>
                  <label className="settings-site-link-toggle">
                    <input type="checkbox" checked={link.enabled} onChange={(event) => patchFooterLink(index, "enabled", event.target.checked)} />
                    <span>{link.enabled ? lt("显示", "Visible") : lt("隐藏", "Hidden")}</span>
                  </label>
                  <input aria-label={lt(`第 ${index + 1} 项中文名称`, `Chinese label for link ${index + 1}`)} value={link.label_zh} onChange={(event) => patchFooterLink(index, "label_zh", event.target.value)} placeholder={lt("中文名称", "Chinese label")} />
                  <input aria-label={lt(`第 ${index + 1} 项英文名称`, `English label for link ${index + 1}`)} value={link.label_en} onChange={(event) => patchFooterLink(index, "label_en", event.target.value)} placeholder={lt("英文名称", "English label")} />
                  <input aria-label={lt(`第 ${index + 1} 项链接`, `URL for link ${index + 1}`)} value={link.href} onChange={(event) => patchFooterLink(index, "href", event.target.value)} placeholder="#about / /login / https://..." />
                  <button className="settings-site-delete-link" type="button" onClick={() => removeFooterLink(index)} aria-label={lt(`删除第 ${index + 1} 项导航`, `Delete link ${index + 1}`)} title={lt("删除导航", "Delete link")}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {settings.footer_links.length === 0 && (
                <p className="settings-site-empty">{lt("暂无页脚导航，可点击新增导航。", "No footer links. Use Add Link to create one.")}</p>
              )}
            </div>
          </section>
        </div>
      )}

      {msg && <p className={`settings-site-message ${msgTone}`} role="status">{msg}</p>}
    </div>
  );
}

function TradingConfigSection() {
  const lt = useLangText();
  const [settings, setSettings] = useState<Record<string, { fee_rate: number; minimum_fee: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api.getAdminSimulationFeeSettings()
      .then((payload: any) => setSettings(payload?.settings || {}))
      .catch((error: any) => setMsg(error?.message || lt("交易参数加载失败", "Failed to load trading parameters")))
      .finally(() => setLoading(false));
  }, [lt]);
  const update = (market: string, key: "fee_rate" | "minimum_fee", value: string) => {
    const parsed = Number(value);
    setSettings((current) => ({
      ...current,
      [market]: { ...(current[market] || { fee_rate: 0, minimum_fee: 0 }), [key]: key === "fee_rate" ? parsed / 10000 : parsed },
    }));
  };
  const save = async () => {
    setSaving(true);
    try {
      const result: any = await api.saveAdminSimulationFeeSettings(settings);
      setSettings(result?.settings || settings);
      setMsg(lt("交易佣金参数已保存", "Trading fee settings saved"));
    } catch (error: any) {
      setMsg(error?.message || lt("交易参数保存失败", "Failed to save trading parameters"));
    } finally {
      setSaving(false);
    }
  };
  return <div className="settings-section">
    <div className="settings-section-header"><div><h2>{lt("模拟交易参数", "Paper Trading Parameters")}</h2><p>{lt("佣金按成交金额乘费率计算；当结果低于最低佣金时按最低佣金收取。", "Commission equals trade amount multiplied by the rate; values below the minimum are charged at the minimum.")}</p></div><button className="figma-btn figma-btn-primary" type="button" onClick={save} disabled={loading || saving}><Save size={15} />{saving ? lt("保存中...", "Saving...") : lt("保存", "Save")}</button></div>
    {loading ? <p>{lt("加载中...", "Loading...")}</p> : <div className="settings-grid-3">{["CN", "HK", "US"].map((market) => <section className="settings-subcard" key={market}><h3>{market}</h3><label className="settings-field"><span>{lt("佣金费率（万分比）", "Fee rate (basis points per 10,000)")}</span><input type="number" min="0" max="1000" step="0.1" value={Number(settings[market]?.fee_rate || 0) * 10000} onChange={(e) => update(market, "fee_rate", e.target.value)} /></label><label className="settings-field"><span>{lt("最低佣金", "Minimum fee")}</span><input type="number" min="0" step="0.01" value={settings[market]?.minimum_fee ?? 0} onChange={(e) => update(market, "minimum_fee", e.target.value)} /></label><small>{lt(`例如填写 1 就是万1（0.01%）；成交额 10000 时佣金为 max(10000 × 0.0001, 最低佣金)。`, `Enter 1 for 1 bp (0.01%); for a 10,000 trade, fee = max(10,000 × 0.0001, minimum fee).`)}</small></section>)}</div>}
    {msg && <p className="settings-site-message" role="status">{msg}</p>}
  </div>;
}

function PaymentConfigSection() {
  const lt = useLangText();
  const canManageSystem = hasPermission("system.manage");
  const [paymentSettings, setPaymentSettings] = useState<any>({
    epay: { enabled: false, gateway_url: "", merchant_id: "", secret_key: "", public_site_url: "", public_api_url: "", default_method: "alipay" },
    stripe: { enabled: false, secret_key: "", webhook_secret: "", checkout_url: "" },
  });
  const [loading, setLoading] = useState(true);
  const [savingPaymentScope, setSavingPaymentScope] = useState<"" | "epay" | "stripe">("");
  const [msg, setMsg] = useState("");

  const loadPaymentSettings = () => {
    if (!canManageSystem) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (api as any)
      .getAdminPaymentSettings()
      .then((result: any) => {
        if (result?.settings) setPaymentSettings(result.settings);
        setMsg("");
      })
      .catch((e: any) => setMsg(e?.message || lt("支付配置加载失败", "Failed to load payment settings")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPaymentSettings();
  }, []);

  const savePaymentSettings = async (scope: "epay" | "stripe") => {
    setSavingPaymentScope(scope);
    setMsg("");
    try {
      const result: any = await (api as any).saveAdminPaymentSettings(paymentSettings);
      if (result?.settings) setPaymentSettings(result.settings);
      setMsg(
        scope === "epay"
          ? lt("ePay 配置已保存", "ePay settings saved")
          : lt("Stripe 配置已保存", "Stripe settings saved"),
      );
    } catch (e: any) {
      setMsg(e?.message || lt("支付配置保存失败", "Failed to save payment settings"));
    } finally {
      setSavingPaymentScope("");
    }
  };

  const patchPayment = (scope: "epay" | "stripe", key: string, value: any) => {
    setPaymentSettings((prev: any) => ({
      ...prev,
      [scope]: { ...(prev?.[scope] || {}), [key]: value },
    }));
  };

  if (!canManageSystem) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>{lt("支付配置", "Payment Config")}</h2>
          <p>{lt("支付接口配置仅系统管理员可见。", "Payment provider settings are only visible to administrators.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section settings-payment-settings-card">
      <div
        className="settings-section-accent"
        style={{ background: "var(--brand-accent)" }}
      />
      <div className="settings-section-header">
        <div>
          <h2>{lt("支付配置", "Payment Config")}</h2>
          <p>{lt("ePay 和 Stripe 分开维护；密钥保存后仅读取脱敏值。", "ePay and Stripe are configured separately; secrets are masked after saving.")}</p>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{lt("支付配置加载中...", "Loading payment settings...")}</p>
      ) : (
        <div className="settings-payment-provider-grid">
          <div className="settings-payment-provider-card settings-payment-provider-card-epay">
            <div className="settings-payment-provider-header">
              <div className="settings-payment-provider-title">
                <div className="settings-payment-icon settings-payment-icon-epay">
                  <BrandIcon type="epay" />
                </div>
                <div>
                  <h4>{EPAY_DISPLAY_NAME}</h4>
                  <p>{lt("用于支付宝、微信等聚合支付通道。", "For aggregate checkout channels such as Alipay and WeChat Pay.")}</p>
                </div>
              </div>
              <label className="settings-payment-switch">
                <input
                  type="checkbox"
                  checked={Boolean(paymentSettings?.epay?.enabled)}
                  onChange={(event) => patchPayment("epay", "enabled", event.target.checked)}
                />
                <span>{paymentSettings?.epay?.enabled ? lt("已启用", "Enabled") : lt("未启用", "Disabled")}</span>
              </label>
            </div>
            <div className="settings-payment-form">
              <label className="settings-field">
                <span>{lt("网关地址", "Gateway URL")}</span>
                <input className="figma-input" placeholder="https://pay.example.com/" value={paymentSettings?.epay?.gateway_url || ""} onChange={(e) => patchPayment("epay", "gateway_url", e.target.value)} />
              </label>
              <label className="settings-field settings-payment-field-wide">
                <span>{lt("公开站点地址", "Public Site URL")}</span>
                <input className="figma-input" placeholder="https://example.com" value={paymentSettings?.epay?.public_site_url || ""} onChange={(e) => patchPayment("epay", "public_site_url", e.target.value)} />
                <small>{lt("公网部署请填写域名根地址，用于支付完成后的返回。仅本地调试可留空。", "For public deployment, enter your domain origin for the post-payment return page. Leave blank only for local testing.")}</small>
              </label>
              <label className="settings-field settings-payment-field-wide">
                <span>{lt("公开 API 地址（可选）", "Public API URL (optional)")}</span>
                <input className="figma-input" placeholder="https://api.example.com" value={paymentSettings?.epay?.public_api_url || ""} onChange={(e) => patchPayment("epay", "public_api_url", e.target.value)} />
                <small>{lt("ePay 异步通知将请求该地址下的 /api/subscription/epay/notify。未填写时默认使用公开站点地址，要求站点将 /api 反向代理到后端。", "ePay notifications call /api/subscription/epay/notify on this origin. When blank, the public site URL is used and its /api route must proxy to the backend.")}</small>
              </label>
              <label className="settings-field">
                <span>{lt("商户 ID", "Merchant ID")}</span>
                <input className="figma-input" placeholder="pid / merchant_id" value={paymentSettings?.epay?.merchant_id || ""} onChange={(e) => patchPayment("epay", "merchant_id", e.target.value)} />
              </label>
              <label className="settings-field settings-payment-field-wide">
                <span>{lt("接口密钥", "Secret Key")}</span>
                <input className="figma-input" placeholder={lt("ePay 商户密钥", "ePay merchant secret")} value={paymentSettings?.epay?.secret_key || ""} onChange={(e) => patchPayment("epay", "secret_key", e.target.value)} />
              </label>
              <label className="settings-field">
                <span>{lt("默认支付方式", "Default Method")}</span>
                <select className="figma-input" value={paymentSettings?.epay?.default_method || "alipay"} onChange={(e) => patchPayment("epay", "default_method", e.target.value)}>
                  {EPAY_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {epayMethodLabel(method, lt)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="settings-payment-card-actions">
              <button
                className="figma-btn figma-btn-primary"
                type="button"
                onClick={() => savePaymentSettings("epay")}
                disabled={Boolean(savingPaymentScope)}
              >
                {savingPaymentScope === "epay" ? lt("保存中...", "Saving...") : lt("保存 ePay 配置", "Save ePay Settings")}
              </button>
            </div>
          </div>

          <div className="settings-payment-provider-card settings-payment-provider-card-stripe">
            <div className="settings-payment-provider-header">
              <div className="settings-payment-provider-title">
                <div className="settings-payment-icon settings-payment-icon-stripe">
                  <BrandIcon type="stripe" />
                </div>
                <div>
                  <h4>Stripe</h4>
                  <p>{lt("用于海外银行卡和 Stripe Checkout 订阅支付。", "For international card payments and Stripe Checkout subscriptions.")}</p>
                </div>
              </div>
              <label className="settings-payment-switch">
                <input
                  type="checkbox"
                  checked={Boolean(paymentSettings?.stripe?.enabled)}
                  onChange={(event) => patchPayment("stripe", "enabled", event.target.checked)}
                />
                <span>{paymentSettings?.stripe?.enabled ? lt("已启用", "Enabled") : lt("未启用", "Disabled")}</span>
              </label>
            </div>
            <div className="settings-payment-form">
              <label className="settings-field">
                <span>{lt("接口密钥", "Secret Key")}</span>
                <input className="figma-input" placeholder="sk_live_..." value={paymentSettings?.stripe?.secret_key || ""} onChange={(e) => patchPayment("stripe", "secret_key", e.target.value)} />
              </label>
              <label className="settings-field">
                <span>{lt("Webhook 密钥", "Webhook Secret")}</span>
                <input className="figma-input" placeholder="whsec_..." value={paymentSettings?.stripe?.webhook_secret || ""} onChange={(e) => patchPayment("stripe", "webhook_secret", e.target.value)} />
              </label>
              <label className="settings-field settings-payment-field-wide">
                <span>{lt("Checkout URL（可选）", "Checkout URL (optional)")}</span>
                <input className="figma-input" placeholder="https://checkout.stripe.com/..." value={paymentSettings?.stripe?.checkout_url || ""} onChange={(e) => patchPayment("stripe", "checkout_url", e.target.value)} />
              </label>
            </div>
            <div className="settings-payment-card-actions">
              <button
                className="figma-btn figma-btn-primary"
                type="button"
                onClick={() => savePaymentSettings("stripe")}
                disabled={Boolean(savingPaymentScope)}
              >
                {savingPaymentScope === "stripe" ? lt("保存中...", "Saving...") : lt("保存 Stripe 配置", "Save Stripe Settings")}
              </button>
            </div>
          </div>
        </div>
      )}

      {msg && <p className="settings-payment-message">{msg}</p>}
    </div>
  );
}

/* ── Dashboard News Source Section ────────────────────────────────────────── */

type DashboardNewsSettings = {
  domestic: {
    enabled: boolean;
    limit: number;
    provider: string;
    providers: string[];
  };
  international: {
    enabled: boolean;
    limit: number;
    providers: string[];
  };
  watchlist: {
    enabled: boolean;
    limit: number;
    provider: string;
    providers: string[];
  };
};

const DASHBOARD_NEWS_DEFAULTS: DashboardNewsSettings = {
  domestic: {
    enabled: true,
    limit: 10,
    provider: "eastmoney.web_news_col",
    providers: [
      "eastmoney.web_news_col",
      "akshare.stock_news_main_cx",
      "akshare.stock_news_em",
    ],
  },
  international: {
    enabled: true,
    limit: 10,
    providers: [
      "wallstreetcn.global_live",
      "akshare.stock_info_global_em",
      "akshare.stock_info_global_futu",
      "akshare.stock_info_global_ths",
      "akshare.stock_info_global_sina",
      "rss.bbc_chinese",
    ],
  },
  watchlist: {
    enabled: true,
    limit: 10,
    provider: "akshare.stock_news_em",
    providers: [
      "akshare.stock_news_em",
      "eastmoney.announcements",
      "eastmoney.research_reports",
      "eastmoney.guba",
    ],
  },
};

const DOMESTIC_NEWS_PROVIDER_OPTIONS = [
  {
    value: "eastmoney.web_news_col",
    label: "东方财富财经",
    labelEn: "Eastmoney Finance",
    desc: "东方财富公开财经新闻接口，通常比 akshare 更快。",
    descEn: "Eastmoney public finance news endpoint, usually faster than akshare.",
  },
  {
    value: "akshare.stock_news_main_cx",
    label: "财新新闻",
    labelEn: "Caixin News",
    desc: "国内财经资讯，来自 akshare.stock_news_main_cx。",
    descEn: "Domestic financial news via akshare.stock_news_main_cx.",
  },
  {
    value: "akshare.stock_news_em",
    label: "东方财富最新资讯",
    labelEn: "Eastmoney Latest via AkShare",
    desc: "akshare 封装的东方财富最新资讯，作为补充源。",
    descEn: "AkShare-wrapped Eastmoney latest news as a supplemental source.",
  },
];

const INTERNATIONAL_NEWS_PROVIDER_OPTIONS = [
  {
    value: "wallstreetcn.global_live",
    label: "华尔街见闻全球快讯",
    labelEn: "WallstreetCN Global Live",
    desc: "中文 7x24 国际快讯，适合跟踪地缘、美元利率、海外科技与 AI 产业链。",
    descEn: "Chinese 24/7 global feed for geopolitics, rates, overseas tech and AI supply chain.",
  },
  {
    value: "akshare.stock_info_global_em",
    label: "东方财富全球财经",
    labelEn: "Eastmoney Global",
    desc: "东方财富全球财经，覆盖海外市场与国际公司动态。",
    descEn: "Eastmoney global finance, covering overseas markets and international companies.",
  },
  {
    value: "akshare.stock_info_global_futu",
    label: "富途全球资讯",
    labelEn: "Futu Global",
    desc: "富途全球快讯，补充港美股和海外宏观资讯。",
    descEn: "Futu global feed for HK/US equities and overseas macro news.",
  },
  {
    value: "akshare.stock_info_global_ths",
    label: "同花顺全球资讯",
    labelEn: "THS Global",
    desc: "同花顺全球资讯，补充中文国际快讯。",
    descEn: "THS global news as a Chinese global-news supplement.",
  },
  {
    value: "akshare.stock_info_global_sina",
    label: "新浪全球财经",
    labelEn: "Sina Global",
    desc: "新浪全球财经快讯，覆盖国际市场和外资观点。",
    descEn: "Sina global finance feed for global markets and foreign-institution views.",
  },
  {
    value: "rss.bbc_chinese",
    label: "BBC中文国际",
    labelEn: "BBC Chinese",
    desc: "中文国际新闻 RSS，补充地缘政治、国际冲突和海外政策消息。",
    descEn: "Chinese RSS feed for geopolitics, global conflict and overseas policy news.",
  },
  {
    value: "akshare.stock_info_global_cls",
    label: "财联社全球资讯",
    labelEn: "CLS Global via AkShare",
    desc: "财联社全球资讯补充源，可能受 akshare 超时影响。",
    descEn: "CLS global-news supplement; may be affected by AkShare timeouts.",
  },
  {
    value: "akshare.news_economic_baidu",
    label: "百度经济日历",
    labelEn: "Baidu Economic Calendar",
    desc: "国际宏观数据发布时间表，可补充利率、CPI、就业等事件。",
    descEn: "International macro calendar for rates, CPI, employment and similar events.",
  },
];

const WATCHLIST_NEWS_PROVIDER_OPTIONS = [
  {
    value: "akshare.stock_news_em",
    label: "东方财富个股新闻",
    labelEn: "Eastmoney Stock News",
    desc: "按自选和模拟持仓股票代码拉取个股新闻。",
    descEn: "Fetch stock news by watchlist and simulated positions.",
  },
  {
    value: "eastmoney.announcements",
    label: "东方财富公告",
    labelEn: "Eastmoney Announcements",
    desc: "按自选和模拟持仓股票拉取最新公告。",
    descEn: "Fetch latest announcements for watchlist and simulated positions.",
  },
  {
    value: "eastmoney.research_reports",
    label: "东方财富研报",
    labelEn: "Eastmoney Research Reports",
    desc: "按自选和模拟持仓股票拉取券商研报。",
    descEn: "Fetch broker research reports for watchlist and simulated positions.",
  },
  {
    value: "eastmoney.guba",
    label: "东方财富股吧",
    labelEn: "Eastmoney Guba",
    desc: "解析东方财富股吧帖子标题、阅读和评论热度。",
    descEn: "Parse Eastmoney Guba post titles, reads and comments.",
  },
];

function normalizeDashboardNewsSettings(value: any): DashboardNewsSettings {
  const raw = value && typeof value === "object" ? value : {};
  const normalizeProviders = (
    rawProviders: any,
    fallback: string[],
    allowedOptions: { value: string }[],
    legacyProvider?: any,
  ) => {
    const source = Array.isArray(rawProviders)
      ? rawProviders
      : typeof rawProviders === "string"
        ? rawProviders.split(/[,;\s]+/)
        : legacyProvider
          ? [legacyProvider]
          : fallback;
    const allowed = new Set(allowedOptions.map((item) => item.value));
    const selected = Array.from(
      new Set(
        source
          .map((item: any) => String(item || "").trim())
          .filter((item: string) => allowed.has(item)),
      ),
    );
    return selected.length ? selected : fallback;
  };
  const domesticProviders = normalizeProviders(
    raw?.domestic?.providers,
    DASHBOARD_NEWS_DEFAULTS.domestic.providers,
    DOMESTIC_NEWS_PROVIDER_OPTIONS,
    raw?.domestic?.provider,
  );
  const internationalProviders = normalizeProviders(
    raw?.international?.providers,
    DASHBOARD_NEWS_DEFAULTS.international.providers,
    INTERNATIONAL_NEWS_PROVIDER_OPTIONS,
  );
  const watchlistProviders = normalizeProviders(
    raw?.watchlist?.providers,
    DASHBOARD_NEWS_DEFAULTS.watchlist.providers,
    WATCHLIST_NEWS_PROVIDER_OPTIONS,
    raw?.watchlist?.provider,
  );
  return {
    domestic: {
      ...DASHBOARD_NEWS_DEFAULTS.domestic,
      ...(raw.domestic || {}),
      enabled: Boolean(raw?.domestic?.enabled ?? DASHBOARD_NEWS_DEFAULTS.domestic.enabled),
      limit: Math.max(1, Math.min(30, Number(raw?.domestic?.limit) || DASHBOARD_NEWS_DEFAULTS.domestic.limit)),
      provider: domesticProviders[0],
      providers: domesticProviders,
    },
    international: {
      ...DASHBOARD_NEWS_DEFAULTS.international,
      ...(raw.international || {}),
      enabled: Boolean(raw?.international?.enabled ?? DASHBOARD_NEWS_DEFAULTS.international.enabled),
      limit: Math.max(1, Math.min(30, Number(raw?.international?.limit) || DASHBOARD_NEWS_DEFAULTS.international.limit)),
      providers: internationalProviders,
    },
    watchlist: {
      ...DASHBOARD_NEWS_DEFAULTS.watchlist,
      ...(raw.watchlist || {}),
      enabled: Boolean(raw?.watchlist?.enabled ?? DASHBOARD_NEWS_DEFAULTS.watchlist.enabled),
      limit: Math.max(1, Math.min(30, Number(raw?.watchlist?.limit) || DASHBOARD_NEWS_DEFAULTS.watchlist.limit)),
      provider: watchlistProviders[0],
      providers: watchlistProviders,
    },
  };
}

function NewsConfigSection() {
  const lt = useLangText();
  const canManageSystem = hasPermission("system.manage");
  const [settings, setSettings] = useState<DashboardNewsSettings>(DASHBOARD_NEWS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"muted" | "success" | "error">("muted");

  useEffect(() => {
    if (!canManageSystem) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (api as any)
      .getAdminNewsSettings()
      .then((result: any) => {
        setSettings(normalizeDashboardNewsSettings(result?.settings));
        setMsg("");
      })
      .catch((e: any) => {
        setMsg(e?.message || lt("资讯来源配置加载失败", "Failed to load news source settings"));
        setMsgTone("error");
      })
      .finally(() => setLoading(false));
  }, [canManageSystem]);

  const patchNewsSection = <K extends keyof DashboardNewsSettings>(
    key: K,
    patch: Partial<DashboardNewsSettings[K]>,
  ) => {
    setSettings((prev) =>
      normalizeDashboardNewsSettings({
        ...prev,
        [key]: {
          ...prev[key],
          ...patch,
        },
      }),
    );
  };

  const toggleNewsProvider = (
    section: "domestic" | "international" | "watchlist",
    provider: string,
  ) => {
    setSettings((prev) => {
      const current = prev[section].providers || [];
      const providers = current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider];
      return normalizeDashboardNewsSettings({
        ...prev,
        [section]: {
          ...prev[section],
          providers,
        },
      });
    });
  };

  const saveNewsSettings = async () => {
    setSaving(true);
    setMsg("");
    setMsgTone("muted");
    try {
      const normalized = normalizeDashboardNewsSettings(settings);
      const result: any = await (api as any).saveAdminNewsSettings({ settings: normalized });
      setSettings(normalizeDashboardNewsSettings(result?.settings || normalized));
      setMsg(lt("资讯来源配置已保存", "News source settings saved"));
      setMsgTone("success");
    } catch (e: any) {
      setMsg(e?.message || lt("资讯来源配置保存失败", "Failed to save news source settings"));
      setMsgTone("error");
    } finally {
      setSaving(false);
    }
  };

  if (!canManageSystem) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>{lt("资讯来源", "News Sources")}</h2>
          <p>{lt("资讯来源配置仅系统管理员可见。", "News source settings are only visible to administrators.")}</p>
        </div>
      </div>
    );
  }

  const SourceToggle = ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <label className="settings-news-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{checked ? lt("已启用", "Enabled") : lt("未启用", "Disabled")}</span>
    </label>
  );

  return (
    <div className="settings-section settings-news-settings-section">
      <div className="settings-section-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="material-symbols-outlined" style={{ color: "var(--primary)" }}>
            newspaper
          </span>
          <h2>{lt("资讯来源", "News Sources")}</h2>
        </div>
        <p>
          {lt(
            "配置行情数据页市场资讯的来源、启用状态和展示条数。",
            "Configure news sources, enabled state and item limits for Market Data.",
          )}
        </p>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {lt("资讯来源配置加载中...", "Loading news source settings...")}
        </p>
      ) : (
        <div className="settings-news-grid">
          <div className="settings-subcard settings-news-source-card">
            <div className="settings-news-card-header">
              <div>
                <h3>{lt("国内资讯", "Domestic News")}</h3>
                <p>{lt("用于行情数据页国内资讯列表。", "Used by the domestic news list on Market Data.")}</p>
              </div>
              <SourceToggle
                checked={settings.domestic.enabled}
                onChange={(enabled) => patchNewsSection("domestic", { enabled })}
              />
            </div>
            <div className="settings-news-provider-list">
              {DOMESTIC_NEWS_PROVIDER_OPTIONS.map((option) => (
                <label key={option.value} className="settings-news-provider-option">
                  <input
                    type="checkbox"
                    checked={settings.domestic.providers.includes(option.value)}
                    onChange={() => toggleNewsProvider("domestic", option.value)}
                  />
                  <span>
                    <strong>{lt(option.label, option.labelEn)}</strong>
                    <small>{lt(option.desc, option.descEn)}</small>
                    <small>{option.value}</small>
                  </span>
                </label>
              ))}
            </div>
            <label className="settings-field">
              <span>{lt("展示条数", "Item Limit")}</span>
              <input
                className="figma-input"
                type="number"
                min={1}
                max={30}
                value={settings.domestic.limit}
                onChange={(event) => patchNewsSection("domestic", { limit: Number(event.target.value) })}
              />
            </label>
          </div>

          <div className="settings-subcard settings-news-source-card">
            <div className="settings-news-card-header">
              <div>
                <h3>{lt("国际资讯", "Global News")}</h3>
                <p>{lt("聚合中文国际资讯，并标记 AI 产业链相关消息。", "Aggregate Chinese global news and mark AI supply-chain items.")}</p>
              </div>
              <SourceToggle
                checked={settings.international.enabled}
                onChange={(enabled) => patchNewsSection("international", { enabled })}
              />
            </div>
            <label className="settings-field">
              <span>{lt("展示条数", "Item Limit")}</span>
              <input
                className="figma-input"
                type="number"
                min={1}
                max={30}
                value={settings.international.limit}
                onChange={(event) => patchNewsSection("international", { limit: Number(event.target.value) })}
              />
            </label>
            <div className="settings-news-provider-list">
              {INTERNATIONAL_NEWS_PROVIDER_OPTIONS.map((option) => (
                <label key={option.value} className="settings-news-provider-option">
                  <input
                    type="checkbox"
                    checked={settings.international.providers.includes(option.value)}
                    onChange={() => toggleNewsProvider("international", option.value)}
                  />
                  <span>
                    <strong>{lt(option.label, option.labelEn)}</strong>
                    <small>{lt(option.desc, option.descEn)}</small>
                    <small>{option.value}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="settings-subcard settings-news-source-card">
            <div className="settings-news-card-header">
              <div>
                <h3>{lt("自选/持仓资讯", "Watchlist / Position News")}</h3>
                <p>{lt("按用户自选和模拟持仓股票拉取相关个股新闻。", "Fetch related stock news by watchlist and simulated positions.")}</p>
              </div>
              <SourceToggle
                checked={settings.watchlist.enabled}
                onChange={(enabled) => patchNewsSection("watchlist", { enabled })}
              />
            </div>
            <div className="settings-news-provider-list">
              {WATCHLIST_NEWS_PROVIDER_OPTIONS.map((option) => (
                <label key={option.value} className="settings-news-provider-option">
                  <input
                    type="checkbox"
                    checked={settings.watchlist.providers.includes(option.value)}
                    onChange={() => toggleNewsProvider("watchlist", option.value)}
                  />
                  <span>
                    <strong>{lt(option.label, option.labelEn)}</strong>
                    <small>{lt(option.desc, option.descEn)}</small>
                    <small>{option.value}</small>
                  </span>
                </label>
              ))}
            </div>
            <label className="settings-field">
              <span>{lt("展示条数", "Item Limit")}</span>
              <input
                className="figma-input"
                type="number"
                min={1}
                max={30}
                value={settings.watchlist.limit}
                onChange={(event) => patchNewsSection("watchlist", { limit: Number(event.target.value) })}
              />
            </label>
          </div>
        </div>
      )}

      <div className="settings-news-actions">
        <span className={`settings-news-message ${msgTone}`}>{msg}</span>
        <button
          className="figma-btn figma-btn-primary"
          type="button"
          onClick={saveNewsSettings}
          disabled={loading || saving}
        >
          {saving ? lt("保存中...", "Saving...") : lt("保存资讯来源", "Save News Sources")}
        </button>
      </div>
    </div>
  );
}

/* ── Preferences Section ─────────────────────────────────────────────────── */

interface Prefs {
  theme: "dark" | "light";
  systemTray: boolean;
  tradeAlerts: boolean;
  aiAlerts: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
  defaultMarket: string;
  chartStyle: string;
}

function loadPrefs(): Prefs {
  const defaults: Prefs = {
    theme: "dark",
    systemTray: true,
    tradeAlerts: true,
    aiAlerts: false,
    autoRefresh: true,
    refreshInterval: 30,
    defaultMarket: "A股",
    chartStyle: "K线",
  };
  try {
    const saved = localStorage.getItem("quartsys_prefs");
    if (saved) {
      const parsed = { ...defaults, ...JSON.parse(saved) };
      if (parsed.defaultMarket === "加密货币") {
        parsed.defaultMarket = "A股";
      }
      return parsed;
    }
  } catch {}
  return defaults;
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem("quartsys_prefs", JSON.stringify(p));
  } catch {}
}

const DEFAULT_RISK_MONITOR_CONFIG = {
  watched_sectors: ["半导体", "人工智能", "新能源"],
  max_sectors: 12,
  risk_dimensions: [
    "市场宽度",
    "北向资金",
    "南向资金",
    "板块资金流",
    "指数波动率",
    "宏观金融数据",
    "地缘政治事件",
    "政策事件",
  ],
  fund_flow_focus: ["北向资金", "南向资金", "板块资金流"],
  notes: "watched_sectors 控制风险监控页默认关注板块，最多12个。",
};

const FALLBACK_RISK_SECTOR_OPTIONS = [
  "半导体",
  "人工智能",
  "新能源",
  "机器人",
  "医药生物",
  "证券",
  "银行",
  "房地产",
  "消费电子",
  "低空经济",
  "军工",
  "有色金属",
];

type RiskSectorOption = {
  name: string;
  type?: string;
  source?: string;
  count?: number;
};

const RISK_DIMENSION_OPTIONS = [
  "市场宽度",
  "北向资金",
  "南向资金",
  "板块资金流",
  "指数波动率",
  "宏观金融数据",
  "地缘政治事件",
  "政策事件",
];

const FUND_FLOW_FOCUS_OPTIONS = ["北向资金", "南向资金", "板块资金流"];

type RiskEventRuleDraft = {
  keywords: string[];
  severe_keywords: string[];
  market_keywords: Record<MarketCode, string[]>;
  base_score: number;
  hit_score: number;
  severe_score: number;
  max_hits: number;
  max_severe_hits: number;
};

type RiskEventRulesDraft = {
  geopolitical: RiskEventRuleDraft;
  policy: RiskEventRuleDraft;
};

const DEFAULT_RISK_EVENT_RULES: RiskEventRulesDraft = {
  geopolitical: {
    keywords: ["地缘", "冲突", "战争", "制裁", "关税", "出口管制", "中东", "红海", "霍尔木兹", "乌克兰", "台海", "trade war", "sanction", "tariff", "war", "conflict"],
    severe_keywords: ["战争", "冲突", "制裁", "霍尔木兹", "war", "sanction", "conflict"],
    market_keywords: { CN: [], HK: [], US: [] },
    base_score: 18,
    hit_score: 5.5,
    severe_score: 4,
    max_hits: 8,
    max_severe_hits: 5,
  },
  policy: {
    keywords: [],
    severe_keywords: ["紧急", "加息", "监管", "制裁", "rate hike", "emergency", "ban"],
    market_keywords: {
      CN: ["国务院", "证监会", "央行", "财政部", "监管", "政策", "降准", "降息", "房地产"],
      HK: ["香港金管局", "港交所", "香港政府", "施政报告", "监管", "利率", "联系汇率"],
      US: ["美联储", "fomc", "federal reserve", "sec", "rate cut", "rate hike", "regulation", "policy"],
    },
    base_score: 18,
    hit_score: 5.5,
    severe_score: 4,
    max_hits: 8,
    max_severe_hits: 5,
  },
};

function normalizeRiskEventRules(value: unknown): RiskEventRulesDraft {
  const raw = value && typeof value === "object" ? value as any : {};
  const normalizeRule = (key: keyof RiskEventRulesDraft): RiskEventRuleDraft => {
    const fallback = DEFAULT_RISK_EVENT_RULES[key];
    const rule = raw[key] && typeof raw[key] === "object" ? raw[key] : {};
    const marketKeywords = rule.market_keywords && typeof rule.market_keywords === "object" ? rule.market_keywords : {};
    return {
      keywords: Array.isArray(rule.keywords) ? rule.keywords.map(String).filter(Boolean) : fallback.keywords,
      severe_keywords: Array.isArray(rule.severe_keywords) ? rule.severe_keywords.map(String).filter(Boolean) : fallback.severe_keywords,
      market_keywords: {
        CN: Array.isArray(marketKeywords.CN) ? marketKeywords.CN.map(String).filter(Boolean) : fallback.market_keywords.CN,
        HK: Array.isArray(marketKeywords.HK) ? marketKeywords.HK.map(String).filter(Boolean) : fallback.market_keywords.HK,
        US: Array.isArray(marketKeywords.US) ? marketKeywords.US.map(String).filter(Boolean) : fallback.market_keywords.US,
      },
      base_score: Number.isFinite(Number(rule.base_score)) ? Number(rule.base_score) : fallback.base_score,
      hit_score: Number.isFinite(Number(rule.hit_score)) ? Number(rule.hit_score) : fallback.hit_score,
      severe_score: Number.isFinite(Number(rule.severe_score)) ? Number(rule.severe_score) : fallback.severe_score,
      max_hits: Number.isFinite(Number(rule.max_hits)) ? Number(rule.max_hits) : fallback.max_hits,
      max_severe_hits: Number.isFinite(Number(rule.max_severe_hits)) ? Number(rule.max_severe_hits) : fallback.max_severe_hits,
    };
  };
  return { geopolitical: normalizeRule("geopolitical"), policy: normalizeRule("policy") };
}

type RiskMonitorConfig = typeof DEFAULT_RISK_MONITOR_CONFIG;

function formatRiskMonitorConfig(config: unknown) {
  const value =
    config && typeof config === "object"
      ? config
      : DEFAULT_RISK_MONITOR_CONFIG;
  return JSON.stringify(value, null, 2);
}

function splitConfigList(value: string) {
  return value
    .split(/[，,、\n\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRiskMonitorConfig(value: unknown): RiskMonitorConfig {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as any) : {};
  return {
    ...DEFAULT_RISK_MONITOR_CONFIG,
    ...raw,
    watched_sectors: Array.isArray(raw.watched_sectors)
      ? raw.watched_sectors.map(String).filter(Boolean)
      : DEFAULT_RISK_MONITOR_CONFIG.watched_sectors,
    max_sectors: Number.isFinite(Number(raw.max_sectors))
      ? Math.max(1, Math.min(50, Number(raw.max_sectors)))
      : DEFAULT_RISK_MONITOR_CONFIG.max_sectors,
    risk_dimensions: Array.isArray(raw.risk_dimensions)
      ? raw.risk_dimensions.map(String).filter(Boolean)
      : DEFAULT_RISK_MONITOR_CONFIG.risk_dimensions,
    fund_flow_focus: Array.isArray(raw.fund_flow_focus)
      ? raw.fund_flow_focus.map(String).filter(Boolean)
      : DEFAULT_RISK_MONITOR_CONFIG.fund_flow_focus,
    notes: typeof raw.notes === "string" ? raw.notes : DEFAULT_RISK_MONITOR_CONFIG.notes,
  };
}

function RiskMonitorSettingsSection() {
  const lt = useLangText();
  const isSystemAdmin = normalizedRole(getAuthUser()?.role) === "admin";
  const [riskConfigText, setRiskConfigText] = useState(() =>
    formatRiskMonitorConfig(DEFAULT_RISK_MONITOR_CONFIG),
  );
  const [riskConfigMsg, setRiskConfigMsg] = useState("");
  const [riskConfigMsgTone, setRiskConfigMsgTone] = useState<"muted" | "success" | "error">("muted");
  const [riskConfigSaving, setRiskConfigSaving] = useState(false);
  const [sectorOptions, setSectorOptions] = useState<RiskSectorOption[]>(
    FALLBACK_RISK_SECTOR_OPTIONS.map((name) => ({ name, type: "default" })),
  );
  const [sectorPickerOpen, setSectorPickerOpen] = useState(false);
  const [sectorSearch, setSectorSearch] = useState("");
  const [sectorTypeFilter, setSectorTypeFilter] = useState("all");
  const [eventRules, setEventRules] = useState<RiskEventRulesDraft>(DEFAULT_RISK_EVENT_RULES);
  const [eventRulesSaving, setEventRulesSaving] = useState(false);
  const [eventRulesMsg, setEventRulesMsg] = useState("");
  const riskConfigStats = useMemo(() => {
    try {
      const parsed = JSON.parse(riskConfigText);
      const sectors = Array.isArray(parsed?.watched_sectors) ? parsed.watched_sectors.length : 0;
      return { valid: true, sectors, chars: riskConfigText.length };
    } catch {
      return { valid: false, sectors: 0, chars: riskConfigText.length };
    }
  }, [riskConfigText]);
  const riskConfigDraft = useMemo(() => {
    try {
      return normalizeRiskMonitorConfig(JSON.parse(riskConfigText));
    } catch {
      return normalizeRiskMonitorConfig(DEFAULT_RISK_MONITOR_CONFIG);
    }
  }, [riskConfigText]);
  const sectorTypeOptions = useMemo(() => {
    const labels: Record<string, string> = {
      concept: "概念板块",
      industry: "行业",
      board: "市场板块",
      default: "默认",
    };
    const types = [...new Set(sectorOptions.map((item) => item.type || "default"))];
    return types.map((type) => ({ value: type, label: labels[type] || type }));
  }, [sectorOptions]);
  const filteredSectorOptions = useMemo(() => {
    const keyword = sectorSearch.trim().toLowerCase();
    return sectorOptions.filter((option) => {
      const type = option.type || "default";
      if (sectorTypeFilter !== "all" && type !== sectorTypeFilter) return false;
      if (!keyword) return true;
      return `${option.name} ${option.type || ""} ${option.source || ""}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [sectorOptions, sectorSearch, sectorTypeFilter]);
  const previewSectorOptions = useMemo(
    () => sectorOptions.slice(0, 28),
    [sectorOptions],
  );

  useEffect(() => {
    api
      .getRiskMonitorSettings()
      .then((data: any) => {
        setRiskConfigText(formatRiskMonitorConfig(data?.config));
      })
      .catch(() => {
        setRiskConfigText(formatRiskMonitorConfig(DEFAULT_RISK_MONITOR_CONFIG));
      });
    (api as any)
      .getRiskSectorOptions()
      .then((data: any) => {
        const options = Array.isArray(data?.options) ? data.options : [];
        if (options.length) setSectorOptions(options);
      })
      .catch(() => {});
    if (isSystemAdmin) {
      api
        .getAdminRiskEventRules()
        .then((data: any) => setEventRules(normalizeRiskEventRules(data?.config)))
        .catch(() => setEventRules(DEFAULT_RISK_EVENT_RULES));
    }
  }, [isSystemAdmin]);

  const saveRiskMonitorConfig = async () => {
    setRiskConfigSaving(true);
    setRiskConfigMsg("");
    setRiskConfigMsgTone("muted");
    try {
      const parsed = JSON.parse(riskConfigText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(lt("JSON 必须是对象格式", "JSON must be an object"));
      }
      if (!Array.isArray(parsed.watched_sectors)) {
        throw new Error(lt("必须包含 watched_sectors 数组", "watched_sectors must be an array"));
      }
      const savedConfig: any = await api.saveRiskMonitorSettings(parsed);
      setRiskConfigText(formatRiskMonitorConfig(savedConfig?.config || parsed));
      if (Array.isArray(savedConfig?.watched_sectors)) {
        localStorage.setItem("risk_watched_sectors", JSON.stringify(savedConfig.watched_sectors));
      }
      setRiskConfigMsg(lt("风险监控配置已保存", "Risk monitor config saved"));
      setRiskConfigMsgTone("success");
    } catch (e: any) {
      setRiskConfigMsg(e?.message || lt("风险监控配置保存失败", "Failed to save risk monitor config"));
      setRiskConfigMsgTone("error");
    } finally {
      setRiskConfigSaving(false);
    }
  };

  const formatRiskConfigDraft = () => {
    try {
      const parsed = JSON.parse(riskConfigText);
      setRiskConfigText(formatRiskMonitorConfig(parsed));
      setRiskConfigMsg(lt("JSON 已格式化", "JSON formatted"));
      setRiskConfigMsgTone("success");
    } catch (e: any) {
      setRiskConfigMsg(`${lt("JSON 格式错误", "Invalid JSON")}: ${e?.message || "parse failed"}`);
      setRiskConfigMsgTone("error");
    }
  };

  const resetRiskConfigDraft = () => {
    setRiskConfigText(formatRiskMonitorConfig(DEFAULT_RISK_MONITOR_CONFIG));
    setRiskConfigMsg(lt("已恢复默认配置，保存后生效", "Default config restored. Save to apply."));
    setRiskConfigMsgTone("muted");
  };

  const exportRiskConfig = async () => {
    try {
      const exported = await (api as any).exportRiskMonitorSettings();
      setRiskConfigText(formatRiskMonitorConfig(exported));
      setRiskConfigMsg(lt("已读取独立 JSON 配置", "Independent JSON config loaded"));
      setRiskConfigMsgTone("success");
    } catch (e: any) {
      setRiskConfigMsg(e?.message || lt("读取独立 JSON 失败", "Failed to load independent JSON"));
      setRiskConfigMsgTone("error");
    }
  };

  const patchRiskConfigDraft = (patcher: (config: RiskMonitorConfig) => RiskMonitorConfig) => {
    const next = patcher(riskConfigDraft);
    setRiskConfigText(formatRiskMonitorConfig(next));
    setRiskConfigMsg(lt("字段配置已同步到 JSON，保存后生效", "Field config synced to JSON. Save to apply."));
    setRiskConfigMsgTone("muted");
  };

  const updateRiskListField = (
    key: "watched_sectors" | "risk_dimensions" | "fund_flow_focus",
    values: string[],
  ) => {
    let unique = [...new Set(values.map((item) => item.trim()).filter(Boolean))];
    if (key === "watched_sectors") {
      unique = unique.slice(0, Math.max(1, Math.min(50, Number(riskConfigDraft.max_sectors) || 12)));
    }
    patchRiskConfigDraft((config) => ({ ...config, [key]: unique }));
  };

  const toggleRiskListValue = (
    key: "watched_sectors" | "risk_dimensions" | "fund_flow_focus",
    value: string,
  ) => {
    const current = Array.isArray(riskConfigDraft[key]) ? riskConfigDraft[key] : [];
    updateRiskListField(
      key,
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const selectFilteredSectors = () => {
    updateRiskListField("watched_sectors", [
      ...riskConfigDraft.watched_sectors,
      ...filteredSectorOptions.map((item) => item.name),
    ]);
  };

  const patchEventRule = (
    key: keyof RiskEventRulesDraft,
    patch: Partial<RiskEventRuleDraft>,
  ) => {
    setEventRules((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
    setEventRulesMsg("");
  };

  const saveEventRules = async () => {
    if (!isSystemAdmin || eventRulesSaving) return;
    setEventRulesSaving(true);
    setEventRulesMsg("");
    try {
      const response: any = await api.saveAdminRiskEventRules(eventRules);
      setEventRules(normalizeRiskEventRules(response?.config));
      setEventRulesMsg(lt("事件命中规则已保存", "Event matching rules saved"));
    } catch (error: any) {
      setEventRulesMsg(error?.message || lt("事件规则保存失败", "Failed to save event rules"));
    } finally {
      setEventRulesSaving(false);
    }
  };

  return (
    <div className="settings-section settings-risk-settings-section">
      <div className="settings-section-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="material-symbols-outlined" style={{ color: "var(--primary)" }}>
            security
          </span>
          <h2>{lt("风险监控设置", "Risk Monitor Settings")}</h2>
        </div>
        <p>
          {lt(
            "单独配置风险监控页默认关注的板块、风险维度和资金流监控口径。",
            "Configure Risk Monitor defaults, sectors, risk dimensions and fund-flow scope.",
          )}
        </p>
      </div>

      <div className="settings-subcard settings-risk-config-card">
        <div className="settings-subcard-header">
          <div>
            <h3>{lt("监控配置", "Monitor Config")}</h3>
            <p>
              {lt(
                "字段配置适合日常使用；JSON 高级配置用于批量复制、备份或更细粒度调整。",
                "Use fields for daily edits; use JSON for bulk copy, backup or advanced changes.",
              )}
            </p>
          </div>
        </div>
        <div className="settings-field">
          <div className="settings-risk-field-config">
            <div className="settings-risk-field-header">
              <div>
                <strong>{lt("字段配置", "Field Config")}</strong>
                <p>
                  {lt(
                    "常用配置可直接填写，系统会自动同步到下方 JSON。",
                    "Edit common fields directly; changes sync to the JSON below.",
                  )}
                </p>
              </div>
            </div>

            <div className="settings-risk-field-grid">
              <div className="settings-risk-field-item settings-risk-field-wide">
                <label>{lt("关注板块", "Watched Sectors")}</label>
                <input
                  className="figma-input"
                  value={riskConfigDraft.watched_sectors.join("，")}
                  onChange={(event) => updateRiskListField("watched_sectors", splitConfigList(event.target.value))}
                  placeholder={lt("例如：半导体，人工智能，新能源", "e.g. Semiconductors, AI, New Energy")}
                />
                <div className="settings-risk-sector-toolbar">
                  <span>
                    {lt("已选", "Selected")} {riskConfigDraft.watched_sectors.length} / {riskConfigDraft.max_sectors}
                  </span>
                  <button className="figma-btn" type="button" onClick={() => setSectorPickerOpen(true)}>
                    {lt("查看全部板块", "View All Sectors")}
                  </button>
                </div>
                <div className="settings-risk-chip-row">
                  {previewSectorOptions.map((option) => {
                    const active = riskConfigDraft.watched_sectors.includes(option.name);
                    return (
                      <button
                        key={`${option.type || "sector"}-${option.name}`}
                        type="button"
                        className={`settings-risk-chip ${active ? "active" : ""}`}
                        title={`${option.type || ""}${option.source ? ` · ${option.source}` : ""}${option.count ? ` · ${option.count}` : ""}`}
                        onClick={() => toggleRiskListValue("watched_sectors", option.name)}
                      >
                        {option.name}
                      </button>
                    );
                  })}
                  {sectorOptions.length > previewSectorOptions.length && (
                    <button className="settings-risk-chip more" type="button" onClick={() => setSectorPickerOpen(true)}>
                      +{sectorOptions.length - previewSectorOptions.length}
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-risk-field-item">
                <label>{lt("最大板块数", "Max Sectors")}</label>
                <input
                  className="figma-input"
                  type="number"
                  min={1}
                  max={50}
                  value={riskConfigDraft.max_sectors}
                  onChange={(event) =>
                    patchRiskConfigDraft((config) => {
                      const max = Math.max(1, Math.min(50, Number(event.target.value) || 1));
                      return {
                        ...config,
                        max_sectors: max,
                        watched_sectors: config.watched_sectors.slice(0, max),
                      };
                    })
                  }
                />
              </div>

              <div className="settings-risk-field-item settings-risk-field-wide">
                <label>{lt("系统性风险维度", "Systemic Risk Dimensions")}</label>
                <div className="settings-risk-check-grid">
                  {RISK_DIMENSION_OPTIONS.map((dimension) => (
                    <label key={dimension} className="settings-risk-check">
                      <input
                        type="checkbox"
                        checked={riskConfigDraft.risk_dimensions.includes(dimension)}
                        onChange={() => toggleRiskListValue("risk_dimensions", dimension)}
                      />
                      <span>{dimension}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="settings-risk-field-item settings-risk-field-wide">
                <label>{lt("资金流监控口径", "Fund-flow Focus")}</label>
                <div className="settings-risk-check-grid compact">
                  {FUND_FLOW_FOCUS_OPTIONS.map((focus) => (
                    <label key={focus} className="settings-risk-check">
                      <input
                        type="checkbox"
                        checked={riskConfigDraft.fund_flow_focus.includes(focus)}
                        onChange={() => toggleRiskListValue("fund_flow_focus", focus)}
                      />
                      <span>{focus}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="settings-risk-field-item settings-risk-field-wide">
                <label>{lt("配置说明", "Notes")}</label>
                <textarea
                  className="settings-risk-notes"
                  value={riskConfigDraft.notes}
                  onChange={(event) =>
                    patchRiskConfigDraft((config) => ({ ...config, notes: event.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="settings-json-panel">
            <label>{lt("高级 JSON 配置", "Advanced JSON Config")}</label>
            <div className="settings-json-toolbar">
              <div className="settings-json-status">
                <span className={riskConfigStats.valid ? "is-valid" : "is-invalid"}>
                  {riskConfigStats.valid ? lt("JSON 有效", "Valid JSON") : lt("JSON 待修正", "Invalid JSON")}
                </span>
                <span>{lt("关注板块", "Sectors")}: {riskConfigStats.sectors}</span>
                <span>{riskConfigStats.chars} {lt("字符", "chars")}</span>
              </div>
              <div className="settings-json-tools">
                <button className="figma-btn" type="button" onClick={formatRiskConfigDraft}>
                  {lt("格式化 JSON", "Format JSON")}
                </button>
                <button className="figma-btn" type="button" onClick={resetRiskConfigDraft}>
                  {lt("恢复默认", "Reset Default")}
                </button>
                <button className="figma-btn" type="button" onClick={exportRiskConfig}>
                  {lt("读取独立 JSON", "Load JSON")}
                </button>
              </div>
            </div>
            <textarea
              className="settings-json-textarea"
              value={riskConfigText}
              onChange={(event) => {
                setRiskConfigText(event.target.value);
                setRiskConfigMsg("");
                setRiskConfigMsgTone("muted");
              }}
              spellCheck={false}
              wrap="off"
            />
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
            {lt(
              "保存后风险监控页会按该配置加载资金流和系统性风险。",
              "After saving, Risk Monitor will load fund flow and systemic risk by this config.",
            )}
          </p>
          <div className="settings-risk-config-actions">
            <span className={`settings-risk-config-message ${riskConfigMsgTone}`}>
              {riskConfigMsg}
            </span>
            <button
              className="figma-btn figma-btn-primary"
              type="button"
              onClick={saveRiskMonitorConfig}
              disabled={riskConfigSaving}
            >
              {riskConfigSaving ? lt("保存中...", "Saving...") : lt("保存风险配置", "Save Risk Config")}
            </button>
          </div>
          {sectorPickerOpen && (
            <div className="settings-sector-modal-backdrop" role="dialog" aria-modal="true">
              <div className="settings-sector-modal">
                <div className="settings-sector-modal-header">
                  <div>
                    <h3>{lt("全部可选板块", "All Sector Options")}</h3>
                    <p>{lt("可按概念、行业、市场板块筛选；点击板块即可加入或移除监控列表。", "Filter by concept, industry, or board; click a sector to add or remove it.")}</p>
                  </div>
                  <button className="figma-btn" type="button" onClick={() => setSectorPickerOpen(false)}>
                    {lt("关闭", "Close")}
                  </button>
                </div>
                <div className="settings-sector-modal-tools">
                  <input
                    className="figma-input"
                    placeholder={lt("搜索板块名称、来源", "Search sector name or source")}
                    value={sectorSearch}
                    onChange={(event) => setSectorSearch(event.target.value)}
                  />
                  <select
                    className="figma-input"
                    value={sectorTypeFilter}
                    onChange={(event) => setSectorTypeFilter(event.target.value)}
                  >
                    <option value="all">{lt("全部类型", "All Types")}</option>
                    {sectorTypeOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <button className="figma-btn" type="button" onClick={selectFilteredSectors}>
                    {lt("选择当前结果", "Select Results")}
                  </button>
                </div>
                <div className="settings-sector-modal-meta">
                  <span>{lt("候选", "Options")} {filteredSectorOptions.length}</span>
                  <span>{lt("已选", "Selected")} {riskConfigDraft.watched_sectors.length}</span>
                </div>
                <div className="settings-sector-modal-grid">
                  {filteredSectorOptions.map((option) => {
                    const active = riskConfigDraft.watched_sectors.includes(option.name);
                    return (
                      <button
                        key={`${option.type || "sector"}-${option.name}`}
                        className={`settings-sector-option ${active ? "active" : ""}`}
                        type="button"
                        onClick={() => toggleRiskListValue("watched_sectors", option.name)}
                      >
                        <strong>{option.name}</strong>
                        <span>
                          {option.type || "sector"}
                          {option.count ? ` · ${option.count}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {isSystemAdmin && (
        <div className="settings-subcard settings-risk-event-rules-card">
          <div className="settings-subcard-header">
            <div>
              <h3>{lt("事件命中规则", "Event Matching Rules")}</h3>
              <p>{lt("由系统管理员维护地缘政治与政策新闻的关键词、严重关键词和风险计分参数。", "Administrators manage keywords, severe terms and scoring parameters for geopolitical and policy news.")}</p>
            </div>
          </div>
          <div className="settings-risk-event-rule-grid">
            {(["geopolitical", "policy"] as const).map((ruleKey) => {
              const rule = eventRules[ruleKey];
              const title = ruleKey === "geopolitical"
                ? lt("地缘政治事件", "Geopolitical Events")
                : lt("政策事件", "Policy Events");
              return (
                <section key={ruleKey} className="settings-risk-event-rule">
                  <h4>{title}</h4>
                  <label className="settings-field settings-risk-event-wide">
                    <span>{lt("通用命中关键词", "Common Keywords")}</span>
                    <textarea
                      value={rule.keywords.join("，")}
                      onChange={(event) => patchEventRule(ruleKey, { keywords: splitConfigList(event.target.value) })}
                    />
                  </label>
                  <label className="settings-field settings-risk-event-wide">
                    <span>{lt("严重风险关键词", "Severe Keywords")}</span>
                    <textarea
                      value={rule.severe_keywords.join("，")}
                      onChange={(event) => patchEventRule(ruleKey, { severe_keywords: splitConfigList(event.target.value) })}
                    />
                  </label>
                  {MARKET_ORDER.map((marketCode) => (
                    <label key={marketCode} className="settings-field settings-risk-event-wide">
                      <span>{lt(MARKET_DEFINITIONS[marketCode].labelZh, MARKET_DEFINITIONS[marketCode].labelEn)} {lt("专属关键词", "Market Keywords")}</span>
                      <input
                        value={rule.market_keywords[marketCode].join("，")}
                        onChange={(event) => patchEventRule(ruleKey, {
                          market_keywords: {
                            ...rule.market_keywords,
                            [marketCode]: splitConfigList(event.target.value),
                          },
                        })}
                      />
                    </label>
                  ))}
                  <div className="settings-risk-event-score-grid">
                    {[
                      { key: "base_score", zh: "基础风险分", en: "Base Score", min: 0, max: 100, step: 1 },
                      { key: "hit_score", zh: "每条命中加分", en: "Per-hit Score", min: 0, max: 30, step: 0.5 },
                      { key: "severe_score", zh: "严重命中加分", en: "Severe-hit Score", min: 0, max: 40, step: 0.5 },
                      { key: "max_hits", zh: "普通命中上限", en: "Max Hits", min: 1, max: 40, step: 1 },
                      { key: "max_severe_hits", zh: "严重命中上限", en: "Max Severe Hits", min: 1, max: 20, step: 1 },
                    ].map((field) => (
                      <label key={field.key} className="settings-field">
                        <span>{lt(field.zh, field.en)}</span>
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={Number(rule[field.key as keyof RiskEventRuleDraft])}
                          onChange={(event) => patchEventRule(ruleKey, {
                            [field.key]: Number(event.target.value),
                          } as Partial<RiskEventRuleDraft>)}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="settings-risk-config-actions">
            <span className="settings-risk-config-message muted">{eventRulesMsg}</span>
            <button className="figma-btn figma-btn-primary" type="button" onClick={saveEventRules} disabled={eventRulesSaving}>
              {eventRulesSaving ? lt("保存中...", "Saving...") : lt("保存事件规则", "Save Event Rules")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreferencesSection() {
  const lt = useLangText();
  const { market, setMarket } = useMarket();
  const { theme, setTheme } = useTheme();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs((current) => ({
      ...current,
      theme,
      defaultMarket: MARKET_DEFINITIONS[market].labelZh,
    }));
  }, [market, theme]);

  const update = <K extends keyof Prefs>(key: K, val: Prefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: val };
      savePrefs(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return next;
    });
  };

  const Toggle = ({
    value,
    onChange,
  }: {
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        background: value ? "var(--primary)" : "var(--border-light)",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          background: "#fff",
          position: "absolute",
          top: 3,
          left: value ? 21 : 3,
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );

  const PrefRow = ({
    label,
    labelEn,
    desc,
    descEn,
    children,
  }: {
    label: string;
    labelEn: string;
    desc: string;
    descEn: string;
    children: React.ReactNode;
  }) => (
    <div className="settings-pref-row">
      <div className="settings-pref-row-copy">
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          {lt(label, labelEn)}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {lt(desc, descEn)}
        </div>
      </div>
      {children}
    </div>
  );

  return (
    <div className="settings-section settings-preferences-section">
      <div className="settings-section-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--primary)" }}
          >
            tune
          </span>
          <h2>{lt("偏好设置", "Preferences")}</h2>
        </div>
        <p>{lt("自定义系统行为和显示偏好，设置即时生效。", "Customize system behavior and display preferences.")}</p>
      </div>

      {/* 界面主题 */}
      <div className="settings-subcard settings-preference-card">
        <div className="settings-preference-card-title">
          <span className="material-symbols-outlined">palette</span>
          <strong>{lt("界面与显示", "Display")}</strong>
        </div>

        <PrefRow label="界面主题" labelEn="Theme" desc="在深色与浅色模式间切换" descEn="Switch between dark and light mode">
          <div style={{ display: "flex", gap: 8 }}>
            {["dark", "light"].map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t as ThemeMode)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "var(--radius-md)",
                  border: `1px solid ${theme === t ? "var(--primary)" : "var(--border-light)"}`,
                  background:
                    theme === t ? "var(--primary-light)" : "transparent",
                  color:
                    theme === t ? "var(--primary)" : "var(--text-muted)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {t === "dark" ? lt("深色", "Dark") : lt("浅色", "Light")}
              </button>
            ))}
          </div>
        </PrefRow>

        <PrefRow label="默认市场" labelEn="Default Market" desc="选择默认查看的市场" descEn="Choose the default market">
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as MarketCode)}
            className="figma-input"
            style={{ width: 120, fontSize: 12 }}
          >
            {MARKET_ORDER.map((marketCode) => (
              <option key={marketCode} value={marketCode}>
                {lt(
                  MARKET_DEFINITIONS[marketCode].labelZh,
                  MARKET_DEFINITIONS[marketCode].labelEn,
                )}
              </option>
            ))}
          </select>
        </PrefRow>

        <PrefRow label="图表风格" labelEn="Chart Style" desc="选择默认的图表展示方式" descEn="Choose the default chart style">
          <select
            value={prefs.chartStyle}
            onChange={(e) => update("chartStyle", e.target.value)}
            className="figma-input"
            style={{ width: 120, fontSize: 12 }}
          >
            {["K线", "折线图", "面积图"].map((s) => (
              <option key={s} value={s}>
                {lt(
                  s,
                  s === "K线" ? "Candlestick" : s === "折线图" ? "Line" : "Area",
                )}
              </option>
            ))}
          </select>
        </PrefRow>
      </div>

      {/* 通知与提醒 */}
      <div className="settings-subcard settings-preference-card">
        <div className="settings-preference-card-title">
          <span className="material-symbols-outlined">notifications</span>
          <strong>{lt("通知与提醒", "Alerts")}</strong>
        </div>

        <PrefRow label="系统托盘运行" labelEn="Tray Mode" desc="保持系统后台运行，接收实时通知" descEn="Keep the system running in the background for notifications">
          <Toggle
            value={prefs.systemTray}
            onChange={(v) => update("systemTray", v)}
          />
        </PrefRow>

        <PrefRow label="交易提醒" labelEn="Trade Alerts" desc="订单成交后推送通知" descEn="Push notifications after orders are filled">
          <Toggle
            value={prefs.tradeAlerts}
            onChange={(v) => update("tradeAlerts", v)}
          />
        </PrefRow>

        <PrefRow label="AI洞察提醒" labelEn="AI Insight Alerts" desc="AI分析完成后推送通知" descEn="Push notifications when AI analysis completes">
          <Toggle
            value={prefs.aiAlerts}
            onChange={(v) => update("aiAlerts", v)}
          />
        </PrefRow>
      </div>

      {/* 数据与刷新 */}
      <div className="settings-subcard settings-preference-card">
        <div className="settings-preference-card-title">
          <span className="material-symbols-outlined">sync</span>
          <strong>{lt("数据与刷新", "Data Refresh")}</strong>
        </div>

        <PrefRow label="自动刷新" labelEn="Auto Refresh" desc="自动刷新市场数据和行情" descEn="Automatically refresh market data and quotes">
          <Toggle
            value={prefs.autoRefresh}
            onChange={(v) => update("autoRefresh", v)}
          />
        </PrefRow>

        <PrefRow label="刷新间隔" labelEn="Refresh Interval" desc="数据自动刷新的时间间隔（分钟）" descEn="Auto-refresh interval in minutes">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={prefs.refreshInterval}
              onChange={(e) =>
                update("refreshInterval", Number(e.target.value))
              }
              style={{ width: 100, accentColor: "var(--primary)" }}
            />
            <span
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "var(--primary)",
                minWidth: 40,
              }}
            >
              {prefs.refreshInterval}{lt("分", "m")}
            </span>
          </div>
        </PrefRow>
      </div>

      {saved && (
        <div
          style={{
            padding: "8px 16px",
            borderRadius: "var(--radius-md)",
            background: "rgba(16,185,129,0.1)",
            color: "#10B981",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            check_circle
          </span>
          {lt("偏好已保存", "Preferences saved")}
        </div>
      )}
    </div>
  );
}

/* ── Placeholder ───────────────────────────────────────────────────────────── */

function UsersPermissionsSection() {
  const lt = useLangText();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [permissionDefinitions, setPermissionDefinitions] = useState<Record<string, string>>({});
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Record<number, string[]>>({});
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const permissionEntries = useMemo(
    () => Object.entries(permissionDefinitions),
    [permissionDefinitions],
  );
  const normalizedUserSearch = userSearch.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    if (!normalizedUserSearch) return users;
    const terms = normalizedUserSearch.split(/\s+/).filter(Boolean);
    return users.filter((user) => {
      const permissions = Array.isArray(user.permissions) ? user.permissions : [];
      const searchBlob = [
        `#${user.id}`,
        String(user.id),
        user.username,
        user.email,
        user.role,
        roleText(user.role || "normal", lt),
        user.subscription?.plan_name,
        user.subscription?.plan_key,
        user.subscription?.expires_at,
        user.is_current ? lt("当前", "current") : "",
        user.has_custom_permissions ? lt("管理员定制", "custom") : lt("套餐默认", "plan default"),
        ...permissions,
        ...permissions.map((key) => permissionDefinitions[key] || ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((term) => searchBlob.includes(term));
    });
  }, [users, normalizedUserSearch, permissionDefinitions, lt]);
  const adminUser = useMemo(
    () => users.find((user) => normalizedRole(user.role) === "admin") || null,
    [users],
  );

  const refresh = async () => {
    setLoading(true);
    setMsg("");
    try {
      const [permissionPayload, userPayload] = await Promise.all([
        (api as any).getPermissionDefinitions(),
        (api as any).listAdminUsers(),
      ]);
      setPermissionDefinitions(permissionPayload?.definitions || {});
      const roles = permissionPayload?.roles || {};
      setRolePermissions(
        Object.keys(roles).reduce<Record<string, string[]>>((acc, role) => {
          acc[role] = Array.isArray(roles[role]?.permissions) ? roles[role].permissions : [];
          return acc;
        }, {}),
      );
      setUsers(Array.isArray(userPayload) ? userPayload : []);
      setDraftPermissions(
        (Array.isArray(userPayload) ? userPayload : []).reduce<Record<number, string[]>>(
          (acc, user) => {
            acc[user.id] = Array.isArray(user.permissions) ? user.permissions : [];
            return acc;
          },
          {},
        ),
      );
    } catch (e: any) {
      setMsg(e?.message || lt("用户权限加载失败", "Failed to load user permissions"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const changeRole = async (user: AdminUser, role: string) => {
    setMsg("");
    if (
      normalizedRole(role) === "admin" &&
      adminUser &&
      adminUser.id !== user.id
    ) {
      setMsg(lt("系统管理员只能有 1 个，不能再将其它成员设为系统管理员。", "Only one system administrator is allowed."));
      return;
    }
    setSavingUserId(user.id);
    try {
      const updated = await (api as any).updateAdminUserRole(user.id, role);
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id ? { ...item, ...updated, is_current: item.is_current } : item,
        ),
      );
      setDraftPermissions((prev) => ({
        ...prev,
        [user.id]: Array.isArray(updated.permissions) ? updated.permissions : [],
      }));
      if (user.is_current) {
        setAuthUser(updated);
        window.dispatchEvent(new Event("quartsys:profile-updated"));
      }
      setMsg(lt("套餐角色已更新，权限范围已按套餐默认刷新", "Plan role updated and permissions refreshed to plan defaults"));
    } catch (e: any) {
      setMsg(e?.message || lt("角色更新失败", "Failed to update role"));
    } finally {
      setSavingUserId(null);
    }
  };

  const updateUserState = (user: AdminUser, updated: AdminUser) => {
    setUsers((prev) =>
      prev.map((item) =>
        item.id === user.id ? { ...item, ...updated, is_current: item.is_current } : item,
      ),
    );
    setDraftPermissions((prev) => ({
      ...prev,
      [user.id]: Array.isArray(updated.permissions) ? updated.permissions : [],
    }));
    if (user.is_current) {
      setAuthUser(updated);
      window.dispatchEvent(new Event("quartsys:profile-updated"));
    }
  };

  const togglePermission = (user: AdminUser, permission: string) => {
    if (user.role === "admin") return;
    setDraftPermissions((prev) => {
      const current = new Set(prev[user.id] || user.permissions || []);
      if (current.has(permission)) current.delete(permission);
      else current.add(permission);
      current.delete("system.manage");
      return { ...prev, [user.id]: Array.from(current).sort() };
    });
  };

  const savePermissions = async (user: AdminUser) => {
    setMsg("");
    setSavingUserId(user.id);
    try {
      const role = user.role || "normal";
      const permissions = role === "admin" ? undefined : draftPermissions[user.id] || [];
      const updated = await (api as any).updateAdminUserRole(user.id, role, permissions);
      updateUserState(user, updated);
      setMsg(lt("权限范围已保存", "Permission scope saved"));
    } catch (e: any) {
      setMsg(e?.message || lt("权限范围保存失败", "Failed to save permission scope"));
    } finally {
      setSavingUserId(null);
    }
  };

  const resetPermissions = async (user: AdminUser) => {
    const role = user.role || "normal";
    const defaults = rolePermissions[role] || user.role_default_permissions || [];
    setDraftPermissions((prev) => ({ ...prev, [user.id]: defaults }));
    setMsg("");
    setSavingUserId(user.id);
    try {
      const updated = await (api as any).updateAdminUserRole(
        user.id,
        role,
        role === "admin" ? undefined : defaults,
      );
      updateUserState(user, updated);
      setMsg(lt("已恢复为当前套餐默认权限", "Restored current plan defaults"));
    } catch (e: any) {
      setMsg(e?.message || lt("恢复套餐权限失败", "Failed to restore plan permissions"));
    } finally {
      setSavingUserId(null);
    }
  };

  const permissionText = (permissions?: string[]) => {
    const list = Array.isArray(permissions) ? permissions : [];
    if (!list.length) return lt("无", "None");
    return list
      .slice(0, 4)
      .map((key) => permissionDefinitions[key] || key)
      .join("、") + (list.length > 4 ? lt(` 等 ${list.length} 项`, ` and ${list.length - 4} more`) : "");
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h2>{lt("用户权限", "User Permissions")}</h2>
        <p>
          {lt(
            "按用户分配角色，角色会同时影响前端可见功能和后端接口访问。全系统仅允许 1 个系统管理员。",
            "Assign roles per user; roles control both visible UI and backend API access. Only one system administrator is allowed.",
          )}
        </p>
      </div>

      <div className="settings-user-toolbar">
        <div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {loading
              ? lt("加载中...", "Loading...")
              : normalizedUserSearch
                ? lt(`显示 ${filteredUsers.length} / ${users.length} 个用户`, `${filteredUsers.length} / ${users.length} users`)
                : lt(`共 ${users.length} 个用户`, `${users.length} users`)}
          </div>
          <div className="settings-user-search">
            <span className="material-symbols-outlined" aria-hidden="true">search</span>
            <input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder={lt("搜索用户ID、用户名、邮箱、角色或权限", "Search user ID, name, email, role or permission")}
              aria-label={lt("搜索用户", "Search users")}
            />
            {userSearch && (
              <button type="button" onClick={() => setUserSearch("")}>
                {lt("清空", "Clear")}
              </button>
            )}
          </div>
        </div>
        <button className="figma-btn" onClick={refresh} disabled={loading}>
          {lt("刷新", "Refresh")}
        </button>
      </div>

      <div className="settings-users-table-wrap">
        <table className="figma-table">
          <thead>
            <tr>
              <th>{lt("用户ID", "User ID")}</th>
              <th>{lt("用户", "User")}</th>
              <th>{lt("邮箱", "Email")}</th>
              <th>{lt("角色", "Role")}</th>
              <th>{lt("套餐有效期", "Plan Expiry")}</th>
              <th>{lt("授权范围", "Permission Scope")}</th>
              <th>{lt("创建时间", "Created")}</th>
              <th>{lt("操作", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const currentDraft = draftPermissions[user.id] || user.permissions || [];
              const isExpanded = expandedUserId === user.id;
              const isSaving = savingUserId === user.id;
              const isAdminRole = normalizedRole(user.role) === "admin";
              const adminRoleLocked = Boolean(adminUser && adminUser.id !== user.id);
              const expiry = subscriptionExpiryText(user.subscription, user.role, lt);
              return (
                <Fragment key={user.id}>
                  <tr key={user.id}>
                    <td className="settings-user-id">#{user.id}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                        {user.username}
                        {user.is_current ? lt("（当前）", " (current)") : ""}
                      </div>
                    </td>
                    <td>{user.email || "-"}</td>
                    <td>
                      <select
                        value={user.role || "normal"}
                        disabled={user.is_current || isSaving}
                        onChange={(e) => changeRole(user, e.target.value)}
                        title={
                          user.is_current
                            ? lt("不能在当前会话中修改自己的管理员角色", "You cannot change your own admin role in the current session")
                            : adminRoleLocked
                              ? lt("系统管理员只能有 1 个", "Only one system administrator is allowed")
                              : ""
                        }
                        style={{ minWidth: 120 }}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role} disabled={role === "admin" && adminRoleLocked}>
                            {roleText(role, lt)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ minWidth: 176 }}>
                      <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                        {user.subscription?.plan_name || expiry.value}
                      </div>
                      <small style={{ display: "block", marginTop: 4, color: "var(--text-muted)", lineHeight: 1.45 }}>
                        {user.subscription?.expires_at ? `${lt("到期", "Expires")} ${expiry.value}` : expiry.hint}
                      </small>
                    </td>
                    <td style={{ minWidth: 280 }}>
                      <div>{permissionText(user.permissions)}</div>
                      <span className={`settings-permission-tag ${user.has_custom_permissions ? "custom" : ""}`}>
                        {isAdminRole
                          ? lt("系统管理员全部权限", "Administrator full access")
                          : user.has_custom_permissions
                            ? lt("管理员定制", "Custom")
                            : lt("套餐默认", "Plan default")}
                      </span>
                    </td>
                    <td>{user.created_at ? new Date(user.created_at).toLocaleString("zh-CN") : "-"}</td>
                    <td>
                      <button
                        className="figma-btn"
                        type="button"
                        onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                      >
                        {isExpanded ? lt("收起", "Collapse") : lt("权限范围", "Permission Scope")}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8}>
                        <div className="settings-permission-editor">
                          <div className="settings-permission-editor-header">
                            <div>
                              <strong>{lt(`${user.username} 的功能可见范围`, `${user.username}'s visible features`)}</strong>
                              <p>
                                {isAdminRole
                                  ? lt("系统管理员固定拥有全部功能权限，不需要单独勾选。", "Administrators always have full access; no separate selection is required.")
                                  : lt("勾选后会同时影响前端菜单可见性和后端接口访问。", "Selections affect both frontend menus and backend API access.")}
                              </p>
                            </div>
                            {!isAdminRole && (
                              <span>{currentDraft.length} / {permissionEntries.length - 1} {lt("项", "items")}</span>
                            )}
                          </div>

                          <div className="settings-permission-grid">
                            {permissionEntries.map(([key, label]) => {
                              const disabled = isAdminRole || key === "system.manage";
                              const checked = isAdminRole || currentDraft.includes(key);
                              return (
                                <label
                                  className={`settings-permission-option ${disabled ? "disabled" : ""}`}
                                  key={key}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => togglePermission(user, key)}
                                  />
                                  <span>
                                    <strong>{label}</strong>
                                    <small>{key}</small>
                                  </span>
                                </label>
                              );
                            })}
                          </div>

                          <div className="settings-permission-actions">
                            <button
                              className="figma-btn"
                              type="button"
                              onClick={() => resetPermissions(user)}
                              disabled={isSaving || isAdminRole}
                            >
                              {lt("恢复套餐默认", "Restore Plan Defaults")}
                            </button>
                            <button
                              className="figma-btn figma-btn-primary"
                              type="button"
                              onClick={() => savePermissions(user)}
                              disabled={isSaving || isAdminRole}
                            >
                              {isSaving ? lt("保存中...", "Saving...") : lt("保存权限", "Save Permissions")}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "var(--text-muted)" }}>
                  {lt("暂无用户数据", "No user data")}
                </td>
              </tr>
            )}
            {!loading && users.length > 0 && filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "var(--text-muted)" }}>
                  {lt("没有匹配的用户", "No matching users")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && (
        <p style={{ marginTop: 12, fontSize: 14, color: "var(--text-muted)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

function PlaceholderSection({ name }: { name: string }) {
  const lt = useLangText();
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h2>{name}</h2>
      </div>
      <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
        {lt(`${name} 功能开发中...`, `${name} is under development...`)}
      </p>
    </div>
  );
}

/* ── Main Settings Page ────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const lt = useLangText();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const canManageSystem = hasPermission("system.manage");
  const canManageNotifications = hasPermission("notifications.manage");
  const canViewRisk = hasPermission("risk.view");
  const visibleTabs = useMemo(
    () =>
      TABS.filter((item) =>
        canViewSettingsTab(item, {
          canManageSystem,
          canManageNotifications,
          canViewRisk,
        }),
      ),
    [canManageSystem, canManageNotifications, canViewRisk],
  );
  const initialQueryTab = tabFromQuery(searchParams.get("tab"));
  const initialTab =
    initialQueryTab && visibleTabs.includes(initialQueryTab)
      ? initialQueryTab
      : visibleTabs.includes("SUBSCRIPTION")
        ? "SUBSCRIPTION"
        : visibleTabs[0] || "PROFILE";
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const queryTab = tabFromQuery(searchParams.get("tab"));
    if (queryTab && visibleTabs.includes(queryTab)) {
      setTab(queryTab);
      return;
    }
    if (!visibleTabs.includes(tab)) {
      setTab(visibleTabs[0] || "PROFILE");
    }
  }, [searchParams, tab, visibleTabs]);

  useEffect(() => {
    const container = tabsRef.current;
    const active = container?.querySelector<HTMLElement>(".figma-tab.active");
    if (!container || !active) return;
    const targetLeft = Math.max(
      0,
      active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2,
    );
    container.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [tab, visibleTabs]);

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", queryFromTab(nextTab));
    setSearchParams(nextParams, { replace: true });
  };

  if ((searchParams.get("tab") || "").trim().toLowerCase() === "support") {
    return <Navigate to="/guide" replace />;
  }

  return (
    <div className="settings-page">
      {/* Page Header */}
      <div className="figma-page-header">
        <div>
          <h1>{lt("设置中心", "Settings")}</h1>
          <p>
            {lt(
              "管理量化投研助手配置、使用偏好和账号安全。",
              "Manage assistant config, preferences and account security.",
            )}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div ref={tabsRef} className="settings-tabs">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={`figma-tab ${tab === t ? "active" : ""}`}
          >
            {lt(TAB_LABELS[t], TAB_LABELS_EN[t])}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "PROFILE" ? (
        <ProfileSection />
      ) : tab === "AI CONFIG" ? (
        <AIConfigSection />
      ) : tab === "AI CUSTOMER SERVICE" ? (
        <CustomerServiceAiSection />
      ) : tab === "RISK CONFIG" ? (
        <RiskMonitorSettingsSection />
      ) : tab === "TRADING CONFIG" ? (
        <TradingConfigSection />
      ) : tab === "NEWS CONFIG" ? (
        <NewsConfigSection />
      ) : tab === "LOGS" ? (
        <LogsSection />
      ) : tab === "USERS" ? (
        <UsersPermissionsSection />
      ) : tab === "SUBSCRIPTION" ? (
        <SubscriptionSection />
      ) : tab === "DATA MANAGEMENT" ? (
        <UserDataManagementSection />
      ) : tab === "SITE CONFIG" ? (
        <SiteConfigSection />
      ) : tab === "PAYMENT CONFIG" ? (
        <PaymentConfigSection />
      ) : tab === "BILLING CONFIG" ? (
        <BillingConfigSection />
      ) : tab === "REDEEM CODES" ? (
        <RedeemCodesSection />
      ) : tab === "AUTH SECURITY" ? (
        <AuthSecuritySection />
      ) : tab === "NOTIFICATIONS" ? (
        <NotificationBotsSection />
      ) : tab === "PREFERENCES" ? (
        <PreferencesSection />
      ) : (
        <PlaceholderSection name={TAB_LABELS[tab]} />
      )}
    </div>
  );
}
