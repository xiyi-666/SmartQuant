import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Converter } from "opencc-js/cn2t";

export type Lang = "zh" | "en";
export type LanguageMode = Lang | "zh-TW";
export const LANGUAGE_SELECT_OPTIONS: Array<{ value: LanguageMode; label: string }> = [
  { value: "zh", label: "简体中文" },
  { value: "zh-TW", label: "繁体中文" },
  { value: "en", label: "English" },
];

type LanguageContextValue = {
  lang: Lang;
  languageMode: LanguageMode;
  isTraditional: boolean;
  setLanguageMode: (next: LanguageMode) => void;
  toggleLang: () => void;
  t: (key: string) => string;
};

const TEXT: Record<Lang, Record<string, string>> = {
  zh: {
    brandName: "QaurtSmart",
    documentTitle: "QaurtSmart | 自部署量化研究与模拟交易平台",
    marketOpen: "市场：开盘",
    dashboard: "行情数据",
    aiInsights: "AI 洞察",
    screener: "选股器",
    quote: "股票详情",
    smartResearch: "智能研究",
    agentAnalysis: "AI 分析师",
    strategyAi: "策略研究",
    factorMining: "因子挖掘",
    backtesting: "回测分析",
    riskMonitor: "风控监控",
    trading: "交易终端",
    revenue: "收益分析",
    analytics: "网站数据统计",
    tokenCost: "Token 成本",
    settings: "系统设置",
    newStrategy: "新建策略",
    support: "支持",
    logs: "日志",
    systemActive: "自部署工作区",
    logout: "退出登录",
    loginTitle: "系统登录",
    loginHint: "默认账号：admin / admin",
    username: "用户名或邮箱",
    password: "密码",
    loginBtn: "登录并进入面板",
    apiOffline: "后端不可达",
    apiOnline: "后端在线",
    langBtn: "繁",
    aiAssistant: "量化投研助手",
    aiHint: "可选的自有 AI 扩展",

    // 因子挖掘页面翻译
    factorLibrary: "因子库",
    searchFactors: "搜索因子...",
    searchFactorsPlaceholder: "搜索因子...",
    newFactor: "新建因子",
    builtin: "预置",
    factorName: "因子名称",
    displayName: "显示名",
    category: "分类",
    expression: "表达式",
    factorDescription: "描述",
    descriptionPlaceholder: "因子说明...",
    useDollarForParams: "用 $param 引用参数",
    builtinFunctions: "内置函数",
    parameters: "可调参数",
    addParameter: "添加",
    paramName: "参数名",
    paramLabel: "标签",
    paramDefault: "默认值",
    paramMin: "最小值",
    paramMax: "最大值",
    paramStep: "步长",
    paramType: "类型",
    defaultValue: "默认过滤",
    validateExpression: "验证",
    previewFactor: "预览",
    previewing: "预览中...",
    testFactor: "全量测试",
    testing: "测试中...",
    saveFactor: "保存因子",
    deleteFactor: "删除",
    confirmDeleteFactor: "确认删除此因子？",
    expressionValid: "表达式合法",
    expressionInvalid: "表达式无效",
    hitStocks: "命中股票",
    hitCount: "只命中",
    factorValue: "因子值",
    code: "代码",
    name: "名称",
    stockName: "名称",
    serialNumber: "#",
    applyToScreener: "应用到选股页 →",
    applyToBacktest: "应用到回测分析 →",
    noParamsYet: "暂无参数，点添加或从模板创建",
    simpleMovingAverage: "简单移动平均",
    exponentialMovingAverage: "指数移动平均",
    rateOfChange: "变动率",
    momentum: "动量",
    rsi: "RSI相对强弱",
    stdDeviation: "标准差",
    trueRangeAverage: "真实波幅均值",
    bollingerWidth: "布林带宽度",
    volumeRatio: "量能比",
    onBalanceVolume: "能量潮",
    volumeWeightedPrice: "成交量加权平均价",
    previousValue: "N周期前的值",
    highestValue: "W周期最高值",
    lowestValue: "W周期最低值",
    goldenCross: "金叉(布尔)",
    conditionalIf: "条件选择",
    absoluteValue: "绝对值",
    maximum: "最大值",
    minimum: "最小值",
    rollingSum: "滚动求和",
    arctangent: "反正切(度数)",
    radiansToDegrees: "弧度转角度",
    slope: "N日斜率",
    categoryTechnical: "技术类",
    categoryStatistical: "统计类",
    categoryFundamental: "基本面",
    categoryComposite: "复合类",
    categoryCustom: "自定义",
    outputType: "输出类型",
    scalarType: "数值型",
    booleanType: "布尔型",
  },
  en: {
    brandName: "QaurtSmart",
    documentTitle: "QaurtSmart | Self-hosted Quant Research Platform",
    marketOpen: "Market: OPEN",
    dashboard: "Market Data",
    aiInsights: "AI Insights",
    screener: "Screener",
    quote: "Stock Details",
    smartResearch: "Smart Research",
    agentAnalysis: "AI Analysts",
    strategyAi: "AI Strategy",
    factorMining: "Factor Mining",
    backtesting: "Backtesting",
    riskMonitor: "Risk Monitor",
    trading: "Trading",
    revenue: "Revenue",
    analytics: "Site Analytics",
    tokenCost: "Token Cost",
    settings: "Settings",
    newStrategy: "NEW_STRATEGY",
    support: "Support",
    logs: "Logs",
    systemActive: "System Active",
    logout: "Logout",
    loginTitle: "System Login",
    loginHint: "Default account: admin / admin",
    username: "Username or Email",
    password: "Password",
    loginBtn: "Login to Market Data",
    apiOffline: "Backend offline",
    apiOnline: "Backend online",
    langBtn: "中文",
    aiAssistant: "Quant Research Assistant",
    aiHint: "Drag freely, click to open AI Insights",

    // 因子挖掘页面翻译
    factorLibrary: "Factor Library",
    searchFactors: "Search factors...",
    searchFactorsPlaceholder: "Search factors...",
    newFactor: "New Factor",
    builtin: "Builtin",
    factorName: "Factor Name",
    displayName: "Display Name",
    category: "Category",
    expression: "Expression",
    factorDescription: "Description",
    descriptionPlaceholder: "Factor description...",
    useDollarForParams: "Use $param for variables",
    builtinFunctions: "Functions",
    parameters: "Parameters",
    addParameter: "Add",
    paramName: "Param",
    paramLabel: "Label",
    paramDefault: "Default",
    paramMin: "Min",
    paramMax: "Max",
    paramStep: "Step",
    paramType: "Type",
    defaultValue: "Filter",
    validateExpression: "Validate",
    previewFactor: "Preview",
    previewing: "Previewing...",
    testFactor: "Test All",
    testing: "Testing...",
    saveFactor: "Save",
    deleteFactor: "Delete",
    confirmDeleteFactor: "Confirm delete this factor?",
    expressionValid: "Expression valid",
    expressionInvalid: "Expression invalid",
    hitStocks: "Matched Stocks",
    hitCount: "hit",
    factorValue: "Value",
    code: "Code",
    name: "Name",
    stockName: "Name",
    serialNumber: "#",
    applyToScreener: "Apply to Screener →",
    applyToBacktest: "Apply to Backtest →",
    noParamsYet: "No params yet, add or start from template",
    simpleMovingAverage: "Simple Moving Average",
    exponentialMovingAverage: "Exponential Moving Average",
    rateOfChange: "Rate of Change",
    momentum: "Momentum",
    rsi: "RSI",
    stdDeviation: "Standard Deviation",
    trueRangeAverage: "Average True Range",
    bollingerWidth: "Bollinger Width",
    volumeRatio: "Volume Ratio",
    onBalanceVolume: "On Balance Volume",
    volumeWeightedPrice: "VWAP",
    previousValue: "Previous Value (N)",
    highestValue: "Highest (W)",
    lowestValue: "Lowest (W)",
    goldenCross: "Golden Cross (Bool)",
    conditionalIf: "If Condition",
    absoluteValue: "Absolute",
    maximum: "Maximum",
    minimum: "Minimum",
    rollingSum: "Rolling Sum",
    arctangent: "Arctangent (Degrees)",
    radiansToDegrees: "Radians to Degrees",
    slope: "Slope (N)",
    categoryTechnical: "Technical",
    categoryStatistical: "Statistical",
    categoryFundamental: "Fundamental",
    categoryComposite: "Composite",
    categoryCustom: "Custom",
    outputType: "Output",
    scalarType: "Scalar",
    booleanType: "Boolean",
  },
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

declare global {
  interface Window {
    __QUARTSYS_INITIAL_LANG__?: LanguageMode;
  }
}

const LANGUAGE_SEQUENCE: LanguageMode[] = ["zh", "zh-TW", "en"];

const toTraditional = Converter({ from: "cn", to: "tw" });
const ORIGINAL_TEXT_NODE_VALUES = new WeakMap<Node, string>();
const ORIGINAL_ATTRIBUTE_VALUES = new WeakMap<Element, Map<string, string>>();

export function toTraditionalText(value: string) {
  return toTraditional(String(value || ""));
}

function normalizeLanguageMode(value: unknown): LanguageMode | null {
  if (value === "zh" || value === "zh-TW" || value === "en") return value;
  if (value === "zh-Hant" || value === "tw" || value === "hk") return "zh-TW";
  return null;
}

function baseLang(mode: LanguageMode): Lang {
  return mode === "en" ? "en" : "zh";
}

function modeText(mode: LanguageMode, key: string) {
  if (key === "langBtn") {
    if (mode === "zh") return "繁";
    if (mode === "zh-TW") return "EN";
    return "简";
  }
  const lang = baseLang(mode);
  const raw = TEXT[lang][key] || key;
  if (mode === "zh-TW") return toTraditionalText(raw);
  return raw;
}

function applyDocumentLang(mode: LanguageMode) {
  document.documentElement.lang = mode === "en" ? "en" : mode === "zh-TW" ? "zh-Hant" : "zh-CN";
  document.documentElement.setAttribute("data-lang", mode);
  document.title = modeText(mode, "documentTitle");
}

function getDefaultLanguageMode(): LanguageMode {
  const bootLang = normalizeLanguageMode(window.__QUARTSYS_INITIAL_LANG__);
  if (bootLang) return bootLang;
  try {
    const saved = localStorage.getItem("quartsys_lang");
    const savedMode = normalizeLanguageMode(saved);
    if (savedMode) return savedMode;
  } catch {
    // Keep the app renderable if storage is blocked.
  }
  return "zh";
}

function convertElementAttributes(element: Element) {
  for (const attr of ["title", "aria-label", "placeholder", "alt"]) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    let originalValues = ORIGINAL_ATTRIBUTE_VALUES.get(element);
    if (!originalValues) {
      originalValues = new Map<string, string>();
      ORIGINAL_ATTRIBUTE_VALUES.set(element, originalValues);
    }
    const previousOriginal = originalValues.get(attr);
    const source =
      previousOriginal === undefined || value !== toTraditionalText(previousOriginal)
        ? value
        : previousOriginal;
    originalValues.set(attr, source);
    const translated = toTraditionalText(source);
    if (translated !== value) element.setAttribute(attr, translated);
  }
}

