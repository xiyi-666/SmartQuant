import { useEffect, useRef, useState } from "react";
import { ChartNoAxesCombined, Database, FlaskConical, ShieldCheck } from "lucide-react";
import { useLanguage } from "../../shared/language";

const STEPS = [
  {
    key: "market",
    index: "01",
    titleZh: "全量市场数据进入同一研究底座",
    titleEn: "One research layer for the whole market",
    bodyZh: "连接 A 股、港股、美股的行情、基本面、板块、公告、研报与新闻，并保留数据来源和更新时间。",
    bodyEn: "Connect A-share, Hong Kong and US market data, fundamentals, sectors, filings, research and news with source and freshness metadata.",
    metricZh: "行情 · 基本面 · 资讯",
    metricEn: "Market · Fundamentals · News",
    Icon: Database,
  },
  {
    key: "factor",
    index: "02",
    titleZh: "把研究假设转化为可复用因子",
    titleEn: "Turn research hypotheses into reusable factors",
    bodyZh: "从估值、质量、成长、量价和情绪维度构建因子，完成调参、筛选、命中率和股票池沉淀。",
    bodyEn: "Build valuation, quality, growth, price-volume and sentiment factors, then tune, screen and persist the resulting stock universe.",
    metricZh: "表达式 · 参数 · 股票池",
    metricEn: "Expression · Parameters · Universe",
    Icon: FlaskConical,
  },
  {
    key: "backtest",
    index: "03",
    titleZh: "让策略在历史周期里接受检验",
    titleEn: "Test strategies across historical regimes",
    bodyZh: "将因子股票池与 Python 策略代码结合，检验买卖、仓位、风控、基准和不同市场周期下的表现。",
    bodyEn: "Combine factor universes with Python strategy code to test entries, exits, sizing, risk controls, benchmarks and market regimes.",
    metricZh: "策略 · 基准 · 风险指标",
    metricEn: "Strategy · Benchmark · Risk",
    Icon: ChartNoAxesCombined,
  },
  {
    key: "paper-trade",
    index: "04",
    titleZh: "用模拟交易验证策略与风险规则",
    titleEn: "Validate strategies with paper trading",
    bodyZh: "将回测结果带入模拟交易，观察订单、持仓、手续费和自定义风险规则在连续行情中的表现。",
    bodyEn: "Carry backtest results into paper trading and observe orders, positions, fees and custom risk rules over live-like market data.",
    metricZh: "订单 · 持仓 · 风险规则",
    metricEn: "Orders · Positions · Risk rules",
    Icon: ShieldCheck,
  },
] as const;

const NODES = [
  { x: 92, y: 92 },
  { x: 282, y: 206 },
  { x: 476, y: 318 },
  { x: 668, y: 426 },
];

