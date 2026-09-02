import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../api";
import { getAuthUser } from "./auth";
import { useLanguage } from "./language";

const MODELS_KEY = "quartsys_llm_models";
const DEFAULT_MODEL_KEY = "quartsys_default_ai_model";
const MODULE_MODELS_KEY = "quartsys_ai_module_models";
const TIER_OPTIONS_KEY = "quartsys_ai_model_tier_options";
const MODEL_EVENT = "quartsys:ai-models-updated";
const DEFAULT_MODEL = "gpt-5.5";
const MODULE_KEYS = [
  "ai_insights",
  "factor_generation",
  "assistant",
  "strategy",
  "risk",
  "smart_research",
  "agent_analysis",
] as const;

export type AiModuleKey = (typeof MODULE_KEYS)[number];
export type AiModuleModels = Partial<Record<AiModuleKey, string>>;

const DEFAULT_MODEL_TIER_LABELS: Record<string, { zh: string; en: string; hint: string }> = {
  smart: { zh: "智能", en: "Smart", hint: "1x" },
  advanced: { zh: "高级", en: "Advanced", hint: "1.25x" },
  ultra: { zh: "超强", en: "Ultra", hint: "1.75x" },
};

function moduleModelValue(value: unknown): string {
  if (value && typeof value === "object") {
    return String((value as Record<string, unknown>).model || "").trim();
  }
  return String(value || "").trim();
}

function uniqueModels(models: unknown[], fallback?: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const rawValues = [...models, fallback]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const tierOnly = rawValues.length > 0 && rawValues.every(isModelTier);
  const add = (value: unknown) => {
    const model = String(value || "").trim();
    if (!model || seen.has(model)) return;
    seen.add(model);
    result.push(model);
  };
  rawValues.forEach(add);
  if (!tierOnly) add(DEFAULT_MODEL);
  return result;
}

function isModelTier(value: string) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_MODEL_TIER_LABELS, value);
}

function isSystemAdminClient() {
  return String(getAuthUser()?.role || "").trim().toLowerCase() === "admin";
}

function visibleTierModels(models: unknown[], fallback = "smart") {
  const tiers = models
    .map((item) => String(item || "").trim())
    .filter(isModelTier);
  return Array.from(new Set(tiers.length ? tiers : [fallback]));
}

