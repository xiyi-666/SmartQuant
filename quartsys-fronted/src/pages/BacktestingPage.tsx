import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as echarts from "echarts";
import { api } from "../api";
import { useLanguage } from "../shared/language";
import { useMarket } from "../shared/market";
import { useTheme } from "../shared/theme";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface Agent {
  id: number;
  name: string;
  status: string;
  total_return: number;
  created_at: string;
  agent_type: string;
  strategy_config: Record<string, unknown> | string | null;
  drawdown?: number;
  uid?: string;
}

interface PerformancePoint {
  date: string;
  total_assets: number;
  daily_return: number;
}

interface BenchmarkPoint {
  date: string;
  value: number;
  return_pct?: number;
}

interface BenchmarkSeries {
  code: string;
  name: string;
  source?: string;
  points: BenchmarkPoint[];
}

type TimeFrame = "day" | "week" | "month";

interface ReturnPoint {
  date: string;
  value: number;
}

interface Strategy {
  id: number;
  name: string;
  factor_ids?: number[];
  factors?: AgentFactorSpec[];
  params_json?: string | null;
}

interface CustomFactor {
  id: number;
  name: string;
  display_name?: string;
  category?: string;
  expression: string;
  params_json?: string | null;
  output_type?: string;
  default_filter?: string | null;
}

interface AgentFactorSpec {
  id?: number;
  name?: string;
  display_name?: string;
}

interface BacktestEquityPoint {
  date: string;
  value: number;
  selected_count?: number;
  position_count?: number;
}

interface BacktestRunResult {
  equity_curve: BacktestEquityPoint[];
  metrics?: {
    total_return?: number;
    annual_return?: number;
    initial_capital?: number;
    final_capital?: number;
    trading_days?: number;
    factor_count?: number;
    mode?: string;
    start_date?: string;
    end_date?: string;
    continuous_to_latest?: boolean;
    stock_universe_count?: number;
    stock_universe_total?: number;
    stock_universe_limited?: boolean;
  };
  mode?: string;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */

const CHART_COLORS = [
  "#EF4444",
  "#D9AA4E",
  "#5BA7B5",
  "#9B7BD3",
  "#D977A4",
  "#16A34A",
];

const NAV_ITEMS = [
  { label: "总览", labelEn: "Overview", icon: "dashboard", to: "/dashboard" },
  { label: "回测中心", labelEn: "Backtesting", icon: "history_edu", to: "/backtesting" },
  { label: "智能体管理", labelEn: "Agents", icon: "smart_toy", to: "/strategy" },
  { label: "交易日志", labelEn: "Trade Logs", icon: "receipt_long", to: "/trading" },
  { label: "系统设置", labelEn: "Settings", icon: "settings", to: "/settings" },
];

const TIME_FRAME_OPTIONS: Array<{ value: TimeFrame; label: string; labelEn: string }> = [
  { value: "day", label: "日", labelEn: "Day" },
  { value: "week", label: "周", labelEn: "Week" },
  { value: "month", label: "月", labelEn: "Month" },
];

const BENCHMARK_OPTIONS = [
  { code: "sh000001", name: "上证指数", nameEn: "SSE Composite", market: "CN" },
  { code: "sz399001", name: "深证成指", nameEn: "SZSE Component", market: "CN" },
  { code: "sz399006", name: "创业板指", nameEn: "ChiNext", market: "CN" },
  { code: "bj899050", name: "北证50", nameEn: "BSE 50", market: "CN" },
  { code: "sh000688", name: "科创50", nameEn: "STAR 50", market: "CN" },
  { code: "sh000300", name: "沪深300", nameEn: "CSI 300", market: "CN" },
  { code: "sh000905", name: "中证500", nameEn: "CSI 500", market: "CN" },
  { code: "hkHSI", name: "恒生指数", nameEn: "Hang Seng Index", market: "HK" },
  { code: "hkHSCEI", name: "恒生国企指数", nameEn: "Hang Seng China Enterprises", market: "HK" },
  { code: "hkHSTECH", name: "恒生科技指数", nameEn: "Hang Seng TECH", market: "HK" },
  { code: "hkHSCCI", name: "恒生中资企业指数", nameEn: "Hang Seng China-Affiliated", market: "HK" },
  { code: "usINX", name: "标普500", nameEn: "S&P 500", market: "US" },
  { code: "usIXIC", name: "纳斯达克综合", nameEn: "Nasdaq Composite", market: "US" },
  { code: "usDJI", name: "道琼斯工业指数", nameEn: "Dow Jones Industrial", market: "US" },
  { code: "usNDX", name: "纳斯达克100", nameEn: "Nasdaq 100", market: "US" },
];

const BENCHMARK_COLORS = [
  "#D9AA4E",
  "#EF4444",
  "#5BA7B5",
  "#9B7BD3",
  "#16A34A",
  "#D977A4",
  "#A16207",
  "#6B7280",
];

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeDateKey = (value?: string) => (value || "").slice(0, 10);

const formatInputDate = (date: Date) => date.toISOString().slice(0, 10);

const defaultEndDate = () => "";

const defaultStartDate = () =>
  formatInputDate(new Date(Date.now() - 90 * DAY_MS));

const parseYmdUtc = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return Number.NaN;
  return Date.UTC(year, month - 1, day);
};

const buildBacktestPeriodLabel = (dates: string[], lang: "zh" | "en") => {
  if (dates.length === 0) {
    return {
      periodLabel: lang === "zh" ? "暂无收益曲线数据" : "No return curve data",
      returnLabel: lang === "zh" ? "累计收益" : "Cumulative Return",
    };
  }

  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const pointDays = dates.length;

  if (startDate === endDate) {
    return {
      periodLabel: `1Day · ${startDate}`,
      returnLabel: lang === "zh" ? "1D收益" : "1D Return",
    };
  }

  const startTime = parseYmdUtc(startDate);
  const endTime = parseYmdUtc(endDate);
  const calendarDays =
    Number.isFinite(startTime) && Number.isFinite(endTime)
      ? Math.max(1, Math.round((endTime - startTime) / DAY_MS) + 1)
      : pointDays;
  const calendarSuffix =
    calendarDays !== pointDays
      ? lang === "zh"
        ? ` / ${calendarDays}自然日`
        : ` / ${calendarDays} calendar days`
      : "";

  return {
    periodLabel:
      lang === "zh"
        ? `${pointDays}Days · ${startDate} 至 ${endDate}${calendarSuffix}`
        : `${pointDays}Days · ${startDate} to ${endDate}${calendarSuffix}`,
    returnLabel: lang === "zh" ? `${pointDays}D收益` : `${pointDays}D Return`,
  };
};

