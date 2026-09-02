import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../api";
import IntradayChart, { type IntradayPoint } from "../components/IntradayChart";
import KLineChart, { type KLineAdjustmentMode, type KLineAdjustmentStatus } from "../components/KLineChart";
import { fmtMoney, fmtPct, getChangeColorClass } from "../lib/utils";
import { useLangText } from "../shared/language";
import {
  detectMarketFromCode,
  isCodeInMarket,
  isMarketTradingSession,
  useMarket,
} from "../shared/market";

interface Index {
  code: string;
  name: string;
  name_en?: string;
  close: number;
  change_pct: number;
  market?: string;
  currency?: string;
  primary?: boolean;
  date?: string;
  source?: string;
}
interface IndexConstituent {
  code: string;
  name: string;
  exchange?: string;
  industry?: string;
  board?: string;
  weight?: number | null;
  price?: number | null;
  change_pct?: number | null;
  volume?: number | null;
  amount?: number | null;
  turnover_rate?: number | null;
  amplitude?: number | null;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  market_cap?: number | null;
  date?: string;
  source?: string;
}
interface Position {
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  market_value: number;
  daily_change_pct?: number;
  daily_change_amount?: number;
  price_date?: string | null;
}
interface WatchGroup {
  name: string;
  stocks: {
    code: string;
    name: string;
    price?: number;
    change_pct?: number;
    date?: string;
    industry?: string;
    board?: string;
    pe_ratio?: number | null;
    market_cap?: number | null;
  }[];
  color?: string;
}
type GainerGroupType = "industry" | "board";

interface GainerIndustry {
  industry: string;
  name?: string;
  code?: string;
  detail_code?: string;
  stock_count?: number;
  source?: string;
  group_type?: GainerGroupType;
  avg_change: number;
  stocks: { code: string; name: string; change_pct: number }[];
}
type DisplayGainerIndustry = GainerIndustry & {
  rank: number;
  change: string;
  group_type: GainerGroupType;
};
interface News {
  title: string;
  summary?: string;
  time: string;
  source: string;
  url?: string;
  category?: string;
  topic?: string;
}
interface DashboardNewsPayload {
  domestic: News[];
  international: News[];
  watchlist: News[];
  focus_stocks?: { code: string; name: string; reason: string }[];
  sources?: Record<string, string>;
}
type Sentiment = "BULLISH" | "BEARISH" | "NEUTRAL";

type ChartStock = { code: string; name: string };

type CandlePoint = {
  date: string;
  open: number;
  close: number;
  low: number;
  high: number;
  volume: number;
  amount?: number | null;
};

const DASHBOARD_CHART_REFRESH_MS = 60_000;

function toFiniteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseHistory(raw: unknown): CandlePoint[] {
  const points = Array.isArray((raw as any)?.data) ? (raw as any).data : [];
  return points
    .map((item: unknown) => {
      if (!Array.isArray(item) || item.length < 6) return null;
      const [date, open, close, low, high, volume, amount] = item;
      const openValue = toFiniteNumber(open);
      const closeValue = toFiniteNumber(close);
      const lowValue = toFiniteNumber(low);
      const highValue = toFiniteNumber(high);
      const volumeValue = toFiniteNumber(volume) ?? 0;
      const amountValue = toFiniteNumber(amount);
      if (!date || openValue == null || closeValue == null || lowValue == null || highValue == null) {
        return null;
      }
      if ([openValue, closeValue, lowValue, highValue].some((value) => value <= 0)) {
        return null;
      }
      const normalizedLow = Math.min(openValue, closeValue, lowValue, highValue);
      const normalizedHigh = Math.max(openValue, closeValue, lowValue, highValue);
      return {
        date: String(date).slice(0, 10),
        open: openValue,
        close: closeValue,
        low: normalizedLow,
        high: normalizedHigh,
        volume: Math.max(0, volumeValue),
        amount: amountValue && amountValue > 0 ? amountValue : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String((a as CandlePoint).date).localeCompare(String((b as CandlePoint).date))) as CandlePoint[];
}

function scheduleChartResize() {
  if (typeof window === "undefined") return () => {};
  const timers = [0, 80, 180].map((delay) =>
    window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, delay),
  );
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}

function inferSentiment(text: string): Sentiment {
  const t = text.toLowerCase();
  const bullish = [
    "利好",
    "上涨",
    "突破",
    "新高",
    "增长",
    "反弹",
    "涨",
    "增持",
    "买入",
    "强势",
    "复苏",
  ];
  const bearish = [
    "利空",
    "下跌",
    "跌破",
    "新低",
    "下滑",
    "跌",
    "减持",
    "卖出",
    "弱势",
    "衰退",
    "风险",
    "暴跌",
    "预警",
    "熔断",
  ];
  for (const kw of bullish) {
    if (t.includes(kw)) return "BULLISH";
  }
  for (const kw of bearish) {
    if (t.includes(kw)) return "BEARISH";
  }
  return "NEUTRAL";
}

function sentimentBadge(s: Sentiment) {
  switch (s) {
    case "BULLISH":
      return { text: "利好", cls: "figma-badge figma-badge-up" };
    case "BEARISH":
      return { text: "利空", cls: "figma-badge figma-badge-down" };
    case "NEUTRAL":
      return { text: "中性", cls: "figma-badge" };
  }
}

const INTERNATIONAL_NEWS_KEYWORDS = [
  "国际",
  "全球",
  "海外",
  "美股",
  "美联储",
  "美元",
  "纳指",
  "道指",
  "标普",
  "欧洲",
  "欧元",
  "日本",
  "韩国",
  "印度",
  "原油",
  "黄金",
  "地缘",
  "关税",
  "外盘",
  "港股",
  "俄乌",
  "伊朗",
  "以色列",
  "冲突",
  "制裁",
  "出口管制",
  "半导体",
  "芯片",
  "AI",
  "人工智能",
  "算力",
  "CPO",
  "光模块",
  "数据中心",
  "GPU",
  "HBM",
  "英伟达",
  "台积电",
  "ASML",
];

function isInternationalNews(item: News) {
  const text = `${item.title} ${item.summary || ""} ${item.source || ""}`;
  return INTERNATIONAL_NEWS_KEYWORDS.some((kw) => text.includes(kw));
}

function buildStockNewsTokens(positions: Position[], groups: WatchGroup[]) {
  const tokens = new Set<string>();
  positions.forEach((p) => {
    if (p.stock_code) tokens.add(p.stock_code);
    if (p.stock_name) tokens.add(p.stock_name);
  });
  groups.forEach((group) =>
    group.stocks.forEach((stock) => {
      if (stock.code) tokens.add(stock.code);
      if (stock.name) tokens.add(stock.name);
    }),
  );
  return Array.from(tokens).filter((token) => token.length >= 2);
}

function newsMatchesTokens(item: News, tokens: string[]) {
  const text = `${item.title} ${item.summary || ""}`;
  return tokens.some((token) => text.includes(token));
}

function sourceChipStyle(source = "", category = "") {
  const text = `${source} ${category}`;
  if (/财新|国内|A股|证券|时报|日报/.test(text)) {
    return { color: "var(--danger)", background: "var(--danger-bg)", borderColor: "color-mix(in srgb, var(--danger) 28%, var(--border-light))" };
  }
  if (/国际|global|em|futu|sina|ths|美股|海外/i.test(text)) {
    return { color: "var(--primary)", background: "var(--primary-light)", borderColor: "color-mix(in srgb, var(--brand-accent) 36%, var(--border-light))" };
  }
  if (/持仓|自选/.test(text)) {
    return { color: "var(--success)", background: "var(--success-bg)", borderColor: "var(--success-border)" };
  }
  return { color: "var(--text-secondary)", background: "var(--bg-gray)", borderColor: "var(--border-light)" };
}

function topicChipStyle(topic = "") {
  if (topic.includes("AI")) {
    return { color: "var(--danger)", background: "var(--danger-bg)", borderColor: "color-mix(in srgb, var(--danger) 28%, var(--border-light))" };
  }
  return { color: "var(--primary)", background: "var(--primary-light)", borderColor: "color-mix(in srgb, var(--brand-accent) 36%, var(--border-light))" };
}

function canUseDocumentViewer(url = "") {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "eastmoney.com" ||
      host.endsWith(".eastmoney.com") ||
      host === "dfcfw.com" ||
      host.endsWith(".dfcfw.com")
    );
  } catch {
    return false;
  }
}

