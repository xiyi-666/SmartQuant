import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  BarChart3,
  CheckCircle2,
  Coins,
  Download,
  FileText,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { api } from "../api";
import KLineChart, { type KLinePoint } from "../components/KLineChart";
import LongTaskRewardAdModal from "../components/LongTaskRewardAdModal";
import { AiModelInput, useAiModelSelection } from "../shared/aiModels";
import { getToken } from "../shared/auth";
import { useLanguage, useLangText } from "../shared/language";
import { MARKET_DEFINITIONS, normalizeMarket, useMarket } from "../shared/market";
import { readUserPageCache, userScopedStorageKey, writeUserPageCache } from "../shared/pageCache";
import { useTheme } from "../shared/theme";

type SmartResearchResult = {
  task_id?: number;
  market?: string;
  status: string;
  symbols?: any[];
  progress?: {
    total?: number;
    completed?: number;
    current?: string;
    stage?: string;
    percent?: number;
    elapsed_seconds?: number;
    estimated_remaining_seconds?: number | null;
    items?: Array<{
      code: string;
      name?: string;
      status?: string;
      engine?: string;
      stage?: string;
      progress?: number;
      elapsed_seconds?: number;
      estimated_seconds?: number;
    }>;
  };
  results?: SmartResearchItem[];
  markdown_report?: string;
  error?: string;
  created_at?: string;
  updated_at?: string;
};

type SmartResearchTaskSummary = {
  task_id: number;
  status: string;
  symbols?: Array<{ code?: string; name?: string }>;
  created_at?: string;
  updated_at?: string;
};

type SmartResearchItem = {
  symbol: {
    code: string;
    name: string;
    market?: string;
    industry?: string;
    board?: string;
    market_cap?: number;
    pe_ratio?: number;
  };
  engine: string;
  engine_label: string;
  markdown: string;
  charts?: {
    kline?: KLinePoint[];
    radar?: Array<{ name: string; score: number }>;
    risk_breakdown?: Array<{ name: string; value: number }>;
  };
  decision?: {
    action?: string;
    overall_score?: number;
    position_ratio?: number;
    risk_level?: string;
    raw?: string;
  };
  error?: string;
};

type SmartResearchReportFormat = "md" | "pdf" | "docx";

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
  symbol_count?: number;
  analyst_count?: number;
  research_depth?: "standard" | "deep" | "intensive" | "custom";
  estimated_seconds_per_symbol?: number;
};

const ACTIVE_TASK_KEY = "quartsys_smart_research_active_task";
const ACTIVE_SYMBOLS_KEY = "quartsys_smart_research_active_symbols";
const ACTIVE_MARKET_KEY = "quartsys_smart_research_active_market";
const MAX_RESEARCH_SYMBOLS = 15;
const SMART_RESEARCH_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

const ANALYST_OPTIONS = [
  { key: "fundamental", title: "基本面分析师", titleEn: "Fundamental Analyst", desc: "财务、估值、业绩", descEn: "Financials, valuation and earnings" },
  { key: "sentiment", title: "情绪分析师", titleEn: "Sentiment Analyst", desc: "新闻、社媒、短期情绪", descEn: "News, social media and short-term sentiment" },
  { key: "news", title: "新闻分析师", titleEn: "News Analyst", desc: "宏观、全球事件、政策", descEn: "Macro, global events and policy" },
  { key: "technical", title: "技术分析师", titleEn: "Technical Analyst", desc: "MACD、RSI、量价趋势", descEn: "MACD, RSI and price-volume trends" },
] as const;

const RESEARCH_DEPTH_OPTIONS = [
  { key: "standard", label: "标准", labelEn: "Standard", desc: "1 轮投资辩论 + 1 轮风险辩论", descEn: "1 investment debate + 1 risk debate", debate: 1, risk: 1 },
  { key: "deep", label: "深度", labelEn: "Deep", desc: "增加投资辩论深度", descEn: "More investment debate depth", debate: 2, risk: 1 },
  { key: "intensive", label: "强化", labelEn: "Intensive", desc: "投资与风险双深度", descEn: "Deeper investment and risk debate", debate: 2, risk: 2 },
] as const;

type ResearchDepthKey = typeof RESEARCH_DEPTH_OPTIONS[number]["key"];

type SmartResearchCacheSnapshot = {
  symbolsText: string;
  analysisDate: string;
  selectedAnalysts: string[];
  researchDepth: ResearchDepthKey;
  result: SmartResearchResult | null;
  selectedCode: string;
  taskHistory: SmartResearchTaskSummary[];
  billingEstimate: BillingEstimate | null;
};

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function parseSymbols(text: string) {
  return text
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function symbolsTextFromItems(items?: any[]) {
  if (!Array.isArray(items)) return "";
  return items
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.code || item?.symbol?.code || "";
    })
    .filter(Boolean)
    .join("\n");
}

function symbolsTextFromResultPayload(data?: SmartResearchResult | null) {
  return (
    symbolsTextFromItems(data?.symbols) ||
    symbolsTextFromItems(data?.progress?.items) ||
    symbolsTextFromItems(data?.results)
  );
}

