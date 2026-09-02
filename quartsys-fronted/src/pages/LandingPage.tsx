import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  ArrowRight,
  BrainCircuit,
  ChartCandlestick,
  CircleCheck,
  DatabaseZap,
  FileSearch,
  LogIn,
  Menu,
  Network,
  Radar,
  ShieldCheck,
  X,
} from "lucide-react";
import { SiTelegram, SiTencentqq, SiWechat, SiWhatsapp } from "react-icons/si";
import MarketSignalCanvas from "../components/landing/MarketSignalCanvas";
import LandingCustomerServiceFab from "../components/landing/LandingCustomerServiceFab";
import ResearchScrolly from "../components/landing/ResearchScrolly";
import { api } from "../api";
import { firstAccessiblePath, isLoggedIn } from "../shared/auth";
import { LANGUAGE_SELECT_OPTIONS, useLanguage, type LanguageMode } from "../shared/language";
import {
  DEFAULT_PUBLIC_SITE_SETTINGS,
  normalizePublicSiteSettings,
  type PublicHomepageAdBlock,
  type PublicSiteSettings,
} from "../shared/siteConfig";
import { COMMUNITY_EDITION } from "../shared/edition";

const CAPABILITIES = [
  {
    number: "01",
    Icon: DatabaseZap,
    titleZh: "全量市场数据",
    titleEn: "Whole-market data",
    bodyZh: "将 A 股、港股、美股的行情、基本面、行业概念、公告研报和新闻放进同一个研究上下文。",
    bodyEn: "Bring A-share, Hong Kong and US market data, fundamentals, sectors, filings, research and news into one context.",
    tagsZh: ["分时与K线", "基本面", "板块资金", "资讯证据"],
    tagsEn: ["Intraday & K-line", "Fundamentals", "Sector flow", "Evidence"],
  },
  {
    number: "02",
    Icon: Network,
    titleZh: "因子分析与股票池",
    titleEn: "Factor analysis and universes",
    bodyZh: "从研究假设创建可调参数因子，查看命中率、分布和筛选结果，并沉淀为策略可用股票池。",
    bodyEn: "Create tunable factors from research hypotheses, inspect hit rates and distributions, and persist strategy-ready universes.",
    tagsZh: ["自定义表达式", "参数调优", "命中率", "系统数据"],
    tagsEn: ["Expressions", "Tuning", "Hit rate", "System data"],
  },
  {
    number: "03",
    Icon: ChartCandlestick,
    titleZh: "策略回测与模拟交易",
    titleEn: "Backtesting and paper trading",
    bodyZh: "把因子选股与 Python 策略结合，在指定周期检验交易、仓位、止盈止损、基准和风险表现。",
    bodyEn: "Combine factor selection with Python strategies to test trading, sizing, exits, benchmarks and risk over defined periods.",
    tagsZh: ["策略代码", "持续回测", "指数基准", "风险指标"],
    tagsEn: ["Strategy code", "Continuous runs", "Benchmarks", "Risk metrics"],
  },
  {
    number: "04",
    Icon: BrainCircuit,
    titleZh: "用户自定义扩展",
    titleEn: "User-configured extensions",
    bodyZh: "通过 Provider、风险规则和自有 AI 接口扩展平台，数据、模型和工作流均由部署者自行掌控。",
    bodyEn: "Extend the platform with providers, risk rules and your own AI interfaces while keeping data, models and workflows under operator control.",
    tagsZh: ["Provider", "风险规则", "自有 AI", "本地部署"],
    tagsEn: ["Providers", "Risk rules", "Your AI", "Self-hosted"],
  },
  {
    number: "05",
    Icon: FileSearch,
    titleZh: "本地研究工作流",
    titleEn: "Local research workflows",
    bodyZh: "使用本地数据、策略和指标组合研究流程，结果保存在自己的部署环境中，便于复现和迭代。",
    bodyEn: "Compose local data, strategies and metrics into reproducible research workflows that stay in your deployment.",
    tagsZh: ["本地数据", "可复现", "策略组合", "结果留存"],
    tagsEn: ["Local data", "Reproducible", "Compositions", "Persisted results"],
  },
] as const;

