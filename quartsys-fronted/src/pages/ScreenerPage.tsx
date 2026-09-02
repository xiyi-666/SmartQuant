import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Maximize2, Minimize2, SlidersHorizontal } from "lucide-react";
import { api } from "../api";
import KLineChart, { type KLineAdjustmentMode, type KLineAdjustmentStatus } from "../components/KLineChart";
import LongTaskRewardAdModal from "../components/LongTaskRewardAdModal";
import { getAuthUser } from "../shared/auth";
import { useLanguage } from "../shared/language";
import { useMarket } from "../shared/market";
import { userScopedStorageKey } from "../shared/pageCache";

type FactorKey =
  | "price"
  | "volume"
  | "pe_ratio"
  | "pb_ratio"
  | "market_cap"
  | "ma60_gap"
  | "volume_spike"
  | "consecutive_yin_hold"
  | "ma_deviation_strategy";

type FactorParam = { name: string; value: number };
type FactorConfig = { factor: string; params: FactorParam[] };
type CustomFactorParamDef = {
  name: string;
  label?: string;
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  type?: string;
};
type CustomFactorParamValues = Record<string, number | undefined>;
type CustomFactor = {
  id: number;
  name: string;
  display_name?: string;
  category?: string;
  expression: string;
  description?: string | null;
  params_json?: string | null;
  output_type?: string;
  default_filter?: string | null;
  group_name?: string;
  is_builtin?: number;
};

type ScreenerRow = {
  code: string;
  name: string;
  industry?: string;
  concept_board?: string;
  board?: string;
  area?: string;
  date?: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount?: number;
  amplitude?: number;
  turnover_rate?: number;
  change_amount?: number;
  market_cap?: number;
  circulating_market_cap?: number;
  change_pct: number;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  roe_pct?: number | null;
  ma60?: number;
  score: number;
  score_pct?: number;
};

type PresetItem = { id: number; name: string; config: FactorConfig[]; date?: string };
type CandlePoint = {
  date: string;
  open: number;
  close: number;
  low: number;
  high: number;
  volume: number;
  amount?: number | null;
};

type ScreenerQueryResponse = {
  total: number;
  universe_count?: number;
  hit_rate?: number;
  rows: ScreenerRow[];
  date?: string;
  cache?: { hit?: boolean; effective_trading_date?: string };
};
type ScreenerTaskSummary = {
  task_id: number;
  market?: string;
  status: "pending" | "running" | "done" | "failed" | string;
  requested_date?: string;
  effective_date?: string;
  request?: Record<string, any>;
  result?: ScreenerQueryResponse;
  error?: string;
  created_at?: string;
  updated_at?: string;
};
type SearchHit = { code: string; name: string; full_code?: string; board?: string };
type InlineFactorPayload = {
  name?: string;
  expression: string;
  params?: Record<string, number>;
  output_type?: string;
  filter_min?: number;
  filter_max?: number;
};

type MarketCapStat = {
  gt1000yi: number;
  y500to1000: number;
  y100to500: number;
  lt100yi: number;
};

type PeStat = {
  gt100: number;
  m30to100: number;
  m0to30: number;
  lt0: number;
};

type PeBucketKey = keyof PeStat;
type MarketCapBucketKey = keyof MarketCapStat;
type DistributionModalState = {
  title: string;
  subtitle: string;
  rows: ScreenerRow[];
};
type ScreenerCacheEntry = {
  key: string;
  requestedDate: string;
  effectiveDate?: string;
  total: number;
  universeCount?: number;
  hitRate?: number | null;
  rows: ScreenerRow[];
  cachedAt: number;
  keyword?: string;
  logic?: string;
  market?: string;
};

const SCREENER_RESULT_CACHE_KEY = "qs:screener:result-cache:v2";
const ACTIVE_SCREENER_TASK_KEY = "qs:screener:active-task";
const MAX_SCREENER_CACHE_DAYS = 20;
const ADMIN_ONLY_FACTOR_KEYS = new Set<FactorKey>([
  "ma60_gap",
  "volume_spike",
  "consecutive_yin_hold",
  "ma_deviation_strategy",
]);

const FACTOR_LABELS: Record<
  FactorKey,
  { zh: string; en: string; unit: string }
> = {
  price: { zh: "价格", en: "Price", unit: "元" },
  volume: { zh: "成交量", en: "Volume", unit: "万手" },
  pe_ratio: { zh: "市盈率", en: "P/E", unit: "倍" },
  pb_ratio: { zh: "市净率", en: "P/B", unit: "倍" },
  market_cap: { zh: "市值", en: "Market Cap", unit: "亿" },
  ma60_gap: { zh: "60日线附近", en: "Near MA60", unit: "%" },
  volume_spike: { zh: "短期放量", en: "Volume Spike", unit: "倍" },
  consecutive_yin_hold: { zh: "连阴不跌", en: "Bearish Hold", unit: "天" },
  ma_deviation_strategy: { zh: "偏离值策略(20/60日线)", en: "MA20/60 Deviation", unit: "度" },
};

type StrategyGroup = {
  id: string;
  name: string;
  presets: PresetItem[];
};

const DEFAULT_GROUP_ID = "default";

const PRESET_FACTOR_HINTS = [
  "Vol_Breakout_V2",
  "Mean_Reversion_Alpha",
  "RSI_Divergence_8H",
  "Institutional_Flow_X",
];

function defaultParams(key: FactorKey): FactorParam[] {
  switch (key) {
    case "price":
      return [
        { name: "min", value: 0 },
        { name: "max", value: 100 },
      ];
    case "volume":
      return [
        { name: "min", value: 0 },
        { name: "max", value: 100000 },
      ];
    case "pe_ratio":
      return [
        { name: "min", value: 0 },
        { name: "max", value: 80 },
      ];
    case "pb_ratio":
      return [
        { name: "min", value: 0 },
        { name: "max", value: 20 },
      ];
    case "market_cap":
      return [
        { name: "min", value: 1 },
        { name: "max", value: 50000 },
      ];
    case "ma60_gap":
      return [
        { name: "period", value: 60 },
        { name: "max_deviation", value: 0.1 },
        { name: "trend_lookback", value: 30 },
      ];
    case "volume_spike":
      return [
        { name: "check_days", value: 15 },
        { name: "volume_multiplier", value: 2.0 },
        { name: "observe_days", value: 5 },
      ];
    case "consecutive_yin_hold":
      return [{ name: "check_days", value: 10 }];
    case "ma_deviation_strategy":
      return [
        { name: "short_ma", value: 20 },
        { name: "long_ma", value: 60 },
        { name: "slope_degrees", value: 15 },
      ];
  }
}

function getParamLabel(name: string) {
  const labels: Record<string, string> = {
    value: "阈值",
    min: "下限",
    max: "上限",
    period: "均线周期",
    max_deviation: "偏离度",
    trend_lookback: "趋势回溯",
    check_days: "检查天数",
    volume_multiplier: "放量倍数",
    observe_days: "观察天数",
    short_ma: "短期均线",
    long_ma: "长期均线",
    slope_degrees: "均线斜率",
  };
  return labels[name] || name;
}

function isRangeFactor(key: FactorKey) {
  return ["price", "volume", "pe_ratio", "pb_ratio", "market_cap"].includes(key);
}

function factorParamStep(key: FactorKey, paramName: string) {
  if (paramName.includes("deviation")) return 0.01;
  if (key === "price" || key === "pe_ratio" || key === "pb_ratio") return 0.01;
  return 1;
}

function normalizeBuiltinFactorParams(key: FactorKey, params?: FactorParam[]): FactorParam[] {
  if (!isRangeFactor(key)) return params?.length ? params : defaultParams(key);
  const map = new Map((params || []).map((param) => [param.name, param.value]));
  if (map.has("min") || map.has("max")) {
    const defaults = defaultParams(key);
    return defaults.map((param) => ({
      ...param,
      value: map.has(param.name) ? Number(map.get(param.name)) : param.value,
    }));
  }
  const legacyValue = map.get("value");
  const defaults = defaultParams(key);
  if (legacyValue === undefined) return defaults;
  if (key === "volume") {
    return defaults.map((param) =>
      param.name === "min" ? { ...param, value: Number(legacyValue) } : param,
    );
  }
  return defaults.map((param) =>
    param.name === "max" ? { ...param, value: Number(legacyValue) } : param,
  );
}

function toFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseCustomFactorParamDefs(
  paramsJson?: string | null,
): CustomFactorParamDef[] {
  if (!paramsJson) return [];
  try {
    const parsed = JSON.parse(paramsJson);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => item && typeof item === "object" && item.name)
        .map((item) => ({
          name: String(item.name),
          label: item.label ? String(item.label) : String(item.name),
          default: toFiniteNumber(item.default) ?? 0,
          min: toFiniteNumber(item.min),
          max: toFiniteNumber(item.max),
          step: toFiniteNumber(item.step) ?? 1,
          type: item.type ? String(item.type) : "float",
        }));
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed)
        .filter(([, value]) => toFiniteNumber(value) !== undefined)
        .map(([name, value]) => ({
          name,
          label: name,
          default: toFiniteNumber(value) ?? 0,
          step: 1,
          type: "float",
        }));
    }
  } catch {}
  return [];
}

function parseCustomFactorFilter(defaultFilter?: string | null): {
  min?: number;
  max?: number;
} {
  if (!defaultFilter) return {};
  try {
    const parsed = JSON.parse(defaultFilter);
    return {
      min: toFiniteNumber(parsed?.min),
      max: toFiniteNumber(parsed?.max),
    };
  } catch {
    return {};
  }
}

function getCustomFactorDefaultValues(
  factor: CustomFactor,
): CustomFactorParamValues {
  const values: CustomFactorParamValues = {};
  parseCustomFactorParamDefs(factor.params_json).forEach((param) => {
    values[param.name] = toFiniteNumber(param.default) ?? 0;
  });
  const filter = parseCustomFactorFilter(factor.default_filter);
  if (filter.min !== undefined) values.__filter_min = filter.min;
  if (filter.max !== undefined) values.__filter_max = filter.max;
  return values;
}

function factorParamItemsToValues(params?: FactorParam[]): CustomFactorParamValues {
  const values: CustomFactorParamValues = {};
  (params || []).forEach((param) => {
    const value = toFiniteNumber(param.value);
    if (value !== undefined) values[param.name] = value;
  });
  return values;
}

function buildCustomFactorParams(
  factor: CustomFactor,
  values?: CustomFactorParamValues,
): FactorParam[] {
  const effectiveValues = {
    ...getCustomFactorDefaultValues(factor),
    ...(values || {}),
  };
  const params = parseCustomFactorParamDefs(factor.params_json).map((param) => ({
    name: param.name,
    value:
      toFiniteNumber(effectiveValues[param.name]) ??
      toFiniteNumber(param.default) ??
      0,
  }));
  if ((factor.output_type || "scalar") !== "boolean") {
    const min = toFiniteNumber(effectiveValues.__filter_min);
    const max = toFiniteNumber(effectiveValues.__filter_max);
    if (min !== undefined) params.push({ name: "__filter_min", value: min });
    if (max !== undefined) params.push({ name: "__filter_max", value: max });
  }
  return params;
}