function readTierLabelMap(): Record<string, { zh: string; en: string; hint: string }> {
  try {
    const raw = localStorage.getItem(TIER_OPTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return DEFAULT_MODEL_TIER_LABELS;
    return parsed.reduce(
      (acc, item) => {
        const value = String(item?.value || "").trim();
        if (!isModelTier(value)) return acc;
        const multiplier = Number(item?.multiplier || 1);
        acc[value] = {
          zh: String(item?.label || DEFAULT_MODEL_TIER_LABELS[value].zh),
          en: String(item?.label_en || DEFAULT_MODEL_TIER_LABELS[value].en),
          hint: `${Number.isFinite(multiplier) ? multiplier : 1}x`,
        };
        return acc;
      },
      { ...DEFAULT_MODEL_TIER_LABELS },
    );
  } catch {
    return DEFAULT_MODEL_TIER_LABELS;
  }
}

function modelTierLabel(value: string, lang: "zh" | "en") {
  const item = readTierLabelMap()[value];
  return item ? `${lang === "zh" ? item.zh : item.en} · ${item.hint}` : value;
}

export function aiModelOptionLabel(value: string, lang: "zh" | "en") {
  return isModelTier(value) ? modelTierLabel(value, lang) : value;
}

function saveTierOptions(tierOptions?: unknown[]) {
  if (!Array.isArray(tierOptions)) return;
  const normalized = tierOptions
    .map((item: any) => ({
      value: String(item?.value || "").trim(),
      label: String(item?.label || "").trim(),
      label_en: String(item?.label_en || "").trim(),
      multiplier: Number(item?.multiplier || 1),
    }))
    .filter((item) => isModelTier(item.value));
  if (normalized.length) {
    localStorage.setItem(TIER_OPTIONS_KEY, JSON.stringify(normalized));
  }
}

export function readAiModuleModels(): AiModuleModels {
  try {
    const raw = localStorage.getItem(MODULE_MODELS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return MODULE_KEYS.reduce<AiModuleModels>((acc, key) => {
      const value = moduleModelValue((parsed as Record<string, unknown>)[key]);
      if (value) acc[key] = value;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export function saveAiModuleModels(moduleModels: AiModuleModels, fallback = DEFAULT_MODEL) {
  const normalized = MODULE_KEYS.reduce<Record<string, string>>((acc, key) => {
    acc[key] = String(moduleModels[key] || fallback || DEFAULT_MODEL).trim();
    return acc;
  }, {});
  localStorage.setItem(MODULE_MODELS_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event(MODEL_EVENT));
  return normalized as AiModuleModels;
}

export function readAiModelState(moduleKey?: AiModuleKey | null, fallback = DEFAULT_MODEL) {
  let storedModels: string[] = [];
  try {
    const raw = localStorage.getItem(MODELS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) storedModels = parsed;
  } catch {
    storedModels = [];
  }
  const storedDefault = localStorage.getItem(DEFAULT_MODEL_KEY) || fallback;
  const moduleModels = readAiModuleModels();
  const requestedModel = String(
    (moduleKey ? moduleModels[moduleKey] : "") ||
      storedDefault ||
      fallback ||
      DEFAULT_MODEL,
  ).trim();
  if (!isSystemAdminClient()) {
    const tierOptions = visibleTierModels(storedModels, "smart");
    const selectedModel =
      isModelTier(requestedModel) && tierOptions.includes(requestedModel)
        ? requestedModel
        : tierOptions[0] || "smart";
    return {
      selectedModel,
      modelOptions: tierOptions,
      moduleModels,
    };
  }
  return {
    selectedModel: requestedModel,
    modelOptions: uniqueModels(storedModels, requestedModel),
    moduleModels,
  };
}

export function saveAiModelState(
  models: unknown[],
  selectedModel?: string,
  moduleModels?: AiModuleModels,
  tierOptions?: unknown[],
  options?: { replaceModels?: boolean },
) {
  saveTierOptions(tierOptions);
  const userTierScope = !isSystemAdminClient();
  const requested = String(selectedModel || "").trim();
  const safeSelected = userTierScope && !isModelTier(requested) ? "smart" : requested;
  const existing = options?.replaceModels || userTierScope
    ? []
    : readAiModelState(null, safeSelected || DEFAULT_MODEL).modelOptions;
  const normalized = userTierScope
    ? visibleTierModels(models, safeSelected || "smart")
    : uniqueModels([...existing, ...models], safeSelected);
  localStorage.setItem(MODELS_KEY, JSON.stringify(normalized));
  const nextDefault = String(safeSelected || normalized[0] || DEFAULT_MODEL).trim();
  if (nextDefault) localStorage.setItem(DEFAULT_MODEL_KEY, nextDefault);
  if (moduleModels) saveAiModuleModels(moduleModels, nextDefault);
  window.dispatchEvent(new Event(MODEL_EVENT));
  return normalized;
}

export function useAiModelSelection(
  moduleKey?: AiModuleKey | null,
  fallback = DEFAULT_MODEL,
) {
  const [state, setState] = useState(() => readAiModelState(moduleKey, fallback));

  useEffect(() => {
    const refresh = () => setState(readAiModelState(moduleKey, fallback));
    window.addEventListener("storage", refresh);
    window.addEventListener(MODEL_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(MODEL_EVENT, refresh);
    };
  }, [fallback, moduleKey]);

  const syncSavedConfig = async () => {
    const cfg: any = await api.getLLMConfig();
    const cfgModuleModels = (cfg?.module_models || {}) as AiModuleModels;
    const tierSelection = cfg?.scope === "tier_selection";
    const configuredModels = tierSelection
      ? visibleTierModels(cfg?.model_options?.models || cfg?.models || [], "smart")
      : [cfg?.model || fallback || DEFAULT_MODEL];
    const requested =
      (moduleKey ? cfgModuleModels[moduleKey] : "") ||
      cfg?.model ||
      fallback ||
      DEFAULT_MODEL;
    const selected =
      tierSelection && (!isModelTier(requested) || !configuredModels.includes(requested))
        ? configuredModels[0] || "smart"
        : requested;
    const nextOptions = saveAiModelState(
      configuredModels,
      selected,
      cfgModuleModels,
      cfg?.model_options?.tier_options,
      { replaceModels: tierSelection },
    );
    setState({
      selectedModel: selected,
      modelOptions: nextOptions,
      moduleModels: readAiModuleModels(),
    });
    return nextOptions;
  };

  const refreshModelOptions = async () => {
    const cfg: any = await api.getLLMConfig();
    const cfgModuleModels = (cfg?.module_models || {}) as AiModuleModels;
    const tierSelection = cfg?.scope === "tier_selection";
    const requested =
      (moduleKey ? cfgModuleModels[moduleKey] : "") ||
      cfg?.model ||
      fallback ||
      DEFAULT_MODEL;
    let models = tierSelection
      ? visibleTierModels(cfg?.model_options?.models || cfg?.models || [], "smart")
      : [requested];
    if (!tierSelection) {
      try {
        const loaded: any = await api.listLLMModels(cfg);
        if (Array.isArray(loaded?.models) && loaded.models.length > 0) {
          models = loaded.models;
        }
      } catch {
        models = [requested];
      }
    }
    const selected =
      tierSelection && (!isModelTier(requested) || !models.includes(requested))
        ? models[0] || "smart"
        : requested;
    const nextOptions = saveAiModelState(
      models,
      selected,
      cfgModuleModels,
      cfg?.model_options?.tier_options,
      { replaceModels: tierSelection },
    );
    setState({
      selectedModel: selected,
      modelOptions: nextOptions,
      moduleModels: readAiModuleModels(),
    });
    return nextOptions;
  };

  useEffect(() => {
    let cancelled = false;
    syncSavedConfig()
      .then(() => {
        if (!cancelled) setState(readAiModelState(moduleKey, fallback));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fallback, moduleKey]);

  const setSelectedModel = (model: string) => {
    const requested = model.trim();
    const selected = !isSystemAdminClient() && !isModelTier(requested)
      ? "smart"
      : requested;
    const current = readAiModelState(moduleKey, fallback);
    const nextOptions = !isSystemAdminClient()
      ? visibleTierModels(current.modelOptions, selected || "smart")
      : uniqueModels(current.modelOptions, selected);
    if (moduleKey) {
      saveAiModuleModels({ ...current.moduleModels, [moduleKey]: selected }, fallback);
    } else if (selected) {
      localStorage.setItem(DEFAULT_MODEL_KEY, selected);
    }
    localStorage.setItem(MODELS_KEY, JSON.stringify(nextOptions));
    setState({
      selectedModel: selected,
      modelOptions: nextOptions,
      moduleModels: readAiModuleModels(),
    });
    window.dispatchEvent(new Event(MODEL_EVENT));
  };

  return {
    selectedModel: state.selectedModel,
    setSelectedModel,
    modelOptions: state.modelOptions,
    refreshModelOptions,
  };
}

type AiModelInputProps = {
  label?: string;
  selectedModel: string;
  modelOptions: string[];
  onChange: (model: string) => void;
  compact?: boolean;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
};

export function AiModelInput({
  label,
  selectedModel,
  modelOptions,
  onChange,
  compact = false,
  style,
  inputStyle,
}: AiModelInputProps) {
  const { lang } = useLanguage();
  const resolvedLabel = label ?? (lang === "zh" ? "本次模型" : "Model");
  const listId = useMemo(
    () => `ai-model-options-${Math.random().toString(36).slice(2)}`,
    [],
  );
  const options = uniqueModels(modelOptions, selectedModel);
  const tierMode = options.length > 0 && options.every(isModelTier);

  const controlStyle: CSSProperties = {
    width: "100%",
    minWidth: compact ? 130 : 160,
    height: compact ? 30 : 36,
    border: "1px solid var(--border-light)",
    borderRadius: compact ? 10 : 12,
    background: "var(--bg-white)",
    color: "var(--text-primary)",
    padding: compact ? "0 9px" : "0 12px",
    fontSize: compact ? 12 : 13,
    fontFamily: tierMode ? "inherit" : "var(--font-mono)",
    outline: "none",
    ...inputStyle,
  };

  return (
    <div style={style}>
      {resolvedLabel && (
        <label
          style={{
            display: "block",
            marginBottom: compact ? 4 : 6,
            fontSize: compact ? 10 : 11,
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
          }}
        >
          {resolvedLabel}
        </label>
      )}
      {tierMode ? (
        <select
          value={isModelTier(selectedModel) ? selectedModel : options[0] || "smart"}
          onChange={(event) => onChange(event.target.value)}
          style={controlStyle}
        >
          {options.map((model) => (
            <option key={model} value={model}>
              {modelTierLabel(model, lang)}
            </option>
          ))}
        </select>
      ) : (
      <input
        list={listId}
        value={selectedModel}
        onChange={(event) => onChange(event.target.value)}
        placeholder={DEFAULT_MODEL}
        style={controlStyle}
      />
      )}
      <datalist id={listId}>
        {options.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
    </div>
  );
}
