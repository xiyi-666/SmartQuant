import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { ArrowRight, BookOpen, LoaderCircle } from "lucide-react";
import { LANGUAGE_SELECT_OPTIONS, useLanguage, type LanguageMode } from "../shared/language";
import { firstAccessiblePath, isLoggedIn } from "../shared/auth";

type GuideLocale = "zh-CN" | "zh-TW" | "en";

const GUIDE_FILES: Record<GuideLocale, { label: string; filename: string }> = {
  "zh-CN": {
    label: "简体中文",
    filename: "AIQuartSmart_Community_Edition_User_Guide_zh-CN.md",
  },
  "zh-TW": {
    label: "繁體中文",
    filename: "AIQuartSmart_Community_Edition_User_Guide_zh-TW.md",
  },
  en: {
    label: "English",
    filename: "AIQuartSmart_Community_Edition_User_Guide_en.md",
  },
};

function localeFor(languageMode: "zh" | "zh-TW" | "en"): GuideLocale {
  if (languageMode === "zh-TW") return "zh-TW";
  if (languageMode === "en") return "en";
  return "zh-CN";
}

export default function HelpPage() {
  const { languageMode, setLanguageMode } = useLanguage();
  const initialLocale = localeFor(languageMode);
  const [locale, setLocale] = useState<GuideLocale>(initialLocale);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const isEnglish = languageMode === "en";
  const isTraditional = languageMode === "zh-TW";
  const authenticated = isLoggedIn();
  const appPath = authenticated ? firstAccessiblePath() : "/login";
  const copy = isEnglish
    ? {
        eyebrow: "REFERENCE DOCUMENTATION",
        title: "QaurtSmart Reference Documentation",
        summary: "A practical guide to market data, factor research, strategy development, backtesting and paper trading.",
        home: "Home",
        app: authenticated ? "Open App" : "Sign In",
        language: "Switch language",
        picker: "Reference language",
        loading: "Loading reference documentation...",
        error: "The reference documentation could not be loaded.",
      }
    : isTraditional
      ? {
          eyebrow: "產品文件",
          title: "QaurtSmart 量化分析系統參考文件",
          summary: "從行情資料開始，完成因子、策略、回測與模擬下單的可追溯研究流程。",
          home: "首頁",
          app: authenticated ? "進入系統" : "登入",
          language: "切換語言",
          picker: "參考文件語言",
          loading: "正在載入參考文件...",
          error: "參考文件暫時無法載入。",
        }
      : {
          eyebrow: "参考文档",
          title: "QaurtSmart量化分析系统参考文档",
          summary: "从行情数据开始，完成因子、策略、回测与模拟下单的可追溯研究流程。",
          home: "首页",
          app: authenticated ? "进入系统" : "登录",
          language: "切换语言",
          picker: "参考文档语言",
          loading: "正在加载参考文档...",
          error: "参考文档暂时无法加载。",
        };

  useEffect(() => setLocale(initialLocale), [initialLocale]);

  useEffect(() => {
    document.title = copy.title;
  }, [copy.title]);

  useEffect(() => {
    const updateProgress = () => {
      const root = document.documentElement;
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      root.style.setProperty("--guide-progress", `${Math.min(100, Math.max(0, (window.scrollY / max) * 100))}%`);
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
      document.documentElement.style.removeProperty("--guide-progress");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const filename = GUIDE_FILES[locale].filename;
    fetch(`/user-guide/${filename}`, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load ${filename}`);
        return response.text();
      })
      .then((markdown) => {
        if (cancelled) return;
        const pageMarkdown = markdown.replaceAll("](./assets/", "](/user-guide/assets/");
        setContent(DOMPurify.sanitize(marked.parse(pageMarkdown) as string));
      })
      .catch(() => {
        if (!cancelled) {
          setContent("");
          setError(copy.error);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [copy.error, locale]);

  return (
    <div className="guide-public-page" lang={isEnglish ? "en" : isTraditional ? "zh-Hant" : "zh-CN"}>
      <header className="guide-public-nav">
        <Link className="guide-public-brand" to="/" aria-label={copy.home}>
          <span><strong>QaurtSmart</strong><small>OPEN QUANT RESEARCH</small></span>
        </Link>
        <div className="guide-public-actions">
          <select
            className="guide-language-select"
            value={languageMode}
            onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
            aria-label={copy.language}
          >
            {LANGUAGE_SELECT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Link className="guide-nav-link" to="/">{copy.home}</Link>
          <Link className="guide-nav-cta" to={appPath}>{copy.app}<ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </header>

      <main className="guide-public-main">
        <header className="guide-public-hero">
          <div className="help-page-eyebrow"><BookOpen size={16} aria-hidden="true" /> {copy.eyebrow}</div>
          <h1>{copy.title}</h1>
          <p>{copy.summary}</p>
        </header>

        <section className="help-language-picker" aria-label={copy.picker}>
          {(Object.keys(GUIDE_FILES) as GuideLocale[]).map((key) => (
            <button key={key} type="button" className={`help-language-button ${key === locale ? "active" : ""}`} onClick={() => setLocale(key)}>
              {GUIDE_FILES[key].label}
            </button>
          ))}
        </section>

        <article className="help-document-card" aria-busy={loading}>
          {loading ? (
            <div className="help-document-state"><LoaderCircle size={22} className="help-spin" /> {copy.loading}</div>
          ) : error ? (
            <div className="help-document-state is-error">{error}</div>
          ) : (
            <div className="help-markdown" dangerouslySetInnerHTML={{ __html: content }} />
          )}
        </article>
      </main>
    </div>
  );
}