function newsPreviewUrl(news: News) {
  if (!news.url) return "";
  return canUseDocumentViewer(news.url)
    ? api.getDocumentViewerUrl(news.url, news.title)
    : news.url;
}

function NewsSection({
  title,
  titleEn,
  items,
  onOpenNews,
}: {
  title: string;
  titleEn: string;
  items: News[];
  onOpenNews: (item: News) => void;
}) {
  const lt = useLangText();
  return (
    <section className="dashboard-news-section">
      <h4>{lt(title, titleEn)}</h4>
      <div className="dashboard-news-section-list">
        {items.map((n, i) => {
          const sentiment = inferSentiment(`${n.title} ${n.summary || ""}`);
          const badge = sentimentBadge(sentiment);
          const content = (
            <div className="dashboard-news-card-inner">
              <div className="dashboard-news-card-main">
                <div className="dashboard-news-title-row">
                  <span className={`dashboard-news-sentiment ${badge.cls}`}>
                    {lt(badge.text, badge.text === "利好" ? "Bullish" : badge.text === "利空" ? "Bearish" : "Neutral")}
                  </span>
                  <p className="figma-article-title">{n.title}</p>
                </div>
                {n.summary && (
                  <p className="figma-article-summary">{n.summary}</p>
                )}
                <div className="dashboard-news-meta-line">
                  {n.source && (
                    <span
                      className="dashboard-news-source-chip"
                      style={sourceChipStyle(n.source, n.category)}
                    >
                      {n.source}
                    </span>
                  )}
                  {n.topic && (
                    <span
                      className="dashboard-news-source-chip"
                      style={topicChipStyle(n.topic)}
                    >
                      {lt(n.topic, n.topic === "AI产业链" ? "AI Chain" : n.topic)}
                    </span>
                  )}
                  {n.time && <span className="figma-article-time">{n.time}</span>}
                </div>
              </div>
            </div>
          );
          return (
            <button
              key={`${title}-${i}`}
              type="button"
              className="figma-article dashboard-news-card"
              title={n.url ? lt("查看原文", "View original") : lt("查看详情", "View details")}
              onClick={() => onOpenNews(n)}
            >
              {content}
            </button>
          );
        })}
        {items.length === 0 && (
          <p className="dashboard-news-empty">{lt("暂无相关资讯", "No related news")}</p>
        )}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const lt = useLangText();
  const { market, definition } = useMarket();
  const [indices, setIndices] = useState<Index[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [balance, setBalance] = useState(0);
  const [totalAssets, setTotalAssets] = useState(0);
  const [watchGroups, setWatchGroups] = useState<WatchGroup[]>([]);
  const [newGroup, setNewGroup] = useState("");
  const [gainers, setGainers] = useState<GainerIndustry[]>([]);
  const [boardGainers, setBoardGainers] = useState<GainerIndustry[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [dashboardNews, setDashboardNews] = useState<DashboardNewsPayload>({
    domestic: [],
    international: [],
    watchlist: [],
  });
  const [gainDate, setGainDate] = useState("");
  const [activeTab, setActiveTab] = useState<"positions" | "watchlist">("positions");
  const [gainerTab, setGainerTab] = useState<GainerGroupType>("industry");
  const [msg, setMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [chartStock, setChartStock] = useState<ChartStock | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<Index | null>(null);
  const [selectedIndustry, setSelectedIndustry] =
    useState<DisplayGainerIndustry | null>(null);
  const [selectedNews, setSelectedNews] = useState<News | null>(null);
  const [modalCandles, setModalCandles] = useState<CandlePoint[]>([]);
  const [modalAdjustmentStatus, setModalAdjustmentStatus] = useState<KLineAdjustmentStatus | null>(null);
  const [modalIntraday, setModalIntraday] = useState<IntradayPoint[]>([]);
  const [modalIntradayMeta, setModalIntradayMeta] = useState<{
    date?: string;
    prev_close?: number | null;
    source?: string;
    market?: "CN" | "HK" | "US";
  }>({});
  const [modalLoading, setModalLoading] = useState(false);
  const [modalIntradayLoading, setModalIntradayLoading] = useState(false);
  const [chartMode, setChartMode] = useState<"intraday" | "daily">("intraday");
  const [modalAdjustmentMode, setModalAdjustmentMode] = useState<KLineAdjustmentMode>("none");
  const [indexCandles, setIndexCandles] = useState<CandlePoint[]>([]);
  const [indexConstituents, setIndexConstituents] = useState<IndexConstituent[]>([]);
  const [indexConstituentFilter, setIndexConstituentFilter] = useState("");
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexConstituentLoading, setIndexConstituentLoading] = useState(false);
  const [indexDetailSource, setIndexDetailSource] = useState("");
  const [indexConstituentMode, setIndexConstituentMode] = useState("");
  const [industryCandles, setIndustryCandles] = useState<CandlePoint[]>([]);
  const [industryLoading, setIndustryLoading] = useState(false);
  const [editingWatchGroup, setEditingWatchGroup] = useState("");
  const [editingWatchGroupName, setEditingWatchGroupName] = useState("");

  async function loadWatchlistData() {
    try {
      const d: any = await api.getWatchlist();
      const groups = d?.groups || {};
      const colors = d?.colors || {};
      setWatchGroups(
        Object.entries(groups).map(([name, stocks]) => ({
          name,
          stocks: stocks as any[],
          color: colors[name] || undefined,
        })),
      );
    } catch {
      setWatchGroups([]);
    }
  }

  async function loadDashboardNewsData() {
    try {
      const d: any = await (api as any).getDashboardNews(market);
      const payload = {
        domestic: Array.isArray(d?.domestic) ? d.domestic : [],
        international: Array.isArray(d?.international) ? d.international : [],
        watchlist: Array.isArray(d?.watchlist) ? d.watchlist : [],
        focus_stocks: Array.isArray(d?.focus_stocks) ? d.focus_stocks : [],
        sources: d?.sources || {},
      };
      setDashboardNews(payload);
      setNews([
        ...payload.domestic,
        ...payload.international,
        ...payload.watchlist,
      ]);
    } catch {
      if (market !== "CN") {
        setNews([]);
        return;
      }
      try {
        const d: any = await api.getLatestNews();
        setNews(Array.isArray(d) ? d : []);
      } catch {
        setNews([]);
      }
    }
  }

  const refreshAll = async () => {
    setRefreshing(true);
    void loadWatchlistData();
    void loadDashboardNewsData();
    try {
      await Promise.allSettled([
        api
          .getMarketIndices(market)
          .then((d: any) => setIndices(Array.isArray(d) ? d : [])),
        api
          .getSimulationAccount(market)
          .then((d: any) => {
            setBalance(d.balance ?? 0);
            setTotalAssets(d.total_assets ?? 0);
            setPositions(Array.isArray(d.positions) ? d.positions : []);
          }),
        loadGainers(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setIndices([]);
    setGainers([]);
    setBoardGainers([]);
    setNews([]);
    setDashboardNews({ domestic: [], international: [], watchlist: [] });
    refreshAll();
  }, [market]);

  useEffect(() => {
    if (market !== "CN") setGainerTab("industry");
    setSelectedIndex(null);
    setSelectedIndustry(null);
    setChartStock(null);
  }, [market]);

  async function loadGainers(date?: string) {
    try {
      const [industryData, boardData] = await Promise.all([
        api.getTopGainers(date, "industry", market),
        api.getTopGainers(date, "board", market),
      ]);
      setGainers(Array.isArray(industryData) ? industryData : []);
      setBoardGainers(Array.isArray(boardData) ? boardData : []);
    } catch {}
  }

  const addGroup = async () => {
    const name = newGroup.trim();
    if (!name) return;
    try {
      await api.createWatchlistGroup({ group_name: name });
      setWatchGroups((groups) =>
        groups.some((group) => group.name === name)
          ? groups
          : [...groups, { name, stocks: [] }],
      );
      setNewGroup("");
      setMsg(`分组 "${name}" 已创建`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  function toggleGroup(name: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  async function loadChartData(
    stock: ChartStock,
    options: { showLoading?: boolean; clearOnError?: boolean; adjustmentMode?: KLineAdjustmentMode } = {},
  ) {
    if (options.showLoading) setModalLoading(true);
    try {
      const raw = await api.getStockHistory(stock.code, options.adjustmentMode || modalAdjustmentMode);
      setModalCandles(parseHistory(raw));
      setModalAdjustmentStatus({
        adjust: raw?.adjust,
        adjust_fallback: raw?.adjust_fallback,
        source: raw?.source,
      });
    } catch {
      if (options.clearOnError) setModalCandles([]);
      if (options.clearOnError) setModalAdjustmentStatus(null);
    } finally {
      if (options.showLoading) setModalLoading(false);
    }
  }

  async function loadIntradayData(
    stock: ChartStock,
    options: { showLoading?: boolean; clearOnError?: boolean } = {},
  ) {
    if (options.showLoading) setModalIntradayLoading(true);
    try {
      const raw: any = await api.getStockIntraday(stock.code);
      const points = Array.isArray(raw?.data) ? raw.data : [];
      setModalIntraday(points);
      if (points.length === 0) setChartMode("daily");
      setModalIntradayMeta({
        date: raw?.date,
        prev_close: raw?.prev_close,
        source: raw?.source,
        market: raw?.market,
      });
    } catch {
      if (options.clearOnError) {
        setModalIntraday([]);
        setModalIntradayMeta({});
      }
    } finally {
      if (options.showLoading) setModalIntradayLoading(false);
    }
  }

  async function openChart(stock: ChartStock) {
    setChartStock(stock);
    setModalCandles([]);
    setModalAdjustmentStatus(null);
    setModalIntraday([]);
    setModalIntradayMeta({});
    setModalAdjustmentMode("none");
    setChartMode("intraday");
    await Promise.allSettled([
      loadIntradayData(stock, { showLoading: true, clearOnError: true }),
      loadChartData(stock, { showLoading: true, clearOnError: true, adjustmentMode: "none" }),
    ]);
  }

  function openChartByCode(code?: string, name?: string | null) {
    const stockCode = (code || "").trim();
    if (!stockCode) return;
    void openChart({
      code: stockCode,
      name: (name || stockCode).trim() || stockCode,
    });
  }

  function handleChartKey(
    event: KeyboardEvent<HTMLElement>,
    code?: string,
    name?: string | null,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openChartByCode(code, name);
  }

  function closeModal() {
    setChartStock(null);
    setModalCandles([]);
    setModalIntraday([]);
    setModalIntradayMeta({});
  }

  function closeIndexModal() {
    setSelectedIndex(null);
    setIndexCandles([]);
    setIndexConstituents([]);
    setIndexDetailSource("");
    setIndexConstituentMode("");
  }

  function closeIndustryModal() {
    setSelectedIndustry(null);
    setIndustryCandles([]);
  }

  useEffect(() => {
    if (!selectedIndex) return;
    let cancelled = false;
    setIndexLoading(true);
    setIndexConstituentLoading(true);
    setIndexCandles([]);
    setIndexConstituents([]);
    setIndexConstituentFilter("");
    setIndexDetailSource(selectedIndex.source || "");
    setIndexConstituentMode("");

    api
      .getMarketIndexHistory(selectedIndex.code, 180)
      .then((raw: any) => {
        if (cancelled) return;
        setIndexCandles(parseHistory(raw));
        setIndexDetailSource(raw?.source || selectedIndex.source || "");
      })
      .catch(() => {
        if (!cancelled) setIndexCandles([]);
      })
      .finally(() => {
        if (!cancelled) setIndexLoading(false);
      });

    api
      .getMarketIndexConstituents(selectedIndex.code, 300)
      .then((raw: any) => {
        if (cancelled) return;
        setIndexConstituents(Array.isArray(raw?.items) ? raw.items : []);
        setIndexConstituentMode(String(raw?.constituent_mode || ""));
      })
      .catch(() => {
        if (!cancelled) setIndexConstituents([]);
      })
      .finally(() => {
        if (!cancelled) setIndexConstituentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIndex]);

  useEffect(() => {
    if (!selectedIndustry) return;
    let cancelled = false;
    setIndustryLoading(true);
    setIndustryCandles([]);
    if (
      selectedIndustry.group_type === "board" &&
      selectedIndustry.stocks.length === 0
    ) {
      api
        .getConceptConstituents(
          selectedIndustry.industry,
          selectedIndustry.code || selectedIndustry.detail_code,
        )
        .then((raw: any) => {
          if (cancelled) return;
          const items = Array.isArray(raw?.items) ? raw.items : [];
          setSelectedIndustry((current) => {
            if (
              !current ||
              current.group_type !== "board" ||
              current.industry !== selectedIndustry.industry
            ) {
              return current;
            }
            return { ...current, stocks: items };
          });
        })
        .catch(() => {});
    }
    api
      .getIndustryHistory(
        selectedIndustry.industry,
        180,
        selectedIndustry.group_type || "industry",
        market,
      )
      .then((raw: any) => {
        if (cancelled) return;
        setIndustryCandles(parseHistory(raw));
      })
      .catch(() => {
        if (!cancelled) setIndustryCandles([]);
      })
      .finally(() => {
        if (!cancelled) setIndustryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIndustry, market]);

  useEffect(() => {
    if (!chartStock && !selectedIndex && !selectedIndustry) return;
    return scheduleChartResize();
  }, [chartStock, selectedIndex, selectedIndustry]);

  useEffect(() => {
    if (!selectedIndustry || typeof ResizeObserver === "undefined") return;
    const container = document.querySelector(".dashboard-industry-chart-card");
    if (!container) return scheduleChartResize();
    let clearPendingResize = scheduleChartResize();
    const observer = new ResizeObserver(() => {
      clearPendingResize();
      clearPendingResize = scheduleChartResize();
    });
    observer.observe(container);
    return () => {
      clearPendingResize();
      observer.disconnect();
    };
  }, [selectedIndustry]);

  useEffect(() => {
    if (!chartStock) return;
    const timer = window.setInterval(() => {
      if (!isMarketTradingSession(market)) return;
      void loadChartData(chartStock);
      void loadIntradayData(chartStock);
    }, DASHBOARD_CHART_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [chartStock, market, modalAdjustmentMode]);

  useEffect(() => {
    if (!chartStock) return;
    void loadChartData(chartStock, { showLoading: true, clearOnError: true });
  }, [modalAdjustmentMode]);

  // ── Derived data ──
  const displayIndices = indices.map((idx) => ({
    name: lt(idx.name, idx.name_en || idx.name),
    name_en: idx.name_en,
    close: idx.close,
    change_pct: idx.change_pct,
    code: idx.code,
    date: idx.date,
    source: idx.source,
    market: idx.market,
    currency: idx.currency,
    primary: idx.primary,
  }));
  const primaryIndexCodes = new Set(definition.primaryIndexCodes);
  const primaryDisplayIndices = displayIndices.filter((idx) =>
    idx.primary ?? primaryIndexCodes.has(idx.code),
  );
  const secondaryDisplayIndices = displayIndices.filter(
    (idx) => !(idx.primary ?? primaryIndexCodes.has(idx.code)),
  );

  const marketPositions = positions.filter((position) =>
    isCodeInMarket(position.stock_code, market),
  );
  const marketWatchGroups = watchGroups.map((group) => ({
    ...group,
    stocks: group.stocks.filter((stock) => isCodeInMarket(stock.code, market)),
  }));
  const displayStocks = marketPositions.map((p) => ({
    name: p.stock_name,
    code: p.stock_code,
    sector: "",
    price: p.current_price,
    change: Number(p.daily_change_pct ?? 0),
    priceDate: p.price_date || "",
  }));

  const toDisplayGainers = (
    source: GainerIndustry[],
    groupType: GainerGroupType,
  ): DisplayGainerIndustry[] =>
    source.slice(0, 20).map((g, i) => ({
      ...g,
      industry: g.industry || g.name || lt("其他", "Other"),
      rank: i + 1,
      group_type: g.group_type || groupType,
      avg_change: Number(g.avg_change) || 0,
      stocks: Array.isArray(g.stocks) ? g.stocks : [],
      change: fmtPct(Number(g.avg_change) || 0),
    }));
  const displayGainers = toDisplayGainers(gainers, "industry");
  const displayBoardGainers = toDisplayGainers(boardGainers, "board");
  const activeGainerGroups =
    gainerTab === "industry" ? displayGainers : displayBoardGainers;
  const boardLabelZh = market === "CN" ? "概念板块" : "市场板块";
  const boardLabelEn = market === "CN" ? "Concept" : "Sector";
  const activeGainerLabelZh = gainerTab === "industry" ? "行业" : boardLabelZh;
  const activeGainerTitleZh =
    gainerTab === "industry" ? "Top 20 涨幅行业" : `Top 20 涨幅${boardLabelZh}`;
  const activeGainerTitleEn =
    gainerTab === "industry"
      ? "Top 20 Gaining Industries"
      : `Top 20 Gaining ${boardLabelEn}s`;
  const selectedIndustryStocks = selectedIndustry
    ? [...selectedIndustry.stocks].sort(
        (a, b) => (Number(b.change_pct) || 0) - (Number(a.change_pct) || 0),
      )
    : [];
  const selectedIndustryGroupType = selectedIndustry?.group_type || "industry";
  const selectedIndustryGroupLabelZh =
    selectedIndustryGroupType === "board" ? boardLabelZh : "行业";
  const selectedIndustryGroupLabelEn =
    selectedIndustryGroupType === "board" ? boardLabelEn : "Industry";
  const selectedIndexStocks = [...indexConstituents]
    .filter((item) => {
      if (!item?.code) return false;
      const q = indexConstituentFilter.trim().toLowerCase();
      if (!q) return true;
      const text = `${item.code} ${item.name || ""} ${item.industry || ""} ${item.board || ""} ${item.exchange || ""}`.toLowerCase();
      return text.includes(q);
    })
    .sort((a, b) => {
      const bc = Number.isFinite(Number(b.change_pct)) ? Number(b.change_pct) : -999;
      const ac = Number.isFinite(Number(a.change_pct)) ? Number(a.change_pct) : -999;
      const bw = Number.isFinite(Number(b.weight)) ? Number(b.weight) : -1;
      const aw = Number.isFinite(Number(a.weight)) ? Number(a.weight) : -1;
      return bc - ac || bw - aw;
    });

  const displayNews = news;
  const hasStructuredNews =
    dashboardNews.domestic.length ||
    dashboardNews.international.length ||
    dashboardNews.watchlist.length;
  const stockNewsTokens = buildStockNewsTokens(marketPositions, marketWatchGroups);
  const watchedNews = hasStructuredNews
    ? dashboardNews.watchlist
    : displayNews
        .filter((item) => newsMatchesTokens(item, stockNewsTokens))
        .slice(0, 8);
  const remainingNews = displayNews.filter(
    (item) => !newsMatchesTokens(item, stockNewsTokens),
  );
  const internationalNews = hasStructuredNews
    ? dashboardNews.international
    : remainingNews.filter(isInternationalNews).slice(0, 8);
  const domesticNews = hasStructuredNews
    ? dashboardNews.domestic
    : remainingNews.filter((item) => !isInternationalNews(item)).slice(0, 8);

  // Index card gradient helpers
  function indexGradient(pct: number) {
    return pct < 0 ? "var(--market-down-bg)" : "var(--market-up-bg)";
  }

  function compactExchange(exchange?: string) {
    const text = exchange || "";
    if (text.includes("上海")) return lt("上交所", "SSE");
    if (text.includes("深圳")) return lt("深交所", "SZSE");
    if (text.includes("北京")) return lt("北交所", "BSE");
    if (text.includes("港") || text.toUpperCase().includes("HK")) return lt("港交所", "HKEX");
    if (text.includes("美") || text.toUpperCase().includes("US")) return lt("美股", "US");
    return text || "--";
  }

  function fmtDashboardAmount(value?: number | null) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "--";
    const prefix = definition.currencySymbol;
    if (n >= 100000000) {
      return `${prefix}${(n / 100000000).toFixed(2)}${lt("亿", " × 100M")}`;
    }
    if (n >= 10000) {
      return `${prefix}${(n / 10000).toFixed(1)}${lt("万", " × 10K")}`;
    }
    return `${prefix}${Math.round(n).toLocaleString()}`;
  }

  function fmtDashboardVolume(value?: number | null) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "--";
    if (n >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
    if (n >= 10000) return `${(n / 10000).toFixed(2)}万`;
    return `${Math.round(n)}`;
  }

  function fmtDashboardNumber(value?: number | null, digits = 2, suffix = "") {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(digits)}${suffix}` : "--";
  }

  function amountDirectionText(direction?: string) {
    if (direction === "up") return lt("较昨日成交额增加", "Turnover up vs yesterday");
    if (direction === "down") return lt("较昨日成交额减少", "Turnover down vs yesterday");
    if (direction === "flat") return lt("较昨日成交额持平", "Turnover flat vs yesterday");
    return lt("等待成交额对比", "Waiting for turnover comparison");
  }

  async function renameGroup(oldName: string) {
    const nextName = editingWatchGroupName.trim();
    if (!oldName || !nextName) return;
    try {
      await api.renameWatchlistGroup({ group_name: oldName, new_group_name: nextName });
      setWatchGroups((groups) =>
        groups.map((group) =>
          group.name === oldName ? { ...group, name: nextName } : group,
        ),
      );
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        if (next.delete(oldName)) next.add(nextName);
        return next;
      });
      setEditingWatchGroup("");
      setEditingWatchGroupName("");
      setMsg(`分组已改名为 "${nextName}"`);
    } catch (e: any) {
      setMsg(e?.message || lt("分组改名失败", "Failed to rename group"));
    }
  }

  async function deleteGroup(name: string) {
    if (!window.confirm(`确认删除自选分组「${name}」？`)) return;
    try {
      await api.deleteWatchlistGroup({ group_name: name });
      setWatchGroups((groups) => groups.filter((group) => group.name !== name));
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      setMsg(`分组 "${name}" 已删除`);
    } catch (e: any) {
      setMsg(e?.message || lt("删除分组失败", "Failed to delete group"));
    }
  }

  async function updateGroupColor(name: string, color: string) {
    try {
      await api.updateWatchlistGroupColor({ group_name: name, color });
      setWatchGroups((groups) =>
        groups.map((group) => (group.name === name ? { ...group, color } : group)),
      );
    } catch (e: any) {
      setMsg(e?.message || lt("更新分组颜色失败", "Failed to update group color"));
    }
  }

  async function removeWatchStock(groupName: string, code: string) {
    try {
      await api.deleteWatchlist({ group_name: groupName, code });
      setWatchGroups((groups) =>
        groups.map((group) =>
          group.name === groupName
            ? {
                ...group,
                stocks: group.stocks.filter((stock) => stock.code !== code),
              }
            : group,
        ),
      );
      setMsg(lt("已从自选中移除", "Removed from watchlist"));
    } catch (e: any) {
      setMsg(e?.message || lt("移除自选失败", "Failed to remove from watchlist"));
    }
  }

  return (
    <div className="dashboard-page">
      {/* ── Index Cards Row ── */}
      <div className="dashboard-index-row">
        {primaryDisplayIndices.map((idx) => (
          <button
            key={idx.code}
            type="button"
            className="figma-index-card dashboard-index-card-button"
            onClick={() => setSelectedIndex(idx)}
            aria-label={lt(`查看${idx.name}走势与权重股`, `View ${idx.name} trend and constituents`)}
          >
            <div
              className="gradient-bg"
              style={{ background: indexGradient(idx.change_pct) }}
            />
            <div className="figma-index-card-content">
              <p className="dashboard-index-name">{idx.name}</p>
              <p className="dashboard-index-value">
                {idx.close?.toLocaleString("zh-CN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <div className="dashboard-index-change">
                <span
                  className={`dashboard-index-change-val ${getChangeColorClass(idx.change_pct)}`}
                >
                  {fmtPct(idx.change_pct)}
                </span>
              </div>
              <p className="dashboard-index-action">
                {lt("走势 / 权重股", "Trend / Constituents")}
              </p>
            </div>
          </button>
        ))}
        {primaryDisplayIndices.length === 0 &&
          definition.primaryIndexCodes.map((_, i) => (
            <div
              key={i}
              className="figma-index-card"
              style={{ minHeight: 120 }}
            >
              <div className="figma-index-card-content animate-pulse" />
            </div>
          ))}
      </div>

      {secondaryDisplayIndices.length > 0 && (
        <div className="dashboard-index-tools">
          <div>
            <strong>{lt("指数权重查看", "Index Weight Viewer")}</strong>
            <span>
              {lt(
                `${definition.labelZh}主要指数走势与代表成分`,
                `${definition.labelEn} index trends and representative securities`,
              )}
            </span>
          </div>
          <div className="dashboard-index-tool-actions">
            {secondaryDisplayIndices.map((idx) => (
              <button
                key={idx.code}
                type="button"
                className="dashboard-index-tool-button"
                onClick={() => setSelectedIndex(idx)}
              >
                <span>{idx.name}</span>
                <b className={getChangeColorClass(idx.change_pct)}>
                  {fmtPct(idx.change_pct)}
                </b>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs: 持仓 / 自选 ── */}
      <div className="dashboard-tabs">
        {(["positions", "watchlist"] as const).map((tab) => (
          <button
            key={tab}
            className={`dashboard-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "positions" ? lt("持仓", "Positions") : lt("自选", "Watchlist")}
          </button>
        ))}
        <button
          onClick={refreshAll}
          className="figma-btn figma-btn-sm"
          style={{ marginLeft: "auto", fontSize: 11 }}
        >
          {refreshing ? lt("刷新中...", "Refreshing...") : lt("刷新数据", "Refresh")}
        </button>
      </div>

      {/* ── Tab Content: Stock Cards Grid ── */}
      {activeTab === "positions" && (
        <div className="dashboard-stock-grid">
          {displayStocks.map((s) => (
            <div
              key={s.code}
              className="dashboard-stock-card"
              role="button"
              tabIndex={0}
              title={lt("查看K线走势", "View K-line trend")}
              onClick={() => openChartByCode(s.code, s.name)}
              onKeyDown={(event) => handleChartKey(event, s.code, s.name)}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <p className="dashboard-stock-name">{s.name}</p>
                  <p className="dashboard-stock-code">{s.code}</p>
                </div>
                {s.sector && (
                  <span className="dashboard-stock-sector">{s.sector}</span>
                )}
              </div>
              <p className="dashboard-stock-price">
                {definition.currencySymbol}
                {s.price?.toLocaleString("zh-CN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p
                className={`dashboard-stock-change ${getChangeColorClass(s.change)}`}
              >
                {fmtPct(s.change)}
              </p>
              {s.priceDate && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  {lt("行情日", "Quote Date")} {s.priceDate}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === "watchlist" && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <input
              className="figma-input"
              placeholder={lt("新建分组名...", "New group name...")}
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGroup()}
              style={{ flex: 1 }}
            />
            <button onClick={addGroup} className="figma-btn figma-btn-primary">
              {lt("+ 添加", "+ Add")}
            </button>
          </div>
          {msg && <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>{msg}</p>}

          {marketWatchGroups.length === 0 && (
            <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
              {lt("暂无自选分组", "No watchlist groups")}
            </p>
          )}

          {marketWatchGroups.map((g) => (
            <div key={g.name} style={{ marginBottom: 12, border: "1px solid var(--border-light)", borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
              {/* Group header */}
              <div
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "12px 16px", background: "var(--bg-white)", border: "none",
                  fontFamily: "var(--font-primary)",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(g.name)}
                  style={{
                    minWidth: 0,
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: g.color || "#2563eb", flexShrink: 0 }} />
                  {editingWatchGroup === g.name ? (
                    <input
                      value={editingWatchGroupName}
                      onChange={(e) => setEditingWatchGroupName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void renameGroup(g.name);
                        if (e.key === "Escape") {
                          setEditingWatchGroup("");
                          setEditingWatchGroupName("");
                        }
                      }}
                      autoFocus
                      style={{
                        minWidth: 120,
                        maxWidth: 220,
                        padding: "5px 8px",
                        border: "1px solid var(--primary)",
                        borderRadius: "var(--radius-md)",
                        fontSize: 13,
                      }}
                    />
                  ) : (
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                  )}
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{g.stocks.length} {lt("只", "stocks")}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", transform: expandedGroups.has(g.name) ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
                  <input
                    type="color"
                    value={g.color || "#2563eb"}
                    onChange={(e) => void updateGroupColor(g.name, e.target.value)}
                    title={lt("修改分组颜色", "Change group color")}
                    style={{ width: 28, height: 26, padding: 0, border: "1px solid var(--border-light)", borderRadius: 6, background: "transparent", cursor: "pointer" }}
                  />
                  {editingWatchGroup === g.name ? (
                    <button
                      type="button"
                      className="figma-btn figma-btn-sm"
                      onClick={() => void renameGroup(g.name)}
                    >
                      {lt("保存", "Save")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="figma-btn figma-btn-sm"
                      onClick={() => {
                        setEditingWatchGroup(g.name);
                        setEditingWatchGroupName(g.name);
                      }}
                    >
                      {lt("改名", "Rename")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="figma-btn figma-btn-sm"
                    onClick={() => void deleteGroup(g.name)}
                    style={{ color: "var(--danger)", borderColor: "var(--danger-bg)" }}
                  >
                    {lt("删除", "Delete")}
                  </button>
                </div>
              </div>

              {/* Stock list */}
              {expandedGroups.has(g.name) && (
                <div style={{ borderTop: "1px solid var(--border-light)" }}>
                  {g.stocks.length === 0 && (
                    <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "16px 0", fontSize: 13 }}>
                      {lt("该分组暂无股票", "No stocks in this group")}
                    </p>
                  )}
                    {g.stocks.map((s) => (
                      <div
                        key={s.code}
                        onClick={() => openChart(s)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-light)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginRight: 8 }}>{s.name}</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{s.code}</span>
                          {s.industry && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>
                              {s.industry}
                            </span>
                          )}
                          {s.board && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>
                              {s.board}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {typeof s.pe_ratio === "number" && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              PE {s.pe_ratio.toFixed(1)}
                            </span>
                          )}
                          {typeof s.market_cap === "number" && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              {s.market_cap.toFixed(1)}
                              {lt(definition.marketCapUnitZh, ` ${definition.marketCapUnitEn}`)}
                            </span>
                          )}
                          {typeof s.price === "number" && (
                            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                              {fmtMoney(s.price)}
                            </span>
                          )}
                          {typeof s.change_pct === "number" && (
                            <span className={getChangeColorClass(s.change_pct)} style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
                              {fmtPct(s.change_pct)}
                            </span>
                          )}
                          {s.date && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              {s.date}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: "var(--primary)" }}>{lt("查看走势 →", "Chart →")}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void removeWatchStock(g.name, s.code);
                            }}
                            style={{
                              padding: "3px 8px",
                              border: "1px solid var(--danger-bg)",
                              borderRadius: "var(--radius-full)",
                              background: "transparent",
                              color: "var(--danger)",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            {lt("移除", "Remove")}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedIndex && (
        <div
          className="dashboard-index-modal-backdrop"
          onClick={closeIndexModal}
        >
          <div
            className="dashboard-index-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard-index-modal-header">
              <div>
                <p>{lt("指数详情", "Index Detail")}</p>
                <h3>{selectedIndex.name}</h3>
                <span>
                  <strong>
                    {selectedIndex.close?.toLocaleString("zh-CN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                  {" · "}
                  <b className={getChangeColorClass(selectedIndex.change_pct)}>
                    {fmtPct(selectedIndex.change_pct)}
                  </b>
                  {selectedIndex.date ? ` · ${selectedIndex.date}` : ""}
                  {indexDetailSource ? ` · ${indexDetailSource}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={closeIndexModal}
                aria-label={lt("关闭指数详情", "Close index detail")}
              >
                ×
              </button>
            </div>

            <div className="dashboard-index-detail-grid">
              <section className="dashboard-index-chart-card">
                <div className="dashboard-index-panel-title">
                  <strong>{lt("指数K线走势", "Index K-line Trend")}</strong>
                  <span>{lt("支持缩放查看区间", "Zoomable time range")}</span>
                </div>
                {indexLoading ? (
                  <div className="dashboard-index-chart-state">
                    {lt("指数走势加载中...", "Loading index trend...")}
                  </div>
                ) : indexCandles.length ? (
                  <KLineChart
                    data={indexCandles}
                    title={`${selectedIndex.name} K线`}
                    height={430}
                    emptyText={lt("暂无指数K线数据", "No index trend data")}
                  />
                ) : (
                  <div className="dashboard-index-chart-state">
                    {lt("暂无指数K线数据", "No index trend data")}
                  </div>
                )}
              </section>

              <section className="dashboard-index-constituent-card">
                <div className="dashboard-index-panel-title">
                  <strong>
                    {indexConstituentMode === "market_leaders"
                      ? lt("市场代表股指标", "Market Leader Metrics")
                      : lt("成分股指标", "Constituent Metrics")}
                  </strong>
                  <span>
                    {indexConstituentMode === "market_leaders"
                      ? lt(
                          "按市值选取并按当日涨幅排序",
                          "Selected by market cap and sorted by daily change",
                        )
                      : lt("按当日涨幅从高到低排序", "Sorted by daily change")}
                  </span>
                </div>
                <input
                  className="dashboard-index-constituent-filter"
                  value={indexConstituentFilter}
                  onChange={(e) => setIndexConstituentFilter(e.target.value)}
                  placeholder={lt("筛选代码、名称、行业或板块", "Filter code, name, industry or board")}
                />
                <div className="dashboard-index-constituent-list">
                  <div className="dashboard-index-constituent-row dashboard-index-constituent-head">
                    <span>{lt("排名", "Rank")}</span>
                    <span>{lt("股票", "Stock")}</span>
                    <span>{lt("最新价", "Price")}</span>
                    <span>{lt("涨幅", "Change")}</span>
                    <span>{lt("成交额", "Amount")}</span>
                    <span>{lt("成交量", "Volume")}</span>
                    <span>{lt("换手", "Turnover")}</span>
                    <span>PE</span>
                    <span>{lt("市值", "M.Cap")}</span>
                    <span>{lt("权重", "Weight")}</span>
                  </div>
                  {indexConstituentLoading ? (
                    <div className="dashboard-index-constituent-empty">
                      {lt("权重股加载中...", "Loading constituents...")}
                    </div>
                  ) : selectedIndexStocks.length ? (
                    selectedIndexStocks.map((stock, index) => (
                      <div
                        key={`${selectedIndex.code}-${stock.code}`}
                        className="dashboard-index-constituent-row dashboard-index-constituent-clickable"
                        role="button"
                        tabIndex={0}
                        title={lt("查看该股票K线", "View stock K-line")}
                        onClick={() => openChartByCode(stock.code, stock.name)}
                        onKeyDown={(event) =>
                          handleChartKey(event, stock.code, stock.name)
                        }
                      >
                        <span className="dashboard-index-constituent-rank">
                          {index + 1}
                        </span>
                        <span className="dashboard-index-constituent-name">
                          <strong>{stock.name || "--"}</strong>
                          <small>
                            {stock.code} · {compactExchange(stock.exchange)}
                            {stock.industry ? ` · ${stock.industry}` : ""}
                          </small>
                        </span>
                        <span className="dashboard-index-constituent-price">
                          {typeof stock.price === "number"
                            ? `${definition.currencySymbol}${fmtMoney(stock.price)}`
                            : "--"}
                        </span>
                        <span
                          className={getChangeColorClass(Number(stock.change_pct) || 0)}
                        >
                          {typeof stock.change_pct === "number"
                            ? fmtPct(stock.change_pct)
                            : "--"}
                        </span>
                        <span className="dashboard-index-constituent-metric">
                          {fmtDashboardAmount(stock.amount)}
                        </span>
                        <span className="dashboard-index-constituent-metric">
                          {fmtDashboardVolume(stock.volume)}
                        </span>
                        <span className="dashboard-index-constituent-metric">
                          {fmtDashboardNumber(stock.turnover_rate, 2, "%")}
                        </span>
                        <span className="dashboard-index-constituent-metric">
                          {fmtDashboardNumber(stock.pe_ratio, 1)}
                        </span>
                        <span className="dashboard-index-constituent-metric">
                          {fmtDashboardNumber(
                            stock.market_cap,
                            1,
                            lt(definition.marketCapUnitZh, ` ${definition.marketCapUnitEn}`),
                          )}
                        </span>
                        <span className="dashboard-index-constituent-weight">
                          {typeof stock.weight === "number"
                            ? `${stock.weight.toFixed(3)}%`
                            : "--"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="dashboard-index-constituent-empty">
                      {lt("暂无权重股涨跌数据", "No constituent data")}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ── Chart Modal ── */}
      {chartStock && (
        <div
          className="dashboard-stock-chart-backdrop"
          onClick={closeModal}
        >
          <div
            className="dashboard-stock-chart-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>{chartStock.name}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{chartStock.code}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="dashboard-chart-tabs">
                  <button
                    type="button"
                    className={`dashboard-chart-tab ${chartMode === "intraday" ? "active" : ""}`}
                    onClick={() => setChartMode("intraday")}
                  >
                    {lt("分时", "Intraday")}
                  </button>
                  <button
                    type="button"
                    className={`dashboard-chart-tab ${chartMode === "daily" ? "active" : ""}`}
                    onClick={() => setChartMode("daily")}
                  >
                    {lt("日K", "Daily")}
                  </button>
                </div>
                <button onClick={closeModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}>×</button>
              </div>
            </div>
            {chartMode === "intraday" ? (
              modalIntradayLoading ? (
                <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  {lt("分时加载中...", "Loading intraday...")}
                </div>
              ) : (
                <IntradayChart
                  data={modalIntraday}
                  marketCode={modalIntradayMeta.market || detectMarketFromCode(chartStock.code)}
                  title={`${chartStock.code} ${chartStock.name} 分时`}
                  date={modalIntradayMeta.date}
                  prevClose={modalIntradayMeta.prev_close}
                  height={560}
                  emptyText={lt("暂无当天分时数据", "No intraday data")}
                />
              )
            ) : (
              modalLoading ? (
                <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  {lt("加载中...", "Loading...")}
                </div>
              ) : modalCandles.length ? (
                <KLineChart
                  data={modalCandles}
                  title={`${chartStock.code} ${chartStock.name}`}
                  height={560}
                  emptyText={lt("暂无K线数据", "No chart data")}
                  adjustmentMode={modalAdjustmentMode}
                  adjustmentStatus={modalAdjustmentStatus}
                  onAdjustmentChange={setModalAdjustmentMode}
                />
              ) : (
                <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  {lt("暂无K线数据", "No chart data")}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {selectedIndustry && (
        <div
          className="dashboard-industry-modal-backdrop"
          onClick={closeIndustryModal}
        >
          <div
            className="dashboard-industry-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard-industry-modal-header">
              <div>
                <p>
                  {lt(
                    `第 ${selectedIndustry.rank} 名${selectedIndustryGroupLabelZh}`,
                    `Rank ${selectedIndustry.rank} ${selectedIndustryGroupLabelEn}`,
                  )}
                </p>
                <h3>{selectedIndustry.industry}</h3>
                <span>
                  {lt(`${selectedIndustryGroupLabelZh}平均涨幅`, "Average change")}{" "}
                  <strong className={getChangeColorClass(selectedIndustry.avg_change)}>
                    {fmtPct(selectedIndustry.avg_change)}
                  </strong>
                  {" · "}
                  {selectedIndustryStocks.length}
                  {lt(" 只股票 · 按当日涨幅从高到低排序", " stocks · sorted by daily change")}
                </span>
              </div>
              <button
                type="button"
                onClick={closeIndustryModal}
                aria-label={lt(
                  `关闭${selectedIndustryGroupLabelZh}个股弹窗`,
                  `Close ${selectedIndustryGroupLabelEn.toLowerCase()} stocks modal`,
                )}
              >
                ×
              </button>
            </div>
            <div className="dashboard-industry-chart-card">
              <div className="dashboard-industry-chart-header">
                <strong>
                  {lt(
                    `${selectedIndustryGroupLabelZh}整体K线走势`,
                    `${selectedIndustryGroupLabelEn} K-line Trend`,
                  )}
                </strong>
                <span>
                  {lt(
                    "数据库成分股归一化等权聚合，非外部官方指数",
                    "Equal-weighted normalized constituents from database",
                  )}
                </span>
              </div>
              <KLineChart
                data={industryCandles}
                title={`${selectedIndustry.industry} ${selectedIndustryGroupLabelZh}整体K线`}
                height={430}
                initialVisibleBars={180}
                loading={industryLoading}
                emptyText={
                  industryLoading || industryCandles.length > 0
                    ? lt("正在加载K线数据...", "Loading trend data...")
                    : lt(
                        `暂无${selectedIndustryGroupLabelZh}K线数据`,
                        `No ${selectedIndustryGroupLabelEn.toLowerCase()} trend data`,
                      )
                }
              />
            </div>
            <div className="dashboard-industry-stock-list">
              <div className="dashboard-industry-stock-row dashboard-industry-stock-head">
                <span>{lt("排名", "Rank")}</span>
                <span>{lt("股票", "Stock")}</span>
                <span>{lt("当日涨幅", "Daily Change")}</span>
              </div>
              {selectedIndustryStocks.map((stock, index) => (
                <div
                  key={`${selectedIndustry.industry}-${stock.code}`}
                  className="dashboard-industry-stock-row dashboard-industry-stock-clickable"
                  role="button"
                  tabIndex={0}
                  title={lt("查看该股票K线", "View stock K-line")}
                  onClick={() => openChartByCode(stock.code, stock.name)}
                  onKeyDown={(event) =>
                    handleChartKey(event, stock.code, stock.name)
                  }
                >
                  <span className="dashboard-industry-stock-rank">{index + 1}</span>
                  <span className="dashboard-industry-stock-name">
                    <strong>{stock.name || "--"}</strong>
                    <small>{stock.code}</small>
                  </span>
                  <span className={getChangeColorClass(stock.change_pct)}>
                    {fmtPct(stock.change_pct)}
                  </span>
                </div>
              ))}
              {selectedIndustryStocks.length === 0 && (
                <div className="dashboard-industry-stock-empty">
                  {lt(
                    `暂无${selectedIndustryGroupLabelZh}个股涨幅数据`,
                    "No stock change data",
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedNews && (
        <div
          className="dashboard-news-modal-backdrop"
          onClick={() => setSelectedNews(null)}
        >
          <div
            className="dashboard-news-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard-news-modal-header">
              <div>
                <div className="dashboard-news-modal-meta">
                  {selectedNews.source && (
                    <span
                      className="dashboard-news-source-chip"
                      style={sourceChipStyle(selectedNews.source, selectedNews.category)}
                    >
                      {selectedNews.source}
                    </span>
                  )}
                  <span>{selectedNews.time}</span>
                </div>
                <h3>{selectedNews.title}</h3>
                {selectedNews.summary && <p>{selectedNews.summary}</p>}
              </div>
              <button
                type="button"
                onClick={() => setSelectedNews(null)}
                aria-label={lt("关闭资讯弹窗", "Close news modal")}
              >
                ×
              </button>
            </div>
            <div className="dashboard-news-modal-rule">
              {lt(
                "情绪标签由本系统按标题和摘要关键词本地判断，非 AI 或新闻来源方定义；命中利好词显示利好，命中利空词显示利空，均未命中则显示中性。",
                "Sentiment tags are local keyword rules, not AI or source-provided labels.",
              )}
            </div>
            {selectedNews.url ? (
              <iframe
                className="dashboard-news-frame"
                src={newsPreviewUrl(selectedNews)}
                title={selectedNews.title}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="dashboard-news-frame-empty">
                {lt("该资讯暂无原文链接", "No original link for this item")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom Row: Gainers + News ── */}
      <div className="dashboard-bottom-row">
        <div className="dashboard-gainers">
          <div className="dashboard-gainers-header">
            <h3>{lt(activeGainerTitleZh, activeGainerTitleEn)}</h3>
            <div
              className="dashboard-gainer-tabs"
              aria-label={lt("切换涨幅排行类型", "Switch gainer ranking type")}
            >
              {(["industry", "board"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`dashboard-gainer-tab ${gainerTab === type ? "active" : ""}`}
                  onClick={() => setGainerTab(type)}
                >
                  {type === "industry"
                    ? lt("行业", "Industry")
                    : lt(boardLabelZh, boardLabelEn)}
                </button>
              ))}
            </div>
          </div>
          <div className="dashboard-gainers-list">
            {activeGainerGroups.map((g) => (
              <button
                key={`${g.group_type}-${g.rank}-${g.industry}`}
                type="button"
                className="figma-industry-row dashboard-industry-button"
                onClick={() => setSelectedIndustry(g)}
                aria-label={lt(
                  `查看${g.industry}${activeGainerLabelZh}个股涨幅`,
                  `View ${g.industry} ${gainerTab === "industry" ? "industry" : "concept"} stocks`,
                )}
              >
                <div className="figma-industry-left">
                  <span className="figma-rank-num">{g.rank}</span>
                  <span className="figma-industry-name">{g.industry}</span>
                  <span className="dashboard-industry-count">
                    {g.stocks.length || g.stock_count || 0}
                    {lt("只", " stocks")}
                  </span>
                </div>
                <span className="figma-industry-change">{g.change}</span>
              </button>
            ))}
            {activeGainerGroups.length === 0 && (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--text-muted)",
                  padding: 24,
                }}
              >
                {lt(`暂无${activeGainerLabelZh}数据`, "No data")}
              </p>
            )}
          </div>
        </div>

        {/* Market News */}
        <div className="dashboard-news">
          <div className="dashboard-news-header">
            <div>
              <h3>{lt("市场资讯", "Market News")}</h3>
              <p className="dashboard-news-sentiment-note">
                {lt(
                  "情绪标签为本地关键词规则：利好/利空词命中后标记，否则为中性。",
                  "Sentiment uses local keyword rules.",
                )}
              </p>
            </div>
          </div>
          <div className="dashboard-news-grid">
            <NewsSection title="国内资讯" titleEn="Domestic News" items={domesticNews} onOpenNews={setSelectedNews} />
            <NewsSection title="国际资讯" titleEn="Global News" items={internationalNews} onOpenNews={setSelectedNews} />
            <NewsSection title="自选/持仓资讯" titleEn="Watchlist / Position News" items={watchedNews} onOpenNews={setSelectedNews} />
          </div>
        </div>
      </div>
    </div>
  );
}
