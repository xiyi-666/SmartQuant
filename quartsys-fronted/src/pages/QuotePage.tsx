import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ChartCandlestick, Search } from "lucide-react";
import { api } from "../api";
import KLineChart, { type KLineAdjustmentMode, type KLineAdjustmentStatus } from "../components/KLineChart";
import { useLanguage, useLangText } from "../shared/language";
import {
  detectMarketFromCode,
  isMarketTradingSession,
  type MarketCode,
  useMarket,
} from "../shared/market";
import { pickBestSecurityMatch } from "../shared/securitySearch";

interface Quote {
  code: string;
  name: string;
  asset_type?: string;
  industry?: string;
  board?: string;
  area?: string;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  market_cap?: number | null;
  circulating_market_cap?: number | null;
  roe?: number | null;
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount?: number | null;
}

type SearchResult = {
  code: string;
  name: string;
  full_code?: string;
  industry?: string;
  board?: string;
  asset_type?: string;
};

type HistoryPoint = {
  date: string;
  open: number;
  close: number;
  low: number;
  high: number;
  volume: number;
  amount: number;
};

type F10Section = {
  status: "ok" | "empty" | "failed";
  source: string;
  columns: string[];
  rows: Record<string, unknown>[];
  error?: string;
};

type StockF10 = {
  code: string;
  name: string;
  updated_at: string;
  overview: Record<string, unknown>;
  sections: Record<string, F10Section | undefined>;
};

function calcMA(data: number[], n: number): (number | null)[] {
  return data.map((_, i) =>
    i < n - 1
      ? null
      : parseFloat(
          (data.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n).toFixed(
            2,
          ),
        ),
  );
}

const KLINE_VIEWS = [
  { key: "D", labelZh: "日线", labelEn: "1D" },
  { key: "W", labelZh: "周线", labelEn: "1W" },
  { key: "M", labelZh: "月线", labelEn: "1M" },
  { key: "YTD", labelZh: "年初至今", labelEn: "YTD" },
  { key: "ALL", labelZh: "全部", labelEn: "ALL" },
] as const;
type KLineViewKey = (typeof KLINE_VIEWS)[number]["key"];
const MA_PERIODS = [5, 10, 20, 30, 60] as const;

const MA_COLORS: Record<number, string> = {
  5: "#FACC15",
  10: "#22D3EE",
  20: "#EF4444",
  30: "#A855F7",
  60: "#F472B6",
};

const F10_TABS = [
  { key: "announcements", label: "公告", labelEn: "Announcements" },
  { key: "research_reports", label: "研报", labelEn: "Research" },
  { key: "financial_analysis", label: "财务分析", labelEn: "Financials" },
  { key: "shareholders", label: "股本股东", labelEn: "Shareholders" },
  { key: "dividends", label: "分红", labelEn: "Dividends" },
  { key: "trading", label: "交易数据", labelEn: "Trading Data" },
  { key: "concepts", label: "概念题材", labelEn: "Themes" },
  { key: "business_composition", label: "主营构成", labelEn: "Business Mix" },
] as const;

const VISIBLE_MA_STATUS_PERIODS = [5, 10, 20, 30] as const;

const EN_US_SECURITY_NAMES: Record<string, string> = {
  usaapl: "Apple",
  usmsft: "Microsoft",
  usnvda: "NVIDIA",
  ustsla: "Tesla",
  "usbrk.b": "Berkshire Hathaway B",
};

const EN_SECURITY_CLASSIFICATIONS: Record<string, string> = {
  "消费电子": "Consumer Electronics",
  "软件服务": "Software Services",
  "半导体": "Semiconductors",
  "信息技术": "Information Technology",
  "汽车": "Automobiles",
  "多元金融": "Diversified Financials",
  "互联网服务": "Internet Services",
  "互联网零售": "Internet Retail",
  "美国": "United States",
  "美股": "U.S. Equity",
  "香港": "Hong Kong",
  "港股": "Hong Kong Equity",
};

function displaySecurityName(code: string, name: string | undefined, lang: "zh" | "en") {
  if (lang !== "en") return name || "--";
  return EN_US_SECURITY_NAMES[String(code || "").toLowerCase()] || name || "--";
}

function displaySecurityClassification(value: string | undefined, lang: "zh" | "en") {
  if (lang !== "en") return value || "";
  return EN_SECURITY_CLASSIFICATIONS[value || ""] || value || "";
}