function parseHistory(raw: unknown): CandlePoint[] {
  const points = Array.isArray((raw as { data?: unknown[] })?.data)
    ? ((raw as { data: unknown[] }).data as unknown[])
    : [];

  const toFinite = (value: unknown, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const positive = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  return points
    .map((item) => {
      if (!Array.isArray(item) || item.length < 5) return null;
      const [date, open, close, low, high, rawVolume, rawAmount] = item;
      const closeValue = toFinite(close);
      const amount = positive(rawAmount);
      let volume = positive(rawVolume);
      if (!volume && amount && closeValue > 0) {
        volume = amount / closeValue / 100;
      }
      return {
        date: String(date || ""),
        open: toFinite(open),
        close: closeValue,
        low: toFinite(low),
        high: toFinite(high),
        volume,
        amount,
      } as CandlePoint;
    })
    .filter((item): item is CandlePoint => Boolean(item?.date));
}

function calcStats(rows: ScreenerRow[]): {
  marketCap: MarketCapStat;
  pe: PeStat;
} {
  const marketCap: MarketCapStat = {
    gt1000yi: 0,
    y500to1000: 0,
    y100to500: 0,
    lt100yi: 0,
  };
  const pe: PeStat = { gt100: 0, m30to100: 0, m0to30: 0, lt0: 0 };

  rows.forEach((r) => {
    const cap = normalizeMarketCapYi(r.market_cap);
    if (cap == null) return;
    if (cap > 1000) marketCap.gt1000yi += 1;
    else if (cap >= 500) marketCap.y500to1000 += 1;
    else if (cap >= 100) marketCap.y100to500 += 1;
    else marketCap.lt100yi += 1;

    if (r.pe_ratio == null) return;
    const peRatio = Number(r.pe_ratio);
    if (peRatio > 100) pe.gt100 += 1;
    else if (peRatio >= 30) pe.m30to100 += 1;
    else if (peRatio >= 0) pe.m0to30 += 1;
    else pe.lt0 += 1;
  });

  return { marketCap, pe };
}

function normalizeMarketCapYi(value?: number | null) {
  const cap = Number(value);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return cap > 1_000_000 ? cap / 100_000_000 : cap;
}

function formatMarketCapYi(value?: number | null, unit = "亿") {
  const cap = normalizeMarketCapYi(value);
  if (cap == null) return "-";
  const largeUnit = unit.startsWith("亿") ? `万亿${unit.slice(1)}` : `10K ${unit}`;
  if (cap >= 10000) return `${(cap / 10000).toFixed(2)}${largeUnit}`;
  if (cap >= 100) return `${cap.toFixed(0)}${unit}`;
  if (cap >= 10) return `${cap.toFixed(1)}${unit}`;
  return `${cap.toFixed(2)}${unit}`;
}

function fmtVol(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}亿`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(2)}万`;
  return `${Math.round(v)}`;
}

function fmtAmount(value?: number | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "-";
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(2)}亿`;
  if (amount >= 10_000) return `${(amount / 10_000).toFixed(1)}万`;
  return `${Math.round(amount)}`;
}

function fmtNullableNumber(value?: number | null, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function fmtPercent(value?: number | null, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%` : "-";
}

function fmtPlainPercent(value?: number | null, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : "-";
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function readScreenerResultCache(): ScreenerCacheEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(userScopedStorageKey(SCREENER_RESULT_CACHE_KEY)) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item === "object" && Array.isArray(item.rows))
      : [];
  } catch {
    return [];
  }
}

function writeScreenerResultCache(entries: ScreenerCacheEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      userScopedStorageKey(SCREENER_RESULT_CACHE_KEY),
      JSON.stringify(entries.slice(0, MAX_SCREENER_CACHE_DAYS)),
    );
  } catch {
    // localStorage may be full or disabled; screening itself should continue.
  }
}

function upsertScreenerResultCache(entry: ScreenerCacheEntry) {
  const cacheDate = entry.effectiveDate || entry.requestedDate || "latest";
  const cacheMarket = entry.market || "CN";
  const next = [
    {
      ...entry,
      key: `${cacheMarket}:${cacheDate}`,
      requestedDate: cacheDate,
      effectiveDate: cacheDate,
    },
    ...readScreenerResultCache().filter((item) => {
      const itemDate = item.effectiveDate || item.requestedDate || "latest";
      return !((item.market || "CN") === cacheMarket && itemDate === cacheDate);
    }),
  ].slice(0, MAX_SCREENER_CACHE_DAYS);
  writeScreenerResultCache(next);
  return next;
}

function formatHitRate(rate?: number | null) {
  if (rate === undefined || rate === null || !Number.isFinite(rate)) return "-";
  return `${(Math.max(0, rate) * 100).toFixed(2)}%`;
}

function getPeBucketRows(rows: ScreenerRow[], bucket: PeBucketKey) {
  return rows
    .filter((row) => {
      if (row.pe_ratio == null) return false;
      const pe = Number(row.pe_ratio);
      if (!Number.isFinite(pe)) return false;
      if (bucket === "gt100") return pe > 100;
      if (bucket === "m30to100") return pe >= 30 && pe <= 100;
      if (bucket === "m0to30") return pe >= 0 && pe < 30;
      return pe < 0;
    })
    .sort((a, b) => Number(b.pe_ratio || 0) - Number(a.pe_ratio || 0));
}

function getMarketCapBucketRows(rows: ScreenerRow[], bucket: MarketCapBucketKey) {
  return rows
    .filter((row) => {
      const cap = normalizeMarketCapYi(row.market_cap);
      if (cap == null) return false;
      if (bucket === "gt1000yi") return cap > 1000;
      if (bucket === "y500to1000") return cap >= 500 && cap <= 1000;
      if (bucket === "y100to500") return cap >= 100 && cap < 500;
      return cap < 100;
    })
    .sort(
      (a, b) =>
        (normalizeMarketCapYi(b.market_cap) || 0) -
        (normalizeMarketCapYi(a.market_cap) || 0),
    );
}

function tByLang(lang: "zh" | "en", zh: string, en: string) {
  return lang === "zh" ? zh : en;
}

function getExchange(code: string): { label: string; color: string } {
  const upper = code.toUpperCase().trim();
  // 按后缀判断
  if (upper.endsWith(".SH")) return { label: "SSE", color: "#E74C3C" };
  if (upper.endsWith(".SZ")) return { label: "SZSE", color: "#2ECC71" };
  if (upper.endsWith(".BJ")) return { label: "BSE", color: "#F39C12" };
  if (upper.endsWith(".HK") || upper.startsWith("HK"))
    return { label: "HKEX", color: "#D9AA4E" };
  if (upper.endsWith(".US") || upper.startsWith("US"))
    return { label: "US", color: "#EF4444" };
  // 按代码前缀判断（无后缀时）
  const digits = upper.replace(/[^0-9]/g, "");
  if (digits.startsWith("6")) return { label: "SSE", color: "#E74C3C" };
  if (digits.startsWith("0") || digits.startsWith("3"))
    return { label: "SZSE", color: "#2ECC71" };
  if (digits.startsWith("4") || digits.startsWith("8"))
    return { label: "BSE", color: "#F39C12" };
  // 科创板 688xxx
  if (digits.startsWith("688")) return { label: "SSE", color: "#E74C3C" };
  return { label: "—", color: "var(--text-muted)" };
}

function getExchangeName(code: string, fullCode?: string, board?: string) {
  const normalized = String(fullCode || code || "").toUpperCase();
  const rawCode = String(code || "").toLowerCase();
  if (normalized.endsWith(".HK") || rawCode.startsWith("hk")) return "港交所";
  if (normalized.endsWith(".US") || rawCode.startsWith("us")) return "美股";
  const ex = getExchange(fullCode || code).label;
  if (ex === "SSE") return "上交所";
  if (ex === "SZSE") return "深交所";
  if (ex === "BSE") return "北交所";
  return board || "交易所";
}

function displaySearchCode(hit: SearchHit) {
  return hit.full_code || hit.code;
}

