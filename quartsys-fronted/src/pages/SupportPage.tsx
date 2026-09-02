import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CircleHelp, LifeBuoy, MessagesSquare } from "lucide-react";
import {
  SiTelegram,
  SiTencentqq,
  SiWechat,
  SiWhatsapp,
} from "react-icons/si";
import { api } from "../api";
import SupportTicketsPanel from "../components/settings/SupportTicketsPanel";
import { useLanguage, useLangText } from "../shared/language";
import {
  DEFAULT_PUBLIC_SITE_SETTINGS,
  normalizePublicSiteSettings,
  type PublicSiteSettings,
} from "../shared/siteConfig";

type ContactKey = "qq" | "wechat" | "telegram" | "whatsapp";

const FAQS = [
  {
    question: "行情数据覆盖哪些市场？",
    questionEn: "Which markets are covered?",
    answer: "系统按 A 股、港股和美股隔离证券库、指数、涨跌家数、成交额、行业板块、K 线和分时数据。交易时段内按页面规则刷新，日线与基础资料由后台更新任务维护。",
    answerEn: "A-shares, Hong Kong and U.S. equities use isolated universes, indices, breadth, turnover, classifications, K-lines and intraday data. Live pages refresh during each market session, while background jobs maintain daily and profile data.",
  },
  {
    question: "AI 模型和额度如何使用？",
    questionEn: "How do AI models and credits work?",
    answer: "系统管理员维护模型服务和智能、高级、超强三个档位；用户按套餐选择可用档位。AI 洞察、刷新建议、因子生成、策略生成、智能研究、风险评估和 AI 分析师会按模块、模型、上下文、数据检索和深度研究倍率消耗额度。",
    answerEn: "Administrators maintain the model service and Smart, Advanced and Ultra tiers. Users select tiers allowed by their plan. AI Insights, advice, factors, strategies, Smart Research, risk assessment and AI Analysts consume credits by module and tier multiplier.",
  },
  {
    question: "因子、策略、回测和模拟交易如何衔接？",
    questionEn: "How do factors, strategies, backtests and simulation connect?",
    answer: "因子先筛选股票池，策略在股票池内定义买入、卖出、仓位和风控，回测在指定周期执行策略；通过验证后可绑定模拟账户进行自动模拟交易，不会连接真实券商账户。",
    answerEn: "Factors build the stock pool, strategies define entries, exits, sizing and controls, and backtests execute them over a selected period. Validated strategies can run against the simulation account without connecting to a live broker.",
  },
  {
    question: "智能研究通常需要多久？",
    questionEn: "How long does Smart Research take?",
    answer: "单股完整多智能体研究通常约 10 分钟，任务在后台运行，切换页面不会中断；批量任务会并行调度，完成后自动刷新结果。",
    answerEn: "A complete multi-agent study usually takes about 10 minutes per stock. Tasks continue in the background across navigation, and batch jobs run concurrently and refresh when complete.",
  },
  {
    question: "风险监控的数据口径是什么？",
    questionEn: "What powers Risk Monitor?",
    answer: "A 股、港股和美股采用不同权重，综合市场宽度、适用的跨境资金、全市场板块资金、指数波动、市场宏观数据、地缘政治与政策新闻。每个指标会标记实时数据、系统数据或不可用状态。",
    answerEn: "A-shares, Hong Kong and U.S. markets use different weights across breadth, applicable cross-border flow, full-market sector flow, index volatility, market-specific macro data, geopolitics and policy news. Each metric identifies live data, system data or unavailable status.",
  },
];

function contactItems(
  settings: PublicSiteSettings,
  lt: (zh: string, en: string) => string,
) {
  const source: Array<{
    key: ContactKey;
    label: string;
    Icon: typeof SiTencentqq;
    href: (value: string) => string;
  }> = [
    {
      key: "qq",
      label: "QQ",
      Icon: SiTencentqq,
      href: (value) => `https://wpa.qq.com/msgrd?v=3&uin=${encodeURIComponent(value)}&site=qq&menu=yes`,
    },
    { key: "wechat", label: lt("微信", "WeChat"), Icon: SiWechat, href: () => "" },
    {
      key: "telegram",
      label: "Telegram",
      Icon: SiTelegram,
      href: (value) => value.startsWith("http") ? value : `https://t.me/${value.replace(/^@/, "")}`,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      Icon: SiWhatsapp,
      href: (value) => value.startsWith("http") ? value : `https://wa.me/${value.replace(/\D/g, "")}`,
    },
  ];
  return source
    .map((item) => ({ ...item, value: settings.contact[item.key].trim() }))
    .filter((item) => item.value);
}