function exchangeName(code?: string, fullCode?: string, board?: string, lang: "zh" | "en" = "zh") {
  const normalized = (fullCode || code || "").toUpperCase();
  if (normalized.endsWith(".SH")) return lang === "zh" ? "上交所" : "SSE";
  if (normalized.endsWith(".SZ")) return lang === "zh" ? "深交所" : "SZSE";
  if (normalized.endsWith(".BJ")) return lang === "zh" ? "北交所" : "BSE";
  if (normalized.endsWith(".HK") || String(code || "").toLowerCase().startsWith("hk")) {
    return lang === "zh" ? "港交所" : "HKEX";
  }
  if (normalized.endsWith(".US") || String(code || "").toLowerCase().startsWith("us")) {
    return lang === "zh" ? "美股" : "US";
  }
  const digits = String(code || "").replace(/\D/g, "");
  if (/^(5|6|9)/.test(digits)) return lang === "zh" ? "上交所" : "SSE";
  if (/^(0|1|2|3)/.test(digits)) return lang === "zh" ? "深交所" : "SZSE";
  if (/^(4|8)/.test(digits)) return lang === "zh" ? "北交所" : "BSE";
  return board || (lang === "zh" ? "交易所" : "Exchange");
}

function displaySearchCode(item: SearchResult) {
  return item.full_code || item.code;
}

function searchDisplayText(item: SearchResult, lang: "zh" | "en" = "zh") {
  return `${displaySearchCode(item)} ${displaySecurityName(item.code, item.name, lang)} ${exchangeName(item.code, item.full_code, item.board, lang)}`;
}

