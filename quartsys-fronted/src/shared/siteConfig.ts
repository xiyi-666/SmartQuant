export type PublicSiteLink = {
  key: string;
  label_zh: string;
  label_en: string;
  href: string;
  enabled: boolean;
};

export type HomepageAdFormat = "markdown" | "html" | "svg";

export type HomepageAdPlatform =
  | "direct"
  | "pangle"
  | "tencent_ylh"
  | "baidu_bqt"
  | "kuaishou"
  | "gromore"
  | "topon"
  | "tradplus"
  | "other";

export type PublicHomepageAdBlock = {
  enabled: boolean;
  name: string;
  platform: HomepageAdPlatform;
  format: HomepageAdFormat;
  href: string;
  content: string;
};

export type PublicSiteSettings = {
  brand_zh: string;
  brand_en: string;
  about_zh: string;
  about_en: string;
  contact: {
    qq: string;
    wechat: string;
    telegram: string;
    whatsapp: string;
  };
  footer_links: PublicSiteLink[];
  homepage_ads: {
    top_banner: PublicHomepageAdBlock;
    sponsors: PublicHomepageAdBlock[];
  };
  copyright_zh: string;
  copyright_en: string;
  demo_mode_enabled: boolean;
  onboarding_enabled: boolean;
  demo_username: string;
};

export const HOMEPAGE_AD_FORMATS: HomepageAdFormat[] = ["markdown", "html", "svg"];

export const HOMEPAGE_AD_PLATFORMS: HomepageAdPlatform[] = [
  "direct",
  "pangle",
  "tencent_ylh",
  "baidu_bqt",
  "kuaishou",
  "gromore",
  "topon",
  "tradplus",
  "other",
];

export function createEmptyHomepageAdBlock(name = ""): PublicHomepageAdBlock {
  return {
    enabled: false,
    name,
    platform: "direct",
    format: "markdown",
    href: "",
    content: "",
  };
}

export const DEFAULT_PUBLIC_SITE_SETTINGS: PublicSiteSettings = {
  brand_zh: "AIQuartSmart Community Edition",
  brand_en: "AIQuartSmart Community Edition",
  about_zh:
    "AIQuartSmart Community Edition 是一套面向个人投资者与研究者的自部署量化研究平台。它将用户配置的市场数据、因子研究、策略回测、模拟交易和风险规则连接为可复现的研究流程。",
  about_en:
    "AIQuartSmart Community Edition is a self-hosted quantitative research platform for individual investors and researchers. It connects operator-configured market data, factor research, strategy backtesting, paper trading and risk rules into a reproducible workflow.",
  contact: { qq: "1049674092", wechat: "W1049674092", telegram: "", whatsapp: "" },
  footer_links: [
    { key: "capabilities", label_zh: "产品能力", label_en: "Capabilities", href: "#capabilities", enabled: true },
    { key: "workflow", label_zh: "研究链路", label_en: "Workflow", href: "#workflow", enabled: true },
    { key: "scenarios", label_zh: "适用场景", label_en: "Use Cases", href: "#scenarios", enabled: true },
    { key: "about", label_zh: "关于我们", label_en: "About", href: "#about", enabled: true },
    { key: "official", label_zh: "官方完整版", label_en: "Official Full Edition", href: "https://www.goldenaiquant.cn/", enabled: true },
    { key: "login", label_zh: "登录", label_en: "Sign In", href: "/login", enabled: true },
    { key: "register", label_zh: "注册", label_en: "Register", href: "/register", enabled: true },
  ],
  homepage_ads: {
    top_banner: createEmptyHomepageAdBlock("顶部广告"),
    sponsors: Array.from({ length: 5 }, (_, index) =>
      createEmptyHomepageAdBlock(`赞助商 ${index + 1}`),
    ),
  },
  copyright_zh: "© 2026 AIQuartSmart Community Edition 开源量化研究平台",
  copyright_en: "© 2026 AIQuartSmart Community Edition Open Quant Research",
  demo_mode_enabled: true,
  onboarding_enabled: true,
  demo_username: "",
};

function normalizeHomepageAdBlock(value: unknown, fallbackName = ""): PublicHomepageAdBlock {
  const raw = value && typeof value === "object" ? (value as Partial<PublicHomepageAdBlock>) : {};
  const format = HOMEPAGE_AD_FORMATS.includes(raw.format as HomepageAdFormat)
    ? (raw.format as HomepageAdFormat)
    : "markdown";
  const platform = HOMEPAGE_AD_PLATFORMS.includes(raw.platform as HomepageAdPlatform)
    ? (raw.platform as HomepageAdPlatform)
    : "direct";
  const content = String(raw.content || "");
  return {
    enabled: Boolean(raw.enabled) && Boolean(content.trim()),
    name: String(raw.name || fallbackName),
    platform,
    format,
    href: String(raw.href || ""),
    content,
  };
}

function normalizeHomepageAds(value: unknown): PublicSiteSettings["homepage_ads"] {
  const raw = value && typeof value === "object" ? (value as any) : {};
  const sponsors = Array.isArray(raw.sponsors) ? raw.sponsors : [];
  return {
    top_banner: normalizeHomepageAdBlock(raw.top_banner, "顶部广告"),
    sponsors: Array.from({ length: 5 }, (_, index) =>
      normalizeHomepageAdBlock(sponsors[index], `赞助商 ${index + 1}`),
    ),
  };
}

export function normalizePublicSiteSettings(value: unknown): PublicSiteSettings {
  const raw = value && typeof value === "object" ? (value as Partial<PublicSiteSettings>) : {};
  const contact = raw.contact && typeof raw.contact === "object" ? raw.contact : {};
  const links = Array.isArray(raw.footer_links)
    ? raw.footer_links.filter((item): item is PublicSiteLink => Boolean(item && item.key && item.href))
    : DEFAULT_PUBLIC_SITE_SETTINGS.footer_links;
  return {
    brand_zh: String(raw.brand_zh || DEFAULT_PUBLIC_SITE_SETTINGS.brand_zh),
    brand_en: String(raw.brand_en || DEFAULT_PUBLIC_SITE_SETTINGS.brand_en),
    about_zh: String(raw.about_zh || DEFAULT_PUBLIC_SITE_SETTINGS.about_zh),
    about_en: String(raw.about_en || DEFAULT_PUBLIC_SITE_SETTINGS.about_en),
    contact: {
      qq: String(contact.qq || ""),
      wechat: String(contact.wechat || ""),
      telegram: String(contact.telegram || ""),
      whatsapp: String(contact.whatsapp || ""),
    },
    footer_links: links,
    homepage_ads: normalizeHomepageAds(raw.homepage_ads),
    copyright_zh: String(raw.copyright_zh || DEFAULT_PUBLIC_SITE_SETTINGS.copyright_zh),
    copyright_en: String(raw.copyright_en || DEFAULT_PUBLIC_SITE_SETTINGS.copyright_en),
    demo_mode_enabled: Boolean(raw.demo_mode_enabled),
    onboarding_enabled: raw.onboarding_enabled !== false,
    demo_username: String(raw.demo_username || ""),
  };
}
