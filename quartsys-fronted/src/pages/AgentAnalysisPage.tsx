import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import * as echarts from "echarts";
import { marked } from "marked";
import {
  Activity,
  BadgeCheck,
  Bot,
  ChartCandlestick,
  ChevronLeft,
  ChevronRight,
  Coins,
  Database,
  Download,
  Edit3,
  FileText,
  Globe2,
  Image as ImageIcon,
  Landmark,
  Link2,
  MessageSquareMore,
  Newspaper,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Upload,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { api } from "../api";
import { getAuthUser, getToken } from "../shared/auth";
import { aiModelOptionLabel, AiModelInput, useAiModelSelection } from "../shared/aiModels";
import { DEFAULT_AI_MODEL } from "../shared/aiDefaults";
import { useLanguage } from "../shared/language";
import { MARKET_DEFINITIONS, normalizeMarket, useMarket } from "../shared/market";
import { useTheme } from "../shared/theme";
import { COMMUNITY_EDITION } from "../shared/edition";

type McpServer = {
  name: string;
  endpoint: string;
  tool: string;
  enabled: boolean;
  arguments?: Record<string, unknown>;
};

type FinancialAgent = {
  id: number;
  owner_user_id?: number | null;
  name: string;
  category: string;
  icon?: string;
  color?: string;
  description?: string;
  system_prompt: string;
  model?: string;
  tools: string[];
  skills: string[];
  mcp_servers: McpServer[];
  visibility: "private" | "public";
  is_builtin: boolean;
  enabled: boolean;
  can_edit: boolean;
};

type RichBlock =
  | { type: "markdown"; content: string }
  | { type: "table"; columns: string[]; rows: string[][] }
  | {
      type: "chart";
      chart_type: "line" | "bar" | "radar" | "pie" | "scatter";
      title?: string;
      categories?: string[];
      series: { name: string; data: Array<number | null> }[];
    }
  | { type: "image"; url: string; alt?: string; caption?: string }
  | { type: "code"; language?: string; content: string }
  | { type: "callout"; tone?: string; content: string }
  | { type: "metrics"; items: { label: string; value: string; trend?: string }[] };

type AnalysisMessage = {
  id: number;
  agent_id?: number | null;
  sender_type: "system" | "agent" | "user" | "moderator";
  sender_name: string;
  round_no: number;
  content_markdown: string;
  blocks: RichBlock[];
  meta: Record<string, any>;
  created_at?: string;
};

type AnalysisSession = {
  id: number;
  title: string;
  subject_type: string;
  subject: string;
  symbol?: string;
  market?: string;
  agent_ids: number[];
  model?: string;
  max_rounds: number;
  current_round: number;
  status: string;
  progress: Record<string, any>;
  result: Record<string, any>;
  memory?: {
    enabled?: boolean;
    summary?: string;
    message_count?: number;
    round_count?: number;
    context_policy?: string;
  };
  report_ready: boolean;
  error?: string;
  messages?: AnalysisMessage[];
  created_at?: string;
  updated_at?: string;
};

type AssistantSkill = {
  key: string;
  name: string;
  name_en?: string;
  description?: string;
};

type CreditSummary = {
  unlimited?: boolean;
  credits_total?: number | null;
  credits_used?: number;
  credits_remaining?: number | null;
};

type BillingEstimate = {
  estimated_credits?: number;
  raw_estimated_credits?: number;
  base_credits?: number;
  chargeable?: boolean;
  multipliers?: {
    model?: number;
    context?: number;
    data_retrieval?: number;
    deep_research?: number;
    total_after_model?: number;
  };
  model?: {
    model_tier?: string;
    model_multiplier?: number;
    base_unit_credits?: number;
    unit_credits?: number;
  };
  agent_count?: number;
  rounds?: number;
  per_agent_round_credits?: number;
  moderator_summary_credits?: number;
};

type AgentCapabilities = {
  role: "normal" | "vip" | "svip" | "admin";
  can_create_agents: boolean;
  can_configure_mcp_allowlist: boolean;
  can_enter_custom_model: boolean;
  max_agents: number;
  max_initial_rounds: number;
  max_session_rounds: number;
  mcp_mode: "none" | "allowlist" | "unrestricted";
  available_models: string[];
  approved_mcp_servers: McpServer[];
  costs: {
    per_agent_round: number;
    moderator_summary: number;
  };
  credit_summary: CreditSummary;
};

const DEFAULT_CAPABILITIES: AgentCapabilities = {
  role: "normal",
  can_create_agents: false,
  can_configure_mcp_allowlist: false,
  can_enter_custom_model: false,
  max_agents: 2,
  max_initial_rounds: 1,
  max_session_rounds: 50,
  mcp_mode: "none",
  available_models: [DEFAULT_AI_MODEL],
  approved_mcp_servers: [],
  costs: { per_agent_round: 20, moderator_summary: 20 },
  credit_summary: {},
};

const TOOL_OPTIONS = [
  { key: "database", label: "数据库", labelEn: "Database", Icon: Database },
  { key: "f10", label: "公司信息", labelEn: "Company Data", Icon: FileText },
  { key: "news", label: "市场新闻", labelEn: "Market News", Icon: Newspaper },
  { key: "web_search", label: "联网搜索", labelEn: "Web Search", Icon: Search },
] as const;

const CATEGORY_OPTIONS = [
  { value: "value", label: "价值", labelEn: "Value" },
  { value: "quality", label: "质量", labelEn: "Quality" },
  { value: "growth", label: "成长", labelEn: "Growth" },
  { value: "technical", label: "技术", labelEn: "Technical" },
  { value: "macro", label: "宏观地缘", labelEn: "Macro / Geo" },
  { value: "sentiment", label: "情绪新闻", labelEn: "Sentiment" },
  { value: "risk", label: "风险", labelEn: "Risk" },
  { value: "general", label: "综合", labelEn: "General" },
] as const;

const SUBJECT_TYPES = [
  { value: "stock", label: "个股", labelEn: "Stock" },
  { value: "event", label: "事件", labelEn: "Event" },
  { value: "sentiment", label: "情绪", labelEn: "Sentiment" },
  { value: "industry", label: "行业", labelEn: "Industry" },
  { value: "portfolio", label: "组合", labelEn: "Portfolio" },
] as const;

const AGENT_ICON_OPTIONS = [
  { key: "bot", label: "智能体", labelEn: "Agent", Icon: Bot },
  { key: "landmark", label: "价值", labelEn: "Value", Icon: Landmark },
  { key: "badge-check", label: "质量", labelEn: "Quality", Icon: BadgeCheck },
  { key: "trending-up", label: "成长", labelEn: "Growth", Icon: TrendingUp },
  { key: "chart-candlestick", label: "技术", labelEn: "Technical", Icon: ChartCandlestick },
  { key: "globe-2", label: "宏观", labelEn: "Macro", Icon: Globe2 },
  { key: "newspaper", label: "新闻", labelEn: "News", Icon: Newspaper },
  { key: "shield-alert", label: "风险", labelEn: "Risk", Icon: ShieldAlert },
] as const;

const MAX_AGENT_ICON_DATA_URL_LENGTH = 420_000;
const AGENT_ANALYSIS_PAGE_SIZE = 7;

const EMPTY_AGENT_DRAFT = {
  id: 0,
  name: "",
  category: "general",
  icon: "bot",
  color: "#2563eb",
  description: "",
  system_prompt: "",
  model: "",
  tools: ["database", "news"],
  skills: [] as string[],
  mcp_servers: [] as McpServer[],
  visibility: "private" as "private" | "public",
  enabled: true,
  is_builtin: false,
};

function useLangText() {
  const { lang } = useLanguage();
  return (zh: string, en: string) => (lang === "zh" ? zh : en);
}

function markdownHtml(markdown: string) {
  const html = marked.parse(markdown || "", { gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["sub", "sup"],
    ADD_ATTR: ["target", "rel"],
  });
}

function isAgentImageIcon(value?: string) {
  const icon = String(value || "").trim();
  return /^https?:\/\//i.test(icon) || /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(icon);
}

function iconComponentForKey(icon?: string, category?: string) {
  const iconKey = String(icon || "").trim();
  const matched = AGENT_ICON_OPTIONS.find((item) => item.key === iconKey);
  if (matched) return matched.Icon;
  if (category === "value") return Landmark;
  if (category === "quality") return BadgeCheck;
  if (category === "growth") return TrendingUp;
  if (category === "technical") return ChartCandlestick;
  if (category === "macro") return Globe2;
  if (category === "sentiment") return Newspaper;
  if (category === "risk") return ShieldAlert;
  return Bot;
}

function fileToAgentIconDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("请选择图片文件"));
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const size = 192;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器不支持图片处理");
        const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
        const sourceX = ((image.naturalWidth || image.width) - sourceSize) / 2;
        const sourceY = ((image.naturalHeight || image.height) - sourceSize) / 2;
        context.clearRect(0, 0, size, size);
        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        const dataUrl = canvas.toDataURL("image/webp", 0.82);
        URL.revokeObjectURL(url);
        if (dataUrl.length > MAX_AGENT_ICON_DATA_URL_LENGTH) {
          reject(new Error("图片压缩后仍然过大，请换一张更小的头像"));
          return;
        }
        resolve(dataUrl);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

