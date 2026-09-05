import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { ChevronLeft, ChevronRight, Eye, Plus, RefreshCcw, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import KLineChart, { type KLineAdjustmentMode, type KLineAdjustmentStatus, type KLinePoint } from "../components/KLineChart";
import LongTaskRewardAdModal from "../components/LongTaskRewardAdModal";
import { AiModelInput, useAiModelSelection } from "../shared/aiModels";
import { getAuthUser, hasPermission } from "../shared/auth";
import { useLangText } from "../shared/language";
import { isMarketTradingSession, useMarket } from "../shared/market";
import { readUserPageCache, userScopedStorageKey, writeUserPageCache } from "../shared/pageCache";
import { useTheme } from "../shared/theme";
import { COMMUNITY_EDITION } from "../shared/edition";
import CommunityFeatureNotice from "../components/CommunityFeatureNotice";

type LangTextFn = (zh: string, en: string) => string;

const DIMS = ["趋势", "动量", "估值", "情绪", "风险"];
const ACTIVE_AI_INSIGHT_TASK_KEY = "quartsys_ai_insights_active_task";
const AI_INSIGHTS_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

function alphaLimitForRole(role?: string) {
  const normalized = String(role || "normal").toLowerCase();
  if (normalized === "admin") return 12;
  if (normalized === "svip") return 6;
  if (normalized === "vip") return 3;
  return 0;
}

interface AnalysisItem {
  dimension: string;
  score?: number;
  summary?: string;
  text?: string;
}
interface Result {
  task_id?: number;
  status: string;
  dimensions?: Record<string, number>;
  summary?: string;
  analysis_list?: AnalysisItem[];
}
interface Temp {
  rise_count: number;
  fall_count: number;
  avg_change: number;
  avg_rise: number;
  avg_fall: number;
  heatmap_data: Record<string, number>;
  heatmap_stats?: Record<
    string,
    {
      rise_count?: number;
      fall_count?: number;
      flat_count?: number;
      total_count?: number;
      rise_ratio?: number;
      fall_ratio?: number;
    }
  >;
  calc_time?: string;
  data_date?: string;
  source?: string;
  flat_count?: number;
  total_count?: number;
  market_volume?: number | null;
  market_volume_prev?: number | null;
  market_volume_change?: number | null;
  market_volume_change_pct?: number | null;
  market_volume_direction?: "up" | "down" | "flat" | "unknown" | string;
  market_volume_date?: string | null;
  market_volume_prev_date?: string | null;
  market_amount?: number | null;
  market_amount_prev?: number | null;
  market_amount_change?: number | null;
  market_amount_change_pct?: number | null;
  market_amount_direction?: "up" | "down" | "flat" | "unknown" | string;
  market_amount_date?: string | null;
  market_amount_prev_date?: string | null;
  refresh_queued?: boolean;
  stale?: boolean;
}
interface AlphaItem {
  rank: number;
  stock_code: string;
  stock_name: string;
  stars: number;
  score?: number;
  signal_source?: string;
  ai_logic: string;
  ai_logic_en?: string;
  score_breakdown?: Record<string, { score: number; weight: number; contribution: number }>;
  buy_price: number;
  stop_loss: number;
  target_price: number;
  currency?: string;
  currency_symbol?: string;
  locked: boolean;
}
interface AlphaScheme {
  key: string;
  label_zh: string;
  label_en: string;
  kind: string;
  description_zh?: string;
  description_en?: string;
  enabled?: boolean;
}
interface AlphaSettings {
  enabled: boolean;
  section_title_zh: string;
  section_title_en: string;
  display_fields: string[];
  schemes: AlphaScheme[];
}
interface Advice {
  id?: number;
  position_ratio: number;
  attack: string[];
  defense: string[];
  neutral: string;
  attack_reason: string;
  defense_reason: string;
  status?: string;
  created_at?: string;
}

type AiInsightsCacheSnapshot = {
  result: Result | null;
  temp: Temp | null;
  alphaItems: AlphaItem[];
  alphaStrategy: string;
  alphaSettings: AlphaSettings;
  alphaAccessLimit: number;
  advice: Advice;
};

interface SectorStock {
  code: string;
  name: string;
  exchange?: string;
  industry?: string;
  sector?: string;
  board?: string;
  price?: number | null;
  change_pct?: number | null;
  amount?: number | null;
  volume?: number | null;
  turnover_rate?: number | null;
  market_cap?: number | null;
  pe_ratio?: number | null;
  date?: string;
}

const isInsightComplete = (status?: string) =>
  status === "done" || status === "failed";

const DEFAULT_ALPHA_SETTINGS: AlphaSettings = {
  enabled: true,
  section_title_zh: "AI 观察池",
  section_title_en: "AI Watchlist Pool",
  display_fields: ["score", "logic", "price_plan"],
  schemes: [
    { key: "default", label_zh: "均衡质量", label_en: "Balanced Quality", kind: "balanced" },
    { key: "ma60", label_zh: "动量突破", label_en: "Momentum Breakout", kind: "momentum" },
    { key: "momentum", label_zh: "超跌修复", label_en: "Oversold Recovery", kind: "reversal" },
  ],
};

const DIMENSION_COLORS: Record<string, string> = {
  趋势: "var(--primary)",
  动量: "var(--market-up)",
  估值: "var(--info)",
  情绪: "var(--warning)",
  风险: "var(--danger)",
};

const DIMENSION_BADGES: Record<string, { color: string; bg: string; border: string }> = {
  趋势: { color: "var(--primary)", bg: "var(--primary-light)", border: "var(--border-subtle)" },
  动量: { color: "var(--market-up)", bg: "var(--market-up-bg)", border: "var(--border-subtle)" },
  估值: { color: "var(--accent-purple)", bg: "color-mix(in srgb, var(--accent-purple) 14%, transparent)", border: "var(--border-subtle)" },
  情绪: { color: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 15%, transparent)", border: "var(--border-subtle)" },
  风险: { color: "var(--danger)", bg: "var(--danger-bg)", border: "var(--border-subtle)" },
};

const DIMENSION_LABELS_EN: Record<string, string> = {
  趋势: "Trend",
  动量: "Momentum",
  估值: "Valuation",
  情绪: "Sentiment",
  风险: "Risk",
};

const SUMMARY_SCORE_REGEX = /综合评分\s*(\d+)\/100/;

const EMPHASIS_TEXT_REGEX =
  /(综合评分\s*\d+\/100|偏强|偏弱|分析失败|连接失败|TLS|SSL|HTTPS|鉴权|模型端点|API Key|Base URL|风险|流动性|地缘政治|中性占位|请检查|重新触发|强势|突破|量价配合良好)/;

const MARKET_TEMPERATURE_REFRESH_MS = 30 * 60_000;

const clampScore = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
};

function getScoreColor(score: number | null) {
  if (score == null) return "var(--text-muted)";
  if (score >= 70) return "var(--market-up)";
  if (score >= 60) return "var(--primary)";
  if (score >= 50) return "#a16207";
  return "var(--market-down)";
}

function getRadarPointColor(score: number) {
  if (score >= 70) return "#dc2626";
  if (score >= 60) return "#f59e0b";
  if (score <= 45) return "#16a34a";
  return "#2563eb";
}

function buildRadarHighlightMap(rows: Required<AnalysisItem>[]) {
  const highlights = new Map<
    string,
    { color: string; bg: string; border: string; richKey: string }
  >();
  if (!rows.length) return highlights;

  const average =
    rows.reduce((total, item) => total + item.score, 0) / rows.length;
  const topScore = Math.max(...rows.map((item) => item.score));
  const lowScore = Math.min(...rows.map((item) => item.score));
  const topRows = rows.filter((item) => item.score === topScore);

  rows.forEach((item, index) => {
    const isHigh = item.score >= 70;
    const isLow = item.score <= 45;
    const isStandoutTop =
      topRows.length === 1 && item.score === topScore && item.score - average >= 8;
    const isStandoutLow = item.score === lowScore && average - item.score >= 12;
    if (!isHigh && !isLow && !isStandoutTop && !isStandoutLow) return;

    const color = getRadarPointColor(item.score);
    highlights.set(item.dimension, {
      color,
      bg:
        item.score >= 60
          ? "rgba(220, 38, 38, 0.12)"
          : "rgba(22, 163, 74, 0.12)",
      border:
        item.score >= 60
          ? "rgba(220, 38, 38, 0.38)"
          : "rgba(22, 163, 74, 0.38)",
      richKey: `radarHot${index}`,
    });
  });

  if (!highlights.size) {
    const topIndex = rows.findIndex((item) => item.score === topScore);
    const top = rows[topIndex];
    const color = getRadarPointColor(top.score);
    highlights.set(top.dimension, {
      color,
      bg: "rgba(217, 170, 78, 0.12)",
      border: "rgba(217, 170, 78, 0.38)",
      richKey: `radarHot${topIndex}`,
    });
  }

  return highlights;
}

function dimensionLabel(dimension: string, lt: LangTextFn) {
  return lt(dimension, DIMENSION_LABELS_EN[dimension] || dimension);
}

function marketTemperatureSourceLabel(source: string | undefined, lt: LangTextFn) {
  if (!source) return lt("在线公开市场数据", "Online public market data");
  if (source.includes("tencent")) return lt("在线实时行情", "Online realtime quotes");
  if (source.includes("database")) return lt("在线数据服务 · 最新交易日", "Online data service · latest trading day");
  if (source.includes("local") || source.includes("snapshot")) return lt("在线市场快照", "Online market snapshot");
  if (source.includes("unavailable")) return lt("数据暂不可用", "Data unavailable");
  return lt("在线公开市场数据", "Online public market data");
}

