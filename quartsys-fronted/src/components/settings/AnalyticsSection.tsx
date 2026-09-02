import * as echarts from "echarts";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Gauge,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { useLanguage } from "../../shared/language";

type AnalyticsSummary = {
  today_pv: number;
  today_uv: number;
  today_dau: number;
  today_new_users: number;
  avg_visit_seconds: number;
  bounce_rate: number;
  api_error_rate: number;
  api_avg_duration_ms: number;
  api_request_count: number;
  api_error_count: number;
};

type TrendRow = {
  date: string;
  pv: number;
  uv: number;
  dau: number;
  new_users: number;
  avg_visit_seconds: number;
};

type RankRow = {
  path: string;
  title?: string;
  views: number;
  visitors: number;
  avg_duration_seconds: number;
  exit_rate: number;
  bounce_rate: number;
};

type FeatureRow = {
  module_key: string;
  module_label: string;
  action: string;
  count: number;
  visitors: number;
  success_rate: number;
  avg_duration_ms: number;
};

type FunnelRow = {
  key: string;
  label: string;
  count: number;
  conversion_rate: number;
  overall_rate: number;
};

type DistributionRow = {
  device_type?: string;
  source_type?: string;
  browser?: string;
  os?: string;
  views: number;
  visitors: number;
  ratio: number;
};

type ApiTopRow = {
  method: string;
  path: string;
  count: number;
  avg_duration_ms: number;
  max_duration_ms?: number;
  error_count?: number;
  error_rate?: number;
  status_code?: number;
};

type AnalyticsDashboard = {
  range: { days: number; since: string };
  summary: AnalyticsSummary;
  traffic_trend: TrendRow[];
  page_rank: RankRow[];
  feature_rank: FeatureRow[];
  funnel: FunnelRow[];
  device_distribution: DistributionRow[];
  source_distribution: DistributionRow[];
  browser_distribution: DistributionRow[];
  os_distribution: DistributionRow[];
  api_slow_top: ApiTopRow[];
  api_error_top: ApiTopRow[];
  module_heatmap: Array<{ date: string; module_key: string; module_label: string; count: number }>;
  high_frequency_users: Array<{ user_id: number; username: string; role: string; page_views: number; sessions: number; last_seen_at?: string | null }>;
  silent_users: Array<{ user_id: number; username: string; role: string; last_seen_at?: string | null; created_at?: string | null }>;
};

const EMPTY_SUMMARY: AnalyticsSummary = {
  today_pv: 0,
  today_uv: 0,
  today_dau: 0,
  today_new_users: 0,
  avg_visit_seconds: 0,
  bounce_rate: 0,
  api_error_rate: 0,
  api_avg_duration_ms: 0,
  api_request_count: 0,
  api_error_count: 0,
};

const DEFAULT_FILTERS = { days: 30 };

const DEVICE_LABELS_ZH: Record<string, string> = { pc: "PC", mobile: "手机", pad: "Pad", unknown: "未知" };
const DEVICE_LABELS_EN: Record<string, string> = { pc: "PC", mobile: "Mobile", pad: "Pad", unknown: "Unknown" };
const SOURCE_LABELS_ZH: Record<string, string> = {
  direct: "直接访问",
  search: "搜索引擎",
  external: "外部链接",
  promotion: "推广链接",
  internal: "站内跳转",
  unknown: "未知",
};
const SOURCE_LABELS_EN: Record<string, string> = {
  direct: "Direct",
  search: "Search",
  external: "External",
  promotion: "Campaign",
  internal: "Internal",
  unknown: "Unknown",
};

function roleLabel(role: string, lang: "zh" | "en") {
  const labels =
    lang === "zh"
      ? { normal: "免费版", user: "免费版", vip: "VIP", svip: "SVIP", admin: "系统管理员" }
      : { normal: "Standard", user: "Standard", vip: "VIP", svip: "SVIP", admin: "Admin" };
  return labels[String(role || "normal") as keyof typeof labels] || role || "-";
}

