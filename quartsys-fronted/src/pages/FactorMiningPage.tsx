import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as echarts from "echarts";
import { api } from "../api";
import { AiModelInput, useAiModelSelection } from "../shared/aiModels";
import { useLanguage } from "../shared/language";
import { useMarket } from "../shared/market";
import { useTheme } from "../shared/theme";

type FactorParam = {
  name: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  type: string;
};
type CustomFactor = {
  id: number;
  name: string;
  display_name: string;
  category: string;
  expression: string;
  description: string | null;
  params_json: string | null;
  output_type: string;
  default_filter: string | null;
  group_name: string;
  is_builtin: number;
  usage_count: number;
};
type FactorDraft = {
  name?: string;
  display_name?: string;
  category?: string;
  expression?: string;
  description?: string;
  params?: FactorParam[];
  output_type?: string;
  default_filter?: { min?: number; max?: number } | null;
  source?: string;
  valid?: boolean;
  validation_error?: string | null;
};

const FUNC_CARDS = [
  { name: "MA(s,w)", desc: "简单移动平均", example: "MA(close, 20)" },
  { name: "EMA(s,w)", desc: "指数移动平均", example: "EMA(close, 12)" },
  { name: "ROC(s,w)", desc: "变动率%", example: "ROC(close, 20)" },
  { name: "RSI(s,w)", desc: "相对强弱", example: "RSI(close, 14)" },
  { name: "STD(s,w)", desc: "标准差", example: "STD(close, 20)" },
  {
    name: "ATR(h,l,c,w)",
    desc: "真实波幅均值",
    example: "ATR(high,low,close,14)",
  },
  {
    name: "BOLL_WIDTH(s,w,k)",
    desc: "布林带宽度",
    example: "BOLL_WIDTH(close,20,2)",
  },
  {
    name: "VOL_RATIO(v,sw,lw)",
    desc: "量能比",
    example: "VOL_RATIO(volume,5,20)",
  },
  { name: "OBV(c,v)", desc: "能量潮", example: "OBV(close,volume)" },
  {
    name: "VWAP(c,v,w)",
    desc: "成交量加权价",
    example: "VWAP(close,volume,20)",
  },
  { name: "Ref(s,n)", desc: "N周期前的值", example: "Ref(close, 5)" },
  { name: "HHV(s,w)", desc: "W周期最高", example: "HHV(close, 20)" },
  { name: "LLV(s,w)", desc: "W周期最低", example: "LLV(close, 20)" },
  {
    name: "CROSS(a,b)",
    desc: "金叉(布尔)",
    example: "CROSS(MA(close,5),MA(close,20))",
  },
  { name: "IF(c,t,f)", desc: "条件选择", example: "IF(close>open, 1, 0)" },
  { name: "ABS(x)", desc: "绝对值", example: "ABS(close - MA(close,60))" },
  { name: "SUM(s,w)", desc: "滚动求和", example: "SUM(volume, 5)" },
  { name: "SLOPE(s,n)", desc: "N日斜率", example: "SLOPE(MA(close,20), 5)" },
  { name: "MOM(s,w)", desc: "动量", example: "MOM(close, 10)" },
  { name: "MIN/MAX(a,b)", desc: "最小/最大值", example: "MIN(open, close)" },
];

const FACTOR_DISPLAY_NAMES_EN: Record<string, string> = {
  ma_deviation: "Moving Average Deviation",
  ma60_gap: "60-Day Moving Average Gap",
  ma_cross_signal: "Moving Average Golden Cross",
  vol_ratio: "Volume Ratio",
  volume_spike: "Volume Spike",
  obv_trend: "OBV Trend",
  momentum: "Momentum",
  rsi: "RSI Relative Strength",
  price_position: "Price Position",
  volatility: "Volatility",
  atr_pct: "ATR Percentage",
  boll_width: "Bollinger Band Width",
  ma_proximity_uptrend: "Moving Average Proximity Uptrend",
  vol_breakout_momentum: "Volume Breakout Momentum",
};

const FACTOR_GROUP_NAMES_EN: Record<string, string> = {
  "均线偏离": "Moving Average",
  "量能": "Volume",
  "动量": "Momentum",
  "波动": "Volatility",
  default: "Custom",
};

function factorDisplayName(factor: Pick<CustomFactor, "name" | "display_name">, lang: "zh" | "en") {
  if (lang === "en") return FACTOR_DISPLAY_NAMES_EN[factor.name] || factor.display_name || factor.name;
  return factor.display_name || factor.name;
}

function factorGroupName(group: string, lang: "zh" | "en") {
  return lang === "en" ? FACTOR_GROUP_NAMES_EN[group] || group : group;
}

const DS = {
  primary: "var(--action)",
  primaryActive: "var(--action-hover)",
  primaryDisabled: "var(--text-tertiary)",
  ink: "var(--text-primary)",
  body: "var(--text-secondary)",
  muted: "var(--text-muted)",
  mutedSoft: "var(--text-tertiary)",
  hairline: "var(--border-light)",
  hairlineSoft: "var(--border-subtle)",
  canvas: "var(--bg-white)",
  surfaceSoft: "var(--bg-light)",
  surfaceStrong: "var(--bg-gray)",
  surfaceDark: "#0d0f11",
  surfaceDarkElevated: "#17191c",
  onPrimary: "#ffffff",
  onDark: "#ffffff",
  onDarkSoft: "#a9afb7",
  semanticUp: "var(--market-up)",
  semanticDown: "var(--market-down)",
  accentYellow: "var(--brand-accent)",
  font: "var(--font-primary)",
  mono: "var(--font-mono)",
};

