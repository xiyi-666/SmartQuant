import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, Replace } from "lucide-react";
import { api } from "../api";
import { AiModelInput, useAiModelSelection } from "../shared/aiModels";
import { useLangText } from "../shared/language";
import { useMarket } from "../shared/market";

const BUY_CONDITIONS = [
  "RSI Crossover",
  "MACD Signal",
  "Price < BB Lower",
  "MA Golden Cross",
  "Volume Spike",
];
const STRATEGY_TYPES = [
  { key: "turtle", label: "海龟策略", labelEn: "Turtle" },
  { key: "trend", label: "趋势跟踪", labelEn: "Trend Following" },
  { key: "mean", label: "均值回归", labelEn: "Mean Reversion" },
  { key: "arbitrage", label: "套利", labelEn: "Arbitrage" },
  { key: "momentum", label: "动量", labelEn: "Momentum" },
] as const;

interface SavedStrategy {
  id: number;
  name: string;
  updated_at: string;
  factor_ids?: number[];
}

interface FactorOption {
  id: number;
  name: string;
  display_name?: string;
  expression?: string;
  params_json?: string | null;
  output_type?: string;
  default_filter?: string | null;
  category?: string;
  is_builtin?: number;
}

type FactorParamDef = {
  name: string;
  label?: string;
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  type?: string;
};

type FactorOverride = {
  params: Record<string, number>;
  filter_min?: number | null;
  filter_max?: number | null;
};

type FactorRuntimeSpec = {
  id: number;
  name: string;
  display_name?: string;
  expression?: string;
  output_type?: string;
  params: Record<string, number>;
  filter_min?: number | null;
  filter_max?: number | null;
};

type StrategyPoolRow = {
  code: string;
  name: string;
  industry?: string;
  board?: string;
  price?: number;
  change_pct?: number;
  score?: number;
  date?: string;
};

interface LibraryStrategyItem {
  id: string;
  strategyId?: number;
  name: string;
  desc: string;
  status: "active" | "draft";
  time: string;
  group: string;
  source: "builtin" | "saved" | "local";
}

const FIGMA_STRATEGIES = [
  {
    status: "active" as const,
    time: "2h ago",
    name: "RSI Momentum Breakout",
    desc: "Based on 14-period RSI crossing 70...",
  },
  {
    status: "draft" as const,
    time: "1d ago",
    name: "MACD Divergence Short",
    desc: "Looking for bearish divergence on 1h...",
  },
  {
    status: "draft" as const,
    time: "3d ago",
    name: "VWAP Mean Reversion",
    desc: "Standard deviation bands around daily...",
  },
];

const SAMPLE_CODE = `class RSIMomentumBreakout:
    def __init__(self, period=14, threshold=70):
        self.period = period
        self.threshold = threshold
        self.prices = []

    def calculate_rsi(self):
        if len(self.prices) < self.period + 1:
            return None
        deltas = [self.prices[i] - self.prices[i-1]
                  for i in range(-self.period, 0)]
        gains = [d for d in deltas if d > 0]
        losses = [-d for d in deltas if d < 0]
        avg_gain = sum(gains) / self.period
        avg_loss = sum(losses) / self.period
        rs = avg_gain / avg_loss if avg_loss else 0
        return 100 - (100 / (1 + rs))

    def on_tick(self, price):
        self.prices.append(price)
        rsi = self.calculate_rsi()
        if rsi and rsi > self.threshold:
            return {"action": "BUY", "rsi": rsi}
        return None`;