function smartResearchDownloadName(data?: SmartResearchResult | null) {
  const symbols = Array.isArray(data?.symbols) ? data?.symbols || [] : [];
  const first = symbols[0] as any;
  const rawName =
    symbols.length === 1
      ? String(first?.name || first?.code || data?.task_id || "report")
      : symbols.length > 1
        ? `批量${symbols.length}只`
        : String(data?.task_id || "report");
  const safeName = rawName.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "report";
  const rawTime = String(data?.updated_at || data?.created_at || new Date().toISOString());
  const stamp =
    rawTime
      .replace("T", "_")
      .replace(/\.\d+.*$/, "")
      .replace(/[^\d_:-]/g, "")
      .replace(/[-:]/g, "")
      .slice(0, 15) || new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `smart_research_${safeName}_${stamp}.md`;
}

function smartResearchTaskLabel(task?: SmartResearchTaskSummary | null) {
  const symbols = (task?.symbols || [])
    .slice(0, 4)
    .map((item) => item.name || item.code)
    .filter(Boolean)
    .join(" / ");
  return symbols || `#${task?.task_id || ""}`;
}

function smartResearchTaskDownloadName(task: SmartResearchTaskSummary, format: SmartResearchReportFormat) {
  const rawName = smartResearchTaskLabel(task) || `task_${task.task_id}`;
  const safeName = rawName.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || `task_${task.task_id}`;
  const rawTime = String(task.updated_at || task.created_at || new Date().toISOString());
  const stamp =
    rawTime
      .replace("T", "_")
      .replace(/\.\d+.*$/, "")
      .replace(/[^\d_:-]/g, "")
      .replace(/[-:]/g, "")
      .slice(0, 15) || new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `smart_research_${safeName}_${stamp}.${format}`;
}

function formatPercent(value?: number | null, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function formatMarketCap(
  value: number | null | undefined,
  unit: string,
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n.toFixed(2)} ${unit}`;
}

function clampPercent(value?: number | null) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function formatDuration(seconds?: number | null, lt?: (zh: string, en: string) => string) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total <= 0) return "--";
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const secUnit = lt ? lt("秒", "s") : "秒";
  const minUnit = lt ? lt("分", "m") : "分";
  const hourUnit = lt ? lt("小时", "h") : "小时";
  if (minutes <= 0) return `${rest}${secUnit}`;
  if (minutes < 60) return `${minutes}${minUnit}${rest.toString().padStart(2, "0")}${secUnit}`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}${hourUnit}${remainMinutes}${minUnit}`;
}

function renderMarkdown(markdown: string) {
  const html = marked.parse(markdown || "", { gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling"],
  });
}

function displayEngineLabel(item?: Pick<SmartResearchItem, "engine" | "engine_label">) {
  if (!item) return "--";
  if (item.engine === "tradingagents" || /TradingAgents/i.test(item.engine_label || "")) {
    return "多智能体研究";
  }
  return item.engine_label || item.engine || "--";
}