function AgentAvatar({ agent, size = 38 }: { agent?: FinancialAgent; size?: number }) {
  const category = agent?.category || "general";
  const icon = agent?.icon || "";
  const Icon = iconComponentForKey(icon, category);
  return (
    <span
      className={`agent-analysis-avatar ${isAgentImageIcon(icon) ? "has-image" : ""}`}
      style={{
        width: size,
        height: size,
        color: agent?.color || "#2563eb",
        borderColor: `${agent?.color || "#2563eb"}55`,
        background: `${agent?.color || "#2563eb"}12`,
      }}
    >
      {isAgentImageIcon(icon) ? (
        <img src={icon} alt="" aria-hidden="true" />
      ) : (
        <Icon size={Math.max(16, size * 0.48)} />
      )}
    </span>
  );
}

function RichChart({ block }: { block: Extract<RichBlock, { type: "chart" }> }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current || !block.series?.length) return;
    const chart = echarts.init(ref.current);
    const dark = theme === "dark";
    const textColor = dark ? "#d4d3cc" : "#44443f";
    const mutedColor = dark ? "#a9afb7" : "#6b6b63";
    const borderColor = dark ? "rgba(255,255,255,.14)" : "rgba(113,110,98,.2)";
    const common = {
      backgroundColor: "transparent",
      color: ["#dc2626", "#2563eb", "#16a34a", "#5ba7b5", "#9b7bd3", "#d977a4"],
      textStyle: { color: textColor },
      tooltip: {
        trigger: block.chart_type === "pie" ? "item" : "axis",
        backgroundColor: dark ? "rgba(17,19,22,.97)" : "rgba(255,255,255,.97)",
        borderColor,
        textStyle: { color: textColor },
      },
      animationDuration: 450,
    } as any;
    let option: any;
    if (block.chart_type === "radar") {
      option = {
        ...common,
        radar: {
          radius: "66%",
          indicator: (block.categories || []).map((name) => ({ name, max: 100 })),
          axisName: { color: textColor },
          splitArea: { areaStyle: { color: ["rgba(217,170,78,.03)", "rgba(217,170,78,.08)"] } },
          splitLine: { lineStyle: { color: borderColor } },
          axisLine: { lineStyle: { color: borderColor } },
        },
        series: [
          {
            type: "radar",
            data: block.series.map((series) => ({ name: series.name, value: series.data })),
            areaStyle: { opacity: 0.14 },
          },
        ],
      };
    } else if (block.chart_type === "pie") {
      option = {
        ...common,
        series: [
          {
            type: "pie",
            radius: ["42%", "70%"],
            data: (block.categories || []).map((name, index) => ({
              name,
              value: block.series[0]?.data?.[index] ?? 0,
            })),
          },
        ],
      };
    } else {
      option = {
        ...common,
        grid: { left: 48, right: 22, top: 28, bottom: 44, containLabel: true },
        xAxis: {
          type: "category",
          data: block.categories || [],
          axisLabel: { color: mutedColor, hideOverlap: true },
          axisLine: { lineStyle: { color: borderColor } },
        },
        yAxis: {
          type: "value",
          scale: true,
          axisLabel: { color: mutedColor },
          splitLine: { lineStyle: { color: borderColor } },
        },
        series: block.series.map((series) => ({
          name: series.name,
          type: block.chart_type === "scatter" ? "scatter" : block.chart_type,
          data: series.data,
          smooth: block.chart_type === "line",
          connectNulls: true,
          symbolSize: block.chart_type === "scatter" ? 8 : 4,
          lineStyle: { width: 2 },
          itemStyle: { borderWidth: 1 },
        })),
      };
    }
    chart.setOption(option);
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [block, theme]);

  return (
    <div className="agent-rich-chart-wrap">
      {block.title && <div className="agent-rich-chart-title">{block.title}</div>}
      <div ref={ref} className="agent-rich-chart" />
    </div>
  );
}