export default function SupportPage() {
  const lt = useLangText();
  const { lang } = useLanguage();
  const [siteSettings, setSiteSettings] = useState<PublicSiteSettings>(DEFAULT_PUBLIC_SITE_SETTINGS);

  useEffect(() => {
    document.title = lt("支持与帮助 | AIQuartSmart Community Edition", "Support & Help | AIQuartSmart Community Edition");
  }, [lang]);

  useEffect(() => {
    api
      .getPublicSiteSettings()
      .then((payload: any) => setSiteSettings(normalizePublicSiteSettings(payload)))
      .catch(() => {});
  }, []);

  const contacts = useMemo(() => contactItems(siteSettings, lt), [siteSettings, lang]);

  return (
    <div className="support-page">
      <header className="support-page-hero">
        <div>
          <span className="support-page-eyebrow"><LifeBuoy aria-hidden="true" /> {lt("支持中心", "SUPPORT CENTER")}</span>
          <h1>{lt("支持与帮助", "Support & Help")}</h1>
          <p>{lt("查阅系统使用方法，提交产品意见或工单，并跟踪处理结果。", "Read product guidance, submit feedback or tickets, and follow every resolution in one place.")}</p>
        </div>
        <Link className="figma-btn figma-btn-primary support-page-guide-link" to="/guide">
          <BookOpen aria-hidden="true" />
          {lt("打开使用文档", "Open User Guide")}
        </Link>
      </header>

      <section className="support-page-guide-card">
        <span className="support-page-guide-icon"><MessagesSquare aria-hidden="true" /></span>
        <div>
          <strong>{lt("需要完整操作指引？", "Need the full workflow guide?")}</strong>
          <p>{lt("使用文档覆盖行情、因子、策略、回测、模拟下单与不同套餐的使用边界。", "The user guide covers market data, factors, strategies, backtests, simulated orders and plan access boundaries.")}</p>
        </div>
        <Link to="/guide">{lt("阅读文档", "Read guide")}</Link>
      </section>

      <section className="support-page-section" aria-labelledby="support-faq-heading">
        <div className="support-page-section-heading">
          <span><CircleHelp aria-hidden="true" /></span>
          <div>
            <h2 id="support-faq-heading">{lt("常见问题", "Common Questions")}</h2>
            <p>{lt("产品数据、AI 能力和研究流程的基础说明。", "Core guidance for product data, AI capabilities and research workflows.")}</p>
          </div>
        </div>
        <div className="support-page-faq-grid">
          {FAQS.map((item) => (
            <article key={item.question}>
              <h3>{lt(item.question, item.questionEn)}</h3>
              <p>{lt(item.answer, item.answerEn)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="support-page-section support-page-ticket-section" aria-labelledby="support-ticket-heading">
        <div className="support-page-section-heading">
          <span><MessagesSquare aria-hidden="true" /></span>
          <div>
            <h2 id="support-ticket-heading">{lt("工单与意见", "Tickets & Feedback")}</h2>
            <p>{lt("提交的问题只对您和系统管理员可见；处理完成后会推送站内通知，并在 SMTP 可用时发送邮件。", "Tickets are only visible to you and system administrators. A resolved ticket creates an in-app notification and sends email when SMTP is available.")}</p>
          </div>
        </div>
        <SupportTicketsPanel />
      </section>

      {contacts.length > 0 && (
        <section className="support-page-section support-page-contact-section" aria-labelledby="support-contact-heading">
          <div className="support-page-section-heading">
            <span><LifeBuoy aria-hidden="true" /></span>
            <div>
              <h2 id="support-contact-heading">{lt("联系支持", "Contact Support")}</h2>
              <p>{lt("以下联系方式由系统管理员维护。", "These contacts are maintained by the system administrator.")}</p>
            </div>
          </div>
          <div className="support-page-contact-grid">
            {contacts.map(({ key, label, Icon, value, href }) => {
              const target = href(value);
              const content = <><Icon aria-hidden="true" /><span>{label}</span><strong>{value}</strong></>;
              return target ? (
                <a key={key} href={target} target="_blank" rel="noreferrer">{content}</a>
              ) : (
                <div key={key}>{content}</div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