export default function FactorMiningPage() {
  const { t, lang } = useLanguage();
  const { market, definition } = useMarket();
  const { theme } = useTheme();
  const {
    selectedModel: aiModel,
    setSelectedModel: setAiModel,
    modelOptions,
  } = useAiModelSelection("factor_generation");
  const navigate = useNavigate();
  const distChartRef = useRef<HTMLDivElement>(null);
  const distChartInstance = useRef<echarts.ECharts | null>(null);

  const [factors, setFactors] = useState<CustomFactor[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [factorName, setFactorName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState("technical");
  const [expression, setExpression] = useState("");
  const [description, setDescription] = useState("");
  const [outputType, setOutputType] = useState("scalar");
  const [paramsDef, setParamsDef] = useState<FactorParam[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [filterMin, setFilterMin] = useState<number | undefined>(undefined);
  const [filterMax, setFilterMax] = useState<number | undefined>(undefined);
  const [previewHit, setPreviewHit] = useState<number | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewTop, setPreviewTop] = useState<any[]>([]);
  const [previewDist, setPreviewDist] = useState<Record<string, number>>({});
  const [previewing, setPreviewing] = useState(false);
  const [validResult, setValidResult] = useState<{
    valid: boolean;
    error: string | null;
  } | null>(null);
  const [testStocks, setTestStocks] = useState<any[]>([]);
  const [testing, setTesting] = useState(false);
  const [showFactorModal, setShowFactorModal] = useState(false);
  const [modalFactorName, setModalFactorName] = useState("");
  const [modalDisplayName, setModalDisplayName] = useState("");
  const [modalCategory, setModalCategory] = useState("custom");
  const [modalOutputType, setModalOutputType] = useState("scalar");
  const [modalParamsDef, setModalParamsDef] = useState<FactorParam[]>([]);
  const [modalDescription, setModalDescription] = useState("");
  const [modalExpression, setModalExpression] = useState("");
  const [modalDefaultFilter, setModalDefaultFilter] = useState<{
    min?: number;
    max?: number;
  } | null>(null);
  const [modalError, setModalError] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const loadFactors = useCallback(async (ensureBuiltin = false) => {
    try {
      let data = await (api as any).listCustomFactors();
      let loadedFactors = Array.isArray(data?.factors) ? data.factors : [];
      if (ensureBuiltin && !loadedFactors.some((factor: CustomFactor) => factor.is_builtin === 1)) {
        await (api as any).initBuiltinFactors().catch(() => {});
        data = await (api as any).listCustomFactors();
        loadedFactors = Array.isArray(data?.factors) ? data.factors : [];
      }
      setFactors(loadedFactors);
    } catch {}
  }, []);
  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  const selectFactor = (f: CustomFactor) => {
    setSelectedId(f.id);
    setFactorName(f.name);
    setDisplayName(f.display_name || f.name);
    setCategory(f.category);
    setExpression(f.expression);
    setDescription(f.description || "");
    setOutputType(f.output_type);
    let params: FactorParam[] = [];
    if (f.params_json) {
      try {
        params = JSON.parse(f.params_json);
      } catch {}
    }
    setParamsDef(params);
    const vals: Record<string, number> = {};
    params.forEach((p) => {
      vals[p.name] = p.default;
    });
    setParamValues(vals);
    setFilterMin(undefined);
    setFilterMax(undefined);
    if (f.default_filter) {
      try {
        const flt = JSON.parse(f.default_filter);
        setFilterMin(flt.min ?? undefined);
        setFilterMax(flt.max ?? undefined);
      } catch {}
    }
    setPreviewHit(null);
    setValidResult(null);
    setTestStocks([]);
  };

  const newFactor = () => {
    setSelectedId(null);
    setFactorName("");
    setDisplayName("");
    setCategory("custom");
    setExpression("");
    setDescription("");
    setOutputType("scalar");
    setParamsDef([]);
    setParamValues({});
    setFilterMin(undefined);
    setFilterMax(undefined);
    setPreviewHit(null);
    setValidResult(null);
    setTestStocks([]);
  };

  const resetFactorModal = () => {
    setModalFactorName("");
    setModalDisplayName("");
    setModalCategory("custom");
    setModalOutputType("scalar");
    setModalParamsDef([]);
    setModalDescription("");
    setModalExpression("");
    setModalDefaultFilter(null);
    setModalError("");
    setAiPrompt("");
  };

  const openNewFactorModal = () => {
    resetFactorModal();
    setShowFactorModal(true);
  };

  const buildParamValues = (params: FactorParam[]) => {
    const vals: Record<string, number> = {};
    params.forEach((p) => {
      vals[p.name] = Number(p.default) || 0;
    });
    return vals;
  };

  const cleanModalParams = () =>
    modalParamsDef
      .map((p) => ({
        ...p,
        name: p.name.trim(),
        label: p.label.trim() || p.name.trim(),
        default: Number(p.default) || 0,
        min: Number(p.min) || 0,
        max: Number(p.max) || 0,
        step: Number(p.step) || 1,
        type: p.type || "int",
      }))
      .filter((p) => p.name);

  const addModalParam = () => {
    const name = `param${modalParamsDef.length + 1}`;
    setModalParamsDef((prev) => [
      ...prev,
      {
        name,
        label: name,
        default: 20,
        min: 1,
        max: 250,
        step: 1,
        type: "int",
      },
    ]);
  };

  const updateModalParam = (index: number, patch: Partial<FactorParam>) => {
    setModalParamsDef((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
  };

  const removeModalParam = (index: number) => {
    setModalParamsDef((prev) => prev.filter((_, i) => i !== index));
  };

  const applyDraftToModal = (draft: FactorDraft) => {
    const params = Array.isArray(draft.params) ? draft.params : [];
    setModalFactorName(draft.name || "");
    setModalDisplayName(draft.display_name || "");
    setModalCategory(draft.category || "custom");
    setModalOutputType(draft.output_type || "scalar");
    setModalParamsDef(params);
    setModalDescription(draft.description || "");
    setModalExpression(draft.expression || "");
    setModalDefaultFilter(draft.default_filter || null);
    setModalError(draft.validation_error || "");
  };

  const generateModalFactorDraft = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setModalError("请先输入因子描述");
      return;
    }
    setAiGenerating(true);
    setModalError("");
    try {
      const draft = (await (api as any).generateFactorDraft({
        prompt: `${definition.labelZh}市场因子需求：${prompt}`,
        model: aiModel || undefined,
        market,
      })) as FactorDraft;
      applyDraftToModal(draft);
    } catch (e: any) {
      setModalError(e.message || "AI生成失败");
    } finally {
      setAiGenerating(false);
    }
  };

  const saveModalFactor = async () => {
    const cleanedParams = cleanModalParams();
    const name = modalFactorName.trim();
    const display = modalDisplayName.trim() || name;
    const expr = modalExpression.trim();
    if (!name || !display || !expr) {
      setModalError("请填写因子名称、显示名和表达式");
      return;
    }
    const payload = {
      name,
      display_name: display,
      category: modalCategory,
      expression: expr,
      description: modalDescription.trim(),
      params_json: cleanedParams.length > 0 ? JSON.stringify(cleanedParams) : null,
      output_type: modalOutputType,
      default_filter:
        modalDefaultFilter &&
        (modalDefaultFilter.min !== undefined || modalDefaultFilter.max !== undefined)
          ? JSON.stringify(modalDefaultFilter)
          : null,
      group_name: "default",
    };
    setModalSaving(true);
    setModalError("");
    try {
      const created = await (api as any).createCustomFactor(payload);
      if (typeof created?.id === "number") {
        setSelectedId(created.id);
      }
      setFactorName(name);
      setDisplayName(display);
      setCategory(modalCategory);
      setExpression(expr);
      setDescription(modalDescription.trim());
      setOutputType(modalOutputType);
      setParamsDef(cleanedParams);
      setParamValues(buildParamValues(cleanedParams));
      setFilterMin(modalDefaultFilter?.min);
      setFilterMax(modalDefaultFilter?.max);
      setPreviewHit(null);
      setValidResult(null);
      setTestStocks([]);
      setShowFactorModal(false);
      loadFactors();
    } catch (e: any) {
      setModalError(e.message || "保存失败");
    } finally {
      setModalSaving(false);
    }
  };

  const insertFunc = (example: string) => {
    setExpression((prev) => (prev ? prev + " " + example : example));
  };

  const addParam = () => {
    const name = `param${paramsDef.length + 1}`;
    const p: FactorParam = {
      name,
      label: name,
      default: 20,
      min: 1,
      max: 250,
      step: 1,
      type: "int",
    };
    setParamsDef((prev) => [...prev, p]);
    setParamValues((prev) => ({ ...prev, [name]: 20 }));
  };
  const removeParam = (name: string) => {
    setParamsDef((prev) => prev.filter((p) => p.name !== name));
    setParamValues((prev) => {
      const n = { ...prev };
      delete n[name];
      return n;
    });
  };

  const doValidate = async () => {
    try {
      const res = await (api as any).validateFactor({
        expression,
        params: paramValues,
        output_type: outputType,
      });
      setValidResult(res);
    } catch (e: any) {
      setValidResult({ valid: false, error: e.message });
    }
  };
  const doPreview = async () => {
    setPreviewing(true);
    try {
      const res = await (api as any).previewFactor({
        expression,
        market,
        params: paramValues,
        output_type: outputType,
        filter_min: filterMin,
        filter_max: filterMax,
      });
      setPreviewHit(res.hit_count);
      setPreviewTotal(res.total);
      setPreviewTop(res.top_stocks || []);
      setPreviewDist(res.distribution || {});
    } catch {
      setPreviewHit(null);
    } finally {
      setPreviewing(false);
    }
  };
  const doTest = async () => {
    setTesting(true);
    try {
      const res = await (api as any).testFactor({
        expression,
        market,
        params: paramValues,
        output_type: outputType,
        filter_min: filterMin,
        filter_max: filterMax,
        limit: 200,
      });
      setTestStocks(res.stocks || []);
    } catch {
    } finally {
      setTesting(false);
    }
  };
  const doSave = async () => {
    const payload = {
      name: factorName,
      display_name: displayName,
      category,
      expression,
      description,
      params_json: paramsDef.length > 0 ? JSON.stringify(paramsDef) : null,
      output_type: outputType,
      default_filter:
        filterMin !== undefined || filterMax !== undefined
          ? JSON.stringify({ min: filterMin, max: filterMax })
          : null,
      group_name: "default",
    };
    try {
      if (selectedId) {
        await (api as any).updateCustomFactor(selectedId, payload);
      } else {
        const created = await (api as any).createCustomFactor(payload);
        if (typeof created?.id === "number") setSelectedId(created.id);
      }
      loadFactors();
    } catch (e: any) {
      alert(e.message || "保存失败");
    }
  };
  const doDelete = async () => {
    if (!selectedId) return;
    if (!confirm(t("confirmDeleteFactor"))) return;
    try {
      await (api as any).deleteCustomFactor(selectedId);
      newFactor();
      loadFactors();
    } catch {}
  };
  const applyToScreener = () => {
    navigate("/screener", {
      state: {
        factorId: selectedId || undefined,
        factorExpression: expression,
        factorParams: paramValues,
        factorName: displayName || factorName,
        outputType,
        filterMin,
        filterMax,
      },
    });
  };
  const applyToBacktest = () => {
    if (!selectedId) {
      alert("请先保存因子，再应用到回测分析。");
      return;
    }
    navigate("/backtesting", {
      state: {
        factorId: selectedId,
        factorName: displayName || factorName,
      },
    });
  };

  useEffect(() => {
    if (!distChartRef.current || Object.keys(previewDist).length === 0) return;
    if (!distChartInstance.current) {
      distChartInstance.current = echarts.init(distChartRef.current);
    }
    const labels = Object.keys(previewDist);
    const values = Object.values(previewDist);
    const rootStyle = getComputedStyle(document.documentElement);
    const chartMuted = rootStyle.getPropertyValue("--text-muted").trim() || (theme === "dark" ? "#a9afb7" : "#6b6b63");
    const chartBorder = rootStyle.getPropertyValue("--border-light").trim() || (theme === "dark" ? "rgba(255,255,255,.12)" : "#deddd6");
    const chartGrid = rootStyle.getPropertyValue("--border-subtle").trim() || (theme === "dark" ? "rgba(255,255,255,.08)" : "rgba(113,110,98,.18)");
    const chartAction = rootStyle.getPropertyValue("--action").trim() || "#dc2626";
    distChartInstance.current.setOption({
      animation: false,
      grid: { left: 48, right: 16, top: 12, bottom: 28 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { fontSize: 10, color: chartMuted },
        axisLine: { lineStyle: { color: chartBorder } },
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 10, color: chartMuted },
        splitLine: { lineStyle: { color: chartGrid } },
      },
      series: [
        {
          type: "bar",
          data: values,
          itemStyle: { color: chartAction, borderRadius: [2, 2, 0, 0] },
        },
      ],
      tooltip: { trigger: "axis" },
    });
  }, [previewDist, theme]);

  const filteredFactors = factors.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      (f.display_name || "").toLowerCase().includes(q)
    );
  });
  const groupedFactors: Record<string, CustomFactor[]> = {};
  filteredFactors.forEach((f) => {
    const g = f.group_name || "default";
    if (!groupedFactors[g]) groupedFactors[g] = [];
    groupedFactors[g].push(f);
  });

  const categoryMap: Record<string, string> = {
    technical: t("categoryTechnical"),
    statistical: t("categoryStatistical"),
    fundamental: t("categoryFundamental"),
    composite: t("categoryComposite"),
    custom: t("categoryCustom"),
  };
  const lt = (zh: string, en: string) => (lang === "zh" ? zh : en);

  const funcDescMap: Record<string, string> = {
    "MA(s,w)": t("simpleMovingAverage"),
    "EMA(s,w)": t("exponentialMovingAverage"),
    "ROC(s,w)": t("rateOfChange"),
    "RSI(s,w)": t("rsi"),
    "STD(s,w)": t("stdDeviation"),
    "ATR(h,l,c,w)": t("trueRangeAverage"),
    "BOLL_WIDTH(s,w,k)": t("bollingerWidth"),
    "VOL_RATIO(v,sw,lw)": t("volumeRatio"),
    "OBV(c,v)": t("onBalanceVolume"),
    "VWAP(c,v,w)": t("volumeWeightedPrice"),
    "Ref(s,n)": t("previousValue"),
    "HHV(s,w)": t("highestValue"),
    "LLV(s,w)": t("lowestValue"),
    "CROSS(a,b)": t("goldenCross"),
    "IF(c,t,f)": t("conditionalIf"),
    "ABS(x)": t("absoluteValue"),
    "SUM(s,w)": t("rollingSum"),
    "SLOPE(s,n)": t("slope"),
    "MOM(s,w)": t("momentum"),
    "MIN/MAX(a,b)": t("maximum"),
  };

  const debounceRef = useRef<any>(null);
  useEffect(() => {
    if (!expression) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doPreview();
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [expression, paramValues, filterMin, filterMax, outputType, market]);

  useEffect(() => {
    setPreviewHit(null);
    setPreviewTotal(null);
    setPreviewTop([]);
    setPreviewDist({});
    setTestStocks([]);
  }, [market]);

  const modalLabelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: DS.muted,
    letterSpacing: 0.5,
    display: "block",
    marginBottom: 6,
  } as const;
  const modalInputStyle = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 13,
    border: `1px solid ${DS.hairline}`,
    borderRadius: 10,
    outline: "none",
    fontFamily: DS.font,
    color: DS.ink,
    background: DS.canvas,
  } as const;
  const modalNumberInputStyle = {
    ...modalInputStyle,
    padding: "8px 8px",
    fontFamily: DS.mono,
  } as const;

  return (
    <>
      <div
      className="factor-mining-page"
      style={{
        display: "flex",
        height: "100%",
        background: DS.canvas,
        color: DS.ink,
        fontFamily: DS.font,
      }}
    >
      {/* ── Left: Factor Library ── */}
      <aside
        className="factor-library-panel"
        style={{
          width: 260,
          borderRight: `1px solid ${DS.hairline}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "20px 16px 12px" }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: -0.4,
              margin: 0,
              color: DS.ink,
            }}
          >
            {t("factorLibrary")}
          </h2>
        </div>
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ position: "relative" }}>
            <span
              className="material-symbols-outlined"
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 18,
                color: DS.muted,
              }}
            >
              search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchFactorsPlaceholder")}
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                fontSize: 13,
                border: `1px solid ${DS.hairline}`,
                borderRadius: 100,
                outline: "none",
                background: DS.surfaceStrong,
                color: DS.ink,
                fontFamily: DS.font,
              }}
            />
          </div>
        </div>
        <div
          style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}
          className="no-scrollbar"
        >
          {Object.entries(groupedFactors).map(([group, items]) => (
            <div key={group} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: DS.muted,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  marginBottom: 4,
                  marginTop: 12,
                }}
              >
                {factorGroupName(group, lang)}
              </div>
              {items.map((f) => (
                <div
                  key={f.id}
                  onClick={() => selectFactor(f)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    marginBottom: 2,
                    background:
                      selectedId === f.id ? DS.primary : "transparent",
                    color: selectedId === f.id ? DS.onPrimary : DS.ink,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "background 0.15s",
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {factorDisplayName(f, lang)}
                  </span>
                  {f.is_builtin === 1 && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 100,
                        background:
                          selectedId === f.id
                            ? "rgba(255,255,255,0.2)"
                            : DS.surfaceStrong,
                        color: selectedId === f.id ? DS.onPrimary : DS.primary,
                        fontWeight: 600,
                        letterSpacing: 0.3,
                      }}
                    >
                      {t("builtin")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: 16, borderTop: `1px solid ${DS.hairline}` }}>
          <button
            onClick={openNewFactorModal}
            style={{
              width: "100%",
              padding: "10px 0",
              fontSize: 13,
              fontWeight: 600,
              border: `1px dashed ${DS.hairline}`,
              borderRadius: 100,
              background: "transparent",
              cursor: "pointer",
              color: DS.primary,
              fontFamily: DS.font,
            }}
          >
            + {t("newFactor")}
          </button>
        </div>
      </aside>

      {/* ── Center: Factor Editor ── */}
      <main
        className="factor-editor-panel"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          padding: 24,
          gap: 20,
        }}
      >
        {/* Info row */}
        <div
          className="factor-editor-info-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 140px 140px",
            gap: 16,
          }}
        >
          {[
            {
              label: t("factorName"),
              value: factorName,
              set: setFactorName,
              ph: "e.g. momentum_20d",
            },
            {
              label: t("displayName"),
              value: displayName,
              set: setDisplayName,
              ph: "e.g. 20日动量",
            },
          ].map((f, i) => (
            <div key={i}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: DS.muted,
                  letterSpacing: 0.5,
                  display: "block",
                  marginBottom: 6,
                }}
              >
                {f.label}
              </label>
              <input
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.ph}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: 13,
                  border: `1px solid ${DS.hairline}`,
                  borderRadius: 12,
                  outline: "none",
                  fontFamily: DS.font,
                  color: DS.ink,
                  background: DS.canvas,
                }}
              />
            </div>
          ))}
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: DS.muted,
                letterSpacing: 0.5,
                display: "block",
                marginBottom: 6,
              }}
            >
              {t("category")}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 8px",
                fontSize: 13,
                border: `1px solid ${DS.hairline}`,
                borderRadius: 12,
                outline: "none",
                fontFamily: DS.font,
                color: DS.ink,
                background: DS.canvas,
              }}
            >
              {Object.entries(categoryMap).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: DS.muted,
                letterSpacing: 0.5,
                display: "block",
                marginBottom: 6,
              }}
            >
              {t("outputType")}
            </label>
            <select
              value={outputType}
              onChange={(e) => setOutputType(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 8px",
                fontSize: 13,
                border: `1px solid ${DS.hairline}`,
                borderRadius: 12,
                outline: "none",
                fontFamily: DS.font,
                color: DS.ink,
                background: DS.canvas,
              }}
            >
              <option value="scalar">{t("scalarType")}</option>
              <option value="boolean">{t("booleanType")}</option>
            </select>
          </div>
        </div>

        {/* Expression + Functions */}
        <div className="factor-expression-row" style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: DS.muted,
                letterSpacing: 0.5,
                display: "block",
                marginBottom: 6,
              }}
            >
              {t("expression")}
              <span
                style={{ fontWeight: 400, color: DS.mutedSoft, marginLeft: 8 }}
              >
                {t("useDollarForParams")}
              </span>
            </label>
            <textarea
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder={"(close / MA(close, $ma_period) - 1) * 100"}
              style={{
                width: "100%",
                minHeight: 96,
                padding: "14px 16px",
                fontSize: 13,
                fontFamily: DS.mono,
                border: `1px solid ${DS.hairline}`,
                borderRadius: 16,
                outline: "none",
                resize: "vertical",
                lineHeight: 1.6,
                background: DS.surfaceDark,
                color: "#e0e0e0",
              }}
            />
            {validResult && (
              <div
                style={{
                  fontSize: 12,
                  marginTop: 6,
                  color: validResult.valid ? DS.semanticUp : DS.semanticDown,
                }}
              >
                {validResult.valid
                  ? "✓ " + t("expressionValid")
                  : `✗ ${validResult.error}`}
              </div>
            )}
          </div>
          <div style={{ width: 240, flexShrink: 0 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: DS.muted,
                letterSpacing: 0.5,
                display: "block",
                marginBottom: 6,
              }}
            >
              {t("builtinFunctions")}
            </label>
            <div
              style={{
                maxHeight: 168,
                overflowY: "auto",
                border: `1px solid ${DS.hairline}`,
                borderRadius: 16,
                padding: 8,
              }}
              className="no-scrollbar"
            >
              {FUNC_CARDS.map((f) => (
                <div
                  key={f.name}
                  onClick={() => insertFunc(f.example)}
                  title={funcDescMap[f.name] || f.desc}
                  style={{
                    padding: "4px 8px",
                    fontSize: 12,
                    cursor: "pointer",
                    borderRadius: 6,
                    fontFamily: DS.mono,
                    color: DS.primary,
                    fontWeight: 500,
                    transition: "background 0.1s",
                  }}
                >
                  {f.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Parameters */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: DS.muted,
                letterSpacing: 0.5,
              }}
            >
              {t("parameters")}
            </label>
            <button
              onClick={addParam}
              style={{
                fontSize: 11,
                padding: "3px 10px",
                border: `1px dashed ${DS.hairline}`,
                borderRadius: 100,
                background: "transparent",
                cursor: "pointer",
                color: DS.primary,
                fontFamily: DS.font,
              }}
            >
              + {t("addParameter")}
            </button>
          </div>
          {paramsDef.length === 0 && (
            <div style={{ fontSize: 12, color: DS.mutedSoft }}>
              {t("noParamsYet")}
            </div>
          )}
          {paramsDef.map((p) => (
            <div
              key={p.name}
              className="factor-parameter-row"
              style={{
                display: "grid",
                gridTemplateColumns: "100px 56px 1fr 56px 28px",
                gap: 10,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <input
                value={p.label}
                onChange={(e) =>
                  setParamsDef((prev) =>
                    prev.map((pp) =>
                      pp.name === p.name
                        ? { ...pp, label: e.target.value }
                        : pp,
                    ),
                  )
                }
                style={{
                  padding: "6px 8px",
                  fontSize: 12,
                  border: `1px solid ${DS.hairline}`,
                  borderRadius: 8,
                  outline: "none",
                  fontFamily: DS.font,
                  color: DS.ink,
                }}
              />
              <span
                style={{ fontSize: 10, color: DS.muted, fontFamily: DS.mono }}
              >
                ${p.name}
              </span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={paramValues[p.name] ?? p.default}
                onChange={(e) =>
                  setParamValues((prev) => ({
                    ...prev,
                    [p.name]: parseFloat(e.target.value),
                  }))
                }
                style={{ width: "100%", accentColor: DS.primary }}
              />
              <input
                type="number"
                value={paramValues[p.name] ?? p.default}
                onChange={(e) =>
                  setParamValues((prev) => ({
                    ...prev,
                    [p.name]: parseFloat(e.target.value) || 0,
                  }))
                }
                style={{
                  width: 56,
                  padding: "6px 4px",
                  fontSize: 12,
                  border: `1px solid ${DS.hairline}`,
                  borderRadius: 8,
                  outline: "none",
                  textAlign: "center",
                  fontFamily: DS.mono,
                  color: DS.ink,
                }}
              />
              <button
                onClick={() => removeParam(p.name)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: DS.semanticDown,
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Filter range */}
        {outputType === "scalar" && (
          <div className="factor-filter-range" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: DS.muted,
                letterSpacing: 0.5,
              }}
            >
              {t("defaultValue")}
            </label>
            <span style={{ fontSize: 12, color: DS.muted }}>Min</span>
            <input
              type="number"
              value={filterMin ?? ""}
              onChange={(e) =>
                setFilterMin(
                  e.target.value ? parseFloat(e.target.value) : undefined,
                )
              }
              style={{
                width: 80,
                padding: "6px 8px",
                fontSize: 12,
                border: `1px solid ${DS.hairline}`,
                borderRadius: 8,
                outline: "none",
                fontFamily: DS.mono,
                color: DS.ink,
              }}
            />
            <span style={{ fontSize: 12, color: DS.muted }}>Max</span>
            <input
              type="number"
              value={filterMax ?? ""}
              onChange={(e) =>
                setFilterMax(
                  e.target.value ? parseFloat(e.target.value) : undefined,
                )
              }
              style={{
                width: 80,
                padding: "6px 8px",
                fontSize: 12,
                border: `1px solid ${DS.hairline}`,
                borderRadius: 8,
                outline: "none",
                fontFamily: DS.mono,
                color: DS.ink,
              }}
            />
          </div>
        )}

        {/* Description */}
        <div>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: DS.muted,
              letterSpacing: 0.5,
              display: "block",
              marginBottom: 6,
            }}
          >
            {t("factorDescription")}
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
              border: `1px solid ${DS.hairline}`,
              borderRadius: 12,
              outline: "none",
              fontFamily: DS.font,
              color: DS.ink,
            }}
          />
        </div>

        {/* Action buttons */}
        <div className="factor-action-row" style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={doValidate}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              border: `1px solid ${DS.hairline}`,
              borderRadius: 100,
              background: DS.canvas,
              cursor: "pointer",
              fontFamily: DS.font,
              color: DS.ink,
            }}
          >
            {t("validateExpression")}
          </button>
          <button
            onClick={doPreview}
            disabled={previewing}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              borderRadius: 100,
              background: previewing ? DS.primaryDisabled : DS.primary,
              color: DS.onPrimary,
              cursor: previewing ? "not-allowed" : "pointer",
              fontFamily: DS.font,
            }}
          >
            {previewing ? t("previewing") : t("previewFactor")}
          </button>
          <button
            onClick={doTest}
            disabled={testing}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              border: `1px solid ${DS.primary}`,
              borderRadius: 100,
              background: "transparent",
              color: DS.primary,
              cursor: testing ? "not-allowed" : "pointer",
              fontFamily: DS.font,
            }}
          >
            {testing ? t("testing") : t("testFactor")}
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={doSave}
            style={{
              padding: "10px 24px",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              borderRadius: 100,
              background: DS.semanticUp,
              color: DS.onPrimary,
              cursor: "pointer",
              fontFamily: DS.font,
            }}
          >
            {t("saveFactor")}
          </button>
          {selectedId && (
            <button
              onClick={doDelete}
              style={{
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                border: `1px solid ${DS.semanticDown}`,
                borderRadius: 100,
                background: "transparent",
                color: DS.semanticDown,
                cursor: "pointer",
                fontFamily: DS.font,
              }}
            >
              {t("deleteFactor")}
            </button>
          )}
        </div>

        {/* Preview results */}
        {previewHit !== null && (
          <div
            className="factor-preview-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "200px 1fr",
              gap: 20,
              marginTop: 8,
              padding: 24,
              borderRadius: 24,
              border: `1px solid ${DS.hairline}`,
              background: DS.canvas,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 400,
                  fontFamily: DS.mono,
                  color: DS.primary,
                  lineHeight: 1,
                  letterSpacing: -1.5,
                }}
              >
                {previewHit}
              </div>
              <div style={{ fontSize: 13, color: DS.muted, marginTop: 8 }}>
                / {previewTotal} {t("hitCount")}
              </div>
            </div>
            <div ref={distChartRef} style={{ height: 120 }} />
          </div>
        )}

        {/* Matched stocks table */}
        {(previewTop.length > 0 || testStocks.length > 0) && (
          <div
            style={{
              marginTop: 8,
              borderTop: `1px solid ${DS.hairline}`,
              paddingTop: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                {t("hitStocks")} (
                {testStocks.length > 0 ? testStocks.length : previewTop.length})
              </h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={applyToScreener}
                  style={{
                    padding: "6px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: `1px solid ${DS.primary}`,
                    borderRadius: 100,
                    background: "transparent",
                    color: DS.primary,
                    cursor: "pointer",
                    fontFamily: DS.font,
                  }}
                >
                  {t("applyToScreener")}
                </button>
                <button
                  onClick={applyToBacktest}
                  style={{
                    padding: "6px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: `1px solid ${DS.ink}`,
                    borderRadius: 100,
                    background: DS.ink,
                    color: DS.onDark,
                    cursor: "pointer",
                    fontFamily: DS.font,
                  }}
                >
                  {t("applyToBacktest")}
                </button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="figma-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>#</th>
                    <th style={{ textAlign: "left" }}>{t("code")}</th>
                    <th style={{ textAlign: "left" }}>{t("stockName")}</th>
                    <th style={{ textAlign: "right" }}>{t("factorValue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(testStocks.length > 0 ? testStocks : previewTop).map(
                    (s, i) => (
                      <tr key={s.code}>
                        <td style={{ color: DS.muted }}>{i + 1}</td>
                        <td className="mono">{s.code}</td>
                        <td>{s.name}</td>
                        <td
                          className="mono"
                          style={{
                            textAlign: "right",
                            fontWeight: 600,
                            color:
                              s.value > 0 ? DS.semanticUp : DS.semanticDown,
                          }}
                        >
                          {typeof s.value === "number"
                            ? s.value.toFixed(4)
                            : s.value}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
    {showFactorModal && (
      <div
        role="dialog"
        aria-modal="true"
        onClick={() => !modalSaving && setShowFactorModal(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 80,
          background: "rgba(10, 11, 13, 0.42)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(980px, 100%)",
            maxHeight: "92vh",
            overflow: "hidden",
            borderRadius: 18,
            background: DS.canvas,
            boxShadow: "0 28px 80px rgba(10, 11, 13, 0.28)",
            border: `1px solid ${DS.hairline}`,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "18px 22px",
              borderBottom: `1px solid ${DS.hairline}`,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 650, color: DS.ink }}>
                {lt("新增因子", "New Factor")}
              </div>
            </div>
            <button
              onClick={() => !modalSaving && setShowFactorModal(false)}
              disabled={modalSaving}
              aria-label={lt("关闭", "Close")}
              style={{
                width: 34,
                height: 34,
                borderRadius: 100,
                border: `1px solid ${DS.hairline}`,
                background: DS.canvas,
                color: DS.ink,
                cursor: modalSaving ? "not-allowed" : "pointer",
                fontSize: 20,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              padding: 22,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${DS.hairline}`,
                background: DS.surfaceSoft,
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1fr) minmax(160px, 220px) auto",
                gap: 10,
                alignItems: "end",
              }}
            >
              <input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") generateModalFactorDraft();
                }}
                placeholder={lt("例如：20日动量、5日均线上穿20日均线、成交量放大", "Example: 20-day momentum, MA5 crosses MA20, volume expansion")}
                style={{
                  ...modalInputStyle,
                  borderRadius: 100,
                  background: DS.canvas,
                }}
              />
              <AiModelInput
                label={lt("生成模型", "Generation Model")}
                selectedModel={aiModel}
                modelOptions={modelOptions}
                onChange={setAiModel}
                compact
                inputStyle={{
                  height: 39,
                  borderRadius: 100,
                  border: `1px solid ${DS.hairline}`,
                  fontFamily: DS.mono,
                }}
              />
              <button
                onClick={generateModalFactorDraft}
                disabled={aiGenerating}
                style={{
                  padding: "9px 14px",
                  borderRadius: 100,
                  border: "none",
                  background: aiGenerating ? DS.primaryDisabled : DS.primary,
                  color: DS.onPrimary,
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: aiGenerating ? "not-allowed" : "pointer",
                  fontFamily: DS.font,
                  whiteSpace: "nowrap",
                }}
              >
                {aiGenerating ? lt("生成中", "Generating") : lt("AI生成 · 30积分", "AI Generate · 30 credits")}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 14,
              }}
            >
              <div>
                <label style={modalLabelStyle}>{lt("因子名称", "Factor Name")}</label>
                <input
                  value={modalFactorName}
                  onChange={(e) => setModalFactorName(e.target.value)}
                  placeholder="momentum_20d"
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={modalLabelStyle}>{lt("显示名", "Display Name")}</label>
                <input
                  value={modalDisplayName}
                  onChange={(e) => setModalDisplayName(e.target.value)}
                  placeholder={lt("20日动量", "20-Day Momentum")}
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={modalLabelStyle}>{lt("分类", "Category")}</label>
                <select
                  value={modalCategory}
                  onChange={(e) => setModalCategory(e.target.value)}
                  style={modalInputStyle}
                >
                  {Object.entries(categoryMap).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={modalLabelStyle}>{lt("数值型", "Value Type")}</label>
                <select
                  value={modalOutputType}
                  onChange={(e) => setModalOutputType(e.target.value)}
                  style={modalInputStyle}
                >
                  <option value="scalar">{t("scalarType")}</option>
                  <option value="boolean">{t("booleanType")}</option>
                </select>
              </div>
            </div>

            <div>
              <label style={modalLabelStyle}>{lt("描述", "Description")}</label>
              <textarea
                value={modalDescription}
                onChange={(e) => setModalDescription(e.target.value)}
                placeholder={lt("说明这个因子的含义、使用场景和筛选方向", "Describe meaning, use case and filtering direction")}
                style={{
                  ...modalInputStyle,
                  minHeight: 70,
                  resize: "vertical",
                  lineHeight: 1.55,
                }}
              />
            </div>

            <div>
              <label style={modalLabelStyle}>
                {lt("表达式", "Expression")}
                <span style={{ color: DS.mutedSoft, fontWeight: 400, marginLeft: 8 }}>
                  {t("useDollarForParams")}
                </span>
              </label>
              <textarea
                value={modalExpression}
                onChange={(e) => setModalExpression(e.target.value)}
                placeholder="ROC(close, $window)"
                style={{
                  width: "100%",
                  minHeight: 108,
                  padding: "14px 16px",
                  fontSize: 13,
                  fontFamily: DS.mono,
                  border: `1px solid ${DS.hairline}`,
                  borderRadius: 14,
                  outline: "none",
                  resize: "vertical",
                  lineHeight: 1.6,
                  background: DS.surfaceDark,
                  color: "#e0e0e0",
                }}
              />
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <label style={{ ...modalLabelStyle, marginBottom: 0 }}>
                  {lt("可调参数（可选）", "Tunable Params (Optional)")}
                </label>
                <button
                  onClick={addModalParam}
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    border: `1px dashed ${DS.hairline}`,
                    borderRadius: 100,
                    background: "transparent",
                    cursor: "pointer",
                    color: DS.primary,
                    fontFamily: DS.font,
                  }}
                >
                  + {t("addParameter")}
                </button>
              </div>
              {modalParamsDef.length === 0 ? (
                <div style={{ fontSize: 12, color: DS.mutedSoft }}>
                  {t("noParamsYet")}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    overflowX: "auto",
                  }}
                >
                  {modalParamsDef.map((p, index) => (
                    <div
                      key={`${p.name}-${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 92px 92px 92px 78px 92px 32px",
                        gap: 8,
                        alignItems: "center",
                        minWidth: 850,
                      }}
                    >
                      <input
                        value={p.name}
                        onChange={(e) => updateModalParam(index, { name: e.target.value })}
                        placeholder="window"
                        title={lt("参数名", "Param name")}
                        style={modalNumberInputStyle}
                      />
                      <input
                        value={p.label}
                        onChange={(e) => updateModalParam(index, { label: e.target.value })}
                        placeholder={lt("窗口期", "Window")}
                        title={lt("显示名", "Label")}
                        style={modalInputStyle}
                      />
                      <input
                        type="number"
                        value={p.default}
                        onChange={(e) => updateModalParam(index, { default: parseFloat(e.target.value) || 0 })}
                        title={lt("默认值", "Default")}
                        style={modalNumberInputStyle}
                      />
                      <input
                        type="number"
                        value={p.min}
                        onChange={(e) => updateModalParam(index, { min: parseFloat(e.target.value) || 0 })}
                        title={lt("最小值", "Min")}
                        style={modalNumberInputStyle}
                      />
                      <input
                        type="number"
                        value={p.max}
                        onChange={(e) => updateModalParam(index, { max: parseFloat(e.target.value) || 0 })}
                        title={lt("最大值", "Max")}
                        style={modalNumberInputStyle}
                      />
                      <input
                        type="number"
                        value={p.step}
                        onChange={(e) => updateModalParam(index, { step: parseFloat(e.target.value) || 1 })}
                        title={lt("步长", "Step")}
                        style={modalNumberInputStyle}
                      />
                      <select
                        value={p.type}
                        onChange={(e) => updateModalParam(index, { type: e.target.value })}
                        title={lt("类型", "Type")}
                        style={modalInputStyle}
                      >
                        <option value="int">int</option>
                        <option value="float">float</option>
                      </select>
                      <button
                        onClick={() => removeModalParam(index)}
                        aria-label={lt("删除参数", "Remove param")}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 100,
                          border: "none",
                          background: DS.surfaceStrong,
                          color: DS.semanticDown,
                          cursor: "pointer",
                          fontSize: 17,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {modalError && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(207, 32, 47, 0.08)",
                  color: DS.semanticDown,
                  fontSize: 12,
                  border: "1px solid rgba(207, 32, 47, 0.18)",
                }}
              >
                {modalError}
              </div>
            )}
          </div>

          <div
            style={{
              padding: "14px 22px",
              borderTop: `1px solid ${DS.hairline}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              background: DS.surfaceSoft,
            }}
          >
            <button
              onClick={() => !modalSaving && setShowFactorModal(false)}
              disabled={modalSaving}
              style={{
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: 600,
                border: `1px solid ${DS.hairline}`,
                borderRadius: 100,
                background: DS.canvas,
                color: DS.ink,
                cursor: modalSaving ? "not-allowed" : "pointer",
                fontFamily: DS.font,
              }}
            >
              {lt("取消", "Cancel")}
            </button>
            <button
              onClick={saveModalFactor}
              disabled={modalSaving}
              style={{
                padding: "9px 22px",
                fontSize: 13,
                fontWeight: 650,
                border: "none",
                borderRadius: 100,
                background: modalSaving ? DS.primaryDisabled : DS.semanticUp,
                color: DS.onPrimary,
                cursor: modalSaving ? "not-allowed" : "pointer",
                fontFamily: DS.font,
              }}
            >
              {modalSaving ? lt("保存中", "Saving") : lt("保存因子", "Save Factor")}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