export default function StrategyPage() {
  const lt = useLangText();
  const { market, definition } = useMarket();
  const [prompt, setPrompt] = useState("");
  const [buyCondition, setBuyCondition] = useState("RSI Crossover");
  const [sellCondition, setSellCondition] = useState("");
  const [profitTarget, setProfitTarget] = useState(12.5);
  const [stopLoss, setStopLoss] = useState(4.0);
  const [holdingPeriod, setHoldingPeriod] = useState<number | null>(null);
  const {
    selectedModel: strategyModel,
    setSelectedModel: setStrategyModel,
    modelOptions,
  } = useAiModelSelection(
    "strategy",
    localStorage.getItem("strategy_default_model") || "smart",
  );
  const [factorOptions, setFactorOptions] = useState<FactorOption[]>([]);
  const [selectedFactorIds, setSelectedFactorIds] = useState<number[]>([]);
  const [factorOverrides, setFactorOverrides] = useState<Record<number, FactorOverride>>({});
  const [poolRows, setPoolRows] = useState<StrategyPoolRow[]>([]);
  const [poolTotal, setPoolTotal] = useState(0);
  const [poolDate, setPoolDate] = useState("");
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolStatus, setPoolStatus] = useState("");
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [code, setCode] = useState(SAMPLE_CODE);
  const [codeSearch, setCodeSearch] = useState("");
  const [codeReplace, setCodeReplace] = useState("");
  const [codeSearchIndex, setCodeSearchIndex] = useState(0);
  const [codeFileName, setCodeFileName] = useState("strategy_v1.py");
  const [codeActionStatus, setCodeActionStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    message: string;
  } | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedList, setSavedList] = useState<SavedStrategy[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryStrategyItem[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("ALL");
  const [newGroupName, setNewGroupName] = useState("");
  const [newStrategyName, setNewStrategyName] = useState("");
  const [newStrategyDesc, setNewStrategyDesc] = useState("");
  const [showLibraryManager, setShowLibraryManager] = useState(false);
  const [runLogs, setRunLogs] = useState<string[]>([
    lt("系统就绪，等待生成策略。", "System ready. Waiting to generate strategy."),
  ]);
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "ai"; text: string }[]
  >([
    {
      role: "ai",
      text: lt(
        "你好！请描述你的交易逻辑，我将为你生成量化策略代码。",
        "Describe your trading logic and I will generate quant strategy code.",
      ),
    },
  ]);
  const [activeSidebarItem, setActiveSidebarItem] = useState(0);
  const [outputTab, setOutputTab] = useState<"python" | "config">("python");
  const [positionsTab, setPositionsTab] = useState<"positions" | "records">(
    "positions",
  );
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [workbenchCollapsed, setWorkbenchCollapsed] = useState(false);
  const [ideMode, setIdeMode] = useState(false);
  const editorViewRef = useRef<any>(null);
  const streamBufferRef = useRef("");
  const streamFrameRef = useRef<number | null>(null);

  const toggleIdeMode = () => {
    setIdeMode((current) => {
      const next = !current;
      setLibraryCollapsed(next);
      setWorkbenchCollapsed(next);
      return next;
    });
  };

  useEffect(() => {
    if (strategyModel) {
      localStorage.setItem("strategy_default_model", strategyModel);
    }
  }, [strategyModel]);

  useEffect(
    () => () => {
      if (streamFrameRef.current !== null) {
        window.cancelAnimationFrame(streamFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    (api as any)
      .listStrategies()
      .then((d: any) => setSavedList(Array.isArray(d) ? d : []))
      .catch(() => {});
    (async () => {
      await (api as any).initBuiltinFactors().catch(() => {});
      const d = await (api as any).listCustomFactors();
      setFactorOptions(Array.isArray(d?.factors) ? d.factors : []);
    })().catch(() => setFactorOptions([]));
  }, []);

  const factorConditionOptions = [
    ...BUY_CONDITIONS,
    ...factorOptions.map((f) => f.display_name || f.name),
  ];

  const toFiniteNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  const parseFactorParamDefs = (raw?: string | null): FactorParamDef[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item === "object" && item.name)
        .map((item: any) => ({
          name: String(item.name),
          label: String(item.label || item.name),
          default: toFiniteNumber(item.default),
          min: toFiniteNumber(item.min),
          max: toFiniteNumber(item.max),
          step: toFiniteNumber(item.step) || 1,
          type: item.type || "float",
        }));
    } catch {
      return [];
    }
  };

  const parseFactorFilter = (raw?: string | null) => {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return {
        filter_min: toFiniteNumber((parsed as any).min),
        filter_max: toFiniteNumber((parsed as any).max),
      };
    } catch {
      return {};
    }
  };

  const defaultOverrideForFactor = (factor: FactorOption): FactorOverride => {
    const params: Record<string, number> = {};
    parseFactorParamDefs(factor.params_json).forEach((param) => {
      params[param.name] = param.default ?? 0;
    });
    const filter = parseFactorFilter(factor.default_filter);
    return {
      params,
      filter_min: filter.filter_min,
      filter_max: filter.filter_max,
    };
  };

  const selectedFactors = factorOptions.filter((factor) =>
    selectedFactorIds.includes(factor.id),
  );
  const displayedPoolRows = poolRows.slice(0, 5);

  useEffect(() => {
    if (!selectedFactorIds.length) {
      setFactorOverrides({});
      return;
    }
    setFactorOverrides((prev) => {
      let changed = false;
      const next: Record<number, FactorOverride> = {};
      for (const factorId of selectedFactorIds) {
        const factor = factorOptions.find((item) => item.id === factorId);
        if (!factor) continue;
        next[factorId] = prev[factorId] || defaultOverrideForFactor(factor);
        if (next[factorId] !== prev[factorId]) changed = true;
      }
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      return changed ? next : prev;
    });
  }, [selectedFactorIds, factorOptions]);

  const getFactorOverride = (factor: FactorOption) => {
    const defaults = defaultOverrideForFactor(factor);
    const override = factorOverrides[factor.id];
    if (!override) return defaults;
    return {
      params: { ...defaults.params, ...(override.params || {}) },
      filter_min: Object.prototype.hasOwnProperty.call(override, "filter_min")
        ? override.filter_min
        : defaults.filter_min,
      filter_max: Object.prototype.hasOwnProperty.call(override, "filter_max")
        ? override.filter_max
        : defaults.filter_max,
    };
  };

  const updateFactorParam = (factor: FactorOption, name: string, value: number) => {
    setFactorOverrides((prev) => {
      const current = prev[factor.id] || defaultOverrideForFactor(factor);
      return {
        ...prev,
        [factor.id]: {
          ...current,
          params: { ...current.params, [name]: value },
        },
      };
    });
    setPoolRows([]);
    setPoolTotal(0);
    setPoolStatus(lt("因子参数已变化，请重新预览股票池。", "Factor parameters changed"));
  };

  const updateFactorFilter = (
    factor: FactorOption,
    key: "filter_min" | "filter_max",
    value?: number | null,
  ) => {
    setFactorOverrides((prev) => {
      const current = prev[factor.id] || defaultOverrideForFactor(factor);
      return {
        ...prev,
        [factor.id]: { ...current, [key]: value },
      };
    });
    setPoolRows([]);
    setPoolTotal(0);
    setPoolStatus(lt("因子过滤阈值已变化，请重新预览股票池。", "Factor filters changed"));
  };

  const resetFactorOverride = (factor: FactorOption) => {
    setFactorOverrides((prev) => ({
      ...prev,
      [factor.id]: defaultOverrideForFactor(factor),
    }));
    setPoolRows([]);
    setPoolTotal(0);
    setPoolStatus(lt("因子参数已恢复默认，请重新预览股票池。", "Factor parameters reset"));
  };

  const buildStrategyFactorSpecs = (): FactorRuntimeSpec[] =>
    selectedFactors.map((factor) => {
      const override = getFactorOverride(factor);
      return {
        id: factor.id,
        name: factor.name,
        display_name: factor.display_name || factor.name,
        expression: factor.expression,
        output_type: factor.output_type || "scalar",
        params: override.params || {},
        filter_min: override.filter_min,
        filter_max: override.filter_max,
      };
    });

  const toggleFactor = (id: number) => {
    const active = selectedFactorIds.includes(id);
    setSelectedFactorIds((ids) =>
      active ? ids.filter((item) => item !== id) : [...ids, id],
    );
    setFactorOverrides((prev) => {
      const next = { ...prev };
      if (active) {
        delete next[id];
      } else {
        const factor = factorOptions.find((item) => item.id === id);
        if (factor && !next[id]) next[id] = defaultOverrideForFactor(factor);
      }
      return next;
    });
    setPoolRows([]);
    setPoolTotal(0);
    setPoolStatus(lt("因子选择已变化，请重新预览股票池。", "Factor selection changed"));
  };

  const previewFactorPool = async () => {
    if (!selectedFactorIds.length) {
      setPoolRows([]);
      setPoolTotal(0);
      setPoolStatus(lt("请先选择因子作为股票池过滤条件", "Select factors first"));
      return;
    }
    setPoolLoading(true);
    setPoolStatus(lt("正在按因子生成候选股票池...", "Building candidate pool..."));
    try {
      const data: any = await (api as any).previewStrategyStockPool({
        factor_ids: selectedFactorIds,
        factor_specs: buildStrategyFactorSpecs(),
        market,
        limit: 150,
        universe_limit: 150,
      });
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      setPoolRows(rows);
      setPoolTotal(Number(data?.total || rows.length || 0));
      setPoolDate(data?.date || rows[0]?.date || "");
      setPoolStatus(
        lt(
          `股票池已生成：扫描 ${Number(data?.universe_count || 0)} 只高流动性样本，命中 ${Number(data?.total || rows.length || 0)} 只；正式回测会按回测周期重新计算股票池。`,
          `Pool ready: ${Number(data?.total || rows.length || 0)} matches.`,
        ),
      );
      setRunLogs((logs) => [
        ...logs,
        `因子股票池预览完成：${Number(data?.total || rows.length || 0)} 只`,
      ]);
    } catch (e: any) {
      setPoolRows([]);
      setPoolTotal(0);
      setPoolStatus(e?.message || lt("股票池生成失败", "Pool build failed"));
    } finally {
      setPoolLoading(false);
    }
  };

  useEffect(() => {
    const builtinItems: LibraryStrategyItem[] = FIGMA_STRATEGIES.map((s, index) => ({
      id: `builtin-${index}`,
      name: s.name,
      desc: s.desc,
      status: s.status,
      time: s.time,
      group: "Templates",
      source: "builtin",
    }));
    const savedItems: LibraryStrategyItem[] = savedList.map((s) => ({
      id: `saved-${s.id}`,
      strategyId: s.id,
      name: s.name,
      desc: s.factor_ids?.length
        ? `关联因子 ${s.factor_ids.length} 个`
        : "已保存策略",
      status: "draft",
      time: s.updated_at?.slice(0, 10) || "recent",
      group: "Saved",
      source: "saved",
    }));
    setLibraryItems((prev) => {
      const localItems = prev.filter((item) => item.source === "local");
      return [...builtinItems, ...savedItems, ...localItems];
    });
  }, [savedList]);

  const groupOptions = [
    "ALL",
    ...Array.from(new Set(libraryItems.map((item) => item.group))),
  ];

  const filteredLibraryItems = libraryItems.filter((item) => {
    const byGroup = selectedGroup === "ALL" || item.group === selectedGroup;
    const bySearch =
      !librarySearch.trim() ||
      item.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
      item.desc.toLowerCase().includes(librarySearch.toLowerCase());
    return byGroup && bySearch;
  });

  const loadSavedStrategy = async (item: LibraryStrategyItem, index: number) => {
    setActiveSidebarItem(index);
    if (item.source !== "saved" || !item.strategyId) return;
    try {
      const strategy: any = await (api as any).getStrategy(item.strategyId);
      let savedConfig: any = {};
      try {
        savedConfig = strategy?.params_json ? JSON.parse(strategy.params_json) : {};
      } catch {
        savedConfig = {};
      }
      const savedFactorIds = Array.isArray(strategy?.factor_ids) ? strategy.factor_ids : [];
      setSaveName(strategy?.name || item.name);
      setCode(strategy?.code || "");
      setCodeFileName(
        `${(strategy?.name || item.name || "strategy").replace(/[\\/:*?"<>|\s]+/g, "_")}.py`,
      );
      setSelectedFactorIds(savedFactorIds);
      const savedSpecs = Array.isArray(savedConfig?.factor_specs)
        ? savedConfig.factor_specs
        : [];
      if (savedSpecs.length) {
        const restored: Record<number, FactorOverride> = {};
        savedSpecs.forEach((spec: any) => {
          const factorId = Number(spec?.id || spec?.factor_id);
          if (!Number.isFinite(factorId)) return;
          restored[factorId] = {
            params:
              spec?.params && typeof spec.params === "object"
                ? Object.fromEntries(
                    Object.entries(spec.params)
                      .map(([key, value]) => [key, Number(value)])
                      .filter(([, value]) => Number.isFinite(value)),
                  )
                : {},
            filter_min: toFiniteNumber(spec?.filter_min),
            filter_max: toFiniteNumber(spec?.filter_max),
          };
        });
        setFactorOverrides(restored);
      } else {
        setFactorOverrides({});
      }
      setPoolRows([]);
      setPoolTotal(0);
      setPoolStatus(
        savedFactorIds.length
          ? lt("已加载策略及其关联因子，可预览股票池后回测。", "Strategy and factors loaded")
          : lt("已加载策略代码，当前未绑定因子股票池。", "Strategy loaded without factor pool"),
      );
      setRunLogs((logs) => [...logs, `已加载策略：${strategy?.name || item.name}`]);
    } catch (e: any) {
      setRunLogs((logs) => [...logs, `加载策略失败：${e.message}`]);
    }
  };

  const codeSearchMatches = useMemo(() => {
    if (!codeSearch) return [];
    const matches: number[] = [];
    let cursor = 0;
    while (cursor <= code.length) {
      const index = code.indexOf(codeSearch, cursor);
      if (index === -1) break;
      matches.push(index);
      cursor = index + Math.max(1, codeSearch.length);
    }
    return matches;
  }, [code, codeSearch]);

  useEffect(() => {
    if (!codeSearchMatches.length) {
      setCodeSearchIndex(0);
      return;
    }
    setCodeSearchIndex((index) =>
      Math.min(index, Math.max(0, codeSearchMatches.length - 1)),
    );
  }, [codeSearchMatches.length]);

  const focusSearchMatch = (index: number) => {
    if (!codeSearchMatches.length || !codeSearch) return;
    const nextIndex =
      (index + codeSearchMatches.length) % codeSearchMatches.length;
    const from = codeSearchMatches[nextIndex];
    const view = editorViewRef.current;
    setCodeSearchIndex(nextIndex);
    if (view) {
      view.dispatch({
        selection: { anchor: from, head: from + codeSearch.length },
        scrollIntoView: true,
      });
      view.focus();
    }
  };

  const replaceCurrentMatch = () => {
    if (!codeSearchMatches.length || !codeSearch) return;
    const from = codeSearchMatches[codeSearchIndex] ?? codeSearchMatches[0];
    setCode(
      `${code.slice(0, from)}${codeReplace}${code.slice(from + codeSearch.length)}`,
    );
  };

  const replaceAllMatches = () => {
    if (!codeSearch) return;
    setCode(code.split(codeSearch).join(codeReplace));
    setCodeSearchIndex(0);
  };

  const normalizedCodeFileName = () => {
    const cleaned = codeFileName.trim().replace(/[\\/:*?"<>|]/g, "_");
    const fallback = saveName.trim() || "strategy";
    const name = cleaned || `${fallback}.py`;
    return name.toLowerCase().endsWith(".py") ? name : `${name}.py`;
  };

  const showCodeActionStatus = (message: string) => {
    setCodeActionStatus(message);
    window.setTimeout(() => setCodeActionStatus(""), 1800);
  };

  const copyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showCodeActionStatus(lt("已复制代码", "Code copied"));
    } catch {
      showCodeActionStatus(lt("复制失败，请手动选择代码", "Copy failed"));
    }
  };

  const downloadCode = () => {
    const blobUrl = URL.createObjectURL(
      new Blob([code], { type: "text/x-python;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = normalizedCodeFileName();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    showCodeActionStatus(lt("已开始下载", "Download started"));
  };

  const pushStreamCode = (nextCode: string) => {
    streamBufferRef.current = nextCode;
    if (streamFrameRef.current !== null) return;
    streamFrameRef.current = window.requestAnimationFrame(() => {
      streamFrameRef.current = null;
      setCode(streamBufferRef.current);
    });
  };

  const applyTurtleTemplate = () => {
    setPrompt(
      "海龟策略：20日唐奇安通道突破买入，10日通道跌破卖出，使用ATR计算止损和仓位，包含止盈止损、日志输出和on_bar调试入口。",
    );
    setBuyCondition("20日唐奇安通道突破");
    setSellCondition("10日唐奇安通道跌破");
    setHoldingPeriod(null);
  };

  const stripPythonCodeFence = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("```python")) {
      return trimmed.replace(/^```python\s*/i, "").replace(/```$/i, "").trim();
    }
    if (trimmed.startsWith("```")) {
      return trimmed.replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    }
    return raw;
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setOutputTab("python");
    setRunLogs((logs) => [...logs, "开始流式生成策略代码..."]);
    setChatHistory((h) => [...h, { role: "user", text: prompt }]);
    setGenerating(true);
    setTestResult(null);
    setCode("");
    streamBufferRef.current = "";
    let streamedCode = "";
    try {
      const factorSpecs = buildStrategyFactorSpecs();
      const payload = {
        prompt: `${prompt}\n\n当前研究市场：${definition.labelZh}（${market}）。工作流要求：先由已选择的因子形成候选股票池，策略代码只负责在候选股票池内判断买入、卖出、仓位和风控。${selectedFactors.length ? `当前股票池因子：${selectedFactors.map((factor) => factor.display_name || factor.name).join("、")}；运行参数：${JSON.stringify(factorSpecs.map((spec) => ({ name: spec.display_name || spec.name, params: spec.params, min: spec.filter_min, max: spec.filter_max })))}。` : "当前未选择因子，代码可按当前市场全量股票逻辑运行。"}`,
        market,
        buy_condition: buyCondition,
        sell_condition: sellCondition || undefined,
        profit_target: profitTarget,
        stop_loss: stopLoss,
        holding_period: holdingPeriod || undefined,
        model: strategyModel || undefined,
        factor_ids: selectedFactorIds,
        factor_specs: factorSpecs,
      };
      await (api as any).generateStrategyStream(payload, {
        onDelta: (delta: string) => {
          streamedCode += delta;
          pushStreamCode(streamedCode);
        },
        onEvent: (event: any) => {
          if (event?.type === "status" && event.message) {
            setRunLogs((logs) => [...logs, event.message]);
          }
        },
      });
      if (streamFrameRef.current !== null) {
        window.cancelAnimationFrame(streamFrameRef.current);
        streamFrameRef.current = null;
      }
      streamBufferRef.current = streamedCode;
      const cleaned = stripPythonCodeFence(streamedCode);
      if (cleaned !== streamedCode) {
        streamedCode = cleaned;
        streamBufferRef.current = cleaned;
        setCode(cleaned);
      } else {
        setCode(streamedCode);
      }
      setRunLogs((logs) => [
        ...logs,
        `生成完成：${streamedCode.length} 字符，股票池因子=${selectedFactorIds.length} 个，buy=${buyCondition}, sell=${sellCondition || "自动"}, tp=${profitTarget}%, sl=${stopLoss}%`,
      ]);
      setChatHistory((h) => [
        ...h,
        {
          role: "ai",
          text: `策略代码已生成。股票池由 ${selectedFactorIds.length} 个因子过滤；代码负责买入、卖出、仓位和风控。买入条件：${buyCondition}，卖出条件：${sellCondition || "代码自动判断"}，止盈 ${profitTarget}%，止损 ${stopLoss}%。`,
        },
      ]);
    } catch (e: any) {
      setRunLogs((logs) => [...logs, `生成失败：${e.message}`]);
      setChatHistory((h) => [
        ...h,
        { role: "ai", text: `生成失败：${e.message}` },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const testCode = async () => {
    setRunLogs((logs) => [...logs, "开始测试策略..."]);
    const r: any = await (api as any)
      .testStrategy({ name: "test", code })
      .catch((e: any) => ({ status: "error", message: e.message }));
    setTestResult(r);
    setRunLogs((logs) => [...logs, `测试结果：${r.status} - ${r.message}`]);
  };

  const saveCode = async () => {
    if (!saveName.trim()) return;
    setRunLogs((logs) => [...logs, `保存策略：${saveName}`]);
    setSaving(true);
    try {
      const factorSpecs = buildStrategyFactorSpecs();
      await (api as any).saveStrategy({
        name: saveName,
        code,
        params_json: JSON.stringify({
          stock_pool_mode: selectedFactorIds.length ? "factor_pool" : "full_market",
          market,
          factor_ids: selectedFactorIds,
          factor_specs: factorSpecs,
          buy_condition: buyCondition,
          sell_condition: sellCondition || "code",
          profit_target: profitTarget,
          stop_loss: stopLoss,
          holding_period_days: holdingPeriod,
        }),
        factor_ids: selectedFactorIds,
      });
      const list: any = await (api as any).listStrategies();
      setSavedList(Array.isArray(list) ? list : []);
      setSaveName("");
      setRunLogs((logs) => [
        ...logs,
        `保存成功，关联因子 ${selectedFactorIds.length} 个`,
      ]);
    } catch {
      setRunLogs((logs) => [...logs, "保存失败"]);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    setPoolRows([]);
    setPoolTotal(0);
    setPoolDate("");
    setShowPoolModal(false);
    setPoolStatus(
      lt(
        `已切换至${definition.labelZh}，请重新预览因子股票池。`,
        `Switched to ${definition.labelEn}; rebuild the factor pool.`,
      ),
    );
  }, [market]);

  const createLibraryStrategy = () => {
    if (!newStrategyName.trim()) return;
    const group = newGroupName.trim() || "Custom";
    setLibraryItems((items) => [
      {
        id: `local-${Date.now()}`,
        name: newStrategyName.trim(),
        desc: newStrategyDesc.trim() || "Custom strategy",
        status: "draft",
        time: "just now",
        group,
        source: "local",
      },
      ...items,
    ]);
    setSelectedGroup("ALL");
    setNewStrategyName("");
    setNewStrategyDesc("");
    setNewGroupName("");
    setRunLogs((logs) => [...logs, `策略库新增策略：${newStrategyName}`]);
  };

  const renameLibraryStrategy = (id: string) => {
    const current = libraryItems.find((item) => item.id === id);
    if (!current) return;
    const name = window.prompt(lt("新的策略名称", "New strategy name"), current.name);
    if (!name || !name.trim()) return;
    setLibraryItems((items) =>
      items.map((item) => (item.id === id ? { ...item, name: name.trim() } : item)),
    );
  };

  const regroupLibraryStrategy = (id: string) => {
    const current = libraryItems.find((item) => item.id === id);
    if (!current) return;
    const group = window.prompt(lt("新的分组名称", "New group name"), current.group);
    if (!group || !group.trim()) return;
    setLibraryItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, group: group.trim(), time: "just now" } : item,
      ),
    );
  };

  const deleteLibraryStrategy = (id: string) => {
    setLibraryItems((items) => items.filter((item) => item.id !== id));
  };

  // Syntax highlight helper for the code block
  const highlightCode = (raw: string) => {
    return raw
      .replace(/(#.*$)/gm, '<span class="comment">$1</span>')
      .replace(
        /\b(def|class|return|if|else|elif|for|in|import|from|and|or|not|None|True|False|self|while|with|as|try|except|finally|raise|yield|lambda|pass|break|continue|global|nonlocal|assert|del|async|await)\b/g,
        '<span class="keyword">$1</span>',
      )
      .replace(/\b(\w+)(?=\s*\()/g, '<span class="function">$1</span>')
      .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="string">$&</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="number">$1</span>');
  };

  return (
    <div className="strategy-page">
      {/* ─── Left Sidebar: Strategy Library ─── */}
      {!libraryCollapsed && <aside className="strategy-sidebar">
        <div className="strategy-sidebar-header">
          <h3>{lt("策略库", "STRATEGY LIBRARY")}</h3>
        </div>

        <div className="strategy-sidebar-controls" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-light)" }}>
          <input
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            placeholder={lt("搜索策略...", "Search strategy...")}
            className="figma-input"
            style={{ width: "100%", fontSize: 12, marginBottom: 8 }}
          />
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="figma-input"
            style={{ width: "100%", fontSize: 12, marginBottom: 8 }}
          >
            {groupOptions.map((group) => (
              <option key={group} value={group}>
                {group === "ALL" ? lt("全部分组", "All Groups") : group}
              </option>
            ))}
          </select>
        </div>

        <div className="strategy-list">
          {filteredLibraryItems.map((s, i) => (
            <div
              key={s.id}
              className={`strategy-item${activeSidebarItem === i ? " active" : ""}`}
              onClick={() => void loadSavedStrategy(s, i)}
            >
              <div
                className="strategy-item-header"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className={`strategy-item-status ${s.status}`}>
                  {s.status}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {s.time}
                </span>
              </div>
              <div className="strategy-item-name">{s.name}</div>
              <div className="strategy-item-desc">{s.desc}</div>
              <div className="strategy-item-desc" style={{ marginTop: 6 }}>
                Group: {s.group}
              </div>
            </div>
          ))}
        </div>

        <div className="strategy-sidebar-footer" style={{ padding: "16px" }}>
          <button
            className="figma-btn figma-btn-primary"
            style={{ width: "100%", letterSpacing: "0.1em", fontSize: 12 }}
            onClick={() => {
              setPrompt("");
              setCode("# Click 'GENERATE STRATEGY' to begin\n");
              setShowLibraryManager(true);
            }}
          >
            {lt("新建策略", "NEW STRATEGY")}
          </button>
        </div>
      </aside>}

      {/* ─── Main Area ─── */}
      <main className="strategy-main">
        {/* Header */}
        <div className="strategy-header">
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 400,
                color: "var(--text-primary)",
                margin: 0,
                fontFamily: "var(--font-display)",
              }}
            >
              {lt("AI 策略工作台", "AI Strategy Workbench")}
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                margin: "4px 0 0",
              }}
            >
              {lt(
                "先用因子形成股票池，再用策略代码执行买入、卖出、仓位和风控。",
                "Factor pool first, strategy code handles trading and risk.",
              )}
            </p>
          </div>
          <div className="strategy-header-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="strategy-panel-toggle"
              onClick={() => setLibraryCollapsed((value) => !value)}
              title={libraryCollapsed ? lt("展开策略库", "Show strategy library") : lt("隐藏策略库", "Hide strategy library")}
              aria-label={libraryCollapsed ? lt("展开策略库", "Show strategy library") : lt("隐藏策略库", "Hide strategy library")}
            >
              {libraryCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button
              type="button"
              className="strategy-panel-toggle"
              onClick={() => setWorkbenchCollapsed((value) => !value)}
              title={workbenchCollapsed ? lt("展开 AI 工作台", "Show AI workbench") : lt("隐藏 AI 工作台", "Hide AI workbench")}
              aria-label={workbenchCollapsed ? lt("展开 AI 工作台", "Show AI workbench") : lt("隐藏 AI 工作台", "Hide AI workbench")}
            >
              {workbenchCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
            </button>
            <button
              type="button"
              className={`strategy-panel-toggle ${ideMode ? "active" : ""}`}
              onClick={toggleIdeMode}
              title={ideMode ? lt("退出 IDE 模式", "Exit IDE mode") : lt("进入 IDE 模式", "Enter IDE mode")}
              aria-label={ideMode ? lt("退出 IDE 模式", "Exit IDE mode") : lt("进入 IDE 模式", "Enter IDE mode")}
            >
              {ideMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <span className="figma-status-dot green" />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#10B981" }}>
              {lt("引擎已连接", "Engine Connected")}
            </span>
          </div>
        </div>

        {/* Split Workspace */}
        <div className={`strategy-workspace ${workbenchCollapsed ? "workbench-collapsed" : ""} ${ideMode ? "ide-mode" : ""}`}>
          {/* ─── Left Panel: Input ─── */}
          {!workbenchCollapsed && <div className="strategy-input-panel">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                }}
              >
                {lt("策略描述", "STRATEGY DESCRIPTION")}
              </label>
              <button
                type="button"
                className="figma-btn figma-btn-sm"
                onClick={applyTurtleTemplate}
                style={{ fontSize: 12 }}
              >
                {lt("加载模板", "Load Template")}
              </button>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
                placeholder={lt("请输入你的策略逻辑...", "Describe your strategy logic here...")}
              className="figma-input"
              style={{
                width: "100%",
                minHeight: 120,
                resize: "none",
                marginBottom: 16,
              }}
            />
            <div className="strategy-save-row" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={lt("策略名称...", "Strategy name...")}
                className="figma-input"
                style={{ flex: 1, fontSize: 13 }}
              />
              <button
                type="button"
                className="figma-btn"
                onClick={saveCode}
                disabled={saving || !saveName.trim() || !code.trim()}
                style={{ fontSize: 11, letterSpacing: "0.05em", minWidth: 112 }}
              >
                {saving ? lt("保存中...", "SAVING...") : lt("保存策略", "SAVE STRATEGY")}
              </button>
            </div>

            {/* Parameter controls */}
            <div
              className="strategy-parameter-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 24,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                    {lt("买入条件", "Buy Condition")}
                </label>
                <input
                  list="strategy-factor-conditions"
                  value={buyCondition}
                  onChange={(e) => setBuyCondition(e.target.value)}
                  className="figma-input"
                  style={{ width: "100%", fontSize: 13 }}
                />
                <datalist id="strategy-factor-conditions">
                  {factorConditionOptions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                    {lt("持有周期（天，可选）", "Holding Period (days, optional)")}
                </label>
                <input
                  type="number"
                  min={1}
                  value={holdingPeriod ?? ""}
                  onChange={(e) => setHoldingPeriod(e.target.value ? Number(e.target.value) : null)}
                  className="figma-input"
                  placeholder={lt("留空则由代码自动买卖", "Blank = code decides")}
                  style={{ width: "100%", fontSize: 13 }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  {lt("卖出条件", "Sell Condition")}
                </label>
                <input
                  list="strategy-factor-conditions"
                  value={sellCondition}
                  onChange={(e) => setSellCondition(e.target.value)}
                  className="figma-input"
                  placeholder={lt("留空则由代码结合止盈止损自动判断", "Blank = code decides")}
                  style={{ width: "100%", fontSize: 13 }}
                />
              </div>
              <AiModelInput
                label={lt("生成模型", "Generation Model")}
                selectedModel={strategyModel}
                modelOptions={modelOptions}
                onChange={setStrategyModel}
                inputStyle={{ width: "100%", fontSize: 13 }}
              />
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--text-muted)",
                    }}
                  >
                    {lt("止盈目标", "Profit Target")}
                  </label>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      color: "var(--primary)",
                    }}
                  >
                    {profitTarget}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={500}
                  step={1}
                  value={profitTarget}
                  onChange={(e) => setProfitTarget(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--primary)" }}
                />
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--text-muted)",
                    }}
                  >
                    {lt("止损", "Stop Loss")}
                  </label>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      color: "#EF4444",
                    }}
                  >
                    {stopLoss}%
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={99}
                  step={1}
                  value={stopLoss}
                  onChange={(e) => setStopLoss(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#EF4444" }}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--text-muted)",
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      {lt("因子股票池", "Factor Stock Pool")}
                    </label>
                    <p style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--text-muted)" }}>
                      {lt(
                        "先用因子筛出候选股票池，策略代码只在该股票池中判断买入、卖出、仓位和风控。",
                        "Factors build the candidate pool; code decides buy, sell, sizing and risk.",
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="figma-btn figma-btn-sm"
                    onClick={previewFactorPool}
                    disabled={poolLoading || selectedFactorIds.length === 0}
                    style={{ fontSize: 11, whiteSpace: "nowrap" }}
                  >
                    {poolLoading
                      ? lt("生成中...", "Building...")
                      : lt("预览股票池", "Preview Pool")}
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {factorOptions.map((factor) => {
                      const active = selectedFactorIds.includes(factor.id);
                      return (
                        <button
                          key={factor.id}
                          type="button"
                          onClick={() => toggleFactor(factor.id)}
                          className={`figma-btn figma-btn-sm ${active ? "figma-btn-primary" : ""}`}
                          style={{ fontSize: 11 }}
                        >
                          {factor.display_name || factor.name}
                          {factor.is_builtin === 1 ? ` ${lt("预置", "Builtin")}` : ""}
                        </button>
                      );
                    })}
                    {factorOptions.length === 0 && (
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {lt("暂无因子，先到因子挖掘页创建或初始化预置因子", "No factors yet")}
                      </span>
                    )}
                </div>
                {selectedFactors.length > 0 && (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {selectedFactors.map((factor) => {
                      const params = parseFactorParamDefs(factor.params_json);
                      const override = getFactorOverride(factor);
                      const isBoolean = (factor.output_type || "scalar") === "boolean";
                      return (
                        <div
                          key={`factor-runtime-${factor.id}`}
                          style={{
                            border: "1px solid var(--border-light)",
                            borderRadius: "var(--radius-md)",
                            background: "var(--bg-white)",
                            padding: 10,
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 800,
                                color: "var(--text-primary)",
                              }}
                            >
                              {factor.display_name || factor.name}
                              {factor.is_builtin === 1 ? ` · ${lt("预置因子", "Builtin")}` : ""}
                            </span>
                            <button
                              type="button"
                              className="figma-btn figma-btn-sm"
                              onClick={() => resetFactorOverride(factor)}
                              style={{ fontSize: 11, padding: "5px 8px" }}
                            >
                              {lt("恢复默认", "Reset")}
                            </button>
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
                              gap: 8,
                            }}
                          >
                            {params.map((param) => (
                              <label
                                key={`${factor.id}-${param.name}`}
                                style={{ display: "grid", gap: 4, minWidth: 0 }}
                              >
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "var(--text-muted)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={param.name}
                                >
                                  {param.label || param.name}
                                </span>
                                <input
                                  type="number"
                                  value={override.params[param.name] ?? ""}
                                  min={param.min}
                                  max={param.max}
                                  step={param.step || 1}
                                  onChange={(e) =>
                                    updateFactorParam(
                                      factor,
                                      param.name,
                                      Number(e.target.value || 0),
                                    )
                                  }
                                  style={{
                                    width: "100%",
                                    minWidth: 0,
                                    padding: "7px 8px",
                                    border: "1px solid var(--border-light)",
                                    borderRadius: "var(--radius-sm)",
                                    fontSize: 12,
                                    fontFamily: "var(--font-mono)",
                                  }}
                                />
                              </label>
                            ))}
                            {!params.length && (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "var(--text-muted)",
                                  alignSelf: "end",
                                  paddingBottom: 8,
                                }}
                              >
                                {lt("该因子无可调参数", "No tunable parameters")}
                              </span>
                            )}
                            {!isBoolean && (
                              <>
                                <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
                                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                    {lt("过滤下限", "Filter Min")}
                                  </span>
                                  <input
                                    type="number"
                                    value={override.filter_min ?? ""}
                                    onChange={(e) =>
                                      updateFactorFilter(
                                        factor,
                                        "filter_min",
                                        e.target.value ? Number(e.target.value) : null,
                                      )
                                    }
                                    style={{
                                      width: "100%",
                                      minWidth: 0,
                                      padding: "7px 8px",
                                      border: "1px solid var(--border-light)",
                                      borderRadius: "var(--radius-sm)",
                                      fontSize: 12,
                                      fontFamily: "var(--font-mono)",
                                    }}
                                  />
                                </label>
                                <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
                                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                    {lt("过滤上限", "Filter Max")}
                                  </span>
                                  <input
                                    type="number"
                                    value={override.filter_max ?? ""}
                                    onChange={(e) =>
                                      updateFactorFilter(
                                        factor,
                                        "filter_max",
                                        e.target.value ? Number(e.target.value) : null,
                                      )
                                    }
                                    style={{
                                      width: "100%",
                                      minWidth: 0,
                                      padding: "7px 8px",
                                      border: "1px solid var(--border-light)",
                                      borderRadius: "var(--radius-sm)",
                                      fontSize: 12,
                                      fontFamily: "var(--font-mono)",
                                    }}
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div
                  role={poolRows.length ? "button" : undefined}
                  tabIndex={poolRows.length ? 0 : undefined}
                  onClick={() => {
                    if (poolRows.length) setShowPoolModal(true);
                  }}
                  onKeyDown={(e) => {
                    if (poolRows.length && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setShowPoolModal(true);
                    }
                  }}
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-lg)",
                    background: "var(--bg-page)",
                    cursor: poolRows.length ? "pointer" : "default",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      marginBottom: poolRows.length ? 8 : 0,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {selectedFactors.length
                        ? lt(
                            `已选择 ${selectedFactors.length} 个因子${poolTotal ? `，股票池 ${poolTotal} 只` : ""}`,
                            `${selectedFactors.length} factors selected`,
                          )
                        : lt("未选择因子时，策略将在全市场数据上执行。", "No factor pool selected")}
                      {poolDate ? ` · ${poolDate}` : ""}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {poolRows.length
                        ? lt("点击查看全部", "View all")
                        : lt("AND 逻辑", "AND logic")}
                    </span>
                  </div>
                  {poolStatus && (
                    <p style={{ margin: poolRows.length ? "0 0 8px" : 0, fontSize: 12, color: "var(--text-muted)", lineHeight: "18px" }}>
                      {poolStatus}
                    </p>
                  )}
                  {poolRows.length > 0 && (
                    <div style={{ display: "grid", gap: 6 }}>
                      {displayedPoolRows.map((row) => (
                        <div
                          key={row.code}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "76px minmax(0, 1fr) 72px 58px",
                            gap: 8,
                            alignItems: "center",
                            fontSize: 12,
                            minHeight: 28,
                          }}
                        >
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{row.code}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)", fontWeight: 700 }}>
                            {row.name || "--"}
                            {row.industry ? ` · ${row.industry}` : ""}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                            {typeof row.price === "number" ? row.price.toFixed(2) : "--"}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              color: Number(row.change_pct || 0) >= 0 ? "var(--market-up)" : "var(--market-down)",
                              textAlign: "right",
                            }}
                          >
                            {typeof row.change_pct === "number" ? `${row.change_pct >= 0 ? "+" : ""}${row.change_pct.toFixed(2)}%` : "--"}
                          </span>
                        </div>
                      ))}
                      {poolRows.length > displayedPoolRows.length && (
                        <div
                          style={{
                            marginTop: 2,
                            paddingTop: 6,
                            borderTop: "1px dashed var(--border-light)",
                            fontSize: 12,
                            color: "var(--primary)",
                            fontWeight: 700,
                          }}
                        >
                          {lt(
                            `默认展示 5 只，点击查看全部 ${poolRows.length} 只筛选股票`,
                            `Showing 5. Click to view all ${poolRows.length} stocks`,
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                className="figma-btn"
                style={{ flex: 1, fontSize: 11, letterSpacing: "0.1em" }}
                onClick={testCode}
              >
                {lt("测试策略", "TEST STRATEGY")}
              </button>
              <button
                type="button"
                className="figma-btn"
                style={{ flex: 1, fontSize: 11, letterSpacing: "0.1em" }}
                onClick={() => setPrompt("")}
              >
                {lt("清空", "CLEAR")}
              </button>
              <button
                type="button"
                className="figma-btn figma-btn-primary"
                style={{ flex: 1, fontSize: 11, letterSpacing: "0.1em" }}
                onClick={generate}
                disabled={generating || !prompt.trim()}
              >
                {generating && <span className="strategy-inline-spinner" />}
                {generating ? lt("生成中...", "GENERATING...") : lt("生成策略 · 50积分", "GENERATE STRATEGY · 50 CREDITS")}
              </button>
            </div>

            {/* Generating indicator */}
            {generating && (
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--primary)",
                }}
              >
                <div className="strategy-inline-spinner" />
                AI 正在生成策略代码...
              </div>
            )}

            {/* Test result */}
            {testResult && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  background:
                    testResult.status === "ok"
                      ? "rgba(16,185,129,0.1)"
                      : "rgba(239,68,68,0.1)",
                  color: testResult.status === "ok" ? "#10B981" : "#EF4444",
                }}
              >
                {testResult.message}
              </div>
            )}

            {/* Quick strategy chips */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              {STRATEGY_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  onClick={() =>
                    t.key === "turtle"
                      ? applyTurtleTemplate()
                      : setPrompt(lt(`${t.label}策略`, `${t.labelEn} strategy`))
                  }
                  className="figma-btn figma-btn-sm"
                  style={{ fontSize: 11 }}
                >
                  {lt(t.label, t.labelEn)}
                </button>
              ))}
            </div>
          </div>}

          {/* ─── Right Panel: Code Output ─── */}
          <div className={`strategy-output-panel ${ideMode ? "ide-mode" : ""}`}>
            {/* Tabs */}
            <div className="figma-tabs" style={{ marginBottom: 20 }}>
              <button
                type="button"
                className={`figma-tab${outputTab === "python" ? " active" : ""}`}
                onClick={() => setOutputTab("python")}
              >
                {lt("Python 策略代码", "PYTHON STRATEGY CODE")}
              </button>
              <button
                type="button"
                className={`figma-tab${outputTab === "config" ? " active" : ""}`}
                onClick={() => setOutputTab("config")}
              >
                {lt("配置 JSON", "CONFIGURATION JSON")}
              </button>
            </div>

            {/* Code Block */}
            <div className="strategy-code-block">
              {outputTab === "python" ? (
                <div className="strategy-python-stack">
                  <div className="strategy-python-code">
                    <div className="strategy-editor-shell">
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "rgba(255,255,255,0.04)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flex: "0 0 auto",
                        }}
                      >
                        <input
                          value={codeFileName}
                          onChange={(e) => setCodeFileName(e.target.value)}
                          onBlur={() => setCodeFileName(normalizedCodeFileName())}
                          aria-label={lt("策略代码文件名", "Strategy code filename")}
                          className="strategy-code-filename"
                        />
                        <div style={{ display: "flex", gap: 12 }}>
                          {generating && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                color: "#60a5fa",
                                fontSize: 12,
                              }}
                            >
                              <span className="strategy-inline-spinner" />
                              {lt("流式写入", "Streaming")}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={copyCode}
                            style={{
                              background: "none",
                              border: "none",
                              fontSize: 12,
                              color: "#9ca3af",
                              cursor: "pointer",
                            }}
                          >
                            {lt("复制", "Copy")}
                          </button>
                          <button
                            type="button"
                            onClick={downloadCode}
                            style={{
                              background: "none",
                              border: "none",
                              fontSize: 12,
                              color: "#9ca3af",
                              cursor: "pointer",
                            }}
                          >
                            {lt("下载", "Download")}
                          </button>
                        </div>
                      </div>
                      {codeActionStatus && (
                        <div className="strategy-code-action-status">
                          {codeActionStatus}
                        </div>
                      )}
                      <div className="strategy-code-toolbar">
                        <label className="strategy-code-tool-input">
                          <Search size={14} />
                          <input
                            value={codeSearch}
                            onChange={(e) => setCodeSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                focusSearchMatch(codeSearchIndex + (e.shiftKey ? -1 : 1));
                              }
                            }}
                            placeholder={lt("搜索代码", "Search code")}
                          />
                        </label>
                        <label className="strategy-code-tool-input">
                          <Replace size={14} />
                          <input
                            value={codeReplace}
                            onChange={(e) => setCodeReplace(e.target.value)}
                            placeholder={lt("替换为", "Replace with")}
                          />
                        </label>
                        <span className="strategy-code-match-count">
                          {codeSearch
                            ? `${codeSearchMatches.length ? codeSearchIndex + 1 : 0}/${codeSearchMatches.length}`
                            : "0/0"}
                        </span>
                        <button
                          type="button"
                          className="strategy-code-tool-btn"
                          onClick={() => focusSearchMatch(codeSearchIndex - 1)}
                          disabled={!codeSearchMatches.length}
                        >
                          {lt("上一个", "Prev")}
                        </button>
                        <button
                          type="button"
                          className="strategy-code-tool-btn"
                          onClick={() => focusSearchMatch(codeSearchIndex + 1)}
                          disabled={!codeSearchMatches.length}
                        >
                          {lt("下一个", "Next")}
                        </button>
                        <button
                          type="button"
                          className="strategy-code-tool-btn"
                          onClick={replaceCurrentMatch}
                          disabled={!codeSearchMatches.length}
                        >
                          {lt("替换", "Replace")}
                        </button>
                        <button
                          type="button"
                          className="strategy-code-tool-btn"
                          onClick={replaceAllMatches}
                          disabled={!codeSearchMatches.length}
                        >
                          {lt("全部替换", "Replace All")}
                        </button>
                      </div>
                      <div className="strategy-editor-body">
                        <div className="strategy-editor-frame">
                          <CodeMirror
                            value={code}
                            onChange={setCode}
                            onCreateEditor={(view) => {
                              editorViewRef.current = view;
                            }}
                            extensions={[python()]}
                            theme={oneDark}
                            basicSetup={{ lineNumbers: true, foldGutter: true }}
                            height="100%"
                            style={{ fontSize: 12, height: "100%" }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="strategy-python-log">
                    <div className="strategy-python-log-title">{lt("运行日志", "RUNTIME LOG")}</div>
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        color: "#9ca3af",
                        fontSize: 12,
                        lineHeight: "18px",
                      }}
                    >
                      {runLogs.join("\n")}
                    </pre>
                  </div>
                </div>
              ) : (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  <code className="comment">
                    {JSON.stringify(
                       {
                          strategy_name: "RSI Momentum Breakout",
                          buy_condition: buyCondition,
                          sell_condition: sellCondition || "auto",
                          profit_target: profitTarget,
                          stop_loss: stopLoss,
                          holding_period_days: holdingPeriod,
                          model: strategyModel,
                          stock_pool_mode: selectedFactorIds.length ? "factor_pool" : "full_market",
                          factor_ids: selectedFactorIds,
                          factor_names: selectedFactors.map((factor) => factor.display_name || factor.name),
                          factor_specs: buildStrategyFactorSpecs(),
                          preview_pool_total: poolTotal,
                          status: "active",
                      },
                      null,
                      2,
                    )}
                  </code>
                </pre>
              )}
            </div>
          </div>
        </div>
      </main>

      {showPoolModal && (
        <div className="strategy-modal-mask" onClick={() => setShowPoolModal(false)}>
          <div
            className="strategy-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(860px, calc(100vw - 32px))" }}
          >
            <div className="strategy-modal-header">
              <div>
                <h3>{lt("因子股票池明细", "Factor Pool Details")}</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                  {lt(
                    `共 ${poolTotal || poolRows.length} 只 · 当前显示 ${poolRows.length} 只 · ${poolDate || "--"}`,
                    `${poolRows.length} stocks · ${poolDate || "--"}`,
                  )}
                </p>
              </div>
              <button
                type="button"
                className="figma-btn figma-btn-sm"
                onClick={() => setShowPoolModal(false)}
              >
                {lt("关闭", "Close")}
              </button>
            </div>
            <div className="strategy-modal-body" style={{ display: "block", overflowX: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "86px minmax(140px, 1.4fr) minmax(100px, 1fr) 82px 82px 72px",
                  gap: 10,
                  minWidth: 640,
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border-light)",
                  color: "var(--text-muted)",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                <span>{lt("代码", "Code")}</span>
                <span>{lt("名称", "Name")}</span>
                <span>{lt("行业/板块", "Industry")}</span>
                <span>{lt("价格", "Price")}</span>
                <span>{lt("涨跌幅", "Change")}</span>
                <span>{lt("评分", "Score")}</span>
              </div>
              <div style={{ maxHeight: "58vh", overflowY: "auto" }}>
                {poolRows.map((row) => (
                  <div
                    key={`pool-modal-${row.code}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "86px minmax(140px, 1.4fr) minmax(100px, 1fr) 82px 82px 72px",
                      gap: 10,
                      minWidth: 640,
                      alignItems: "center",
                      minHeight: 38,
                      padding: "8px 10px",
                      borderBottom: "1px solid var(--border-light)",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{row.code}</span>
                    <span style={{ fontWeight: 800, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name || "--"}
                    </span>
                    <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.industry || row.board || "--"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      {typeof row.price === "number" ? row.price.toFixed(2) : "--"}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: Number(row.change_pct || 0) >= 0 ? "var(--market-up)" : "var(--market-down)",
                      }}
                    >
                      {typeof row.change_pct === "number" ? `${row.change_pct >= 0 ? "+" : ""}${row.change_pct.toFixed(2)}%` : "--"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--primary)", fontWeight: 800 }}>
                      {typeof row.score === "number" ? row.score.toFixed(1) : "--"}
                    </span>
                  </div>
                ))}
                {!poolRows.length && (
                  <div style={{ padding: 18, color: "var(--text-muted)", fontSize: 13 }}>
                    {lt("暂无股票池结果，请先预览股票池。", "No pool results yet.")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showLibraryManager && (
        <div className="strategy-modal-mask" onClick={() => setShowLibraryManager(false)}>
          <div
            className="strategy-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="strategy-modal-header">
              <h3>{lt("策略管理", "Strategy Manager")}</h3>
              <button
                className="figma-btn figma-btn-sm"
                onClick={() => setShowLibraryManager(false)}
              >
                {lt("关闭", "Close")}
              </button>
            </div>
            <div className="strategy-modal-body">
              <div className="strategy-modal-create">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={lt("分组名称", "Group name")}
                  className="figma-input"
                  style={{ width: "100%", fontSize: 12, marginBottom: 8 }}
                />
                <input
                  value={newStrategyName}
                  onChange={(e) => setNewStrategyName(e.target.value)}
                  placeholder={lt("新策略名称", "New strategy name")}
                  className="figma-input"
                  style={{ width: "100%", fontSize: 12, marginBottom: 8 }}
                />
                <input
                  value={newStrategyDesc}
                  onChange={(e) => setNewStrategyDesc(e.target.value)}
                  placeholder={lt("描述", "Description")}
                  className="figma-input"
                  style={{ width: "100%", fontSize: 12, marginBottom: 8 }}
                />
                <button
                  className="figma-btn figma-btn-primary"
                  onClick={createLibraryStrategy}
                  style={{ width: "100%", fontSize: 11, letterSpacing: "0.08em" }}
                  disabled={!newStrategyName.trim()}
                >
                  {lt("创建策略", "CREATE STRATEGY")}
                </button>
              </div>
              <div className="strategy-modal-list">
                {libraryItems.map((item) => (
                  <div key={item.id} className="strategy-item">
                    <div className="strategy-item-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className={`strategy-item-status ${item.status}`}>{item.status}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.time}</span>
                    </div>
                    <div className="strategy-item-name">{item.name}</div>
                    <div className="strategy-item-desc">{item.desc}</div>
                    <div className="strategy-item-desc" style={{ marginTop: 6 }}>{lt("分组", "Group")}: {item.group}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className="figma-btn figma-btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => renameLibraryStrategy(item.id)}>
                        {lt("重命名", "Rename")}
                      </button>
                      <button className="figma-btn figma-btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => regroupLibraryStrategy(item.id)}>
                        {lt("分组", "Group")}
                      </button>
                      <button className="figma-btn figma-btn-sm" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => deleteLibraryStrategy(item.id)}>
                        {lt("删除", "Delete")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
