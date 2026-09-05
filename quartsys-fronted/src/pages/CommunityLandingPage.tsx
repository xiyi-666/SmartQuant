import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Braces,
  Check,
  Database,
  FileChartColumn,
  Github,
  Link2,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import { firstAccessiblePath, isLoggedIn } from "../shared/auth";
import { LANGUAGE_SELECT_OPTIONS, useLangText, useLanguage, type LanguageMode } from "../shared/language";

const CAPABILITIES = [
  { Icon: Database, titleZh: "数据接入", titleEn: "Data sources", bodyZh: "CSV、本地数据库或自选行情 API，数据留在你的部署环境。", bodyEn: "CSV, local databases or the market API you choose, kept in your deployment." },
  { Icon: Braces, titleZh: "因子研究", titleEn: "Factor research", bodyZh: "用表达式描述研究假设，构建可复现的证券池。", bodyEn: "Describe hypotheses with expressions and build reproducible universes." },
  { Icon: BarChart3, titleZh: "策略验证", titleEn: "Strategy validation", bodyZh: "配置基准、费率、滑点和风控规则，比较策略表现。", bodyEn: "Configure benchmarks, fees, slippage and risk rules to compare results." },
  { Icon: ShieldCheck, titleZh: "自定义风控", titleEn: "Custom risk rules", bodyZh: "仓位、阈值、提醒与执行逻辑全部由你定义。", bodyEn: "Define positions, thresholds, alerts and execution logic yourself." },
] as const;

const STEPS = [
  { Icon: Upload, titleZh: "数据", titleEn: "Data", bodyZh: "上传 CSV 或连接数据源", bodyEn: "Upload CSV or connect a provider" },
  { Icon: Braces, titleZh: "因子", titleEn: "Factors", bodyZh: "构建因子与证券池", bodyEn: "Build factors and universes" },
  { Icon: Play, titleZh: "策略", titleEn: "Strategy", bodyZh: "组合规则并配置交易成本", bodyEn: "Compose rules and configure trading costs" },
  { Icon: FileChartColumn, titleZh: "回测", titleEn: "Backtest", bodyZh: "运行回测并比较风险指标", bodyEn: "Run backtests and compare risk metrics" },
] as const;

function useReveal() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-home-reveal]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.15, rootMargin: "0px 0px -10%" });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
}

