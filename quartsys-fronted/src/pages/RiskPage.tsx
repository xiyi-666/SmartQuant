import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import * as echarts from "echarts";
import { api } from "../api";
import { useLangText } from "../shared/language";
import { useMarket } from "../shared/market";
import { readUserPageCache, userScopedStorageKey, writeUserPageCache } from "../shared/pageCache";
import { useTheme } from "../shared/theme";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RiskTrendPoint {
  date: string;
  value: number;
}

interface RiskEvent {
  time: string;
  title: string;
  desc: string;
  level: "info" | "warning" | "error";
  tags: string[];
  source_url?: string;
  evidence?: Array<{ title: string; time?: string; source?: string; url?: string }>;
}

type SourceKind = "real" | "local_cache" | "unavailable" | "fallback";

interface RiskComponent {
  key: string;
  name: string;
  score: number | null;
  weight: number;
  value: string;
  source?: string;
  source_kind?: SourceKind;
  source_label: string;
  status: string;
  updated_at?: string;
  detail?: string;
  provider?: string;
  source_url?: string;
  evidence?: Array<{ title: string; time?: string; source?: string; url?: string }>;
}

interface FlowSummary {
  inflow: number | null;
  outflow: number | null;
  net: number | null;
  display_value?: string;
  channels: {
    name: string;
    value: number;
    display_value?: string;
    metric_key?: string;
    metric_label?: string;
    signed?: boolean;
  }[];
  source_label?: string;
  source_kind?: string;
  provider?: string;
  provider_key?: string;
  source_url?: string;
  status?: string;
  detail?: string;
  metrics?: {
    reported_day_net?: number;
    remaining_quota?: number;
    daily_quota?: number;
    month_net?: number;
    year_net?: number;
    cumulative_net?: number;
    buy_amount?: number;
    sell_amount?: number;
    turnover?: number;
    previous_turnover?: number;
    turnover_change?: number;
    turnover_change_pct?: number;
  };
}

interface StockFlowItem {
  code: string;
  name: string;
  price?: number | null;
  change_pct?: number | null;
  main_net: number;
  super_large_net?: number;
  large_net?: number;
  medium_net?: number;
  small_net?: number;
  updated_at?: string | null;
}

interface FundFlowData {
  northbound?: FlowSummary;
  southbound?: FlowSummary;
  market_main_flow?: FlowSummary;
  sectors?: { name: string; value: number }[];
  stock_flows?: StockFlowItem[];
  flow_disclosure_note?: string;
  nodes: { name: string }[];
  links: { source: string; target: string; value: number }[];
  status?: string;
  source?: string;
  source_kind?: string;
  source_label?: string;
  sector_source_kind?: string;
  sector_source_label?: string;
  sector_provider?: string;
  trade_date?: string;
}

interface SystemicRiskData {
  score: number | null;
  label: string;
  status: string;
  source_kind?: SourceKind;
  source_label: string;
  updated_at?: string;
  formula?: string;
  components: RiskComponent[];
  data_quality?: {
    real: number;
    local_cache: number;
    unavailable?: number;
    fallback: number;
  };
}

type LangTextFn = (zh: string, en: string) => string;

type RiskPageCacheSnapshot = {
  trend: RiskTrendPoint[];
  events: RiskEvent[];
  assessment: string;
  systemicRisk: SystemicRiskData | null;
  fundFlow: FundFlowData | null;
};

const RISK_PAGE_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function riskColor(value: number): string {
  if (value < 30) return "#4ade80";
  if (value < 60) return "#facc15";
  if (value < 80) return "#fb923c";
  return "#f87171";
}

function riskLabel(value: number, lt: LangTextFn): string {
  if (value < 30) return lt("低风险", "Low risk");
  if (value < 60) return lt("中风险", "Medium risk");
  if (value < 80) return lt("较高风险", "Elevated risk");
  return lt("高风险", "High risk");
}

const RISK_TEXT_REPLACEMENTS: Array<[string, string]> = [
  ["真实数据", "Real data"],
  ["真实", "Real"],
  ["系统数据", "System data"],
  ["系统数据", "System data"],
  ["兜底估算", "No data"],
  ["兜底", "No data"],
  ["待同步", "Data pending"],
  ["等待数据", "Waiting for data"],
  ["暂无数据", "No data"],
  ["数据暂不可用", "Data unavailable"],
  ["买入金额", "Buy amount"],
  ["成交额变化率", "Turnover change %"],
  ["成交额变化", "Turnover change"],
  ["成交额较上一交易日", "Turnover vs previous trading day"],
  ["成交额暂未披露", "Turnover unavailable"],
  ["成交额", "Turnover"],
  ["上一交易日", "Previous trading day"],
  ["当日净流向未披露", "Daily net flow undisclosed"],
  ["净额", "Net"],
  ["市场宽度", "Market Breadth"],
  ["市场适用的跨境资金", "Applicable Cross-border Flow"],
  ["全市场板块资金流", "Full-market Sector Flow"],
  ["市场宏观金融数据", "Market-specific Macro Data"],
  ["北向资金", "Northbound Flow"],
  ["南向资金", "Southbound Flow"],
  ["板块资金流", "Sector Flow"],
  ["指数波动率", "Index Volatility"],
  ["宏观金融数据", "Macro Financial Data"],
  ["地缘政治/政策事件", "Geopolitical/Policy Events"],
  ["地缘政治事件", "Geopolitical Events"],
  ["政策事件", "Policy Events"],
  ["低风险", "Low risk"],
  ["中风险", "Medium risk"],
  ["较高风险", "Elevated risk"],
  ["高风险", "High risk"],
];

function translateRiskText(
  value: string | undefined | null,
  lt: LangTextFn,
  hundredMillionUnit = "",
): string {
  if (!value) return "";
  const translated = RISK_TEXT_REPLACEMENTS.reduce(
    (text, [zh, en]) => text.split(zh).join(lt(zh, en)),
    String(value),
  );
  return hundredMillionUnit
    ? translated.replace(/亿/g, hundredMillionUnit)
    : translated;
}