function assetTypeLabel(assetType: string | undefined, lang: "zh" | "en") {
  const labels: Record<string, [string, string]> = {
    stock: ["股票", "Stock"],
    etf: ["ETF", "ETF"],
    fund: ["基金", "Fund"],
    reit: ["REIT", "REIT"],
    trust: ["信托", "Trust"],
    bond: ["债券", "Bond"],
    convertible_bond: ["可转债", "Convertible Bond"],
    derivative: ["衍生品", "Derivative"],
  };
  return labels[assetType || "stock"]?.[lang === "zh" ? 0 : 1] || (lang === "zh" ? "标的" : "Security");
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeHistoryPoint(item: unknown, market: MarketCode): HistoryPoint | null {
  if (!Array.isArray(item)) return null;
  const [date, open, close, low, high, rawVolume, rawAmount] = item;
  const closeValue = toFiniteNumber(close);
  const amount = positiveNumber(rawAmount);
  let volume = positiveNumber(rawVolume);
  if (!volume && amount && closeValue > 0) {
    volume = amount / closeValue / (market === "CN" ? 100 : 1);
  }
  return {
    date: String(date || ""),
    open: toFiniteNumber(open),
    close: closeValue,
    low: toFiniteNumber(low),
    high: toFiniteNumber(high),
    volume,
    amount,
  };
}

function parseHistoryDate(value: string) {
  const parsed = new Date(`${String(value || "").slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function weekGroupKey(value: string) {
  const parsed = parseHistoryDate(value);
  if (!parsed) return value;
  const day = parsed.getDay() || 7;
  const monday = new Date(parsed);
  monday.setDate(parsed.getDate() - day + 1);
  const y = monday.getFullYear();
  const m = `${monday.getMonth() + 1}`.padStart(2, "0");
  const d = `${monday.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthGroupKey(value: string) {
  return String(value || "").slice(0, 7);
}

function aggregateHistoryPoints(points: HistoryPoint[], period: "W" | "M") {
  const grouped = new Map<string, HistoryPoint[]>();
  points.forEach((point) => {
    const key = period === "W" ? weekGroupKey(point.date) : monthGroupKey(point.date);
    const bucket = grouped.get(key) || [];
    bucket.push(point);
    grouped.set(key, bucket);
  });

  return Array.from(grouped.values()).map((bucket) => {
    const sorted = [...bucket].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const lows = sorted.map((item) => item.low).filter((value) => Number.isFinite(value) && value > 0);
    const highs = sorted.map((item) => item.high).filter((value) => Number.isFinite(value) && value > 0);
    return {
      date: last.date,
      open: first.open,
      close: last.close,
      low: lows.length ? Math.min(...lows) : Math.min(first.open, last.close),
      high: highs.length ? Math.max(...highs) : Math.max(first.open, last.close),
      volume: sorted.reduce((sum, item) => sum + positiveNumber(item.volume), 0),
      amount: sorted.reduce((sum, item) => sum + positiveNumber(item.amount), 0),
    };
  });
}

function buildChartHistory(points: HistoryPoint[], view: KLineViewKey) {
  if (view === "W") return aggregateHistoryPoints(points, "W");
  if (view === "M") return aggregateHistoryPoints(points, "M");
  if (view === "YTD") {
    const latest = points[points.length - 1];
    const parsed = latest ? parseHistoryDate(latest.date) : null;
    if (!parsed) return points;
    const start = `${parsed.getFullYear()}-01-01`;
    return points.filter((item) => item.date >= start);
  }
  return points;
}

function chartInitialBars(view: KLineViewKey, count: number) {
  if (view === "ALL" || view === "YTD") return Math.max(30, count);
  if (view === "W") return 156;
  if (view === "M") return 96;
  return 180;
}

function formatAmount(
  value?: number | null,
  price?: number | null,
  volume?: number | null,
  currencySymbol = "¥",
  market: MarketCode = "CN",
  lang: "zh" | "en" = "zh",
) {
  let amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const p = Number(price);
    const v = Number(volume);
    amount = Number.isFinite(p) && Number.isFinite(v)
      ? p * v * (market === "CN" ? 100 : 1)
      : 0;
  }
  if (!Number.isFinite(amount) || amount <= 0) return "-";
  if (lang === "en") {
    if (amount >= 1_000_000_000) return `${currencySymbol}${(amount / 1_000_000_000).toFixed(2)}B`;
    if (amount >= 1_000_000) return `${currencySymbol}${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${currencySymbol}${(amount / 1_000).toFixed(2)}K`;
    return `${currencySymbol}${amount.toFixed(0)}`;
  }
  if (amount >= 100000000) return `${currencySymbol}${(amount / 100000000).toFixed(2)}亿`;
  if (amount >= 10000) return `${currencySymbol}${(amount / 10000).toFixed(2)}万`;
  return `${currencySymbol}${amount.toFixed(0)}`;
}

function formatVolume(value: number | null | undefined, market: MarketCode, lang: "zh" | "en") {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (lang === "en") {
    const unit = market === "CN" ? "lots" : "shares";
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B ${unit}`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${unit}`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K ${unit}`;
    return `${Math.round(n).toLocaleString()} ${unit}`;
  }
  const unit = market === "CN" ? "手" : "股";
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}亿${unit}`;
  if (n >= 10000) return `${(n / 10000).toFixed(2)}万${unit}`;
  return `${Math.round(n).toLocaleString()} ${unit}`;
}

function resolveAmount(
  value: number | null | undefined,
  price: number | null | undefined,
  volume: number | null | undefined,
  market: MarketCode,
) {
  const amount = Number(value);
  if (Number.isFinite(amount) && amount > 0) return amount;
  const p = Number(price);
  const v = Number(volume);
  return Number.isFinite(p) && Number.isFinite(v) && p > 0 && v > 0
    ? p * v * (market === "CN" ? 100 : 1)
    : 0;
}

export default function QuotePage() {
  const lt = useLangText();
  const { lang } = useLanguage();
  const { market, setMarket, definition } = useMarket();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code") || "";
  const [quote, setQuote] = useState<Quote | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const searchRequestSequence = useRef(0);
  const [error, setError] = useState("");
  const [f10, setF10] = useState<StockF10 | null>(null);
  const [f10Loading, setF10Loading] = useState(false);
  const [f10Error, setF10Error] = useState("");
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [activeF10Tab, setActiveF10Tab] = useState<string>(F10_TABS[0].key);
  const [activeKLineView, setActiveKLineView] = useState<KLineViewKey>("D");
  const [adjustmentMode, setAdjustmentMode] = useState<KLineAdjustmentMode>("none");
  const [historyAdjustmentStatus, setHistoryAdjustmentStatus] = useState<KLineAdjustmentStatus | null>(null);
  const [prevClose, setPrevClose] = useState<number | null>(null);
  const [historyPoints, setHistoryPoints] = useState<HistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const f10Ref = useRef<HTMLElement | null>(null);
  const [watchGroups, setWatchGroups] = useState<string[]>([]);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [newWatchGroup, setNewWatchGroup] = useState("");
  const [watchMsg, setWatchMsg] = useState("");
  const [addingWatch, setAddingWatch] = useState(false);
  const [autoRefreshTick, setAutoRefreshTick] = useState(0);
  const supportsCompanyInfo = market === "CN" && (!quote?.asset_type || quote.asset_type === "stock");

  useEffect(() => {
    if (!code) return;
    const detectedMarket = detectMarketFromCode(code);
    if (detectedMarket !== market) setMarket(detectedMarket);
  }, [code, market, setMarket]);

  // Load quote data and K-line chart
  const loadWatchGroups = async () => {
    try {
      const data: any = await api.getWatchlist();
      const groups = Object.keys(data?.groups || {});
      setWatchGroups(groups);
      return groups;
    } catch {
      setWatchGroups([]);
      return [];
    }
  };

  useEffect(() => {
    loadWatchGroups();
  }, []);

  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(() => {
      if (!isMarketTradingSession(market)) return;
      setAutoRefreshTick((tick) => tick + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [code, market]);

  const createWatchGroup = async () => {
    const name = newWatchGroup.trim();
    if (!name) return;
    setAddingWatch(true);
    setWatchMsg("");
    try {
      await api.createWatchlistGroup({ group_name: name });
      setWatchGroups((groups) => (groups.includes(name) ? groups : [...groups, name]));
      setNewWatchGroup("");
      setWatchMsg(lt(`分组「${name}」已创建`, `Group "${name}" created`));
    } catch (e: any) {
      setWatchMsg(e?.message || lt("创建分组失败", "Failed to create group"));
    } finally {
      setAddingWatch(false);
    }
  };

  const openF10 = (tabKey?: string) => {
    if (tabKey) setActiveF10Tab(tabKey);
    window.setTimeout(() => {
      f10Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setPrevClose(null);
    setHistoryPoints([]);
    setHistoryLoading(true);
    api
      .getStockQuote(code)
      .then((data) => {
        if (!cancelled) setQuote(data);
      })
      .catch(() => {});
    api
      .getStockHistory(code, adjustmentMode)
      .then((res: { data: any[] } & KLineAdjustmentStatus) => {
        if (cancelled) return;
        const raw = Array.isArray(res.data) ? res.data : [];
        const history = raw
          .map((item) => normalizeHistoryPoint(item, market))
          .filter((item): item is HistoryPoint => Boolean(item?.date));
        setHistoryPoints(history);
        setHistoryAdjustmentStatus({
          adjust: res.adjust,
          adjust_fallback: res.adjust_fallback,
          source: res.source,
        });
        if (history.length >= 2) {
          setPrevClose(history[history.length - 2].close);
        } else {
          setPrevClose(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryPoints([]);
          setHistoryAdjustmentStatus(null);
          setError("K线数据加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code, autoRefreshTick, market, adjustmentMode]);

  useEffect(() => {
    if (!code || !supportsCompanyInfo) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F10") {
        event.preventDefault();
        openF10();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [code, supportsCompanyInfo]);

  useEffect(() => {
    if (!code || !supportsCompanyInfo) {
      setF10(null);
      setF10Error("");
      setF10Loading(false);
      return;
    }
    let cancelled = false;
    setF10(null);
    setF10Error("");
    setF10Loading(true);
    setActiveF10Tab(F10_TABS[0].key);
    api
      .getStockF10(code)
      .then((data: StockF10) => {
        if (!cancelled) setF10(data);
      })
      .catch((e: any) => {
        if (!cancelled) setF10Error(e?.message || "公司信息加载失败");
      })
      .finally(() => {
        if (!cancelled) setF10Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, supportsCompanyInfo]);

  const openSearchResult = (result: SearchResult) => {
    searchRequestSequence.current += 1;
    setQuery("");
    setResults([]);
    setSearchState("idle");
    navigate(`/quote?code=${encodeURIComponent(result.code)}`);
  };

  const submitSearch = async () => {
    const searchQuery = query.trim();
    if (!searchQuery) return;
    const requestId = ++searchRequestSequence.current;
    setResults([]);
    setSearchState("loading");
    try {
      const response = await api.searchStocks(searchQuery, market);
      if (searchRequestSequence.current !== requestId) return;
      const bestMatch = pickBestSecurityMatch(
        Array.isArray(response) ? response as SearchResult[] : [],
        searchQuery,
      );
      if (bestMatch) {
        openSearchResult(bestMatch);
        return;
      }
      setSearchState("empty");
    } catch {
      if (searchRequestSequence.current === requestId) setSearchState("error");
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void submitSearch();
  };

  // Stock search debounce
  useEffect(() => {
    const searchQuery = query.trim();
    const requestId = ++searchRequestSequence.current;
    if (!searchQuery) {
      setResults([]);
      setSearchState("idle");
      return;
    }
    setResults([]);
    setSearchState("loading");
    const t = setTimeout(() => {
      api
        .searchStocks(searchQuery, market)
        .then((r: any) => {
          if (searchRequestSequence.current !== requestId) return;
          const matches = Array.isArray(r) ? r as SearchResult[] : [];
          setResults(matches);
          setSearchState(matches.length ? "idle" : "empty");
        })
        .catch(() => {
          if (searchRequestSequence.current === requestId) setSearchState("error");
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, market]);

  // Calculate change values from quote data
  const basis = prevClose && prevClose > 0 ? prevClose : quote?.open || 0;
  const changeAmount = quote ? quote.close - basis : 0;
  const changePct = basis ? (changeAmount / basis) * 100 : 0;
  const isPositive = changeAmount >= 0;
  const formatMetric = (value?: number | null, suffix = "", digits = 2) =>
    typeof value === "number" && Number.isFinite(value)
      ? `${value.toFixed(digits)}${suffix}`
      : "-";
  const activeF10Section = f10?.sections?.[activeF10Tab];
  const displayQuoteName = displaySecurityName(quote?.code || code, quote?.name, lang);
  const latestHistoryPoint = historyPoints[historyPoints.length - 1] || null;
  const prevHistoryPoint = historyPoints[historyPoints.length - 2] || null;
  const currentVolume = quote?.volume ?? latestHistoryPoint?.volume ?? 0;
  const previousVolume = prevHistoryPoint?.volume ?? 0;
  const currentAmount = resolveAmount(
    quote?.amount ?? latestHistoryPoint?.amount,
    quote?.close ?? latestHistoryPoint?.close,
    currentVolume,
    market,
  );
  const previousAmount = resolveAmount(
    prevHistoryPoint?.amount,
    prevHistoryPoint?.close,
    previousVolume,
    market,
  );
  const visibleHistoryPoints = useMemo(
    () => buildChartHistory(historyPoints, activeKLineView),
    [activeKLineView, historyPoints],
  );
  const visibleHistoryBars = useMemo(
    () => chartInitialBars(activeKLineView, visibleHistoryPoints.length),
    [activeKLineView, visibleHistoryPoints.length],
  );
  const renderMetricDelta = (current: number, previous: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
      return null;
    }
    const delta = current - previous;
    const pct = (delta / previous) * 100;
    const up = delta >= 0;
    return (
      <span className={`quote-ohlcv-delta ${up ? "up" : "down"}`}>
        <span className="quote-ohlcv-arrow">{up ? "▲" : "▼"}</span>
        {up ? "+" : ""}
        {pct.toFixed(2)}%
      </span>
    );
  };
  const emptyF10Text =
    activeF10Tab === "research_reports"
      ? lt("未获取到最新的研报", "No latest research reports found")
      : lt("暂无数据", "No data");
  const refreshF10 = async () => {
    if (!code || !supportsCompanyInfo || f10Loading) return;
    setF10Error("");
    setF10Loading(true);
    try {
      const data = await api.getStockF10(code, true);
      setF10(data as StockF10);
    } catch (e: any) {
      setF10Error(e?.message || lt("公司信息刷新失败", "Failed to refresh company information"));
    } finally {
      setF10Loading(false);
    }
  };
  const formatF10Cell = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number" && Number.isFinite(value)) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    return String(value);
  };
  const previewTitle = (column: string, row: Record<string, unknown>) =>
    formatF10Cell(
      row["公告标题"] || row["报告名称"] || row["标题"] || row["名称"] || column,
    );
  const isDocumentUrl = (value: string) => /^https?:\/\//i.test(value);
  const renderF10Cell = (
    column: string,
    value: unknown,
    row: Record<string, unknown>,
  ) => {
    const text = formatF10Cell(value);
    const isLinkColumn = /链接|网址|PDF|URL|地址/i.test(column);
    if ((isLinkColumn || isDocumentUrl(text)) && isDocumentUrl(text)) {
      return (
        <button
          type="button"
          className="quote-doc-link"
          onClick={() => setPreviewDoc({ title: previewTitle(column, row), url: text })}
        >
          {lt("查看", "View")}
        </button>
      );
    }
    return text;
  };

  // ─── Search-only view (no code in URL) ───
  if (!code) {
    return (
      <div className="quote-page">
        <div className="quote-search-section">
          <div className="quote-search-row">
            <input
              className="screener-filter-input"
              placeholder={lt("输入代码或名称...", "Enter code or name...")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              style={{ flex: 1, padding: "17px 16px" }}
            />
            <button className="quote-search-btn" type="button" onClick={() => void submitSearch()}>{lt("搜索", "Search")}</button>
          </div>
          {results.length > 0 && (
            <ul
              style={{
                marginTop: 12,
                background: "var(--bg-white)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-xl)",
                overflow: "hidden",
                listStyle: "none",
                padding: 0,
              }}
            >
              {results.map((r) => (
                <li key={r.code}>
                  <button
                    onClick={() => openSearchResult(r)}
                    style={{ display:"grid", gridTemplateColumns:"96px minmax(0,1fr) 70px", gap: 10, alignItems: "center", width:"100%", padding:"12px 16px", background:"none", border:"none", cursor:"pointer", borderBottom:"1px solid var(--border-light)", fontSize:14, textAlign: "left" }}
                  >
                    <span style={{ fontFamily:"var(--font-display)", fontWeight:600, color:"var(--primary)" }}>{displaySearchCode(r)}</span>
                    <span style={{ color:"var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displaySecurityName(r.code, r.name, lang)}</span>
                    <span style={{ color:"var(--text-muted)", fontSize: 12, textAlign: "right" }}>{assetTypeLabel(r.asset_type, lang)} · {exchangeName(r.code, r.full_code, r.board, lang)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && searchState !== "loading" && results.length === 0 && (
            <p className="quote-search-message" role="status">
              {searchState === "error"
                ? lt("搜索暂时不可用，请稍后重试。", "Search is temporarily unavailable. Try again later.")
                : lt("未找到匹配标的，请检查代码或名称。", "No matching security found. Check the ticker or name.")}
            </p>
          )}
        </div>
        {results.length === 0 && (
          <div className="quote-empty-state">
            <div className="quote-empty-icon" aria-hidden="true">
              <ChartCandlestick size={28} />
            </div>
            <h2>{lt("查询股票详情", "Find a security")}</h2>
            <p>
              {lt(
                "输入股票代码或名称，可查看分时、K 线、成交量、公司公告与研报。",
                "Enter a ticker or name to view intraday data, K-lines, volume and company research.",
              )}
            </p>
            <span><Search size={15} aria-hidden="true" /> {lt("支持代码和名称模糊查询", "Ticker and name search supported")}</span>
          </div>
        )}
      </div>
    );
  }

  // ─── Full stock detail view ───
  return (
    <div className="quote-page">
      {/* Search section */}
      <div className="quote-search-section">
        <div className="quote-search-row">
          <input
            className="screener-filter-input"
              placeholder={lt("输入代码或名称...", "Enter code or name...")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={{ flex: 1, padding: "17px 16px" }}
          />
          <button className="quote-search-btn" type="button" onClick={() => void submitSearch()}>{lt("搜索", "Search")}</button>
        </div>
        {results.length > 0 && (
          <ul
            style={{
              marginTop: 12,
              background: "var(--bg-white)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-xl)",
              overflow: "hidden",
              listStyle: "none",
              padding: 0,
            }}
          >
            {results.map((r) => (
              <li key={r.code}>
                <button
                  onClick={() => openSearchResult(r)}
                  style={{ display:"grid", gridTemplateColumns:"96px minmax(0,1fr) 70px", gap: 10, alignItems: "center", width:"100%", padding:"12px 16px", background:"none", border:"none", cursor:"pointer", borderBottom:"1px solid var(--border-light)", fontSize:14, textAlign: "left" }}
                  >
                  <span style={{ fontFamily:"var(--font-display)", fontWeight:600, color:"var(--primary)" }}>{displaySearchCode(r)}</span>
                  <span style={{ color:"var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displaySecurityName(r.code, r.name, lang)}</span>
                  <span style={{ color:"var(--text-muted)", fontSize: 12, textAlign: "right" }}>{assetTypeLabel(r.asset_type, lang)} · {exchangeName(r.code, r.full_code, r.board, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim() && searchState !== "loading" && results.length === 0 && (
          <p className="quote-search-message" role="status">
            {searchState === "error"
              ? lt("搜索暂时不可用，请稍后重试。", "Search is temporarily unavailable. Try again later.")
              : lt("未找到匹配标的，请检查代码或名称。", "No matching security found. Check the ticker or name.")}
          </p>
        )}
      </div>

      {/* Stock header */}
      {quote && (
        <div className="quote-header">
          <div className="quote-identity" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="quote-ticker">{quote.code} {displayQuoteName}</span>
            <span className="quote-market-badge">{assetTypeLabel(quote.asset_type, lang)}</span>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowGroupPicker((v) => !v)}
                style={{ padding: "4px 12px", fontSize: 12, border: "1px solid var(--primary)", borderRadius: "var(--radius-full)", background: "transparent", color: "var(--primary)", cursor: "pointer" }}
              >+ {lt("自选", "Watchlist")}</button>
              {showGroupPicker && (
                <div
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
                    background: "var(--bg-white)", border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-md)",
                    minWidth: 160, padding: "8px 0",
                  }}
                  >
                    <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--border-light)" }}>
                      <input
                        value={newWatchGroup}
                        onChange={(e) => setNewWatchGroup(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") createWatchGroup();
                        }}
                        placeholder={lt("新建分组", "New group")}
                        style={{
                          minWidth: 0,
                          flex: 1,
                          padding: "6px 8px",
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-lg)",
                          fontSize: 12,
                        }}
                      />
                      <button
                        type="button"
                        disabled={addingWatch || !newWatchGroup.trim()}
                        onClick={createWatchGroup}
                        style={{
                          padding: "6px 8px",
                          border: "1px solid var(--primary)",
                          borderRadius: "var(--radius-lg)",
                          background: "transparent",
                          color: "var(--primary)",
                          fontSize: 12,
                          cursor: newWatchGroup.trim() ? "pointer" : "not-allowed",
                          opacity: addingWatch || !newWatchGroup.trim() ? 0.5 : 1,
                        }}
                      >
                        {lt("创建", "Create")}
                      </button>
                    </div>
                    {watchGroups.length === 0 && (
                      <p style={{ padding: "8px 14px", fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{lt("暂无分组，可先在上方新建", "No groups yet. Create one above.")}</p>
                    )}
                    {watchGroups.map((g) => (
                      <button
                        key={g}
                      disabled={addingWatch}
                        onClick={async () => {
                          setAddingWatch(true);
                          setWatchMsg("");
                          try {
                            await api.addToWatchlist({ group_name: g, code: quote.code, name: quote.name });
                            await loadWatchGroups();
                            setWatchMsg(lt(`已加入「${g}」`, `Added to "${g}"`));
                            setShowGroupPicker(false);
                        } catch (e: any) {
                          setWatchMsg(e?.message || lt("添加失败", "Add failed"));
                        } finally {
                          setAddingWatch(false);
                        }
                      }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "8px 14px", border: "none", background: "transparent",
                        fontSize: 13, cursor: "pointer", color: "var(--text-primary)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-light)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >{g}</button>
                  ))}
                </div>
              )}
            </div>
            {watchMsg && <span style={{ fontSize: 12, color: "var(--primary)" }}>{watchMsg}</span>}
            {quote.industry && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{displaySecurityClassification(quote.industry, lang)}</span>}
            {quote.board && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{displaySecurityClassification(quote.board, lang)}</span>}
          </div>
          <div className="quote-price-block">
            <div className="quote-price">
              {definition.currencySymbol}
              {quote.close?.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className={`quote-change ${isPositive ? "up" : "down"}`}>
              <span className="quote-change-text">
                {isPositive ? "+" : ""}
                {changePct.toFixed(2)}% ({isPositive ? "+" : ""} {definition.currencySymbol}
                {Math.abs(changeAmount).toFixed(2)})
              </span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 14, margin: "8px 0" }}>
          {error}
        </p>
      )}

      {/* Chart area */}
      <div className="quote-chart-section">
        <div className="quote-chart-controls">
          {/* Time range buttons */}
          <div className="figma-time-group">
            {KLINE_VIEWS.map((range) => (
              <button
                key={range.key}
                className={`figma-time-btn${activeKLineView === range.key ? " active" : ""}`}
                onClick={() => setActiveKLineView(range.key)}
                aria-pressed={activeKLineView === range.key}
              >
                {lang === "zh" ? range.labelZh : range.labelEn}
              </button>
            ))}
          </div>

          {/* Expand button */}
        </div>

        <KLineChart
          data={visibleHistoryPoints}
          title={quote ? `${quote.code} ${displayQuoteName}`.trim() : code || lt("股票详情", "Stock Details")}
          height={500}
          loading={historyLoading}
          emptyText={lt("暂无K线数据", "No K-line data")}
          initialVisibleBars={visibleHistoryBars}
          adjustmentMode={adjustmentMode}
          adjustmentStatus={historyAdjustmentStatus}
          onAdjustmentChange={setAdjustmentMode}
        />
      </div>

      {/* OHLCV Summary */}
      <div className="quote-ohlcv-row">
        <div className="quote-ohlcv-item">
          <span className="quote-ohlcv-label">{lt("开盘", "Open")} (O)</span>
          <span className="quote-ohlcv-value">
            {definition.currencySymbol}
            {quote?.open?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "-"}
          </span>
        </div>
        <div className="quote-ohlcv-item">
          <span className="quote-ohlcv-label">{lt("最高", "High")} (H)</span>
          <span className="quote-ohlcv-value">
            {definition.currencySymbol}
            {quote?.high?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "-"}
          </span>
        </div>
        <div className="quote-ohlcv-item">
          <span className="quote-ohlcv-label">{lt("最低", "Low")} (L)</span>
          <span className="quote-ohlcv-value">
            {definition.currencySymbol}
            {quote?.low?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "-"}
          </span>
        </div>
        <div className="quote-ohlcv-item">
          <span className="quote-ohlcv-label">{lt("成交量", "Volume")} (VOL)</span>
          <span className="quote-ohlcv-value">
            {formatVolume(currentVolume, market, lang)}
          </span>
          {renderMetricDelta(currentVolume, previousVolume)}
        </div>
        <div className="quote-ohlcv-item">
          <span className="quote-ohlcv-label">{lt("成交额", "Turnover")}</span>
          <span className="quote-ohlcv-value">
            {formatAmount(currentAmount, null, null, definition.currencySymbol, market, lang)}
          </span>
          {renderMetricDelta(currentAmount, previousAmount)}
        </div>
        <div className="quote-ohlcv-item">
          <span className="quote-ohlcv-label">CLOSE</span>
          <span className="quote-ohlcv-value">
            {definition.currencySymbol}
            {quote?.close?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "-"}
          </span>
        </div>
        <div className="quote-ohlcv-item">
          <span className="quote-ohlcv-label">PE</span>
          <span className="quote-ohlcv-value">{formatMetric(quote?.pe_ratio)}</span>
        </div>
        <div className="quote-ohlcv-item">
          <span className="quote-ohlcv-label">PB</span>
          <span className="quote-ohlcv-value">{formatMetric(quote?.pb_ratio)}</span>
        </div>
        <div className="quote-ohlcv-item">
          <span className="quote-ohlcv-label">{lt("总市值", "Market Cap")}</span>
          <span className="quote-ohlcv-value">
            {formatMetric(
              quote?.market_cap,
              lt(definition.marketCapUnitZh, ` ${definition.marketCapUnitEn}`),
              1,
            )}
          </span>
        </div>
      </div>

      <section ref={f10Ref} className="quote-f10-section">
        <div className="quote-f10-header">
          <div>
            <h2>{lt("公司信息", "Company Information")}</h2>
            <span>
              {supportsCompanyInfo
                ? f10?.updated_at
                  ? lt(`更新于 ${f10.updated_at}`, `Updated ${f10.updated_at}`)
                  : lt("个股资料", "Company profile")
                : lt(
                    `${definition.labelZh}公司资料源正在接入，行情与K线可正常使用`,
                    `${definition.labelEn} company filings are being integrated; quotes and charts remain available`,
                  )}
            </span>
          </div>
          {supportsCompanyInfo && (
            <button
              className="quote-f10-refresh"
              type="button"
              disabled={f10Loading}
              onClick={refreshF10}
            >
              {f10Loading ? lt("加载中", "Loading") : lt("刷新", "Refresh")}
            </button>
          )}
        </div>

        {supportsCompanyInfo ? (
          <>
            <div className="quote-f10-tabs">
              {F10_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`quote-f10-tab${activeF10Tab === tab.key ? " active" : ""}`}
                  onClick={() => setActiveF10Tab(tab.key)}
                >
                  {lt(tab.label, tab.labelEn)}
                </button>
              ))}
            </div>

            <div className="quote-f10-body">
          {f10Loading && !activeF10Section && (
            <div className="quote-f10-state">{lt("公司信息加载中...", "Loading company information...")}</div>
          )}
          {f10Error && (
            <div className="quote-f10-state error">{f10Error}</div>
          )}
          {!f10Loading && activeF10Section?.status === "failed" && (
            <div className="quote-f10-state error">
              {activeF10Section.error || lt("该分项数据源暂不可用", "This data source is temporarily unavailable")}
            </div>
          )}
          {!f10Loading && activeF10Section?.status !== "failed" && activeF10Section?.rows?.length === 0 && (
            <div className="quote-f10-state">{emptyF10Text}</div>
          )}
          {activeF10Section?.rows && activeF10Section.rows.length > 0 && (
            <div className="quote-f10-table-wrap">
              <table className="figma-table quote-f10-table">
                <thead>
                  <tr>
                    {activeF10Section.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeF10Section.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {activeF10Section.columns.map((column) => (
                        <td key={column}>{renderF10Cell(column, row[column], row)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
            </div>
          </>
        ) : (
          <div className="quote-f10-body">
            <div className="quote-f10-state">
              {lt(
                "当前市场暂只提供实时报价、分时与历史K线。",
                "This market currently provides real-time quotes, intraday data and historical K-lines.",
              )}
            </div>
          </div>
        )}
      </section>

      {previewDoc && (
        <div
          className="quote-doc-modal-mask"
          role="dialog"
          aria-modal="true"
          aria-label={previewDoc.title}
        >
          <div className="quote-doc-modal">
            <div className="quote-doc-modal-header">
              <div>
                <h3>{previewDoc.title}</h3>
                <span>{previewDoc.url}</span>
              </div>
              <div className="quote-doc-modal-actions">
                <a href={api.getDocumentViewerUrl(previewDoc.url, previewDoc.title)} target="_blank" rel="noreferrer">
                  预览窗口打开
                </a>
                <button type="button" onClick={() => setPreviewDoc(null)}>
                  关闭
                </button>
              </div>
            </div>
            <iframe
              className="quote-doc-frame"
              src={api.getDocumentViewerUrl(previewDoc.url, previewDoc.title)}
              title={previewDoc.title}
            />
          </div>
        </div>
      )}
    </div>
  );
}
