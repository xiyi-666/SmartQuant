import * as echarts from "echarts";
import {
  Activity,
  Database,
  DollarSign,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { useLanguage } from "../../shared/language";

type RevenueSummary = {
  gross_revenue_cny: number;
  paid_revenue_cny: number;
  subscription_revenue_cny: number;
  recharge_revenue_cny: number;
  estimated_ad_revenue_cny: number;
  ai_cost_usd: number;
  ai_cost_cny: number;
  net_estimated_revenue_cny: number;
  margin_ratio: number;
  subscription_order_count: number;
  recharge_order_count: number;
  period_paid_users: number;
  registered_users: number;
  new_users: number;
  active_paid_users: number;
  free_users: number;
  conversion_rate: number;
  period_conversion_rate: number;
  arppu_cny: number;
  ad_impressions: number;
  ad_clicks: number;
  ad_ctr: number;
  rewarded_ad_completions: number;
  rewarded_ad_credits: number;
  llm_request_count: number;
};

type RevenueDashboard = {
  range: { days: number; since: string };
  assumptions: {
    usd_cny: number;
    homepage_ecpm_cny: number;
    rewarded_ecpm_cny: number;
  };
  summary: RevenueSummary;
  trend: Array<{
    date: string;
    subscription_revenue_cny: number;
    recharge_revenue_cny: number;
    ad_estimated_revenue_cny: number;
    ai_cost_cny: number;
    net_estimated_revenue_cny: number;
    paid_orders: number;
    recharge_orders: number;
    ad_impressions: number;
    rewarded_ad_completions: number;
  }>;
  by_plan: Array<{
    plan_id: number;
    plan_key: string;
    plan_name: string;
    role: string;
    order_count: number;
    user_count: number;
    revenue_cny: number;
  }>;
  by_payment_provider: Array<{
    provider: string;
    subscription_orders: number;
    recharge_orders: number;
    subscription_revenue_cny: number;
    recharge_revenue_cny: number;
    total_revenue_cny: number;
  }>;
  by_ad_placement: Array<{
    placement_key: string;
    platform: string;
    impressions: number;
    clicks: number;
    completions: number;
    reward_credits: number;
    estimated_revenue_cny: number;
    ctr: number;
  }>;
  recent_payments: Array<{
    id: number;
    type: "subscription" | "credit_recharge";
    trade_no: string;
    username: string;
    label: string;
    provider: string;
    amount_cny: number;
    paid_at?: string | null;
  }>;
  options: {
    users: Array<{ id: number; username: string; role: string }>;
  };
};

type RevenueFilters = {
  days: number;
  userId?: number;
  usdCny: number;
  homepageEcpmCny: number;
  rewardedEcpmCny: number;
};

const EMPTY_SUMMARY: RevenueSummary = {
  gross_revenue_cny: 0,
  paid_revenue_cny: 0,
  subscription_revenue_cny: 0,
  recharge_revenue_cny: 0,
  estimated_ad_revenue_cny: 0,
  ai_cost_usd: 0,
  ai_cost_cny: 0,
  net_estimated_revenue_cny: 0,
  margin_ratio: 0,
  subscription_order_count: 0,
  recharge_order_count: 0,
  period_paid_users: 0,
  registered_users: 0,
  new_users: 0,
  active_paid_users: 0,
  free_users: 0,
  conversion_rate: 0,
  period_conversion_rate: 0,
  arppu_cny: 0,
  ad_impressions: 0,
  ad_clicks: 0,
  ad_ctr: 0,
  rewarded_ad_completions: 0,
  rewarded_ad_credits: 0,
  llm_request_count: 0,
};

const DEFAULT_FILTERS: RevenueFilters = {
  days: 30,
  usdCny: 7.2,
  homepageEcpmCny: 20,
  rewardedEcpmCny: 60,
};

const ROLE_LABELS_ZH: Record<string, string> = {
  admin: "系统管理员",
  normal: "免费版",
  vip: "VIP",
  svip: "SVIP",
};

const ROLE_LABELS_EN: Record<string, string> = {
  admin: "Administrator",
  normal: "Free",
  vip: "VIP",
  svip: "SVIP",
};

const AD_PLACEMENT_LABELS_ZH: Record<string, string> = {
  top_banner: "顶部 Banner",
  sponsor_1: "底部赞助商 1",
  sponsor_2: "底部赞助商 2",
  sponsor_3: "底部赞助商 3",
  sponsor_4: "底部赞助商 4",
  sponsor_5: "底部赞助商 5",
  rewarded_ad: "激励视频广告",
};

const AD_PLACEMENT_LABELS_EN: Record<string, string> = {
  top_banner: "Top Banner",
  sponsor_1: "Footer Sponsor 1",
  sponsor_2: "Footer Sponsor 2",
  sponsor_3: "Footer Sponsor 3",
  sponsor_4: "Footer Sponsor 4",
  sponsor_5: "Footer Sponsor 5",
  rewarded_ad: "Rewarded Video",
};

function providerText(provider?: string) {
  const key = String(provider || "unknown").toLowerCase();
  if (key === "epay") return "ePay";
  if (key === "stripe") return "Stripe";
  if (key === "pangle") return "穿山甲";
  if (key === "tencent_ylh") return "腾讯优量汇";
  if (key === "baidu_bqt") return "百度百青藤";
  if (key === "kuaishou") return "快手联盟";
  if (key === "direct") return "直客/自营";
  return provider || "-";
}

export default function RevenueSection() {
  const { lang } = useLanguage();
  const lt = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [dashboard, setDashboard] = useState<RevenueDashboard | null>(null);
  const [filters, setFilters] = useState<RevenueFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [themeVersion, setThemeVersion] = useState(0);
  const chartElementRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

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
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US", {
        style: "currency",
        currency: "CNY",
        maximumFractionDigits: 2,
      }),
    [lang],
  );

  const formatNumber = (value: unknown) => numberFormatter.format(Number(value || 0));
  const formatCompact = (value: unknown) => compactFormatter.format(Number(value || 0));
  const formatCny = (value: unknown) => currencyFormatter.format(Number(value || 0));
  const formatPercent = (value: unknown) => `${(Number(value || 0) * 100).toFixed(2)}%`;
  const roleLabel = (role?: string) =>
    lang === "zh"
      ? ROLE_LABELS_ZH[String(role || "normal")] || role || "-"
      : ROLE_LABELS_EN[String(role || "normal")] || role || "-";
  const placementLabel = (key?: string) =>
    lang === "zh"
      ? AD_PLACEMENT_LABELS_ZH[String(key || "")] || key || "-"
      : AD_PLACEMENT_LABELS_EN[String(key || "")] || key || "-";

  const loadDashboard = async (nextFilters: RevenueFilters = filters) => {
    setLoading(true);
    setError("");
    try {
      const result = (await api.getAdminRevenueDashboard(nextFilters)) as RevenueDashboard;
      setDashboard(result);
      setFilters({
        days: Number(result?.range?.days || nextFilters.days),
        userId: nextFilters.userId,
        usdCny: Number(result?.assumptions?.usd_cny || nextFilters.usdCny),
        homepageEcpmCny: Number(result?.assumptions?.homepage_ecpm_cny || nextFilters.homepageEcpmCny),
        rewardedEcpmCny: Number(result?.assumptions?.rewarded_ecpm_cny || nextFilters.rewardedEcpmCny),
      });
    } catch (requestError: any) {
      setError(requestError?.message || lt("收益统计加载失败", "Failed to load revenue analytics"));
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = (patch: Partial<RevenueFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    void loadDashboard(next);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    void loadDashboard(DEFAULT_FILTERS);
  };

  useEffect(() => {
    void loadDashboard(DEFAULT_FILTERS);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((value) => value + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chartElementRef.current) return;
    if (
      chartInstanceRef.current &&
      chartInstanceRef.current.getDom() !== chartElementRef.current
    ) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartElementRef.current);
    }
    const chart = chartInstanceRef.current;
    const trend = dashboard?.trend || [];
    const rootStyles = getComputedStyle(document.documentElement);
    const textMuted = rootStyles.getPropertyValue("--text-muted").trim() || "#6b7280";
    const border = rootStyles.getPropertyValue("--border-light").trim() || "#e5e7eb";
    const surface = rootStyles.getPropertyValue("--bg-white").trim() || "#ffffff";
    const textPrimary = rootStyles.getPropertyValue("--text-primary").trim() || "#111827";

    chart.setOption(
      {
        animationDuration: 420,
        backgroundColor: "transparent",
        color: ["#ef4444", "#2563eb", "#22a879", "#111827"],
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: surface,
          borderColor: border,
          textStyle: { color: textPrimary, fontSize: 12 },
          formatter: (params: any[]) => {
            if (!Array.isArray(params) || params.length === 0) return "";
            const lines = params.map((item) => `${item.marker}${item.seriesName}: <strong>${formatCny(item.value)}</strong>`);
            return `<strong>${params[0].axisValue}</strong><br/>${lines.join("<br/>")}`;
          },
        },
        legend: {
          top: 0,
          right: 0,
          itemWidth: 10,
          itemHeight: 8,
          textStyle: { color: textMuted, fontSize: 11 },
        },
        grid: { top: 48, right: 42, bottom: 34, left: 68 },
        xAxis: {
          type: "category",
          data: trend.map((item) => item.date),
          boundaryGap: true,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: border } },
          axisLabel: {
            color: textMuted,
            fontSize: 10,
            formatter: (value: string) => value.slice(5),
          },
        },
        yAxis: {
          type: "value",
          name: "CNY",
          nameTextStyle: { color: textMuted, fontSize: 10 },
          axisLabel: {
            color: textMuted,
            fontSize: 10,
            formatter: (value: number) => formatCompact(value),
          },
          splitLine: { lineStyle: { color: border, type: "dashed", opacity: 0.75 } },
        },
        series: [
          {
            name: lt("会员收入", "Subscription"),
            type: "bar",
            stack: "revenue",
            barMaxWidth: 22,
            data: trend.map((item) => item.subscription_revenue_cny || 0),
            itemStyle: { color: "#ef4444", borderRadius: [2, 2, 0, 0] },
          },
          {
            name: lt("积分充值", "Recharge"),
            type: "bar",
            stack: "revenue",
            barMaxWidth: 22,
            data: trend.map((item) => item.recharge_revenue_cny || 0),
            itemStyle: { color: "#2563eb" },
          },
          {
            name: lt("广告估算", "Ad Estimate"),
            type: "bar",
            stack: "revenue",
            barMaxWidth: 22,
            data: trend.map((item) => item.ad_estimated_revenue_cny || 0),
            itemStyle: { color: "#22a879" },
          },
          {
            name: lt("AI 成本", "AI Cost"),
            type: "line",
            smooth: 0.25,
            symbol: "circle",
            symbolSize: 7,
            data: trend.map((item) => item.ai_cost_cny || 0),
            lineStyle: { color: textPrimary, width: 2 },
            itemStyle: { color: "#111827", borderColor: surface, borderWidth: 2 },
          },
        ],
        graphic:
          trend.length === 0
            ? [
                {
                  type: "text",
                  left: "center",
                  top: "middle",
                  style: {
                    text: lt("暂无收益数据", "No revenue data"),
                    fill: textMuted,
                    fontSize: 13,
                  },
                },
              ]
            : [],
      },
      true,
    );

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(chartElementRef.current);
    return () => resizeObserver.disconnect();
  }, [dashboard, lang, themeVersion]);

  useEffect(
    () => () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    },
    [],
  );

  const summary = dashboard?.summary || EMPTY_SUMMARY;

  return (
    <div className="settings-section settings-token-cost-section revenue-section">
      <div className="settings-section-accent token-cost-accent" />
      <div className="settings-section-header token-cost-page-header">
        <div>
          <div className="token-cost-title-row">
            <DollarSign size={21} aria-hidden="true" />
            <h2>{lt("收益分析", "Revenue Analytics")}</h2>
          </div>
          <p>
            {lt(
              "按会员付费、积分充值、广告曝光估算与 AI 成本核算获客和转化表现。",
              "Track subscriptions, credit recharge, ad estimates and AI cost for acquisition and conversion analysis.",
            )}
          </p>
        </div>
      </div>

      <div className="token-cost-filter-bar">
        <label>
          <span>{lt("统计周期", "Period")}</span>
          <select
            value={filters.days}
            onChange={(event) => applyFilter({ days: Number(event.target.value) })}
          >
            {[7, 30, 90, 180, 365].map((days) => (
              <option key={days} value={days}>
                {lt(`近 ${days} 天`, `Last ${days} days`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{lt("用户", "User")}</span>
          <select
            value={filters.userId || ""}
            onChange={(event) =>
              applyFilter({
                userId: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          >
            <option value="">{lt("全部用户", "All users")}</option>
            {(dashboard?.options?.users || []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.username} · {roleLabel(user.role)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{lt("USD/CNY", "USD/CNY")}</span>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={filters.usdCny}
            onChange={(event) => setFilters((current) => ({ ...current, usdCny: Number(event.target.value || 0) }))}
            onBlur={() => void loadDashboard(filters)}
          />
        </label>
        <label>
          <span>{lt("首页 eCPM", "Homepage eCPM")}</span>
          <input
            type="number"
            min={0}
            step={1}
            value={filters.homepageEcpmCny}
            onChange={(event) => setFilters((current) => ({ ...current, homepageEcpmCny: Number(event.target.value || 0) }))}
            onBlur={() => void loadDashboard(filters)}
          />
        </label>
        <label>
          <span>{lt("激励 eCPM", "Reward eCPM")}</span>
          <input
            type="number"
            min={0}
            step={1}
            value={filters.rewardedEcpmCny}
            onChange={(event) => setFilters((current) => ({ ...current, rewardedEcpmCny: Number(event.target.value || 0) }))}
            onBlur={() => void loadDashboard(filters)}
          />
        </label>
        <div className="token-cost-filter-actions">
          <button className="figma-btn" type="button" onClick={resetFilters} disabled={loading}>
            {lt("重置", "Reset")}
          </button>
          <button
            className="figma-btn figma-btn-primary"
            type="button"
            onClick={() => void loadDashboard(filters)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "token-cost-spin" : ""} />
            {loading ? lt("统计中", "Loading") : lt("刷新", "Refresh")}
          </button>
        </div>
      </div>

      {error ? <div className="token-cost-error">{error}</div> : null}

      <div className="token-cost-metrics" aria-busy={loading}>
        <div className="token-cost-metric metric-cost">
          <span>{lt("总收益估算", "Estimated Gross")}</span>
          <strong>{formatCny(summary.gross_revenue_cny)}</strong>
          <small>{lt("含广告 eCPM 估算", "Includes eCPM estimates")}</small>
        </div>
        <div className="token-cost-metric metric-output">
          <span>{lt("实收收入", "Paid Revenue")}</span>
          <strong>{formatCny(summary.paid_revenue_cny)}</strong>
          <small>{summary.subscription_order_count + summary.recharge_order_count} {lt("笔支付", "payments")}</small>
        </div>
        <div className="token-cost-metric metric-credits">
          <span>{lt("会员收入", "Subscription Revenue")}</span>
          <strong>{formatCny(summary.subscription_revenue_cny)}</strong>
          <small>{summary.period_paid_users} {lt("名付费用户", "paying users")}</small>
        </div>
        <div className="token-cost-metric metric-input">
          <span>{lt("广告收入估算", "Ad Revenue Estimate")}</span>
          <strong>{formatCny(summary.estimated_ad_revenue_cny)}</strong>
          <small>{formatCompact(summary.ad_impressions)} PV · CTR {formatPercent(summary.ad_ctr)}</small>
        </div>
        <div className="token-cost-metric metric-cache">
          <span>{lt("AI 成本", "AI Cost")}</span>
          <strong>{formatCny(summary.ai_cost_cny)}</strong>
          <small>{formatCompact(summary.llm_request_count)} {lt("次调用", "requests")}</small>
        </div>
        <div className="token-cost-metric metric-requests">
          <span>{lt("估算毛利", "Estimated Margin")}</span>
          <strong>{formatCny(summary.net_estimated_revenue_cny)}</strong>
          <small>{formatPercent(summary.margin_ratio)}</small>
        </div>
      </div>

      <div className="token-cost-chart-panel">
        <div className="token-cost-panel-heading">
          <div>
            <strong>{lt("收入与成本趋势", "Revenue and Cost Trend")}</strong>
            <span>
              {lt(
                `转化率 ${formatPercent(summary.conversion_rate)}，新用户付费转化 ${formatPercent(summary.period_conversion_rate)}`,
                `Conversion ${formatPercent(summary.conversion_rate)}, new-user paid conversion ${formatPercent(summary.period_conversion_rate)}`,
              )}
            </span>
          </div>
          <Activity size={17} aria-hidden="true" />
        </div>
        <div ref={chartElementRef} className="token-cost-trend-chart" />
      </div>

      <div className="revenue-breakdown-grid">
        <div className="token-cost-breakdown-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("会员套餐收益", "Plan Revenue")}</strong>
              <span>{lt("按付费订单归因到套餐", "Paid orders attributed by plan")}</span>
            </div>
            <UsersRound size={17} aria-hidden="true" />
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table">
              <thead>
                <tr>
                  <th>{lt("套餐", "Plan")}</th>
                  <th>{lt("角色", "Role")}</th>
                  <th>{lt("订单", "Orders")}</th>
                  <th>{lt("用户", "Users")}</th>
                  <th>{lt("收入", "Revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.by_plan || []).map((row) => (
                  <tr key={row.plan_id || row.plan_key}>
                    <td>
                      <div className="token-cost-name-cell">
                        <strong>{row.plan_name || row.plan_key}</strong>
                        <span>{row.plan_key}</span>
                      </div>
                    </td>
                    <td>{roleLabel(row.role)}</td>
                    <td>{formatNumber(row.order_count)}</td>
                    <td>{formatNumber(row.user_count)}</td>
                    <td className="token-cost-money">{formatCny(row.revenue_cny)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.by_plan || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="token-cost-empty">
                      {lt("暂无会员付费订单", "No paid subscription orders")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="token-cost-breakdown-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("广告位表现", "Ad Placement Performance")}</strong>
              <span>{lt("首页广告按展示估算，激励广告按完成估算", "Homepage ads estimate by impressions; rewarded ads by completions")}</span>
            </div>
            <Database size={17} aria-hidden="true" />
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table">
              <thead>
                <tr>
                  <th>{lt("广告位", "Placement")}</th>
                  <th>{lt("平台", "Platform")}</th>
                  <th>{lt("展示/完成", "Views/Complete")}</th>
                  <th>{lt("点击", "Clicks")}</th>
                  <th>CTR</th>
                  <th>{lt("估算", "Estimate")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.by_ad_placement || []).map((row) => (
                  <tr key={`${row.placement_key}:${row.platform}`}>
                    <td>{placementLabel(row.placement_key)}</td>
                    <td>{providerText(row.platform)}</td>
                    <td>{formatNumber(row.impressions || row.completions)}</td>
                    <td>{formatNumber(row.clicks)}</td>
                    <td>{formatPercent(row.ctr)}</td>
                    <td className="token-cost-money">{formatCny(row.estimated_revenue_cny)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.by_ad_placement || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="token-cost-empty">
                      {lt("暂无广告事件", "No ad events")}
                    </td>
                  </tr>
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
              <strong>{lt("支付渠道", "Payment Providers")}</strong>
              <span>{lt("会员订阅与积分充值分渠道核算", "Subscription and recharge revenue by provider")}</span>
            </div>
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table">
              <thead>
                <tr>
                  <th>{lt("渠道", "Provider")}</th>
                  <th>{lt("会员订单", "Subscription")}</th>
                  <th>{lt("充值订单", "Recharge")}</th>
                  <th>{lt("会员收入", "Sub Revenue")}</th>
                  <th>{lt("充值收入", "Recharge Revenue")}</th>
                  <th>{lt("合计", "Total")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.by_payment_provider || []).map((row) => (
                  <tr key={row.provider}>
                    <td>{providerText(row.provider)}</td>
                    <td>{formatNumber(row.subscription_orders)}</td>
                    <td>{formatNumber(row.recharge_orders)}</td>
                    <td>{formatCny(row.subscription_revenue_cny)}</td>
                    <td>{formatCny(row.recharge_revenue_cny)}</td>
                    <td className="token-cost-money">{formatCny(row.total_revenue_cny)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.by_payment_provider || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="token-cost-empty">
                      {lt("暂无支付记录", "No payment records")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="token-cost-recent-panel">
          <div className="token-cost-panel-heading">
            <div>
              <strong>{lt("最近付费", "Recent Payments")}</strong>
              <span>{lt("用于排查付费转化和充值行为", "Use this to inspect paid conversion and recharge behavior")}</span>
            </div>
          </div>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table token-cost-recent-table">
              <thead>
                <tr>
                  <th>{lt("时间", "Time")}</th>
                  <th>{lt("用户", "User")}</th>
                  <th>{lt("类型", "Type")}</th>
                  <th>{lt("渠道", "Provider")}</th>
                  <th>{lt("金额", "Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.recent_payments || []).map((row) => (
                  <tr key={`${row.type}:${row.id}`}>
                    <td className="token-cost-time">
                      {row.paid_at
                        ? new Date(row.paid_at).toLocaleString(
                            lang === "zh" ? "zh-CN" : "en-US",
                            { hour12: false },
                          )
                        : "-"}
                    </td>
                    <td>{row.username || "-"}</td>
                    <td>
                      <div className="token-cost-name-cell">
                        <strong>{row.type === "subscription" ? lt("会员", "Subscription") : lt("充值", "Recharge")}</strong>
                        <span>{row.label}</span>
                      </div>
                    </td>
                    <td>{providerText(row.provider)}</td>
                    <td className="token-cost-money">{formatCny(row.amount_cny)}</td>
                  </tr>
                ))}
                {!loading && (dashboard?.recent_payments || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="token-cost-empty">
                      {lt("暂无最近付费", "No recent payments")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