const SCENARIOS = [
  {
    Icon: ChartCandlestick,
    code: "QUANT / 01",
    titleZh: "量化分析",
    titleEn: "Quantitative analysis",
    bodyZh: "从因子发现和选股开始，建立策略、运行回测并进入自动模拟交易，保持研究链路前后一致。",
    bodyEn: "Move from factor discovery and screening to strategy design, backtesting and automated simulation without breaking the research chain.",
    flowZh: "因子 → 股票池 → 策略 → 回测",
    flowEn: "Factor → Universe → Strategy → Backtest",
  },
  {
    Icon: FileSearch,
    code: "RESEARCH / 02",
    titleZh: "策略验证",
    titleEn: "Strategy validation",
    bodyZh: "围绕一组标的配置因子和策略，比较不同周期、参数与风险规则下的结果。",
    bodyEn: "Configure factors and strategies for a universe, then compare results across periods, parameters and risk rules.",
    flowZh: "证券池 → 因子 → 策略 → 回测",
    flowEn: "Universe → Factor → Strategy → Backtest",
  },
  {
    Icon: Radar,
    code: "MONITOR / 03",
    titleZh: "市场监控",
    titleEn: "Market monitoring",
    bodyZh: "使用自己配置的指标和规则观察市场状态，及时发现价格、波动和持仓风险变化。",
    bodyEn: "Use your own indicators and rules to monitor market state and detect changes in price, volatility and portfolio risk.",
    flowZh: "市场状态 → 自定义规则 → 提醒",
    flowEn: "Market state → Custom rules → Alert",
  },
] as const;

function useLandingReveal() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-landing-reveal]"));
    if (reduced) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8%" },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function footerLinkTarget(href: string) {
  return /^https?:\/\//i.test(href) ? "_blank" : undefined;
}

function homepageAdTarget(href: string) {
  return /^https?:\/\//i.test(href) ? "_blank" : undefined;
}

function isActiveHomepageAd(ad?: PublicHomepageAdBlock | null) {
  return Boolean(ad?.enabled && ad.content.trim());
}

function landingAdSessionKey() {
  const storageKey = "quartsys_landing_ad_session";
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const value = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(storageKey, value);
    return value;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function renderHomepageAdHtml(ad: PublicHomepageAdBlock) {
  const raw =
    ad.format === "markdown"
      ? (marked.parse(ad.content || "", { gfm: true, breaks: true }) as string)
      : ad.content || "";
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ["iframe"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "aria-label",
      "class",
      "frameborder",
      "height",
      "loading",
      "rel",
      "scrolling",
      "style",
      "target",
      "viewBox",
      "width",
      "xmlns",
    ],
  });
}

type LandingAdEntry = {
  placementKey: string;
  ad: PublicHomepageAdBlock;
  variant: "top" | "sponsor";
};

