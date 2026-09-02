import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CandleTooltipRectPosition,
  CandleType,
  IndicatorSeries,
  LineType,
  TooltipShowRule,
  TooltipShowType,
  YAxisPosition,
  dispose,
  init,
  registerIndicator,
  type Chart,
  type KLineData,
} from "klinecharts";
import { useLanguage, useLangText } from "../shared/language";
import { useMarket } from "../shared/market";
import { useTheme } from "../shared/theme";

export type KLinePoint = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount?: number | null;
};

export type KLineAdjustmentMode = "none" | "qfq" | "hfq";
export type KLineAdjustmentStatus = {
  adjust?: KLineAdjustmentMode | string | null;
  adjust_fallback?: KLineAdjustmentMode | string | null;
  source?: string | null;
};

type KLineChartProps = {
  data: KLinePoint[];
  title?: string;
  height?: number | string;
  loading?: boolean;
  emptyText?: string;
  className?: string;
  style?: CSSProperties;
  initialVisibleBars?: number;
  adjustmentMode?: KLineAdjustmentMode;
  adjustmentStatus?: KLineAdjustmentStatus | null;
  onAdjustmentChange?: (mode: KLineAdjustmentMode) => void;
};

const UP_COLOR = "#ef4444";
const DOWN_COLOR = "#10b981";
const MA_COLORS = ["#2563eb", "#5ba7b5", "#9b7bd3", "#d977a4"];
const DEFAULT_INITIAL_VISIBLE_BARS = 180;
const DRAWING_GROUP = "qs-user-drawing";
const QS_VOLUME_INDICATOR = "QS_VOL";
const DRAWING_TOOLS = [
  { label: "趋势线", labelEn: "Trendline", name: "straightLine" },
  { label: "水平线", labelEn: "Horizontal", name: "horizontalStraightLine" },
  { label: "垂直线", labelEn: "Vertical", name: "verticalStraightLine" },
  { label: "价格线", labelEn: "Price Line", name: "priceLine" },
  { label: "黄金分割", labelEn: "Fibonacci", name: "fibonacciLine" },
] as const;
const ADJUSTMENT_OPTIONS: Array<{ key: KLineAdjustmentMode; label: string; labelEn: string }> = [
  { key: "none", label: "不复权", labelEn: "Raw" },
  { key: "qfq", label: "前复权", labelEn: "Forward Adj." },
  { key: "hfq", label: "后复权", labelEn: "Backward Adj." },
];
const ADJUSTMENT_LABELS: Record<KLineAdjustmentMode, { zh: string; en: string }> = {
  none: { zh: "不复权", en: "raw" },
  qfq: { zh: "前复权", en: "forward-adjusted" },
  hfq: { zh: "后复权", en: "backward-adjusted" },
};

type ChartLabels = {
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  change: string;
  volume: string;
  amount: string;
};