function shouldSkipTextNode(node: Node) {
  const parent = node.parentElement;
  return Boolean(parent?.closest("script,style,noscript,textarea,code,pre"));
}

function convertTextNodeToTraditional(node: Node) {
  if (shouldSkipTextNode(node) || !node.nodeValue) return;
  const value = node.nodeValue;
  const previousOriginal = ORIGINAL_TEXT_NODE_VALUES.get(node);
  const source =
    previousOriginal === undefined || value !== toTraditionalText(previousOriginal)
      ? value
      : previousOriginal;
  ORIGINAL_TEXT_NODE_VALUES.set(node, source);
  const converted = toTraditionalText(source);
  if (converted !== value) node.nodeValue = converted;
}

function convertSubtreeToTraditional(root: ParentNode) {
  if (root instanceof Element) convertElementAttributes(root);
  root.querySelectorAll?.("[title],[aria-label],[placeholder],[alt]").forEach(convertElementAttributes);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    convertTextNodeToTraditional(node);
    node = walker.nextNode();
  }
}

function restoreElementAttributes(element: Element) {
  const originalValues = ORIGINAL_ATTRIBUTE_VALUES.get(element);
  if (!originalValues) return;
  originalValues.forEach((value, attr) => {
    if (element.hasAttribute(attr)) element.setAttribute(attr, value);
  });
  ORIGINAL_ATTRIBUTE_VALUES.delete(element);
}