const formatPercent = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
};

const getWeekKey = (date: string) => {
  const time = parseYmdUtc(date);
  if (!Number.isFinite(time)) return date;
  const day = new Date(time).getUTCDay() || 7;
  const monday = time - (day - 1) * DAY_MS;
  return new Date(monday).toISOString().slice(0, 10);
};

const getBucketKey = (date: string, frame: TimeFrame) => {
  if (frame === "month") return date.slice(0, 7);
  if (frame === "week") return getWeekKey(date);
  return date;
};

const bucketReturnPoints = (points: ReturnPoint[], frame: TimeFrame) => {
  const buckets = new Map<string, ReturnPoint>();
  points.forEach((point) => {
    buckets.set(getBucketKey(point.date, frame), point);
  });
  return Array.from(buckets.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
};

const buildAgentReturnPoints = (
  points: PerformancePoint[],
  frame: TimeFrame,
) => {
  const sorted = points
    .map((p) => ({ ...p, date: normalizeDateKey(p.date) }))
    .filter(
      (p) => p.date && Number.isFinite(p.total_assets) && p.total_assets > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const baseAssets = sorted[0]?.total_assets;
  if (!baseAssets) return [];

  return bucketReturnPoints(
    sorted.map((p) => ({
      date: p.date,
      value: ((p.total_assets - baseAssets) / baseAssets) * 100,
    })),
    frame,
  );
};

const buildBenchmarkReturnPoints = (
  points: BenchmarkPoint[],
  frame: TimeFrame,
) => {
  const sorted = points
    .map((p) => ({ ...p, date: normalizeDateKey(p.date) }))
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const baseValue = sorted[0]?.value || 100;

  return bucketReturnPoints(
    sorted.map((p) => ({
      date: p.date,
      value:
        typeof p.return_pct === "number"
          ? p.return_pct
          : ((p.value - baseValue) / baseValue) * 100,
    })),
    frame,
  );
};

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function BacktestingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useLanguage();
  const { market } = useMarket();
  const { theme } = useTheme();
  const lt = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const { pathname } = location;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [customFactors, setCustomFactors] = useState<CustomFactor[]>([]);
  const [selectedFactorIds, setSelectedFactorIds] = useState<Set<number>>(
    new Set(),
  );
  const [performanceData, setPerformanceData] = useState<
    Record<number, PerformancePoint[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newStrategyId, setNewStrategyId] = useState<number | "">("");
  const [creating, setCreating] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("day");
  const [selectedBenchmarkCodes, setSelectedBenchmarkCodes] = useState<string[]>([]);
  const [benchmarkSeries, setBenchmarkSeries] = useState<BenchmarkSeries[]>([]);
  const [benchmarkSelectCode, setBenchmarkSelectCode] = useState("sh000300");
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [runStrategyId, setRunStrategyId] = useState<number | "">("");
  const [runStartDate, setRunStartDate] = useState(defaultStartDate);
  const [runEndDate, setRunEndDate] = useState(defaultEndDate);
  const [runInitialCapital, setRunInitialCapital] = useState(1000000);
  const [directBacktest, setDirectBacktest] = useState<BacktestRunResult | null>(
    null,
  );
  const [directBacktestName, setDirectBacktestName] = useState("");
  const [directRunning, setDirectRunning] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(
    () => localStorage.getItem("quartsys_avatar_url") || "",
  );
  const [profileName, setProfileName] = useState(
    () => localStorage.getItem("quartsys_user") || "",
  );

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const benchmarkOptions = useMemo(
    () => BENCHMARK_OPTIONS.filter((option) => option.market === market),
    [market],
  );

  useEffect(() => {
    const preferred =
      market === "CN"
        ? benchmarkOptions.find((option) => option.code === "sh000300")
        : benchmarkOptions[0];
    setBenchmarkSelectCode(preferred?.code || "");
    setSelectedBenchmarkCodes([]);
    setBenchmarkSeries([]);
  }, [benchmarkOptions, market]);

  /* ── Data loading ────────────────────────────────────────────────────────── */

  const loadAgents = useCallback(async () => {
    try {
      const data = await (api as any).listAgents();
      const list: Agent[] = Array.isArray(data) ? data : [];
      setAgents(list);
      setError(null);
      return list;
    } catch (e: any) {
      setError(e.message || "Failed to load agents");
      return [];
    }
  }, []);

  const loadStrategies = useCallback(async () => {
    try {
      const data = await (api as any).listStrategies();
      setStrategies(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  const loadCustomFactors = useCallback(async () => {
    try {
      const data = await (api as any).listCustomFactors();
      setCustomFactors(Array.isArray(data?.factors) ? data.factors : []);
    } catch {
      setCustomFactors([]);
    }
  }, []);

  const loadPerformance = useCallback(async (agentList: Agent[]) => {
    if (agentList.length === 0) {
      setPerformanceData({});
      return;
    }
    const results: Record<number, PerformancePoint[]> = {};
    await Promise.allSettled(
      agentList.map(async (agent) => {
        try {
          const perf: PerformancePoint[] = await (
            api as any
          ).getAgentPerformance(agent.id);
          if (Array.isArray(perf) && perf.length > 0) results[agent.id] = perf;
        } catch {}
      }),
    );
    setPerformanceData(results);
  }, []);

  const loadBenchmarks = useCallback(async (dates: string[], codes: string[]) => {
    if (dates.length === 0 || codes.length === 0) {
      setBenchmarkSeries([]);
      return;
    }
    setBenchmarkLoading(true);
    try {
      const results = await Promise.allSettled(
        codes.map(async (code) => {
          const meta = BENCHMARK_OPTIONS.find((item) => item.code === code);
          const data = await (api as any).getBenchmark(
            dates[0],
            dates[dates.length - 1],
            code,
          );
          return {
            code: data?.code || code,
            name: data?.name || meta?.name || code,
            source: data?.source,
            points: Array.isArray(data?.benchmark) ? data.benchmark : [],
          } as BenchmarkSeries;
        }),
      );
      setBenchmarkSeries(
        results
          .filter((item): item is PromiseFulfilledResult<BenchmarkSeries> =>
            item.status === "fulfilled",
          )
          .map((item) => item.value)
          .filter((item) => item.points.length > 0),
      );
    } catch (e: any) {
      setBenchmarkSeries([]);
      setError(e.message || "Failed to load benchmark");
    } finally {
      setBenchmarkLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [agentList] = await Promise.all([
        loadAgents(),
        loadStrategies(),
        loadCustomFactors(),
      ]);
      await loadPerformance(agentList);
      setLoading(false);
    })();
  }, [loadAgents, loadStrategies, loadCustomFactors, loadPerformance]);

  useEffect(() => {
    const syncProfile = () => {
      setAvatarUrl(localStorage.getItem("quartsys_avatar_url") || "");
      setProfileName(localStorage.getItem("quartsys_user") || "");
      (api as any)
        .getUserProfile()
        .then((d: any) => {
          const nextName = d?.username || "";
          const nextAvatar = d?.avatar_url || "";
          localStorage.setItem("quartsys_user", nextName);
          if (nextAvatar) {
            localStorage.setItem("quartsys_avatar_url", nextAvatar);
          } else {
            localStorage.removeItem("quartsys_avatar_url");
          }
          setProfileName(nextName);
          setAvatarUrl(nextAvatar);
        })
        .catch(() => {});
    };
    syncProfile();
    window.addEventListener("quartsys:profile-updated", syncProfile);
    return () => window.removeEventListener("quartsys:profile-updated", syncProfile);
  }, []);

  useEffect(() => {
    const state = (location.state || {}) as {
      factorId?: number;
      source?: string;
      stockCode?: string;
      stockName?: string;
      strategyName?: string;
    };
    if (typeof state.factorId === "number") {
      setSelectedFactorIds(new Set([state.factorId]));
    }
    if (state.source === "smart_recommendation" && state.stockCode) {
      const label = state.stockName
        ? `${state.stockName} ${state.stockCode}`
        : state.stockCode;
      setNewName(`AI观察池回测-${label}`);
      setDirectBacktestName(`AI观察池-${label}`);
    }
  }, [location.state]);

  const performanceDates = useMemo(() => {
    const dates = new Set<string>();
    Object.values(performanceData).forEach((pts) =>
      pts.forEach((p) => {
        const date = normalizeDateKey(p.date);
        if (date) dates.add(date);
      }),
    );
    directBacktest?.equity_curve?.forEach((p) => {
      const date = normalizeDateKey(p.date);
      if (date) dates.add(date);
    });
    return Array.from(dates).sort();
  }, [directBacktest, performanceData]);

  const backtestPeriod = useMemo(
    () => buildBacktestPeriodLabel(performanceDates, lang),
    [performanceDates, lang],
  );

  useEffect(() => {
    if (!selectedBenchmarkCodes.length) {
      setBenchmarkSeries([]);
      return;
    }
    void loadBenchmarks(performanceDates, selectedBenchmarkCodes);
  }, [loadBenchmarks, performanceDates, selectedBenchmarkCodes]);

  /* ── Chart ───────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!chartRef.current) return;
    if (!chartInstance.current)
      chartInstance.current = echarts.init(chartRef.current);
    const chart = chartInstance.current;
    const rootStyle = getComputedStyle(document.documentElement);
    const chartText = rootStyle.getPropertyValue("--text-primary").trim() || (theme === "dark" ? "#f6f5f0" : "#171713");
    const chartMuted = rootStyle.getPropertyValue("--text-muted").trim() || (theme === "dark" ? "#a9afb7" : "#6b6b63");
    const chartBorder = rootStyle.getPropertyValue("--border-light").trim() || (theme === "dark" ? "rgba(255,255,255,.12)" : "#deddd6");
    const chartGrid = rootStyle.getPropertyValue("--bg-gray").trim() || (theme === "dark" ? "#202327" : "#ecece7");
    const chartSurface = rootStyle.getPropertyValue("--bg-white").trim() || (theme === "dark" ? "#111316" : "#ffffff");

    const agentReturnSeries = agents
      .filter((a) => performanceData[a.id])
      .map((agent) => ({
        agent,
        points: buildAgentReturnPoints(performanceData[agent.id]!, timeFrame),
      }))
      .filter((item) => item.points.length > 0);
    const directInitial =
      directBacktest?.metrics?.initial_capital || runInitialCapital || 1000000;
    const directReturnPoints = directBacktest?.equity_curve?.length
      ? bucketReturnPoints(
          directBacktest.equity_curve
            .map((p) => ({
              date: normalizeDateKey(p.date),
              value: ((Number(p.value) - directInitial) / directInitial) * 100,
            }))
            .filter((p) => p.date && Number.isFinite(p.value)),
          timeFrame,
        )
      : [];
    const benchmarkReturnSeries = benchmarkSeries
      .map((benchmark) => ({
        benchmark,
        points: buildBenchmarkReturnPoints(benchmark.points, timeFrame),
      }))
      .filter((item) => item.points.length > 0);

    const allDates = new Set<string>();
    agentReturnSeries.forEach((item) =>
      item.points.forEach((point) => allDates.add(point.date)),
    );
    directReturnPoints.forEach((point) => allDates.add(point.date));
    benchmarkReturnSeries.forEach((item) =>
      item.points.forEach((point) => allDates.add(point.date)),
    );
    const sortedDates = Array.from(allDates).sort();

    const series = agentReturnSeries.map(({ agent, points }, idx) => {
      const dateReturnMap = new Map<string, number>();
      points.forEach((point) => dateReturnMap.set(point.date, point.value));
      return {
        name: agent.name,
        type: "line" as const,
        smooth: true,
        symbol: "none",
        lineStyle: {
          width: 2,
          color: CHART_COLORS[idx % CHART_COLORS.length],
        },
        itemStyle: { color: CHART_COLORS[idx % CHART_COLORS.length] },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: CHART_COLORS[idx % CHART_COLORS.length] + "30",
            },
            {
              offset: 1,
              color: CHART_COLORS[idx % CHART_COLORS.length] + "05",
            },
          ]),
        },
        data: sortedDates.map((d) => {
          const dr = dateReturnMap.get(d);
          return dr !== undefined ? [d, Number(dr.toFixed(2))] : [d, null];
        }),
      };
    });
    if (directReturnPoints.length > 0) {
      const directMap = new Map<string, number>();
      directReturnPoints.forEach((point) => directMap.set(point.date, point.value));
      series.push({
        name: directBacktestName || lt("策略周期回测", "Strategy Period Backtest"),
        type: "line" as const,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 3, color: "#ef4444" },
        itemStyle: { color: "#ef4444" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(239,68,68,0.20)" },
            { offset: 1, color: "rgba(239,68,68,0.03)" },
          ]),
        },
        data: sortedDates.map((d) => {
          const value = directMap.get(d);
          return value !== undefined
            ? [d, Number(value.toFixed(2))]
            : [d, null];
        }),
      });
    }
    benchmarkReturnSeries.forEach(({ benchmark, points }, idx) => {
      const benchmarkMap = new Map<string, number>();
      points.forEach((point) => benchmarkMap.set(point.date, point.value));
      const color = BENCHMARK_COLORS[idx % BENCHMARK_COLORS.length];
      series.push({
        name: `${benchmark.name}基准`,
        type: "line" as const,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color, type: "dashed" },
        itemStyle: { color },
        data: sortedDates.map((d) => {
          const value = benchmarkMap.get(d);
          return value !== undefined
            ? [d, Number(value.toFixed(2))]
            : [d, null];
        }),
      });
    });

    const compactChart = chartRef.current.clientWidth < 640;

    chart.setOption(
      {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "axis",
          backgroundColor: chartSurface,
          borderColor: chartBorder,
          textStyle: { color: chartText, fontSize: 12 },
          formatter: (params: any) => {
            const rows = Array.isArray(params) ? params : [params];
            const date = rows[0]?.axisValueLabel || rows[0]?.axisValue || "";
            const lines = rows
              .filter(
                (row: any) => Array.isArray(row.value) && row.value[1] !== null,
              )
              .map(
                (row: any) =>
                  `${row.marker}${row.seriesName}: ${formatPercent(row.value[1])}`,
              );
            return [date, ...lines].join("<br/>");
          },
        },
        legend: {
          show: series.length > 0,
          type: compactChart ? "scroll" : "plain",
          top: 0,
          left: compactChart ? 0 : undefined,
          right: 0,
          textStyle: { color: chartMuted, fontSize: 11 },
          itemWidth: 14,
          itemHeight: 8,
          itemGap: compactChart ? 10 : 16,
          pageIconColor: chartText,
          pageIconInactiveColor: chartMuted,
          pageTextStyle: { color: chartMuted, fontSize: 10 },
        },
        grid: { top: compactChart ? 64 : 36, right: 16, bottom: 32, left: 56 },
        xAxis: {
          type: "category",
          data: sortedDates,
          axisLine: { lineStyle: { color: chartBorder } },
          axisTick: { show: false },
          axisLabel: {
            color: chartMuted,
            fontSize: 10,
            formatter: (v: string) =>
              timeFrame === "month" ? v.slice(0, 7) : v.slice(5),
          },
        },
        yAxis: {
          type: "value",
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: chartGrid } },
          axisLabel: {
            color: chartMuted,
            fontSize: 10,
            formatter: (v: number) => formatPercent(v, 1),
          },
        },
        series,
      },
      true,
    );
  }, [
    agents,
    benchmarkSeries,
    directBacktest,
    directBacktestName,
    performanceData,
    runInitialCapital,
    theme,
    timeFrame,
  ]);

  useEffect(() => {
    if (!chartRef.current) return;
    const ro = new ResizeObserver(() => chartInstance.current?.resize());
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  /* ── Actions ─────────────────────────────────────────────────────────────── */

  const withLoading = async (id: number, fn: () => Promise<unknown>) => {
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await fn();
      const updatedList = await loadAgents();
      await loadPerformance(updatedList);
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleStart = (id: number) =>
    withLoading(id, () => (api as any).startAgent(id));
  const handleStop = (id: number) =>
    withLoading(id, () => (api as any).stopAgent(id));
  const handleDelete = async (id: number) => {
    if (!confirm(lt("确定要删除此 Agent 吗？", "Delete this agent?"))) return;
    await withLoading(id, () => (api as any).deleteAgent(id));
  };

  const seedBacktestAgents = async () => {
    setCreating(true);
    setError(null);
    try {
      await (api as any).seedBacktestAgents();
      const updatedList = await loadAgents();
      await loadPerformance(updatedList);
      setNewName("");
      setNewStrategyId("");
    } catch (e: any) {
      setError(e.message || "Seed agents failed");
    } finally {
      setCreating(false);
    }
  };

  const applyStrategyFactorIds = (ids: unknown) => {
    const factorIds = Array.isArray(ids)
      ? ids
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (factorIds.length > 0) {
      setSelectedFactorIds(new Set(factorIds));
    }
    return factorIds;
  };

  const handleRunStrategyChange = async (value: string) => {
    if (value === "") {
      setRunStrategyId("");
      return;
    }
    const strategyId = Number(value);
    setRunStrategyId(strategyId);
    setError(null);
    const localStrategy = strategies.find((s) => s.id === strategyId);
    const localFactorIds = applyStrategyFactorIds(localStrategy?.factor_ids);
    if (localFactorIds.length > 0) return;
    try {
      const strategy = await (api as any).getStrategy(strategyId);
      applyStrategyFactorIds(strategy?.factor_ids);
    } catch {}
  };

  const addBenchmark = () => {
    if (!benchmarkSelectCode) return;
    setSelectedBenchmarkCodes((prev) =>
      prev.includes(benchmarkSelectCode)
        ? prev
        : [...prev, benchmarkSelectCode],
    );
  };

  const removeBenchmark = (code: string) => {
    setSelectedBenchmarkCodes((prev) => prev.filter((item) => item !== code));
    setBenchmarkSeries((prev) => prev.filter((item) => item.code !== code));
  };

  const runSelectedStrategyBacktest = async () => {
    if (runStrategyId === "") {
      setError(lt("请先选择要执行的策略", "Select a strategy first"));
      return;
    }
    if (!runStartDate || (runEndDate && runStartDate > runEndDate)) {
      setError(lt("请设置正确的回测起止日期", "Set a valid backtest date range"));
      return;
    }
    setDirectRunning(true);
    setError(null);
    try {
      const strategy = await (api as any).getStrategy(Number(runStrategyId));
      if (!strategy?.code) {
        throw new Error(lt("策略代码为空，请先在 AI策略 页保存策略代码", "Strategy code is empty. Save strategy code in AI Strategy first."));
      }
      const strategyFactorIds = Array.isArray(strategy.factor_ids)
        ? strategy.factor_ids.map((id: unknown) => Number(id)).filter(Number.isFinite)
        : [];
      let strategyConfig: any = {};
      try {
        strategyConfig = strategy.params_json ? JSON.parse(strategy.params_json) : {};
      } catch {
        strategyConfig = {};
      }
      const strategyFactorSpecs = Array.isArray(strategyConfig?.factor_specs)
        ? strategyConfig.factor_specs
        : [];
      const overrideFactorIds = new Set(
        strategyFactorSpecs
          .map((spec: any) => Number(spec?.id || spec?.factor_id))
          .filter(Number.isFinite),
      );
      const factorIds = Array.from(
        new Set([...strategyFactorIds, ...Array.from(selectedFactorIds)]),
      );
      const payload: any = {
        strategy_code: strategy.code,
        market,
        start_date: runStartDate,
        initial_capital: runInitialCapital,
        factor_ids: factorIds.filter((id) => !overrideFactorIds.has(id)),
        factor_specs: strategyFactorSpecs,
        max_stocks: 1000,
      };
      if (runEndDate) {
        payload.end_date = runEndDate;
      }
      const result = await (api as any).runBacktest(payload);
      setSelectedFactorIds(new Set(factorIds));
      setDirectBacktest(result);
      setDirectBacktestName(strategy.name || lt("策略周期回测", "Strategy Period Backtest"));
      if (selectedBenchmarkCodes.length) {
        await loadBenchmarks(
          Array.isArray(result?.equity_curve)
            ? result.equity_curve.map((p: BacktestEquityPoint) => normalizeDateKey(p.date))
            : [],
          selectedBenchmarkCodes,
        );
      }
    } catch (e: any) {
      setError(e.message || lt("策略回测失败", "Strategy backtest failed"));
    } finally {
      setDirectRunning(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { name: newName.trim() };
      if (newStrategyId !== "") {
        payload.strategy_id = newStrategyId;
        const strat = strategies.find((s) => s.id === newStrategyId);
        if (strat) payload.strategy_name = strat.name;
      }
      if (selectedFactorIds.size > 0) {
        payload.factor_ids = Array.from(selectedFactorIds);
      }
      await (api as any).createAgent(payload);
      setNewName("");
      setNewStrategyId("");
      setSelectedFactorIds(new Set());
      const updatedList = await loadAgents();
      await loadPerformance(updatedList);
    } catch (e: any) {
      setError(e.message || "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const toggleFactor = (id: number) => {
    setSelectedFactorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ── Derived data ────────────────────────────────────────────────────────── */

  const sortedByReturn = [...agents].sort(
    (a, b) => b.total_return - a.total_return,
  );
  const bestAgent = sortedByReturn[0];
  const maxAbsReturn = Math.max(
    1,
    ...agents.map((a) => Math.abs(a.total_return)),
  );
  const runningCount = agents.filter((a) => a.status === "running").length;
  const parseAgentConfig = (agent: Agent): Record<string, any> => {
    if (!agent.strategy_config) return {};
    if (typeof agent.strategy_config === "string") {
      try {
        return JSON.parse(agent.strategy_config);
      } catch {
        return {};
      }
    }
    return agent.strategy_config as Record<string, any>;
  };
  const getAgentFactorSpecs = (agent: Agent): AgentFactorSpec[] => {
    const config = parseAgentConfig(agent);
    return Array.isArray(config.factor_specs)
      ? (config.factor_specs as AgentFactorSpec[])
      : [];
  };
  const getAgentStrategyLabel = (agent: Agent) => {
    const config = parseAgentConfig(agent);
    return (
      (typeof config.strategy_name === "string" && config.strategy_name) ||
      (typeof config.strategy_type === "string" && config.strategy_type) ||
      agent.agent_type ||
      "Backtest"
    );
  };
  const selectedRunStrategy =
    runStrategyId === ""
      ? null
      : strategies.find((strategy) => strategy.id === Number(runStrategyId)) || null;
  const selectedRunStrategyFactorCount =
    selectedRunStrategy?.factor_ids?.length || 0;

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <div className="backtest-page">
      {/* ── Sidebar ── */}
      <aside className="backtest-sidebar">
        <div className="backtest-sidebar-header">
          <div className="backtest-sidebar-logo">
            <span>K</span>
          </div>
          <div>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-2.5%",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {t("brandName")}
            </h2>
          </div>
        </div>

        <nav className="backtest-nav">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <button
                key={item.label}
                type="button"
                className={`backtest-nav-item ${active ? "active" : ""}`}
                onClick={() => navigate(item.to)}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20 }}
                >
                  {item.icon}
                </span>
                <span>{lt(item.label, item.labelEn)}</span>
              </button>
            );
          })}
        </nav>

        <div className="backtest-user-section">
          <div
            className="backtest-user-avatar"
            title={lt("用户信息设置", "Profile settings")}
            role="button"
            tabIndex={0}
            onClick={() => navigate("/settings?tab=profile")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/settings?tab=profile");
              }
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={lt("用户头像", "User avatar")} />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>
                {(profileName || "U").charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ marginLeft: 12 }}>
            <p
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              {profileName || lt("系统管理员", "Administrator")}
            </p>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="backtest-main">
        {/* Top Header */}
        <div className="backtest-top-header">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h1
              style={{
                fontFamily: "var(--font-primary)",
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "-2.5%",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {lt("回测引擎", "Backtest Engine")}
            </h1>
            <div className="backtest-status-badge running">
              <span
                className="figma-status-dot green"
                style={{ width: 6, height: 6 }}
              />
              {lt("引擎已连接", "Engine Connected")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 16px",
                background: "var(--primary-light)",
                border: "1px solid color-mix(in srgb, var(--brand-accent) 36%, var(--border-light))",
                borderRadius: 8,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: "var(--primary)" }}
              >
                auto_awesome
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--primary)",
                }}
              >
                {lt("AI 诊断:", "AI Diagnostics:")}{" "}
                {bestAgent
                  ? lt(`${bestAgent.name} 近期表现优异`, `${bestAgent.name} has performed well recently`)
                  : lt("暂无数据", "No data")}
              </span>
            </div>
            <button className="figma-btn figma-btn-sm">{lt("优化权重", "Optimize Weights")}</button>
          </div>
        </div>

        {/* Content */}
        <div className="backtest-content">
          {/* ── Chart + Rankings Row ── */}
          <div className="backtest-overview-row" style={{ display: "flex", gap: 24 }}>
            {/* Performance Chart */}
            <div className="backtest-chart-card" style={{ flex: 2 }}>
              <div
                className="backtest-chart-header"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 24,
                }}
              >
                <div>
                  <h2
                    style={{
                      fontFamily: "var(--font-primary)",
                      fontSize: 18,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    {lt("智能体多策略表现", "Multi-Agent Strategy Performance")}
                  </h2>
                  <p
                    style={{
                      fontSize: 14,
                      color: "var(--text-muted)",
                      margin: "4px 0 0",
                    }}
                  >
                    {lt("回测周期:", "Backtest period:")} {backtestPeriod.periodLabel}
                  </p>
                </div>
                <div className="backtest-chart-actions" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <select
                      value={benchmarkSelectCode}
                      onChange={(e) => setBenchmarkSelectCode(e.target.value)}
                      disabled={benchmarkLoading || performanceDates.length === 0}
                      style={{
                        height: 34,
                        minWidth: 128,
                        padding: "0 10px",
                        border: "1px solid var(--border-light)",
                        borderRadius: 6,
                        background: "var(--bg-white)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                      }}
                    >
                      {benchmarkOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {lt(option.name, option.nameEn)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="figma-btn figma-btn-sm"
                      onClick={addBenchmark}
                      disabled={
                        benchmarkLoading ||
                        performanceDates.length === 0 ||
                        selectedBenchmarkCodes.includes(benchmarkSelectCode)
                      }
                      style={{
                        fontSize: 13,
                        opacity:
                          benchmarkLoading ||
                          performanceDates.length === 0 ||
                          selectedBenchmarkCodes.includes(benchmarkSelectCode)
                            ? 0.55
                            : 1,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        add
                      </span>
                      {benchmarkLoading ? lt("加载中", "Loading") : lt("添加基准", "Add Benchmark")}
                    </button>
                  </div>
                  {selectedBenchmarkCodes.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {selectedBenchmarkCodes.map((code) => {
                        const meta = BENCHMARK_OPTIONS.find((item) => item.code === code);
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => removeBenchmark(code)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              height: 28,
                              padding: "0 8px",
                              border: "1px solid var(--border-light)",
                              borderRadius: 999,
                              background: "var(--bg-page)",
                              color: "var(--text-secondary)",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                            title={lt("点击移除基准线", "Remove benchmark")}
                          >
                            {meta ? lt(meta.name, meta.nameEn) : code}
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                              close
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="figma-time-group">
                    {TIME_FRAME_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        className={`figma-time-btn ${timeFrame === option.value ? "active" : ""}`}
                        onClick={() => setTimeFrame(option.value)}
                      >
                        {lt(option.label, option.labelEn)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div ref={chartRef} style={{ width: "100%", height: 360 }} />
              {Object.keys(performanceData).length === 0 && !loading && (
                <div
                  style={{
                    height: 360,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    fontSize: 14,
                  }}
                >
                  {lt("创建或生成 Agent 后将展示模拟收益曲线", "Create or generate an agent to show the simulated return curve")}
                </div>
              )}
            </div>

            {/* Rankings */}
            <div className="backtest-rankings" style={{ flex: 1 }}>
              <h2
                style={{
                  fontFamily: "var(--font-primary)",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                {lt("收益排行", "Return Ranking")}
              </h2>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-muted)",
                  margin: "4px 0 24px",
                }}
              >
                {lt("实时模拟状态", "Live Simulation Status")}
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 20 }}
              >
                {sortedByReturn.map((a, i) => {
                  const r = {
                    rank: i + 1,
                    agent: a.name,
                    return: `${a.total_return >= 0 ? "+" : ""}${a.total_return.toFixed(2)}%`,
                    color:
                      i === 0
                        ? "#EAB308"
                        : i === 1
                          ? "#F97316"
                          : i === 2
                            ? "#93C5FD"
                            : undefined,
                    down: a.total_return < 0,
                  };
                  return (
                  <div
                    key={r.rank}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      {r.rank <= 3 ? (
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: r.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 8,
                            fontWeight: 700,
                            color: "#FFF",
                          }}
                        >
                          {r.rank}
                        </div>
                      ) : (
                        <span className="figma-rank-num">#{r.rank}</span>
                      )}
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        {r.agent}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 14,
                        fontWeight: 600,
                        color: r.down ? "var(--market-down)" : "var(--market-up)",
                      }}
                    >
                      {r.return}
                    </span>
                  </div>
                  );
                })}
                {sortedByReturn.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{lt("暂无排行数据", "No ranking data")}</p>
                )}
              </div>
              <button
                className="figma-btn"
                style={{ width: "100%", marginTop: 24 }}
              >
                {lt("查看全部排行", "View All Rankings")}
              </button>
            </div>
          </div>

          {/* ── Direct Strategy Backtest ── */}
          <div
            className="backtest-agent-table"
            style={{ padding: 16, marginTop: 24 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
                marginBottom: 14,
              }}
            >
              <div>
                <h2
                  style={{
                    fontFamily: "var(--font-primary)",
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  {lt("策略周期回测", "Strategy Period Backtest")}
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                  {lt(
                    "按“已保存策略代码 + 已选因子筛选 + 指定周期”执行回测，结果会叠加到上方收益曲线。",
                    "Run a saved strategy with selected factor filters over the chosen period; results are added to the return curve above.",
                  )}
                </p>
              </div>
              {directBacktest?.metrics && (
                <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                  <span className="backtest-status-badge running">
                    {lt("收益", "Return")} {formatPercent(directBacktest.metrics.total_return)}
                  </span>
                  <span className="backtest-status-badge">
                    {directBacktest.metrics.trading_days || 0} {lt("交易日", "trading days")}
                  </span>
                </div>
              )}
            </div>
            <div className="backtest-run-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(3, 1fr) auto", gap: 12, alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                  {lt("执行策略", "Strategy")}
                </label>
                <select
                  value={runStrategyId}
                  onChange={(e) => void handleRunStrategyChange(e.target.value)}
                  style={{
                    width: "100%",
                    height: 40,
                    boxSizing: "border-box",
                    padding: "9px 12px",
                    background: "var(--bg-page)",
                    border: "1px solid var(--border-light)",
                    borderRadius: 6,
                    fontSize: 14,
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">{lt("选择已保存策略", "Select saved strategy")}</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                  {lt("开始日期", "Start Date")}
                </label>
                <input
                  type="date"
                  value={runStartDate}
                  onChange={(e) => setRunStartDate(e.target.value)}
                  style={{ width: "100%", height: 40, boxSizing: "border-box", padding: "9px 12px", border: "1px solid var(--border-light)", borderRadius: 6 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                  {lt("结束日期（可留空）", "End Date (optional)")}
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 40px", gap: 6 }}>
                  <input
                    type="date"
                    value={runEndDate}
                    onChange={(e) => setRunEndDate(e.target.value)}
                    style={{ width: "100%", height: 40, boxSizing: "border-box", padding: "9px 12px", border: "1px solid var(--border-light)", borderRadius: 6 }}
                  />
                  <button
                    type="button"
                    className={`figma-btn ${runEndDate ? "" : "figma-btn-primary"}`}
                    onClick={() => setRunEndDate("")}
                    title={lt("持续到最新", "Continue to Latest")}
                    aria-label={lt("持续到最新", "Continue to Latest")}
                    aria-pressed={!runEndDate}
                    style={{ width: 40, height: 40, padding: 0, display: "grid", placeItems: "center" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>update</span>
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                  {lt("初始资金", "Initial Capital")}
                </label>
                <input
                  type="number"
                  min={10000}
                  step={10000}
                  value={runInitialCapital}
                  onChange={(e) => setRunInitialCapital(Number(e.target.value) || 1000000)}
                  style={{ width: "100%", height: 40, boxSizing: "border-box", padding: "9px 12px", border: "1px solid var(--border-light)", borderRadius: 6 }}
                />
              </div>
              <button
                className="figma-btn figma-btn-primary"
                disabled={directRunning || runStrategyId === ""}
                onClick={runSelectedStrategyBacktest}
                style={{ height: 40, whiteSpace: "nowrap", opacity: directRunning || runStrategyId === "" ? 0.55 : 1 }}
              >
                {directRunning ? lt("回测中...", "Backtesting...") : lt("运行策略回测", "Run Strategy Backtest")}
              </button>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {lt("策略关联因子", "Strategy factors")} {selectedRunStrategyFactorCount} {lt("个", "")}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {lt("本次回测因子", "Backtest factors")} {selectedFactorIds.size} {lt("个", "")}
              </span>
              {directBacktest?.mode && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {lt("执行模式：", "Mode: ")}{directBacktest.mode}
                </span>
              )}
              {directBacktest?.metrics?.end_date && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {lt("实际截止：", "Actual end: ")}{directBacktest.metrics.end_date}
                  {directBacktest.metrics.continuous_to_latest ? lt("（持续到最新）", " (continued to latest)") : ""}
                </span>
              )}
              {directBacktest?.metrics?.stock_universe_count !== undefined && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {lt("股票池", "Stock pool")} {directBacktest.metrics.stock_universe_count}
                  {directBacktest.metrics.stock_universe_limited
                    ? ` / ${directBacktest.metrics.stock_universe_total || "-"}`
                    : ""}
                </span>
              )}
            </div>
          </div>

          {/* ── Agent Roster Table ── */}
          <div className="backtest-agent-table">
            <div className="backtest-agent-table-header">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  className="material-symbols-outlined"
                  style={{ color: "var(--primary)" }}
                >
                  smart_toy
                </span>
                <h2
                  style={{
                    fontFamily: "var(--font-primary)",
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  {lt("智能体集群管理", "Agent Cluster Management")}
                </h2>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="figma-btn figma-btn-sm">{lt("全部暂停", "Pause All")}</button>
                <button className="figma-btn figma-btn-sm figma-btn-primary">
                  {lt("全部重启", "Restart All")}
                </button>
              </div>
            </div>

            {/* Create Agent */}
            <div
              style={{
                padding: 16,
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <div className="backtest-agent-create-row" style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    {lt("智能体名称", "Agent Name")}
                  </label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !creating) handleCreate();
                    }}
                    placeholder={lt("输入 Agent 名称...", "Enter agent name...")}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      background: "var(--bg-page)",
                      border: "1px solid var(--border-light)",
                      borderRadius: 6,
                      fontSize: 14,
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                </div>
                <div style={{ width: 224 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    {lt("关联策略", "Linked Strategy")}
                  </label>
                  <select
                    value={newStrategyId}
                    onChange={(e) =>
                      setNewStrategyId(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      background: "var(--bg-page)",
                      border: "1px solid var(--border-light)",
                      borderRadius: 6,
                      fontSize: 14,
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  >
                    <option value="">{lt("无关联策略", "No linked strategy")}</option>
                    {strategies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={seedBacktestAgents}
                  disabled={creating}
                  className="figma-btn"
                  style={{ whiteSpace: "nowrap" }}
                >
                  {lt("生成测试智能体", "Seed Test Agents")}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="figma-btn figma-btn-primary"
                  style={{
                    whiteSpace: "nowrap",
                    opacity: creating || !newName.trim() ? 0.5 : 1,
                  }}
                >
                  {creating ? lt("创建中...", "Creating...") : lt("＋ 创建 Agent", "+ Create Agent")}
                </button>
              </div>
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: "var(--bg-page)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: customFactors.length ? 10 : 0,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {lt("自定义因子筛选", "Custom Factor Filters")}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 12,
                        color: "var(--text-muted)",
                      }}
                    >
                      {lt(
                        "来自因子挖掘，创建 Agent 时会保存因子快照用于后续研究复现",
                        "Factors come from Factor Mining. Agent creation saves a factor snapshot for reproducible research.",
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      flexShrink: 0,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "var(--primary-light)",
                      color: "var(--primary)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {lt("已选", "Selected")} {selectedFactorIds.size}
                  </span>
                </div>
                {customFactors.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {customFactors.map((factor) => {
                      const checked = selectedFactorIds.has(factor.id);
                      return (
                        <button
                          key={factor.id}
                          type="button"
                          onClick={() => toggleFactor(factor.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "7px 10px",
                            borderRadius: 999,
                            border: checked
                              ? "1px solid var(--primary)"
                              : "1px solid var(--border-light)",
                            background: checked ? "var(--primary-light)" : "var(--bg-white)",
                            color: checked
                              ? "var(--primary)"
                              : "var(--text-secondary)",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title={factor.expression}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 14 }}
                          >
                            {checked ? "check_circle" : "radio_button_unchecked"}
                          </span>
                          {factor.display_name || factor.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {lt("暂无可用因子，可先到因子挖掘页创建并保存。", "No factors available. Create and save factors in Factor Mining first.")}
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            {error && (
              <div
                style={{
                  margin: 16,
                  padding: "8px 12px",
                  background: "var(--danger-bg)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--danger)",
                }}
              >
                ⚠ {error}
              </div>
            )}

            {loading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 48,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    border: "2px solid var(--primary)",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 14,
                    color: "var(--text-muted)",
                  }}
                >
                  {lt("加载中...", "Loading...")}
                </span>
              </div>
            ) : agents.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: 48,
                  fontSize: 14,
                  color: "var(--text-muted)",
                }}
              >
                {lt("暂无 Agent，请使用上方表单创建", "No agents yet. Create one with the form above.")}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="figma-table">
                  <thead>
                    <tr>
                      <th>{lt("智能体标识", "Agent")}</th>
                      <th>{lt("策略类型", "Strategy Type")}</th>
                      <th>{lt("关联因子", "Factors")}</th>
                      <th>{lt("执行状态", "Status")}</th>
                      <th style={{ textAlign: "right" }}>
                        {backtestPeriod.returnLabel}
                      </th>
                      <th style={{ textAlign: "right" }}>{lt("回撤", "Drawdown")}</th>
                      <th style={{ textAlign: "center" }}>{lt("操作", "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((agent) => {
                        const isRunning = agent.status === "running";
                        const isPositive = agent.total_return >= 0;
                        const busy = !!actionLoading[agent.id];
                        const factorSpecs = getAgentFactorSpecs(agent);
                        return (
                          <tr key={agent.id}>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                              }}
                            >
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  background: isRunning
                                    ? "var(--primary-light)"
                                    : "var(--bg-gray)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <span
                                  className="material-symbols-outlined"
                                  style={{
                                    fontSize: 16,
                                    color: isRunning
                                      ? "var(--primary)"
                                      : "var(--text-muted)",
                                  }}
                                >
                                  smart_toy
                                </span>
                              </div>
                              <div>
                                <p
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    margin: 0,
                                  }}
                                >
                                  {agent.name}
                                </p>
                                <p
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-muted)",
                                    margin: 0,
                                  }}
                                >
                                  UID: QX-{agent.id}-M
                                </p>
                              </div>
                            </div>
                          </td>
                          <td
                            style={{
                              fontSize: 14,
                              color: "var(--text-secondary)",
                              }}
                            >
                              {getAgentStrategyLabel(agent)}
                            </td>
                            <td>
                              {factorSpecs.length ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {factorSpecs.slice(0, 3).map((factor, idx) => (
                                    <span
                                      key={`${agent.id}-${factor.id || factor.name || idx}`}
                                      style={{
                                        display: "inline-flex",
                                        maxWidth: 160,
                                        padding: "3px 8px",
                                        borderRadius: 999,
                                        background: "var(--primary-light)",
                                        color: "var(--primary)",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {factor.display_name || factor.name || `因子${idx + 1}`}
                                    </span>
                                  ))}
                                  {factorSpecs.length > 3 && (
                                    <span
                                      style={{
                                        fontSize: 12,
                                        color: "var(--text-muted)",
                                      }}
                                    >
                                      +{factorSpecs.length - 3}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                  未关联
                                </span>
                              )}
                            </td>
                            <td>
                            <span
                              className={`backtest-status-badge ${isRunning ? "running" : "stopped"}`}
                            >
                              <span
                                className={`figma-status-dot ${isRunning ? "green" : "yellow"}`}
                                style={{ width: 6, height: 6 }}
                              />
                              {isRunning ? lt("运行中", "Running") : lt("已停止", "Stopped")}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <span
                              style={{
                                fontFamily: "var(--font-display)",
                                fontSize: 16,
                                color: isPositive
                                  ? "var(--market-up)"
                                  : "var(--market-down)",
                              }}
                            >
                              {isPositive ? "+" : ""}
                              {agent.total_return.toFixed(2)}%
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <span
                              style={{
                                fontFamily: "var(--font-display)",
                                fontSize: 16,
                                color: "var(--text-muted)",
                              }}
                            >
                              {agent.drawdown !== undefined
                                ? `${agent.drawdown.toFixed(2)}%`
                                : "-4.12%"}
                            </span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ display: "inline-flex", gap: 4 }}>
                              {isRunning ? (
                                <button
                                  onClick={() => handleStop(agent.id)}
                                  disabled={busy}
                                  className="figma-btn figma-btn-sm"
                                  style={{ padding: "4px 12px", fontSize: 12 }}
                                >
                                  {busy ? "..." : lt("停止", "Stop")}
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStart(agent.id)}
                                  disabled={busy}
                                  className="figma-btn figma-btn-sm figma-btn-primary"
                                  style={{ padding: "4px 12px", fontSize: 12 }}
                                >
                                  {busy ? "..." : lt("启动", "Start")}
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(agent.id)}
                                disabled={busy}
                                className="figma-btn figma-btn-sm"
                                style={{
                                  padding: "4px 12px",
                                  fontSize: 12,
                                  color: "var(--danger)",
                                }}
                              >
                                {lt("删除", "Delete")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Load More */}
            <div
              style={{
                padding: 16,
                borderTop: "1px solid var(--border-light)",
                textAlign: "center",
              }}
            >
              <button className="figma-btn" style={{ width: "100%" }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  expand_more
                </span>
                {lt("加载更多智能体", "Load more agents")} ({runningCount} {lt("运行中", "Active")},{" "}
                {agents.length - runningCount} {lt("空闲", "Idle")})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