function RichContent({ blocks, markdown }: { blocks?: RichBlock[]; markdown?: string }) {
  const safeBlocks = Array.isArray(blocks) && blocks.length
    ? blocks
    : markdown
      ? ([{ type: "markdown", content: markdown }] as RichBlock[])
      : [];
  return (
    <div className="agent-rich-content">
      {safeBlocks.map((block, index) => {
        if (block.type === "markdown") {
          return (
            <div
              key={index}
              className="agent-rich-markdown"
              dangerouslySetInnerHTML={{ __html: markdownHtml(block.content) }}
            />
          );
        }
        if (block.type === "table") {
          return (
            <div className="agent-rich-table-wrap" key={index}>
              <table>
                <thead>
                  <tr>{block.columns.map((column) => <th key={column}>{column}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {block.columns.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] || ""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "chart") return <RichChart key={index} block={block} />;
        if (block.type === "image") {
          return (
            <figure className="agent-rich-image" key={index}>
              <img src={block.url} alt={block.alt || "Agent research"} loading="lazy" />
              {block.caption && <figcaption>{block.caption}</figcaption>}
            </figure>
          );
        }
        if (block.type === "code") {
          return (
            <div className="agent-rich-code" key={index}>
              <div>{block.language || "text"}</div>
              <pre><code>{block.content}</code></pre>
            </div>
          );
        }
        if (block.type === "callout") {
          return <div className={`agent-rich-callout tone-${block.tone || "info"}`} key={index}>{block.content}</div>;
        }
        if (block.type === "metrics") {
          return (
            <div className="agent-rich-metrics" key={index}>
              {block.items.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong className={`trend-${item.trend || "neutral"}`}>{item.value}</strong>
                </div>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function stanceLabel(stance: string, lt: (zh: string, en: string) => string) {
  if (stance === "bullish") return lt("偏多", "Bullish");
  if (stance === "bearish") return lt("偏空", "Bearish");
  if (stance === "mixed") return lt("分歧", "Mixed");
  return lt("中性", "Neutral");
}

function statusLabel(status: string, lt: (zh: string, en: string) => string) {
  if (status === "running") return lt("讨论中", "Discussing");
  if (status === "pending") return lt("等待中", "Pending");
  if (status === "done") return lt("已完成", "Completed");
  if (status === "failed") return lt("失败", "Failed");
  return status;
}

function CompactPager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="agent-analysis-pager">
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
        <ChevronLeft size={14} />
      </button>
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((value) => (
        <button
          type="button"
          key={value}
          className={value === page ? "active" : ""}
          onClick={() => onChange(value)}
        >
          {value}
        </button>
      ))}
      <button type="button" onClick={() => onChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export default function AgentAnalysisPage() {
  const { lang } = useLanguage();
  const lt = useLangText();
  const { market, definition } = useMarket();
  const { selectedModel, setSelectedModel, modelOptions } = useAiModelSelection("agent_analysis");
  const isAdmin = String(getAuthUser()?.role || "").toLowerCase() === "admin";
  const [agents, setAgents] = useState<FinancialAgent[]>([]);
  const [capabilities, setCapabilities] = useState<AgentCapabilities>(DEFAULT_CAPABILITIES);
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [sessionPage, setSessionPage] = useState(1);
  const [agentPage, setAgentPage] = useState(1);
  const [activeSession, setActiveSession] = useState<AnalysisSession | null>(null);
  const [sessionBillingEstimate, setSessionBillingEstimate] = useState<BillingEstimate | null>(null);
  const [sessionBillingQuoteError, setSessionBillingQuoteError] = useState("");
  const [followUpBillingEstimate, setFollowUpBillingEstimate] = useState<BillingEstimate | null>(null);
  const [followUpBillingQuoteError, setFollowUpBillingQuoteError] = useState("");
  const [skills, setSkills] = useState<AssistantSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [composer, setComposer] = useState("");
  const [composerTarget, setComposerTarget] = useState("all");
  const [sending, setSending] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showMcpSettings, setShowMcpSettings] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [savingMcpSettings, setSavingMcpSettings] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [agentDraft, setAgentDraft] = useState({ ...EMPTY_AGENT_DRAFT });
  const [sessionDraft, setSessionDraft] = useState({
    title: "",
    subject_type: "stock",
    subject: "",
    symbol: "",
    market,
    agent_ids: [] as number[],
    max_rounds: 1,
    model: selectedModel,
  });
  const [mcpSettingsDraft, setMcpSettingsDraft] = useState<McpServer[]>([]);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const agentDraftPreview = useMemo(
    () => ({
      id: agentDraft.id,
      name: agentDraft.name || lt("分析师", "Analyst"),
      category: agentDraft.category,
      icon: agentDraft.icon,
      color: agentDraft.color,
      description: agentDraft.description,
      system_prompt: agentDraft.system_prompt,
      model: agentDraft.model,
      tools: agentDraft.tools,
      skills: agentDraft.skills,
      mcp_servers: agentDraft.mcp_servers,
      visibility: agentDraft.visibility,
      is_builtin: agentDraft.is_builtin,
      enabled: agentDraft.enabled,
      can_edit: true,
    }) as FinancialAgent,
    [agentDraft, lt],
  );
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const committee = useMemo(
    () => (activeSession?.agent_ids || []).map((id) => agentMap.get(id)).filter(Boolean) as FinancialAgent[],
    [activeSession?.agent_ids, agentMap],
  );
  const marketSessions = useMemo(
    () => sessions.filter((session) => normalizeMarket(session.market) === market),
    [sessions, market],
  );
  const sessionPageCount = Math.max(1, Math.ceil(marketSessions.length / AGENT_ANALYSIS_PAGE_SIZE));
  const agentPageCount = Math.max(1, Math.ceil(agents.length / AGENT_ANALYSIS_PAGE_SIZE));
  const pagedSessions = marketSessions.slice(
    (sessionPage - 1) * AGENT_ANALYSIS_PAGE_SIZE,
    sessionPage * AGENT_ANALYSIS_PAGE_SIZE,
  );
  const pagedAgents = agents.slice(
    (agentPage - 1) * AGENT_ANALYSIS_PAGE_SIZE,
    agentPage * AGENT_ANALYSIS_PAGE_SIZE,
  );
  const availableModels = capabilities.available_models.length
    ? capabilities.available_models
    : modelOptions;
  const fallbackSessionCreditCost =
    sessionDraft.agent_ids.length *
      sessionDraft.max_rounds *
      capabilities.costs.per_agent_round +
    (sessionDraft.agent_ids.length ? capabilities.costs.moderator_summary : 0);
  const sessionCreditCost = sessionBillingEstimate?.estimated_credits ?? fallbackSessionCreditCost;
  const followUpAgentCount = composerTarget === "all" ? committee.length : 1;
  const fallbackFollowUpCreditCost =
    followUpAgentCount * capabilities.costs.per_agent_round +
    (followUpAgentCount ? capabilities.costs.moderator_summary : 0);
  const followUpCreditCost = followUpBillingEstimate?.estimated_credits ?? fallbackFollowUpCreditCost;

  const updateCreditSummary = (summary?: CreditSummary | null) => {
    if (!summary) return;
    setCapabilities((current) => ({ ...current, credit_summary: summary }));
  };

  const loadSession = async (sessionId: number, quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response: any = await api.getAgentAnalysisSession(sessionId);
      const next = response?.session as AnalysisSession;
      setActiveSession(next);
      setSessions((current) => current.map((item) => item.id === next.id ? { ...item, ...next, messages: undefined } : item));
      setError("");
    } catch (requestError: any) {
      if (!quiet) setError(requestError?.message || lt("会话加载失败", "Failed to load session"));
    } finally {
      if (!quiet) setRefreshing(false);
    }
  };

  const loadWorkspace = async () => {
    setLoading(true);
    setError("");
    try {
      const [agentResponse, sessionResponse, skillResponse, capabilityResponse]: any[] = await Promise.all([
        api.listFinancialAgents(),
        api.listAgentAnalysisSessions(),
        api.getAssistantSkills().catch(() => ({ skills: [] })),
        api.getAgentAnalysisCapabilities(),
      ]);
      const nextAgents = Array.isArray(agentResponse?.agents) ? agentResponse.agents : [];
      const nextSessions = Array.isArray(sessionResponse?.sessions) ? sessionResponse.sessions : [];
      setAgents(nextAgents);
      setSessions(nextSessions);
      setSkills(Array.isArray(skillResponse?.skills) ? skillResponse.skills : []);
      const nextCapabilities = {
        ...DEFAULT_CAPABILITIES,
        ...(capabilityResponse || {}),
        costs: { ...DEFAULT_CAPABILITIES.costs, ...(capabilityResponse?.costs || {}) },
        credit_summary: capabilityResponse?.credit_summary || {},
        available_models: Array.isArray(capabilityResponse?.available_models)
          ? capabilityResponse.available_models
          : DEFAULT_CAPABILITIES.available_models,
        approved_mcp_servers: Array.isArray(capabilityResponse?.approved_mcp_servers)
          ? capabilityResponse.approved_mcp_servers
          : [],
      } as AgentCapabilities;
      setCapabilities(nextCapabilities);
      setMcpSettingsDraft(nextCapabilities.approved_mcp_servers.map((server) => ({ ...server })));
      if (!nextCapabilities.can_enter_custom_model && !nextCapabilities.available_models.includes(selectedModel)) {
        setSelectedModel(nextCapabilities.available_models[0] || DEFAULT_AI_MODEL);
      }
      const preferredSession = nextSessions.find(
        (session: AnalysisSession) => normalizeMarket(session.market) === market,
      );
      if (preferredSession) {
        await loadSession(
          activeSession && normalizeMarket(activeSession.market) === market
            ? activeSession.id
            : preferredSession.id,
          true,
        );
      } else {
        setActiveSession(null);
      }
    } catch (requestError: any) {
      setError(requestError?.message || lt("AI 分析师加载失败", "Failed to load AI Analysts"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (!activeSession || !["pending", "running"].includes(activeSession.status)) return;
    const timer = window.setInterval(() => loadSession(activeSession.id, true), 2200);
    return () => window.clearInterval(timer);
  }, [activeSession?.id, activeSession?.status]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    window.requestAnimationFrame(() => {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    });
  }, [activeSession?.messages?.length, activeSession?.status]);

  useEffect(() => {
    if (composerTarget === "all") return;
    if (!committee.some((agent) => String(agent.id) === composerTarget)) {
      setComposerTarget("all");
    }
  }, [committee, composerTarget]);

  useEffect(() => {
    if (!showSessionModal) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.quoteAgentAnalysisSession(sessionDraft)
        .then((response: any) => {
          if (cancelled) return;
          setSessionBillingEstimate(response?.billing_estimate || null);
          setSessionBillingQuoteError(response?.reason || "");
        })
        .catch((requestError: any) => {
          if (cancelled) return;
          setSessionBillingEstimate(null);
          setSessionBillingQuoteError(requestError?.message || "额度预估失败");
        });
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    showSessionModal,
    sessionDraft.title,
    sessionDraft.subject_type,
    sessionDraft.subject,
    sessionDraft.symbol,
    sessionDraft.market,
    sessionDraft.agent_ids.join("|"),
    sessionDraft.max_rounds,
    sessionDraft.model,
  ]);

  useEffect(() => {
    if (!activeSession || !composer.trim()) {
      setFollowUpBillingEstimate(null);
      setFollowUpBillingQuoteError("");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.quoteAgentAnalysisMessage(activeSession.id, {
        content: composer.trim(),
        continue_discussion: true,
        target_agent_id: composerTarget === "all" ? null : Number(composerTarget),
      })
        .then((response: any) => {
          if (cancelled) return;
          setFollowUpBillingEstimate(response?.billing_estimate || null);
          setFollowUpBillingQuoteError(response?.reason || "");
        })
        .catch((requestError: any) => {
          if (cancelled) return;
          setFollowUpBillingEstimate(null);
          setFollowUpBillingQuoteError(requestError?.message || "额度预估失败");
        });
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSession?.id, composer, composerTarget]);

  const openNewSession = () => {
    const defaultIds = agents
      .filter((agent) => agent.enabled)
      .slice(0, Math.min(4, capabilities.max_agents))
      .map((agent) => agent.id);
    const defaultModel = capabilities.can_enter_custom_model
      ? selectedModel
      : availableModels.includes(selectedModel)
        ? selectedModel
        : availableModels[0] || DEFAULT_AI_MODEL;
    setSessionDraft({
      title: "",
      subject_type: "stock",
      subject: "",
      symbol: "",
      market,
      agent_ids: defaultIds,
      max_rounds: 1,
      model: defaultModel,
    });
    setSessionBillingEstimate(null);
    setSessionBillingQuoteError("");
    setShowSessionModal(true);
  };

  useEffect(() => {
    setSessionDraft((current) => ({ ...current, market }));
    const nextSession = sessions.find(
      (session) => normalizeMarket(session.market) === market,
    );
    if (nextSession && normalizeMarket(activeSession?.market) !== market) {
      void loadSession(nextSession.id, true);
    } else if (!nextSession && normalizeMarket(activeSession?.market) !== market) {
      setActiveSession(null);
    }
  }, [market, sessions]);

  useEffect(() => {
    setSessionPage(1);
  }, [market]);

  useEffect(() => {
    if (sessionPage > sessionPageCount) setSessionPage(sessionPageCount);
  }, [sessionPage, sessionPageCount]);

  useEffect(() => {
    if (agentPage > agentPageCount) setAgentPage(agentPageCount);
  }, [agentPage, agentPageCount]);

  const createSession = async () => {
    const minAgents = COMMUNITY_EDITION ? 1 : 2;
    if (!sessionDraft.subject.trim() || sessionDraft.agent_ids.length < minAgents) {
      setError(lt(
        COMMUNITY_EDITION ? "请填写主题并至少选择一位分析师" : "请填写讨论主题并至少选择两个分析师",
        COMMUNITY_EDITION ? "Enter a topic and select one analyst" : "Enter a topic and select at least two analysts",
      ));
      return;
    }
    setCreatingSession(true);
    try {
      const response: any = await api.createAgentAnalysisSession(sessionDraft);
      const next = response?.session as AnalysisSession;
      setSessionBillingEstimate(response?.billing_estimate || sessionBillingEstimate);
      updateCreditSummary(response?.credit_summary);
      setSelectedModel(sessionDraft.model || selectedModel);
      setSessions((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setActiveSession(next);
      setShowSessionModal(false);
      setError("");
    } catch (requestError: any) {
      setError(requestError?.message || lt("创建讨论失败", "Failed to create discussion"));
    } finally {
      setCreatingSession(false);
    }
  };

  const openAgentEditor = (agent?: FinancialAgent) => {
    if (agent) {
      setAgentDraft({
        id: agent.id,
        name: agent.name,
        category: agent.category,
        icon: agent.icon || "bot",
        color: agent.color || "#2563eb",
        description: agent.description || "",
        system_prompt: agent.system_prompt,
        model: capabilities.can_enter_custom_model || !agent.model || availableModels.includes(agent.model)
          ? agent.model || ""
          : "",
        tools: [...(agent.tools || [])],
        skills: [...(agent.skills || [])],
        mcp_servers: capabilities.mcp_mode === "none"
          ? []
          : (agent.mcp_servers || []).map((server) => ({ ...server })),
        visibility: agent.visibility,
        enabled: agent.enabled,
        is_builtin: agent.is_builtin,
      });
    } else {
      setAgentDraft({ ...EMPTY_AGENT_DRAFT, tools: [...EMPTY_AGENT_DRAFT.tools], skills: [], mcp_servers: [] });
    }
    setShowAgentModal(true);
  };

  const handleAgentIconUpload = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToAgentIconDataUrl(file);
      setAgentDraft((current) => ({ ...current, icon: dataUrl }));
      setError("");
    } catch (uploadError: any) {
      setError(uploadError?.message || lt("头像上传失败", "Failed to upload avatar"));
    }
  };

  const saveAgent = async () => {
    if (!agentDraft.name.trim() || agentDraft.system_prompt.trim().length < 20) {
      setError(lt("请填写分析师名称和完整系统提示词", "Enter an analyst name and full system prompt"));
      return;
    }
    setSavingAgent(true);
    try {
      const payload = { ...agentDraft };
      if (agentDraft.id) await api.updateFinancialAgent(agentDraft.id, payload);
      else await api.createFinancialAgent(payload);
      const response: any = await api.listFinancialAgents();
      setAgents(Array.isArray(response?.agents) ? response.agents : []);
      setShowAgentModal(false);
      setError("");
    } catch (requestError: any) {
      setError(requestError?.message || lt("保存分析师失败", "Failed to save analyst"));
    } finally {
      setSavingAgent(false);
    }
  };

  const deleteAgent = async (agent: FinancialAgent) => {
    if (!window.confirm(lt(`确认删除“${agent.name}”？`, `Delete “${agent.name}”?`))) return;
    try {
      await api.deleteFinancialAgent(agent.id);
      setAgents((current) => current.filter((item) => item.id !== agent.id));
    } catch (requestError: any) {
      setError(requestError?.message || lt("删除失败", "Delete failed"));
    }
  };

  const sendMessage = async () => {
    if (!activeSession || !composer.trim() || sending) return;
    setSending(true);
    try {
      const response: any = await api.postAgentAnalysisMessage(activeSession.id, {
        content: composer.trim(),
        continue_discussion: true,
        target_agent_id: composerTarget === "all" ? null : Number(composerTarget),
      });
      setActiveSession(response?.session || activeSession);
      setFollowUpBillingEstimate(response?.billing_estimate || followUpBillingEstimate);
      updateCreditSummary(response?.credit_summary);
      setComposer("");
      setFollowUpBillingQuoteError("");
      setError("");
    } catch (requestError: any) {
      setError(requestError?.message || lt("消息发送失败", "Failed to send message"));
    } finally {
      setSending(false);
    }
  };

  const saveMcpSettings = async () => {
    setSavingMcpSettings(true);
    try {
      const response: any = await api.saveAgentAnalysisSettings({ servers: mcpSettingsDraft });
      setCapabilities((current) => ({
        ...current,
        ...(response || {}),
        approved_mcp_servers: Array.isArray(response?.approved_mcp_servers)
          ? response.approved_mcp_servers
          : [],
      }));
      setMcpSettingsDraft(
        Array.isArray(response?.approved_mcp_servers)
          ? response.approved_mcp_servers.map((server: McpServer) => ({ ...server }))
          : [],
      );
      setShowMcpSettings(false);
      setError("");
    } catch (requestError: any) {
      setError(requestError?.message || lt("MCP 白名单保存失败", "Failed to save MCP allowlist"));
    } finally {
      setSavingMcpSettings(false);
    }
  };

  const deleteSession = async (session: AnalysisSession) => {
    if (["pending", "running"].includes(session.status)) {
      setError(lt("运行中的讨论暂不能删除", "A running discussion cannot be deleted"));
      return;
    }
    if (!window.confirm(lt(`确认删除“${session.title}”？`, `Delete “${session.title}”?`))) return;
    try {
      await api.deleteAgentAnalysisSession(session.id);
      const remaining = sessions.filter((item) => item.id !== session.id);
      setSessions(remaining);
      if (activeSession?.id === session.id) {
        setActiveSession(null);
        if (remaining[0]) await loadSession(remaining[0].id);
      }
    } catch (requestError: any) {
      setError(requestError?.message || lt("删除会话失败", "Failed to delete session"));
    }
  };

  const downloadReport = async () => {
    if (!activeSession?.report_ready) return;
    try {
      const response = await fetch(api.getAgentAnalysisReportUrl(activeSession.id), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agent-analysis-${activeSession.id}.md`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError: any) {
      setError(requestError?.message || lt("报告下载失败", "Failed to download report"));
    }
  };

  if (loading) {
    return <div className="agent-analysis-loading"><RefreshCw className="spin" /> {lt("正在加载 AI 分析师...", "Loading AI Analysts...")}</div>;
  }

  return (
    <div className="agent-analysis-page">
      <header className="agent-analysis-page-header">
        <div>
            <div className="agent-analysis-title-row">
            <UsersRound size={24} />
            <h1>{lt("AI 分析师", "AI Analysts")}</h1>
          </div>
          <p>{lt(COMMUNITY_EDITION ? "使用你配置的单一 AI 分析师研究股票、事件与组合问题" : "与多位金融分析师持续讨论股票、事件、情绪与组合风险", COMMUNITY_EDITION ? "Research equities, events and portfolio questions with your configured AI analyst" : "Discuss equities, events, sentiment and portfolio risk with multiple AI analysts")}</p>
        </div>
        <div className="agent-analysis-header-actions">
          <div className="agent-analysis-plan-chip">
            <Coins size={15} />
            <span>{capabilities.credit_summary?.unlimited ? lt("无限额度", "Unlimited") : `${capabilities.credit_summary?.credits_remaining ?? "--"} ${lt("额度", "credits")}`}</span>
            <small>{capabilities.role.toUpperCase()}</small>
          </div>
          {capabilities.can_configure_mcp_allowlist && (
            <button className="figma-btn" type="button" onClick={() => setShowMcpSettings(true)}>
              <Settings2 size={16} /> {lt("MCP 白名单", "MCP Allowlist")}
            </button>
          )}
          {capabilities.can_create_agents && (
            <button className="figma-btn" type="button" onClick={() => openAgentEditor()}>
              <Bot size={16} /> {lt("新建分析师", "New Analyst")}
            </button>
          )}
          <button className="figma-btn figma-btn-primary" type="button" onClick={openNewSession}>
            <Plus size={16} /> {lt("发起讨论", "New Discussion")}
          </button>
        </div>
      </header>

      {error && <div className="agent-analysis-error"><ShieldAlert size={16} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}

      <div className="agent-analysis-workspace">
        <aside className="agent-analysis-left">
          <div className="agent-analysis-panel-title">
            <span>{lt("讨论记录", "Discussions")}</span>
            <button type="button" title={lt("刷新", "Refresh")} onClick={loadWorkspace}><RefreshCw size={15} /></button>
          </div>
          <div className="agent-analysis-session-list no-scrollbar">
            {pagedSessions.map((session) => (
              <button
                type="button"
                key={session.id}
                className={`agent-analysis-session-item ${activeSession?.id === session.id ? "active" : ""}`}
                onClick={() => loadSession(session.id)}
              >
                <span className={`agent-status-dot status-${session.status}`} />
                <span className="agent-analysis-session-copy">
                  <strong>{session.title}</strong>
                  <small>{MARKET_DEFINITIONS[normalizeMarket(session.market)].shortLabel} · {session.symbol || session.subject.slice(0, 32)}</small>
                </span>
                <span className="agent-analysis-session-meta">{statusLabel(session.status, lt)}</span>
              </button>
            ))}
            {marketSessions.length === 0 && (
              <div className="agent-analysis-empty-small">
                <MessageSquareMore size={26} />
                <span>{lt("暂无讨论", "No discussions yet")}</span>
              </div>
            )}
          </div>
          <CompactPager page={sessionPage} pageCount={sessionPageCount} onChange={setSessionPage} />
          <div className="agent-analysis-library-head">
            <span>{lt("分析师库", "Analyst Library")}</span>
            <small>{agents.filter((agent) => agent.enabled).length}</small>
          </div>
          <div className="agent-analysis-agent-list no-scrollbar">
            {pagedAgents.map((agent) => (
              <div className={`agent-analysis-agent-row ${agent.enabled ? "" : "disabled"}`} key={agent.id}>
                <AgentAvatar agent={agent} size={34} />
                <div>
                  <strong>{agent.name}</strong>
                  <small>{agent.description}</small>
                </div>
                <div className="agent-analysis-agent-actions">
                  {agent.can_edit && (
                    <button type="button" title={lt("编辑", "Edit")} onClick={() => openAgentEditor(agent)}><Edit3 size={14} /></button>
                  )}
                  {agent.can_edit && !agent.is_builtin && (
                    <button type="button" title={lt("删除", "Delete")} onClick={() => deleteAgent(agent)}><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <CompactPager page={agentPage} pageCount={agentPageCount} onChange={setAgentPage} />
        </aside>

        <main className="agent-analysis-main">
          {activeSession ? (
            <>
              <div className="agent-analysis-conversation-header">
                <div>
                  <div className="agent-analysis-conversation-title">
                    <h2>{activeSession.title}</h2>
                    <span className={`agent-analysis-status status-${activeSession.status}`}>{statusLabel(activeSession.status, lt)}</span>
                  </div>
                  <p>{activeSession.subject}</p>
                </div>
                <div className="agent-analysis-conversation-actions">
                  <button type="button" title={lt("刷新", "Refresh")} onClick={() => loadSession(activeSession.id)} disabled={refreshing}>
                    <RefreshCw size={16} className={refreshing ? "spin" : ""} />
                  </button>
                  <button type="button" title={lt("导出研究报告", "Export report")} onClick={downloadReport} disabled={!activeSession.report_ready}>
                    <Download size={16} />
                  </button>
                  <button type="button" title={lt("删除会话", "Delete session")} onClick={() => deleteSession(activeSession)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {["pending", "running"].includes(activeSession.status) && (
                <div className="agent-analysis-progress">
                  <div>
                    <Activity size={15} />
                    <span>{activeSession.progress?.stage || lt("分析中...", "Analyzing...")}</span>
                    <strong>{Math.max(0, Math.min(100, Number(activeSession.progress?.percent) || 0))}%</strong>
                  </div>
                  <span><i style={{ width: `${Math.max(2, Math.min(100, Number(activeSession.progress?.percent) || 2))}%` }} /></span>
                </div>
              )}

              <div ref={messageListRef} className="agent-analysis-message-list no-scrollbar">
                {(activeSession.messages || []).map((message) => {
                  const agent = message.agent_id ? agentMap.get(message.agent_id) : undefined;
                  const stance = String(message.meta?.stance || "");
                  return (
                    <article className={`agent-analysis-message message-${message.sender_type}`} key={message.id}>
                      <div className="agent-analysis-message-avatar">
                        {message.sender_type === "user" ? (
                          <span className="agent-analysis-user-avatar">{message.sender_name.slice(0, 1).toUpperCase()}</span>
                        ) : message.sender_type === "moderator" ? (
                          <span className="agent-analysis-moderator-avatar"><UsersRound size={19} /></span>
                        ) : message.sender_type === "system" ? (
                          <span className="agent-analysis-system-avatar"><Database size={18} /></span>
                        ) : (
                          <AgentAvatar agent={agent} size={38} />
                        )}
                      </div>
                      <div className="agent-analysis-message-body">
                        <div className="agent-analysis-message-head">
                          <div>
                            <strong>{message.sender_name}</strong>
                            {message.round_no > 0 && <span>{lt(`第 ${message.round_no} 轮`, `Round ${message.round_no}`)}</span>}
                          </div>
                          <div className="agent-analysis-message-badges">
                            {message.sender_type === "user" && message.meta?.target_name && (
                              <span>{lt("提问给", "To")} {message.meta.target_name}</span>
                            )}
                            {stance && <span className={`stance-${stance}`}>{stanceLabel(stance, lt)}</span>}
                            {message.meta?.confidence !== undefined && <span>{message.meta.confidence}/100</span>}
                            {message.meta?.fallback_reason && <span className="agent-fallback-badge">{lt("本地证据", "Local evidence")}</span>}
                          </div>
                        </div>
                        <RichContent blocks={message.blocks} markdown={message.content_markdown} />
                        {(message.meta?.tools?.length || message.meta?.mcp?.length) && (
                          <div className="agent-analysis-message-tools">
                            {(message.meta?.tools || []).map((tool: string) => <span key={tool}><Wrench size={12} />{tool}</span>)}
                            {(message.meta?.mcp || []).map((item: any, index: number) => (
                              <span key={`${item.name}-${index}`} className={`mcp-${item.status}`}><Activity size={12} />MCP · {item.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
                {activeSession.error && <div className="agent-analysis-inline-error">{activeSession.error}</div>}
                <div ref={messageEndRef} />
              </div>

              <div className="agent-analysis-composer">
                <div className="agent-analysis-composer-meta">
                  <label>
                    <span>{lt("回复范围", "Responders")}</span>
                    <select value={composerTarget} onChange={(event) => setComposerTarget(event.target.value)}>
                      <option value="all">{lt(`全体分析师（${committee.length}）`, `All analysts (${committee.length})`)}</option>
                      {committee.map((agent) => <option value={String(agent.id)} key={agent.id}>{agent.name}</option>)}
                    </select>
                  </label>
                  <span className={`agent-analysis-composer-cost ${followUpBillingQuoteError ? "error" : ""}`}>
                    <Coins size={13} />
                    {followUpBillingQuoteError
                      ? followUpBillingQuoteError
                      : lt(`预计预扣 ${followUpCreditCost} 额度`, `Estimated prepaid: ${followUpCreditCost} credits`)}
                  </span>
                  <small>{["pending", "running"].includes(activeSession.status) ? lt("消息会排入下一轮讨论", "Queued for the next round") : lt("发送后立即启动新一轮", "Starts a follow-up round")}</small>
                </div>
                <div className="agent-analysis-composer-input">
                  <textarea
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={lt("补充证据、提出质疑，或指定某位分析师继续回答...", "Add evidence, challenge an assumption, or ask a specific analyst...")}
                  />
                  <button type="button" onClick={sendMessage} disabled={!composer.trim() || sending || committee.length === 0} title={lt("发送并继续讨论", "Send and continue")}>
                    {sending ? <RefreshCw size={18} className="spin" /> : <Send size={18} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="agent-analysis-empty-main">
              <UsersRound size={48} />
              <h2>{lt("创建你的投资委员会", "Build your investment committee")}</h2>
              <p>{lt("选择不同风格的分析师，围绕股票、事件或市场情绪形成可追溯结论。", "Select complementary analysts to discuss a stock, event or market sentiment.")}</p>
              <button className="figma-btn figma-btn-primary" type="button" onClick={openNewSession}><Plus size={16} />{lt("发起讨论", "New Discussion")}</button>
            </div>
          )}
        </main>

        <aside className="agent-analysis-right">
          <div className="agent-analysis-panel-title"><span>{lt("委员会摘要", "Committee Summary")}</span><small>{committee.length}</small></div>
          {activeSession?.result?.decision ? (
            <div className="agent-analysis-decision-box">
              <span>{lt("最终结论", "Final View")}</span>
              <strong>{activeSession.result.decision}</strong>
              <div className="agent-analysis-decision-metrics">
                <div><span>{lt("方向", "Stance")}</span><b>{stanceLabel(activeSession.result.stance || "neutral", lt)}</b></div>
                <div><span>{lt("置信度", "Confidence")}</span><b>{activeSession.result.confidence || 0}<small>/100</small></b></div>
                <div><span>{lt("风险", "Risk")}</span><b>{activeSession.result.risk_level || "--"}</b></div>
              </div>
              {Array.isArray(activeSession.result.key_points) && activeSession.result.key_points.length > 0 && (
                <div className="agent-analysis-decision-points">
                  <b>{lt("关键依据", "Key Evidence")}</b>
                  <ul>{activeSession.result.key_points.slice(0, 3).map((item: string, index: number) => <li key={index}>{item}</li>)}</ul>
                </div>
              )}
              {Array.isArray(activeSession.result.watch_items) && activeSession.result.watch_items.length > 0 && (
                <div className="agent-analysis-decision-watch">
                  <b>{lt("重点观察", "Watch Next")}</b>
                  <p>{activeSession.result.watch_items[0]}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="agent-analysis-decision-empty">
              <ShieldAlert size={24} />
              <strong>{lt("等待委员会形成结论", "Waiting for committee conclusion")}</strong>
              <span>{lt("讨论完成后，这里只保留最终方向、置信度、风险和关键依据。", "The final stance, confidence, risk and key evidence will appear here.")}</span>
            </div>
          )}

          <div className="agent-analysis-context-summary">
            <div><span>{lt("市场", "Market")}</span><strong>{activeSession ? lt(MARKET_DEFINITIONS[normalizeMarket(activeSession.market)].labelZh, MARKET_DEFINITIONS[normalizeMarket(activeSession.market)].labelEn) : lt(definition.labelZh, definition.labelEn)}</strong></div>
            <div><span>{lt("标的", "Symbol")}</span><strong>{activeSession?.symbol || "--"}</strong></div>
            <div><span>{lt("轮次", "Rounds")}</span><strong>{activeSession ? `${activeSession.current_round}/${activeSession.max_rounds}` : "--"}</strong></div>
            <div><span>{lt("消息", "Messages")}</span><strong>{activeSession?.memory?.message_count ?? activeSession?.messages?.length ?? 0}</strong></div>
          </div>

          <div className="agent-analysis-panel-title agent-analysis-committee-heading"><span>{lt("参与分析师", "Analysts")}</span></div>
          <div className="agent-analysis-committee-list">
            {committee.map((agent) => (
              <div key={agent.id}>
                <AgentAvatar agent={agent} size={36} />
                <div><strong>{agent.name}</strong><small>{CATEGORY_OPTIONS.find((item) => item.value === agent.category)?.[lang === "zh" ? "label" : "labelEn"] || agent.category}</small></div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {showSessionModal && (
        <div className="agent-analysis-modal-mask" onMouseDown={(event) => event.target === event.currentTarget && setShowSessionModal(false)}>
          <div className="agent-analysis-modal agent-analysis-session-modal">
            <div className="agent-analysis-modal-header">
              <div><h2>{lt(COMMUNITY_EDITION ? "发起单分析师研究" : "发起 AI 分析讨论", COMMUNITY_EDITION ? "Start single-analyst research" : "Start AI Analyst Discussion")}</h2><p>{lt(`当前版本最多 ${capabilities.max_agents} 位分析师、首次 ${capabilities.max_initial_rounds} 轮`, `This edition supports ${capabilities.max_agents} analyst and ${capabilities.max_initial_rounds} initial round`)}</p></div>
              <button type="button" onClick={() => setShowSessionModal(false)}><X size={18} /></button>
            </div>
            <div className="agent-analysis-modal-body">
              <div className="agent-analysis-segmented">
                {SUBJECT_TYPES.map((item) => (
                  <button type="button" key={item.value} className={sessionDraft.subject_type === item.value ? "active" : ""} onClick={() => setSessionDraft((current) => ({ ...current, subject_type: item.value }))}>{lt(item.label, item.labelEn)}</button>
                ))}
              </div>
              <div className="agent-analysis-form-grid">
                <label><span>{lt("会话标题", "Title")}</span><input value={sessionDraft.title} onChange={(event) => setSessionDraft((current) => ({ ...current, title: event.target.value }))} placeholder={lt("可选，默认使用主题", "Optional; defaults to topic")} /></label>
                <label><span>{lt("股票代码/名称", "Symbol / Name")}</span><input value={sessionDraft.symbol} onChange={(event) => setSessionDraft((current) => ({ ...current, symbol: event.target.value }))} placeholder={lt(`输入${definition.labelZh}代码或名称`, `Enter a ${definition.labelEn} symbol or name`)} /></label>
              </div>
              <label className="agent-analysis-field"><span>{lt("讨论主题", "Discussion Topic")}</span><textarea value={sessionDraft.subject} onChange={(event) => setSessionDraft((current) => ({ ...current, subject: event.target.value }))} placeholder={lt("例如：结合最新财报和白酒行业需求，评估贵州茅台当前估值与未来一年的主要风险", "Describe the research question and decision context")} /></label>
              <div className="agent-analysis-form-grid">
                <label><span>{lt("讨论轮次", "Rounds")}</span><select value={sessionDraft.max_rounds} onChange={(event) => setSessionDraft((current) => ({ ...current, max_rounds: Number(event.target.value) }))}>{Array.from({ length: capabilities.max_initial_rounds }, (_, index) => index + 1).map((round) => <option value={round} key={round}>{round}</option>)}</select></label>
                {capabilities.can_enter_custom_model ? (
                  <AiModelInput label={lt("本次模型", "Model")} selectedModel={sessionDraft.model} modelOptions={availableModels} onChange={(model) => setSessionDraft((current) => ({ ...current, model }))} compact />
                ) : (
                  <label><span>{lt("本次模型", "Model")}</span><select value={sessionDraft.model} onChange={(event) => setSessionDraft((current) => ({ ...current, model: event.target.value }))}>{availableModels.map((model) => <option value={model} key={model}>{aiModelOptionLabel(model, lang)}</option>)}</select></label>
                )}
              </div>
              <div className={`agent-analysis-cost-preview ${sessionBillingQuoteError ? "error" : ""}`}>
                <Coins size={17} />
                <div>
                  <strong>
                    {capabilities.credit_summary?.unlimited
                      ? lt("管理员本次不扣额度", "No usage charge for administrators")
                      : sessionBillingQuoteError
                        ? sessionBillingQuoteError
                        : lt(`预计预扣 ${sessionCreditCost} AI 使用额度`, `Estimated prepaid usage: ${sessionCreditCost} AI credits`)}
                  </strong>
                  <small>
                    {lt(
                      `模型×${sessionBillingEstimate?.multipliers?.model ?? "--"}，上下文×${sessionBillingEstimate?.multipliers?.context ?? "--"}，数据×${sessionBillingEstimate?.multipliers?.data_retrieval ?? "--"}，深度×${sessionBillingEstimate?.multipliers?.deep_research ?? "--"}`,
                      `Model x${sessionBillingEstimate?.multipliers?.model ?? "--"}, context x${sessionBillingEstimate?.multipliers?.context ?? "--"}, data x${sessionBillingEstimate?.multipliers?.data_retrieval ?? "--"}, depth x${sessionBillingEstimate?.multipliers?.deep_research ?? "--"}`,
                    )}
                  </small>
                </div>
              </div>
              <div className="agent-analysis-agent-picker-head"><span>{lt(COMMUNITY_EDITION ? "选择一位分析师" : "选择分析师", COMMUNITY_EDITION ? "Select one analyst" : "Select Analysts")}</span><small>{sessionDraft.agent_ids.length}/{capabilities.max_agents}</small></div>
              <div className="agent-analysis-agent-picker">
                {agents.filter((agent) => agent.enabled).map((agent) => {
                  const checked = sessionDraft.agent_ids.includes(agent.id);
                  return (
                    <button type="button" key={agent.id} className={checked ? "selected" : ""} onClick={() => setSessionDraft((current) => ({ ...current, agent_ids: checked ? current.agent_ids.filter((id) => id !== agent.id) : current.agent_ids.length < capabilities.max_agents ? [...current.agent_ids, agent.id] : current.agent_ids }))}>
                      <AgentAvatar agent={agent} size={36} /><span><strong>{agent.name}</strong><small>{agent.description}</small></span><i>{checked ? "✓" : "+"}</i>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="agent-analysis-modal-footer"><button className="figma-btn" type="button" onClick={() => setShowSessionModal(false)}>{lt("取消", "Cancel")}</button><button className="figma-btn figma-btn-primary" type="button" onClick={createSession} disabled={creatingSession}>{creatingSession ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}{lt("开始讨论", "Start")}</button></div>
          </div>
        </div>
      )}

      {showAgentModal && (
        <div className="agent-analysis-modal-mask" onMouseDown={(event) => event.target === event.currentTarget && setShowAgentModal(false)}>
          <div className="agent-analysis-modal agent-analysis-agent-modal">
            <div className="agent-analysis-modal-header">
              <div><h2>{agentDraft.id ? lt("编辑分析师", "Edit Analyst") : lt("新建分析师", "New Analyst")}</h2><p>{lt("配置角色、系统提示词、Skills 和 MCP 工具", "Configure persona, system prompt, skills and MCP tools")}</p></div>
              <button type="button" onClick={() => setShowAgentModal(false)}><X size={18} /></button>
            </div>
            <div className="agent-analysis-modal-body no-scrollbar">
              <div className="agent-analysis-form-grid agent-analysis-form-grid-3">
                <label><span>{lt("名称", "Name")}</span><input value={agentDraft.name} onChange={(event) => setAgentDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <label><span>{lt("类型", "Category")}</span><select value={agentDraft.category} onChange={(event) => setAgentDraft((current) => ({ ...current, category: event.target.value }))}>{CATEGORY_OPTIONS.map((item) => <option value={item.value} key={item.value}>{lt(item.label, item.labelEn)}</option>)}</select></label>
                <label><span>{lt("标识色", "Color")}</span><input type="color" value={agentDraft.color} onChange={(event) => setAgentDraft((current) => ({ ...current, color: event.target.value }))} /></label>
              </div>
              <div className="agent-analysis-icon-editor">
                <div className="agent-analysis-icon-preview">
                  <AgentAvatar agent={agentDraftPreview} size={68} />
                  <div>
                    <strong>{agentDraft.name || lt("分析师头像", "Analyst Avatar")}</strong>
                    <span>{isAgentImageIcon(agentDraft.icon) ? lt("自定义图片", "Custom image") : lt("默认图标", "Default icon")}</span>
                  </div>
                </div>
                <div className="agent-analysis-icon-controls">
                  <div className="agent-analysis-icon-options" aria-label={lt("默认图标", "Default icons")}>
                    {AGENT_ICON_OPTIONS.map(({ key, label, labelEn, Icon }) => {
                      const active = agentDraft.icon === key;
                      return (
                        <button
                          type="button"
                          key={key}
                          className={active ? "active" : ""}
                          onClick={() => setAgentDraft((current) => ({ ...current, icon: key }))}
                          title={lt(label, labelEn)}
                        >
                          <Icon size={17} />
                          <span>{lt(label, labelEn)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="agent-analysis-icon-custom">
                    <label>
                      <span><Link2 size={13} />{lt("图片链接", "Image URL")}</span>
                      <input
                        value={isAgentImageIcon(agentDraft.icon) && !agentDraft.icon.startsWith("data:") ? agentDraft.icon : ""}
                        onChange={(event) => setAgentDraft((current) => ({ ...current, icon: event.target.value.trim() || "bot" }))}
                        placeholder="https://cdn.example.com/avatar.png"
                      />
                    </label>
                    <label className="agent-analysis-upload-button">
                      <Upload size={14} />
                      <span>{lt("上传图片", "Upload image")}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(event) => {
                          handleAgentIconUpload(event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {isAgentImageIcon(agentDraft.icon) && (
                      <button type="button" onClick={() => setAgentDraft((current) => ({ ...current, icon: "bot" }))}>
                        <ImageIcon size={14} />
                        {lt("恢复默认", "Use default")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <label className="agent-analysis-field"><span>{lt("简介", "Description")}</span><input value={agentDraft.description} onChange={(event) => setAgentDraft((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="agent-analysis-field"><span>{lt("系统提示词", "System Prompt")}</span><textarea className="agent-analysis-system-prompt" value={agentDraft.system_prompt} onChange={(event) => setAgentDraft((current) => ({ ...current, system_prompt: event.target.value }))} placeholder={lt("定义分析框架、证据标准、输出方式和风险边界", "Define the framework, evidence standard, output and risk boundaries")} /></label>
              {capabilities.can_enter_custom_model ? (
                <AiModelInput label={lt("专用模型（留空使用模块默认）", "Dedicated Model (blank uses module default)")} selectedModel={agentDraft.model} modelOptions={availableModels} onChange={(model) => setAgentDraft((current) => ({ ...current, model }))} compact />
              ) : (
                <label className="agent-analysis-field"><span>{lt("专用模型", "Dedicated Model")}</span><select value={agentDraft.model} onChange={(event) => setAgentDraft((current) => ({ ...current, model: event.target.value }))}><option value="">{lt("使用 AI 分析师默认模型", "Use AI Analysts default")}</option>{availableModels.map((model) => <option value={model} key={model}>{aiModelOptionLabel(model, lang)}</option>)}</select></label>
              )}
              <div className="agent-analysis-config-section">
                <h3>{lt("内置工具", "Built-in Tools")}</h3>
                <div className="agent-analysis-toggle-grid">
                  {TOOL_OPTIONS.map(({ key, label, labelEn, Icon }) => {
                    const checked = agentDraft.tools.includes(key);
                    return <button type="button" key={key} className={checked ? "active" : ""} onClick={() => setAgentDraft((current) => ({ ...current, tools: checked ? current.tools.filter((item) => item !== key) : [...current.tools, key] }))}><Icon size={16} /><span>{lt(label, labelEn)}</span><i>{checked ? "✓" : "+"}</i></button>;
                  })}
                </div>
              </div>
              <div className="agent-analysis-config-section">
                <h3>Skills</h3>
                <div className="agent-analysis-toggle-grid">
                  {skills.map((skill) => {
                    const checked = agentDraft.skills.includes(skill.key);
                    return <button type="button" key={skill.key} className={checked ? "active" : ""} onClick={() => setAgentDraft((current) => ({ ...current, skills: checked ? current.skills.filter((item) => item !== skill.key) : [...current.skills, skill.key] }))}><Wrench size={16} /><span>{lang === "zh" ? skill.name : skill.name_en || skill.name}</span><i>{checked ? "✓" : "+"}</i></button>;
                  })}
                  {skills.length === 0 && <p className="agent-analysis-config-empty">{lt("管理员尚未配置可用 Skill", "No skills configured by administrator")}</p>}
                </div>
              </div>
              {capabilities.mcp_mode === "unrestricted" && (
                <div className="agent-analysis-config-section">
                  <div className="agent-analysis-config-head"><div><h3>MCP</h3><p>{lt("管理员可配置通过 SSRF 校验的公网 HTTP MCP 地址", "Administrators can configure public HTTP MCP endpoints that pass SSRF checks")}</p></div><button type="button" onClick={() => setAgentDraft((current) => ({ ...current, mcp_servers: [...current.mcp_servers, { name: "MCP", endpoint: "", tool: "", enabled: true }] }))}><Plus size={15} />{lt("添加", "Add")}</button></div>
                  <div className="agent-analysis-mcp-list">
                    {agentDraft.mcp_servers.map((server, index) => (
                      <div key={index}>
                        <input value={server.name} onChange={(event) => setAgentDraft((current) => ({ ...current, mcp_servers: current.mcp_servers.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder={lt("服务名", "Server name")} />
                        <input value={server.endpoint} onChange={(event) => setAgentDraft((current) => ({ ...current, mcp_servers: current.mcp_servers.map((item, itemIndex) => itemIndex === index ? { ...item, endpoint: event.target.value } : item) }))} placeholder="https://mcp.example.com/mcp" />
                        <input value={server.tool} onChange={(event) => setAgentDraft((current) => ({ ...current, mcp_servers: current.mcp_servers.map((item, itemIndex) => itemIndex === index ? { ...item, tool: event.target.value } : item) }))} placeholder={lt("工具名", "Tool name")} />
                        <button type="button" onClick={() => setAgentDraft((current) => ({ ...current, mcp_servers: current.mcp_servers.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {capabilities.mcp_mode === "allowlist" && (
                <div className="agent-analysis-config-section">
                  <div className="agent-analysis-config-head"><div><h3>MCP</h3><p>{lt("只能选择系统管理员审核通过的 MCP 工具", "Only administrator-approved MCP tools are available")}</p></div></div>
                  <div className="agent-analysis-toggle-grid">
                    {capabilities.approved_mcp_servers.map((server) => {
                      const checked = agentDraft.mcp_servers.some((item) => item.endpoint === server.endpoint && item.tool === server.tool);
                      return <button type="button" key={`${server.endpoint}-${server.tool}`} className={checked ? "active" : ""} onClick={() => setAgentDraft((current) => ({ ...current, mcp_servers: checked ? current.mcp_servers.filter((item) => item.endpoint !== server.endpoint || item.tool !== server.tool) : [...current.mcp_servers, { ...server }] }))}><Activity size={16} /><span>{server.name} · {server.tool}</span><i>{checked ? "✓" : "+"}</i></button>;
                    })}
                    {capabilities.approved_mcp_servers.length === 0 && <p className="agent-analysis-config-empty">{lt("管理员尚未开放 MCP 工具", "No MCP tools have been approved")}</p>}
                  </div>
                </div>
              )}
              <div className="agent-analysis-form-grid">
                {isAdmin && <label><span>{lt("可见范围", "Visibility")}</span><select value={agentDraft.visibility} onChange={(event) => setAgentDraft((current) => ({ ...current, visibility: event.target.value as "private" | "public" }))}><option value="private">{lt("仅自己", "Private")}</option><option value="public">{lt("全站公开", "Public")}</option></select></label>}
                <label className="agent-analysis-check"><input type="checkbox" checked={agentDraft.enabled} onChange={(event) => setAgentDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span>{lt("启用该分析师", "Enable analyst")}</span></label>
              </div>
            </div>
            <div className="agent-analysis-modal-footer"><button className="figma-btn" type="button" onClick={() => setShowAgentModal(false)}>{lt("取消", "Cancel")}</button><button className="figma-btn figma-btn-primary" type="button" onClick={saveAgent} disabled={savingAgent}>{savingAgent ? <RefreshCw size={16} className="spin" /> : <Bot size={16} />}{lt("保存分析师", "Save Analyst")}</button></div>
          </div>
        </div>
      )}

      {showMcpSettings && (
        <div className="agent-analysis-modal-mask" onMouseDown={(event) => event.target === event.currentTarget && setShowMcpSettings(false)}>
          <div className="agent-analysis-modal agent-analysis-mcp-settings-modal">
            <div className="agent-analysis-modal-header">
              <div><h2>{lt("MCP 工具白名单", "MCP Tool Allowlist")}</h2><p>{lt("SVIP 用户创建私有分析师时，只能选择这里审核通过的服务和工具", "SVIP users can only select approved services and tools when creating private analysts")}</p></div>
              <button type="button" onClick={() => setShowMcpSettings(false)}><X size={18} /></button>
            </div>
            <div className="agent-analysis-modal-body no-scrollbar">
              <div className="agent-analysis-config-head">
                <div><h3>{lt("已批准的公网 HTTP MCP", "Approved public HTTP MCP")}</h3><p>{lt("保存时会校验服务地址和工具名；实际调用仍会执行 SSRF 防护", "Endpoints and tool names are validated on save; calls remain protected by SSRF checks")}</p></div>
                <button type="button" onClick={() => setMcpSettingsDraft((current) => [...current, { name: "MCP", endpoint: "", tool: "", enabled: true }])}><Plus size={15} />{lt("添加工具", "Add tool")}</button>
              </div>
              <div className="agent-analysis-mcp-list agent-analysis-mcp-settings-list">
                {mcpSettingsDraft.map((server, index) => (
                  <div key={index}>
                    <input value={server.name} onChange={(event) => setMcpSettingsDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder={lt("服务名", "Server name")} />
                    <input value={server.endpoint} onChange={(event) => setMcpSettingsDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, endpoint: event.target.value } : item))} placeholder="https://mcp.example.com/mcp" />
                    <input value={server.tool} onChange={(event) => setMcpSettingsDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, tool: event.target.value } : item))} placeholder={lt("工具名", "Tool name")} />
                    <button type="button" onClick={() => setMcpSettingsDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>
                  </div>
                ))}
                {mcpSettingsDraft.length === 0 && <div className="agent-analysis-mcp-empty">{lt("尚未配置 MCP 白名单", "No MCP tools configured")}</div>}
              </div>
            </div>
            <div className="agent-analysis-modal-footer"><button className="figma-btn" type="button" onClick={() => setShowMcpSettings(false)}>{lt("取消", "Cancel")}</button><button className="figma-btn figma-btn-primary" type="button" onClick={saveMcpSettings} disabled={savingMcpSettings}>{savingMcpSettings ? <RefreshCw size={16} className="spin" /> : <Settings2 size={16} />}{lt("保存白名单", "Save allowlist")}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