function formatSignedYi(
  value: number | undefined,
  unit: string,
): string {
  const safeValue = Number.isFinite(value) ? Number(value) : 0;
  return `${safeValue >= 0 ? "+" : ""}${safeValue.toFixed(2)} ${unit}`;
}

function formatFlowYi(
  value: number | null | undefined,
  displayValue: string | undefined,
  lt: LangTextFn,
  unit: string,
): string {
  if (displayValue) return translateRiskText(displayValue, lt, unit);
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return lt("暂无数据", "No data");
  }
  return formatSignedYi(Number(value), unit);
}

function formatFlowAmount(
  value: number | null | undefined,
  displayValue: string | undefined,
  lt: LangTextFn,
  unit: string,
  signed = true,
): string {
  if (displayValue) return translateRiskText(displayValue, lt, unit);
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return lt("暂无数据", "No data");
  }
  const numericValue = Number(value);
  if (!signed) return `${numericValue.toFixed(2)} ${unit}`;
  return formatSignedYi(numericValue, unit);
}

function formatFlowHeadline(
  flow: FlowSummary | undefined,
  value: number | null | undefined,
  lt: LangTextFn,
  unit: string,
): string {
  if (flow?.display_value) return translateRiskText(flow.display_value, lt, unit);
  const changePct = flow?.metrics?.turnover_change_pct;
  const change = flow?.metrics?.turnover_change;
  if (
    changePct !== null &&
    changePct !== undefined &&
    Number.isFinite(Number(changePct)) &&
    change !== null &&
    change !== undefined &&
    Number.isFinite(Number(change))
  ) {
    return `${lt("成交额", "Turnover")} ${Number(change) >= 0 ? "+" : ""}${Number(change).toFixed(2)} ${unit} / ${Number(changePct) >= 0 ? "+" : ""}${Number(changePct).toFixed(2)}%`;
  }
  return formatFlowYi(value, undefined, lt, unit);
}

function fundFlowSourceText(
  fundFlow: FundFlowData | null,
  lt: LangTextFn,
  market: string,
): string {
  if (!fundFlow) return lt("等待数据", "Waiting for data");
  const north = translateRiskText(fundFlow.northbound?.source_label || "等待数据", lt);
  const south = translateRiskText(fundFlow.southbound?.source_label || "等待数据", lt);
  const sector = translateRiskText(fundFlow.sector_source_label || "等待数据", lt);
  if (market === "US") return `${lt("板块", "Sector")} ${sector}`;
  if (market === "HK") {
    return `${lt("南向", "Southbound")} ${south} / ${lt("板块", "Sector")} ${sector}`;
  }
  return `${lt("北向", "Northbound")} ${north} / ${lt("南向", "Southbound")} ${south} / ${lt("板块", "Sector")} ${sector}`;
}

function friendlyFlowProvider(provider: string | undefined, lt: LangTextFn): string {
  const value = String(provider || "").trim();
  if (!value) return lt("等待数据", "Waiting for data");
  if (value === "eastmoney.kamt" || value === "东方财富互联互通") {
    return lt("东方财富互联互通", "Eastmoney Stock Connect");
  }
  if (value === "东方财富大盘资金") {
    return lt("东方财富大盘资金", "Eastmoney Market Flow");
  }
  return value;
}

function sourceBadgeStyle(sourceKind?: string): CSSProperties {
  if (sourceKind === "real") {
    return {
      background: "var(--success-bg)",
      border: "1px solid var(--success-border)",
      color: "var(--success)",
    };
  }
  if (sourceKind === "local_cache") {
    return {
      background: "var(--primary-light)",
      border: "1px solid var(--border-light)",
      color: "var(--primary)",
    };
  }
  if (sourceKind === "unavailable") {
    return {
      background: "rgba(107,114,128,0.1)",
      border: "1px solid rgba(107,114,128,0.2)",
      color: "var(--text-muted)",
    };
  }
  return {
    background: "var(--danger-bg)",
    border: "1px solid var(--border-light)",
    color: "var(--danger)",
  };
}

function formatSourceQuality(
  quality: SystemicRiskData["data_quality"] | undefined,
  fallbackText?: string,
  lt?: LangTextFn,
): string {
  const text = lt || ((zh: string) => zh);
  if (!quality) return fallbackText ? translateRiskText(fallbackText, text) : text("等待数据", "Waiting for data");
  const parts = [
    `${text("真实", "Real")} ${quality.real}`,
    `${text("系统数据", "System data")} ${quality.local_cache}`,
  ];
  if (quality.unavailable) parts.push(`${text("待同步", "Data pending")} ${quality.unavailable}`);
  if (quality.fallback) parts.push(`${text("无数据", "No data")} ${quality.fallback}`);
  return parts.join(" / ");
}

const DEFAULT_RISK_WATCHED_SECTORS = ["半导体", "人工智能", "新能源"];

function normalizeRiskSectors(
  value: unknown,
  fallback: string[] = DEFAULT_RISK_WATCHED_SECTORS,
): string[] {
  const raw = Array.isArray(value) ? value : [];
  const result: string[] = [];
  const seen = new Set<string>();
  raw.forEach((item) => {
    const name = String(item || "").trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    result.push(name);
  });
  return result.slice(0, 12).length > 0 ? result.slice(0, 12) : fallback;
}