function ResearchCharts({ item }: { item?: SmartResearchItem }) {
  const lt = useLangText();
  const { theme } = useTheme();
  const radarRef = useRef<HTMLDivElement | null>(null);
  const riskRef = useRef<HTMLDivElement | null>(null);
  const charts = item?.charts || {};
  const kline = (charts.kline || []) as KLinePoint[];

  useEffect(() => {
    if (!radarRef.current) return;
    const chart = echarts.init(radarRef.current);
    const radar = charts.radar || [];
    const dark = theme === "dark";
    const textColor = dark ? "#d4d3cc" : "#44443f";
    const mutedColor = dark ? "#a9afb7" : "#6b6b63";
    const borderColor = dark ? "rgba(255,255,255,.14)" : "rgba(113,110,98,.22)";
    const tooltipBackground = dark ? "rgba(17,19,22,.97)" : "rgba(255,255,255,.97)";
    chart.setOption({
      color: ["#2563eb"],
      tooltip: {
        trigger: "item",
        backgroundColor: tooltipBackground,
        borderColor,
        textStyle: { color: textColor },
      },
      radar: {
        radius: "68%",
        center: ["50%", "53%"],
        indicator: radar.map((row) => ({ name: row.name, max: 100 })),
        axisName: {
          color: textColor,
          fontWeight: 700,
          padding: [4, 6],
        },
        splitArea: {
          areaStyle: {
            color: dark
              ? ["rgba(217,170,78,.025)", "rgba(217,170,78,.065)"]
              : ["rgba(217,170,78,.035)", "rgba(217,170,78,.09)"],
          },
        },
        splitLine: { lineStyle: { color: borderColor } },
        axisLine: { lineStyle: { color: borderColor } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: radar.map((row) => row.score),
              name: lt("分析师评分", "Analyst Score"),
              areaStyle: { color: "rgba(217,170,78,.2)" },
              lineStyle: { width: 2.5, color: "#2563eb" },
              itemStyle: {
                color: "#dc2626",
                borderColor: dark ? "#111316" : "#ffffff",
                borderWidth: 2,
              },
              symbolSize: 8,
            },
          ],
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [charts.radar, theme]);

  useEffect(() => {
    if (!riskRef.current) return;
    const chart = echarts.init(riskRef.current);
    const rows = charts.risk_breakdown || [];
    const dark = theme === "dark";
    const textColor = dark ? "#d4d3cc" : "#44443f";
    const mutedColor = dark ? "#a9afb7" : "#6b6b63";
    const borderColor = dark ? "rgba(255,255,255,.12)" : "rgba(113,110,98,.18)";
    chart.setOption({
      grid: { left: 84, right: 18, top: 20, bottom: 24 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: dark ? "rgba(17,19,22,.97)" : "rgba(255,255,255,.97)",
        borderColor,
        textStyle: { color: textColor },
      },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: mutedColor },
        splitLine: { lineStyle: { color: borderColor, type: "dashed" } },
      },
      yAxis: {
        type: "category",
        data: rows.map((row) => row.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor },
      },
      series: [
        {
          type: "bar",
          data: rows.map((row) => row.value),
          barWidth: 14,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: "rgba(217,170,78,.42)" },
              { offset: 1, color: "#dc2626" },
            ]),
          },
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [charts.risk_breakdown, theme]);

  if (!item) {
    return <div className="smart-research-empty">{lt("等待分析结果生成图表", "Waiting for charts")}</div>;
  }

  return (
    <div className="smart-research-chart-grid">
      <div className="smart-research-chart-card smart-research-kline-card">
        <div className="smart-research-card-head">
          <span>{lt("K线走势", "Candlestick Trend")}</span>
          <small>{item.symbol.code} {item.symbol.name}</small>
        </div>
        <KLineChart
          data={kline}
          className="smart-research-kline-chart"
          height="100%"
          initialVisibleBars={180}
          emptyText={lt("暂无K线数据", "No candlestick data")}
        />
      </div>
      <div className="smart-research-chart-card">
        <div className="smart-research-card-head">
          <span>{lt("分析师评分", "Analyst Score")}</span>
          <small>{displayEngineLabel(item)}</small>
        </div>
        <div ref={radarRef} className="smart-research-echart" />
      </div>
      <div className="smart-research-chart-card">
        <div className="smart-research-card-head">
          <span>{lt("风险分解", "Risk Breakdown")}</span>
          <small>{lt("波动、回撤、流动性", "Volatility, drawdown, liquidity")}</small>
        </div>
        <div ref={riskRef} className="smart-research-echart" />
      </div>
    </div>
  );
}

export default function SmartResearchPage() {
  const lt = useLangText();
  const { lang } = useLanguage();
  const { market, definition } = useMarket();
  const { selectedModel, setSelectedModel, modelOptions } = useAiModelSelection("smart_research");
  const activeTaskStorageKey = useMemo(() => userScopedStorageKey(ACTIVE_TASK_KEY), []);
  const activeSymbolsStorageKey = useMemo(() => userScopedStorageKey(ACTIVE_SYMBOLS_KEY), []);
  const activeMarketStorageKey = useMemo(() => userScopedStorageKey(ACTIVE_MARKET_KEY), []);
  const initialCache = useMemo(
    () => readUserPageCache<SmartResearchCacheSnapshot>("smart-research", market, SMART_RESEARCH_CACHE_MAX_AGE_MS),
    [],
  );
  const [symbolsText, setSymbolsText] = useState(
    () => {
      const activeMarket = normalizeMarket(localStorage.getItem(activeMarketStorageKey));
      return activeMarket === market
        ? localStorage.getItem(activeSymbolsStorageKey) || definition.defaultSymbol
        : initialCache?.value.symbolsText || definition.defaultSymbol;
    },
  );
  const [analysisDate, setAnalysisDate] = useState(initialCache?.value.analysisDate || todayText());
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>(
    initialCache?.value.selectedAnalysts || ANALYST_OPTIONS.map((item) => item.key),
  );
  const [researchDepth, setResearchDepth] = useState<ResearchDepthKey>(initialCache?.value.researchDepth || "standard");
  const [taskId, setTaskId] = useState<number | null>(() => {
    const stored = Number(localStorage.getItem(activeTaskStorageKey) || 0);
    return stored > 0 ? stored : null;
  });
  const [result, setResult] = useState<SmartResearchResult | null>(initialCache?.value.result || null);
  const [billingEstimate, setBillingEstimate] = useState<BillingEstimate | null>(initialCache?.value.billingEstimate || null);
  const [billingQuoteError, setBillingQuoteError] = useState("");
  const [selectedCode, setSelectedCode] = useState(initialCache?.value.selectedCode || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [taskHistory, setTaskHistory] = useState<SmartResearchTaskSummary[]>(initialCache?.value.taskHistory || []);
  const [cacheHydratedMarket, setCacheHydratedMarket] = useState(initialCache?.value ? market : "");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportTaskId, setExportTaskId] = useState<number | null>(null);
  const [exportFormat, setExportFormat] = useState<SmartResearchReportFormat>("pdf");
  const [exporting, setExporting] = useState(false);
  const lastResumeRefreshAtRef = useRef(0);

  const selectedItem = useMemo(() => {
    const rows = result?.results || [];
    if (!rows.length) return undefined;
    return rows.find((item) => item.symbol.code === selectedCode) || rows[0];
  }, [result, selectedCode]);
  const resultMarket = normalizeMarket(
    result?.market || selectedItem?.symbol?.market || market,
  );
  const resultMarketDefinition = MARKET_DEFINITIONS[resultMarket];

  const markdownHtml = useMemo(
    () => renderMarkdown(selectedItem?.markdown || result?.markdown_report || ""),
    [selectedItem?.markdown, result?.markdown_report],
  );

  const isRunning = result?.status === "pending" || result?.status === "running" || loading;
  const inputSymbols = useMemo(() => parseSymbols(symbolsText), [symbolsText]);
  const completedReportTasks = useMemo(() => {
    const merged = new Map<number, SmartResearchTaskSummary>();
    taskHistory
      .filter((task) => task.status === "done")
      .forEach((task) => merged.set(task.task_id, task));
    if (result?.task_id && result.status === "done") {
      merged.set(result.task_id, {
        task_id: result.task_id,
        status: result.status,
        symbols: result.symbols as SmartResearchTaskSummary["symbols"],
        created_at: result.created_at,
        updated_at: result.updated_at,
      });
    }
    return Array.from(merged.values()).sort((a, b) =>
      String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")),
    );
  }, [result?.created_at, result?.status, result?.symbols, result?.task_id, result?.updated_at, taskHistory]);
  const selectedExportTask =
    completedReportTasks.find((task) => task.task_id === exportTaskId) ||
    completedReportTasks[0] ||
    null;
  const selectedDepthOption = RESEARCH_DEPTH_OPTIONS.find((item) => item.key === researchDepth) || RESEARCH_DEPTH_OPTIONS[0];
  const smartResearchPayload = useMemo(
    () => ({
      symbols: inputSymbols,
      market,
      analysis_date: analysisDate,
      analysts: selectedAnalysts,
      use_trading_agents: true,
      max_debate_rounds: selectedDepthOption.debate,
      max_risk_rounds: selectedDepthOption.risk,
      model: selectedModel,
      language: lang === "en" ? "en" as const : "zh" as const,
    }),
    [
      inputSymbols.join("|"),
      market,
      analysisDate,
      selectedAnalysts.join("|"),
      selectedDepthOption.debate,
      selectedDepthOption.risk,
      selectedModel,
      lang,
    ],
  );
  const progressItems = result?.progress?.items || [];
  const currentProgressItem = useMemo(() => {
    const currentCode = result?.progress?.current || "";
    return (
      progressItems.find((item) => item.code === currentCode) ||
      progressItems.find((item) => item.status === "running")
    );
  }, [progressItems, result?.progress?.current]);
  const totalProgressPercent = useMemo(() => {
    const explicit = result?.progress?.percent;
    if (Number.isFinite(Number(explicit))) return clampPercent(explicit);
    const total = result?.progress?.total || parseSymbols(symbolsText).length || 0;
    if (!total) return 0;
    const completed = result?.progress?.completed || 0;
    const runningProgress = clampPercent(currentProgressItem?.progress) / 100;
    return clampPercent(((completed + runningProgress) / total) * 100);
  }, [
    currentProgressItem?.progress,
    result?.progress?.completed,
    result?.progress?.percent,
    result?.progress?.total,
    symbolsText,
  ]);
  const runningStage =
    currentProgressItem?.stage ||
    result?.progress?.stage ||
    (isRunning
      ? lt("后台分析中", "Running in background")
      : result?.status === "done"
        ? lt("完成", "Done")
        : result?.status === "failed"
          ? lt("失败", "Failed")
          : lt("等待", "Pending"));

  const loadTaskHistory = async () => {
    try {
      const payload: any = await api.listSmartResearchTasks(20);
      setTaskHistory(Array.isArray(payload?.items) ? payload.items : []);
      setCacheHydratedMarket(market);
    } catch {
      // History is supplementary; keep the active research task usable.
    }
  };

  const loadResult = async (id: number) => {
    const data = (await api.getSmartResearchResult(id)) as SmartResearchResult;
    setResult(data);
    const taskSymbolsText = symbolsTextFromResultPayload(data);
    if (taskSymbolsText) {
      setSymbolsText(taskSymbolsText);
      if (data.status === "pending" || data.status === "running") {
        localStorage.setItem(activeSymbolsStorageKey, taskSymbolsText);
      }
    }
    const firstCode = data.results?.[0]?.symbol?.code || data.symbols?.[0]?.code || "";
    setSelectedCode((current) => current || firstCode);
    setCacheHydratedMarket(market);
    if (data.status === "done" || data.status === "failed") {
      localStorage.removeItem(activeTaskStorageKey);
      localStorage.removeItem(activeSymbolsStorageKey);
      localStorage.removeItem(activeMarketStorageKey);
      void loadTaskHistory();
    }
    return data;
  };

  const refreshTaskOnce = async (id: number, showDone = true) => {
    setRefreshNotice(lt("刷新中...", "Refreshing..."));
    try {
      const data = await loadResult(id);
      if (showDone) {
        setRefreshNotice(lt("刷新完成", "Refresh complete"));
        window.setTimeout(() => setRefreshNotice(""), 1800);
      }
      return data;
    } catch (err: any) {
      setRefreshNotice("");
      setMessage(err?.message || lt("查询任务失败", "Failed to query task"));
      throw err;
    }
  };

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    refreshTaskOnce(taskId).catch(() => {});
    const timer = window.setInterval(() => {
      if (cancelled) return;
      loadResult(taskId)
        .then((data) => {
          if (data.status === "done" || data.status === "failed") {
            window.clearInterval(timer);
          }
        })
        .catch((err) => setMessage(err?.message || lt("查询任务失败", "Failed to query task")));
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    const refreshOnResume = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastResumeRefreshAtRef.current < 1500) return;
      lastResumeRefreshAtRef.current = now;
      refreshTaskOnce(taskId).catch(() => {});
    };
    document.addEventListener("visibilitychange", refreshOnResume);
    window.addEventListener("focus", refreshOnResume);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnResume);
      window.removeEventListener("focus", refreshOnResume);
    };
  }, [taskId]);

  useEffect(() => {
    if (!result || result.status === "pending" || result.status === "running") return;
    if (taskId) {
      localStorage.removeItem(activeTaskStorageKey);
    }
  }, [activeTaskStorageKey, result?.status, taskId]);

  useEffect(() => {
    if (!showExportDialog || exportTaskId || !completedReportTasks.length) return;
    setExportTaskId(completedReportTasks[0].task_id);
  }, [completedReportTasks, exportTaskId, showExportDialog]);

  useEffect(() => {
    if (!inputSymbols.length) {
      setBillingEstimate(null);
      setBillingQuoteError("");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.quoteSmartResearch(smartResearchPayload)
        .then((payload: any) => {
          if (cancelled) return;
          setBillingEstimate(payload?.billing_estimate || null);
          setBillingQuoteError("");
        })
        .catch((err: any) => {
          if (cancelled) return;
          setBillingEstimate(null);
          setBillingQuoteError(err?.message || lt("额度预估失败", "Failed to estimate usage"));
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    inputSymbols.join("|"),
    smartResearchPayload.market,
    smartResearchPayload.analysis_date,
    smartResearchPayload.analysts.join("|"),
    smartResearchPayload.max_debate_rounds,
    smartResearchPayload.max_risk_rounds,
    smartResearchPayload.model,
    smartResearchPayload.language,
  ]);

  useEffect(() => {
    if (taskId) return;
    setCacheHydratedMarket("");
    const cached = readUserPageCache<SmartResearchCacheSnapshot>(
      "smart-research",
      market,
      SMART_RESEARCH_CACHE_MAX_AGE_MS,
    );
    if (cached?.value) {
      const snapshot = cached.value;
      setSymbolsText(snapshot.symbolsText || definition.defaultSymbol);
      setAnalysisDate(snapshot.analysisDate || todayText());
      setSelectedAnalysts(
        Array.isArray(snapshot.selectedAnalysts) && snapshot.selectedAnalysts.length
          ? snapshot.selectedAnalysts
          : ANALYST_OPTIONS.map((item) => item.key),
      );
      setResearchDepth(snapshot.researchDepth || "standard");
      setResult(snapshot.result || null);
      setSelectedCode(snapshot.selectedCode || "");
      setTaskHistory(Array.isArray(snapshot.taskHistory) ? snapshot.taskHistory : []);
      setBillingEstimate(snapshot.billingEstimate || null);
      setCacheHydratedMarket(market);
    } else {
      setSymbolsText(definition.defaultSymbol);
      setAnalysisDate(todayText());
      setSelectedAnalysts(ANALYST_OPTIONS.map((item) => item.key));
      setResearchDepth("standard");
      setResult(null);
      setSelectedCode("");
      setTaskHistory([]);
      setBillingEstimate(null);
      void loadTaskHistory();
    }
    setMessage("");
  }, [market, definition.defaultSymbol, taskId]);

  useEffect(() => {
    if (cacheHydratedMarket !== market) return;
    writeUserPageCache<SmartResearchCacheSnapshot>("smart-research", market, {
      symbolsText,
      analysisDate,
      selectedAnalysts,
      researchDepth,
      result,
      selectedCode,
      taskHistory,
      billingEstimate,
    });
  }, [
    analysisDate,
    billingEstimate,
    cacheHydratedMarket,
    market,
    researchDepth,
    result,
    selectedAnalysts,
    selectedCode,
    symbolsText,
    taskHistory,
  ]);

  const toggleAnalyst = (key: string) => {
    setSelectedAnalysts((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((item) => item !== key);
        return next.length ? next : prev;
      }
      return [...prev, key];
    });
  };

  const runResearch = async () => {
    const symbols = inputSymbols;
    if (!symbols.length) {
      setMessage(lt("请输入股票代码或名称", "Enter stock codes or names"));
      return;
    }
    if (symbols.length > MAX_RESEARCH_SYMBOLS) {
      setMessage(
        lt(
          `单次最多并行研究 ${MAX_RESEARCH_SYMBOLS} 只标的，请拆分批次。`,
          `A single task supports up to ${MAX_RESEARCH_SYMBOLS} symbols in parallel. Split the batch and retry.`,
        ),
      );
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res: any = await api.runSmartResearch(smartResearchPayload);
      setBillingEstimate(res?.billing_estimate || billingEstimate);
      setTaskId(res.task_id);
      setResult({
        task_id: res.task_id,
        status: "pending",
        market: res.market || market,
        symbols: res.symbols || [],
        progress: {
          total: res.symbols?.length || symbols.length,
          completed: 0,
          current: "",
          stage: lt("后台任务已创建", "Background task created"),
          percent: 0,
          items: (res.symbols || []).map((item: any) => ({
            code: item.code,
            name: item.name,
            status: "pending",
            stage: lt("等待分析", "Pending analysis"),
            progress: 0,
          })),
        },
      });
      setSelectedCode(res.symbols?.[0]?.code || "");
      setCacheHydratedMarket(market);
      localStorage.setItem(activeTaskStorageKey, String(res.task_id));
      localStorage.setItem(
        activeSymbolsStorageKey,
        symbolsTextFromItems(res.symbols) || symbols.join("\n"),
      );
      localStorage.setItem(activeMarketStorageKey, market);
      void loadTaskHistory();
    } catch (err: any) {
      setMessage(err?.message || lt("智能研究任务创建失败", "Failed to create research task"));
    } finally {
      setLoading(false);
    }
  };

  const openExportDialog = () => {
    void loadTaskHistory();
    const preferredTask =
      (result?.task_id && result.status === "done"
        ? completedReportTasks.find((task) => task.task_id === result.task_id)
        : null) ||
      selectedExportTask;
    setExportTaskId(preferredTask?.task_id || null);
    setShowExportDialog(true);
  };

  const exportSelectedReport = async () => {
    const reportTask = selectedExportTask;
    if (!reportTask) {
      setMessage(lt("暂无已完成的研究报告可导出", "No completed research report is available for export"));
      return;
    }
    setExporting(true);
    try {
      const url =
        exportFormat === "md"
          ? api.getSmartResearchReportUrl(reportTask.task_id)
          : api.getSmartResearchReportFormatUrl(reportTask.task_id, exportFormat);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error(lt("服务端报告尚未生成", "The server report is not ready"));
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = smartResearchTaskDownloadName(reportTask, exportFormat);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      setShowExportDialog(false);
      setMessage(lt("报告已开始下载", "Report download has started"));
    } catch (error: any) {
      setMessage(error?.message || lt("导出失败", "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="smart-research-page">
      <div className="figma-page-header smart-research-page-header">
        <div>
          <h1>{lt("智能研究", "Smart Research")}</h1>
          <p>{lt(`${definition.labelZh}多智能体个股研究与批量分析`, `Multi-agent ${definition.labelEn} equity research`)}</p>
        </div>
        <div className="smart-research-header-actions">
          <button className="figma-btn" type="button" onClick={() => taskId && refreshTaskOnce(taskId)}>
            <RefreshCw size={15} />
            {lt("刷新", "Refresh")}
          </button>
          <button className="figma-btn figma-btn-primary" type="button" onClick={openExportDialog}>
            <Download size={15} />
            {lt("导出报告", "Export Report")}
          </button>
        </div>
      </div>

      <div className="smart-research-layout">
        <section className="smart-research-control">
          <div className="smart-research-section-title">
            <FileText size={18} />
            <span>{lt("研究任务", "Research Task")}</span>
          </div>
          <label className="smart-research-field">
            <span>{lt("股票代码/名称", "Symbols")}</span>
            <textarea
              value={symbolsText}
              onChange={(event) => setSymbolsText(event.target.value)}
              placeholder={lt("输入代码或名称，支持换行批量分析", "Enter symbols or names, one per line")}
            />
          </label>
          <div className="smart-research-form-grid">
            <label className="smart-research-field">
              <span>{lt("分析日期", "Analysis Date")}</span>
              <input value={analysisDate} onChange={(event) => setAnalysisDate(event.target.value)} type="date" />
            </label>
            <AiModelInput
              label={lt("智能研究模型", "Research Model")}
              selectedModel={selectedModel}
              modelOptions={modelOptions}
              onChange={setSelectedModel}
            />
          </div>

          <div className="smart-research-analysts">
            {ANALYST_OPTIONS.map((item) => {
              const active = selectedAnalysts.includes(item.key);
              return (
                <button
                  key={item.key}
                  className={`smart-research-analyst ${active ? "active" : ""}`}
                  type="button"
                  onClick={() => toggleAnalyst(item.key)}
                >
                  <CheckCircle2 size={16} />
                  <span>{lt(item.title, item.titleEn)}</span>
                  <small>{lt(item.desc, item.descEn)}</small>
                </button>
              );
            })}
          </div>

          <div className="smart-research-depth-control" role="group" aria-label={lt("研究深度", "Research depth")}>
            {RESEARCH_DEPTH_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={researchDepth === item.key ? "active" : ""}
                onClick={() => setResearchDepth(item.key)}
              >
                <strong>{lt(item.label, item.labelEn)}</strong>
                <small>{lt(item.desc, item.descEn)}</small>
              </button>
            ))}
          </div>

          <div className={`smart-research-cost-preview ${billingQuoteError ? "error" : ""}`}>
            <Coins size={17} />
            <div>
              <strong>
                {billingQuoteError
                  ? billingQuoteError
                  : billingEstimate?.chargeable === false
                    ? lt("管理员本次不扣额度", "No usage charge for administrators")
                    : lt(
                        `预计预扣 ${billingEstimate?.estimated_credits ?? "--"} AI 使用额度`,
                        `Estimated prepaid usage: ${billingEstimate?.estimated_credits ?? "--"} AI credits`,
                      )}
              </strong>
              <small>
                {lt(
                  `模型×${billingEstimate?.multipliers?.model ?? "--"}，上下文×${billingEstimate?.multipliers?.context ?? "--"}，数据×${billingEstimate?.multipliers?.data_retrieval ?? "--"}，深度×${billingEstimate?.multipliers?.deep_research ?? "--"}`,
                  `Model x${billingEstimate?.multipliers?.model ?? "--"}, context x${billingEstimate?.multipliers?.context ?? "--"}, data x${billingEstimate?.multipliers?.data_retrieval ?? "--"}, depth x${billingEstimate?.multipliers?.deep_research ?? "--"}`,
                )}
              </small>
              <small>
                {lt(
                  `${selectedDepthOption.label}：投资辩论 ${selectedDepthOption.debate} 轮，风险辩论 ${selectedDepthOption.risk} 轮；单股预计约 ${formatDuration(billingEstimate?.estimated_seconds_per_symbol, lt)}`,
                  `${selectedDepthOption.labelEn}: ${selectedDepthOption.debate} investment debate round(s), ${selectedDepthOption.risk} risk debate round(s); about ${formatDuration(billingEstimate?.estimated_seconds_per_symbol, lt)} per symbol`,
                )}
              </small>
            </div>
          </div>

          <button className="figma-btn figma-btn-primary smart-research-run" type="button" onClick={runResearch} disabled={isRunning}>
            {isRunning ? <Loader2 size={16} className="smart-research-spin" /> : <Play size={16} />}
            {isRunning
              ? lt("正在分析", "Running")
              : lt(
                  `启动智能研究 · 预扣 ${billingEstimate?.estimated_credits ?? "--"} 额度`,
                  `Start Research · ${billingEstimate?.estimated_credits ?? "--"} credits prepaid`,
                )}
          </button>
          <p className="smart-research-eta-note">
            {lt(
              "研究任务将在后台并行执行，预计时长会随研究深度变化，单次最多并行研究 15 只；完成后页面会自动刷新。",
              "Research runs in parallel in the background. Estimated duration varies by research depth, with up to 15 symbols per task. The page refreshes automatically when complete.",
            )}
          </p>
          {message && <div className="smart-research-message">{message}</div>}
          {refreshNotice && <div className="smart-research-refresh-notice">{refreshNotice}</div>}
        </section>

        <section className="smart-research-status">
          <div className="smart-research-section-title">
            <BarChart3 size={18} />
            <span>{lt("任务进度", "Task Progress")}</span>
          </div>
          <div className="smart-research-progress-line">
            <strong>{result?.progress?.completed || 0}</strong>
            <span>/ {result?.progress?.total || parseSymbols(symbolsText).length || 0}</span>
            <em>
              {result?.status === "done"
                ? lt("完成", "Done")
                : result?.status === "running"
                  ? lt("分析中", "Running")
                  : result?.status === "failed"
                    ? lt("失败", "Failed")
                    : lt("等待", "Pending")}
            </em>
          </div>
          <div className="smart-research-progress-bar" aria-label={lt("智能研究任务进度", "Smart research task progress")}>
            <span style={{ width: `${totalProgressPercent}%` }} />
          </div>
          <div className="smart-research-progress-meta">
            <span>{runningStage}</span>
            <small>{lt("总进度", "Total")} {totalProgressPercent.toFixed(1)}%</small>
          </div>
          <div className="smart-research-progress-stats">
            <span>{lt("当前：", "Current: ")}{currentProgressItem ? `${currentProgressItem.code} ${currentProgressItem.name || ""}` : "--"}</span>
            <span>{lt("已用：", "Elapsed: ")}{formatDuration(result?.progress?.elapsed_seconds, lt)}</span>
            <span>{lt("预计剩余：", "ETA: ")}{formatDuration(result?.progress?.estimated_remaining_seconds, lt)}</span>
          </div>
          <div className="smart-research-symbol-list">
            {progressItems.map((item) => {
              const itemPercent = clampPercent(item.progress);
              return (
              <button
                key={item.code}
                type="button"
                className={`smart-research-symbol ${selectedCode === item.code ? "active" : ""}`}
                onClick={() => setSelectedCode(item.code)}
              >
                <span>{item.code}</span>
                <strong>
                  {item.name || "--"}
                  <small>
                    {item.stage ||
                      (item.status === "done"
                        ? lt("完成", "Done")
                        : item.status === "running"
                          ? lt("分析中", "Running")
                          : item.status === "failed"
                            ? lt("失败", "Failed")
                            : lt("等待", "Pending"))}
                  </small>
                </strong>
                <em>
                  {item.status === "running"
                    ? `${itemPercent.toFixed(0)}%`
                    : item.status === "done"
                      ? lt("完成", "Done")
                      : item.status === "failed"
                        ? lt("失败", "Failed")
                        : lt("等待", "Pending")}
                </em>
              </button>
              );
            })}
            {!progressItems.length && (
              <div className="smart-research-empty small">{lt("暂无任务", "No task")}</div>
            )}
          </div>
          <div className="smart-research-task-history">
            <div className="smart-research-task-history-head">
              <strong>{lt("我的研究任务", "My Research Tasks")}</strong>
              <button type="button" onClick={() => void loadTaskHistory()}>{lt("刷新", "Refresh")}</button>
            </div>
            <div className="smart-research-task-history-list">
              {taskHistory.slice(0, 8).map((task) => {
                const symbols = (task.symbols || [])
                  .slice(0, 3)
                  .map((item) => item.name || item.code)
                  .filter(Boolean)
                  .join(" / ");
                return (
                  <button
                    type="button"
                    key={task.task_id}
                    className={task.task_id === taskId ? "active" : ""}
                    onClick={() => {
                      setTaskId(task.task_id);
                      localStorage.setItem(activeTaskStorageKey, String(task.task_id));
                    }}
                  >
                    <span>#{task.task_id}</span>
                    <strong>{symbols || lt("研究任务", "Research task")}</strong>
                    <em>{task.status === "done" ? lt("完成", "Done") : task.status === "running" ? lt("进行中", "Running") : task.status === "failed" ? lt("失败", "Failed") : lt("等待", "Pending")}</em>
                  </button>
                );
              })}
              {!taskHistory.length && <small>{lt("暂无历史任务", "No task history")}</small>}
            </div>
          </div>
        </section>
      </div>

      {result?.results?.length ? (
        <div className="smart-research-result-tabs">
          {result.results.map((item) => (
            <button
              key={item.symbol.code}
              type="button"
              className={selectedItem?.symbol.code === item.symbol.code ? "active" : ""}
              onClick={() => setSelectedCode(item.symbol.code)}
            >
              {item.symbol.code} {item.symbol.name}
            </button>
          ))}
        </div>
      ) : null}

      {selectedItem && (
        <div className="smart-research-summary-grid">
          <div className="smart-research-summary-card strong">
            <small>{lt("综合评分", "Overall Score")}</small>
            <strong>{selectedItem.decision?.overall_score ?? "--"}</strong>
            <span>{selectedItem.decision?.action || selectedItem.decision?.raw || lt("等待决策", "Waiting for decision")}</span>
          </div>
          <div className="smart-research-summary-card">
            <small>{lt("建议仓位", "Suggested Position")}</small>
            <strong>{formatPercent((selectedItem.decision?.position_ratio || 0) * 100)}</strong>
            <span>{lt("风险等级：", "Risk level: ")}{selectedItem.decision?.risk_level || "--"}</span>
          </div>
          <div className="smart-research-summary-card">
            <small>{lt("总市值", "Market Cap")}</small>
            <strong>
              {formatMarketCap(
                selectedItem.symbol.market_cap,
                lt(
                  resultMarketDefinition.marketCapUnitZh,
                  resultMarketDefinition.marketCapUnitEn,
                ),
              )}
            </strong>
            <span>PE：{selectedItem.symbol.pe_ratio ?? "--"}</span>
          </div>
          <div className="smart-research-summary-card">
            <small>{lt("分析引擎", "Engine")}</small>
            <strong>{displayEngineLabel(selectedItem)}</strong>
            <span>{selectedItem.symbol.industry || selectedItem.symbol.board || "--"}</span>
          </div>
        </div>
      )}

      <ResearchCharts item={selectedItem} />

      <section className="smart-research-report">
        <div className="smart-research-card-head">
          <span>{lt("研究报告", "Research Report")}</span>
          <div>
            <button className="figma-btn figma-btn-sm" type="button" onClick={openExportDialog}>
              <Download size={14} />
              {lt("导出报告", "Export Report")}
            </button>
          </div>
        </div>
        <div className="smart-research-markdown" dangerouslySetInnerHTML={{ __html: markdownHtml }} />
      </section>

      {showExportDialog && (
        <div
          className="smart-research-export-mask"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !exporting) setShowExportDialog(false);
          }}
        >
          <section className="smart-research-export-dialog" role="dialog" aria-modal="true" aria-label={lt("导出报告", "Export Report")}>
            <header className="smart-research-export-dialog-head">
              <div>
                <span>{lt("导出报告", "Export Report")}</span>
                <small>{lt("选择已完成的研究报告和导出类型", "Select a completed research report and export format")}</small>
              </div>
              <button type="button" onClick={() => setShowExportDialog(false)} disabled={exporting} aria-label={lt("关闭", "Close")}>
                ×
              </button>
            </header>

            <div className="smart-research-export-dialog-body">
              <label className="smart-research-field">
                <span>{lt("已完成报告", "Completed Report")}</span>
                <select
                  value={exportTaskId || ""}
                  onChange={(event) => setExportTaskId(Number(event.target.value) || null)}
                  disabled={!completedReportTasks.length || exporting}
                >
                  {completedReportTasks.map((task) => (
                    <option key={task.task_id} value={task.task_id}>
                      #{task.task_id} · {smartResearchTaskLabel(task)} · {String(task.updated_at || task.created_at || "").slice(0, 16).replace("T", " ")}
                    </option>
                  ))}
                </select>
              </label>

              <div className="smart-research-export-format" role="radiogroup" aria-label={lt("导出类型", "Export format")}>
                {([
                  { key: "pdf", label: "PDF", desc: lt("适合归档和发送", "For archiving and sharing") },
                  { key: "docx", label: "Word", desc: lt("适合二次编辑", "For further editing") },
                  { key: "md", label: "Markdown", desc: lt("适合知识库和版本管理", "For knowledge bases and versioning") },
                ] as Array<{ key: SmartResearchReportFormat; label: string; desc: string }>).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={exportFormat === item.key ? "active" : ""}
                    onClick={() => setExportFormat(item.key)}
                    disabled={exporting}
                    aria-pressed={exportFormat === item.key}
                  >
                    <strong>{item.label}</strong>
                    <small>{item.desc}</small>
                  </button>
                ))}
              </div>

              {!completedReportTasks.length && (
                <div className="smart-research-export-empty">
                  {lt("暂无已完成的研究报告。任务完成后会出现在这里。", "No completed research report yet. Finished tasks will appear here.")}
                </div>
              )}
            </div>

            <footer className="smart-research-export-dialog-actions">
              <button className="figma-btn" type="button" onClick={() => setShowExportDialog(false)} disabled={exporting}>
                {lt("取消", "Cancel")}
              </button>
              <button
                className="figma-btn figma-btn-primary"
                type="button"
                onClick={() => void exportSelectedReport()}
                disabled={!selectedExportTask || exporting}
              >
                {exporting ? <Loader2 size={15} className="smart-research-spin" /> : <Download size={15} />}
                {lt("导出", "Export")}
              </button>
            </footer>
          </section>
        </div>
      )}
      <LongTaskRewardAdModal
        active={isRunning}
        taskKey={`smart-research:${result?.task_id || taskId || "starting"}`}
        contextLabel={lt("智能研究", "Smart research")}
      />
    </div>
  );
}