export default function ResearchScrolly() {
  const { lang } = useLanguage();
  const sectionRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      frameRef.current = 0;
      if (reducedMotion.matches || window.innerWidth < 820) {
        setProgress(1);
        setActiveStep(0);
        return;
      }
      const rect = section.getBoundingClientRect();
      const scrollable = Math.max(1, section.offsetHeight - window.innerHeight);
      const nextProgress = Math.min(1, Math.max(0, -rect.top / scrollable));
      setProgress(nextProgress);
      setActiveStep(Math.min(STEPS.length - 1, Math.floor(nextProgress * STEPS.length)));
    };
    const requestUpdate = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    reducedMotion.addEventListener("change", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      reducedMotion.removeEventListener("change", requestUpdate);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <section ref={sectionRef} id="workflow" className="landing-scrolly" aria-labelledby="landing-workflow-title">
      <div className="landing-scrolly-sticky">
        <div className="landing-section-kicker">RESEARCH PIPELINE / 04</div>
        <div className="landing-scrolly-grid">
          <div className="landing-scrolly-copy">
            <h2 id="landing-workflow-title">
              {lang === "zh" ? "从市场噪声，到可以验证的研究结论" : "From market noise to testable research conclusions"}
            </h2>
            <div className="landing-scrolly-steps">
              {STEPS.map(({ key, index, titleZh, titleEn, bodyZh, bodyEn, metricZh, metricEn, Icon }, stepIndex) => (
                <article className={`landing-scrolly-step ${activeStep === stepIndex ? "is-active" : ""}`} key={key}>
                  <div className="landing-scrolly-step-index">{index}</div>
                  <div>
                    <div className="landing-scrolly-step-title">
                      <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                      <h3>{lang === "zh" ? titleZh : titleEn}</h3>
                    </div>
                    <p>{lang === "zh" ? bodyZh : bodyEn}</p>
                    <span>{lang === "zh" ? metricZh : metricEn}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="landing-scrolly-visual" aria-hidden="false">
            <svg viewBox="0 0 760 520" role="img" aria-label={lang === "zh" ? "市场数据到模拟交易的流程图" : "Flow from market data to paper trading"}>
              <path className="landing-pipeline-track" d="M92 92 C182 92 198 206 282 206 S390 318 476 318 S578 426 668 426" />
              <path
                className="landing-pipeline-progress"
                pathLength="1"
                strokeDasharray="1"
                strokeDashoffset={1 - progress}
                d="M92 92 C182 92 198 206 282 206 S390 318 476 318 S578 426 668 426"
              />
              {NODES.map((node, index) => {
                const reached = progress >= index / (NODES.length - 0.45);
                return (
                  <g className={`landing-pipeline-node node-${index + 1} ${reached ? "is-reached" : ""}`} key={`${node.x}-${node.y}`}>
                    <circle className="node-ring" cx={node.x} cy={node.y} r="42" />
                    <circle className="node-core" cx={node.x} cy={node.y} r="7" />
                    <text x={node.x} y={node.y + 66} textAnchor="middle">{STEPS[index][lang === "zh" ? "metricZh" : "metricEn"].split(" · ")[0]}</text>
                  </g>
                );
              })}
              <g className={`landing-svg-market ${activeStep === 0 ? "is-active" : ""}`}>
                {[0, 1, 2, 3, 4].map((item) => (
                  <g key={item} transform={`translate(${44 + item * 18} ${56 + (item % 2) * 8})`}>
                    <line x1="5" y1="0" x2="5" y2="36" />
                    <rect x="0" y={8 + item * 2} width="10" height={13 + (item % 3) * 4} />
                  </g>
                ))}
              </g>
              <g className={`landing-svg-factor ${activeStep === 1 ? "is-active" : ""}`}>
                {[0, 1, 2].flatMap((row) => [0, 1, 2].map((column) => (
                  <rect key={`${row}-${column}`} x={254 + column * 17} y={178 + row * 17} width="11" height="11" opacity={0.24 + (row + column) * 0.12} />
                )))}
              </g>
              <g className={`landing-svg-backtest ${activeStep === 2 ? "is-active" : ""}`}>
                <polyline points="438,334 452,324 466,329 480,304 494,311 510,282" />
                <line x1="438" y1="342" x2="512" y2="342" />
              </g>
              <g className={`landing-svg-report ${activeStep === 3 ? "is-active" : ""}`}>
                <rect x="638" y="381" width="62" height="82" rx="3" />
                <line x1="650" y1="399" x2="688" y2="399" />
                <line x1="650" y1="414" x2="684" y2="414" />
                <line x1="650" y1="429" x2="677" y2="429" />
                <path d="m650 447 10 8 17-19" />
              </g>
            </svg>
            <div className="landing-scrolly-progress" aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.max(0.02, progress)})` }} />
            </div>
            <div className="landing-scrolly-status" aria-live="polite">
              <span>{STEPS[activeStep].index}</span>
              <strong>{lang === "zh" ? STEPS[activeStep].titleZh : STEPS[activeStep].titleEn}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
