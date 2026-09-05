import * as echarts from "echarts";
import {
  Activity,
  CloudDownload,
  Coins,
  Database,
  DollarSign,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { useLanguage } from "../../shared/language";

type UsageSummary = {
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  credits_charged: number;
  input_cost_micros: number;
  output_cost_micros: number;
  cache_read_cost_micros: number;
  cache_write_cost_micros: number;
  total_cost_micros: number;
  cost_usd: number;
  cache_hit_ratio: number;
};

type UsageBreakdown = {
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  credits_charged: number;
  total_cost_micros: number;
  cost_usd: number;
  module_key?: string;
  module_label?: string;
  user_id?: number;
  username?: string;
  role?: string;
  provider?: string;
  model?: string;
};

type UsageRecord = UsageBreakdown & {
  id: number;
  created_at?: string | null;
  usage_source?: string;
  status?: string;
  latency_ms?: number;
};

type PricingRow = {
  provider: string;
  model: string;
  input_per_million: number;
  output_per_million: number;
  cache_read_per_million: number;
  cache_write_per_million: number;
  cost_multiplier: number;
  enabled: boolean;
};

type DashboardPayload = {
  range: { days: number; since: string };
  summary: UsageSummary;
  trend: Array<UsageBreakdown & { date: string }>;
  by_module: UsageBreakdown[];
  by_user: UsageBreakdown[];
  by_model: UsageBreakdown[];
  recent: UsageRecord[];
  recent_pagination?: {
    page: number;
    page_size: number;
    total: number;
    pages: number;
  };
  options: {
    users: Array<{ id: number; username: string; role: string }>;
    modules: Array<{ key: string; label: string }>;
    models: Array<{ provider: string; model: string }>;
  };
  pricing: { currency: string; models: PricingRow[] };
};

type DashboardFilters = {
  days: number;
  userId?: number;
  moduleKey: string;
  model: string;
};

type LLMConnectionConfig = {
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
  module_models?: Record<string, unknown>;
};

const EMPTY_SUMMARY: UsageSummary = {
  request_count: 0,
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  total_tokens: 0,
  credits_charged: 0,
  input_cost_micros: 0,
  output_cost_micros: 0,
  cache_read_cost_micros: 0,
  cache_write_cost_micros: 0,
  total_cost_micros: 0,
  cost_usd: 0,
  cache_hit_ratio: 0,
};

const DEFAULT_FILTERS: DashboardFilters = {
  days: 30,
  moduleKey: "",
  model: "",
};

const MODULE_LABELS_EN: Record<string, string> = {
  ai_insights: "AI Insights",
  position_advice: "Position Advice",
  factor_generation: "AI Factor Generation",
  strategy: "AI Strategy",
  risk: "Risk Assessment",
  smart_research: "Smart Research",
  agent_analysis: "AI Analysts",
  assistant: "Quant Research Assistant",
};

const ROLE_LABELS_EN: Record<string, string> = {
  admin: "Administrator",
  normal: "Free",
  vip: "Professional",
  svip: "Institutional",
};

const ROLE_LABELS_ZH: Record<string, string> = {
  admin: "系统管理员",
  normal: "免费版",
  vip: "专业版",
  svip: "机构版",
};

function normalizePricingRows(value: unknown): PricingRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    provider: String(item?.provider || "openai"),
    model: String(item?.model || ""),
    input_per_million: Number(item?.input_per_million || 0),
    output_per_million: Number(item?.output_per_million || 0),
    cache_read_per_million: Number(item?.cache_read_per_million || 0),
    cache_write_per_million: Number(item?.cache_write_per_million || 0),
    cost_multiplier: Number(item?.cost_multiplier ?? 1) || 1,
    enabled: item?.enabled !== false,
  }));
}