function restoreTextNodeFromTraditional(node: Node) {
  const original = ORIGINAL_TEXT_NODE_VALUES.get(node);
  if (original !== undefined && node.nodeValue !== original) {
    node.nodeValue = original;
  }
  ORIGINAL_TEXT_NODE_VALUES.delete(node);
}

function restoreSubtreeFromTraditional(root: ParentNode) {
  if (root instanceof Element) restoreElementAttributes(root);
  root.querySelectorAll?.("[title],[aria-label],[placeholder],[alt]").forEach(restoreElementAttributes);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    restoreTextNodeFromTraditional(node);
    node = walker.nextNode();
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [languageMode, setMode] = useState<LanguageMode>(getDefaultLanguageMode);
  const lang = baseLang(languageMode);
  const isTraditional = languageMode === "zh-TW";

  const setLanguageMode = (next: LanguageMode) => {
    if (languageMode === "zh-TW" && next !== "zh-TW") {
      restoreSubtreeFromTraditional(document.body);
    }
    try {
      localStorage.setItem("quartsys_lang", next);
    } catch {
      // Ignore storage failures; the in-memory language still switches.
    }
    applyDocumentLang(next);
    setMode(next);
  };

  useLayoutEffect(() => {
    applyDocumentLang(languageMode);
  }, [languageMode]);

  useEffect(() => {
    if (languageMode !== "zh-TW") return;
    convertSubtreeToTraditional(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData" && mutation.target.nodeValue) {
          convertTextNodeToTraditional(mutation.target);
          return;
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
            convertTextNodeToTraditional(node);
            return;
          }
          if (node instanceof Element) convertSubtreeToTraditional(node);
        });
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          convertElementAttributes(mutation.target);
        }
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder", "alt"],
    });
    return () => observer.disconnect();
  }, [languageMode]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      languageMode,
      isTraditional,
      setLanguageMode,
      toggleLang: () => {
        const currentIndex = LANGUAGE_SEQUENCE.indexOf(languageMode);
        const next = LANGUAGE_SEQUENCE[(currentIndex + 1) % LANGUAGE_SEQUENCE.length];
        setLanguageMode(next);
      },
      t: (key: string) => modeText(languageMode, key),
    }),
    [lang, languageMode, isTraditional],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function useLangText() {
  const { lang, isTraditional } = useLanguage();
  return (zh: string, en: string) => {
    if (lang !== "zh") return en;
    return isTraditional ? toTraditionalText(zh) : zh;
  };
}
