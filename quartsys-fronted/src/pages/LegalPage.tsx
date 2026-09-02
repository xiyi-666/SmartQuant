import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useLangText } from "../shared/language";

type LegalDocKey = "terms" | "privacy" | "risk";

const DOCS: Record<
  LegalDocKey,
  {
    titleZh: string;
    titleEn: string;
    updated: string;
    sections: Array<{ headingZh: string; headingEn: string; bodyZh: string[]; bodyEn: string[] }>;
  }
> = {
  terms: {
    titleZh: "用户协议",
    titleEn: "Terms of Service",
    updated: "2026-07-19",
    sections: [
      {
        headingZh: "服务定位",
        headingEn: "Service Scope",
        bodyZh: [
          "AIQuartSmart Community Edition提供行情数据整理、因子研究、策略回测、AI 分析、智能研究和模拟交易等软件工具能力。",
          "平台内容仅用于研究参考，不构成证券投资咨询、投资顾问服务、交易指令或收益承诺。",
        ],
        bodyEn: [
          "AIQuartSmart Community Edition provides software tools for market data, factor research, backtesting, AI analysis, smart research and simulated trading.",
          "Platform content is for research reference only and is not securities investment consulting, advisory service, trading instruction or a return promise.",
        ],
      },
      {
        headingZh: "用户责任",
        headingEn: "User Responsibility",
        bodyZh: [
          "用户应自行判断数据、模型和 AI 输出的适用性，并独立承担投资决策风险。",
          "用户不得利用平台从事违法违规活动，不得传播未经核验的投资建议或误导性内容。",
        ],
        bodyEn: [
          "Users are responsible for judging the suitability of data, models and AI output, and independently bear investment decision risks.",
          "Users must not use the platform for illegal activities or distribute unverified investment advice or misleading content.",
        ],
      },
      {
        headingZh: "数据与可用性",
        headingEn: "Data and Availability",
        bodyZh: [
          "行情、公告、研报、新闻、资金流和财务数据可能存在延迟、缺失、错误或来源不可用。",
          "平台会尽量展示数据来源、更新时间、缺失项和方法限制，但不保证服务持续无中断或数据绝对准确。",
        ],
        bodyEn: [
          "Quotes, filings, research reports, news, capital flow and financial data may be delayed, missing, incorrect or temporarily unavailable.",
          "The platform will disclose data sources, timestamps, missing fields and method limitations where possible, but does not guarantee uninterrupted service or absolute accuracy.",
        ],
      },
    ],
  },
  privacy: {
    titleZh: "隐私条款",
    titleEn: "Privacy Policy",
    updated: "2026-07-19",
    sections: [
      {
        headingZh: "收集的信息",
        headingEn: "Information We Collect",
        bodyZh: [
          "平台可能收集账号信息、登录方式、邮箱、手机号、头像、订阅记录、积分流水、功能使用记录和必要的安全日志。",
          "AI 功能会记录用户、时间、模型、数据源、输入输出摘要、Token 用量和免责声明版本，用于计费、审计、排错和安全风控。",
        ],
        bodyEn: [
          "The platform may collect account information, sign-in methods, email, phone number, avatar, subscription records, credit ledger, feature usage and necessary security logs.",
          "AI features record user, time, model, data source, input/output summary, token usage and disclaimer version for billing, audit, troubleshooting and security control.",
        ],
      },
      {
        headingZh: "信息使用",
        headingEn: "How We Use Information",
        bodyZh: [
          "信息用于账号登录、权限控制、订阅支付、积分计费、AI 功能调用、风险防护、服务优化和用户支持。",
          "除法律法规要求、支付结算、安全审计或用户授权外，平台不会主动对外披露个人信息。",
        ],
        bodyEn: [
          "Information is used for authentication, access control, subscriptions, credit metering, AI calls, security protection, service improvement and user support.",
          "Except where required by law, payment settlement, security audit or user authorization, the platform will not proactively disclose personal information.",
        ],
      },
      {
        headingZh: "安全措施",
        headingEn: "Security",
        bodyZh: [
          "平台会对访问密钥、Cookie、支付密钥和敏感配置进行脱敏展示，并限制后台管理权限。",
          "用户应妥善保管自己的账号、密码、API Key 和第三方 Cookie，避免泄露给他人。",
        ],
        bodyEn: [
          "The platform masks access keys, cookies, payment secrets and sensitive configuration, and restricts administrative permissions.",
          "Users should protect their accounts, passwords, API keys and third-party cookies from disclosure.",
        ],
      },
    ],
  },
  risk: {
    titleZh: "风险提示",
    titleEn: "Risk Disclosure",
    updated: "2026-07-19",
    sections: [
      {
        headingZh: "非投资建议",
        headingEn: "Not Investment Advice",
        bodyZh: [
          "平台展示的市场洞察、AI 观察池、因子结果、研究报告、风险评估和策略回测均仅供研究参考。",
          "平台不提供证券投资咨询服务，不构成买入、卖出、持有、仓位配置、目标价或任何交易指令。",
        ],
        bodyEn: [
          "Market insights, AI watchlist pool, factor results, research reports, risk assessment and strategy backtests are for research reference only.",
          "The platform does not provide securities investment consulting and does not constitute buy, sell, hold, allocation, target price or any trading instruction.",
        ],
      },
      {
        headingZh: "模型与回测风险",
        headingEn: "Model and Backtest Risk",
        bodyZh: [
          "AI 输出可能存在幻觉、遗漏、过度拟合、数据滞后或对市场事件理解偏差。",
          "历史回测不代表未来表现，模拟交易不等同于真实交易，交易成本、滑点、流动性和停牌等因素可能造成显著差异。",
        ],
        bodyEn: [
          "AI output may contain hallucinations, omissions, overfitting, data latency or misinterpretation of market events.",
          "Historical backtests do not represent future performance. Simulated trading is not live trading, and costs, slippage, liquidity and suspensions can materially change outcomes.",
        ],
      },
      {
        headingZh: "市场风险",
        headingEn: "Market Risk",
        bodyZh: [
          "股票、ETF、可转债、债券、衍生品及其他金融资产价格会受到政策、宏观、行业、公司、流动性和市场情绪影响。",
          "用户应结合自身风险承受能力、投资目标和独立判断使用本平台。",
        ],
        bodyEn: [
          "Prices of stocks, ETFs, convertible bonds, bonds, derivatives and other financial assets may be affected by policy, macro, sector, company, liquidity and sentiment factors.",
          "Users should use this platform with their own risk tolerance, investment objectives and independent judgment.",
        ],
      },
    ],
  },
};