export default function TokenCostSection() {
  const { lang } = useLanguage();
  const lt = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"overview" | "pricing">("overview");
  const [breakdown, setBreakdown] = useState<"module" | "user" | "model">("module");
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [pricingDirty, setPricingDirty] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingMessage, setPricingMessage] = useState("");
  const [pricingMessageTone, setPricingMessageTone] = useState<"info" | "success" | "error">("info");
  const [modelImporting, setModelImporting] = useState(false);
  const [recentPage, setRecentPage] = useState(1);
  const [llmConfig, setLlmConfig] = useState<LLMConnectionConfig | null>(null);
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

  const formatNumber = (value: unknown) => numberFormatter.format(Number(value || 0));
  const formatCompact = (value: unknown) => compactFormatter.format(Number(value || 0));
  const formatUsd = (value: unknown) => {
    const amount = Number(value || 0);
    const digits = amount > 0 && amount < 0.01 ? 6 : 4;
    return `$${amount.toFixed(digits)}`;
  };
  const formatMicros = (value: unknown) => formatUsd(Number(value || 0) / 1_000_000);
  const moduleLabel = (row: { module_key?: string; module_label?: string }) =>
    lang === "zh"
      ? row.module_label || row.module_key || "-"
      : MODULE_LABELS_EN[row.module_key || ""] || row.module_key || "-";
  const roleLabel = (role?: string) =>
    lang === "zh"
      ? ROLE_LABELS_ZH[String(role || "normal")] || role || "-"
      : ROLE_LABELS_EN[String(role || "normal")] || role || "-";

  const pricingModelSuggestions = useMemo(() => {
    const result: Array<{ provider: string; model: string }> = [];
    const seen = new Set<string>();
    const add = (providerValue: unknown, modelValue: unknown) => {
      const provider = String(providerValue || "openai").trim().toLowerCase();
      const model = String(modelValue || "").trim();
      const key = `${provider}:${model}`;
      if (!model || model === "*" || seen.has(key)) return;
      seen.add(key);
      result.push({ provider, model });
    };
    (dashboard?.options?.models || []).forEach((item) => add(item.provider, item.model));
    pricingRows.forEach((item) => add(item.provider, item.model));
    return result.sort((left, right) =>
      `${left.provider}:${left.model}`.localeCompare(`${right.provider}:${right.model}`),
    );
  }, [dashboard?.options?.models, pricingRows]);

  const loadDashboard = async (
    nextFilters: DashboardFilters = filters,
    nextPage = recentPage,
  ) => {
    setLoading(true);
    setError("");
    try {
      const result = (await api.getAdminTokenCostDashboard({
        days: nextFilters.days,
        userId: nextFilters.userId,
        moduleKey: nextFilters.moduleKey,
        model: nextFilters.model,
        page: nextPage,
        pageSize: 10,
      })) as DashboardPayload;
      setDashboard(result);
      setRecentPage(Number(result?.recent_pagination?.page || nextPage || 1));
      if (!pricingDirty) {
        setPricingRows(normalizePricingRows(result?.pricing?.models));
      }
    } catch (requestError: any) {
      setError(
        requestError?.message ||
          lt("Token 成本统计加载失败", "Failed to load Token cost statistics"),
      );
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = (patch: Partial<DashboardFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setRecentPage(1);
    void loadDashboard(next, 1);
  };

  useEffect(() => {
    void loadDashboard(DEFAULT_FILTERS, 1);
    api
      .getLLMConfig()
      .then((result: any) => setLlmConfig(result || {}))
      .catch(() => setLlmConfig(null));
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
    if (view !== "overview" || !chartElementRef.current) return;
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
        color: ["#ef4444", "#2563eb", "#38bdf8", "#a78bfa", "#111827"],
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: surface,
          borderColor: border,
          textStyle: { color: textPrimary, fontSize: 12 },
          formatter: (params: any[]) => {
            if (!Array.isArray(params) || params.length === 0) return "";
            const lines = params.map((item) => {
              const value = item.seriesName === lt("模型成本", "Model Cost")
                ? formatUsd(item.value)
                : formatNumber(item.value);
              return `${item.marker}${item.seriesName}: <strong>${value}</strong>`;
            });
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
        grid: { top: 48, right: 56, bottom: 34, left: 58 },
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
        yAxis: [
          {
            type: "value",
            name: lt("Token", "Tokens"),
            nameTextStyle: { color: textMuted, fontSize: 10 },
            axisLabel: {
              color: textMuted,
              fontSize: 10,
              formatter: (value: number) => formatCompact(value),
            },
            splitLine: { lineStyle: { color: border, type: "dashed", opacity: 0.75 } },
          },
          {
            type: "value",
            name: "USD",
            nameTextStyle: { color: textMuted, fontSize: 10 },
            axisLabel: {
              color: textMuted,
              fontSize: 10,
              formatter: (value: number) => `$${value.toFixed(value < 0.01 ? 3 : 2)}`,
            },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: lt("输入", "Input"),
            type: "bar",
            stack: "tokens",
            barMaxWidth: 22,
            data: trend.map((item) => item.input_tokens || 0),
            itemStyle: { color: "#ef4444", borderRadius: [2, 2, 0, 0] },
          },
          {
            name: lt("输出", "Output"),
            type: "bar",
            stack: "tokens",
            barMaxWidth: 22,
            data: trend.map((item) => item.output_tokens || 0),
            itemStyle: { color: "#2563eb" },
          },
          {
            name: lt("缓存读取", "Cache Read"),
            type: "bar",
            stack: "tokens",
            barMaxWidth: 22,
            data: trend.map((item) => item.cache_read_tokens || 0),
            itemStyle: { color: "#38bdf8" },
          },
          {
            name: lt("缓存写入", "Cache Write"),
            type: "bar",
            stack: "tokens",
            barMaxWidth: 22,
            data: trend.map((item) => item.cache_write_tokens || 0),
            itemStyle: { color: "#a78bfa" },
          },
          {
            name: lt("模型成本", "Model Cost"),
            type: "line",
            yAxisIndex: 1,
            smooth: 0.25,
            symbol: "circle",
            symbolSize: 7,
            data: trend.map((item) => Number(item.cost_usd || 0)),
            lineStyle: { color: textPrimary, width: 2 },
            itemStyle: { color: "#ef4444", borderColor: surface, borderWidth: 2 },
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
                    text: lt("暂无 Token 调用记录", "No Token usage records"),
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
  }, [dashboard, lang, themeVersion, view]);

  useEffect(
    () => () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    },
    [],
  );

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setRecentPage(1);
    void loadDashboard(DEFAULT_FILTERS, 1);
  };

  const patchPricingRow = (index: number, patch: Partial<PricingRow>) => {
    setPricingRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
    setPricingDirty(true);
    setPricingMessage("");
    setPricingMessageTone("info");
  };

  const addPricingRow = () => {
    const existing = new Set(
      pricingRows.map((row) => `${row.provider}:${row.model}`),
    );
    const suggestion = pricingModelSuggestions.find(
      (item) => !existing.has(`${item.provider}:${item.model}`),
    );
    setPricingRows((rows) => [
      ...rows,
      {
        provider: suggestion?.provider || llmConfig?.provider || "openai",
        model: suggestion?.model || "",
        input_per_million: 0,
        output_per_million: 0,
        cache_read_per_million: 0,
        cache_write_per_million: 0,
        cost_multiplier: 1,
        enabled: true,
      },
    ]);
    setPricingDirty(true);
    setPricingMessage("");
    setPricingMessageTone("info");
  };

  const removePricingRow = (index: number) => {
    setPricingRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    setPricingDirty(true);
    setPricingMessage("");
    setPricingMessageTone("info");
  };

  const importModelsFromConfiguredEndpoint = async () => {
    setModelImporting(true);
    setPricingMessage("");
    setPricingMessageTone("info");
    try {
      const config: any = llmConfig || (await api.getLLMConfig());
      setLlmConfig(config || {});
      const result: any = await api.listLLMModels(config || {});
      const models = Array.from(
        new Set(
          (Array.isArray(result?.models) ? result.models : [])
            .map((item: unknown) => String(item || "").trim())
            .filter(Boolean),
        ),
      );
      const provider = String(config?.provider || "openai").trim().toLowerCase();
      const existing = new Set(
        pricingRows.map((row) => `${row.provider}:${row.model}`),
      );
      const additions = models
        .filter((model) => !existing.has(`${provider}:${model}`))
        .map((model) => ({
          provider,
          model,
          input_per_million: 0,
          output_per_million: 0,
          cache_read_per_million: 0,
          cache_write_per_million: 0,
          cost_multiplier: 1,
          enabled: true,
        }));

      if (additions.length > 0) {
        setPricingRows((rows) => [...rows, ...additions]);
        setPricingDirty(true);
      }
      setDashboard((current) => {
        if (!current) return current;
        const merged = [...(current.options?.models || [])];
        const keys = new Set(merged.map((item) => `${item.provider}:${item.model}`));
        models.forEach((model) => {
          const key = `${provider}:${model}`;
          if (!keys.has(key)) {
            keys.add(key);
            merged.push({ provider, model });
          }
        });
        return {
          ...current,
          options: { ...current.options, models: merged },
        };
      });
      setPricingMessageTone("success");
      setPricingMessage(
        models.length === 0
          ? lt("当前接口没有返回可用模型", "The configured endpoint returned no models")
          : lt(
              `已拉取 ${models.length} 个模型，新增 ${additions.length} 个价格项`,
              `Loaded ${models.length} models and added ${additions.length} pricing rows`,
            ),
      );
    } catch (requestError: any) {
      setPricingMessageTone("error");
      setPricingMessage(
        requestError?.message ||
          lt("接口模型拉取失败", "Failed to load models from the configured endpoint"),
      );
    } finally {
      setModelImporting(false);
    }
  };

  const savePricing = async () => {
    setSavingPricing(true);
    setPricingMessage("");
    try {
      const result: any = await api.saveAdminTokenCostPricing({
        currency: "USD",
        models: pricingRows,
      });
      setPricingRows(normalizePricingRows(result?.models));
      setPricingDirty(false);
      setPricingMessage(lt("模型价格已保存", "Model pricing saved"));
      setPricingMessageTone("success");
      await loadDashboard(filters);
    } catch (requestError: any) {
      setPricingMessageTone("error");
      setPricingMessage(
        requestError?.message || lt("模型价格保存失败", "Failed to save model pricing"),
      );
    } finally {
      setSavingPricing(false);
    }
  };

  const summary = dashboard?.summary || EMPTY_SUMMARY;
  const breakdownRows =
    breakdown === "user"
      ? dashboard?.by_user || []
      : breakdown === "model"
        ? dashboard?.by_model || []
        : dashboard?.by_module || [];
  const recentPagination = dashboard?.recent_pagination || {
    page: recentPage,
    page_size: 10,
    total: dashboard?.recent?.length || 0,
    pages: 1,
  };
  const recentTotalPages = Math.max(1, Number(recentPagination.pages || 1));
  const recentWindowStart = Math.max(
    1,
    Math.min(recentPage - 3, Math.max(1, recentTotalPages - 6)),
  );
  const recentPageNumbers = Array.from(
    { length: Math.min(7, recentTotalPages) },
    (_, index) => recentWindowStart + index,
  );

  const changeRecentPage = (page: number) => {
    const nextPage = Math.max(1, Math.min(recentTotalPages, page));
    if (nextPage === recentPage || loading) return;
    setRecentPage(nextPage);
    void loadDashboard(filters, nextPage);
  };

  const breakdownName = (row: UsageBreakdown) => {
    if (breakdown === "user") {
      return (
        <div className="token-cost-name-cell">
          <strong>{row.username || `#${row.user_id}`}</strong>
          <span>{roleLabel(row.role)}</span>
        </div>
      );
    }
    if (breakdown === "model") {
      return (
        <div className="token-cost-name-cell">
          <strong>{row.model || "-"}</strong>
          <span>{row.provider || "-"}</span>
        </div>
      );
    }
    return (
      <div className="token-cost-name-cell">
        <strong>{moduleLabel(row)}</strong>
        <span>{row.module_key || "-"}</span>
      </div>
    );
  };

  return (
    <div className="settings-section settings-token-cost-section">
      <div className="settings-section-accent token-cost-accent" />
      <div className="settings-section-header token-cost-page-header">
        <div>
          <div className="token-cost-title-row">
            <Coins size={21} aria-hidden="true" />
            <h2>{lt("Token 成本", "Token Cost")}</h2>
          </div>
          <p>
            {lt(
              "按用户、AI 模块与模型核算 Token、积分和上游调用成本。",
              "Track Tokens, credits and upstream model cost by user, AI module and model.",
            )}
          </p>
        </div>
        <div className="token-cost-view-switch" role="tablist">
          <button
            type="button"
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            <Activity size={15} />
            {lt("用量概览", "Usage")}
          </button>
          <button
            type="button"
            className={view === "pricing" ? "active" : ""}
            onClick={() => setView("pricing")}
          >
            <DollarSign size={15} />
            {lt("模型价格", "Model Pricing")}
          </button>
        </div>
      </div>

      {view === "overview" ? (
        <>
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
              <span>{lt("AI 模块", "AI Module")}</span>
              <select
                value={filters.moduleKey}
                onChange={(event) => applyFilter({ moduleKey: event.target.value })}
              >
                <option value="">{lt("全部模块", "All modules")}</option>
                {(dashboard?.options?.modules || []).map((module) => (
                  <option key={module.key} value={module.key}>
                    {lang === "zh"
                      ? module.label
                      : MODULE_LABELS_EN[module.key] || module.key}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{lt("模型", "Model")}</span>
              <select
                value={filters.model}
                onChange={(event) => applyFilter({ model: event.target.value })}
              >
                <option value="">{lt("全部模型", "All models")}</option>
                {(dashboard?.options?.models || []).map((item) => (
                  <option key={`${item.provider}:${item.model}`} value={item.model}>
                    {item.model} · {item.provider}
                  </option>
                ))}
              </select>
            </label>
            <div className="token-cost-filter-actions">
              <button
                className="figma-btn"
                type="button"
                onClick={resetFilters}
                disabled={loading}
              >
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
              <span>{lt("上游模型成本", "Upstream Cost")}</span>
              <strong>{formatUsd(summary.cost_usd)}</strong>
              <small>{lt("按调用时价格入账", "Priced at request time")}</small>
            </div>
            <div className="token-cost-metric metric-requests">
              <span>{lt("调用次数", "Requests")}</span>
              <strong>{formatCompact(summary.request_count)}</strong>
              <small>{formatNumber(summary.total_tokens)} Token</small>
            </div>
            <div className="token-cost-metric metric-credits">
              <span>{lt("消耗积分", "Credits Used")}</span>
              <strong>{formatCompact(summary.credits_charged)}</strong>
              <small>{lt("管理员调用记为 0", "Admin usage is recorded as 0")}</small>
            </div>
            <div className="token-cost-metric metric-input">
              <span>{lt("输入 Token", "Input Tokens")}</span>
              <strong>{formatCompact(summary.input_tokens)}</strong>
              <small>{formatMicros(summary.input_cost_micros)}</small>
            </div>
            <div className="token-cost-metric metric-output">
              <span>{lt("输出 Token", "Output Tokens")}</span>
              <strong>{formatCompact(summary.output_tokens)}</strong>
              <small>{formatMicros(summary.output_cost_micros)}</small>
            </div>
            <div className="token-cost-metric metric-cache">
              <span>{lt("缓存 Token", "Cache Tokens")}</span>
              <strong>
                {formatCompact(summary.cache_read_tokens + summary.cache_write_tokens)}
              </strong>
              <small>
                {lt("读", "R")} {formatCompact(summary.cache_read_tokens)} · {lt("写", "W")} {formatCompact(summary.cache_write_tokens)}
              </small>
            </div>
          </div>

          <div className="token-cost-chart-panel">
            <div className="token-cost-panel-heading">
              <div>
                <strong>{lt("Token 与成本趋势", "Token and Cost Trend")}</strong>
                <span>
                  {lt(
                    `缓存命中率 ${(summary.cache_hit_ratio * 100).toFixed(1)}%`,
                    `Cache hit rate ${(summary.cache_hit_ratio * 100).toFixed(1)}%`,
                  )}
                </span>
              </div>
              <Database size={17} aria-hidden="true" />
            </div>
            <div ref={chartElementRef} className="token-cost-trend-chart" />
          </div>

          <div className="token-cost-breakdown-panel">
            <div className="token-cost-panel-heading token-cost-breakdown-heading">
              <div>
                <strong>{lt("成本归因", "Cost Attribution")}</strong>
                <span>{lt("按统计口径查看 Token 与积分", "Inspect Tokens and credits by dimension")}</span>
              </div>
              <div className="token-cost-segmented">
                {(["module", "user", "model"] as const).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={breakdown === item ? "active" : ""}
                    onClick={() => setBreakdown(item)}
                  >
                    {item === "module"
                      ? lt("模块", "Module")
                      : item === "user"
                        ? lt("用户", "User")
                        : lt("模型", "Model")}
                  </button>
                ))}
              </div>
            </div>
            <div className="token-cost-table-scroll">
              <table className="token-cost-table">
                <thead>
                  <tr>
                    <th>{breakdown === "module" ? lt("模块", "Module") : breakdown === "user" ? lt("用户", "User") : lt("模型", "Model")}</th>
                    <th>{lt("调用", "Requests")}</th>
                    <th>{lt("输入", "Input")}</th>
                    <th>{lt("输出", "Output")}</th>
                    <th>{lt("缓存读", "Cache R")}</th>
                    <th>{lt("缓存写", "Cache W")}</th>
                    <th>{lt("积分", "Credits")}</th>
                    <th>{lt("成本", "Cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.map((row, index) => (
                    <tr key={`${breakdown}-${row.module_key || row.user_id || row.model || index}`}>
                      <td>{breakdownName(row)}</td>
                      <td>{formatNumber(row.request_count)}</td>
                      <td>{formatNumber(row.input_tokens)}</td>
                      <td>{formatNumber(row.output_tokens)}</td>
                      <td>{formatNumber(row.cache_read_tokens)}</td>
                      <td>{formatNumber(row.cache_write_tokens)}</td>
                      <td>{formatNumber(row.credits_charged)}</td>
                      <td className="token-cost-money">{formatUsd(row.cost_usd)}</td>
                    </tr>
                  ))}
                  {!loading && breakdownRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="token-cost-empty">
                        {lt("当前筛选条件下暂无调用记录", "No usage records match the current filters")}
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
                <strong>{lt("最近调用", "Recent Requests")}</strong>
                <span>{lt("保留调用时价格与 Token 来源", "Price and Token source are stored per request")}</span>
              </div>
            </div>
            <div className="token-cost-table-scroll">
              <table className="token-cost-table token-cost-recent-table">
                <thead>
                  <tr>
                    <th>{lt("时间", "Time")}</th>
                    <th>{lt("用户 / 模块", "User / Module")}</th>
                    <th>{lt("模型", "Model")}</th>
                    <th>{lt("输入", "Input")}</th>
                    <th>{lt("输出", "Output")}</th>
                    <th>{lt("缓存读 / 写", "Cache R / W")}</th>
                    <th>{lt("积分", "Credits")}</th>
                    <th>{lt("成本", "Cost")}</th>
                    <th>{lt("来源", "Source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.recent || []).map((row) => (
                    <tr key={row.id}>
                      <td className="token-cost-time">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString(
                              lang === "zh" ? "zh-CN" : "en-US",
                              { hour12: false },
                            )
                          : "-"}
                      </td>
                      <td>
                        <div className="token-cost-name-cell">
                          <strong>{row.username || `#${row.user_id}`}</strong>
                          <span>{moduleLabel(row)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="token-cost-name-cell">
                          <strong>{row.model || "-"}</strong>
                          <span>{row.provider || "-"}</span>
                        </div>
                      </td>
                      <td>{formatNumber(row.input_tokens)}</td>
                      <td>{formatNumber(row.output_tokens)}</td>
                      <td>{formatNumber(row.cache_read_tokens)} / {formatNumber(row.cache_write_tokens)}</td>
                      <td>{formatNumber(row.credits_charged)}</td>
                      <td className="token-cost-money">{formatUsd(row.cost_usd)}</td>
                      <td>
                        <span className={`token-cost-source source-${row.usage_source || "estimated"}`}>
                          {row.usage_source === "upstream"
                            ? lt("上游", "Upstream")
                            : row.usage_source === "mixed"
                              ? lt("混合", "Mixed")
                              : row.usage_source === "unreported"
                                ? lt("未上报", "Unreported")
                              : lt("估算", "Estimated")}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!loading && (dashboard?.recent || []).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="token-cost-empty">
                        {lt("暂无最近调用", "No recent requests")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="token-cost-pagination" aria-label={lt("最近调用分页", "Recent request pagination")}>
              <span>
                {lt(
                  `共 ${recentPagination.total} 条，每页 10 条`,
                  `${recentPagination.total} requests, 10 per page`,
                )}
              </span>
              <div>
                <button type="button" onClick={() => changeRecentPage(recentPage - 1)} disabled={recentPage <= 1 || loading}>
                  {lt("上一页", "Previous")}
                </button>
                {recentWindowStart > 1 && <span>…</span>}
                {recentPageNumbers.map((page) => (
                  <button
                    key={page}
                    type="button"
                    className={page === recentPage ? "active" : ""}
                    onClick={() => changeRecentPage(page)}
                    disabled={loading}
                  >
                    {page}
                  </button>
                ))}
                {recentWindowStart + recentPageNumbers.length - 1 < recentTotalPages && <span>…</span>}
                <button type="button" onClick={() => changeRecentPage(recentPage + 1)} disabled={recentPage >= recentTotalPages || loading}>
                  {lt("下一页", "Next")}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="token-cost-pricing-panel">
          <div className="token-cost-pricing-toolbar">
            <div>
              <strong>{lt("模型单价", "Model Unit Prices")}</strong>
              <span>
                {lt(
                  "币种 USD，单位为每百万 Token；实际成本 = 单价 × 价格倍率",
                  "Currency USD, priced per million Tokens; actual cost = unit price x multiplier",
                )}
              </span>
            </div>
            <div>
              <button
                className="figma-btn"
                type="button"
                onClick={() => void importModelsFromConfiguredEndpoint()}
                disabled={modelImporting || savingPricing}
              >
                <CloudDownload size={15} className={modelImporting ? "token-cost-spin" : ""} />
                {modelImporting
                  ? lt("拉取中", "Loading Models")
                  : lt("拉取接口模型", "Load Endpoint Models")}
              </button>
              <button className="figma-btn" type="button" onClick={addPricingRow}>
                <Plus size={15} />
                {lt("新增模型", "Add Model")}
              </button>
              <button
                className="figma-btn figma-btn-primary"
                type="button"
                onClick={() => void savePricing()}
                disabled={savingPricing || !pricingDirty}
              >
                <Save size={15} />
                {savingPricing ? lt("保存中", "Saving") : lt("保存价格", "Save Pricing")}
              </button>
            </div>
          </div>
          <datalist id="token-cost-known-models">
            {pricingModelSuggestions.map((item) => (
              <option key={`${item.provider}:${item.model}`} value={item.model}>
                {item.provider}
              </option>
            ))}
          </datalist>
          <div className="token-cost-table-scroll">
            <table className="token-cost-table token-cost-pricing-table">
              <thead>
                <tr>
                  <th>{lt("协议", "Provider")}</th>
                  <th>{lt("模型名称", "Model")}</th>
                  <th>{lt("输入 USD/M", "Input USD/M")}</th>
                  <th>{lt("输出 USD/M", "Output USD/M")}</th>
                  <th>{lt("缓存读 USD/M", "Cache Read USD/M")}</th>
                  <th>{lt("缓存写 USD/M", "Cache Write USD/M")}</th>
                  <th>{lt("价格倍率", "Cost Multiplier")}</th>
                  <th>{lt("启用", "Enabled")}</th>
                  <th aria-label={lt("操作", "Actions")} />
                </tr>
              </thead>
              <tbody>
                {pricingRows.map((row, index) => (
                  <tr key={`${row.provider}:${row.model}:${index}`}>
                    <td>
                      <select
                        value={row.provider}
                        onChange={(event) => patchPricingRow(index, { provider: event.target.value })}
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Claude</option>
                        <option value="google">Gemini</option>
                        <option value="custom">{lt("自定义", "Custom")}</option>
                        <option value="*">{lt("全部协议", "All providers")}</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="figma-input"
                        list="token-cost-known-models"
                        value={row.model}
                        placeholder="deepseek-v4-flash / *"
                        onChange={(event) => patchPricingRow(index, { model: event.target.value })}
                      />
                    </td>
                    {(
                      [
                        "input_per_million",
                        "output_per_million",
                        "cache_read_per_million",
                        "cache_write_per_million",
                      ] as const
                    ).map((field) => (
                      <td key={field}>
                        <input
                          className="figma-input token-cost-rate-input"
                          type="number"
                          min={0}
                          step="0.000001"
                          value={row[field]}
                          onChange={(event) =>
                            patchPricingRow(index, { [field]: Number(event.target.value) })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        className="figma-input token-cost-rate-input"
                        type="number"
                        min={0}
                        max={100}
                        step="0.000001"
                        value={row.cost_multiplier}
                        placeholder="1"
                        title={lt(
                          "成本估算倍率，例如 0.01 表示按当前价格的 1% 计入成本",
                          "Cost estimate multiplier, for example 0.01 means 1% of the configured price",
                        )}
                        onChange={(event) =>
                          patchPricingRow(index, { cost_multiplier: Number(event.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <label className="token-cost-enabled-toggle">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(event) => patchPricingRow(index, { enabled: event.target.checked })}
                        />
                        <span>{row.enabled ? lt("启用", "On") : lt("停用", "Off")}</span>
                      </label>
                    </td>
                    <td>
                      <button
                        className="token-cost-icon-button"
                        type="button"
                        onClick={() => removePricingRow(index)}
                        title={lt("删除价格项", "Delete price row")}
                        aria-label={lt("删除价格项", "Delete price row")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {pricingRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="token-cost-empty">
                      {lt("暂无模型价格，点击新增模型开始配置", "No model prices configured")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {pricingMessage ? (
            <div className={`token-cost-pricing-message ${pricingMessageTone}`}>
              {pricingMessage}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
