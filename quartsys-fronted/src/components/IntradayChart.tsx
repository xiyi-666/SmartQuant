import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLangText } from "../shared/language";
import { MARKET_DEFINITIONS, type MarketCode, useMarket } from "../shared/market";
import { useTheme } from "../shared/theme";

export type IntradayPoint = {
  time: string;
  price: number;
  change_pct?: number;
  volume?: number;
  amount?: number;
  cum_volume?: number;
  cum_amount?: number;
};

type NormalizedIntradayPoint = IntradayPoint & {
  timeMinutes: number;
  x: number;
  avgPrice: number;
  volume: number;
};

type IntradayChartProps = {
  data: IntradayPoint[];
  marketCode?: MarketCode;
  title?: string;
  date?: string;
  prevClose?: number | null;
  height?: number;
  emptyText?: string;
};

const UP_COLOR = "#ef4444";
const DOWN_COLOR = "#10b981";
const AVG_LINE_COLOR = "#facc15";
const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 320;
const PRICE_TOP = 16;
const PRICE_HEIGHT = 218;
const VOLUME_TOP = 258;
const VOLUME_HEIGHT = 46;
const MARKET_SESSIONS: Record<MarketCode, Array<[number, number]>> = {
  CN: [
    [9 * 60 + 30, 11 * 60 + 30],
    [13 * 60, 15 * 60],
  ],
  HK: [
    [9 * 60 + 30, 12 * 60],
    [13 * 60, 16 * 60],
  ],
  US: [[9 * 60 + 30, 16 * 60]],
};

function fmt(value?: number | null, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "--";
}

function fmtAmount(value: number | null | undefined, market: MarketCode) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "--";
  const prefix = MARKET_DEFINITIONS[market].currencySymbol;
  if (n >= 100000000) return `${prefix}${(n / 100000000).toFixed(2)}亿`;
  if (n >= 10000) return `${prefix}${(n / 10000).toFixed(1)}万`;
  return `${prefix}${Math.round(n).toLocaleString()}`;
}