function toTimestamp(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(/\//g, "-")}T00:00:00+08:00`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatNumber(value?: number | null, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "--";
}

function formatSigned(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatAmount(value?: number | null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "--";
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return `${Math.round(n)}`;
}

function formatVolume(value?: number | null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "--";
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(2)}万`;
  return `${Math.round(n)}`;
}

function normalizeAmount(amount: unknown, close: unknown, volume: unknown) {
  const amountValue = Number(amount);
  if (Number.isFinite(amountValue) && amountValue > 0) return amountValue;
  const closeValue = Number(close);
  const volumeValue = Number(volume);
  if (Number.isFinite(closeValue) && closeValue > 0 && Number.isFinite(volumeValue) && volumeValue > 0) {
    return closeValue * volumeValue * 100;
  }
  return 0;
}

function normalizeVolume(volume: unknown, amount: unknown, close: unknown) {
  const volumeValue = Number(volume);
  const amountValue = Number(amount);
  const closeValue = Number(close);
  if (Number.isFinite(volumeValue) && volumeValue > 0) {
    if (Number.isFinite(amountValue) && amountValue > 0 && Number.isFinite(closeValue) && closeValue > 0) {
      const amountFromLots = closeValue * volumeValue * 100;
      const amountFromShares = closeValue * volumeValue;
      const lotsError = Math.abs(amountFromLots - amountValue) / amountValue;
      const sharesError = Math.abs(amountFromShares - amountValue) / amountValue;
      if (sharesError < lotsError && sharesError < 0.35) {
        return volumeValue / 100;
      }
    }
    return volumeValue;
  }
  if (Number.isFinite(amountValue) && amountValue > 0 && Number.isFinite(closeValue) && closeValue > 0) {
    return amountValue / closeValue / 100;
  }
  return 0;
}

function medianPositive(values: number[]) {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizeVolumeWithContext(
  volume: unknown,
  amount: unknown,
  close: unknown,
  contextHands: number[],
) {
  const normalized = normalizeVolume(volume, amount, close);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  const amountValue = Number(amount);
  if (Number.isFinite(amountValue) && amountValue > 0) return normalized;

  const baseline = medianPositive(contextHands.slice(-40));
  if (!baseline) return normalized;

  const sharesCandidate = normalized / 100;
  if (
    normalized > baseline * 30 &&
    sharesCandidate >= baseline * 0.12 &&
    sharesCandidate <= baseline * 8
  ) {
    return sharesCandidate;
  }

  const handsCandidate = normalized * 100;
  if (
    normalized < baseline / 30 &&
    handsCandidate >= baseline * 0.12 &&
    handsCandidate <= baseline * 8
  ) {
    return handsCandidate;
  }

  return normalized;
}

let qsVolumeIndicatorRegistered = false;

function ensureQsVolumeIndicator() {
  if (qsVolumeIndicatorRegistered) return;
  registerIndicator<{ volume: number }>({
    name: QS_VOLUME_INDICATOR,
    shortName: "VOL",
    series: IndicatorSeries.Volume,
    precision: 0,
    shouldFormatBigNumber: true,
    minValue: 0,
    figures: [
      {
        key: "volume",
        title: "VOL: ",
        type: "bar",
        baseValue: 0,
        styles: ({ current }) => {
          const kLineData = current.kLineData;
          if (!kLineData) return { color: "rgba(100, 116, 139, 0.5)" };
          if (Number(kLineData.close) >= Number(kLineData.open)) {
            return { color: "rgba(239, 68, 68, 0.78)" };
          }
          return { color: "rgba(16, 185, 129, 0.78)" };
        },
      },
    ],
    calc: (dataList) =>
      dataList.map((item) => ({
        volume: normalizeVolume(item.volume, item.turnover, item.close),
      })),
  });
  qsVolumeIndicatorRegistered = true;
}

function normalizePoints(data: KLinePoint[]): KLineData[] {
  const rawRows = data
    .map((item) => {
      const open = Number(item.open || 0);
      const high = Number(item.high || 0);
      const low = Number(item.low || 0);
      const close = Number(item.close || 0);
      const rawAmount = Number(item.amount || 0);
      return {
        timestamp: toTimestamp(item.date),
        open,
        high,
        low,
        close,
        rawVolume: item.volume,
        rawAmount,
        dateText: item.date,
      };
    })
    .filter(
      (item) =>
        item.timestamp &&
        item.open > 0 &&
        item.high > 0 &&
        item.low > 0 &&
        item.close > 0,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const anchorHands = rawRows
    .filter((item) => item.rawAmount > 0)
    .map((item) => normalizeVolume(item.rawVolume, item.rawAmount, item.close))
    .filter((value) => Number.isFinite(value) && value > 0);
  const recentHands: number[] = [];

  return rawRows.map((item) => {
    const volume = normalizeVolumeWithContext(
      item.rawVolume,
      item.rawAmount,
      item.close,
      recentHands.length ? recentHands : anchorHands,
    );
    if (volume > 0) recentHands.push(volume);
    return {
      timestamp: item.timestamp,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume,
      turnover: normalizeAmount(item.rawAmount, item.close, volume),
      dateText: item.dateText,
    };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildChartOptions(
  labels: ChartLabels,
  theme: "light" | "dark",
  timeZone: string,
) {
  ensureQsVolumeIndicator();
  const dark = theme === "dark";
  const chartColors = {
    grid: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(113, 110, 98, 0.2)",
    gridSubtle: dark ? "rgba(255, 255, 255, 0.07)" : "rgba(113, 110, 98, 0.12)",
    axis: dark ? "rgba(255, 255, 255, 0.18)" : "rgba(113, 110, 98, 0.28)",
    axisText: dark ? "#a9afb7" : "#6b6b63",
    tooltipBg: dark ? "rgba(17, 19, 22, 0.97)" : "rgba(255, 255, 255, 0.97)",
    tooltipBorder: dark ? "rgba(255, 255, 255, 0.16)" : "rgba(113, 110, 98, 0.24)",
    tooltipText: dark ? "#f6f5f0" : "#34342f",
    crosshair: dark ? "rgba(240, 205, 130, 0.5)" : "rgba(112, 69, 10, 0.46)",
    crosshairBg: dark ? "#34312a" : "#4a4337",
  };
  return {
    timezone: timeZone,
    layout: [
      {
        type: "candle",
        content: [
          {
            name: "MA",
            calcParams: [5, 10, 20, 60],
          },
        ],
        options: {
          gap: { top: 0.12, bottom: 0.08 },
        },
      },
      {
        type: "indicator",
        content: [QS_VOLUME_INDICATOR],
        options: {
          height: 118,
          minHeight: 90,
          gap: { top: 0.08, bottom: 0.05 },
        },
      },
    ],
    customApi: {
      formatDate: (_dateTimeFormat: Intl.DateTimeFormat, timestamp: number) => formatDate(timestamp),
      formatBigNumber: (value: string | number) => formatAmount(Number(value)),
    },
    styles: {
      grid: {
        show: true,
        horizontal: {
          show: true,
          style: LineType.Dashed,
          size: 1,
          color: chartColors.grid,
          dashedValue: [4, 4],
        },
        vertical: {
          show: true,
          style: LineType.Dashed,
          size: 1,
          color: chartColors.gridSubtle,
          dashedValue: [4, 4],
        },
      },
      candle: {
        type: CandleType.CandleSolid,
        bar: {
          upColor: UP_COLOR,
          downColor: DOWN_COLOR,
          noChangeColor: "#64748b",
          upBorderColor: UP_COLOR,
          downBorderColor: DOWN_COLOR,
          noChangeBorderColor: "#64748b",
          upWickColor: UP_COLOR,
          downWickColor: DOWN_COLOR,
          noChangeWickColor: "#64748b",
        },
        priceMark: {
          show: true,
          high: {
            show: true,
            color: UP_COLOR,
            textOffset: 6,
            textSize: 11,
            textFamily: "Inter, sans-serif",
            textWeight: "700",
          },
          low: {
            show: true,
            color: DOWN_COLOR,
            textOffset: 6,
            textSize: 11,
            textFamily: "Inter, sans-serif",
            textWeight: "700",
          },
          last: {
            show: true,
            upColor: UP_COLOR,
            downColor: DOWN_COLOR,
            noChangeColor: "#2563eb",
            line: {
              show: true,
              style: LineType.Dashed,
              size: 1,
              dashedValue: [4, 4],
            },
            text: {
              show: true,
              color: "#fff",
              size: 11,
              family: "Inter, sans-serif",
              weight: "700",
              borderStyle: LineType.Solid,
              borderDashedValue: [],
              borderSize: 0,
              borderColor: "transparent",
              borderRadius: 4,
              paddingLeft: 6,
              paddingTop: 2,
              paddingRight: 6,
              paddingBottom: 2,
            },
          },
        },
        tooltip: {
          showRule: TooltipShowRule.Always,
          showType: TooltipShowType.Rect,
          defaultValue: "--",
          rect: {
            position: CandleTooltipRectPosition.Fixed,
            offsetLeft: 8,
            offsetTop: 8,
            offsetRight: 8,
            offsetBottom: 8,
            paddingLeft: 8,
            paddingTop: 6,
            paddingRight: 8,
            paddingBottom: 6,
            color: chartColors.tooltipBg,
            borderColor: chartColors.tooltipBorder,
            borderSize: 1,
            borderRadius: 6,
          },
          text: {
            color: chartColors.tooltipText,
            size: 12,
            family: "Inter, sans-serif",
            weight: "500",
            marginLeft: 4,
            marginTop: 3,
            marginRight: 4,
            marginBottom: 3,
          },
          icons: [],
          custom: ({ prev, current }: any) => {
            const prevClose = Number(prev?.close || current.open || 0);
            const change = Number(current.close || 0) - prevClose;
            const pct = prevClose ? (change / prevClose) * 100 : 0;
            const trendColor = change >= 0 ? UP_COLOR : DOWN_COLOR;
            return [
              { title: labels.time, value: current.dateText || formatDate(current.timestamp) },
              { title: labels.open, value: { text: formatNumber(current.open), color: "#f59e0b" } },
              { title: labels.high, value: { text: formatNumber(current.high), color: UP_COLOR } },
              { title: labels.low, value: { text: formatNumber(current.low), color: DOWN_COLOR } },
              { title: labels.close, value: { text: formatNumber(current.close), color: trendColor } },
              {
                title: labels.change,
                value: {
                  text: `${formatSigned(change)} / ${formatSigned(pct)}%`,
                  color: trendColor,
                },
              },
              { title: labels.volume, value: formatVolume(current.volume) },
              { title: labels.amount, value: formatAmount(current.turnover) },
            ];
          },
        },
      },
      indicator: {
        bars: [
          {
            style: "fill",
            borderStyle: LineType.Solid,
            borderDashedValue: [],
            borderSize: 0,
            borderColor: "transparent",
            borderRadius: 0,
            upColor: "rgba(239, 68, 68, 0.72)",
            downColor: "rgba(16, 185, 129, 0.72)",
            noChangeColor: "rgba(100, 116, 139, 0.5)",
          },
        ],
        tooltip: {
          showRule: TooltipShowRule.FollowCross,
          showType: TooltipShowType.Standard,
          showName: true,
          showParams: true,
          defaultValue: "--",
          text: {
            color: chartColors.axisText,
            size: 11,
            family: "Inter, sans-serif",
            weight: "500",
            marginLeft: 4,
            marginTop: 2,
            marginRight: 4,
            marginBottom: 2,
          },
          icons: [],
          offsetLeft: 4,
          offsetTop: 4,
          offsetRight: 4,
          offsetBottom: 4,
        },
        lines: MA_COLORS.map((color) => ({
          color,
          size: 1,
          style: LineType.Solid,
          dashedValue: [],
          smooth: true,
        })),
        lastValueMark: { show: false },
      },
      xAxis: {
        show: true,
        axisLine: { show: true, size: 1, color: chartColors.axis },
        tickLine: {
          show: true,
          size: 1,
          length: 4,
          color: chartColors.axis,
        },
        tickText: {
          show: true,
          color: chartColors.axisText,
          family: "Inter, sans-serif",
          weight: "500",
          size: 11,
          marginStart: 4,
          marginEnd: 4,
        },
      },
      yAxis: {
        show: true,
        position: YAxisPosition.Right,
        inside: false,
        reverse: false,
        axisLine: { show: false, size: 1, color: chartColors.axis },
        tickLine: { show: false, size: 1, length: 0, color: "transparent" },
        tickText: {
          show: true,
          color: chartColors.axisText,
          family: "Inter, sans-serif",
          weight: "500",
          size: 11,
          marginStart: 6,
          marginEnd: 6,
        },
      },
      crosshair: {
        show: true,
        horizontal: {
          show: true,
          line: {
            show: true,
            style: LineType.Dashed,
            size: 1,
            color: chartColors.crosshair,
            dashedValue: [4, 4],
          },
          text: {
            show: true,
            color: "#fff",
            size: 11,
            family: "Inter, sans-serif",
            weight: "700",
            borderStyle: LineType.Solid,
            borderDashedValue: [],
            borderSize: 0,
            borderColor: "transparent",
            borderRadius: 4,
            backgroundColor: chartColors.crosshairBg,
            paddingLeft: 6,
            paddingTop: 2,
            paddingRight: 6,
            paddingBottom: 2,
          },
        },
        vertical: {
          show: true,
          line: {
            show: true,
            style: LineType.Dashed,
            size: 1,
            color: chartColors.crosshair,
            dashedValue: [4, 4],
          },
          text: {
            show: true,
            color: "#fff",
            size: 11,
            family: "Inter, sans-serif",
            weight: "700",
            borderStyle: LineType.Solid,
            borderDashedValue: [],
            borderSize: 0,
            borderColor: "transparent",
            borderRadius: 4,
            backgroundColor: chartColors.crosshairBg,
            paddingLeft: 6,
            paddingTop: 2,
            paddingRight: 6,
            paddingBottom: 2,
          },
        },
      },
    },
  };
}

export default function KLineChart({
  data,
  title,
  height = 420,
  loading = false,
  emptyText,
  className,
  style,
  initialVisibleBars = DEFAULT_INITIAL_VISIBLE_BARS,
  adjustmentMode = "none",
  adjustmentStatus = null,
  onAdjustmentChange,
}: KLineChartProps) {
  const { lang } = useLanguage();
  const lt = useLangText();
  const { definition } = useMarket();
  const { theme } = useTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const chartDataRef = useRef<KLineData[]>([]);
  const viewModeRef = useRef<"recent" | "full">("recent");
  const [ready, setReady] = useState(false);
  const [drawingTool, setDrawingTool] = useState("");
  const chartLabels = useMemo<ChartLabels>(
    () => ({
      time: lt("时间", "Time"),
      open: lt("开", "Open"),
      high: lt("高", "High"),
      low: lt("低", "Low"),
      close: lt("收", "Close"),
      change: lt("涨跌", "Change"),
      volume: lt("成交量", "Volume"),
      amount: lt("成交额", "Amount"),
    }),
    [lang],
  );
  const chartOptions = useMemo(
    () => buildChartOptions(chartLabels, theme, definition.timeZone),
    [chartLabels, definition.timeZone, theme],
  );
  const chartLocale = lang === "zh" ? "zh-CN" : "en-US";

  const chartData = useMemo(() => normalizePoints(data), [data]);
  const adjustmentNotice = useMemo(() => {
    const fallback = String(adjustmentStatus?.adjust_fallback || "").toLowerCase();
    if (fallback === "qfq" || fallback === "hfq") {
      const label = ADJUSTMENT_LABELS[fallback];
      return {
        tone: "warning",
        text: lt(
          `${label.zh}数据源暂不可用，当前显示不复权数据。`,
          `${label.en} source is unavailable. Showing raw data instead.`,
        ),
      };
    }
    const appliedRaw = String(adjustmentStatus?.adjust || adjustmentMode || "none").toLowerCase();
    const applied = appliedRaw === "qfq" || appliedRaw === "hfq" || appliedRaw === "none" ? appliedRaw : "none";
    const label = ADJUSTMENT_LABELS[applied];
    return {
      tone: "neutral",
      text: lt(`当前数据口径：${label.zh}`, `Current price basis: ${label.en}`),
    };
  }, [adjustmentMode, adjustmentStatus?.adjust, adjustmentStatus?.adjust_fallback, lt]);

  useEffect(() => {
    chartDataRef.current = chartData;
  }, [chartData]);

  useEffect(() => {
    viewModeRef.current = "recent";
  }, [title]);

  useEffect(() => {
    if (!hostRef.current || chartRef.current) return;
    const chart = init(hostRef.current, chartOptions as any);
    if (!chart) return;
    chartRef.current = chart;
    chart.setLocale(chartLocale);
    chart.setPriceVolumePrecision(2, 0);
    chart.setBarSpace(8);
    chart.setOffsetRightDistance(42);
    setReady(true);

    const observer = new ResizeObserver(() => {
      chart.resize();
      applyCurrentRange();
    });
    observer.observe(hostRef.current);

    return () => {
      observer.disconnect();
      dispose(chart);
      chartRef.current = null;
      setReady(false);
    };
  }, [definition.timeZone]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setLocale(chartLocale);
    chart.setStyles((chartOptions as any).styles);
  }, [chartLocale, chartOptions]);

  function fitFullRange() {
    const chart = chartRef.current;
    const host = hostRef.current;
    const currentData = chartDataRef.current;
    if (!chart || !host || !currentData.length) return;
    const width = Math.max(240, host.clientWidth || 0);
    const fittedSpace = clamp((width - 72) / Math.max(currentData.length, 1), 1, 8);
    chart.setBarSpace(fittedSpace);
    chart.setOffsetRightDistance(20);
    chart.scrollToDataIndex(Math.max(0, currentData.length - 1), 0);
  }

  function fitRecentRange() {
    const chart = chartRef.current;
    const host = hostRef.current;
    const currentData = chartDataRef.current;
    if (!chart || !host || !currentData.length) return;
    const width = Math.max(240, host.clientWidth || 0);
    const visibleBars = Math.min(
      currentData.length,
      Math.max(30, Number(initialVisibleBars) || DEFAULT_INITIAL_VISIBLE_BARS),
    );
    const fittedSpace = clamp((width - 72) / Math.max(visibleBars, 1), 3, 8);
    chart.setBarSpace(fittedSpace);
    chart.setOffsetRightDistance(42);
    chart.scrollToDataIndex(Math.max(0, currentData.length - 1), 0);
  }

  function applyCurrentRange() {
    if (viewModeRef.current === "full") {
      fitFullRange();
      return;
    }
    fitRecentRange();
  }

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!chartData.length) {
      chart.clearData();
      return;
    }
    chart.applyNewData(chartData, true, () => {
      applyCurrentRange();
      requestAnimationFrame(() => requestAnimationFrame(applyCurrentRange));
    });
  }, [chartData, initialVisibleBars]);

  function zoom(scale: number) {
    const chart = chartRef.current;
    if (!chart) return;
    const dataList = chart.getDataList();
    chart.zoomAtDataIndex(scale, Math.max(0, dataList.length - 1), 120);
  }

  function resetView() {
    const chart = chartRef.current;
    if (!chart) return;
    viewModeRef.current = "full";
    fitFullRange();
  }

  function scrollLatest() {
    const chart = chartRef.current;
    if (!chart) return;
    viewModeRef.current = "recent";
    fitRecentRange();
  }

  function startDrawing(name: string) {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      const id = chart.createOverlay({ name, groupId: DRAWING_GROUP } as any);
      setDrawingTool(id ? name : "");
    } catch {
      setDrawingTool("");
    }
  }

  function clearDrawing() {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.removeOverlay({ groupId: DRAWING_GROUP } as any);
      setDrawingTool("");
    } catch {}
  }

  function downloadImage() {
    const chart = chartRef.current;
    if (!chart) return;
    const url = chart.getConvertPictureUrl(
      true,
      "png",
      theme === "dark" ? "#111316" : "#ffffff",
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "kline"}.png`;
    link.click();
  }

  return (
    <div
      className={`qs-kline-shell${className ? ` ${className}` : ""}`}
      style={{ height, ...style }}
    >
      <div className="qs-kline-toolbar">
        <div className="qs-kline-title">
          <span>{title || lt("K线走势", "Candlestick Trend")}</span>
          <small>{lt("MA / VOL / 高低点 / 最新价", "MA / VOL / High-Low / Last Price")}</small>
        </div>
        <div className="qs-kline-actions">
          {onAdjustmentChange && (
            <div className="qs-kline-adjustment" role="group" aria-label={lt("复权方式", "Adjustment mode")}>
              {ADJUSTMENT_OPTIONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={adjustmentMode === item.key ? "active" : ""}
                  onClick={() => onAdjustmentChange(item.key)}
                  disabled={loading}
                >
                  {lt(item.label, item.labelEn)}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => zoom(0.82)} disabled={!ready || !chartData.length}>
            {lt("放大", "Zoom In")}
          </button>
          <button type="button" onClick={() => zoom(1.18)} disabled={!ready || !chartData.length}>
            {lt("缩小", "Zoom Out")}
          </button>
          <button type="button" onClick={resetView} disabled={!ready || !chartData.length}>
            {lt("全量", "Full")}
          </button>
          <button type="button" onClick={scrollLatest} disabled={!ready || !chartData.length}>
            {lt("最新", "Latest")}
          </button>
          <button type="button" onClick={downloadImage} disabled={!ready || !chartData.length}>
            {lt("保存", "Save")}
          </button>
        </div>
      </div>
      {onAdjustmentChange && (
        <div className={`qs-kline-adjustment-note ${adjustmentNotice.tone}`}>
          {adjustmentNotice.text}
        </div>
      )}
      <div className="qs-kline-drawingbar">
        {DRAWING_TOOLS.map((tool) => (
          <button
            key={tool.name}
            type="button"
            className={drawingTool === tool.name ? "active" : ""}
            onClick={() => startDrawing(tool.name)}
            disabled={!ready || !chartData.length}
          >
            {lt(tool.label, tool.labelEn)}
          </button>
        ))}
        <button type="button" onClick={clearDrawing} disabled={!ready || !chartData.length}>
          {lt("清除画线", "Clear Drawings")}
        </button>
      </div>
      <div className="qs-kline-chart-wrap">
        <div ref={hostRef} className="qs-kline-chart" />
        {(loading || !chartData.length) && (
          <div className="qs-kline-state">
            {loading
              ? lt("K线加载中...", "Loading K-line data...")
              : emptyText || lt("暂无K线数据", "No K-line data")}
          </div>
        )}
      </div>
    </div>
  );
}