export default function LegalPage() {
  const lt = useLangText();
  const navigate = useNavigate();
  const { doc = "terms" } = useParams();
  const key = doc as LegalDocKey;
  const content = DOCS[key];
  if (!content) return <Navigate to="/legal/terms" replace />;

  return (
    <main className="legal-page">
      <header className="legal-header">
        <div className="legal-header-left">
          <button
            type="button"
            className="legal-back-button"
            onClick={() => {
              const historyIndex = Number(window.history.state?.idx || 0);
              if (historyIndex > 0) navigate(-1);
              else navigate("/");
            }}
          >
            <ArrowLeft aria-hidden="true" />
            <span>{lt("返回", "Back")}</span>
          </button>
          <Link to="/" className="legal-brand" aria-label={lt("返回主页", "Back to home")}>
            <span>{lt("AIQuartSmart Community Edition", "AIQuartSmart Community Edition")}</span>
          </Link>
        </div>
        <Link to="/login" className="legal-login-link">
          {lt("登录", "Sign In")}
        </Link>
      </header>

      <article className="legal-document">
        <div className="legal-document-title">
          <ShieldCheck size={24} aria-hidden="true" />
          <div>
            <h1>{lt(content.titleZh, content.titleEn)}</h1>
            <p>{lt(`更新时间：${content.updated}`, `Updated: ${content.updated}`)}</p>
          </div>
        </div>

        {content.sections.map((section) => (
          <section key={section.headingEn}>
            <h2>{lt(section.headingZh, section.headingEn)}</h2>
            {section.bodyZh.map((item, index) => (
              <p key={item}>{lt(item, section.bodyEn[index] || item)}</p>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