export default function AnalyticsSection() {
  const { lang } = useLanguage();
  const lt = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [themeVersion, setThemeVersion] = useState(0);
  const trafficChartRef = useRef<HTMLDivElement | null>(null);
  const funnelChartRef = useRef<HTMLDivElement | null>(null);
  const trafficInstanceRef = useRef<echarts.ECharts | null>(null);
  const funnelInstanceRef = useRef<echarts.ECharts | null>(null);

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US"),
    [lang],
  );
  const compactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
      }),
    [lang],
  );

  const formatNumber = (value: unknown) => numberFormatter.format(Number(value || 0));
  const formatCompact = (value: unknown) => compactFormatter.format(Number(value || 0));
  const formatPercent = (value: unknown) => `${(Number(value || 0) * 100).toFixed(2)}%`;
  const formatDuration = (seconds: unknown) => {
    const total = Math.max(0, Math.round(Number(seconds || 0)));
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };
  const formatMs = (value: unknown) => `${Math.round(Number(value || 0)).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}ms`;
  const dateText = (value?: string | null) =>
    value
      ? new Date(value).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { hour12: false })
      : "-";
  const deviceLabel = (key?: string) =>
    lang === "zh"
      ? DEVICE_LABELS_ZH[String(key || "unknown")] || key || "-"
      : DEVICE_LABELS_EN[String(key || "unknown")] || key || "-";
  const sourceLabel = (key?: string) =>
    lang === "zh"
      ? SOURCE_LABELS_ZH[String(key || "unknown")] || key || "-"
      : SOURCE_LABELS_EN[String(key || "unknown")] || key || "-";

  const loadDashboard = async (nextFilters = filters) => {
    setLoading(true);
    setError("");
    try {
      const result = (await api.getAdminAnalyticsDashboard(nextFilters)) as AnalyticsDashboard;
      setDashboard(result);
      setFilters({ days: Number(result?.range?.days || nextFilters.days) });
    } catch (requestError: any) {
      setError(requestError?.message || lt("网站数据统计加载失败", "Failed to load site analytics"));
    } finally {
      setLoading(false);
    }
  };

  const applyDays = (days: number) => {
    const next = { days };
    setFilters(next);
    void loadDashboard(next);
  };

  useEffect(() => {
    void loadDashboard(DEFAULT_FILTERS);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((value) => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!trafficChartRef.current) return;
    if (!trafficInstanceRef.current) {
      trafficInstanceRef.current = echarts.init(trafficChartRef.current);
    }
    const chart = trafficInstanceRef.current;
    const trend = dashboard?.traffic_trend || [];
    const rootStyles = getComputedStyle(document.documentElement);
    const textMuted = rootStyles.getPropertyValue("--text-muted").trim() || "#6b7280";
    const border = rootStyles.getPropertyValue("--border-light").trim() || "#e5e7eb";
    const surface = rootStyles.getPropertyValue("--bg-white").trim() || "#ffffff";
    const textPrimary = rootStyles.getPropertyValue("--text-primary").trim() || "#111827";
    chart.setOption(
      {
        animationDuration: 420,
        color: ["#2563eb", "#22a879", "#2563eb", "#ef4444"],
        tooltip: {
          trigger: "axis",
          backgroundColor: surface,
          borderColor: border,
          textStyle: { color: textPrimary, fontSize: 12 },
        },
        legend: {
          top: 0,
          right: 0,
          itemWidth: 10,
          itemHeight: 8,
          textStyle: { color: textMuted, fontSize: 11 },
        },
        grid: { top: 48, right: 30, bottom: 34, left: 54 },
        xAxis: {
          type: "category",
          data: trend.map((item) => item.date),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: border } },
          axisLabel: { color: textMuted, fontSize: 10, formatter: (value: string) => value.slice(5) },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: textMuted, fontSize: 10, formatter: (value: number) => formatCompact(value) },
          splitLine: { lineStyle: { color: border, type: "dashed", opacity: 0.72 } },
        },
        series: [
          { name: "PV", type: "line", smooth: 0.28, symbolSize: 6, data: trend.map((item) => item.pv || 0) },
          { name: "UV", type: "line", smooth: 0.28, symbolSize: 6, data: trend.map((item) => item.uv || 0) },
          { name: "DAU", type: "line", smooth: 0.28, symbolSize: 6, data: trend.map((item) => item.dau || 0) },
          { name: lt("新增用户", "New Users"), type: "bar", barMaxWidth: 18, data: trend.map((item) => item.new_users || 0) },
        ],
        graphic:
          trend.length === 0
            ? [{ type: "text", left: "center", top: "middle", style: { text: lt("暂无流量数据", "No traffic data"), fill: textMuted, fontSize: 13 } }]
            : [],
      },
      true,
    );
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(trafficChartRef.current);
    return () => resizeObserver.disconnect();
  }, [dashboard, lang, themeVersion]);

  useEffect(() => {
    if (!funnelChartRef.current) return;
    if (!funnelInstanceRef.current) {
      funnelInstanceRef.current = echarts.init(funnelChartRef.current);
    }
    const chart = funnelInstanceRef.current;
    const funnel = dashboard?.funnel || [];
    const rootStyles = getComputedStyle(document.documentElement);
    const textMuted = rootStyles.getPropertyValue("--text-muted").trim() || "#6b7280";
    const border = rootStyles.getPropertyValue("--border-light").trim() || "#e5e7eb";
    const surface = rootStyles.getPropertyValue("--bg-white").trim() || "#ffffff";
    const textPrimary = rootStyles.getPropertyValue("--text-primary").trim() || "#111827";
    chart.setOption(
      {
        animationDuration: 420,
        color: ["#2563eb"],
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: surface,
          borderColor: border,
          textStyle: { color: textPrimary, fontSize: 12 },
          formatter: (params: any[]) => {
            const item = params?.[0];
            if (!item) return "";
            const row = funnel[item.dataIndex];
            return `${row?.label || item.name}<br/>${lt("人数", "Users")}: <strong>${formatNumber(item.value)}</strong><br/>${lt("上一步转化", "Step conversion")}: ${formatPercent(row?.conversion_rate)}`;
          },
        },
        grid: { top: 16, right: 24, bottom: 30, left: 112 },
        xAxis: {
          type: "value",
          axisLabel: { color: textMuted, fontSize: 10, formatter: (value: number) => formatCompact(value) },
          splitLine: { lineStyle: { color: border, type: "dashed", opacity: 0.72 } },
        },
        yAxis: {
          type: "category",
          inverse: true,
          data: funnel.map((item) => item.label),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: textMuted, fontSize: 10, width: 96, overflow: "truncate" },
        },
        series: [
          {
            name: lt("转化路径", "Funnel"),
            type: "bar",
            barMaxWidth: 16,
            data: funnel.map((item) => item.count || 0),
            itemStyle: { borderRadius: [0, 4, 4, 0], color: "#2563eb" },
          },
        ],
        graphic:
          funnel.length === 0
            ? [{ type: "text", left: "center", top: "middle", style: { text: lt("暂无漏斗数据", "No funnel data"), fill: textMuted, fontSize: 13 } }]
            : [],
      },
      true,
    );
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(funnelChartRef.current);
    return () => resizeObserver.disconnect();
  }, [dashboard, lang, themeVersion]);

  useEffect(
    () => () => {
      trafficInstanceRef.current?.dispose();
      funnelInstanceRef.current?.dispose();
      trafficInstanceRef.current = null;
      funnelInstanceRef.current = null;
    },
    [],
  );

  const summary = dashboard?.summary || EMPTY_SUMMARY;
  const heatmapMax = Math.max(1, ...(dashboard?.module_heatmap || []).map((item) => item.count || 0));

  const renderDistribution = (rows: DistributionRow[], type: "device" | "source" | "browser" | "os") => (
    <div className="analytics-distribution-list">
      {rows.map((row, index) => {
        const key = row.device_type || row.source_type || row.browser || row.os || "unknown";
        const label = type === "device" ? deviceLabel(key) : type === "source" ? sourceLabel(key) : key;
        return (
          <div key={`${type}:${key}:${index}`} className="analytics-distribution-row">
            <div>
              <strong>{label}</strong>
              <span>{formatNumber(row.visitors)} UV · {formatPercent(row.ratio)}</span>
            </div>
            <div className="analytics-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(4, Math.min(100, row.ratio * 100))}%` }} />
            </div>
            <b>{formatNumber(row.views)}</b>
          </div>
        );
      })}
      {!loading && rows.length === 0 ? <div className="token-cost-empty">{lt("暂无分布数据", "No distribution data")}</div> : null}
    </div>
  );

  return (
    <div className="settings-section settings-token-cost-section analytics-section">
      <div className="settings-section-accent token-cost-accent" />
      <div className="settings-section-header token-cost-page-header">
        <div>
          <div className="token-cost-title-row">
            <BarChart3 size={21} aria-hidden="true" />
            <h2>{lt("网站数据统计", "Site Analytics")}</h2>
          </div>
          <p>
            {lt(
              "按流量、活跃、页面、功能、漏斗和接口体验分析产品使用质量。",
              "Analyze traffic, activity, pages, features, funnel and API experience.",
            )}
          </p>
        </div>
      </div>

      <div className="token-cost-filter-bar">
        <label>
          <span>{lt("统计周期", "Period")}</span>
          <select value={filters.days} onChange={(event) => applyDays(Number(event.target.value))}>
            {[7, 30, 90, 180, 365].map((days) => (
              <option key={days} value={days}>
                {lt(`近 ${days} 天`, `Last ${days} days`)}
              </option>
            ))}
          </select>
        </label>
        <div className="token-cost-filter-actions">
          <button className="figma-btn" type="button" onClick={() => applyDays(DEFAULT_FILTERS.days)} disabled={loading}>
            {lt("重置", "Reset")}
          </button>
          <button className="figma-btn figma-btn-primary" type="button" onClick={() => void loadDashboard(filters)} disabled={loading}>
            <RefreshCw size={15} className={loading ? "token-cost-spin" : ""} />
            {loading ? lt("统计中", "Loading") : lt("刷新", "Refresh")}
          </button>
        </div>
      </div>

      {error ? <div className="token-cost-error">{error}</div> : null}

      <div className="token-cost-metrics" aria-busy={loading}>
        <div className="token-cost-metric metric-output">
          <span>{lt("今日 UV", "Today UV")}</span>
          <strong>{formatNumber(summary.today_uv)}</strong>
          <small>{lt("独立访客", "Unique visitors")}</small>
        </div>
        <div className="token-cost-metric metric-requests">
          <span>{lt("今日 PV", "Today PV")}</span>
          <strong>{formatNumber(summary.today_pv)}</strong>
          <small>{lt("页面浏览量", "Page views")}</small>
        </div>
        <div className="token-cost-metric metric-credits">
          <span>{lt("今日新增用户", "New Users Today")}</span>
          <strong>{formatNumber(summary.today_new_users)}</strong>
          <small>{lt("注册用户", "Registered users")}</small>
        </div>
        <div className="token-cost-metric metric-input">
          <span>{lt("今日活跃用户", "Today DAU")}</span>
          <strong>{formatNumber(summary.today_dau)}</strong>
          <small>{lt("登录访问用户", "Logged-in active users")}</small>
        </div>
        <div className="token-cost-metric metric-cache">
          <span>{lt("平均访问时长", "Avg Visit Duration")}</span>
          <strong>{formatDuration(summary.avg_visit_seconds)}</strong>
          <small>{lt("按会话停留估算", "Session duration estimate")}</small>
        </div>
        <div className="token-cost-metric metric-cost">
          <span>{lt("跳出率", "Bounce Rate")}</span>
          <strong>{formatPercent(summary.bounce_rate)}</strong>
          <small>{lt("单页会话占比", "Single-page sessions")}</small>
        </div>
      </div>

      <div className="revenue-breakdown-grid analytics-chart-grid">
        <div className="token-cost-chart-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("UV / PV / DAU 趋势", "UV / PV / DAU Trend")}</strong>
              <span>{lt("按天统计流量、登录活跃与新增注册", "Daily traffic, logged-in activity and new registrations")}</span>
            </div>
            <Activity size={17} aria-hidden="true" />
          </div>
          <div ref={trafficChartRef} className="token-cost-trend-chart" />
        </div>
        <div className="token-cost-chart-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("用户行为漏斗", "User Funnel")}</strong>
              <span>{lt("只统计转化路径和转化率，不展示收入金额", "Path and conversion only, no revenue amount")}</span>
            </div>
            <Gauge size={17} aria-hidden="true" />
          </div>
          <div ref={funnelChartRef} className="token-cost-trend-chart" />
        </div>
      </div>

      <div className="revenue-breakdown-grid">
        <div className="token-cost-breakdown-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("页面访问排行", "Page Ranking")}</strong>
              <span>{lt("访问量、访客数、停留时长和退出表现", "Views, visitors, dwell time and exits")}</span>
            </div>
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table">
              <thead>
                <tr>
                  <th>{lt("页面", "Page")}</th>
                  <th>PV</th>
                  <th>UV</th>
                  <th>{lt("停留", "Duration")}</th>
                  <th>{lt("退出率", "Exit")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.page_rank || []).map((row) => (
                  <tr key={row.path}>
                    <td>
                      <div className="token-cost-name-cell">
                        <strong>{row.title || row.path}</strong>
                        <span>{row.path}</span>
                      </div>
                    </td>
                    <td>{formatNumber(row.views)}</td>
                    <td>{formatNumber(row.visitors)}</td>
                    <td>{formatDuration(row.avg_duration_seconds)}</td>
                    <td>{formatPercent(row.exit_rate)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.page_rank || []).length === 0 ? (
                  <tr><td colSpan={5} className="token-cost-empty">{lt("暂无页面访问数据", "No page view data")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="token-cost-breakdown-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("功能使用排行", "Feature Ranking")}</strong>
              <span>{lt("搜索、行情、选股、回测、AI研究等核心动作", "Core actions such as search, market data, screener, backtest and AI research")}</span>
            </div>
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table">
              <thead>
                <tr>
                  <th>{lt("功能", "Feature")}</th>
                  <th>{lt("动作", "Action")}</th>
                  <th>{lt("次数", "Count")}</th>
                  <th>{lt("成功率", "Success")}</th>
                  <th>{lt("耗时", "Latency")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.feature_rank || []).map((row) => (
                  <tr key={`${row.module_key}:${row.action}`}>
                    <td>
                      <div className="token-cost-name-cell">
                        <strong>{row.module_label || row.module_key}</strong>
                        <span>{row.module_key}</span>
                      </div>
                    </td>
                    <td>{row.action || "-"}</td>
                    <td>{formatNumber(row.count)}</td>
                    <td>{formatPercent(row.success_rate)}</td>
                    <td>{formatMs(row.avg_duration_ms)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.feature_rank || []).length === 0 ? (
                  <tr><td colSpan={5} className="token-cost-empty">{lt("暂无功能使用数据", "No feature usage data")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="revenue-breakdown-grid">
        <div className="token-cost-recent-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("设备与来源分布", "Device and Source Distribution")}</strong>
              <span>{lt("用于判断移动端体验和获客来源质量", "Understand device experience and acquisition sources")}</span>
            </div>
            <UsersRound size={17} aria-hidden="true" />
          </div>
          <div className="analytics-distribution-grid">
            {renderDistribution(dashboard?.device_distribution || [], "device")}
            {renderDistribution(dashboard?.source_distribution || [], "source")}
          </div>
          <div className="analytics-distribution-grid compact">
            {renderDistribution(dashboard?.browser_distribution || [], "browser")}
            {renderDistribution(dashboard?.os_distribution || [], "os")}
          </div>
        </div>

        <div className="token-cost-recent-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("模块使用热力图", "Module Usage Heatmap")}</strong>
              <span>{lt("按天和模块查看核心功能热度", "Daily heat by product module")}</span>
            </div>
          </div>
          <div className="analytics-heatmap">
            {(dashboard?.module_heatmap || []).slice(-80).map((item, index) => (
              <span
                key={`${item.date}:${item.module_key}:${index}`}
                title={`${item.date} · ${item.module_label}: ${formatNumber(item.count)}`}
                style={{ opacity: 0.28 + Math.min(0.72, (item.count || 0) / heatmapMax) }}
              >
                <b>{item.count}</b>
              </span>
            ))}
            {!loading && (dashboard?.module_heatmap || []).length === 0 ? (
              <div className="token-cost-empty">{lt("暂无模块使用数据", "No module usage data")}</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="revenue-breakdown-grid">
        <div className="token-cost-recent-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("慢接口 Top10", "Slow API Top 10")}</strong>
              <span>{lt(`错误率 ${formatPercent(summary.api_error_rate)}，平均 ${formatMs(summary.api_avg_duration_ms)}`, `Error rate ${formatPercent(summary.api_error_rate)}, avg ${formatMs(summary.api_avg_duration_ms)}`)}</span>
            </div>
            <Clock3 size={17} aria-hidden="true" />
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table">
              <thead>
                <tr>
                  <th>API</th>
                  <th>{lt("次数", "Count")}</th>
                  <th>{lt("平均耗时", "Avg")}</th>
                  <th>{lt("最慢", "Max")}</th>
                  <th>{lt("错误率", "Error")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.api_slow_top || []).map((row) => (
                  <tr key={`${row.method}:${row.path}`}>
                    <td><span className="analytics-api-method">{row.method}</span> {row.path}</td>
                    <td>{formatNumber(row.count)}</td>
                    <td>{formatMs(row.avg_duration_ms)}</td>
                    <td>{formatMs(row.max_duration_ms)}</td>
                    <td>{formatPercent(row.error_rate)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.api_slow_top || []).length === 0 ? (
                  <tr><td colSpan={5} className="token-cost-empty">{lt("暂无 API 性能数据", "No API performance data")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="token-cost-recent-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("错误接口统计", "API Error Stats")}</strong>
              <span>{formatNumber(summary.api_error_count)} / {formatNumber(summary.api_request_count)} {lt("次请求异常", "failed requests")}</span>
            </div>
            <AlertTriangle size={17} aria-hidden="true" />
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table">
              <thead>
                <tr>
                  <th>{lt("状态", "Status")}</th>
                  <th>API</th>
                  <th>{lt("次数", "Count")}</th>
                  <th>{lt("平均耗时", "Avg")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.api_error_top || []).map((row) => (
                  <tr key={`${row.status_code}:${row.method}:${row.path}`}>
                    <td>{row.status_code || "-"}</td>
                    <td><span className="analytics-api-method">{row.method}</span> {row.path}</td>
                    <td>{formatNumber(row.count)}</td>
                    <td>{formatMs(row.avg_duration_ms)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.api_error_top || []).length === 0 ? (
                  <tr><td colSpan={4} className="token-cost-empty">{lt("暂无接口错误", "No API errors")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="revenue-breakdown-grid">
        <div className="token-cost-recent-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("高频用户", "High-Frequency Users")}</strong>
              <span>{lt("按页面访问量排序，用于识别深度使用者", "Sorted by page views to identify engaged users")}</span>
            </div>
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table">
              <thead>
                <tr>
                  <th>{lt("用户", "User")}</th>
                  <th>{lt("版本", "Plan")}</th>
                  <th>PV</th>
                  <th>{lt("会话", "Sessions")}</th>
                  <th>{lt("最后访问", "Last Seen")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.high_frequency_users || []).map((row) => (
                  <tr key={row.user_id}>
                    <td>{row.username}</td>
                    <td>{roleLabel(row.role, lang)}</td>
                    <td>{formatNumber(row.page_views)}</td>
                    <td>{formatNumber(row.sessions)}</td>
                    <td className="token-cost-time">{dateText(row.last_seen_at)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.high_frequency_users || []).length === 0 ? (
                  <tr><td colSpan={5} className="token-cost-empty">{lt("暂无高频用户数据", "No high-frequency user data")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="token-cost-recent-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("沉默用户", "Silent Users")}</strong>
              <span>{lt("最近 30 天未回访或未产生访问记录", "No return visit or tracked access in the last 30 days")}</span>
            </div>
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table">
              <thead>
                <tr>
                  <th>{lt("用户", "User")}</th>
                  <th>{lt("版本", "Plan")}</th>
                  <th>{lt("最后访问", "Last Seen")}</th>
                  <th>{lt("注册时间", "Registered")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.silent_users || []).map((row) => (
                  <tr key={row.user_id}>
                    <td>{row.username}</td>
                    <td>{roleLabel(row.role, lang)}</td>
                    <td className="token-cost-time">{dateText(row.last_seen_at)}</td>
                    <td className="token-cost-time">{dateText(row.created_at)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.silent_users || []).length === 0 ? (
                  <tr><td colSpan={4} className="token-cost-empty">{lt("暂无沉默用户", "No silent users")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