export default function CommunityLandingPage() {
  const { languageMode, setLanguageMode } = useLanguage();
  const t = useLangText();
  const authenticated = isLoggedIn();
  const appPath = authenticated ? firstAccessiblePath() : "/login";
  const [activeSeries, setActiveSeries] = useState(0);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineStep, setPipelineStep] = useState(0);
  const pipelineRef = useRef<HTMLElement | null>(null);
  useReveal();
  useEffect(() => {
    const timer = window.setInterval(() => setActiveSeries((value) => (value + 1) % 3), 2800);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const section = pipelineRef.current;
    if (!section) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || window.innerWidth < 760) { setPipelineProgress(1); setPipelineStep(STEPS.length - 1); return; }
      const rect = section.getBoundingClientRect();
      const distance = Math.max(1, section.offsetHeight - window.innerHeight * .62);
      const progress = Math.min(1, Math.max(0, (window.innerHeight * .68 - rect.top) / distance));
      setPipelineProgress(progress);
      setPipelineStep(Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length)));
    };
    const requestUpdate = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    return () => { window.removeEventListener("scroll", requestUpdate); window.removeEventListener("resize", requestUpdate); if (frame) window.cancelAnimationFrame(frame); };
  }, []);

  return (
    <div className="community-home-v2">
      <header className="home-v2-nav">
        <Link className="home-v2-brand" to="/" aria-label="QaurtSmart home"><span className="home-v2-brand-mark"><Workflow size={18} /></span><span>QaurtSmart</span></Link>
        <nav className="home-v2-links" aria-label={t("主导航", "Primary navigation")}><a href="#capabilities">{t("能力", "Capabilities")}</a><Link to="/guide">{t("参考文档", "Reference docs")}</Link></nav>
        <div className="home-v2-actions"><select aria-label={t("切换语言", "Switch language")} value={languageMode} onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}>{LANGUAGE_SELECT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Link className="home-v2-signin" to={appPath}>{authenticated ? t("进入工作台", "Open workspace") : t("登录", "Sign in")}</Link></div>
      </header>

      <main>
        <section className="home-v2-hero" data-home-reveal>
          <div className="home-v2-hero-copy"><div className="home-v2-kicker"><span className="home-v2-kicker-dot" />{t("开源量化研究工作台", "OPEN QUANT RESEARCH WORKSPACE")}</div><h1>{t("从数据到策略，再到结果", "From data to strategy to results")}</h1><p>{t("QaurtSmart 将选股、因子研究、策略回测与模拟交易放在一条清晰的研究链路中。接入自己的数据与 AI 服务，研究过程完全由部署者掌控。", "QaurtSmart brings screening, factor research, backtesting and paper trading into one clear workflow. Connect your own data and AI services while keeping the research process under operator control.")}</p><div className="home-v2-hero-actions"><Link className="home-v2-primary" to={authenticated ? appPath : "/register"}>{t("开始使用", "Get started")}<ArrowRight size={17} /></Link><a className="home-v2-github" href="https://github.com/xiyi-666/SmartQuant" target="_blank" rel="noreferrer"><Github size={17} />GitHub</a></div><div className="home-v2-proof"><span><Check size={14} />{t("自部署", "Self-hosted")}</span><span><Check size={14} />{t("数据自主", "Data-owned")}</span><span><Check size={14} />{t("规则可配置", "Configurable")}</span></div></div>
          <div className="home-v2-stage" aria-label={t("动态策略研究面板", "Animated strategy research panel")}><div className="home-v2-stage-top"><div><small>QAURT / RESEARCH LAB</small><strong>{t("策略实验室", "Strategy lab")}</strong></div><span><i />{t("本地运行", "LOCAL RUN")}</span></div><div className="home-v2-stage-nav"><b>{t("净值", "Equity")}</b><span>{t("风险", "Risk")}</span><span>{t("信号", "Signals")}</span><em>1D · 14D · 30D</em></div><div className="home-v2-chart"><div className="home-v2-chart-lines" /><svg viewBox="0 0 620 230" preserveAspectRatio="none"><defs><linearGradient id="homeV2Fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7dd3fc" stopOpacity=".36" /><stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" /></linearGradient></defs><path className="home-v2-area" d="M0 180 C36 166 50 164 78 148 S120 170 154 132 S206 148 246 111 S294 134 331 82 S379 115 414 66 S466 105 502 46 S556 69 620 18 L620 230 L0 230Z" /><path className="home-v2-line" d="M0 180 C36 166 50 164 78 148 S120 170 154 132 S206 148 246 111 S294 134 331 82 S379 115 414 66 S466 105 502 46 S556 69 620 18" /><circle className="home-v2-point" cx="502" cy="46" r="6" /></svg><div className="home-v2-chart-callout"><b>+18.6%</b><small>{t("累计收益", "TOTAL RETURN")}</small></div></div><div className="home-v2-stage-stats"><div><small>{t("年化收益", "Annualized")}</small><b>18.6%</b></div><div><small>{t("最大回撤", "Max drawdown")}</small><b>-6.4%</b></div><div><small>{t("当前状态", "Status")}</small><b className="is-live">{activeSeries === 1 ? t("观察中", "Watching") : activeSeries === 2 ? t("已更新", "Updated") : t("稳定", "Stable")}</b></div></div><div className="home-v2-scan" /></div>
        </section>

        <section className="home-v2-statement" data-home-reveal><span>{t("研究，不应该被锁在单一数据源里。", "Research should not be locked to one data source.")}</span><strong>{t("数据由部署者掌控，平台负责连接完整研究流程。", "Operators control the data; QaurtSmart connects the complete research workflow.")}</strong></section>

        <section id="capabilities" className="home-v2-capabilities" data-home-reveal><div className="home-v2-section-head"><div><span className="home-v2-kicker">{t("研究工具箱", "THE RESEARCH TOOLBOX")}</span><h2>{t("清晰的工具，足够深的研究", "Focused tools for serious research")}</h2></div><p>{t("社区版保留研究链路的核心能力，不绑定官方数据网关，也不替你决定模型和风控。", "The community edition keeps the core research chain open. No official data gateway, no prescribed model or risk logic.")}</p></div><div className="home-v2-capability-grid">{CAPABILITIES.map(({ Icon, titleZh, titleEn, bodyZh, bodyEn }, index) => <article key={titleEn} className="home-v2-capability" data-home-reveal><div className="home-v2-capability-top"><span>0{index + 1}</span><Icon size={20} /></div><h3>{t(titleZh, titleEn)}</h3><p>{t(bodyZh, bodyEn)}</p><ArrowRight size={16} /></article>)}</div></section>

      <section id="how-it-works" ref={pipelineRef} className="home-v2-how" data-home-reveal><div className="home-v2-how-copy"><span className="home-v2-kicker"><Sparkles size={14} /> {t("从想法到结果", "FROM IDEA TO RESULT")}</span><h2>{t("一条可复现的研究链路", "One reproducible research chain")}</h2><p>{t("数据、因子、策略与回测不是四个孤立页面，而是一条持续流动的研究路径。滚动查看每一步如何连接。", "Data, factors, strategy and backtests are not four isolated pages. Scroll to see how each step connects.")}</p><Link className="home-v2-text-link" to="/guide">{t("参考文档", "Reference docs")}<ArrowRight size={16} /></Link><div className="home-v2-current-step" aria-live="polite"><span>0{pipelineStep + 1}</span><strong>{t(STEPS[pipelineStep].titleZh, STEPS[pipelineStep].titleEn)}</strong></div></div><div className="home-v2-pipeline" aria-label={t("数据到回测的动态流程", "Animated data-to-backtest workflow")}><svg viewBox="0 0 760 180" role="img"><path className="home-v2-pipeline-track" d="M70 90 C150 90 155 40 245 40 S335 140 425 140 S515 40 605 40 S660 90 700 90" /><path className="home-v2-pipeline-progress" pathLength="1" style={{ strokeDashoffset: 1 - pipelineProgress }} d="M70 90 C150 90 155 40 245 40 S335 140 425 140 S515 40 605 40 S660 90 700 90" />{STEPS.map(({ Icon, titleZh, titleEn }, index) => { const points = [[70,90],[245,40],[425,140],[605,40]]; const [x,y] = points[index]; const reached = pipelineProgress >= index / (STEPS.length - 1); return <g key={titleEn} className={`home-v2-pipeline-node node-${index + 1} ${reached ? "is-reached" : ""} ${pipelineStep === index ? "is-active" : ""}`} transform={`translate(${x} ${y})`}><circle className="home-v2-pipeline-ring" r="25" /><circle className="home-v2-pipeline-core" r="6" /><foreignObject x="-55" y="34" width="110" height="45"><div className="home-v2-pipeline-label"><Icon size={14} /><span>{t(titleZh, titleEn)}</span></div></foreignObject></g>; })}</svg><div className="home-v2-pipeline-note"><span className="home-v2-pipeline-pulse" />{t("滚动查看数据如何变成回测结果", "Scroll to see data become a backtest")}</div></div></section>

        <section className="home-v2-cta" data-home-reveal><div><span className="home-v2-kicker">{t("开启一次快速的研究", "RUN A QUICK RESEARCH")}</span><h2>{t("把你的研究环境带上来", "Bring your research environment")}</h2></div><Link className="home-v2-primary" to={authenticated ? appPath : "/register"}>{t("进入 QaurtSmart", "Open QaurtSmart")}<ArrowRight size={17} /></Link></section>
      </main>
      <footer className="home-v2-footer"><Link to="/" className="home-v2-brand"><span className="home-v2-brand-mark"><Workflow size={16} /></span><span>QaurtSmart</span></Link><span>{t("开源量化研究平台 · 由社区共同完善", "Open quantitative research · built with the community")}</span><div><Link to="/guide">{t("参考文档", "Reference docs")}</Link></div></footer>
    </div>
  );
}