function loadCachedRiskSectors() {
  try {
    const raw = localStorage.getItem("risk_watched_sectors");
    return raw ? normalizeRiskSectors(JSON.parse(raw)) : DEFAULT_RISK_WATCHED_SECTORS;
  } catch {
    return DEFAULT_RISK_WATCHED_SECTORS;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RiskPage() {
  const lt = useLangText();
  const { market, definition } = useMarket();
  const { theme } = useTheme();
  const flowUnit = lt(
    definition.marketCapUnitZh,
    definition.marketCapUnitEn,
  );
  const riskText = useCallback(
    (value: string | undefined | null) =>
      translateRiskText(value, lt, flowUnit),
    [lt, flowUnit],
  );
  const showNorthbound = market === "CN";
  const showSouthbound = market !== "US";
  // ── State ──
  const [trend, setTrend] = useState<RiskTrendPoint[]>([]);
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [assessment, setAssessment] = useState<string>("");
  const [systemicRisk, setSystemicRisk] = useState<SystemicRiskData | null>(null);
  const [fundFlow, setFundFlow] = useState<FundFlowData | null>(null);
  const [watchedSectors, setWatchedSectors] = useState<string[]>(loadCachedRiskSectors);
  const [sectorOptions, setSectorOptions] = useState<string[]>([]);
  const [riskMonitorConfig, setRiskMonitorConfig] = useState<Record<string, any>>(() => {
    return { watched_sectors: loadCachedRiskSectors() };
  });
  const [newSector, setNewSector] = useState("");
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"1D" | "14D" | "30D">("14D");
  const [cacheHydratedScope, setCacheHydratedScope] = useState("");
  const [sectorSettingsMarket, setSectorSettingsMarket] = useState("");

  // ── Refs for charts ──
  const trendChartRef = useRef<HTMLDivElement>(null);
  const fundFlowChartRef = useRef<HTMLDivElement>(null);
  const trendInstanceRef = useRef<echarts.ECharts | null>(null);
  const fundFlowInstanceRef = useRef<echarts.ECharts | null>(null);
  const riskCacheScope = `${market}:${timeRange}`;

  useEffect(() => {
    let cancelled = false;
    setSectorSettingsMarket("");
    Promise.all([
      api.getRiskMonitorSettings(),
      api.getRiskSectorOptions(market).catch(() => ({ options: [] })),
    ])
      .then(([data, optionPayload]: any[]) => {
        if (cancelled) return;
        const config = data?.config && typeof data.config === "object" ? data.config : {};
        const options = Array.isArray(optionPayload?.options)
          ? optionPayload.options
              .map((item: any) => String(item?.name || "").trim())
              .filter(Boolean)
          : [];
        const configured = config?.market_watched_sectors?.[market];
        const sectors = normalizeRiskSectors(
          Array.isArray(configured) && configured.length
            ? configured
            : market === "CN"
              ? data?.watched_sectors || config.watched_sectors
              : options.slice(0, 3),
          market === "CN" ? DEFAULT_RISK_WATCHED_SECTORS : options.slice(0, 3),
        );
        setSectorOptions(options);
        setRiskMonitorConfig({
          ...config,
          watched_sectors: market === "CN" ? sectors : config.watched_sectors,
          market_watched_sectors: {
            ...(config.market_watched_sectors || {}),
            [market]: sectors,
          },
        });
        setWatchedSectors(sectors);
        localStorage.setItem(`risk_watched_sectors_${market}`, JSON.stringify(sectors));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSectorSettingsMarket(market);
      });
    return () => {
      cancelled = true;
    };
  }, [market]);

  const persistRiskSectors = useCallback(
    async (next: string[]) => {
      const sectors = normalizeRiskSectors(
        next,
        market === "CN" ? DEFAULT_RISK_WATCHED_SECTORS : [],
      );
      const nextConfig = {
        ...riskMonitorConfig,
        watched_sectors: market === "CN" ? sectors : riskMonitorConfig.watched_sectors,
        market_watched_sectors: {
          ...(riskMonitorConfig.market_watched_sectors || {}),
          [market]: sectors,
        },
      };
      setRiskMonitorConfig(nextConfig);
      localStorage.setItem(`risk_watched_sectors_${market}`, JSON.stringify(sectors));
      try {
        const saved: any = await api.saveRiskMonitorSettings(nextConfig);
        if (saved?.config && typeof saved.config === "object") {
          setRiskMonitorConfig(saved.config);
        }
      } catch {
        // 系统数据已更新；后端不可用时下次进入页面会继续尝试同步。
      }
    },
    [market, riskMonitorConfig],
  );

  // ── Data fetching ──
  const loadRiskData = useCallback(async () => {
    setLoading(true);
    try {
      const daysMap = { "1D": 1, "14D": 14, "30D": 30 };
      const days = daysMap[timeRange];
      const [trendData, systemicData, eventsData, fundFlowRaw] =
        await Promise.allSettled([
          api.getRiskTrend(days, market),
          api.getRiskSystemic(watchedSectors, market),
          api.getRiskEvents(market),
          api.getRiskFundFlow(watchedSectors, market),
        ]);

      if (trendData.status === "fulfilled") {
        setTrend(Array.isArray(trendData.value) ? trendData.value : []);
      }
      if (systemicData.status === "fulfilled") {
        const v = systemicData.value;
        setSystemicRisk(
          v && typeof v === "object" && Array.isArray((v as any).components)
            ? (v as SystemicRiskData)
            : null,
        );
      }
      if (eventsData.status === "fulfilled") {
        setEvents(Array.isArray(eventsData.value) ? eventsData.value : []);
      }
      if (fundFlowRaw.status === "fulfilled") {
        const v = fundFlowRaw.value;
        setFundFlow(
          v && typeof v === "object" && Array.isArray((v as any).nodes)
            ? (v as FundFlowData)
            : null,
        );
      }
    } finally {
      setLoading(false);
      setCacheHydratedScope(`${market}:${timeRange}`);
    }
  }, [timeRange, watchedSectors, market]);

  useEffect(() => {
    setCacheHydratedScope("");
    const cached = readUserPageCache<RiskPageCacheSnapshot>(
      "risk-monitor",
      riskCacheScope,
      RISK_PAGE_CACHE_MAX_AGE_MS,
    );
    if (cached?.value) {
      setTrend(Array.isArray(cached.value.trend) ? cached.value.trend : []);
      setEvents(Array.isArray(cached.value.events) ? cached.value.events : []);
      setAssessment(cached.value.assessment || "");
      setSystemicRisk(cached.value.systemicRisk || null);
      setFundFlow(cached.value.fundFlow || null);
      setLoading(false);
      setCacheHydratedScope(riskCacheScope);
      return;
    }
    if (sectorSettingsMarket !== market) return;
    void loadRiskData();
  }, [market, sectorSettingsMarket, timeRange]);

  useEffect(() => {
    if (cacheHydratedScope !== riskCacheScope) return;
    writeUserPageCache<RiskPageCacheSnapshot>("risk-monitor", riskCacheScope, {
      trend,
      events,
      assessment,
      systemicRisk,
      fundFlow,
    });
  }, [
    assessment,
    cacheHydratedScope,
    events,
    fundFlow,
    riskCacheScope,
    systemicRisk,
    trend,
  ]);

  const addWatchedSector = () => {
    const name = newSector.trim();
    if (!name || watchedSectors.includes(name)) return;
    const next = [...watchedSectors, name];
    setWatchedSectors(next);
    void persistRiskSectors(next);
    setNewSector("");
  };

  const removeWatchedSector = (name: string) => {
    const next = watchedSectors.filter((item) => item !== name);
    setWatchedSectors(next);
    void persistRiskSectors(next);
  };

  // ── Derived values ──
  const riskScore =
    typeof systemicRisk?.score === "number" && Number.isFinite(systemicRisk.score)
      ? systemicRisk.score
      : null;
  const rangeLabelZh = timeRange === "1D" ? "当日" : `${timeRange.replace("D", "日")}`;
  const rangeLabelEn = timeRange === "1D" ? "Intraday" : timeRange;
  const northboundNet = fundFlow?.northbound?.net;
  const southboundNet = fundFlow?.southbound?.net;
  const marketMainNet = fundFlow?.market_main_flow?.net;
  const northboundTurnoverChangePct = fundFlow?.northbound?.metrics?.turnover_change_pct;
  const northboundToneValue =
    northboundNet !== null && northboundNet !== undefined
      ? Number(northboundNet)
      : northboundTurnoverChangePct !== null && northboundTurnoverChangePct !== undefined
        ? Number(northboundTurnoverChangePct)
        : null;
  const renderFlowMetrics = (flow: FlowSummary | undefined, title: string) => {
    const metrics = flow?.metrics;
    if (!metrics) return null;
    const rows = [
      { key: "turnover", label: lt("成交额", "Turnover"), value: metrics.turnover, signed: false },
      { key: "previous_turnover", label: lt("上一交易日", "Previous day"), value: metrics.previous_turnover, signed: false },
      { key: "turnover_change", label: lt("成交额变化", "Turnover change"), value: metrics.turnover_change, signed: true },
      { key: "daily_quota", label: lt("每日额度", "Daily quota"), value: metrics.daily_quota, signed: false },
      { key: "remaining_quota", label: lt("剩余额度", "Remaining quota"), value: metrics.remaining_quota, signed: false },
      { key: "month_net", label: lt("月累计", "Monthly cumulative"), value: metrics.month_net, signed: true },
      { key: "year_net", label: lt("年累计", "Yearly cumulative"), value: metrics.year_net, signed: true },
      { key: "cumulative_net", label: lt("历史累计", "All-time cumulative"), value: metrics.cumulative_net, signed: true },
    ].filter((item) => item.value !== null && item.value !== undefined && Number.isFinite(Number(item.value)));
    if (!rows.length) return null;
    return (
      <div className="risk-connect-metrics-wrap">
        <p>{title}</p>
        <div className="risk-connect-metrics">
          {rows.map((item) => (
            <div key={item.key}>
              <span>{item.label}</span>
              <strong className={item.signed ? (Number(item.value) >= 0 ? "text-market-up" : "text-market-down") : ""}>
                {item.signed && Number(item.value) >= 0 ? "+" : ""}{Number(item.value).toFixed(2)} {flowUnit}
              </strong>
            </div>
          ))}
          {metrics.turnover_change_pct !== null &&
            metrics.turnover_change_pct !== undefined &&
            Number.isFinite(Number(metrics.turnover_change_pct)) && (
              <div>
                <span>{lt("成交额变化率", "Turnover change %")}</span>
                <strong className={Number(metrics.turnover_change_pct) >= 0 ? "text-market-up" : "text-market-down"}>
                  {Number(metrics.turnover_change_pct) >= 0 ? "+" : ""}
                  {Number(metrics.turnover_change_pct).toFixed(2)}%
                </strong>
              </div>
            )}
        </div>
      </div>
    );
  };
  const components = systemicRisk?.components || [];
  const quality = systemicRisk?.data_quality;
  const sourceQualityText = formatSourceQuality(quality, systemicRisk?.source_label, lt);
  const assessmentText = assessment
    ? riskText(assessment)
    : lt(
        "社区版不提供官方 AI 风险评估；请使用下方行情、资金流和自定义指标配置。",
        "Official AI risk assessment is not included; use the market, fund-flow and custom indicators below.",
      );

  // ── Trend chart ──
  useEffect(() => {
    if (!trendChartRef.current || trend.length === 0) return;

    if (!trendInstanceRef.current) {
      trendInstanceRef.current = echarts.init(trendChartRef.current);
    }
    const chart = trendInstanceRef.current;
    const dark = theme === "dark";
    const chartText = dark ? "#d4d3cc" : "#44443f";
    const chartMuted = dark ? "#a9afb7" : "#6b6b63";
    const chartBorder = dark ? "rgba(255,255,255,.12)" : "rgba(113,110,98,.18)";
    const tooltipBackground = dark ? "rgba(17,19,22,.97)" : "rgba(255,255,255,.97)";

    const dates = trend.map((p) => p.date);
    const values = trend.map((p) => p.value);

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBackground,
        borderColor: chartBorder,
        borderWidth: 1,
        textStyle: { color: chartText, fontSize: 12 },
        formatter: (params: any) => {
          const p = params[0];
          return `<b>${p.axisValue}</b><br/>${lt("风险值", "Risk score")}: <span style="color:${riskColor(p.value)};font-weight:bold">${p.value}</span>`;
        },
      },
      grid: { top: 20, right: 20, bottom: 30, left: 45 },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: chartBorder } },
        axisLabel: {
          color: chartMuted,
          fontSize: 10,
          formatter: (v: string) => {
            const parts = v.split("-");
            return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : v;
          },
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: chartBorder } },
        axisLabel: { color: chartMuted, fontSize: 10 },
      },
      series: [
        {
          type: "bar",
          data: values.map((v) => ({
            value: v,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 1, 0, 0, [
                { offset: 0, color: "rgba(217,170,78,.26)" },
                { offset: 1, color: "rgba(220,38,38,.88)" },
              ]),
              borderRadius: [3, 3, 0, 0],
            },
          })),
          barWidth: "55%",
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [trend, lt, theme]);

  // ── Fund flow chart ──
  useEffect(() => {
    if (!fundFlowChartRef.current) return;

    if (!fundFlowInstanceRef.current) {
      fundFlowInstanceRef.current = echarts.init(fundFlowChartRef.current);
    }
    const chart = fundFlowInstanceRef.current;
    const dark = theme === "dark";
    const chartText = dark ? "#d4d3cc" : "#44443f";
    const chartMuted = dark ? "#a9afb7" : "#6b6b63";
    const chartBorder = dark ? "rgba(255,255,255,.12)" : "rgba(113,110,98,.18)";
    const tooltipBackground = dark ? "rgba(17,19,22,.97)" : "rgba(255,255,255,.97)";
    chart.clear();

    if (!fundFlow || fundFlow.links.length === 0) {
      chart.setOption({
        backgroundColor: "transparent",
        title: {
          text: lt("暂无资金流向数据", "No fund-flow data"),
          left: "center",
          top: "center",
          textStyle: { color: chartMuted, fontSize: 13, fontWeight: "normal" },
        },
      });
      return;
    }

    const sourceMap = new Map<string, number>();
    for (const link of fundFlow.links) {
      sourceMap.set(
        link.source,
        (sourceMap.get(link.source) || 0) + link.value,
      );
    }

    const sorted = [...sourceMap.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 15);

    const categories = sorted.map(([name]) => name);
    const barValues = sorted.map(([, value]) => value);

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: tooltipBackground,
        borderColor: chartBorder,
        textStyle: { color: chartText, fontSize: 12 },
      },
      grid: { top: 10, right: 30, bottom: 10, left: 90 },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: chartBorder } },
        axisLabel: { color: chartMuted, fontSize: 10 },
      },
      yAxis: {
        type: "category",
        data: categories,
        axisLine: { lineStyle: { color: chartBorder } },
        axisLabel: { color: chartText, fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          data: barValues.map((v) => ({
            value: v,
            itemStyle: {
              color:
                v >= 0
                  ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                      { offset: 0, color: "rgba(239,68,68,0.25)" },
                      { offset: 1, color: "rgba(239,68,68,0.85)" },
                    ])
                  : new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                      { offset: 0, color: "rgba(34,197,94,0.25)" },
                      { offset: 1, color: "rgba(34,197,94,0.85)" },
                    ]),
              borderRadius: [0, 3, 3, 0],
            },
          })),
          barWidth: "60%",
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fundFlow, lt, theme]);

  // ── Cleanup chart instances ──
  useEffect(() => {
    return () => {
      trendInstanceRef.current?.dispose();
      fundFlowInstanceRef.current?.dispose();
    };
  }, []);

  // ── Render ──
  return (
    <div className="risk-page">
      {/* ── Page Header ── */}
      <div className="risk-header">
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 500,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-1%",
            }}
          >
            {lt("系统性风险概览", "Systematic Risk Profile")}
          </h1>
          <p
            style={{
              fontFamily: "var(--font-primary)",
              fontSize: 13,
              color: "var(--text-muted)",
              margin: "4px 0 0",
            }}
          >
            {lt(
              `${definition.labelZh}市场宽度、资金流、指数波动、宏观金融与事件风险的综合监控。`,
              `${definition.labelEn} market breadth, flows, volatility, macro and event risk monitoring.`,
            )}
          </p>
        </div>
        <div className="risk-metrics">
          <div className="risk-metric">
            <p className="risk-metric-label">{lt("综合风险值", "RISK SCORE")}</p>
            <p
              className="risk-metric-value"
              style={{
                color: riskScore === null ? "var(--text-muted)" : riskColor(riskScore),
              }}
            >
              {loading ? "—" : riskScore === null ? lt("无", "N/A") : riskScore.toFixed(1)}
            </p>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {loading
                ? ""
                  : (systemicRisk?.label
                  ? riskText(systemicRisk.label)
                  : riskScore === null
                    ? lt("无数据", "No data")
                    : riskLabel(riskScore, lt))}
            </span>
          </div>
          <div
            style={{
              width: 1,
              height: 32,
              background: "var(--border-light)",
            }}
          />
          <div className="risk-metric">
            <p className="risk-metric-label">{lt("数据源状态", "DATA QUALITY")}</p>
            <p className="risk-metric-value" style={{ color: "var(--text-primary)" }}>
              {loading ? "—" : (riskText(systemicRisk?.source_label) || "—")}
            </p>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {sourceQualityText}
            </span>
          </div>
        </div>
      </div>

      {/* ── VaR Trend Chart Card ── */}
      <div className="risk-var-card">
        <div
          className="risk-trend-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "5%",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            {lt(`${rangeLabelZh}风险值趋势`, `${rangeLabelEn} Risk Trend`)}
          </p>
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: 4,
              background: "var(--bg-gray)",
              borderRadius: "var(--radius-full)",
            }}
          >
            {(["1D", "14D", "30D"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                style={{
                  padding: "5px 12px",
                  border: "none",
                  borderRadius: "var(--radius-full)",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "var(--font-primary)",
                  cursor: "pointer",
                  background:
                    timeRange === t ? "var(--primary)" : "transparent",
                  color: timeRange === t ? "#ffffff" : "var(--text-muted)",
                  transition: "all 0.2s",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div ref={trendChartRef} className="w-full" style={{ height: 210 }} />
        {trend.length === 0 && !loading && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              textAlign: "center",
              padding: "32px 0",
            }}
          >
              {lt("暂无趋势数据", "No trend data")}
          </p>
        )}
      </div>

      <div className="risk-var-card">
        <div
          className="risk-factor-summary-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 14,
          }}
        >
          <div style={{ display: showNorthbound || showSouthbound ? "block" : "none" }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "5%",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                margin: 0,
              }}
            >
              {lt("系统性风险因子拆解", "Systemic Risk Factor Breakdown")}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              {systemicRisk?.formula ? riskText(systemicRisk.formula) : lt(
                "系统性风险 = 市场宽度 + 市场适用的跨境资金 + 全市场板块资金流 + 指数波动率 + 市场宏观金融数据 + 地缘政治事件 + 政策事件",
                "Systemic risk = market breadth + applicable cross-border flow + full-market sector flow + index volatility + market-specific macro data + geopolitical events + policy events",
              )}
            </p>
          </div>
          <span
            style={{
              ...sourceBadgeStyle(systemicRisk?.source_kind),
              borderRadius: "var(--radius-full)",
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {riskText(systemicRisk?.source_label) || lt("等待数据", "Waiting for data")}
          </span>
        </div>
        <div
          className="risk-factor-table-head"
          style={{
            display: "grid",
            gridTemplateColumns: "1.05fr 1.25fr 90px 72px 104px",
            gap: 12,
            padding: "9px 0",
            borderBottom: "1px solid var(--border-light)",
            fontSize: 11,
            color: "var(--text-muted)",
            fontWeight: 600,
          }}
        >
          <span>{lt("指标", "Metric")}</span>
          <span>{lt("当前值", "Current Value")}</span>
          <span>{lt("风险分", "Risk Score")}</span>
          <span>{lt("权重", "Weight")}</span>
          <span>{lt("数据源", "Source")}</span>
        </div>
        {components.length ? components.map((item) => (
          <div
            key={item.key}
            className="risk-factor-table-row"
            style={{
              display: "grid",
              gridTemplateColumns: "1.05fr 1.25fr 90px 72px 104px",
              gap: 12,
              alignItems: "center",
              padding: "11px 0",
              borderBottom: "1px solid var(--border-light)",
            }}
            title={item.detail || item.provider || ""}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {riskText(item.name)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {riskText(item.value)}
            </span>
            <span
              style={{
                fontSize: 13,
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                color:
                  typeof item.score === "number"
                    ? riskColor(item.score)
                    : "var(--text-muted)",
              }}
            >
              {typeof item.score === "number" ? item.score.toFixed(1) : lt("无", "N/A")}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {(item.weight * 100).toFixed(0)}%
            </span>
            <span
              style={{
                ...sourceBadgeStyle(item.source_kind || item.source),
                borderRadius: "var(--radius-full)",
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              {riskText(item.source_label)}
            </span>
          </div>
        )) : (
          <div style={{ padding: "18px 0", color: "var(--text-muted)", fontSize: 12 }}>
            {lt("正在等待系统性风险组件数据", "Waiting for systemic risk component data")}
          </div>
        )}
      </div>

      {/* ── Two-Column: Risk Events + AI Assessment ── */}
      <div
        className="risk-events-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Left: Risk Events */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {events.map((evt, i) => (
            <div key={i} className="risk-event-card">
              <div
                className={`risk-event-dot ${evt.level === "error" ? "critical" : "elevated"}`}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 4,
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    {riskText(evt.title)}
                  </p>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      flexShrink: 0,
                    }}
                  >
                    {evt.time}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    margin: 0,
                    lineHeight: 1.45,
                  }}
                >
                    {riskText(evt.desc)}
                </p>
                <div className="risk-event-tags">
                  {(evt.tags || []).map((tag, j) => (
                    <span key={j} className={`risk-event-tag info`}>
                      {riskText(tag)}
                    </span>
                  ))}
                </div>
                {(evt.evidence || []).length > 0 && (
                  <div className="risk-event-evidence">
                    {(evt.evidence || []).slice(0, 2).map((item, evidenceIndex) => {
                      const href = String(item.url || "");
                      const content = (
                        <>
                          <strong>{item.title}</strong>
                          <span>{[item.source, item.time].filter(Boolean).join(" · ")}</span>
                        </>
                      );
                      return href.startsWith("http") ? (
                        <a key={`${item.title}-${evidenceIndex}`} href={href} target="_blank" rel="noreferrer">
                          {content}
                        </a>
                      ) : (
                        <div key={`${item.title}-${evidenceIndex}`}>{content}</div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {events.length === 0 && !loading && (
            <div className="risk-event-card" style={{ color: "var(--text-muted)" }}>
              {lt("暂无风险事件", "No risk events")}
            </div>
          )}
        </div>

        {/* Right: AI Assessment */}
        <div className="risk-ai-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "5%",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                margin: 0,
              }}
            >
              {lt("风险评估引擎", "Risk Assessment Engine")}
            </p>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                ...sourceBadgeStyle(systemicRisk?.source_kind || fundFlow?.source_kind),
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
              }}
            >
              {riskText(systemicRisk?.source_label || fundFlow?.source_label) || lt("等待数据", "Waiting for data")}
            </span>
          </div>
          <div
            style={{
              padding: 12,
              background: "var(--bg-white)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-lg)",
              marginBottom: 14,
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              minHeight: 110,
            }}
          >
            {lt(
              "社区版仅提供行情、资金流和你自行配置的风险指标。官方 AI 风险评估与动态评分逻辑未包含在此版本，请在本地工作流中自行实现。",
              "The community edition provides market data, fund flow and user-configured risk indicators only. Official AI assessment and dynamic scoring are excluded; implement them in your own workflow.",
            )}
          </div>
          <button
            type="button"
            onClick={loadRiskData}
            style={{
              width: "100%",
              padding: "12px 20px",
              background: "transparent",
              color: "var(--primary)",
              border: "1px solid var(--primary)",
              borderRadius: "var(--radius-full)",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--font-primary)",
              cursor: "pointer",
            }}
          >
            {lt("重新加载风险数据", "Reload Risk Data")}
          </button>
        </div>
      </div>

      {/* ── Fund Flow Visualization ── */}
      <div
        className="risk-fund-card"
        style={{
          background: "var(--bg-white)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-2xl)",
          padding: 32,
        }}
      >
        <div
          className="risk-fund-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "5%",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            {market === "CN"
              ? lt(
                  "北向、南向与主要板块流入/流出监控",
                  "Northbound, Southbound and Major Sector Flow Monitor",
                )
              : market === "HK"
                ? lt(
                    "南向互联互通与港股行业资金监控",
                    "Southbound Connect and Hong Kong Sector Flow Monitor",
                  )
                : lt(
                    "美股行业资金流入/流出监控",
                    "United States Sector Flow Monitor",
                  )}
          </p>
          <div className="risk-fund-head-values">
            {market === "CN" && (
              <span className={Number(marketMainNet ?? 0) >= 0 ? "up" : "down"}>
                {lt("大盘", "Market")} {formatFlowYi(marketMainNet, fundFlow?.market_main_flow?.display_value, lt, flowUnit)}
              </span>
            )}
            {showNorthbound && (
              <span className={northboundToneValue == null ? "muted" : northboundToneValue >= 0 ? "up" : "down"}>
                {lt("北向", "Northbound")} {formatFlowHeadline(fundFlow?.northbound, northboundNet, lt, flowUnit)}
              </span>
            )}
            {showSouthbound && (
              <span className={southboundNet == null ? "muted" : Number(southboundNet) >= 0 ? "up" : "down"}>
                {lt("南向", "Southbound")} {formatFlowYi(southboundNet, fundFlow?.southbound?.display_value, lt, flowUnit)}
              </span>
            )}
            {!showNorthbound && !showSouthbound && (
              <span className="muted">
                {lt("跨境互联互通不适用于当前市场", "Cross-border Connect flow is not applicable")}
              </span>
            )}
          </div>
        </div>
        <div
          className="risk-fund-meta"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: -22,
            marginBottom: 18,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span>{lt("数据状态:", "Data status:")} {fundFlowSourceText(fundFlow, lt, market)}</span>
          <span>{lt("交易日:", "Trading date:")} {fundFlow?.trade_date || "—"}</span>
        </div>

        <div
          className="risk-fund-grid"
          style={{
            display: "grid",
            gridTemplateColumns:
              showNorthbound || showSouthbound
                ? "minmax(220px, 0.85fr) minmax(320px, 1.15fr)"
                : "minmax(0, 1fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "10%",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                margin: "0 0 8px",
              }}
            >
              {lt("互联互通资金", "Connect Flow")}
            </p>
            <div
              style={{
                display: showNorthbound ? "flex" : "none",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "14px 0",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                {lt("北向成交额变化", "Northbound Turnover Change")}
                <span
                  style={{
                    ...sourceBadgeStyle(fundFlow?.northbound?.source_kind),
                    borderRadius: "var(--radius-full)",
                    padding: "2px 7px",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {riskText(fundFlow?.northbound?.source_label) || lt("等待数据", "Waiting for data")}
                </span>
              </span>
              <span
                style={{
                  fontSize: 24,
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  color:
                    fundFlow?.northbound?.source_kind === "unavailable"
                      ? "var(--text-muted)"
                      : Number(northboundToneValue ?? 0) >= 0
                        ? "var(--market-up)"
                        : "var(--market-down)",
                }}
              >
                {formatFlowHeadline(fundFlow?.northbound, northboundNet, lt, flowUnit)}
              </span>
            </div>
            <div
              style={{
                display: showSouthbound ? "flex" : "none",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "14px 0",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                {lt("南向净额", "Southbound Net")}
                <span
                  style={{
                    ...sourceBadgeStyle(fundFlow?.southbound?.source_kind),
                    borderRadius: "var(--radius-full)",
                    padding: "2px 7px",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {riskText(fundFlow?.southbound?.source_label) || lt("等待数据", "Waiting for data")}
                </span>
              </span>
              <span
                style={{
                  fontSize: 24,
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  color:
                    fundFlow?.southbound?.source_kind === "unavailable"
                      ? "var(--text-muted)"
                      : Number(southboundNet ?? 0) >= 0
                        ? "var(--market-up)"
                        : "var(--market-down)",
                }}
              >
                {formatFlowYi(southboundNet, fundFlow?.southbound?.display_value, lt, flowUnit)}
              </span>
            </div>
            {showNorthbound && renderFlowMetrics(fundFlow?.northbound, lt("北向核心数据", "Northbound Metrics"))}
            {showSouthbound && renderFlowMetrics(fundFlow?.southbound, lt("南向核心数据", "Southbound Metrics"))}
            {market === "CN" && fundFlow?.market_main_flow && (
              <div className="risk-market-main-flow">
                <span>{lt("沪深两市主力净流入", "Shanghai & Shenzhen main-fund flow")}</span>
                <strong className={Number(marketMainNet ?? 0) >= 0 ? "text-market-up" : "text-market-down"}>
                  {formatFlowYi(marketMainNet, fundFlow.market_main_flow.display_value, lt, flowUnit)}
                </strong>
                <small>{friendlyFlowProvider(fundFlow.market_main_flow.provider, lt)}</small>
              </div>
            )}
            {showNorthbound && (fundFlow?.northbound?.channels || []).slice(0, 4).map((src, i) => {
              const signed = src.signed !== false && src.metric_key !== "turnover" && src.metric_key !== "buy_amount";
              return (
                <div
                  key={`north-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border-light)",
                  }}
                >
                  <span style={{ minWidth: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    {riskText(src.name)}
                    {src.metric_label ? ` · ${riskText(src.metric_label)}` : ""}
                  </span>
                  <span
                    style={{
                      flex: "0 0 auto",
                      fontSize: 13,
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      color: src.display_value
                        ? "var(--text-secondary)"
                        : !signed
                          ? "var(--text-primary)"
                          : src.value >= 0
                            ? "var(--market-up)"
                            : "var(--market-down)",
                    }}
                  >
                    {formatFlowAmount(src.value, src.display_value, lt, flowUnit, signed)}
                  </span>
                </div>
              );
            })}
            {showSouthbound && (fundFlow?.southbound?.channels || []).slice(0, 4).map((src, i) => {
              const signed = src.signed !== false && src.metric_key !== "turnover" && src.metric_key !== "buy_amount";
              return (
                <div
                  key={`south-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border-light)",
                  }}
                >
                  <span style={{ minWidth: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    {riskText(src.name)}
                    {src.metric_label ? ` · ${riskText(src.metric_label)}` : ""}
                  </span>
                  <span
                    style={{
                      flex: "0 0 auto",
                      fontSize: 13,
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      color: src.display_value
                        ? "var(--text-secondary)"
                        : !signed
                          ? "var(--text-primary)"
                          : src.value >= 0
                            ? "var(--market-up)"
                            : "var(--market-down)",
                    }}
                  >
                    {formatFlowAmount(src.value, src.display_value, lt, flowUnit, signed)}
                  </span>
                </div>
              );
            })}
          </div>

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginBottom: 8,
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
                {lt("板块资金流", "Sector Fund Flow")}
              </p>
              <span
                style={{
                  ...sourceBadgeStyle(fundFlow?.sector_source_kind),
                  borderRadius: "var(--radius-full)",
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {riskText(fundFlow?.sector_source_label) || lt("等待数据", "Waiting for data")}
              </span>
              <div style={{ display: "flex", gap: 8, flex: "0 1 280px" }}>
                <input
                  value={newSector}
                  onChange={(e) => setNewSector(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addWatchedSector()}
                  placeholder={lt("添加板块", "Add sector")}
                  list={`risk-sector-options-${market}`}
                  className="figma-input"
                  style={{ flex: 1, fontSize: 12, padding: "8px 10px" }}
                />
                <datalist id={`risk-sector-options-${market}`}>
                  {sectorOptions.map((name) => (
                    <option value={name} key={name} />
                  ))}
                </datalist>
                <button type="button" onClick={addWatchedSector} className="figma-btn figma-btn-sm">
                  {lt("添加", "Add")}
                </button>
              </div>
            </div>
            {fundFlow?.sectors?.length ? fundFlow.sectors.map((dst, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border-light)",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{riskText(dst.name)}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontFamily: "var(--font-display)", fontWeight: 600, color: dst.value >= 0 ? "var(--market-up)" : "var(--market-down)" }}>{formatSignedYi(dst.value, flowUnit)}</span>
                  {watchedSectors.includes(dst.name) && (
                    <button type="button" onClick={() => removeWatchedSector(dst.name)} style={{ border: 0, background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>×</button>
                  )}
                </span>
              </div>
            )) : (
              <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border-light)", color: "var(--text-muted)", fontSize: 12 }}>
                {lt("正在等待板块资金数据", "Waiting for sector fund-flow data")}
              </div>
            )}
          </div>
        </div>

        <div className="risk-flow-disclosure-grid">
          <section className="risk-flow-disclosure-card">
            <div className="risk-flow-disclosure-head">
              <strong>{lt("最新个股资金流披露", "Latest Stock Fund Flow")}</strong>
              <span>{lt("展示数据，不计入风险因子", "Display only, not a risk factor")}</span>
            </div>
            <div className="risk-flow-disclosure-list">
              {(fundFlow?.stock_flows || []).slice(0, 8).map((item) => (
                <div key={item.code} className="risk-flow-disclosure-row">
                  <span>
                    <b>{item.name}</b>
                    <small>{item.code}</small>
                  </span>
                  <span>
                    <em className={Number(item.change_pct ?? 0) >= 0 ? "text-market-up" : "text-market-down"}>
                      {Number(item.change_pct ?? 0) >= 0 ? "+" : ""}
                      {Number(item.change_pct ?? 0).toFixed(2)}%
                    </em>
                    <strong className={Number(item.main_net ?? 0) >= 0 ? "text-market-up" : "text-market-down"}>
                      {formatSignedYi(Number(item.main_net || 0), flowUnit)}
                    </strong>
                  </span>
                </div>
              ))}
              {!(fundFlow?.stock_flows || []).length && (
                <div className="risk-flow-disclosure-empty">
                  {lt("正在等待个股资金流数据", "Waiting for stock fund-flow data")}
                </div>
              )}
            </div>
          </section>

          <section className="risk-flow-disclosure-card">
            <div className="risk-flow-disclosure-head">
              <strong>{lt("最新板块资金流披露", "Latest Sector Fund Flow")}</strong>
              <span>{lt("解释板块资金项", "Explains sector-flow factor")}</span>
            </div>
            <div className="risk-flow-disclosure-list">
              {(fundFlow?.sectors || []).slice(0, 8).map((item) => (
                <div key={item.name} className="risk-flow-disclosure-row">
                  <span>
                    <b>{riskText(item.name)}</b>
                    <small>{lt("板块", "Sector")}</small>
                  </span>
                  <span>
                    <strong className={Number(item.value ?? 0) >= 0 ? "text-market-up" : "text-market-down"}>
                      {formatSignedYi(Number(item.value || 0), flowUnit)}
                    </strong>
                  </span>
                </div>
              ))}
              {!(fundFlow?.sectors || []).length && (
                <div className="risk-flow-disclosure-empty">
                  {lt("正在等待板块资金流数据", "Waiting for sector fund-flow data")}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Dynamic fund flow chart (from API) */}
        {fundFlow && (
          <div style={{ marginTop: 16 }}>
            <div
              ref={fundFlowChartRef}
              className="w-full"
              style={{ height: 220 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