function parseKLineHistory(raw: unknown): KLinePoint[] {
  const points = Array.isArray((raw as any)?.data) ? (raw as any).data : [];
  return points
    .map((item: unknown) => {
      if (!Array.isArray(item) || item.length < 6) return null;
      const [date, open, close, low, high, volume, amount] = item;
      const values = [open, close, low, high].map(Number);
      if (!date || values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
      const volumeValue = Number(volume);
      const amountValue = Number(amount);
      return {
        date: String(date).slice(0, 10),
        open: values[0],
        close: values[1],
        low: Math.min(...values),
        high: Math.max(...values),
        volume: Number.isFinite(volumeValue) && volumeValue > 0 ? volumeValue : 0,
        amount: Number.isFinite(amountValue) && amountValue > 0 ? amountValue : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String((a as KLinePoint).date).localeCompare(String((b as KLinePoint).date))) as KLinePoint[];
}

function getEmphasisColor(text: string) {
  if (/失败|鉴权|风险|TLS|SSL|HTTPS/.test(text)) return "var(--danger)";
  if (/偏强|强势|突破|量价配合良好/.test(text)) return "var(--market-up)";
  if (/偏弱/.test(text)) return "var(--market-down)";
  if (/API Key|Base URL|请检查|重新触发/.test(text)) return "var(--primary)";
  return "var(--text-primary)";
}

function renderInsightText(text?: string) {
  if (!text) return null;
  return text.split(EMPHASIS_TEXT_REGEX).map((part, index) => {
    if (!part) return null;
    if (!EMPHASIS_TEXT_REGEX.test(part)) return part;
    return (
      <strong
        key={`${part}-${index}`}
        style={{ color: getEmphasisColor(part), fontWeight: 800 }}
      >
        {part}
      </strong>
    );
  });
}

function extractSummaryScore(text?: string) {
  const match = text?.match(SUMMARY_SCORE_REGEX);
  return match ? clampScore(match[1]) : null;
}

function stripSummaryScore(text?: string) {
  return (text || "").replace(/综合评分\s*\d+\/100[，,、\s]*/, "").trim();
}

function sanitizeInsightErrorText(text: string) {
  return (text || "")
    .replace(/sk-[A-Za-z0-9_\-\*]{6,}/g, "sk-****")
    .slice(0, 520);
}

function normalizeInsightErrorMessage(message: string) {
  const raw = sanitizeInsightErrorText(message || "");
  if (!raw) return "后端暂不可用，请检查服务状态。";
  const lower = raw.toLowerCase();
  if (
    /ssl|ssleof|tls|httpsconnectionpool|eof occurred|max retries exceeded|connection aborted|connection reset|read timed out|timeout|timed out/.test(
      lower,
    )
  ) {
    return `模型服务连接失败：当前模型服务在 HTTPS/TLS 连接或响应超时阶段中断。请检查设置中心「AI配置」里的服务地址是否为 OpenAI 兼容 /v1 地址，API Key 与当前模型是否匹配，并确认该端点网络稳定。原始错误：${raw}`;
  }
  if (/authentication|incorrect api key|unauthorized|invalid api key|api key|鉴权|401|403/.test(lower)) {
    return `模型鉴权失败：请检查设置中心「AI配置」中的 API Key、服务地址和模型名称是否匹配。原始错误：${raw}`;
  }
  if (/base url|model endpoint|模型端点|not found|404|model/.test(lower)) {
    return `模型端点配置异常：请确认服务地址以 /v1 结尾或兼容 OpenAI Chat Completions，并确认当前模型名称可用。原始错误：${raw}`;
  }
  return raw;
}

function normalizeInsightSummary(text?: string) {
  const raw = text || "";
  if (!raw) return "";
  if (/SSLEOFError|HTTPSConnectionPool|Max retries exceeded|TLS|SSL|Read timed out|read timeout/i.test(raw)) {
    const [, detail = raw] = raw.split(/错误信息：/);
    return `分析失败：${normalizeInsightErrorMessage(detail)}`;
  }
  return sanitizeInsightErrorText(raw);
}

function sanitizeResearchOnlyText(text?: string) {
  return (text || "")
    .replace(/推荐股票/g, "观察样本")
    .replace(/智能推荐/g, "AI 观察池")
    .replace(/策略推荐/g, "策略线索")
    .replace(/推荐逻辑/g, "观察理由")
    .replace(/建议仓位约?\s*\d+(?:\.\d+)?%[，,、\s]*/g, "")
    .replace(/建议仓位/g, "市场信号强度")
    .replace(/仓位建议/g, "市场信号观察")
    .replace(/建议买入/g, "进入观察")
    .replace(/推荐买入/g, "进入观察")
    .replace(/买入建议/g, "观察理由")
    .trim();
}

function buildDimensionRows(result: Result | null): Required<AnalysisItem>[] {
  if (!result) return [];
  const byDimension = new Map(
    (result.analysis_list || []).map((item) => [item.dimension, item]),
  );
  return DIMS.map((dimension) => {
    const item = byDimension.get(dimension);
    const score = clampScore(item?.score ?? result.dimensions?.[dimension] ?? 50);
    return {
      dimension,
      score,
      summary:
        normalizeInsightSummary(item?.summary || item?.text || "") ||
        (result.status === "failed"
          ? "本次 AI 调用失败，当前为中性占位评分；请检查助手配置后重新触发。"
          : "暂无该维度明细。"),
      text: item?.text || "",
    };
  });
}

function buildClientErrorResult(message: string): Result {
  const dimensions = Object.fromEntries(DIMS.map((dimension) => [dimension, 50]));
  return {
    status: "failed",
    dimensions,
    summary: `触发分析失败：${normalizeInsightErrorMessage(message)}`,
    analysis_list: DIMS.map((dimension) => ({
      dimension,
      score: 50,
      summary: "前端未能成功触发 AI 分析，当前为中性占位评分。",
    })),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

function AiInsightsPageFull() {
  const lt = useLangText();
  const { market, definition } = useMarket();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { selectedModel, setSelectedModel, modelOptions } =
    useAiModelSelection("ai_insights");
  const [result, setResult] = useState<Result | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [temp, setTemp] = useState<Temp | null>(null);
  const [tempLoading, setTempLoading] = useState(false);
  const [tempError, setTempError] = useState("");
  const [alphaItems, setAlphaItems] = useState<AlphaItem[]>([]);
  const [alphaStrategy, setAlphaStrategy] = useState("default");
  const [alphaSettings, setAlphaSettings] = useState<AlphaSettings>(DEFAULT_ALPHA_SETTINGS);
  const [alphaLoading, setAlphaLoading] = useState(false);
  const [alphaStart, setAlphaStart] = useState(0);
  const [alphaAccessLimit, setAlphaAccessLimit] = useState(0);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceTaskId, setAdviceTaskId] = useState<number | null>(null);
  const [cacheHydratedMarket, setCacheHydratedMarket] = useState("");
  const [showSectorMap, setShowSectorMap] = useState(false);
  const [selectedSector, setSelectedSector] = useState("");
  const [sectorStocks, setSectorStocks] = useState<SectorStock[]>([]);
  const [sectorStocksLoading, setSectorStocksLoading] = useState(false);
  const [sectorStocksError, setSectorStocksError] = useState("");
  const [sectorChartStock, setSectorChartStock] = useState<SectorStock | null>(null);
  const [sectorChartData, setSectorChartData] = useState<KLinePoint[]>([]);
  const [sectorChartLoading, setSectorChartLoading] = useState(false);
  const [sectorChartAdjustment, setSectorChartAdjustment] = useState<KLineAdjustmentMode>("none");
  const [sectorChartAdjustmentStatus, setSectorChartAdjustmentStatus] = useState<KLineAdjustmentStatus | null>(null);
  const [advice, setAdvice] = useState<Advice>({
    position_ratio: 0.6,
    attack: ["科技", "成长"],
    defense: ["公用事业", "银行"],
    neutral: lt("暂无AI战术观察", "No AI tactical observation yet"),
    attack_reason: "",
    defense_reason: "",
  });
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);
  const tempRef = useRef<Temp | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advicePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tempRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authUser = getAuthUser();
  const roleAlphaLimit = alphaLimitForRole(authUser?.role);
  const alphaLimit = alphaAccessLimit || roleAlphaLimit;
  const alphaUnlocked = alphaLimit > 0;
  const activeTaskStorageKey = userScopedStorageKey(`${ACTIVE_AI_INSIGHT_TASK_KEY}:${market}`);

  const loadSectorStockChart = useCallback(async (stock: SectorStock, nextAdjustment?: KLineAdjustmentMode) => {
    setSectorChartStock(stock);
    setSectorChartLoading(true);
    const effectiveAdjustment = nextAdjustment || sectorChartAdjustment;
    try {
      const raw = await api.getStockHistory(stock.code, effectiveAdjustment);
      setSectorChartData(parseKLineHistory(raw));
      setSectorChartAdjustmentStatus({
        adjust: raw?.adjust,
        adjust_fallback: raw?.adjust_fallback,
        source: raw?.source,
      });
    } catch {
      setSectorChartData([]);
      setSectorChartAdjustmentStatus(null);
    } finally {
      setSectorChartLoading(false);
    }
  }, [sectorChartAdjustment]);

  useEffect(() => {
    if (!sectorChartStock) return;
    void loadSectorStockChart(sectorChartStock);
  }, [sectorChartAdjustment]);

  const openSectorDetails = useCallback(async (name: string) => {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return;
    setShowSectorMap(false);
    setSelectedSector(normalizedName);
    setSectorStocks([]);
    setSectorStocksError("");
    setSectorChartAdjustment("none");
    setSectorChartStock(null);
    setSectorChartData([]);
    setSectorChartAdjustmentStatus(null);
    setSectorStocksLoading(true);
    try {
      const payload: any = await api.getMarketGroupConstituents(normalizedName, market, 500);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setSectorStocks(items);
      if (items.length) void loadSectorStockChart(items[0], "none");
    } catch (error: any) {
      setSectorStocksError(error?.message || lt("板块个股加载失败", "Failed to load sector constituents"));
    } finally {
      setSectorStocksLoading(false);
    }
  }, [market, loadSectorStockChart, lt]);

  const stopPoll = (clearActiveTask = false) => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (clearActiveTask) {
      localStorage.removeItem(activeTaskStorageKey);
    }
  };

  const stopAdvicePoll = () => {
    if (advicePollRef.current) {
      clearInterval(advicePollRef.current);
      advicePollRef.current = null;
    }
  };

  function beginInsightPolling(id: number) {
    if (!Number.isFinite(id) || id <= 0) return;
    stopPoll();
    setTaskId(id);
    setLoading(true);
    localStorage.setItem(activeTaskStorageKey, String(id));

    const pollOnce = async () => {
      try {
        const res: any = await api.getAiInsightsResult(id);
        setTaskId(res?.task_id || id);
        if (isInsightComplete(res?.status)) {
          setResult(res);
          setLoading(false);
          stopPoll(true);
        }
      } catch {
        // Keep polling; temporary backend/network errors should not lose a running task.
      }
    };

    pollOnce();
    pollRef.current = setInterval(pollOnce, 2500);
  }

  async function loadMarketTemperature(forceRefresh = false) {
    setTempLoading(true);
    setTempError("");
    try {
      const d: any = await api.getMarketTemperature(market, forceRefresh);
      const nextHeatmapCount = Object.keys(d?.heatmap_data || {}).length;
      const previous = tempRef.current;
      const previousHeatmapCount = Object.keys(previous?.heatmap_data || {}).length;
      const nextTemp: Temp =
        nextHeatmapCount === 0 && previousHeatmapCount > 0
          ? {
              ...previous!,
              ...d,
              heatmap_data: previous!.heatmap_data,
              heatmap_stats: previous!.heatmap_stats,
              stale: true,
            }
          : d;
      tempRef.current = nextTemp;
      setTemp(nextTemp);
      if (d?.refresh_queued) {
        if (tempRetryRef.current) window.clearTimeout(tempRetryRef.current);
        tempRetryRef.current = window.setTimeout(() => {
          tempRetryRef.current = null;
          void loadMarketTemperature();
        }, 12_000);
      }
      return d;
    } catch (error: any) {
      setTempError(error?.message || lt("市场温度计刷新失败", "Failed to refresh market temperature"));
      return null;
    } finally {
      setTempLoading(false);
    }
  }

  function openSectorMap() {
    setShowSectorMap(true);
    const heatmapCount = Object.keys(temp?.heatmap_data || {}).length;
    if (!temp || temp.stale || heatmapCount === 0) {
      void loadMarketTemperature(true);
    }
  }

  function beginAdvicePolling(id: number) {
    if (!Number.isFinite(id) || id <= 0) return;
    stopAdvicePoll();
    setAdviceTaskId(id);
    setAdviceLoading(true);

    const pollOnce = async () => {
      try {
        const nextAdvice: any = await (api as any).getPositionAdvice(market);
        if (nextAdvice?.id === id || !nextAdvice?.id) {
          setAdvice(nextAdvice);
          if (nextAdvice?.status === "done" || nextAdvice?.status === "failed") {
            setAdviceLoading(false);
            stopAdvicePoll();
          }
        }
      } catch {
        // Keep polling transient errors; the backend task may still be running.
      }
    };

    pollOnce();
    advicePollRef.current = setInterval(pollOnce, 2500);
  }

  async function refreshAdvice() {
    setAdviceLoading(true);
    stopAdvicePoll();
    try {
      const response: any = await (api as any).runPositionAdvice({
        model: selectedModel || undefined,
        market,
      });
      beginAdvicePolling(Number(response?.advice_id));
    } catch (error: any) {
      setAdvice((prev) => ({
        ...prev,
        status: "failed",
        neutral: error?.message || "刷新观察失败，请检查 AI 积分或模型配置。",
      }));
      setAdviceLoading(false);
    }
  }

  useEffect(
    () => () => {
      stopPoll();
      stopAdvicePoll();
      if (tempRetryRef.current) window.clearTimeout(tempRetryRef.current);
      chartInst.current?.dispose();
      chartInst.current = null;
    },
    [],
  );

  useEffect(() => {
    const handleResize = () => chartInst.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    stopPoll();
    stopAdvicePoll();
    if (tempRetryRef.current) {
      window.clearTimeout(tempRetryRef.current);
      tempRetryRef.current = null;
    }
    setCacheHydratedMarket("");
    setResult(null);
    setTaskId(null);
    setTempError("");
    const cached = readUserPageCache<AiInsightsCacheSnapshot>(
      "ai-insights",
      market,
      AI_INSIGHTS_CACHE_MAX_AGE_MS,
    );
    if (cached?.value) {
      const snapshot = cached.value;
      setResult(snapshot.result || null);
      setTemp(snapshot.temp || null);
      tempRef.current = snapshot.temp || null;
      setAlphaItems(Array.isArray(snapshot.alphaItems) ? snapshot.alphaItems : []);
      setAlphaStrategy(snapshot.alphaStrategy || "default");
      setAlphaSettings(snapshot.alphaSettings || DEFAULT_ALPHA_SETTINGS);
      setAlphaAccessLimit(Number(snapshot.alphaAccessLimit || 0));
      if (snapshot.advice) setAdvice(snapshot.advice);
      setTempLoading(false);
      setCacheHydratedMarket(market);
    } else {
      tempRef.current = null;
      setTemp(null);
      const temperatureRequest = loadMarketTemperature();
      const settingsRequest = (api as any)
      .getAlphaRecommendationSettings()
      .then((payload: any) => {
        const schemes = Array.isArray(payload?.schemes) ? payload.schemes : DEFAULT_ALPHA_SETTINGS.schemes;
        const nextSettings: AlphaSettings = {
          ...DEFAULT_ALPHA_SETTINGS,
          ...payload,
          schemes,
          display_fields: Array.isArray(payload?.display_fields)
            ? payload.display_fields
            : DEFAULT_ALPHA_SETTINGS.display_fields,
        };
        setAlphaSettings(nextSettings);
        const keys = schemes.map((item: AlphaScheme) => item.key);
        const nextStrategy = keys.includes(alphaStrategy) ? alphaStrategy : (keys[0] || "default");
        setAlphaStrategy(nextStrategy);
        if (nextSettings.enabled && schemes.length) return loadAlpha(nextStrategy);
        else setAlphaItems([]);
      })
      .catch(() => {
        setAlphaSettings(DEFAULT_ALPHA_SETTINGS);
        return loadAlpha(alphaStrategy || "default");
      });
      const adviceRequest = (api as any)
      .getPositionAdvice(market)
      .then((d: any) => setAdvice(d))
      .catch(() => {});
      void Promise.allSettled([temperatureRequest, settingsRequest, adviceRequest]).then(() => {
        setCacheHydratedMarket(market);
      });
    }

    const activeTaskId = Number(localStorage.getItem(activeTaskStorageKey) || "");
    if (Number.isFinite(activeTaskId) && activeTaskId > 0) {
      beginInsightPolling(activeTaskId);
    }
  }, [market]);

  useEffect(() => {
    if (cacheHydratedMarket !== market) return;
    writeUserPageCache<AiInsightsCacheSnapshot>("ai-insights", market, {
      result,
      temp,
      alphaItems,
      alphaStrategy,
      alphaSettings,
      alphaAccessLimit,
      advice,
    });
  }, [
    advice,
    alphaAccessLimit,
    alphaItems,
    alphaSettings,
    alphaStrategy,
    cacheHydratedMarket,
    market,
    result,
    temp,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isMarketTradingSession(market)) return;
      void loadMarketTemperature();
    }, MARKET_TEMPERATURE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [market]);

  useEffect(() => {
    if (!result || !isInsightComplete(result.status) || !chartRef.current) return;
    if (!chartInst.current) chartInst.current = echarts.init(chartRef.current);
    const radarRows = buildDimensionRows(result);
    const radarHighlights = buildRadarHighlightMap(radarRows);
    const scores = radarRows.map((item) => item.score);
    const axisNameRich = {
      axisBase: {
        color: theme === "dark" ? "#d4d3cc" : "#44443f",
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 20,
      },
      ...Object.fromEntries(
        [...radarHighlights.values()].map((highlight) => [
          highlight.richKey,
          {
            color: highlight.color,
            backgroundColor: highlight.bg,
            borderColor: highlight.border,
            borderWidth: 1,
            borderRadius: 999,
            padding: [3, 7],
            fontSize: 11,
            fontWeight: 850,
            lineHeight: 18,
          },
        ]),
      ),
    };
    chartInst.current.setOption({
      backgroundColor: "transparent",
      grid: { containLabel: true },
      radar: {
        indicator: DIMS.map((d) => ({ name: d, max: 100 })),
        shape: "polygon",
        center: ["50%", "52%"],
        radius: "78%",
        splitNumber: 5,
        axisName: {
          formatter: (name: string) => {
            const row = radarRows.find((item) => item.dimension === name);
            const highlight = radarHighlights.get(name);
            if (!row || !highlight) return `{axisBase|${name}}`;
            return `{axisBase|${name}}  {${highlight.richKey}|${row.score}}`;
          },
          rich: axisNameRich,
        },
        axisNameGap: 18,
        splitLine: {
          lineStyle: {
            color: theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(113,110,98,0.28)",
          },
        },
        splitArea: {
          show: true,
          areaStyle: {
            color:
              theme === "dark"
                ? ["rgba(217,170,78,0.03)", "rgba(217,170,78,0.08)"]
                : ["rgba(217,170,78,0.04)", "rgba(217,170,78,0.1)"],
          },
        },
        axisLine: {
          lineStyle: {
            color: theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(113,110,98,0.34)",
          },
        },
      },
      series: [
        {
          type: "radar",
          symbol: "circle",
          symbolSize: 10,
          data: [
            {
              value: scores,
              name: "市场评分",
              areaStyle: { color: "rgba(217,170,78,0.2)" },
              lineStyle: { color: "#2563eb", width: 3 },
              label: {
                show: false,
              },
              itemStyle: {
                color: "#2563eb",
                borderColor: theme === "dark" ? "#111316" : "#fff",
                borderWidth: 2,
                shadowColor: "rgba(217,170,78,0.28)",
                shadowBlur: 8,
              },
              emphasis: {
                lineStyle: { width: 4 },
                areaStyle: { color: "rgba(217,170,78,0.26)" },
                itemStyle: {
                  color: "#dc2626",
                  borderColor: theme === "dark" ? "#111316" : "#fff",
                  borderWidth: 3,
                  shadowColor: "rgba(220,38,38,0.35)",
                  shadowBlur: 14,
                },
              },
            },
          ],
        },
      ],
    });
    window.setTimeout(() => chartInst.current?.resize(), 0);
  }, [result, theme]);

  const trigger = async () => {
    setLoading(true);
    stopPoll();
    try {
      const r: any = await api.runAiInsights({
        model: selectedModel || undefined,
        market,
      });
      beginInsightPolling(Number(r.task_id));
    } catch (error: any) {
      setResult(buildClientErrorResult(error?.message || ""));
      setLoading(false);
      stopPoll(true);
    }
  };

  const loadAlpha = async (s: string) => {
    setAlphaLoading(true);
    setAlphaStart(0);
    try {
      const r: any = await (api as any).runAlphaRecommend({
        strategy_name: s,
        limit: Math.max(1, roleAlphaLimit || 12),
        market,
      });
      setAlphaAccessLimit(Number(r?.access_limit ?? roleAlphaLimit) || 0);
      setAlphaItems(r.items || []);
    } catch {
    } finally {
      setAlphaLoading(false);
    }
  };

  const openAlphaBacktest = (item: AlphaItem) => {
    navigate(`/quote?code=${encodeURIComponent(item.stock_code)}`);
  };

  const tempEntries = temp
    ? (() => {
        const entries = Object.entries(temp.heatmap_data || {})
          .filter(([name, value]) => name && Number.isFinite(Number(value)))
          .map(([name, value]) => [name, Number(value)] as [string, number]);
        const rising = entries.filter(([, v]) => v >= 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const falling = entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 6);
        return [...rising, ...falling].slice(0, 12);
      })()
    : [];

  // Flat count for gain/loss bar (fallbacks)
  const flatCount = temp
    ? Math.max(
        0,
        temp.flat_count ??
          (temp.total_count
            ? temp.total_count - temp.rise_count - temp.fall_count
            : 0),
      )
    : 0;
  const marketBreadthTotal = temp
    ? Math.max(
        0,
        temp.total_count || temp.rise_count + temp.fall_count + flatCount,
      )
    : 0;
const risingRatio = marketBreadthTotal
    ? (temp!.rise_count / marketBreadthTotal) * 100
    : 0;
  const fallingRatio = marketBreadthTotal
    ? (temp!.fall_count / marketBreadthTotal) * 100
    : 0;
  const flatRatio = marketBreadthTotal ? (flatCount / marketBreadthTotal) * 100 : 0;
  const thermometerTone =
    risingRatio >= 55
      ? {
          label: lt("市场偏暖", "Market Warming"),
          detail: lt("上涨家数占优", "Risers dominate"),
          cls: "warm",
        }
      : fallingRatio >= 55
        ? {
            label: lt("市场偏冷", "Market Cooling"),
            detail: lt("下跌家数占优", "Decliners dominate"),
            cls: "cool",
          }
        : {
            label: lt("宽度均衡", "Balanced Breadth"),
            detail: lt("多空分歧较均衡", "Breadth is balanced"),
            cls: "neutral",
          };
  const formatSignedPct = (value?: number | null, digits = 2) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
  };
  const formatAiAmount = (value?: number | null) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "--";
    const prefix = definition.currencySymbol;
    if (n >= 100000000) return `${prefix}${(n / 100000000).toFixed(2)}${lt("亿", " × 100M")}`;
    if (n >= 10000) return `${prefix}${(n / 10000).toFixed(2)}${lt("万", " × 10K")}`;
    return `${prefix}${Math.round(n).toLocaleString()}`;
  };
  const marketAmountDirection = temp?.market_amount_direction || temp?.market_volume_direction || "unknown";
  const marketAmountChangePct = temp?.market_amount_change_pct ?? temp?.market_volume_change_pct;
  const marketVolumeChangeText = Number.isFinite(Number(marketAmountChangePct))
    ? `${Number(marketAmountChangePct).toFixed(2)}%`
    : "--";
  const marketVolumeLabel =
    marketAmountDirection === "up"
      ? lt("增加", "Up")
      : marketAmountDirection === "down"
        ? lt("减少", "Down")
        : lt("成交额", "Turnover");
  const marketAmountValue = temp?.market_amount ?? temp?.market_volume;
  const availableAlphaItems = alphaUnlocked
    ? alphaItems.filter((item) => !item.locked).slice(0, alphaLimit)
    : [];
  const alphaWindowStart = availableAlphaItems.length <= 2
    ? 0
    : Math.min(alphaStart, Math.max(0, availableAlphaItems.length - 2));
  const visibleAlphaItems = availableAlphaItems.slice(alphaWindowStart, alphaWindowStart + 2);
  const insightReady = isInsightComplete(result?.status);
  const dimensionRows = buildDimensionRows(result);
  const summaryText = normalizeInsightSummary(result?.summary || "");
  const overallScore = dimensionRows.length
    ? Math.round(
        dimensionRows.reduce((sum, item) => sum + item.score, 0) /
          dimensionRows.length,
      )
    : null;
  const summaryScore = extractSummaryScore(summaryText) ?? overallScore;
  const summaryBodyText =
    stripSummaryScore(summaryText) ||
    (insightReady ? lt("AI 分析暂无摘要，请重新触发分析。", "No AI summary yet. Run analysis again.") : "");
  const marketDirection =
    summaryText.includes("偏强") || (summaryScore ?? 0) >= 60
      ? lt("市场偏强", "Bullish Market")
      : summaryText.includes("偏弱")
        ? lt("市场偏弱", "Weak Market")
        : lt("中性观察", "Neutral Watch");
  const riskScore =
    dimensionRows.find((item) => item.dimension === "风险")?.score ?? null;
  const insightDataContext = (result as any)?.data_context || {};
  const insightDataDate =
    insightDataContext.trade_date || insightDataContext.data_date || temp?.data_date || "-";
  const insightDataSource = insightDataContext.source_label || marketTemperatureSourceLabel(
    insightDataContext.source || insightDataContext.source_kind || temp?.source,
    lt,
  );
  const overallScoreColor = getScoreColor(overallScore);
  const summaryScoreColor = getScoreColor(summaryScore);
  const riskScoreColor = getScoreColor(riskScore);
  const offensivePct = Math.max(0, Math.min(100, Math.round(advice.position_ratio * 100)));
  const defensivePct = Math.max(0, 100 - offensivePct);
  const insightStatusText = loading
    ? lt("后台分析中", "Analyzing in background")
    : result?.status === "done"
      ? lt("分析完成", "Analysis complete")
      : result?.status === "failed"
        ? lt("分析失败", "Analysis failed")
        : lt("待分析", "Pending");

  return (
    <div className="ai-insights-page">
      {/* ── Header ── */}
      <div className="ai-header">
        <div>
          <h1>{lt("AI 市场洞察", "AI Market Insights")}</h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-muted)",
              margin: "4px 0 0",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "var(--radius-full)",
                background: "var(--success)",
                display: "inline-block",
              }}
            />
            {temp?.calc_time
              ? lt(
                  `已更新 ${temp.calc_time.slice(0, 19)} · 行情日 ${temp.data_date || "-"} · ${marketTemperatureSourceLabel(temp.source, lt)}${temp.refresh_queued ? " · 后台刷新中" : ""}`,
                  `Updated ${temp.calc_time.slice(0, 19)} · Trading date ${temp.data_date || "-"} · ${marketTemperatureSourceLabel(temp.source, lt)}${temp.refresh_queued ? " · background refresh queued" : ""}`,
                )
              : tempLoading
                ? lt("市场温度计刷新中", "Refreshing market temperature")
                : tempError || lt("等待数据", "Waiting for data")}
          </p>
        </div>
        <div className="ai-header-actions" style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <AiModelInput
            label={lt("分析模型", "Analysis Model")}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            onChange={setSelectedModel}
            compact
            style={{ minWidth: 190 }}
          />
          <button className="ai-trigger-btn" onClick={trigger} disabled={loading}>
            {loading ? (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "var(--radius-full)",
                    display: "inline-block",
                    animation: "spin 1s linear infinite",
                  }}
                />
                 {lt("后台分析中...", "Analyzing...")}
              </>
            ) : (
              lt("触发分析 · 50积分", "Run Analysis · 50 credits")
            )}
          </button>
        </div>
      </div>

      {/* ── Macro Analysis Card ── */}
      <div
        className="ai-overview-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          marginBottom: 24,
        }}
      >
        <div className="ai-macro-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h3
              style={{
                fontFamily: "var(--font-primary)",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
               {lt("宏观市场评估", "Macro Market Assessment")}
            </h3>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "var(--primary-light)",
                color: "var(--primary)",
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
              }}
            >
               {insightStatusText}
            </span>
          </div>

          {/* Loading state */}
          {loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid var(--primary)",
                  borderTopColor: "transparent",
                  borderRadius: "var(--radius-full)",
                  animation: "spin 1s linear infinite",
                }}
              />
                 {lt("后台分析运行中，预计需要 1-2 分钟；完成后将自动刷新本页结果。", "Background analysis is running and usually takes 1-2 minutes. Results will refresh automatically.")}
            </div>
          )}

          {insightReady && summaryScore != null && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "16px 18px",
                marginBottom: 14,
                borderRadius: "var(--radius-xl)",
                background: "var(--bg-gray)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    margin: "0 0 4px",
                    fontWeight: 700,
                  }}
                >
                  {lt("综合评分", "Overall Score")}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 4,
                    color: summaryScoreColor,
                    fontFamily: "var(--font-display)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 42,
                      fontWeight: 900,
                      lineHeight: 1,
                    }}
                  >
                    {summaryScore}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 800 }}>/100</span>
                </div>
              </div>
              <strong
                style={{
                  color: summaryScoreColor,
                  fontSize: 18,
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                {marketDirection}
              </strong>
            </div>
          )}

          {/* Description text */}
          {insightReady ? (
            <p className="ai-insight-summary-copy">{renderInsightText(summaryBodyText)}</p>
          ) : (
            <div className={`ai-insight-empty-state ${loading ? "is-running" : ""}`}>
              <div className="ai-insight-empty-visual" aria-hidden="true">
                <span /><span /><span /><span /><span />
                <Sparkles size={20} />
              </div>
              <div>
                <strong>{loading ? lt("正在构建市场画像", "Building the market profile") : lt("等待生成市场洞察", "Ready to generate market insights")}</strong>
                <p>{loading ? lt("模型正在读取市场宽度、行业表现、估值与风险数据，通常需要 1-2 分钟。", "The model is reading breadth, sector, valuation and risk data. This usually takes 1-2 minutes.") : lt("触发后将生成趋势、动量、估值、情绪与风险五维分析。", "Run analysis to generate trend, momentum, valuation, sentiment and risk views.")}</p>
              </div>
            </div>
          )}

          {/* Dimension scores (when analysis done) */}
          {insightReady && (
            <div
                className="ai-dimension-score-list"
            >
              {dimensionRows.map((item) => {
                const badge =
                  DIMENSION_BADGES[item.dimension] || {
                    color:
                      DIMENSION_COLORS[item.dimension] ||
                      getScoreColor(item.score),
                    bg: "var(--bg-gray)",
                    border: "var(--border-light)",
                  };
                return (
                <div
                  key={item.dimension}
                  className="ai-dimension-score-row"
                >
                  <div className="ai-dimension-score-badge">
                    <p
                      style={{
                        fontSize: 11,
                        color: badge.color,
                        margin: "0 0 4px",
                        fontWeight: 800,
                      }}
                    >
                      {dimensionLabel(item.dimension, lt)}
                    </p>
                    <p
                      style={{
                        fontSize: 21,
                        fontWeight: 850,
                        fontFamily: "var(--font-display)",
                        color: badge.color,
                        background: badge.bg,
                        border: `1px solid ${badge.border}`,
                        borderRadius: "var(--radius-lg)",
                        padding: "5px 8px",
                        margin: 0,
                        lineHeight: 1.05,
                      }}
                    >
                      {item.score}
                    </p>
                  </div>
                  <p className="ai-dimension-score-summary">
                    {renderInsightText(item.summary)}
                  </p>
                </div>
                );
              })}
            </div>
          )}

          {/* Metric pills */}
          <div className="ai-metric-pills">
            <div className="ai-metric-pill">
              <span className="ai-metric-pill-label">{lt("综合评分", "Overall Score")}</span>
              <span
                className="ai-metric-pill-value"
                style={{
                  color: overallScoreColor,
                  fontSize: 28,
                  fontWeight: 850,
                  lineHeight: 1,
                }}
              >
                {overallScore == null ? lt("待生成", "Pending") : `${overallScore}/100`}
              </span>
            </div>
            <div className="ai-metric-pill">
              <span className="ai-metric-pill-label">{lt("当前维度", "Dimensions")}</span>
              <span
                className="ai-metric-pill-value"
                style={{
                  color: "var(--primary)",
                  fontSize: 22,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {lt("5项", "5 items")}
              </span>
            </div>
            <div className="ai-metric-pill">
              <span className="ai-metric-pill-label">{lt("风险评分", "Risk Score")}</span>
              <span
                className="ai-metric-pill-value"
                style={{
                  color: riskScoreColor,
                  fontSize: 22,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {riskScore == null ? lt("待生成", "Pending") : `${riskScore}/100`}
              </span>
            </div>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              margin: "10px 0 0",
              lineHeight: 1.5,
            }}
          >
            {lt(
              `当前分析维度：趋势 / 动量 / 估值 / 情绪 / 风险。数据来源：${insightDataSource}；更新时间：${insightDataDate}。方法局限：评分依赖数据库字段完整性和公开数据时效。`,
              `Current dimensions: Trend / Momentum / Valuation / Sentiment / Risk. Data source: ${insightDataSource}; updated: ${insightDataDate}. Limitation: scores depend on database completeness and public data freshness.`,
            )}
          </p>

          {taskId && (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: "12px 0 0",
              }}
            >
              {lt("任务编号：", "Task ID: ")}{taskId}
            </p>
          )}
        </div>

        {/* ── Radar Chart ── */}
        <div
          className="ai-radar-card"
          style={{
            background: "var(--bg-white)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-2xl)",
            padding: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            minHeight: 430,
            overflow: "hidden",
          }}
        >
          <div ref={chartRef} className="w-full" style={{ width: "100%", height: 390 }} />
          {!insightReady && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                pointerEvents: "none",
              }}
            >
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                 {lt("点击「触发分析」启动雷达图", "Click Run Analysis to start the radar chart")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Market Thermometer ── */}
      <button
        type="button"
        className="ai-thermometer-card"
        onClick={openSectorMap}
        aria-label={lt("打开全部板块星图", "Open full sector map")}
      >
        {temp ? (
          <>
            <div className="ai-thermometer-header">
              <div>
                <span className="ai-thermometer-kicker">
                  {lt("市场温度计", "Market Thermometer")}
                </span>
                <h3>{thermometerTone.label}</h3>
                <p>
                  {temp.data_date || temp.market_amount_date || temp.market_volume_date || "--"}
                  {" · "}
                  {marketTemperatureSourceLabel(temp.source, lt)}
                  {temp.refresh_queued ? ` · ${lt("后台刷新中", "Refreshing in background")}` : ""}
                </p>
              </div>
              <div className={`ai-thermometer-status ${thermometerTone.cls}`}>
                <strong>{risingRatio.toFixed(1)}%</strong>
                <span>{thermometerTone.detail}</span>
              </div>
            </div>

            <div className="ai-temperature-breadth">
              <div className="ai-temperature-bar" aria-hidden="true">
                <i className="up" style={{ width: `${Math.max(0, risingRatio)}%` }} />
                <i className="flat" style={{ width: `${Math.max(0, flatRatio)}%` }} />
                <i className="down" style={{ width: `${Math.max(0, fallingRatio)}%` }} />
              </div>
              <div className="ai-temperature-bar-labels">
                <span className="up">{lt("上涨", "Rising")} {Number(temp.rise_count || 0).toLocaleString("zh-CN")}</span>
                <span className="flat">{lt("平盘", "Flat")} {flatCount.toLocaleString("zh-CN")}</span>
                <span className="down">{lt("下跌", "Falling")} {Number(temp.fall_count || 0).toLocaleString("zh-CN")}</span>
              </div>
            </div>

            <div className="ai-temperature-metrics">
              <div>
                <span>{lt("上涨比率", "Rising Ratio")}</span>
                <strong className="up">{risingRatio.toFixed(1)}%</strong>
              </div>
              <div>
                <span>{lt("下跌比率", "Falling Ratio")}</span>
                <strong className="down">{fallingRatio.toFixed(1)}%</strong>
              </div>
              <div>
                <span>{lt("平均涨跌", "Average Change")}</span>
                <strong className={Number(temp.avg_change || 0) >= 0 ? "up" : "down"}>
                  {formatSignedPct(temp.avg_change)}
                </strong>
              </div>
              <div>
                <span>{lt(definition.turnoverLabelZh, definition.turnoverLabelEn)}</span>
                <strong
                  className={
                    marketAmountDirection === "up"
                      ? "up"
                      : marketAmountDirection === "down"
                        ? "down"
                        : ""
                  }
                >
                  {formatAiAmount(marketAmountValue)}
                </strong>
                <small>
                  {marketVolumeChangeText !== "--"
                    ? `${marketVolumeLabel} ${marketVolumeChangeText}`
                    : lt("暂无对比", "No comparison")}
                </small>
              </div>
            </div>

            <div className="ai-temperature-section-title">
              <strong>{lt("重点板块预览", "Key Sector Preview")}</strong>
              <span>{lt("按涨跌幅极值展示，点击查看完整星图", "Shows strongest movers. Click for the full map.")}</span>
            </div>

            <div className="ai-temperature-heatmap">
              {tempEntries.map(([ind, chg]) => {
                const intensity = Math.min(1, Math.abs(chg) / 5);
                return (
                  <div
                    key={ind}
                    className={`ai-temperature-sector ${chg >= 0 ? "up" : "down"}`}
                    style={{ ["--intensity" as string]: `${Math.round((0.14 + intensity * 0.52) * 100)}%` }}
                  >
                    <span>{ind}</span>
                    <strong>{formatSignedPct(chg, 1)}</strong>
                  </div>
                );
              })}
              {tempEntries.length === 0 && (
                <div className="ai-temperature-empty">
                  {tempLoading
                    ? lt("正在生成板块预览...", "Building sector preview...")
                    : tempError || lt("暂无板块温度数据", "No sector temperature data")}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="ai-temperature-empty">
            {tempLoading
              ? lt("市场温度计刷新中...", "Refreshing market thermometer...")
              : tempError || lt("暂无市场温度数据", "No market temperature data")}
          </div>
        )}
        {temp && (
          <span className="ai-temperature-open-hint">
            {lt("点击查看全部板块星图", "Open the full sector map")}
          </span>
        )}
      </button>

      {/* ── AI Watchlist Pool ── */}
      <div style={{ marginBottom: 24 }}>
        <div
          className="ai-recommendation-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-primary)",
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            {lt(alphaSettings.section_title_zh, alphaSettings.section_title_en)}
            <div
              style={{
                display: "flex",
                padding: 3,
                background: "var(--bg-gray)",
                borderRadius: "var(--radius-full)",
                gap: 2,
              }}
            >
              {alphaSettings.schemes.map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    setAlphaStrategy(s.key);
                    loadAlpha(s.key);
                  }}
                  style={{
                    padding: "6px 16px",
                    border: "none",
                    borderRadius: "var(--radius-full)",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "var(--font-primary)",
                    cursor: "pointer",
                    background:
                      alphaStrategy === s.key
                        ? "var(--primary)"
                        : "transparent",
                    color:
                      alphaStrategy === s.key ? "#ffffff" : "var(--text-muted)",
                    transition: "all 0.2s",
                  }}
                >
                  {lt(s.label_zh, s.label_en)}
                </button>
              ))}
            </div>
          </h2>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
            }}
          >
            {lt("排序：策略置信度指数", "Sorted by strategy confidence")}
          </span>
        </div>

        {alphaLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--text-muted)",
              padding: "24px 0",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                border: "2px solid var(--primary)",
                borderTopColor: "transparent",
                borderRadius: "var(--radius-full)",
                animation: "spin 1s linear infinite",
              }}
            />
            {lt("加载中...", "Loading...")}
          </div>
        ) : (
          <>
            {alphaUnlocked && availableAlphaItems.length > 2 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {lt(
                    `当前套餐已解锁 ${availableAlphaItems.length} 个观察样本，当前 ${alphaWindowStart + 1}-${Math.min(alphaWindowStart + 2, availableAlphaItems.length)}`,
                    `Current plan unlocked ${availableAlphaItems.length} observation samples`,
                  )}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setAlphaStart((value) => Math.max(0, value - 2))}
                    disabled={alphaWindowStart === 0}
                    className="figma-btn figma-btn-sm"
                    style={{ width: 34, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    aria-label={lt("查看上一组观察样本", "Previous observation samples")}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAlphaStart((value) =>
                        Math.min(Math.max(0, availableAlphaItems.length - 2), value + 2),
                      )
                    }
                    disabled={alphaWindowStart >= availableAlphaItems.length - 2}
                    className="figma-btn figma-btn-sm"
                    style={{ width: 34, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    aria-label={lt("查看下一组观察样本", "Next observation samples")}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
            <div
              className="ai-recommendation-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}
            >
              {visibleAlphaItems.map((item) => (
                <AlphaCard
                  key={`${item.stock_code}-${item.rank}`}
                  item={item}
                  displayFields={alphaSettings.display_fields}
                  onDetails={() => openAlphaBacktest(item)}
                />
              ))}

            {visibleAlphaItems.length === 0 && !alphaLoading && (
              <div
                style={{
                  background: "var(--bg-white)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-xl)",
                  padding: 20,
                  fontSize: 13,
                  color: "var(--text-muted)",
                }}
              >
                {lt("暂无观察样本", "No observation samples")}
              </div>
            )}

              {!alphaUnlocked && (
                <div
                  style={{
                    background: "var(--bg-white)",
                    border: "1px dashed var(--border)",
                    borderRadius: "var(--radius-xl)",
                    padding: 24,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 238,
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--primary)",
                      margin: "0 0 12px",
                    }}
                  >
                    {lt("AI 观察池需升级套餐", "AI WATCHLIST POOL LOCKED")}
                  </p>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "var(--radius-full)",
                      background: "var(--bg-gray)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                      color: "var(--primary)",
                    }}
                  >
                      <UpgradeSignalIcon />
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      margin: "0 0 16px",
                      textAlign: "center",
                      lineHeight: 1.6,
                    }}
                    onClick={() => navigate("/settings?tab=subscription")}
                  >
                    {lt("普通版不展示观察样本；VIP 解锁 3 个，SVIP 解锁 6 个，系统管理员可查看 12 个。", "Standard users have no observation samples; VIP unlocks 3, SVIP unlocks 6, and admins can view 12.")}
                  </p>
                  <button
                    type="button"
                    style={{
                      padding: "10px 24px",
                      background: "var(--primary)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "var(--radius-full)",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "var(--font-primary)",
                      cursor: "pointer",
                    }}
                  >
                    {lt("升级套餐", "Upgrade Plan")}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Position Exposure & Tactical View ── */}
      <div className="ai-tactical-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Position Exposure */}
        <div
          style={{
            background: "var(--bg-white)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-2xl)",
            padding: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "10%",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                margin: 0,
              }}
            >
               {lt("市场暴露观察", "MARKET EXPOSURE SIGNAL")}
            </p>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                background: adviceLoading ? "var(--primary-light)" : "var(--success-bg)",
                color: adviceLoading ? "var(--primary)" : "var(--success)",
                border: adviceLoading
                  ? "1px solid color-mix(in srgb, var(--brand-accent) 35%, var(--border-light))"
                  : "1px solid var(--success-border)",
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
              }}
            >
              {adviceLoading ? lt("生成中", "Generating") : selectedModel || lt("当前模型", "Current model")}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px 0",
              position: "relative",
            }}
          >
            <svg
              width="120"
              height="120"
              style={{ transform: "rotate(-90deg)" }}
            >
              <circle
                cx="60"
                cy="60"
                fill="none"
                r="48"
                stroke="var(--bg-gray)"
                strokeWidth="10"
              />
              <circle
                cx="60"
                cy="60"
                fill="none"
                r="48"
                stroke="var(--primary)"
                strokeDasharray={2 * Math.PI * 48}
                strokeDashoffset={
                  2 * Math.PI * 48 * (1 - advice.position_ratio)
                }
                strokeWidth="10"
                strokeLinecap="round"
              />
            </svg>
            <div
              style={{
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {Math.round(advice.position_ratio * 100)}%
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                 {lt("信号强度", "Signal")}
              </span>
            </div>
          </div>
          <button
            onClick={refreshAdvice}
            disabled={adviceLoading}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "8px 16px",
              background: "var(--bg-gray)",
              border: "none",
              borderRadius: "var(--radius-full)",
              fontSize: 12,
              color: "var(--text-muted)",
              fontFamily: "var(--font-primary)",
              cursor: adviceLoading ? "not-allowed" : "pointer",
              fontWeight: 500,
              opacity: adviceLoading ? 0.72 : 1,
            }}
          >
             {adviceLoading ? lt("生成观察中...", "Generating...") : lt("刷新观察 · 20积分", "Refresh Signal · 20 credits")}
          </button>
          {adviceTaskId && (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              {lt("观察任务", "Signal Task")} #{adviceTaskId}
            </p>
          )}
        </div>

        {/* Tactical View */}
        <div
          style={{
            background: "var(--bg-white)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-2xl)",
            padding: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "10%",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                margin: 0,
              }}
            >
               {lt("战术视图", "TACTICAL VIEW")}
            </p>
          </div>

          {/* Defensive / Offensive split */}
          <div
            style={{
              display: "flex",
              height: 40,
              borderRadius: "var(--radius-full)",
              overflow: "hidden",
              marginBottom: 20,
              background: "var(--bg-gray)",
            }}
          >
            <div
              style={{
                flex: Math.max(1, offensivePct),
                background: "var(--market-up)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
              }}
            >
               {lt(`进攻 ${offensivePct}%`, `OFFENSIVE ${offensivePct}%`)}
            </div>
            <div
              style={{
                flex: Math.max(1, defensivePct),
                background: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
              }}
            >
               {lt(`防御 ${defensivePct}%`, `DEFENSIVE ${defensivePct}%`)}
            </div>
          </div>

          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.7,
              margin: "0 0 16px",
            }}
          >
            {sanitizeResearchOnlyText(advice.neutral)}
          </p>

          <div style={{ display: "flex", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "var(--radius-full)",
                  background: "var(--market-up)",
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                 {lt("进攻端", "Offense")}: {advice.attack.join(" / ")}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "var(--radius-full)",
                  background: "var(--primary)",
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                 {lt("防御端", "Defense")}: {advice.defense.join(" / ")}
              </span>
            </div>
          </div>
          {(advice.attack_reason || advice.defense_reason) && (
            <div className="ai-tactical-reasons">
              {advice.attack_reason && (
                <p><strong>{lt("进攻依据", "Offense rationale")}</strong>{sanitizeResearchOnlyText(advice.attack_reason)}</p>
              )}
              {advice.defense_reason && (
                <p><strong>{lt("防御依据", "Defense rationale")}</strong>{sanitizeResearchOnlyText(advice.defense_reason)}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ai-compliance-note" role="note">
        {lt(
          "本页面内容由系统基于公开数据、历史行情、因子模型和 AI 分析生成，仅供研究参考，不构成投资建议或交易指令。数据来源、更新时间和缺失项以各模块展示为准。",
          "This page is generated from public data, historical quotes, factor models and AI analysis for research reference only. It is not investment advice or a trading instruction. Data sources, timestamps and missing fields follow each module disclosure.",
        )}
      </div>

      {showSectorMap && (
        <SectorStarMapModal
          entries={Object.entries(temp?.heatmap_data || {})}
          statsByName={temp?.heatmap_stats || {}}
          title={lt(`${definition.labelZh}全部板块星图`, `${definition.labelEn} Sector Map`)}
          stats={{
            riseCount: temp?.rise_count,
            fallCount: temp?.fall_count,
            flatCount,
            totalCount: marketBreadthTotal,
          }}
          loading={tempLoading}
          error={tempError}
          onRefresh={() => void loadMarketTemperature(true)}
          onSelect={(name) => void openSectorDetails(name)}
          onClose={() => setShowSectorMap(false)}
        />
      )}
      {selectedSector && (
        <SectorConstituentModal
          sectorName={selectedSector}
          stocks={sectorStocks}
          loading={sectorStocksLoading}
          error={sectorStocksError}
          selectedStock={sectorChartStock}
          chartData={sectorChartData}
          chartLoading={sectorChartLoading}
          adjustmentMode={sectorChartAdjustment}
          adjustmentStatus={sectorChartAdjustmentStatus}
          onAdjustmentChange={setSectorChartAdjustment}
          onSelectStock={(stock) => void loadSectorStockChart(stock)}
          onClose={() => {
            setSelectedSector("");
            setSectorStocks([]);
            setSectorChartStock(null);
            setSectorChartData([]);
            setSectorChartAdjustmentStatus(null);
            setSectorChartAdjustment("none");
          }}
        />
      )}
      <LongTaskRewardAdModal
        active={loading || adviceLoading}
        taskKey={`ai-insights:${market}:${taskId || adviceTaskId || "starting"}`}
        contextLabel={lt("AI 洞察分析", "AI insight analysis")}
      />
    </div>
  );
}

export default function AiInsightsPage() {
  const lt = useLangText();
  if (COMMUNITY_EDITION) {
    return (
      <CommunityFeatureNotice
        title={lt("AI 市场洞察", "AI Market Insights")}
        description={lt("社区版保留模块入口，但不提供平台内置的 AI 市场洞察能力。", "The module remains visible, but built-in AI market insights are not included in the community edition.")}
        detail={lt("可在自有部署环境接入 AI 服务，并按实际需求实现市场分析、评分与策略逻辑。", "AI services can be connected in a self-hosted environment to implement market analysis, scoring, and strategy logic as needed.")}
      />
    );
  }
  return <AiInsightsPageFull />;
}

// ─── Alpha Card Sub-component ────────────────────────────────────────────────

function UpgradeSignalIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <path d="M15 2.75 25.6 8.9v12.2L15 27.25 4.4 21.1V8.9L15 2.75Z" fill="rgba(217,170,78,.16)" stroke="#2563eb" strokeWidth="1.5" />
      <path d="m8.7 18.9 4.25-4.2 3.05 2.35 5.35-6.15" stroke="#dc2626" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.2 10.9h3.15v3.15" stroke="#dc2626" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12.95" cy="14.7" r="1.15" fill="#2563eb" />
    </svg>
  );
}

function AlphaCard({
  item,
  displayFields,
  onDetails,
}: {
  item: AlphaItem;
  displayFields: string[];
  onDetails: () => void;
}) {
  const lt = useLangText();
  const [statusText, setStatusText] = useState("");
  const showScore = displayFields.includes("score");
  const showLogic = displayFields.includes("logic");
  const showPricePlan = displayFields.includes("price_plan");
  const currencySymbol = item.currency_symbol || "¥";
  const componentLabels: Record<string, [string, string]> = {
    change: ["涨跌", "Change"],
    liquidity: ["流动性", "Liquidity"],
    valuation: ["估值", "Valuation"],
    turnover: ["换手", "Turnover"],
    ma: ["趋势", "Trend"],
    quality: ["质量", "Quality"],
  };
  const topContributions = Object.entries(item.score_breakdown || {})
    .sort(([, left], [, right]) => Number(right.contribution || 0) - Number(left.contribution || 0))
    .slice(0, 3);
  const addToWatchlist = async () => {
    try {
      await api.addToWatchlist({
        group_name: "AI观察池",
        code: item.stock_code,
        name: item.stock_name,
      });
      setStatusText(lt("已加入自选", "Added to watchlist"));
    } catch (error: any) {
      setStatusText(error?.message || lt("加入自选失败", "Failed to add"));
    }
  };
  return (
    <div
      style={{
        background: "var(--bg-white)",
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius-xl)",
        padding: 20,
        borderTop: "2px solid var(--primary)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <div>
          <h4
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {item.stock_name}
          </h4>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-muted)",
              margin: "2px 0 0",
            }}
          >
            {item.stock_code}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ color: "#facc15", fontSize: 12 }}>
            {"★".repeat(item.stars)}
            {"☆".repeat(5 - item.stars)}
          </span>
          {showScore && typeof item.score === "number" && (
            <p
              style={{
                margin: "4px 0 0",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--primary)",
                fontWeight: 700,
              }}
            >
              {item.score.toFixed(1)}
            </p>
          )}
        </div>
      </div>
      {showLogic && (
        <>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              margin: "0 0 10px",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--primary)", marginRight: 4 }}>
              {lt("观察理由：", "Observation rationale:")}
            </span>
            {sanitizeResearchOnlyText(lt(item.ai_logic, item.ai_logic_en || item.ai_logic))}
          </p>
          {topContributions.length > 0 && (
            <div className="ai-alpha-score-breakdown">
              {topContributions.map(([key, value]) => (
                <span key={key}>
                  {lt(componentLabels[key]?.[0] || key, componentLabels[key]?.[1] || key)}
                  <strong>{Number(value.score || 0).toFixed(0)}</strong>
                  <small>{Math.round(Number(value.weight || 0) * 100)}%</small>
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {showPricePlan && <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}
      >
        {[
          {
             label: lt("参考收盘", "Close"),
            value: `${currencySymbol}${item.buy_price?.toFixed(2)}`,
            color: "var(--text-primary)",
          },
          {
             label: lt("观察评分", "Score"),
            value: typeof item.score === "number" ? item.score.toFixed(1) : "--",
            color: "var(--primary)",
          },
          {
             label: lt("数据源", "Source"),
            value: item.signal_source === "latest_daily_price" ? lt("最新日线", "Latest Daily") : lt("系统样本", "System Sample"),
            color: "var(--text-muted)",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              textAlign: "center",
              padding: 8,
              background: "var(--bg-gray)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <p
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              {label}
            </p>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 14,
                fontWeight: 600,
                color,
                margin: "2px 0 0",
              }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={addToWatchlist}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "var(--bg-gray)",
            border: "none",
            borderRadius: "var(--radius-full)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-primary)",
            fontFamily: "var(--font-primary)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Plus size={14} />
          {lt("加入自选", "Watchlist")}
        </button>
        <button
          type="button"
          onClick={onDetails}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "transparent",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-full)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--primary)",
            fontFamily: "var(--font-primary)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Eye size={14} />
          {lt("查看详情", "Details")}
        </button>
      </div>
      {statusText && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: statusText.includes("失败") || statusText.includes("Failed")
              ? "var(--danger)"
              : "var(--success)",
          }}
        >
          {statusText}
        </div>
      )}
    </div>
  );
}

function SectorConstituentModal({
  sectorName,
  stocks,
  loading,
  error,
  selectedStock,
  chartData,
  chartLoading,
  adjustmentMode,
  adjustmentStatus,
  onAdjustmentChange,
  onSelectStock,
  onClose,
}: {
  sectorName: string;
  stocks: SectorStock[];
  loading: boolean;
  error?: string;
  selectedStock: SectorStock | null;
  chartData: KLinePoint[];
  chartLoading: boolean;
  adjustmentMode: KLineAdjustmentMode;
  adjustmentStatus: KLineAdjustmentStatus | null;
  onAdjustmentChange: (mode: KLineAdjustmentMode) => void;
  onSelectStock: (stock: SectorStock) => void;
  onClose: () => void;
}) {
  const lt = useLangText();
  const { definition } = useMarket();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="ai-sector-constituent-mask" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="ai-sector-constituent-modal" role="dialog" aria-modal="true" aria-label={sectorName}>
        <header className="ai-sector-constituent-header">
          <div>
            <span>{lt("板块成分股", "Sector Constituents")}</span>
            <h2>{sectorName}</h2>
            <small>{stocks.length ? `${stocks.length} ${lt("只标的 · 按当日涨幅排序", "symbols · sorted by daily change")}` : lt("在线数据服务 · 最新交易日", "Online data service · latest trading day")}</small>
          </div>
          <button type="button" onClick={onClose} aria-label={lt("关闭", "Close")}><X size={20} /></button>
        </header>
        <div className="ai-sector-constituent-layout">
          <section className="ai-sector-constituent-list">
            <div className="ai-sector-constituent-list-head">
              <strong>{lt("个股涨幅", "Constituent Changes")}</strong>
              <span>{stocks.length}</span>
            </div>
            {loading ? (
              <div className="ai-sector-constituent-empty">{lt("正在加载板块个股...", "Loading constituents...")}</div>
            ) : error ? (
              <div className="ai-sector-constituent-empty is-error">{error}</div>
            ) : stocks.length ? (
              <div className="ai-sector-constituent-scroll">
                {stocks.map((stock, index) => (
                  <button
                    key={`${stock.code}-${index}`}
                    type="button"
                    className={`ai-sector-constituent-row ${selectedStock?.code === stock.code ? "active" : ""}`}
                    onClick={() => onSelectStock(stock)}
                  >
                    <span className="ai-sector-constituent-rank">{index + 1}</span>
                    <span className="ai-sector-constituent-name"><strong>{stock.name || "--"}</strong><small>{stock.code} · {stock.exchange || stock.board || "--"}</small></span>
                    <span className={Number(stock.change_pct || 0) >= 0 ? "market-up" : "market-down"}>{Number(stock.change_pct || 0) >= 0 ? "+" : ""}{Number(stock.change_pct || 0).toFixed(2)}%</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="ai-sector-constituent-empty">{lt("暂无板块成分股数据", "No constituent data")}</div>
            )}
          </section>
          <section className="ai-sector-constituent-chart">
            <div className="ai-sector-constituent-chart-head">
              <div><strong>{selectedStock?.name || lt("选择个股查看走势", "Select a stock to view trend")}</strong><small>{selectedStock?.code || "--"}</small></div>
              {selectedStock?.change_pct != null && <b className={Number(selectedStock.change_pct) >= 0 ? "market-up" : "market-down"}>{Number(selectedStock.change_pct) >= 0 ? "+" : ""}{Number(selectedStock.change_pct).toFixed(2)}%</b>}
            </div>
            {chartLoading ? (
              <div className="ai-sector-constituent-chart-empty">{lt("K线加载中...", "Loading K-line...")}</div>
            ) : selectedStock && chartData.length ? (
              <KLineChart
                data={chartData}
                height="100%"
                initialVisibleBars={180}
                title={`${selectedStock.code} ${selectedStock.name}`}
                emptyText={lt("暂无K线数据", "No K-line data")}
                adjustmentMode={adjustmentMode}
                adjustmentStatus={adjustmentStatus}
                onAdjustmentChange={onAdjustmentChange}
              />
            ) : (
              <div className="ai-sector-constituent-chart-empty">{lt("请选择左侧个股查看K线", "Select a constituent to view its K-line")}</div>
            )}
            {selectedStock && (
              <div className="ai-sector-constituent-metrics">
                <span>{lt("最新价", "Price")} <strong>{selectedStock.price == null ? "--" : `${definition.currencySymbol}${Number(selectedStock.price).toFixed(2)}`}</strong></span>
                <span>{lt("成交额", "Amount")} <strong>{selectedStock.amount == null ? "--" : Number(selectedStock.amount).toLocaleString()}</strong></span>
                <span>{lt("市值", "M.Cap")} <strong>{selectedStock.market_cap == null ? "--" : `${Number(selectedStock.market_cap).toFixed(1)} ${lt(definition.marketCapUnitZh, definition.marketCapUnitEn)}`}</strong></span>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function SectorStarMapModal({
  entries,
  statsByName,
  title,
  stats,
  loading = false,
  error = "",
  onRefresh,
  onSelect,
  onClose,
}: {
  entries: Array<[string, number]>;
  statsByName?: Temp["heatmap_stats"];
  title: string;
  stats?: {
    riseCount?: number;
    fallCount?: number;
    flatCount?: number;
    totalCount?: number;
  };
  loading?: boolean;
  error?: string;
  onRefresh: () => void;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const lt = useLangText();
  const { theme } = useTheme();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const risingLabel = lt("上涨", "Rising");
  const fallingLabel = lt("下跌", "Falling");
  const sortedEntries = useMemo(
    () =>
      entries
        .filter(([name, value]) => name && Number.isFinite(Number(value)))
        .map(([name, value]) => [name, Number(value)] as [string, number])
        .sort((a, b) => b[1] - a[1]),
    [entries],
  );
  const breadthStats = useMemo(() => {
    const rise = Math.max(0, Number(stats?.riseCount) || 0);
    const fall = Math.max(0, Number(stats?.fallCount) || 0);
    const flat = Math.max(0, Number(stats?.flatCount) || 0);
    const total = Math.max(0, Number(stats?.totalCount) || rise + fall + flat);
    if (total > 0) {
      return {
        rise,
        fall,
        flat,
        total,
        riseRatio: (rise / total) * 100,
        fallRatio: (fall / total) * 100,
        flatRatio: (flat / total) * 100,
      };
    }
    const sectorRise = sortedEntries.filter(([, value]) => value > 0).length;
    const sectorFall = sortedEntries.filter(([, value]) => value < 0).length;
    const sectorFlat = sortedEntries.filter(([, value]) => value === 0).length;
    const sectorTotal = sectorRise + sectorFall + sectorFlat;
    return {
      rise: sectorRise,
      fall: sectorFall,
      flat: sectorFlat,
      total: sectorTotal,
      riseRatio: sectorTotal ? (sectorRise / sectorTotal) * 100 : 0,
      fallRatio: sectorTotal ? (sectorFall / sectorTotal) * 100 : 0,
      flatRatio: sectorTotal ? (sectorFlat / sectorTotal) * 100 : 0,
    };
  }, [sortedEntries, stats]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const element = chartRef.current;
    if (!element || !sortedEntries.length) return;
    const chart = echarts.init(element);
    let disposed = false;
    let secondFrame = 0;
    const resizeChart = () => {
      if (disposed) return;
      chart.resize();
    };
    const firstFrame = window.requestAnimationFrame(() => {
      resizeChart();
      secondFrame = window.requestAnimationFrame(() => {
        resizeChart();
      });
    });
    const settleTimer = window.setTimeout(() => {
      resizeChart();
    }, 120);
    const observer = new ResizeObserver(resizeChart);
    observer.observe(element);
    const dark = theme === "dark";
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        formatter: (params: any) => {
          const change = Number(params?.data?.change || 0);
          const rowStats = statsByName?.[params?.name || ""];
          const total = Number(rowStats?.total_count || 0);
          const ratioText = total
            ? `<br/>${risingLabel} ${Number(rowStats?.rise_ratio || 0).toFixed(1)}% · ${fallingLabel} ${Number(rowStats?.fall_ratio || 0).toFixed(1)}%`
            : "";
          return `${params?.name || ""}<br/><strong>${change >= 0 ? "+" : ""}${change.toFixed(2)}%</strong>${ratioText}`;
        },
        backgroundColor: dark ? "rgba(17,19,22,.97)" : "rgba(255,255,255,.98)",
        borderColor: dark ? "rgba(255,255,255,.16)" : "rgba(113,110,98,.24)",
        textStyle: { color: dark ? "#f5f3eb" : "#2d2b26" },
      },
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          animationDuration: 520,
          animationEasing: "cubicOut",
          visibleMin: 1,
          label: {
            show: true,
            formatter: (params: any) => {
              const change = Number(params?.data?.change || 0);
              return `${params?.name || ""}\n${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
            },
            color: "#fff",
            fontWeight: 800,
            lineHeight: 18,
            overflow: "truncate",
          },
          upperLabel: { show: false },
          itemStyle: {
            borderColor: dark ? "#17181b" : "#ffffff",
            borderWidth: 3,
            gapWidth: 2,
          },
          data: sortedEntries.map(([name, change]) => {
            const intensity = Math.min(1, Math.abs(change) / 6);
            const color =
              change >= 0
                ? `rgba(190, 28, 28, ${0.5 + intensity * 0.48})`
                : `rgba(21, 128, 61, ${0.5 + intensity * 0.48})`;
            return {
              name,
              change,
              value: Math.max(1, 18 + Math.abs(change) * 9),
              itemStyle: { color },
            };
          }),
        },
      ],
    });
    const handleChartClick = (params: any) => {
      const name = String(params?.name || "").trim();
      if (name) onSelect(name);
    };
    chart.on("click", handleChartClick);
    window.addEventListener("resize", resizeChart);
    return () => {
      disposed = true;
      observer.disconnect();
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settleTimer);
      window.removeEventListener("resize", resizeChart);
      chart.off("click", handleChartClick);
      chart.dispose();
    };
  }, [sortedEntries, statsByName, theme, risingLabel, fallingLabel, onSelect]);

  return (
    <div
      className="ai-sector-map-mask"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="ai-sector-map-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <h2>{title}</h2>
            <p>
              {lt(
                `覆盖 ${sortedEntries.length} 个板块，红色上涨、绿色下跌；点击任一板块可查看个股与K线。`,
                `${sortedEntries.length} sectors. Red indicates gains and green losses. Select a sector to inspect constituents and charts.`,
              )}
            </p>
          </div>
          <div className="ai-sector-map-header-actions">
            <div
              className="ai-sector-map-mini-stats"
              aria-label={lt("板块上涨、平盘和下跌比例", "Sector rising, flat and falling ratios")}
            >
              <span className="up">
                {lt("上涨", "Rising")}
                <strong>{breadthStats.riseRatio.toFixed(1)}%</strong>
                <em>{breadthStats.rise.toLocaleString()}</em>
              </span>
              <span className="flat">
                {lt("平盘", "Flat")}
                <strong>{breadthStats.flatRatio.toFixed(1)}%</strong>
                <em>{breadthStats.flat.toLocaleString()}</em>
              </span>
              <span className="down">
                {lt("下跌", "Falling")}
                <strong>{breadthStats.fallRatio.toFixed(1)}%</strong>
                <em>{breadthStats.fall.toLocaleString()}</em>
              </span>
            </div>
            <button
              type="button"
              className="ai-sector-map-refresh"
              onClick={onRefresh}
              disabled={loading}
              aria-label={lt("刷新板块星图", "Refresh sector map")}
              title={lt("刷新板块星图", "Refresh sector map")}
            >
              <RefreshCcw size={16} />
              <span>{loading ? lt("刷新中", "Refreshing") : lt("刷新", "Refresh")}</span>
            </button>
            <button type="button" onClick={onClose} aria-label={lt("关闭", "Close")}>
              <X size={20} />
            </button>
          </div>
        </header>
        {sortedEntries.length ? (
          <div className="ai-sector-map-chart-shell">
            <div ref={chartRef} className="ai-sector-map-chart" />
            {loading && (
              <div className="ai-sector-map-refreshing">
                <RefreshCcw size={14} />
                {lt("正在同步最新板块数据", "Syncing latest sector data")}
              </div>
            )}
          </div>
        ) : (
          <div className="ai-sector-map-empty">
            {loading
              ? lt("正在刷新板块星图...", "Refreshing sector map...")
              : error || lt("暂无板块数据", "No sector data")}
          </div>
        )}
      </section>
    </div>
  );
}