export default function ScreenerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguage();
  const { market, definition } = useMarket();
  const isSystemAdmin = String(getAuthUser()?.role || "").toLowerCase() === "admin";
  const visibleBuiltinFactorKeys = (Object.keys(FACTOR_LABELS) as FactorKey[]).filter(
    (key) => isSystemAdmin || !ADMIN_ONLY_FACTOR_KEYS.has(key),
  );
  const marketCapDisplayUnit = tByLang(
    lang,
    definition.marketCapUnitZh,
    ` ${definition.marketCapUnitEn}`,
  );

  const [keyword, setKeyword] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [trendQuery, setTrendQuery] = useState("");
  const [trendHits, setTrendHits] = useState<SearchHit[]>([]);
  const [showTrendHits, setShowTrendHits] = useState(false);
  const [logic, setLogic] = useState<"and" | "or">("and");
  const [histDate, setHistDate] = useState("");
  const [activeAggregation, setActiveAggregation] = useState<{
    type: "industry" | "exchange";
    name: string;
  } | null>(null);

  const [selectedFactors, setSelectedFactors] = useState<FactorKey[]>(() =>
    isSystemAdmin
      ? [
          "market_cap",
          "ma60_gap",
          "volume_spike",
          "consecutive_yin_hold",
          "ma_deviation_strategy",
        ]
      : ["market_cap"],
  );
  const [customFactors, setCustomFactors] = useState<CustomFactor[]>([]);
  const [selectedCustomFactorIds, setSelectedCustomFactorIds] = useState<Set<number>>(
    new Set(),
  );
  const [customFactorParams, setCustomFactorParams] = useState<
    Record<number, CustomFactorParamValues>
  >({});
  const [expandedCustomFactorIds, setExpandedCustomFactorIds] = useState<Set<number>>(
    new Set(),
  );
  const [customFactorListExpanded, setCustomFactorListExpanded] = useState(true);
  const [customFactorListZoomed, setCustomFactorListZoomed] = useState(false);
  const [factorConfig, setFactorConfig] = useState<
    Record<FactorKey, FactorParam[]>
  >({
    price: defaultParams("price"),
    volume: defaultParams("volume"),
    pe_ratio: defaultParams("pe_ratio"),
    pb_ratio: defaultParams("pb_ratio"),
    market_cap: defaultParams("market_cap"),
    ma60_gap: defaultParams("ma60_gap"),
    volume_spike: defaultParams("volume_spike"),
    consecutive_yin_hold: defaultParams("consecutive_yin_hold"),
    ma_deviation_strategy: defaultParams("ma_deviation_strategy"),
  });

  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [presetId, setPresetId] = useState<number | "">("");

  // Strategy Groups
  const [groups, setGroups] = useState<StrategyGroup[]>(() => {
    try {
      const raw = localStorage.getItem("screener_strategy_groups");
      return raw
        ? JSON.parse(raw)
        : [{ id: DEFAULT_GROUP_ID, name: "默认分组", presets: [] }];
    } catch {
      return [{ id: DEFAULT_GROUP_ID, name: "默认分组", presets: [] }];
    }
  });
  const [activeGroupId, setActiveGroupId] = useState(DEFAULT_GROUP_ID);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  useEffect(() => {
    if (isSystemAdmin) return;
    setSelectedFactors((current) => current.filter((key) => !ADMIN_ONLY_FACTOR_KEYS.has(key)));
  }, [isSystemAdmin]);

  const activeGroup = groups.find((g) => g.id === activeGroupId) || groups[0];

  function persistGroups(next: StrategyGroup[]) {
    setGroups(next);
    localStorage.setItem("screener_strategy_groups", JSON.stringify(next));
  }

  function createGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const id = `group_${Date.now()}`;
    persistGroups([...groups, { id, name, presets: [] }]);
    setActiveGroupId(id);
    setNewGroupName("");
    setShowNewGroup(false);
  }

  function deleteGroup(id: string) {
    if (id === DEFAULT_GROUP_ID) return;
    const next = groups.filter((g) => g.id !== id);
    if (!next.length)
      next.push({ id: DEFAULT_GROUP_ID, name: "默认分组", presets: [] });
    persistGroups(next);
    if (activeGroupId === id) setActiveGroupId(next[0].id);
  }

  function renameGroup(id: string, name: string) {
    persistGroups(groups.map((g) => (g.id === id ? { ...g, name } : g)));
    setEditingGroupId(null);
  }

  function applyFactorConfigList(list: FactorConfig[]) {
    const builtinKeys = new Set(visibleBuiltinFactorKeys);
    const nextFactors = list
      .map((item) => item.factor as FactorKey)
      .filter((factor) => builtinKeys.has(factor));
    const nextConfig = { ...factorConfig };
    const nextCustomFactorIds = new Set<number>();
    const nextCustomParams: Record<number, CustomFactorParamValues> = {};

    list.forEach((item) => {
      if (builtinKeys.has(item.factor)) {
        const key = item.factor as FactorKey;
        nextConfig[key] = normalizeBuiltinFactorParams(key, item.params);
        return;
      }
      if (!String(item.factor).startsWith("custom:")) return;
      const name = String(item.factor).replace("custom:", "");
      const factor = customFactors.find((candidate) => candidate.name === name);
      if (!factor) return;
      nextCustomFactorIds.add(factor.id);
      nextCustomParams[factor.id] = {
        ...getCustomFactorDefaultValues(factor),
        ...factorParamItemsToValues(item.params),
      };
    });

    setSelectedFactors(nextFactors);
    setFactorConfig(nextConfig);
    setSelectedCustomFactorIds(nextCustomFactorIds);
    setCustomFactorParams((prev) => ({ ...prev, ...nextCustomParams }));
    setExpandedCustomFactorIds(nextCustomFactorIds);
  }

  function savePresetToGroup() {
    const name = presetName.trim();
    if (!name) return;
    const preset: PresetItem = {
      id: Date.now(),
      name,
      config: configList,
      date: histDate || undefined,
    };
    persistGroups(
      groups.map((g) =>
        g.id === activeGroupId ? { ...g, presets: [...g.presets, preset] } : g,
      ),
    );
    setPresetName("");
  }

  function loadPresetFromGroup(preset: PresetItem) {
    const list = Array.isArray(preset.config) ? preset.config : [];
    applyFactorConfigList(list);
    setHistDate(preset.date || "");
    setStatus(
      tByLang(
        lang,
        `已加载参数：${preset.name}${preset.date ? `（${preset.date}）` : ""}`,
        `Loaded: ${preset.name}${preset.date ? ` (${preset.date})` : ""}`,
      ),
    );
  }

  function deletePresetFromGroup(presetId: number) {
    persistGroups(
      groups.map((g) =>
        g.id === activeGroupId
          ? { ...g, presets: g.presets.filter((p) => p.id !== presetId) }
          : g,
      ),
    );
  }

  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [universeCount, setUniverseCount] = useState(0);
  const [hitRate, setHitRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"filter" | "chart" | "results">("filter");
  const [resultDateFilter, setResultDateFilter] = useState("all");
  const [inlineFactors, setInlineFactors] = useState<InlineFactorPayload[]>([]);
  const [distributionModal, setDistributionModal] =
    useState<DistributionModalState | null>(null);
  const [screeningTasks, setScreeningTasks] = useState<ScreenerTaskSummary[]>([]);
  const [activeScreeningTaskId, setActiveScreeningTaskId] = useState<number | null>(null);
  const screeningTaskPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeScreeningStorageKey = userScopedStorageKey(`${ACTIVE_SCREENER_TASK_KEY}:${market}`);

  const [activeCode, setActiveCode] = useState("");
  const [activeName, setActiveName] = useState("");
  const [adjustmentMode, setAdjustmentMode] = useState<KLineAdjustmentMode>("none");
  const [chartAdjustmentStatus, setChartAdjustmentStatus] = useState<KLineAdjustmentStatus | null>(null);
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [checkedCodes, setCheckedCodes] = useState<Set<string>>(new Set());
  const [watchGroup, setWatchGroup] = useState("默认分组");
  const [watchGroups, setWatchGroups] = useState<string[]>(["默认分组"]);
  const [newWatchGroup, setNewWatchGroup] = useState("");
  const [addingWatch, setAddingWatch] = useState(false);
  const [watchNotice, setWatchNotice] = useState("");
  const [quote, setQuote] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    prevClose?: number | null;
  } | null>(null);
  const runningScreeningTaskCount = screeningTasks.filter(
    (task) =>
      (task.market || "CN") === market &&
      ["pending", "running"].includes(String(task.status || "").toLowerCase()),
  ).length;

  const configList = useMemo<FactorConfig[]>(
    () => {
      const builtinConfigs = selectedFactors.map((factor) => ({
        factor,
        params: factorConfig[factor],
      }));
      const customConfigs = customFactors
        .filter((factor) => selectedCustomFactorIds.has(factor.id))
        .map((factor) => ({
          factor: `custom:${factor.name}`,
          params: buildCustomFactorParams(factor, customFactorParams[factor.id]),
        }));
      return [...builtinConfigs, ...customConfigs];
    },
    [
      selectedFactors,
      factorConfig,
      customFactors,
      selectedCustomFactorIds,
      customFactorParams,
    ],
  );

  useEffect(() => {
    const state = (location.state || {}) as {
      factorId?: number;
      factorExpression?: string;
      factorParams?: Record<string, number>;
      factorName?: string;
      outputType?: string;
      filterMin?: number;
      filterMax?: number;
    };
    const routeFactorId = toFiniteNumber(state.factorId);
    if (routeFactorId) {
      if (!customFactors.length) return;
      const matchedFactor = customFactors.find((factor) => factor.id === routeFactorId);
      if (matchedFactor) {
        const values: CustomFactorParamValues = {
          ...getCustomFactorDefaultValues(matchedFactor),
          ...(state.factorParams || {}),
        };
        if (state.filterMin !== undefined) values.__filter_min = state.filterMin;
        if (state.filterMax !== undefined) values.__filter_max = state.filterMax;
        setInlineFactors([]);
        setSelectedCustomFactorIds((prev) => new Set(prev).add(matchedFactor.id));
        setCustomFactorParams((prev) => ({ ...prev, [matchedFactor.id]: values }));
        setExpandedCustomFactorIds((prev) => new Set(prev).add(matchedFactor.id));
        setCustomFactorListExpanded(true);
        setStatus(
          tByLang(
            lang,
            `已选中因子：${matchedFactor.display_name || matchedFactor.name}`,
            `Selected factor: ${matchedFactor.display_name || matchedFactor.name}`,
          ),
        );
        return;
      }
    }
    if (!state.factorExpression) return;
    const appliedFactor: InlineFactorPayload = {
      name: state.factorName || "inline_factor",
      expression: state.factorExpression,
      params: state.factorParams || {},
      output_type: state.outputType || "scalar",
      filter_min: state.filterMin,
      filter_max: state.filterMax,
    };
    setInlineFactors([appliedFactor]);
    setStatus(
      tByLang(
        lang,
        `已应用因子：${appliedFactor.name}`,
        `Applied factor: ${appliedFactor.name}`,
      ),
    );
  }, [customFactors, lang, location.state]);

  const filteredRows = useMemo(() => {
    const key = tableFilter.trim().toLowerCase();
    let base = key
      ? rows.filter((r) =>
          `${r.code} ${r.name}`.toLowerCase().includes(key),
        )
      : rows;
    if (activeAggregation) {
      base = base.filter((r) => {
        if (activeAggregation.type === "industry") {
          return ((r.industry || "其他").trim() || "其他") === activeAggregation.name;
        }
        const ex = getExchange(r.code).label;
        const exchange =
          ex === "SSE"
            ? "沪市"
            : ex === "SZSE"
              ? "深市"
              : ex === "BSE"
                ? "北交所"
                : ex === "HKEX"
                  ? "港交所"
                  : ex === "US"
                    ? "美股"
                    : "其他";
        return exchange === activeAggregation.name;
      });
    }
    return base;
  }, [rows, tableFilter, activeAggregation]);
  const displayedRows = useMemo(() => filteredRows.slice(0, 50), [filteredRows]);
  const selectedResultRows = useMemo(
    () => rows.filter((r) => checkedCodes.has(r.code)),
    [rows, checkedCodes],
  );
  const allDisplayedChecked =
    displayedRows.length > 0 &&
    displayedRows.every((r) => checkedCodes.has(r.code));

  const industryAgg = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const key = (r.industry || "其他").trim() || "其他";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [rows]);

  const exchangeAgg = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const ex = getExchange(r.code).label;
      const key =
        ex === "SSE"
          ? "沪市"
          : ex === "SZSE"
            ? "深市"
            : ex === "BSE"
              ? "北交所"
              : ex === "HKEX"
                ? "港交所"
                : ex === "US"
                  ? "美股"
                  : "其他";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const stats = useMemo(() => calcStats(rows), [rows]);
  const maxCapBucket = Math.max(
    1,
    stats.marketCap.gt1000yi,
    stats.marketCap.y500to1000,
    stats.marketCap.y100to500,
    stats.marketCap.lt100yi,
  );

  function openPeDistribution(bucket: PeBucketKey, label: string) {
    const bucketRows = getPeBucketRows(rows, bucket);
    setDistributionModal({
      title: tByLang(lang, `市盈率 ${label}`, `P/E ${label}`),
      subtitle: tByLang(lang, `共 ${bucketRows.length} 支股票`, `${bucketRows.length} stocks`),
      rows: bucketRows,
    });
  }

  function openMarketCapDistribution(bucket: MarketCapBucketKey, label: string) {
    const bucketRows = getMarketCapBucketRows(rows, bucket);
    setDistributionModal({
      title: tByLang(lang, `市值 ${label}`, `Market Cap ${label}`),
      subtitle: tByLang(lang, `共 ${bucketRows.length} 支股票`, `${bucketRows.length} stocks`),
      rows: bucketRows,
    });
  }

  async function loadPresets() {
    try {
      const data = (await api.listFactorPresets()) as PresetItem[];
      setPresets(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setStatus(
        e?.message ||
          tByLang(lang, "加载参数组合失败", "Failed to load presets"),
      );
    }
  }

  async function loadCustomFactors() {
    try {
      const data = (await (api as any).listCustomFactors()) as {
        factors?: CustomFactor[];
      };
      const nextFactors = Array.isArray(data?.factors) ? data.factors : [];
      setCustomFactors(nextFactors);
      setCustomFactorParams((prev) => {
        const next = { ...prev };
        nextFactors.forEach((factor) => {
          if (!next[factor.id]) next[factor.id] = getCustomFactorDefaultValues(factor);
        });
        return next;
      });
    } catch {
      setCustomFactors([]);
    }
  }

  async function applyScreenRows(
    nextRows: ScreenerRow[],
    nextTotal: number,
    displayDate: string,
    nextUniverseCount?: number,
    nextHitRate?: number | null,
  ) {
    const effectiveUniverseCount =
      nextUniverseCount !== undefined && Number.isFinite(nextUniverseCount)
        ? Math.max(0, Math.floor(nextUniverseCount))
        : nextTotal;
    const effectiveHitRate =
      nextHitRate !== undefined && nextHitRate !== null && Number.isFinite(nextHitRate)
        ? Math.max(0, nextHitRate)
        : effectiveUniverseCount > 0
          ? nextTotal / effectiveUniverseCount
          : null;
    setRows(nextRows);
    setTotal(nextTotal);
    setUniverseCount(effectiveUniverseCount);
    setHitRate(effectiveHitRate);
    setCheckedCodes(new Set());
    setResultDateFilter(displayDate || "all");

    if (nextRows.length > 0) {
      const preferredRow =
        activeCode && nextRows.some((r) => r.code === activeCode)
          ? nextRows.find((r) => r.code === activeCode) || nextRows[0]
          : nextRows[0];
      setActiveCode(preferredRow.code);
      setActiveName(preferredRow.name || "");
      await loadChart(preferredRow.code, preferredRow.name || "");
    } else {
      setActiveCode("");
      setActiveName("");
      setCandles([]);
      setQuote(null);
    }
  }

  function screeningCacheKey(payload: Record<string, any>, requestedDate?: string) {
    return stableStringify({
      keyword: payload.keyword || "",
      factors: payload.factors || [],
      logic: payload.logic,
      inline_factors: payload.inline_factors || [],
      sort_by: payload.sort_by,
      sort_order: payload.sort_order,
      limit: payload.limit,
      offset: payload.offset,
      requestedDate: requestedDate || payload.date || "latest",
      market: payload.market || market,
    });
  }

  async function applyScreenResponse(
    data: ScreenerQueryResponse,
    payload: Record<string, any>,
    requestedDate?: string,
    cacheKey?: string,
  ) {
    const nextRows = Array.isArray(data?.rows) ? data.rows : [];
    const nextTotal = Number(data?.total || 0);
    const nextUniverseCount = Math.max(
      0,
      Math.floor(toFiniteNumber(data?.universe_count) ?? nextTotal),
    );
    const nextHitRate =
      toFiniteNumber(data?.hit_rate) ??
      (nextUniverseCount > 0 ? nextTotal / nextUniverseCount : null);
    const effectiveDate =
      data?.cache?.effective_trading_date || data?.date || nextRows[0]?.date || requestedDate || "latest";
    await applyScreenRows(
      nextRows,
      nextTotal,
      effectiveDate === "latest" ? "all" : effectiveDate,
      nextUniverseCount,
      nextHitRate,
    );
    upsertScreenerResultCache({
      key: cacheKey || screeningCacheKey(payload, requestedDate),
      requestedDate: requestedDate || payload.date || "最新交易日",
      effectiveDate,
      total: nextTotal,
      universeCount: nextUniverseCount,
      hitRate: nextHitRate,
      rows: nextRows,
      cachedAt: Date.now(),
      keyword: payload.keyword || "",
      logic: payload.logic || "AND",
      market: payload.market || market,
    });
    setStatus(
      tByLang(
        lang,
        `筛选完成，命中 ${nextTotal} 支，命中率 ${formatHitRate(nextHitRate)}，结果已保存到系统数据`,
        `Screen complete: ${nextTotal} matches. Results saved as system data.`,
      ),
    );
    setMobilePanel("results");
  }

  async function loadScreeningTasks() {
    try {
      const payload: any = await api.listScreenerTasks(30);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setScreeningTasks(items.filter((item: ScreenerTaskSummary) => (item.market || "CN") === market));
    } catch {
      // Task history is supplementary; saved system results remain available offline.
    }
  }

  function stopScreeningTaskPolling(clearStored = false) {
    if (screeningTaskPollRef.current) {
      window.clearTimeout(screeningTaskPollRef.current);
      screeningTaskPollRef.current = null;
    }
    if (clearStored) localStorage.removeItem(activeScreeningStorageKey);
  }

  function beginScreeningTaskPolling(
    taskId: number,
    context?: { payload: Record<string, any>; requestedDate?: string; cacheKey?: string },
  ) {
    if (!Number.isFinite(taskId) || taskId <= 0) return;
    stopScreeningTaskPolling();
    setActiveScreeningTaskId(taskId);
    setLoading(true);
    localStorage.setItem(activeScreeningStorageKey, String(taskId));
    const pollOnce = async () => {
      try {
        const task = (await api.getScreenerTask(taskId)) as ScreenerTaskSummary;
        setScreeningTasks((items) => {
          const next = [task, ...items.filter((item) => item.task_id !== task.task_id)];
          return next.slice(0, 30);
        });
        if (task.status === "done") {
          const requestPayload = context?.payload || task.request || { market };
          await applyScreenResponse(
            task.result || { total: 0, rows: [] },
            requestPayload,
            context?.requestedDate || task.requested_date || undefined,
            context?.cacheKey,
          );
          setLoading(false);
          setActiveScreeningTaskId(null);
          stopScreeningTaskPolling(true);
          void loadScreeningTasks();
          return;
        }
        if (task.status === "failed") {
          setStatus(task.error || tByLang(lang, "后台筛选任务失败", "Background screening failed"));
          setLoading(false);
          setActiveScreeningTaskId(null);
          stopScreeningTaskPolling(true);
          return;
        }
        setStatus(
          tByLang(
            lang,
            `筛选任务 #${taskId} 正在后台执行，可切换页面后稍后返回查看。`,
            `Screening task #${taskId} is running in the background. You can leave and return later.`,
          ),
        );
        screeningTaskPollRef.current = window.setTimeout(pollOnce, 3000);
      } catch (error: any) {
        setStatus(error?.message || tByLang(lang, "正在等待后台筛选结果", "Waiting for background screening result"));
        screeningTaskPollRef.current = window.setTimeout(pollOnce, 5000);
      }
    };
    void pollOnce();
  }

  async function runScreen(customKeyword?: string, customDate?: string, forceRefresh = false) {
    setLoading(true);
    try {
      const nextDate = customDate ?? histDate;
      const requestKeyword = customKeyword ?? keyword;
      const payload: any = {
        keyword: requestKeyword,
        market,
        factors: configList,
        limit: 300,
        offset: 0,
        sort_by: "score",
        sort_order: "desc",
        logic,
        inline_factors: inlineFactors,
        ...(nextDate ? { date: nextDate } : {}),
      };
      const cacheKey = screeningCacheKey(payload, nextDate);
      const cachedEntry =
        nextDate
          ? readScreenerResultCache().find(
              (item) =>
                (item.market || "CN") === market &&
                (item.effectiveDate || item.requestedDate) === nextDate,
            )
          : undefined;
      if (cachedEntry && !forceRefresh) {
        await applyScreenRows(
          cachedEntry.rows,
          cachedEntry.total,
          cachedEntry.effectiveDate || cachedEntry.requestedDate || nextDate || "all",
          cachedEntry.universeCount,
          cachedEntry.hitRate,
        );
        setStatus(
          tByLang(
            lang,
            `已从系统数据加载 ${cachedEntry.total} 支股票（${cachedEntry.effectiveDate || cachedEntry.requestedDate}）`,
            `Loaded ${cachedEntry.total} stocks from system data`,
          ),
        );
        setMobilePanel("results");
        setLoading(false);
        return;
      }
      const task = (await api.createScreenerTask(payload)) as ScreenerTaskSummary;
      setStatus(
        tByLang(
          lang,
          `筛选任务 #${task.task_id} 已提交后台执行，完成后会自动加载结果。`,
          `Screening task #${task.task_id} was submitted and will load automatically when complete.`,
        ),
      );
      beginScreeningTaskPolling(task.task_id, {
        payload,
        requestedDate: nextDate || undefined,
        cacheKey,
      });
      void loadScreeningTasks();
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setUniverseCount(0);
      setHitRate(null);
      setStatus(e?.message || tByLang(lang, "筛选失败", "Screen failed"));
      setLoading(false);
    }
  }

  useEffect(() => {
    stopScreeningTaskPolling();
    setRows([]);
    setTotal(0);
    setUniverseCount(0);
    setHitRate(null);
    setActiveAggregation(null);
    setActiveCode("");
    setActiveName("");
    setCandles([]);
    setQuote(null);
    void loadScreeningTasks();
    const cachedEntry = readScreenerResultCache()
      .filter((item) => (item.market || "CN") === market)
      .sort((a, b) => Number(b.cachedAt || 0) - Number(a.cachedAt || 0))[0];
    if (cachedEntry) {
      const cachedDate = cachedEntry.effectiveDate || cachedEntry.requestedDate || "";
      setHistDate(/^\d{4}-\d{2}-\d{2}$/.test(cachedDate) ? cachedDate : "");
      void applyScreenRows(
        cachedEntry.rows,
        cachedEntry.total,
        cachedDate || "all",
        cachedEntry.universeCount,
        cachedEntry.hitRate,
      );
      setStatus(
        tByLang(
          lang,
          `已恢复最近筛选结果，共 ${cachedEntry.total} 支`,
          `Restored the latest system result with ${cachedEntry.total} matches`,
        ),
      );
      setMobilePanel("results");
    }
    const storedTaskId = Number(localStorage.getItem(activeScreeningStorageKey) || 0);
    if (storedTaskId > 0) {
      beginScreeningTaskPolling(storedTaskId);
    } else if (!cachedEntry) {
      void runScreen(undefined, histDate);
    }
    return () => stopScreeningTaskPolling();
  }, [market]);

  async function savePreset() {
    const name = presetName.trim();
    if (!name) {
      setStatus(
        tByLang(lang, "请先输入组合名称", "Please enter a preset name"),
      );
      return;
    }
    try {
      await api.saveFactorPreset({ name, config: configList });
      setStatus(
        tByLang(lang, `参数组合已保存：${name}`, `Preset saved: ${name}`),
      );
      setPresetName("");
      await loadPresets();
    } catch (e: any) {
      setStatus(
        e?.message ||
          tByLang(lang, "保存参数组合失败", "Failed to save preset"),
      );
    }
  }

    async function loadPreset() {
    if (!presetId) {
      setStatus(tByLang(lang, "请先选择参数组合", "Please select a preset"));
      return;
    }
    try {
      const data = (await api.getFactorPreset(Number(presetId))) as {
        config?: FactorConfig[];
      };
      const list = Array.isArray(data?.config) ? data.config : [];
      applyFactorConfigList(list);
      setStatus(tByLang(lang, "参数组合已加载", "Preset loaded"));
    } catch (e: any) {
      setStatus(
        e?.message ||
          tByLang(lang, "加载参数组合失败", "Failed to load preset"),
      );
      }
    }

    async function loadWatchGroups() {
      try {
        const data = await api.getWatchlist();
        const groups = Object.keys((data as any)?.groups || {});
        const nextGroups = groups.length ? groups : ["默认分组"];
        setWatchGroups(nextGroups);
        if (!nextGroups.includes(watchGroup)) {
          setWatchGroup(nextGroups[0]);
        }
      } catch {
        setWatchGroups(["默认分组"]);
      }
    }

    async function createWatchGroup() {
      const name = newWatchGroup.trim();
      if (!name) return;
      setAddingWatch(true);
      try {
        await api.createWatchlistGroup({ group_name: name });
        setWatchGroups((groups) => (groups.includes(name) ? groups : [...groups, name]));
        setWatchGroup(name);
        setNewWatchGroup("");
        setStatus(tByLang(lang, `分组已创建：${name}`, `Group created: ${name}`));
      } catch (e: any) {
        setStatus(e?.message || tByLang(lang, "创建分组失败", "Failed to create group"));
      } finally {
        setAddingWatch(false);
      }
    }

    async function addToWatchlist(target?: { code: string; name?: string }) {
    const targetCode = target?.code || activeCode;
    const targetName = target?.name || activeName || targetCode;
    if (!targetCode) return;
    setAddingWatch(true);
    try {
        await api.addToWatchlist({
          group_name: watchGroup,
          code: targetCode,
          name: targetName,
        });
        setWatchGroups((groups) =>
          groups.includes(watchGroup) ? groups : [...groups, watchGroup],
        );
        const message = tByLang(lang, `已加入自选：${targetName}`, `Added to watchlist: ${targetName}`);
        setStatus(message);
        setWatchNotice(message);
    } catch (e: any) {
      const message = e?.message || tByLang(lang, "加入自选失败", "Failed to add to watchlist");
      setStatus(message);
      setWatchNotice(message);
    } finally {
      setAddingWatch(false);
    }
  }

  async function addSelectedToWatchlist() {
    if (!selectedResultRows.length) {
      setStatus(tByLang(lang, "请先勾选股票", "Select stocks first"));
      return;
    }
    setAddingWatch(true);
    try {
      const results = await Promise.allSettled(
        selectedResultRows.map((r) =>
          api.addToWatchlist({
            group_name: watchGroup,
            code: r.code,
            name: r.name || r.code,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const success = selectedResultRows.length - failed;
      const message = tByLang(
        lang,
        `已加入自选 ${success} 支${failed ? `，失败 ${failed} 支` : ""}`,
        `Added ${success} stocks${failed ? `, ${failed} failed` : ""}`,
      );
      setStatus(message);
      setWatchNotice(message);
        if (success > 0) {
          setWatchGroups((groups) =>
            groups.includes(watchGroup) ? groups : [...groups, watchGroup],
          );
          setCheckedCodes(new Set());
        }
    } catch (e: any) {
      const message = e?.message || tByLang(lang, "批量加入自选失败", "Batch add failed");
      setStatus(message);
      setWatchNotice(message);
    } finally {
      setAddingWatch(false);
    }
  }

  function toggleDisplayedRows(checked: boolean) {
    setCheckedCodes((prev) => {
      const next = new Set(prev);
      displayedRows.forEach((r) => {
        if (checked) next.add(r.code);
        else next.delete(r.code);
      });
      return next;
    });
  }

  async function runTrendSearch() {
    const q = trendQuery.trim();
    if (!q) return;
    try {
      const hits = (await api.searchStocks(q, market)) as SearchHit[];
      const code = hits?.[0]?.code || q;
      setActiveCode(code);
      setActiveName(hits?.[0]?.name || "");
      setShowTrendHits(false);
      await loadChart(code, hits?.[0]?.name || "");
    } catch (e: any) {
      setStatus(
        e?.message || tByLang(lang, "股票查询失败", "Stock search failed"),
      );
    }
  }

  useEffect(() => {
    const q = trendQuery.trim();
    if (!q) {
      setTrendHits([]);
      setShowTrendHits(false);
      return;
    }
    let canceled = false;
    const timer = setTimeout(async () => {
      try {
        const hits = (await api.searchStocks(q, market)) as SearchHit[];
        if (canceled) return;
        setTrendHits(Array.isArray(hits) ? hits.slice(0, 8) : []);
        setShowTrendHits(true);
      } catch {
        if (!canceled) {
          setTrendHits([]);
          setShowTrendHits(false);
        }
      }
    }, 180);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [trendQuery, market]);

  async function loadChart(code: string, name?: string) {
    try {
      const [historyRaw, quoteRaw] = await Promise.allSettled([
        api.getStockHistory(code, adjustmentMode),
        api.getStockQuote(code),
      ]);
      const parsed =
        historyRaw.status === "fulfilled" ? parseHistory(historyRaw.value) : [];
      setCandles(parsed);
      setChartAdjustmentStatus(
        historyRaw.status === "fulfilled"
          ? {
              adjust: historyRaw.value?.adjust,
              adjust_fallback: historyRaw.value?.adjust_fallback,
              source: historyRaw.value?.source,
            }
          : null,
      );
      if (name) {
        setActiveName(name);
      } else {
        const fromRows = rows.find((r) => r.code === code)?.name;
        if (fromRows) setActiveName(fromRows);
      }
      if (parsed.length) {
        const last = parsed[parsed.length - 1];
        const apiQuote =
          quoteRaw.status === "fulfilled" && quoteRaw.value
            ? (quoteRaw.value as any)
            : null;
        setQuote({
          open: Number(apiQuote?.open ?? last.open ?? 0),
          high: Number(apiQuote?.high ?? last.high ?? 0),
          low: Number(apiQuote?.low ?? last.low ?? 0),
          close: Number(apiQuote?.close ?? last.close ?? 0),
          volume: Number(apiQuote?.volume ?? last.volume ?? 0),
          prevClose:
            apiQuote?.prev_close === null || apiQuote?.prev_close === undefined
              ? null
              : Number(apiQuote.prev_close),
        });
      } else {
        setQuote(null);
      }
    } catch {
      setCandles([]);
      setChartAdjustmentStatus(null);
      setQuote(null);
    }
  }

  useEffect(() => {
    if (!activeCode) return;
    void loadChart(activeCode, activeName);
  }, [adjustmentMode]);

  function toggleFactor(factor: FactorKey) {
    setSelectedFactors((prev) =>
      prev.includes(factor)
        ? prev.filter((f) => f !== factor)
        : [...prev, factor],
    );
  }

  function updateFactorParam(
    factor: FactorKey,
    paramName: string,
    value: number,
  ) {
    setFactorConfig((prev) => ({
      ...prev,
      [factor]: prev[factor].map((p) =>
        p.name === paramName
          ? { ...p, value: Number.isFinite(value) ? value : 0 }
          : p,
      ),
    }));
  }

  function toggleCustomFactor(factor: CustomFactor, checked: boolean) {
    setSelectedCustomFactorIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(factor.id);
      else next.delete(factor.id);
      return next;
    });
    if (checked) {
      setCustomFactorParams((prev) =>
        prev[factor.id]
          ? prev
          : { ...prev, [factor.id]: getCustomFactorDefaultValues(factor) },
      );
      setExpandedCustomFactorIds((prev) => new Set(prev).add(factor.id));
    }
  }

  function updateCustomFactorParam(
    factor: CustomFactor,
    paramName: string,
    value: number | undefined,
  ) {
    setCustomFactorParams((prev) => ({
      ...prev,
      [factor.id]: {
        ...getCustomFactorDefaultValues(factor),
        ...(prev[factor.id] || {}),
        [paramName]: value,
      },
    }));
  }

  function resetCustomFactorParams(factor: CustomFactor) {
    setCustomFactorParams((prev) => ({
      ...prev,
      [factor.id]: getCustomFactorDefaultValues(factor),
    }));
  }

    useEffect(() => {
      loadPresets();
      loadCustomFactors();
      loadWatchGroups();
      setStatus(tByLang(lang, "请选择日期后开始筛选", "Select a date and run screening"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status) return;
    setStatus(tByLang(lang, "准备就绪", "Ready"));
  }, [lang, status]);

  return (
    <div className={`screener-page mobile-panel-${mobilePanel}`}>
      <nav
        className="screener-mobile-tabs"
        aria-label={tByLang(lang, "选股器移动端视图", "Mobile screener view")}
      >
        {([
          ["filter", tByLang(lang, "筛选", "Filters")],
          ["chart", tByLang(lang, "行情", "Chart")],
          ["results", tByLang(lang, "结果", "Results")],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={mobilePanel === key ? "active" : ""}
            aria-pressed={mobilePanel === key}
            onClick={() => setMobilePanel(key)}
          >
            {label}
            {key === "results" && total > 0 ? <span>{total}</span> : null}
          </button>
        ))}
      </nav>
      {/* ─── LEFT PANEL: Factor Screener ─── */}
      <aside className="screener-left">
        <div className="screener-left-header">
          <h2>{tByLang(lang, "因子筛选", "Factor Screener")}</h2>
        </div>

        <div className="screener-left-body">
          {/* ── Strategy Group Selector ── */}
          <div>
            <span className="screener-filter-label">
              {tByLang(lang, "策略分组", "Strategy Group")}
            </span>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              {groups.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {editingGroupId === g.id ? (
                    <input
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          renameGroup(g.id, editingGroupName);
                        if (e.key === "Escape") setEditingGroupId(null);
                      }}
                      onBlur={() => renameGroup(g.id, editingGroupName)}
                      autoFocus
                      style={{
                        width: 80,
                        padding: "4px 8px",
                        fontSize: 12,
                        border: "1px solid var(--primary)",
                        borderRadius: "var(--radius-md)",
                        outline: "none",
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setActiveGroupId(g.id)}
                      onDoubleClick={() => {
                        setEditingGroupId(g.id);
                        setEditingGroupName(g.name);
                      }}
                      title={tByLang(
                        lang,
                        "双击重命名",
                        "Double-click to rename",
                      )}
                      style={{
                        padding: "4px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: "var(--radius-full)",
                        border: `1px solid ${activeGroupId === g.id ? "var(--primary)" : "var(--border-light)"}`,
                        background:
                          activeGroupId === g.id
                            ? "var(--primary)"
                            : "transparent",
                        color:
                          activeGroupId === g.id ? "#fff" : "var(--text-muted)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {g.name}
                      <span
                        style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}
                      >
                        ({g.presets.length})
                      </span>
                    </button>
                  )}
                  {g.id !== DEFAULT_GROUP_ID && (
                    <button
                      onClick={() => deleteGroup(g.id)}
                      title={tByLang(lang, "删除分组", "Delete group")}
                      style={{
                        width: 16,
                        height: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {showNewGroup ? (
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createGroup();
                    if (e.key === "Escape") setShowNewGroup(false);
                  }}
                  onBlur={() => {
                    if (newGroupName.trim()) createGroup();
                    else setShowNewGroup(false);
                  }}
                  placeholder={tByLang(lang, "分组名称", "Group name")}
                  autoFocus
                  style={{
                    width: 80,
                    padding: "4px 8px",
                    fontSize: 11,
                    border: "1px dashed var(--primary)",
                    borderRadius: "var(--radius-full)",
                    outline: "none",
                  }}
                />
              ) : (
                <button
                  onClick={() => setShowNewGroup(true)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    borderRadius: "var(--radius-full)",
                    border: "1px dashed var(--border)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  +
                </button>
              )}
            </div>
          </div>

          {/* ── AND/OR Logic ── */}
          <div>
            <span className="screener-filter-label">
              {tByLang(lang, "筛选逻辑", "Filter Logic")}
            </span>
            <div className="screener-logic-toggle" style={{ marginTop: 8 }}>
              {(["and", "or"] as const).map((l) => (
                <button
                  key={l}
                  className={`screener-logic-btn${logic === l ? " active" : ""}`}
                  onClick={() => setLogic(l)}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* ── Factor Parameters (specific values) ── */}
          <div className="screener-filter-group">
            {visibleBuiltinFactorKeys.map((key) => {
              const label = FACTOR_LABELS[key];
              const unit =
                key === "price"
                  ? definition.currencySymbol
                  : key === "volume"
                    ? tByLang(
                        lang,
                        market === "CN" ? "万手" : "万股",
                        market === "CN" ? "10K lots" : "10K shares",
                      )
                  : key === "market_cap"
                    ? tByLang(
                        lang,
                        definition.marketCapUnitZh,
                        definition.marketCapUnitEn,
                      )
                    : key === "ma60_gap"
                      ? "%"
                      : key === "consecutive_yin_hold"
                        ? tByLang(lang, "天", "days")
                        : key === "ma_deviation_strategy"
                          ? tByLang(lang, "度", "score")
                          : tByLang(lang, label.unit, "x");
              const enabled = selectedFactors.includes(key);
              return (
                <div
                  key={key}
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border-light)",
                    opacity: enabled ? 1 : 0.5,
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleFactor(key)}
                      style={{
                        width: 14,
                        height: 14,
                        accentColor: "var(--primary)",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        letterSpacing: "5%",
                        textTransform: "uppercase",
                      }}
                    >
                      {tByLang(lang, label.zh, label.en)}
                    </span>
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    {factorConfig[key].map((param) => (
                      <label key={param.name} style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {isRangeFactor(key)
                            ? `${getParamLabel(param.name)}（${unit}）`
                            : getParamLabel(param.name)}
                        </span>
                        <input
                          className="screener-filter-input"
                          type="number"
                          value={param.value}
                          disabled={!enabled}
                          step={factorParamStep(key, param.name)}
                          onChange={(e) =>
                            updateFactorParam(key, param.name, Number(e.target.value))
                          }
                          style={{ padding: "6px 8px" }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Custom Factors from Factor Mining ── */}
          <div className="screener-filter-group">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span className="screener-filter-label">
                {tByLang(lang, "因子挖掘因子", "Mined Factors")}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {tByLang(
                    lang,
                    `已选 ${selectedCustomFactorIds.size}`,
                    `${selectedCustomFactorIds.size} selected`,
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setCustomFactorListZoomed((v) => !v)}
                  title={tByLang(lang, "切换列表密度", "Toggle list density")}
                  aria-label={tByLang(lang, "切换列表密度", "Toggle list density")}
                  style={{
                    width: 26,
                    height: 26,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-white)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {customFactorListZoomed ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => setCustomFactorListExpanded((v) => !v)}
                  title={customFactorListExpanded ? tByLang(lang, "收起列表", "Collapse list") : tByLang(lang, "展开列表", "Expand list")}
                  aria-label={customFactorListExpanded ? tByLang(lang, "收起列表", "Collapse list") : tByLang(lang, "展开列表", "Expand list")}
                  style={{
                    width: 26,
                    height: 26,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-white)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {customFactorListExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              </div>
            </div>

            {!customFactorListExpanded ? (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                {tByLang(lang, "因子列表已收起", "Factor list collapsed")}
              </p>
            ) : customFactors.length ? (
              <div
                style={{
                  display: "grid",
                  gap: customFactorListZoomed ? 10 : 6,
                  marginTop: 8,
                }}
              >
                {customFactors.map((factor) => {
                  const checked = selectedCustomFactorIds.has(factor.id);
                  const expanded = expandedCustomFactorIds.has(factor.id);
                  const paramDefs = parseCustomFactorParamDefs(factor.params_json);
                  const isBoolean = (factor.output_type || "scalar") === "boolean";
                  const effectiveValues = {
                    ...getCustomFactorDefaultValues(factor),
                    ...(customFactorParams[factor.id] || {}),
                  };
                  const hasTuning = paramDefs.length > 0 || !isBoolean;
                  const densityPadding = customFactorListZoomed ? "12px 0" : "8px 0";
                  return (
                    <div
                      key={factor.id}
                      style={{
                        display: "grid",
                        gap: customFactorListZoomed ? 8 : 5,
                        padding: densityPadding,
                        borderBottom: "1px solid var(--border-light)",
                        opacity: checked ? 1 : 0.66,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <label
                          style={{
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleCustomFactor(factor, e.target.checked)}
                            style={{
                              width: 14,
                              height: 14,
                              accentColor: "var(--primary)",
                              flex: "0 0 auto",
                            }}
                          />
                          <strong
                            style={{
                              minWidth: 0,
                              fontSize: customFactorListZoomed ? 13 : 12,
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {factor.display_name || factor.name}
                          </strong>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCustomFactorIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(factor.id)) next.delete(factor.id);
                              else next.add(factor.id);
                              return next;
                            })
                          }
                          title={expanded ? tByLang(lang, "收起参数", "Collapse parameters") : tByLang(lang, "展开参数", "Expand parameters")}
                          aria-label={expanded ? tByLang(lang, "收起参数", "Collapse parameters") : tByLang(lang, "展开参数", "Expand parameters")}
                          style={{
                            width: 24,
                            height: 24,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "1px solid var(--border-light)",
                            borderRadius: "var(--radius-md)",
                            background: "transparent",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            flex: "0 0 auto",
                          }}
                        >
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                          fontSize: 10,
                          color: "var(--text-muted)",
                        }}
                      >
                        <span>{factor.category || "custom"}</span>
                        <span>|</span>
                        <span>{factor.output_type || "scalar"}</span>
                        {factor.is_builtin === 1 && <span>{tByLang(lang, "预置", "Builtin")}</span>}
                        {hasTuning && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <SlidersHorizontal size={11} />
                            {tByLang(lang, "可调参", "Tunable")}
                          </span>
                        )}
                      </div>

                      {customFactorListZoomed && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-muted)",
                            wordBreak: "break-all",
                            lineHeight: 1.5,
                          }}
                        >
                          {factor.name} = {factor.expression}
                        </span>
                      )}

                      {expanded && (
                        <div
                          style={{
                            display: "grid",
                            gap: 8,
                            padding: "8px 0 2px 22px",
                          }}
                        >
                          {paramDefs.length > 0 && (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: customFactorListZoomed
                                  ? "repeat(2, minmax(0, 1fr))"
                                  : "1fr",
                                gap: 8,
                              }}
                            >
                              {paramDefs.map((param) => (
                                <label key={param.name} style={{ display: "grid", gap: 4 }}>
                                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                    {param.label || param.name}
                                  </span>
                                  <input
                                    className="screener-filter-input"
                                    type="number"
                                    disabled={!checked}
                                    min={param.min}
                                    max={param.max}
                                    step={param.step ?? (param.type === "int" ? 1 : 0.01)}
                                    value={effectiveValues[param.name] ?? ""}
                                    onChange={(e) =>
                                      updateCustomFactorParam(
                                        factor,
                                        param.name,
                                        e.target.value === "" ? undefined : Number(e.target.value),
                                      )
                                    }
                                    style={{ padding: "6px 8px" }}
                                  />
                                </label>
                              ))}
                            </div>
                          )}

                          {!isBoolean && (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: 8,
                              }}
                            >
                              <label style={{ display: "grid", gap: 4 }}>
                                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                  {tByLang(lang, "过滤下限", "Filter min")}
                                </span>
                                <input
                                  className="screener-filter-input"
                                  type="number"
                                  disabled={!checked}
                                  value={effectiveValues.__filter_min ?? ""}
                                  onChange={(e) =>
                                    updateCustomFactorParam(
                                      factor,
                                      "__filter_min",
                                      e.target.value === "" ? undefined : Number(e.target.value),
                                    )
                                  }
                                  style={{ padding: "6px 8px" }}
                                />
                              </label>
                              <label style={{ display: "grid", gap: 4 }}>
                                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                  {tByLang(lang, "过滤上限", "Filter max")}
                                </span>
                                <input
                                  className="screener-filter-input"
                                  type="number"
                                  disabled={!checked}
                                  value={effectiveValues.__filter_max ?? ""}
                                  onChange={(e) =>
                                    updateCustomFactorParam(
                                      factor,
                                      "__filter_max",
                                      e.target.value === "" ? undefined : Number(e.target.value),
                                    )
                                  }
                                  style={{ padding: "6px 8px" }}
                                />
                              </label>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={!checked}
                            onClick={() => resetCustomFactorParams(factor)}
                            style={{
                              justifySelf: "start",
                              padding: "4px 10px",
                              border: "1px solid var(--border-light)",
                              borderRadius: "var(--radius-full)",
                              background: "transparent",
                              color: "var(--text-muted)",
                              fontSize: 11,
                              cursor: checked ? "pointer" : "not-allowed",
                              opacity: checked ? 1 : 0.5,
                            }}
                          >
                            {tByLang(lang, "重置参数", "Reset")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                {tByLang(lang, "暂无自定义因子，可先到因子挖掘页创建", "No custom factors yet")}
              </p>
            )}
          </div>

          {/* ── Save Current Parameters ── */}
          <div>
            <span className="screener-filter-label">
              {tByLang(lang, "保存当前参数", "Save Parameters")}
            </span>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="screener-filter-input"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={tByLang(lang, "参数名称", "Parameter name")}
                style={{ flex: 1, padding: "6px 8px" }}
              />
              <button
                onClick={savePresetToGroup}
                disabled={!presetName.trim()}
                style={{
                  padding: "6px 14px",
                  border: "none",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--primary)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: !presetName.trim() ? 0.5 : 1,
                }}
              >
                {tByLang(lang, "保存", "Save")}
              </button>
            </div>
          </div>

          {/* ── Saved Presets in Active Group ── */}
          {activeGroup.presets.length > 0 && (
            <div>
              <span className="screener-filter-label">
                {tByLang(
                  lang,
                  `已保存参数 (${activeGroup.name})`,
                  `Saved (${activeGroup.name})`,
                )}
              </span>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  maxHeight: 160,
                  overflow: "auto",
                }}
              >
                {activeGroup.presets.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      background: "var(--bg-light)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        cursor: "pointer",
                        flex: 1,
                      }}
                      onClick={() => loadPresetFromGroup(p)}
                      title={tByLang(lang, "点击加载", "Click to load")}
                    >
                      {p.name}
                      {p.date && (
                        <small
                          style={{
                            display: "block",
                            marginTop: 2,
                            color: "var(--text-muted)",
                            fontWeight: 400,
                          }}
                        >
                          {tByLang(lang, `筛选日期：${p.date}`, `Date: ${p.date}`)}
                        </small>
                      )}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => loadPresetFromGroup(p)}
                        style={{
                          padding: "2px 8px",
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-white)",
                          color: "var(--primary)",
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {tByLang(lang, "加载", "Load")}
                      </button>
                      <button
                        onClick={() => deletePresetFromGroup(p.id)}
                        style={{
                          padding: "2px 8px",
                          border: "1px solid var(--danger-bg)",
                          borderRadius: "var(--radius-sm)",
                          background: "transparent",
                          color: "var(--danger)",
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {tByLang(lang, "删除", "Del")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          {status && (
            <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>
              {status}
            </p>
          )}
        </div>

        {/* Run button footer */}
        <div className="screener-left-footer">
          <div style={{ marginBottom: 10 }}>
            <span className="screener-filter-label">
              {tByLang(lang, "筛选日期", "Screen Date")}
            </span>
            <input
              type="date"
              className="screener-filter-input"
              value={histDate}
              onChange={(e) => {
                const nextDate = e.target.value;
                setHistDate(nextDate);
                setActiveAggregation(null);
                setStatus(
                  tByLang(
                    lang,
                    nextDate ? `正在按 ${nextDate} 自动筛选...` : "正在按最新交易日自动筛选...",
                    nextDate ? `Auto screening ${nextDate}...` : "Auto screening latest trading day...",
                  ),
                );
                void runScreen(undefined, nextDate);
              }}
              style={{ width: "100%", marginTop: 6, padding: "8px 10px" }}
            />
          </div>
          <button
            className="screener-run-btn"
            onClick={() => runScreen(undefined, undefined, true)}
            disabled={loading}
          >
            {loading
              ? tByLang(lang, "筛选中...", "Screening...")
              : histDate
                ? tByLang(lang, `按 ${histDate} 筛选`, `Screen ${histDate}`)
                : tByLang(lang, "按最新交易日筛选", "Screen latest trading day")}
          </button>
        </div>
      </aside>

      {/* ─── CENTER PANEL: Trend Chart ─── */}
      <main className="screener-center">
        {/* Search card */}
        <div className="screener-search-card">
          <div className="screener-search-query">
            <span className="material-symbols-outlined">search</span>
            <div style={{ position: "relative", flex: 1 }}>
            <input
              className="screener-search-input"
              value={trendQuery}
              onChange={(e) => setTrendQuery(e.target.value)}
              onFocus={() => {
                if (trendHits.length) setShowTrendHits(true);
              }}
              onBlur={() => {
                setTimeout(() => setShowTrendHits(false), 120);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runTrendSearch();
                }
              }}
              placeholder={tByLang(
                lang,
                "输入代码或名称",
                "Enter code or name",
              )}
            />
            {showTrendHits && trendHits.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  border: "1px solid var(--border-light)",
                  borderRadius: "12px",
                  background: "var(--bg-white)",
                  boxShadow: "var(--shadow-md)",
                  maxHeight: 260,
                  overflow: "auto",
                }}
              >
                {trendHits.map((h) => (
                  <button
                    key={`${h.code}-${h.full_code || ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={async () => {
                      setTrendQuery(
                        `${displaySearchCode(h)} ${h.name || ""} ${getExchangeName(h.code, h.full_code, h.board)}`.trim(),
                      );
                      setActiveCode(h.code);
                      setActiveName(h.name || "");
                      setShowTrendHits(false);
                      await loadChart(h.code, h.name || "");
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      borderBottom: "1px solid var(--border-subtle)",
                      background: "transparent",
                      textAlign: "left",
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "grid",
                      gridTemplateColumns: "86px minmax(0, 1fr) 58px",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-display)", color: "var(--primary)", fontWeight: 700 }}>
                      {displaySearchCode(h)}
                    </span>
                    <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.name}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "right" }}>
                      {getExchangeName(h.code, h.full_code, h.board)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
          <div className="screener-search-actions">
            <button
              onClick={runTrendSearch}
            style={{
              padding: "10px 20px",
              background: "var(--primary-dark)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-full)",
              fontFamily: "var(--font-primary)",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
            >
              {tByLang(lang, "查询", "Search")}
            </button>
            <select
              value={watchGroup}
              onChange={(e) => setWatchGroup(e.target.value)}
              title={tByLang(lang, "选择自选分组", "Select watchlist group")}
              style={{
                minWidth: 120,
                padding: "10px 12px",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-white)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-primary)",
                fontSize: 13,
              }}
            >
              {watchGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            <button
              onClick={addToWatchlist}
            disabled={addingWatch || !activeCode}
            style={{
              padding: "10px 20px",
              background: "transparent",
              color: "var(--primary)",
              border: "1px solid var(--primary)",
              borderRadius: "var(--radius-full)",
              fontFamily: "var(--font-primary)",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "2%",
              cursor: "pointer",
              opacity: addingWatch || !activeCode ? 0.5 : 1,
            }}
          >
            {tByLang(lang, "加入自选", "Add to Watchlist")}
          </button>
          </div>
        </div>
        {watchNotice && (
          <div
            role="status"
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: "var(--radius-lg)",
              background: watchNotice.includes("失败") || watchNotice.toLowerCase().includes("failed")
                ? "rgba(239,68,68,0.08)"
                : "var(--success-bg)",
              color: watchNotice.includes("失败") || watchNotice.toLowerCase().includes("failed")
                ? "#dc2626"
                : "var(--success)",
              border: watchNotice.includes("失败") || watchNotice.toLowerCase().includes("failed")
                ? "1px solid rgba(239,68,68,0.16)"
                : "1px solid var(--success-border)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {watchNotice}
          </div>
        )}

        {/* Chart card */}
        <div className="screener-chart-card">
          {/* Chart header with ticker info */}
          <div className="screener-chart-header">
            <div>
              <span className="screener-chart-title">
                {activeCode || "—"}
                {activeName ? ` ${activeName}` : ""}
              </span>
              {(() => {
                const ex = getExchange(activeCode);
                return (
                  <span
                    className="screener-chart-exchange"
                    style={{ background: ex.color + "22", color: ex.color }}
                  >
                    {getExchangeName(activeCode)}
                  </span>
                );
              })()}
            </div>
            <div className="screener-quote-strip">
              <span className="screener-quote-price">
                {quote
                  ? quote.close.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"}
              </span>
              {quote && (
                <span
                  className="screener-quote-change"
                  style={{
                    color:
                      (() => {
                        const base =
                          quote.prevClose && quote.prevClose > 0
                            ? quote.prevClose
                            : quote.open;
                        return quote.close - base >= 0 ? "var(--market-up)" : "var(--market-down)";
                      })(),
                  }}
                >
                  {(() => {
                    const base =
                      quote.prevClose && quote.prevClose > 0
                        ? quote.prevClose
                        : quote.open;
                    const delta = quote.close - base;
                    const pct = base ? (delta / base) * 100 : 0;
                    return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} (${pct.toFixed(2)}%)`;
                  })()}
                </span>
              )}
            </div>
          </div>

          {/* ECharts container */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <KLineChart
              data={candles}
              title={`${activeCode || "—"}${activeName ? ` ${activeName}` : ""}`}
              height="100%"
              emptyText={tByLang(lang, "暂无K线数据", "No chart data")}
              adjustmentMode={adjustmentMode}
              adjustmentStatus={chartAdjustmentStatus}
              onAdjustmentChange={setAdjustmentMode}
            />
          </div>

          {/* OHLCV quote strip */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 12,
              padding: "12px 0",
              borderTop: "1px solid var(--border-light)",
              fontFamily: "var(--font-display)",
              fontSize: 13,
            }}
          >
            <div>
              <span style={{ color: "var(--text-muted)" }}>O: </span>
              <strong style={{ color: "var(--text-primary)" }}>
                {quote ? quote.open.toFixed(2) : "—"}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>H: </span>
              <strong style={{ color: "var(--text-primary)" }}>
                {quote ? quote.high.toFixed(2) : "—"}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>L: </span>
              <strong style={{ color: "var(--text-primary)" }}>
                {quote ? quote.low.toFixed(2) : "—"}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>VOL: </span>
              <strong style={{ color: "var(--text-primary)" }}>
                {quote ? fmtVol(quote.volume) : "—"}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>C: </span>
              <strong
                style={{
                  color:
                    quote && (quote.prevClose && quote.prevClose > 0
                      ? quote.close - quote.prevClose
                      : quote.close - quote.open) >= 0
                      ? "var(--market-up)"
                      : "var(--market-down)",
                }}
              >
                {quote ? quote.close.toFixed(2) : "—"}
              </strong>
            </div>
          </div>
        </div>
      </main>

      {/* ─── RIGHT PANEL: Results ─── */}
      <aside className="screener-right">
        <div className="screener-right-header">
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-primary)",
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {tByLang(lang, "筛选结果", "Results")}
          </h2>
        </div>

        <div className="screener-right-body">
          {/* Result count */}
          <div className="screener-result-count">
            <strong>
              {tByLang(
                lang,
                `当前展示 ${filteredRows.length} 只 · 因子命中 ${total} 只`,
                `Showing ${filteredRows.length} · Factor matches ${total}`,
              )}
            </strong>
            <span className="screener-hit-rate">
              {universeCount > 0
                ? tByLang(
                    lang,
                    `命中率 ${formatHitRate(hitRate)}（命中 ${total} / 股票池 ${universeCount}）`,
                    `Hit rate ${formatHitRate(hitRate)} (${total}/${universeCount})`,
                  )
                : tByLang(lang, "命中率待计算", "Hit rate pending")}
            </span>
          </div>

          <div style={{ padding: "0 20px 12px", display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                flex: 1,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {tByLang(
                lang,
                `结果日期：${resultDateFilter === "all" ? "最新交易日" : resultDateFilter}`,
                `Result date: ${resultDateFilter === "all" ? "Latest trading day" : resultDateFilter}`,
              )}
            </span>
            <button
              onClick={() => {
                setResultDateFilter("all");
                setHistDate("");
                setActiveAggregation(null);
                setRows([]);
                setTotal(0);
                setUniverseCount(0);
                setHitRate(null);
                setCheckedCodes(new Set());
                setStatus(tByLang(lang, "请选择日期后开始筛选", "Select a date and run screening"));
              }}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border-light)",
                background: "var(--bg-white)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
              }}
            >
              {tByLang(lang, "重置", "Reset")}
            </button>
          </div>

          {runningScreeningTaskCount > 0 && (
            <div className="screener-task-panel screener-task-summary">
              <div className="screener-task-panel-head">
                <span>{tByLang(lang, "后台筛选执行中", "Background Screening Running")}</span>
                <small>{runningScreeningTaskCount}</small>
              </div>
              <p>
                {tByLang(
                  lang,
                  `当前还有 ${runningScreeningTaskCount} 个筛选任务在执行，完成后会自动刷新结果。`,
                  `${runningScreeningTaskCount} screening task(s) are running and results will refresh automatically.`,
                )}
              </p>
            </div>
          )}

          <div style={{ padding: "0 20px 14px", borderBottom: "1px solid var(--border-light)" }}>
            <span className="screener-filter-label">
              {tByLang(lang, "行业/交易所分布", "Industry/Exchange Distribution")}
            </span>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {activeAggregation && (
                <button
                  type="button"
                  onClick={() => setActiveAggregation(null)}
                  className="figma-btn figma-btn-sm"
                  style={{ justifyContent: "space-between", fontSize: 12 }}
                >
                  <span>{tByLang(lang, "清除聚合筛选", "Clear aggregation")}</span>
                  <strong>{activeAggregation.name}</strong>
                </button>
              )}
              {industryAgg.map((x) => {
                const active = activeAggregation?.type === "industry" && activeAggregation.name === x.name;
                return (
                  <button
                    key={`industry-${x.name}`}
                    type="button"
                    onClick={() => setActiveAggregation(active ? null : { type: "industry", name: x.name })}
                    className={`figma-btn figma-btn-sm ${active ? "figma-btn-primary" : ""}`}
                    style={{ justifyContent: "space-between", fontSize: 12 }}
                  >
                    <span>{x.name}</span>
                    <strong>{x.count}</strong>
                  </button>
                );
              })}
              {exchangeAgg.map((x) => {
                const active = activeAggregation?.type === "exchange" && activeAggregation.name === x.name;
                return (
                  <button
                    key={`exchange-${x.name}`}
                    type="button"
                    onClick={() => setActiveAggregation(active ? null : { type: "exchange", name: x.name })}
                    className={`figma-btn figma-btn-sm ${active ? "figma-btn-primary" : ""}`}
                    style={{ justifyContent: "space-between", fontSize: 12 }}
                  >
                    <span>{x.name}</span>
                    <strong>{x.count}</strong>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PE Distribution */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            <span className="screener-filter-label">
              {tByLang(lang, "市盈率分布", "P/E Distribution")}
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                marginTop: 8,
              }}
            >
              {[
                { label: ">100", value: stats.pe.gt100, bucket: "gt100" as PeBucketKey },
                { label: "30-100", value: stats.pe.m30to100, bucket: "m30to100" as PeBucketKey },
                { label: "0-30", value: stats.pe.m0to30, bucket: "m0to30" as PeBucketKey },
                { label: "<0", value: stats.pe.lt0, bucket: "lt0" as PeBucketKey },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="screener-distribution-card"
                  onClick={() => openPeDistribution(item.bucket, item.label)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPeDistribution(item.bucket, item.label);
                    }
                  }}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-lg)",
                    padding: 10,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 20,
                      fontWeight: 600,
                      color: "var(--primary)",
                    }}
                  >
                    {item.value}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Market Cap Distribution */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            <span className="screener-filter-label">
              {tByLang(lang, "市值分布", "Market Cap Dist.")}
            </span>
            <div
              style={{
                marginTop: 8,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {[
                { label: ">1000亿", value: stats.marketCap.gt1000yi, bucket: "gt1000yi" as MarketCapBucketKey },
                {
                  label: "500亿-1000亿",
                  value: stats.marketCap.y500to1000,
                  bucket: "y500to1000" as MarketCapBucketKey,
                },
                {
                  label: "100亿-500亿",
                  value: stats.marketCap.y100to500,
                  bucket: "y100to500" as MarketCapBucketKey,
                },
                { label: "100亿以下", value: stats.marketCap.lt100yi, bucket: "lt100yi" as MarketCapBucketKey },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="screener-distribution-row"
                  onClick={() => openMarketCapDistribution(item.bucket, item.label)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMarketCapDistribution(item.bucket, item.label);
                    }
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "82px 1fr 28px",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    {item.label}
                  </span>
                  <div
                    style={{
                      height: 7,
                      borderRadius: "var(--radius-full)",
                      background: "var(--bg-gray)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(6, (item.value / maxCapBucket) * 100)}%`,
                        borderRadius: "var(--radius-full)",
                        background: "var(--primary)",
                      }}
                    />
                  </div>
                  <strong
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      color: "var(--text-primary)",
                    }}
                  >
                    {item.value}
                  </strong>
                </button>
              ))}
            </div>
          </div>

          {/* Results table */}
          <div style={{ padding: "0 20px 16px" }}>
            <span className="screener-filter-label">
              {tByLang(lang, "股票列表", "Stock List")}
            </span>
            <input
              className="screener-filter-input"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder={tByLang(lang, "按代码/名称过滤", "Filter by code/name")}
              style={{ width: "100%", padding: "6px 8px", marginTop: 8, marginBottom: 8, boxSizing: "border-box" }}
            />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {tByLang(
                  lang,
                  `已选 ${checkedCodes.size} 支，当前表显示 ${displayedRows.length} 支`,
                    `${checkedCodes.size} selected, showing ${displayedRows.length}`,
                  )}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <select
                    value={watchGroup}
                    onChange={(e) => setWatchGroup(e.target.value)}
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-full)",
                      background: "var(--bg-white)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {watchGroups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                  <input
                    value={newWatchGroup}
                    onChange={(e) => setNewWatchGroup(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createWatchGroup();
                    }}
                    placeholder={tByLang(lang, "新建分组", "New group")}
                    style={{
                      width: 92,
                      fontSize: 11,
                      padding: "4px 8px",
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-full)",
                    }}
                  />
                  <button
                    type="button"
                    disabled={addingWatch || !newWatchGroup.trim()}
                    onClick={createWatchGroup}
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      border: "1px solid var(--primary)",
                      borderRadius: "var(--radius-full)",
                      background: "transparent",
                      color: "var(--primary)",
                      cursor: newWatchGroup.trim() ? "pointer" : "not-allowed",
                      opacity: addingWatch || !newWatchGroup.trim() ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tByLang(lang, "建组", "Create")}
                  </button>
                  <button
                    type="button"
                    disabled={addingWatch || selectedResultRows.length === 0}
                    onClick={addSelectedToWatchlist}
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      border: "1px solid var(--market-up)",
                      borderRadius: "var(--radius-full)",
                      background: "transparent",
                      color: "var(--market-up)",
                      cursor: selectedResultRows.length ? "pointer" : "not-allowed",
                      opacity: addingWatch || selectedResultRows.length === 0 ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tByLang(lang, "批量加入自选", "Batch Watch")}
                  </button>
                </div>
              </div>
            <div className="screener-result-table-scroll" style={{ marginTop: 0 }}>
              <table className="figma-table">
                <thead>
                  <tr>
                    <th>
                      <label className="screener-checkbox-hit" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={allDisplayedChecked}
                          disabled={!displayedRows.length}
                          onChange={(e) => toggleDisplayedRows(e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: "var(--primary)" }}
                          aria-label={tByLang(lang, "选择当前列表", "Select visible rows")}
                        />
                      </label>
                    </th>
                    <th>{tByLang(lang, "代码", "Code")}</th>
                    <th>{tByLang(lang, "名称", "Name")}</th>
                    <th>{tByLang(lang, "市值", "Market Cap")}</th>
                    <th>{tByLang(lang, "概念板块", "Concept")}</th>
                    <th>{tByLang(lang, "价格", "Price")}</th>
                    <th>{tByLang(lang, "涨幅", "Change")}</th>
                    <th>{tByLang(lang, "开盘", "Open")}</th>
                    <th>{tByLang(lang, "最高", "High")}</th>
                    <th>{tByLang(lang, "最低", "Low")}</th>
                    <th>{tByLang(lang, "成交额", "Amount")}</th>
                    <th>{tByLang(lang, "成交量", "Volume")}</th>
                    <th>{tByLang(lang, "换手率", "Turnover")}</th>
                    <th>{tByLang(lang, "振幅", "Amplitude")}</th>
                    <th>PE</th>
                    <th>PB</th>
                    <th>ROE</th>
                    <th>{tByLang(lang, "流通市值", "Float Cap")}</th>
                    <th>{tByLang(lang, "行业", "Industry")}</th>
                    <th>{tByLang(lang, "地区", "Area")}</th>
                    <th>{tByLang(lang, "日期", "Date")}</th>
                    <th>{tByLang(lang, "评分", "Score")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length ? (
                    displayedRows.map((r) => (
                      <tr
                        key={`${r.code}-${r.date || ""}`}
                        style={{
                          cursor: "pointer",
                          background:
                            activeCode === r.code
                              ? "var(--primary-light)"
                              : undefined,
                        }}
                        onClick={async () => {
                          setActiveCode(r.code);
                          setActiveName(r.name || "");
                          await loadChart(r.code, r.name || "");
                        }}
                      >
                        <td>
                          <label className="screener-checkbox-hit" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checkedCodes.has(r.code)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setCheckedCodes((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(r.code);
                                  else next.delete(r.code);
                                  return next;
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ accentColor: "var(--primary)" }}
                              aria-label={tByLang(lang, `选择 ${r.name}`, `Select ${r.name}`)}
                            />
                          </label>
                        </td>
                        <td className="mono">{r.code}</td>
                        <td>{r.name}</td>
                        <td className="mono">
                          {formatMarketCapYi(r.market_cap, marketCapDisplayUnit)}
                        </td>
                        <td>{r.concept_board || r.industry || "-"}</td>
                        <td className="mono">
                          {Number(r.price || 0).toFixed(2)}
                        </td>
                        <td className={r.change_pct >= 0 ? "up" : "down"}>
                          {r.change_pct >= 0 ? "+" : ""}
                          {Number(r.change_pct || 0).toFixed(2)}%
                        </td>
                        <td className="mono">{fmtNullableNumber(r.open, 2)}</td>
                        <td className="mono">{fmtNullableNumber(r.high, 2)}</td>
                        <td className="mono">{fmtNullableNumber(r.low, 2)}</td>
                        <td className="mono">{fmtAmount(r.amount)}</td>
                        <td className="mono">{fmtVol(Number(r.volume || 0))}</td>
                        <td className="mono">{fmtPlainPercent(r.turnover_rate, 2)}</td>
                        <td className="mono">{fmtPlainPercent(r.amplitude, 2)}</td>
                        <td className="mono">
                          {typeof r.pe_ratio === "number" ? r.pe_ratio.toFixed(1) : "-"}
                        </td>
                        <td className="mono">
                          {typeof r.pb_ratio === "number" ? r.pb_ratio.toFixed(2) : "-"}
                        </td>
                        <td className="mono">
                          {typeof r.roe_pct === "number" ? `${r.roe_pct.toFixed(2)}%` : "-"}
                        </td>
                        <td className="mono">
                          {formatMarketCapYi(r.circulating_market_cap, marketCapDisplayUnit)}
                        </td>
                        <td>{r.industry || "-"}</td>
                        <td>{r.area || "-"}</td>
                        <td className="mono" style={{ fontSize: 11 }}>
                          {r.date || "-"}
                        </td>
                        <td className="mono">
                          {fmtNullableNumber(r.score, 1)}
                        </td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/quote?code=${r.code}`); }}
                            style={{ fontSize:11, padding:"2px 8px", border:"1px solid var(--primary)", borderRadius:"var(--radius-full)", background:"transparent", color:"var(--primary)", cursor:"pointer", marginRight: 6 }}
                          >K线</button>
                          <button
                            disabled={addingWatch}
                            onClick={(e) => {
                              e.stopPropagation();
                              addToWatchlist({ code: r.code, name: r.name });
                            }}
                            style={{ fontSize:11, padding:"2px 8px", border:"1px solid var(--market-up)", borderRadius:"var(--radius-full)", background:"transparent", color:"var(--market-up)", cursor:"pointer", opacity: addingWatch ? 0.5 : 1 }}
                          >
                            {tByLang(lang, "自选", "Watch")}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={23}
                        style={{
                          textAlign: "center",
                          color: "var(--text-muted)",
                          padding: "28px 0",
                        }}
                      >
                        {loading
                          ? tByLang(lang, "筛选中...", "Screening...")
                          : tByLang(lang, "暂无匹配数据", "No matching data")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </aside>
      {distributionModal && (
        <div
          className="screener-modal-mask"
          onClick={() => setDistributionModal(null)}
        >
          <div
            className="screener-modal"
            role="dialog"
            aria-modal="true"
            aria-label={distributionModal.title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="screener-modal-header">
              <div>
                <p>{tByLang(lang, "筛选分布明细", "Distribution Detail")}</p>
                <h3>{distributionModal.title}</h3>
                <span>{distributionModal.subtitle}</span>
              </div>
              <button
                type="button"
                className="screener-modal-close"
                onClick={() => setDistributionModal(null)}
                aria-label={tByLang(lang, "关闭", "Close")}
              >
                ×
              </button>
            </div>
            <div className="screener-modal-body">
              <div className="screener-modal-table-scroll">
                <table className="figma-table">
                  <thead>
                    <tr>
                      <th>{tByLang(lang, "代码", "Code")}</th>
                      <th>{tByLang(lang, "名称", "Name")}</th>
                      <th>{tByLang(lang, "市值", "Market Cap")}</th>
                      <th>PE</th>
                      <th>PB</th>
                      <th>ROE</th>
                      <th>{tByLang(lang, "价格", "Price")}</th>
                      <th>{tByLang(lang, "涨幅", "Change")}</th>
                      <th>{tByLang(lang, "成交额", "Amount")}</th>
                      <th>{tByLang(lang, "换手率", "Turnover")}</th>
                      <th>{tByLang(lang, "行业", "Industry")}</th>
                      <th>{tByLang(lang, "概念板块", "Concept")}</th>
                      <th>{tByLang(lang, "日期", "Date")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributionModal.rows.length ? (
                      distributionModal.rows.map((r) => (
                        <tr
                          key={`distribution-${r.code}-${r.date || ""}`}
                          style={{ cursor: "pointer" }}
                          onClick={async () => {
                            setActiveCode(r.code);
                            setActiveName(r.name || "");
                            setDistributionModal(null);
                            await loadChart(r.code, r.name || "");
                          }}
                        >
                          <td className="mono">{r.code}</td>
                          <td>{r.name}</td>
                          <td className="mono">
                            {formatMarketCapYi(r.market_cap, marketCapDisplayUnit)}
                          </td>
                          <td className="mono">
                            {typeof r.pe_ratio === "number" ? r.pe_ratio.toFixed(1) : "-"}
                          </td>
                          <td className="mono">
                            {typeof r.pb_ratio === "number" ? r.pb_ratio.toFixed(2) : "-"}
                          </td>
                          <td className="mono">
                            {typeof r.roe_pct === "number" ? `${r.roe_pct.toFixed(2)}%` : "-"}
                          </td>
                          <td className="mono">{fmtNullableNumber(r.price, 2)}</td>
                          <td className={r.change_pct >= 0 ? "up" : "down"}>
                            {fmtPercent(r.change_pct, 2)}
                          </td>
                          <td className="mono">{fmtAmount(r.amount)}</td>
                          <td className="mono">{fmtPlainPercent(r.turnover_rate, 2)}</td>
                          <td>{r.industry || "-"}</td>
                          <td>{r.concept_board || r.industry || "-"}</td>
                          <td className="mono">{r.date || "-"}</td>
                          <td>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                addToWatchlist({ code: r.code, name: r.name });
                              }}
                              disabled={addingWatch}
                              className="screener-modal-action"
                            >
                              {tByLang(lang, "自选", "Watch")}
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={14} style={{ textAlign: "center", padding: "28px 0", color: "var(--text-muted)" }}>
                          {tByLang(lang, "该分布暂无股票", "No stocks in this bucket")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      <LongTaskRewardAdModal
        active={loading && (Boolean(activeScreeningTaskId) || runningScreeningTaskCount > 0)}
        taskKey={`screener:${market}:${activeScreeningTaskId || "starting"}`}
        contextLabel={tByLang(lang, "后台选股", "Background screening")}
      />
    </div>
  );
}