function fmtVolume(value: number | null | undefined, market: MarketCode) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "--";
  const unit = market === "CN" ? "手" : "股";
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}亿${unit}`;
  if (n >= 10000) return `${(n / 10000).toFixed(2)}万${unit}`;
  return `${Math.round(n).toLocaleString()} ${unit}`;
}

function parseTimeMinutes(value: string) {
  const text = String(value || "").trim();
  const matched = /(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\s|$)/.exec(text);
  const compact = !matched ? /(?:^|\D)(\d{1,2})(\d{2})(?:\D|$)/.exec(text) : null;
  const hourText = matched?.[1] || compact?.[1];
  const minuteText = matched?.[2] || compact?.[2];
  if (!hourText || !minuteText) return null;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function isTradingMinute(minutes: number, market: MarketCode) {
  return MARKET_SESSIONS[market].some(
    ([start, end]) => minutes >= start && minutes <= end,
  );
}

function tradingSpanMinutes(market: MarketCode) {
  return MARKET_SESSIONS[market].reduce(
    (total, [start, end]) => total + end - start,
    0,
  );
}

function xForTradingMinute(minutes: number, market: MarketCode) {
  let offset = 0;
  for (const [start, end] of MARKET_SESSIONS[market]) {
    if (minutes <= end) {
      offset += Math.max(0, minutes - start);
      break;
    }
    offset += end - start;
  }
  return (offset / Math.max(tradingSpanMinutes(market), 1)) * VIEWBOX_WIDTH;
}

function formatMinute(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildTimeTicks(market: MarketCode) {
  const raw: { minute: number; x: number; label: string; major: boolean }[] = [];
  for (const [start, end] of MARKET_SESSIONS[market]) {
    for (let minute = start; minute <= end; minute += 10) {
      raw.push({
        minute,
        x: xForTradingMinute(minute, market),
        label: formatMinute(minute),
        major: minute === start || minute === end || minute % 60 === 0,
      });
    }
  }
  const seen = new Set<string>();
  return raw.filter((tick) => {
    const key = tick.x.toFixed(2);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function marketAxisLabels(market: MarketCode) {
  if (market === "HK") return ["09:30", "10:45", "12:00/13:00", "14:30", "16:00"];
  if (market === "US") return ["09:30", "11:00", "13:00", "14:30", "16:00"];
  return ["09:30", "10:30", "11:30/13:00", "14:00", "15:00"];
}

function priceGridStep(maxDeviationPct: number) {
  if (maxDeviationPct <= 10) return 1;
  if (maxDeviationPct <= 20) return 2;
  if (maxDeviationPct <= 50) return 5;
  if (maxDeviationPct <= 100) return 10;
  return Math.max(10, Math.ceil(maxDeviationPct / 10));
}

function inferAveragePrice(item: IntradayPoint, fallback: number, price: number) {
  const cumVolume = Number(item.cum_volume);
  const cumAmount = Number(item.cum_amount);
  if (Number.isFinite(cumVolume) && cumVolume > 0 && Number.isFinite(cumAmount) && cumAmount > 0) {
    const candidates = [
      cumAmount / cumVolume / 100,
      cumAmount / cumVolume,
      (cumAmount * 10000) / cumVolume / 100,
    ]
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => ({
        value,
        distance: price > 0 ? Math.abs(value - price) / price : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.distance - b.distance);

    if (candidates.length && candidates[0].distance <= 0.25) {
      return candidates[0].value;
    }
  }
  return Number.isFinite(fallback) && fallback > 0 ? fallback : price;
}

function pathFromPoints(
  points: NormalizedIntradayPoint[],
  yForPrice: (price: number) => number,
  key: "price" | "avgPrice",
) {
  return points
    .map((item, index) => {
      const y = yForPrice(Number(item[key]));
      return `${index === 0 ? "M" : "L"}${item.x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function IntradayChart({
  data,
  marketCode,
  title,
  date,
  prevClose,
  height = 320,
  emptyText = "暂无分时数据",
}: IntradayChartProps) {
  const lt = useLangText();
  const { market: selectedMarket } = useMarket();
  const market = marketCode || selectedMarket;
  const { theme } = useTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const priceLineColor = theme === "dark" ? "#f8fafc" : "#171713";
  const axisLabels = marketAxisLabels(market);
  const chart = useMemo(() => {
    let previousAverage = 0;
    const normalized = data
      .map((item) => {
        const price = Number(item.price);
        const timeMinutes = parseTimeMinutes(item.time);
        if (!Number.isFinite(price) || price <= 0 || timeMinutes == null || !isTradingMinute(timeMinutes, market)) {
          return null;
        }
        const avgPrice = inferAveragePrice(item, previousAverage, price);
        previousAverage = avgPrice;
        return {
          ...item,
          price,
          avgPrice,
          timeMinutes,
          x: xForTradingMinute(timeMinutes, market),
          volume: Math.max(0, Number(item.volume || 0)),
        };
      })
      .filter(Boolean) as NormalizedIntradayPoint[];
    normalized.sort((a, b) => a.timeMinutes - b.timeMinutes);
    let sortedAverage = 0;
    normalized.forEach((item) => {
      item.avgPrice = inferAveragePrice(item, sortedAverage, item.price);
      sortedAverage = item.avgPrice;
    });
    const points = Array.from(
      normalized.reduce((result, item) => {
        result.set(item.timeMinutes, item);
        return result;
      }, new Map<number, NormalizedIntradayPoint>()).values(),
    );
    if (!points.length) return null;
    const base = Number(prevClose) > 0 ? Number(prevClose) : points[0].price;
    const values = points.flatMap((item) => [item.price, item.avgPrice]);
    const maxDeviationPct = Math.max(
      ...values.map((price) => (base ? Math.abs(price - base) / base * 100 : 0)),
      1,
    );
    // A-shares can move 20%/30%, while HK/US moves are not bounded by 10%.
    // Keep the full price path in range and reduce grid density for wider moves.
    const rawPercentLimit = Math.max(3, maxDeviationPct + 0.25);
    const gridStep = priceGridStep(rawPercentLimit);
    const percentLimit = Math.ceil(rawPercentLimit / gridStep) * gridStep;
    const minPrice = base * (1 - percentLimit / 100);
    const maxPrice = base * (1 + percentLimit / 100);
    const maxVolume = Math.max(...points.map((item) => item.volume || 0), 1);
    const yForPrice = (price: number) =>
      PRICE_TOP + ((maxPrice - price) / Math.max(maxPrice - minPrice, 0.01)) * PRICE_HEIGHT;
    const pricePath = pathFromPoints(points, yForPrice, "price");
    const averagePath = pathFromPoints(points, yForPrice, "avgPrice");
    const gridRows = Array.from({ length: (percentLimit * 2) / gridStep + 1 }, (_, index) => {
      const pct = percentLimit - index * gridStep;
      return {
        pct,
        price: base * (1 + pct / 100),
        y: yForPrice(base * (1 + pct / 100)),
      };
    });
    const last = points[points.length - 1];
    const change = last.price - base;
    const changePct = base ? (change / base) * 100 : 0;
    return {
      points,
      base,
      maxPrice,
      minPrice,
      maxVolume,
      pricePath,
      averagePath,
      gridRows,
      timeTicks: buildTimeTicks(market),
      zeroY: yForPrice(base),
      last,
      change,
      changePct,
      lastAvgY: yForPrice(last.avgPrice),
      lastPriceY: yForPrice(last.price),
      yForPrice,
    };
  }, [data, market, prevClose]);

  if (!chart) {
    return (
      <div className="qs-intraday-shell" style={{ height }}>
        <div className="qs-intraday-empty">{emptyText}</div>
      </div>
    );
  }

  const hoveredPoint = hoveredIndex == null
    ? null
    : chart.points[Math.min(hoveredIndex, chart.points.length - 1)] || null;
  const hoveredChangePct = hoveredPoint && chart.base
    ? ((hoveredPoint.price - chart.base) / chart.base) * 100
    : 0;
  const hoveredAmount = hoveredPoint
    ? (Number(hoveredPoint.amount) > 0
      ? Number(hoveredPoint.amount)
      : hoveredPoint.price * hoveredPoint.volume * (market === "CN" ? 100 : 1))
    : 0;
  const hoveredPriceY = hoveredPoint ? chart.yForPrice(hoveredPoint.price) : 0;

  const selectNearestPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const viewX = Math.max(
      0,
      Math.min(VIEWBOX_WIDTH, ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH),
    );
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    chart.points.forEach((point, index) => {
      const distance = Math.abs(point.x - viewX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setHoveredIndex(nearestIndex);
  };

  return (
    <div className="qs-intraday-shell" style={{ height }}>
      <div className="qs-intraday-header">
        <div>
          <strong>{title || lt("分时图", "Intraday")}</strong>
          <div className="qs-intraday-subline">
            {date && <span>{date}</span>}
            <span className="qs-intraday-legend">
              <i className="price" />
              {lt("现价", "Price")}
              <i className="average" />
              {lt("均价", "Average")}
            </span>
          </div>
        </div>
        <div className="qs-intraday-last">
          <b className={chart.change >= 0 ? "text-market-up" : "text-market-down"}>
            {fmt(chart.last.price)}
          </b>
          <span className={chart.change >= 0 ? "text-market-up" : "text-market-down"}>
            {chart.change >= 0 ? "+" : ""}
            {fmt(chart.change)} / {chart.changePct >= 0 ? "+" : ""}
            {fmt(chart.changePct)}%
          </span>
          <small>{lt("成交额", "Turnover")} {fmtAmount(chart.last.cum_amount, market)}</small>
        </div>
      </div>
      <div className="qs-intraday-plot">
        <svg
          className="qs-intraday-svg"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          tabIndex={0}
          aria-label={lt("分时价格、均价、成交量与成交额图", "Intraday price, average, volume and turnover chart")}
          onPointerDown={selectNearestPoint}
          onPointerMove={selectNearestPoint}
          onPointerLeave={() => setHoveredIndex(null)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const direction = event.key === "ArrowLeft" ? -1 : 1;
            setHoveredIndex((current) => {
              const baseIndex = current == null ? chart.points.length - 1 : current;
              return Math.max(0, Math.min(chart.points.length - 1, baseIndex + direction));
            });
          }}
        >
          <defs>
            <filter id="intradayLineGlow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="0" stdDeviation="1.2" floodColor={priceLineColor} floodOpacity="0.42" />
            </filter>
          </defs>
          {chart.gridRows.map((row) => (
            <line
              key={`pct-${row.pct}`}
              x1="0"
              x2={VIEWBOX_WIDTH}
              y1={row.y}
              y2={row.y}
              className={`qs-intraday-grid${row.pct === 0 ? " zero-row" : ""}`}
            />
          ))}
          {chart.timeTicks.map((tick) => (
            <line
              key={`time-${tick.label}`}
              y1={PRICE_TOP}
              y2={VOLUME_TOP + VOLUME_HEIGHT}
              x1={tick.x}
              x2={tick.x}
              className={`qs-intraday-grid vertical${tick.major ? " major" : ""}`}
            />
          ))}
          <line
            x1="0"
            x2={VIEWBOX_WIDTH}
            y1={chart.zeroY}
            y2={chart.zeroY}
            className="qs-intraday-zero"
          />
          <path
            d={chart.pricePath}
            fill="none"
            stroke={priceLineColor}
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
            filter="url(#intradayLineGlow)"
          />
          <path
            d={chart.averagePath}
            fill="none"
            stroke={AVG_LINE_COLOR}
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={chart.last.x} cy={chart.lastPriceY} r="3.4" fill={priceLineColor} vectorEffect="non-scaling-stroke" />
          <circle cx={chart.last.x} cy={chart.lastAvgY} r="3" fill={AVG_LINE_COLOR} vectorEffect="non-scaling-stroke" />
          {chart.points.map((item, index) => {
            const barWidth = Math.max(
              1.3,
              Math.min(4.2, (VIEWBOX_WIDTH / tradingSpanMinutes(market)) * 0.58),
            );
            const barHeight = ((item.volume || 0) / chart.maxVolume) * VOLUME_HEIGHT;
            const previous = index > 0 ? chart.points[index - 1].price : chart.base;
            return (
              <rect
                key={`${item.time}-${index}`}
                x={item.x - barWidth / 2}
                y={VOLUME_TOP + VOLUME_HEIGHT - barHeight}
                width={barWidth}
                height={Math.max(1, barHeight)}
                fill={item.price >= previous ? "rgba(239, 68, 68, 0.78)" : "rgba(16, 185, 129, 0.78)"}
              />
            );
          })}
          {hoveredPoint && (
            <g className="qs-intraday-crosshair" pointerEvents="none">
              <line
                x1={hoveredPoint.x}
                x2={hoveredPoint.x}
                y1={PRICE_TOP}
                y2={VOLUME_TOP + VOLUME_HEIGHT}
                className="vertical"
              />
              <line
                x1="0"
                x2={VIEWBOX_WIDTH}
                y1={hoveredPriceY}
                y2={hoveredPriceY}
                className="horizontal"
              />
              <circle cx={hoveredPoint.x} cy={hoveredPriceY} r="4.2" className="price-dot" />
              <circle
                cx={hoveredPoint.x}
                cy={chart.yForPrice(hoveredPoint.avgPrice)}
                r="3.6"
                className="average-dot"
              />
            </g>
          )}
        </svg>
        {hoveredPoint && (
          <div
            className={`qs-intraday-tooltip${hoveredPoint.x > VIEWBOX_WIDTH * 0.62 ? " align-left" : ""}`}
            style={{ left: `${(hoveredPoint.x / VIEWBOX_WIDTH) * 100}%` }}
            role="status"
          >
            <strong>{hoveredPoint.time}</strong>
            <div>
              <span>{lt("价格", "Price")}</span>
              <b className={hoveredChangePct >= 0 ? "text-market-up" : "text-market-down"}>
                {MARKET_DEFINITIONS[market].currencySymbol}{fmt(hoveredPoint.price)}
                <small>{hoveredChangePct >= 0 ? "+" : ""}{fmt(hoveredChangePct)}%</small>
              </b>
            </div>
            <div><span>{lt("均价", "Average")}</span><b>{fmt(hoveredPoint.avgPrice)}</b></div>
            <div><span>{lt("分钟成交量", "Minute volume")}</span><b>{fmtVolume(hoveredPoint.volume, market)}</b></div>
            <div><span>{lt("分钟成交额", "Minute turnover")}</span><b>{fmtAmount(hoveredAmount, market)}</b></div>
            <div><span>{lt("累计成交量", "Cumulative volume")}</span><b>{fmtVolume(hoveredPoint.cum_volume, market)}</b></div>
            <div><span>{lt("累计成交额", "Cumulative turnover")}</span><b>{fmtAmount(hoveredPoint.cum_amount, market)}</b></div>
          </div>
        )}
        <div className="qs-intraday-scale left">
          {chart.gridRows
            .filter((row, index) =>
              row.pct === 0 || index === 0 || index === chart.gridRows.length - 1 || index % 2 === 0,
            )
            .map((row) => (
              <span key={`price-${row.pct}`} style={{ top: `${(row.y / VIEWBOX_HEIGHT) * 100}%` }}>
                {fmt(row.price)}
              </span>
            ))}
        </div>
        <div className="qs-intraday-scale right">
          {chart.gridRows.map((row) => (
            <span key={`percent-${row.pct}`} className={row.pct > 0 ? "up" : row.pct < 0 ? "down" : ""} style={{ top: `${(row.y / VIEWBOX_HEIGHT) * 100}%` }}>
              {row.pct > 0 ? "+" : ""}
              {row.pct}%
            </span>
          ))}
        </div>
      </div>
      <div className="qs-intraday-axis">
        {axisLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
    </div>
  );
}