function LandingAdBlock({
  entry,
  lang,
  onClick,
}: {
  entry: LandingAdEntry;
  lang: "zh" | "en";
  onClick: (entry: LandingAdEntry) => void;
}) {
  const html = useMemo(
    () => renderHomepageAdHtml(entry.ad),
    [entry.ad.content, entry.ad.format],
  );
  if (!html.trim()) return null;
  const label = entry.variant === "top" ? (lang === "zh" ? "推广" : "Sponsored") : (lang === "zh" ? "赞助商" : "Sponsor");
  const body = (
    <>
      <span className="landing-ad-label">{label}</span>
      <div
        className="landing-ad-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
  const className = `landing-ad-block ${entry.variant === "top" ? "is-top" : "is-sponsor"}`;
  const href = entry.ad.href.trim();
  if (href) {
    const target = homepageAdTarget(href);
    return (
      <a
        className={className}
        href={href}
        target={target}
        rel={target ? "noreferrer" : undefined}
        onClick={() => onClick(entry)}
        aria-label={entry.ad.name || label}
      >
        {body}
      </a>
    );
  }
  return <div className={className}>{body}</div>;
}

const CONTACT_DEFINITIONS = [
  { key: "qq", labelZh: "QQ", labelEn: "QQ", Icon: SiTencentqq },
  { key: "wechat", labelZh: "微信", labelEn: "WeChat", Icon: SiWechat },
  { key: "telegram", labelZh: "Telegram", labelEn: "Telegram", Icon: SiTelegram },
  { key: "whatsapp", labelZh: "WhatsApp", labelEn: "WhatsApp", Icon: SiWhatsapp },
] as const;

type ContactKey = (typeof CONTACT_DEFINITIONS)[number]["key"];

function contactHref(key: ContactKey, rawValue: string) {
  const value = rawValue.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (key === "qq" && /^\d{5,14}$/.test(value)) {
    return `https://wpa.qq.com/msgrd?v=3&uin=${encodeURIComponent(value)}&site=qq&menu=yes`;
  }
  if (key === "telegram") {
    const username = value.replace(/^@/, "");
    if (/^[A-Za-z0-9_]{5,}$/.test(username)) return `https://t.me/${username}`;
  }
  if (key === "whatsapp") {
    const phone = value.replace(/[^\d]/g, "");
    if (phone.length >= 6) return `https://wa.me/${phone}`;
  }
  return undefined;
}

function contactDisplayValue(key: ContactKey, rawValue: string) {
  const value = rawValue.trim();
  if (key === "telegram") {
    const match = value.match(/^(?:https?:\/\/)?(?:www\.)?t\.me\/([^/?#]+)/i);
    return match ? `@${match[1]}` : value;
  }
  if (key === "whatsapp") {
    const match = value.match(/^(?:https?:\/\/)?(?:www\.)?wa\.me\/(\d+)/i);
    return match ? `+${match[1]}` : value;
  }
  return value;
}

export default function LandingPage() {
  const { lang, languageMode, setLanguageMode } = useLanguage();
  const [site, setSite] = useState<PublicSiteSettings>(DEFAULT_PUBLIC_SITE_SETTINGS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navSolid, setNavSolid] = useState(false);
  const [adSessionKey] = useState(landingAdSessionKey);
  const authenticated = isLoggedIn();
  const appPath = authenticated ? firstAccessiblePath() : "/login";
  useLandingReveal();

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicSiteSettings()
      .then((payload: any) => {
        if (!cancelled) setSite(normalizePublicSiteSettings(payload));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const update = () => setNavSolid(window.scrollY > 20);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    document.title = lang === "zh" ? "AIQuartSmart Community Edition | 自部署量化研究与模拟交易" : "AIQuartSmart Community Edition | Self-hosted Quant Research and Paper Trading";
  }, [lang]);

  const navItems = useMemo(
    () => [
      { href: "#capabilities", label: lang === "zh" ? "核心能力" : "Capabilities" },
      { href: "#workflow", label: lang === "zh" ? "研究链路" : "Workflow" },
      { href: "#scenarios", label: lang === "zh" ? "适用场景" : "Use Cases" },
      { href: "/guide", label: lang === "zh" ? "使用文档" : "User Guide", isRoute: true },
      { href: "#about", label: lang === "zh" ? "关于我们" : "About" },
    ],
    [lang],
  );
  const footerContacts = CONTACT_DEFINITIONS.flatMap((definition) => {
    const value = site.contact[definition.key].trim();
    return value ? [{ ...definition, value }] : [];
  });
  const topAdEntry = useMemo<LandingAdEntry | null>(() => {
    const ad = site.homepage_ads.top_banner;
    return isActiveHomepageAd(ad) ? { placementKey: "top_banner", ad, variant: "top" } : null;
  }, [site.homepage_ads.top_banner]);
  const sponsorAdEntries = useMemo<LandingAdEntry[]>(
    () =>
      site.homepage_ads.sponsors.flatMap((ad, index) =>
        isActiveHomepageAd(ad)
          ? [{ placementKey: `sponsor_${index + 1}`, ad, variant: "sponsor" as const }]
          : [],
      ),
    [site.homepage_ads.sponsors],
  );
  const activeAdEntries = useMemo(
    () => [...(topAdEntry ? [topAdEntry] : []), ...sponsorAdEntries],
    [topAdEntry, sponsorAdEntries],
  );
  const adImpressionKey = activeAdEntries
    .map((entry) => `${entry.placementKey}:${entry.ad.platform}:${entry.ad.name}`)
    .join("|");

  useEffect(() => {
    if (!adImpressionKey) return;
    activeAdEntries.forEach((entry) => {
      api
        .recordPublicAdEvent({
          placement_key: entry.placementKey,
          event_type: "impression",
          session_key: adSessionKey,
        })
        .catch(() => {});
    });
  }, [activeAdEntries, adImpressionKey, adSessionKey]);

  const trackAdClick = (entry: LandingAdEntry) => {
    api
      .recordPublicAdEvent({
        placement_key: entry.placementKey,
        event_type: "click",
        session_key: adSessionKey,
      })
      .catch(() => {});
  };

  return (
    <div className={`landing-page ${topAdEntry ? "has-top-ad" : ""}`} lang={languageMode === "en" ? "en" : languageMode === "zh-TW" ? "zh-Hant" : "zh-CN"}>
      <a className="landing-skip-link" href="#landing-main">{lang === "zh" ? "跳到主要内容" : "Skip to main content"}</a>
      <header className={`landing-nav ${navSolid ? "is-solid" : ""}`}>
        <a className="landing-brand" href="#top" aria-label={lang === "zh" ? "AIQuartSmart Community Edition首页" : "AIQuartSmart Community Edition home"}>
          <span><strong>{lang === "zh" ? site.brand_zh : site.brand_en}</strong><small>OPEN QUANT RESEARCH</small></span>
        </a>
        <nav className={`landing-nav-links ${menuOpen ? "is-open" : ""}`} aria-label={lang === "zh" ? "官网导航" : "Website navigation"}>
          {navItems.map((item) => item.isRoute ? (
            <Link to={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>
          ) : (
            <a href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>
          ))}
        </nav>
        <div className="landing-nav-actions">
          <select
            className="landing-language-select"
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
          <Link className="landing-nav-login" to={appPath}>{authenticated ? (lang === "zh" ? "进入系统" : "Open App") : (lang === "zh" ? "登录" : "Sign In")}</Link>
          {!authenticated && <Link className="landing-nav-register" to="/register">{lang === "zh" ? "免费注册" : "Register"}<ArrowRight size={16} aria-hidden="true" /></Link>}
          <button className="landing-menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? (lang === "zh" ? "关闭导航" : "Close navigation") : (lang === "zh" ? "打开导航" : "Open navigation")} aria-expanded={menuOpen}>
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      {topAdEntry ? (
        <aside className="landing-top-ad" aria-label={lang === "zh" ? "顶部推广" : "Top sponsored placement"}>
          <LandingAdBlock entry={topAdEntry} lang={lang} onClick={trackAdClick} />
        </aside>
      ) : null}

      <main id="landing-main">
        <section id="top" className="landing-hero" aria-labelledby="landing-hero-title">
          <MarketSignalCanvas />
          <div className="landing-hero-scrim" />
          <div className="landing-hero-content">
            <div className="landing-hero-eyebrow"><span /> SELF-HOSTED QUANT CORE</div>
            <h1 id="landing-hero-title">{lang === "zh" ? site.brand_zh : site.brand_en}</h1>
            <p className="landing-hero-lead">
              {lang === "zh" ? "自部署量化研究与模拟交易平台" : "Self-hosted quantitative research and paper trading"}
            </p>
            <p className="landing-hero-copy">
              {lang === "zh"
                ? "把数据、因子、策略、回测与风险规则连接成一条可执行、可追踪的本地研究链路。"
                : "Connect data, factors, strategies, backtesting and risk rules into one executable, traceable local workflow."}
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-primary-cta" to={authenticated ? appPath : "/register"}>
                {authenticated ? (lang === "zh" ? "进入工作台" : "Open Workspace") : (lang === "zh" ? "免费开始" : "Start Free")}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a className="landing-secondary-cta" href="#workflow">{lang === "zh" ? "查看研究链路" : "Explore the workflow"}</a>
            </div>
          </div>
          <div className="landing-hero-rail" aria-hidden="true">
            <span>MARKET</span><i /><span>FACTOR</span><i /><span>BACKTEST</span><i /><span>PAPER TRADE</span>
          </div>
        </section>

        <section className="landing-proof-strip" aria-label={lang === "zh" ? "系统覆盖范围" : "System coverage"}>
          {["A / HK / US", "FACTOR → STRATEGY", "MULTI-AGENT", "RISK EVIDENCE"].map((item, index) => (
            <div key={item}><span>0{index + 1}</span><strong>{item}</strong></div>
          ))}
        </section>

        <section id="capabilities" className="landing-capabilities landing-section">
          <div className="landing-section-heading" data-landing-reveal>
            <div className="landing-section-kicker">CORE CAPABILITIES / 05</div>
            <h2>{lang === "zh" ? "不是更多工具，而是一条完整的本地研究链路" : "Not more tools. One complete local research workflow."}</h2>
            <p>{lang === "zh" ? "每个模块都围绕用户配置的数据和规则工作，减少数据、判断和执行之间的断层。" : "Every module works from operator-configured data and rules, reducing gaps between data, decisions and execution."}</p>
          </div>
          <div className="landing-capability-list">
            {CAPABILITIES.map(({ number, Icon, titleZh, titleEn, bodyZh, bodyEn, tagsZh, tagsEn }) => (
              <article className="landing-capability-row" key={number} data-landing-reveal>
                <span className="landing-capability-number">{number}</span>
                <Icon className="landing-capability-icon" size={28} strokeWidth={1.5} aria-hidden="true" />
                <div className="landing-capability-copy"><h3>{lang === "zh" ? titleZh : titleEn}</h3><p>{lang === "zh" ? bodyZh : bodyEn}</p></div>
                <div className="landing-capability-tags">{(lang === "zh" ? tagsZh : tagsEn).map((tag) => <span key={tag}>{tag}</span>)}</div>
              </article>
            ))}
          </div>
        </section>

        <ResearchScrolly />

        <section id="scenarios" className="landing-scenarios landing-section">
          <div className="landing-section-heading is-light" data-landing-reveal>
            <div className="landing-section-kicker">USE CASES / 03</div>
            <h2>{lang === "zh" ? "从个人研究，到持续风险观察" : "From individual research to continuous risk monitoring"}</h2>
            <p>{lang === "zh" ? "为不同经验层级的用户保留清晰入口，同时让专业研究者能够深入到参数、代码和证据。" : "Clear entry points for every experience level, with parameters, code and evidence available when professionals need depth."}</p>
          </div>
          <div className="landing-scenario-grid">
            {SCENARIOS.map(({ Icon, code, titleZh, titleEn, bodyZh, bodyEn, flowZh, flowEn }) => (
              <article className="landing-scenario" key={code} data-landing-reveal>
                <div className="landing-scenario-top"><span>{code}</span><Icon size={26} strokeWidth={1.5} aria-hidden="true" /></div>
                <h3>{lang === "zh" ? titleZh : titleEn}</h3>
                <p>{lang === "zh" ? bodyZh : bodyEn}</p>
                <div className="landing-scenario-flow"><CircleCheck size={16} aria-hidden="true" />{lang === "zh" ? flowZh : flowEn}</div>
              </article>
            ))}
          </div>
        </section>

        <section id="about" className="landing-about landing-section">
          <div className="landing-about-grid">
            <div className="landing-about-brand" data-landing-reveal>
              <div className="landing-about-lockup">
                <div>
                  <span>AIQUARTSMART COMMUNITY / ABOUT</span>
                  <h2>{lang === "zh" ? "关于AIQuartSmart Community Edition" : "About AIQuartSmart Community Edition"}</h2>
                </div>
              </div>
              <p>{lang === "zh" ? "面向真实决策场景的自部署量化研究系统" : "Self-hosted quantitative research built for real decisions"}</p>
            </div>
            <div className="landing-about-content">
              <p className="landing-about-statement" data-landing-reveal>{lang === "zh" ? site.about_zh : site.about_en}</p>
              <div className="landing-about-principles" data-landing-reveal>
                <div>
                  <strong>01</strong>
                  <div><span>{lang === "zh" ? "数据先于叙事" : "Data before narrative"}</span><small>{lang === "zh" ? "每个判断先回到可验证的市场与公司数据。" : "Every judgment starts with verifiable market and company data."}</small></div>
                </div>
                <div>
                  <strong>02</strong>
                  <div><span>{lang === "zh" ? "证据保留来源" : "Evidence keeps its source"}</span><small>{lang === "zh" ? "行情、公告、研报与新闻始终保留来源和时效。" : "Market data, filings, research and news retain source and freshness."}</small></div>
                </div>
                <div>
                  <strong>03</strong>
                  <div><span>{lang === "zh" ? "结论包含边界" : "Conclusions include boundaries"}</span><small>{lang === "zh" ? "AI 输出同步说明风险、假设与适用条件。" : "AI output states its risks, assumptions and applicable conditions."}</small></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-final-cta">
          <div data-landing-reveal>
            <span>READY FOR A CLEARER SIGNAL?</span>
            <h2>{lang === "zh" ? "把下一次研究，放进一条完整链路" : "Put your next research question into one complete workflow"}</h2>
          </div>
          <div className="landing-final-actions" data-landing-reveal>
            <Link className="landing-primary-cta" to={authenticated ? appPath : "/register"}>{authenticated ? (lang === "zh" ? "进入系统" : "Open App") : (lang === "zh" ? "创建免费账户" : "Create Free Account")}<ArrowRight size={18} /></Link>
            {!authenticated && <Link className="landing-secondary-cta on-dark" to="/login"><LogIn size={17} />{lang === "zh" ? "已有账户，直接登录" : "Already have an account"}</Link>}
          </div>
        </section>

        {sponsorAdEntries.length > 0 ? (
          <section className="landing-sponsors" aria-label={lang === "zh" ? "底部赞助商" : "Footer sponsors"}>
            <div className="landing-sponsors-head">
              <span>SPONSORS</span>
              <strong>{lang === "zh" ? "合作赞助" : "Sponsored Partners"}</strong>
            </div>
            <div className="landing-sponsors-grid">
              {sponsorAdEntries.map((entry) => (
                <LandingAdBlock
                  key={entry.placementKey}
                  entry={entry}
                  lang={lang}
                  onClick={trackAdClick}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-main">
          <div className="landing-footer-brand"><div><strong>{lang === "zh" ? site.brand_zh : site.brand_en}</strong><span>AIQUARTSMART COMMUNITY EDITION</span></div></div>
          <nav className="landing-footer-links" aria-label={lang === "zh" ? "页脚导航" : "Footer navigation"}>
            <Link to="/guide">{lang === "zh" ? "使用文档" : "User Guide"}</Link>
            {site.footer_links.filter((item) => item.enabled).map((item) => (
              <a key={item.key} href={item.href} target={footerLinkTarget(item.href)} rel={footerLinkTarget(item.href) ? "noreferrer" : undefined}>{lang === "zh" ? item.label_zh : item.label_en}</a>
            ))}
          </nav>
          {footerContacts.length > 0 && (
            <div className={`landing-footer-contact contacts-${footerContacts.length}`}>
              {footerContacts.map(({ key, labelZh, labelEn, Icon, value }) => {
                const href = contactHref(key, value);
                const label = lang === "zh" ? labelZh : labelEn;
                const content = (
                  <>
                    <span className={`landing-contact-icon contact-${key}`}><Icon aria-hidden="true" /></span>
                    <span>{label}</span>
                    <strong title={value}>{contactDisplayValue(key, value)}</strong>
                  </>
                );
                return href ? (
                  <a key={key} href={href} target="_blank" rel="noreferrer" aria-label={`${label}: ${value}`}>
                    {content}
                  </a>
                ) : (
                  <div key={key} aria-label={`${label}: ${value}`}>
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="landing-footer-bottom">
          <span>{lang === "zh" ? site.copyright_zh : site.copyright_en}</span>
          <nav className="landing-legal-links" aria-label={lang === "zh" ? "法律条款" : "Legal links"}>
            <Link to="/legal/terms">{lang === "zh" ? "用户协议" : "Terms"}</Link>
            <Link to="/legal/privacy">{lang === "zh" ? "隐私条款" : "Privacy"}</Link>
            <Link to="/legal/risk">{lang === "zh" ? "风险提示" : "Risk"}</Link>
          </nav>
          <span><ShieldCheck size={15} aria-hidden="true" />{lang === "zh" ? "研究结果仅供参考，不构成投资建议" : "Research results are informational only"}</span>
        </div>
      </footer>
      {!COMMUNITY_EDITION && <LandingCustomerServiceFab />}
    </div>
  );
}
