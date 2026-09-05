import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../shared/language";
import { toZhContent } from "../pages/content-translate";
import {
  getDefaultAiConfig,
  loadAiConfig,
  saveAiConfig,
  streamOpenAICompatible,
} from "../shared/ai";

type StrategyEditorProps = {
  rawHtml: string;
};

type ParsedStrategyHtml = {
  title: string;
  styleTexts: string[];
  html: string;
  containerClass: string;
};

const STRATEGY_SYSTEM_PROMPT_KEY = "quartsys_strategy_system_prompt";

const DEFAULT_STRATEGY_SYSTEM_PROMPT =
  "You are a senior quantitative strategy engineer. Generate complete, production-ready Python strategy code. " +
  "Requirements: include clear parameter definitions, entry/exit rules, risk management (stop loss/take profit), position sizing, logging hooks, and backtest-ready structure. " +
  "Output code only in one Python markdown code block.";

function loadStrategySystemPrompt() {
  try {
    return (
      localStorage.getItem(STRATEGY_SYSTEM_PROMPT_KEY) ||
      DEFAULT_STRATEGY_SYSTEM_PROMPT
    );
  } catch {
    return DEFAULT_STRATEGY_SYSTEM_PROMPT;
  }
}

function saveStrategySystemPrompt(v: string) {
  localStorage.setItem(STRATEGY_SYSTEM_PROMPT_KEY, v);
}

function parseStrategyHtml(input: string): ParsedStrategyHtml {
  const doc = new DOMParser().parseFromString(input, "text/html");
  const title = doc.title || "QaurtSmart | AI 策略";
  const styleTexts = Array.from(doc.querySelectorAll("head style"))
    .map((s) => s.textContent || "")
    .filter(Boolean);

  const main = doc.querySelector("main");
  const html = main ? main.innerHTML : doc.body.innerHTML;
  const containerClass = (main?.getAttribute("class") || "")
    .replace(/\bpl-64\b/g, "")
    .replace(/\bpt-14\b/g, "")
    .replace(/\bh-screen\b/g, "")
    .replace(/\boverflow-hidden\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    styleTexts,
    html,
    containerClass: containerClass || "min-h-screen",
  };
}

function localizeLegacyTitle(title: string, lang: "zh" | "en") {
  if (lang === "zh") return title;
  return title
    .replace(/QaurtSmart/g, "QaurtSmart")
    .replace(/量化交易系统/g, "Quant Trading System")
    .replace(/AI 策略/g, "AI Strategy");
}

export default function StrategyEditor({ rawHtml }: StrategyEditorProps) {
  const parsed = useMemo(() => parseStrategyHtml(rawHtml), [rawHtml]);
  const { lang } = useLanguage();

  const [prompt, setPrompt] = useState("");
  const [strategyCode, setStrategyCode] = useState(
    "# AI Strategy Ready\n# 在左侧输入策略逻辑后，点击“Generate Strategy”自动生成策略代码。",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cfgOpen, setCfgOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [cfg, setCfg] = useState(() => loadAiConfig("strategy"));
  const [systemPrompt, setSystemPrompt] = useState(() =>
    loadStrategySystemPrompt(),
  );
  const [systemPromptDraft, setSystemPromptDraft] = useState(() =>
    loadStrategySystemPrompt(),
  );

  useEffect(() => {
    document.title = localizeLegacyTitle(parsed.title, lang);
  }, [parsed.title, lang]);

  useEffect(() => {
    const ids: string[] = [];

    parsed.styleTexts.forEach((css, idx) => {
      const id = `qs-page-style-strategy-${idx}`;
      ids.push(id);
      let node = document.getElementById(id) as HTMLStyleElement | null;
      if (!node) {
        node = document.createElement("style");
        node.id = id;
        document.head.appendChild(node);
      }
      node.textContent = css;
    });

    const extraId = "qs-page-style-strategy-fix";
    ids.push(extraId);
    let extraNode = document.getElementById(extraId) as HTMLStyleElement | null;
    if (!extraNode) {
      extraNode = document.createElement("style");
      extraNode.id = extraId;
      document.head.appendChild(extraNode);
    }

    extraNode.textContent = `
      .qs-route-main .headline { font-family: 'Space Grotesk', sans-serif !important; }
      .qs-route-main .mono { font-family: 'JetBrains Mono', monospace !important; }
      .qs-route-main .glass-panel { backdrop-filter: blur(12px); background: rgba(27,31,44,0.6); }
      .qs-route-main .bg-secondary-container\/10 { background-color: rgba(87, 27, 193, 0.10) !important; }
      .qs-route-main .border-secondary\/20 { border-color: rgba(208, 188, 255, 0.20) !important; }
      .qs-route-main .text-secondary { color: #d0bcff !important; }
      .qs-route-main .bg-secondary-container { background-color: #571bc1 !important; }
      .qs-route-main .bg-surface-container-lowest { background-color: #0a0e1a !important; }
    `;

    return () => {
      ids.forEach((id) => document.getElementById(id)?.remove());
    };
  }, [parsed.styleTexts]);

  useEffect(() => {
    const root = document.querySelector(".qs-route-main") as HTMLElement | null;
    if (!root) return;

    const tryBind = () => {
      const textarea = root.querySelector(
        "textarea",
      ) as HTMLTextAreaElement | null;
      const generateBtns = Array.from(root.querySelectorAll("button")).filter(
        (btn) => {
          const txt = (btn.textContent || "").toLowerCase();
          return txt.includes("generate strategy") || txt.includes("生成策略");
        },
      ) as HTMLButtonElement[];
      const codePre = root.querySelector("pre") as HTMLElement | null;

      if (textarea && textarea.value !== prompt) textarea.value = prompt;
      if (codePre) codePre.textContent = strategyCode;

      const onGenerate = async () => {
        if (loading) return;
        const userPrompt = (textarea?.value || prompt).trim();
        setPrompt(userPrompt);
        if (!userPrompt) {
          setError(
            lang === "zh"
              ? "请先输入策略描述"
              : "Please enter strategy prompt first",
          );
          return;
        }
        setLoading(true);
        setError("");
        try {
          setStrategyCode("");
          await streamOpenAICompatible({
            config: cfg,
            systemPrompt,
            userPrompt,
            temperature: 0.2,
            onDelta: (delta) => {
              if (!delta) return;
              setStrategyCode((prev) => prev + delta);
            },
          });
        } catch (e: any) {
          setError(
            e?.message ||
              (lang === "zh" ? "策略生成失败" : "Generation failed"),
          );
        } finally {
          setLoading(false);
        }
      };

      generateBtns.forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          void onGenerate();
        };
      });

      if (textarea) {
        textarea.oninput = (e) =>
          setPrompt((e.target as HTMLTextAreaElement).value || "");
      }

      return true;
    };

    const ok = tryBind();
    if (ok) return;
    const t = window.setTimeout(tryBind, 60);
    return () => window.clearTimeout(t);
  }, [prompt, strategyCode, loading, cfg, lang, systemPrompt]);

  const contentHtml = useMemo(
    () => (lang === "zh" ? toZhContent(parsed.html) : parsed.html),
    [lang, parsed.html],
  );

  const resetToEnv = () => {
    setCfg(getDefaultAiConfig("strategy"));
  };

  const resetPromptToDefault = () => {
    setSystemPromptDraft(DEFAULT_STRATEGY_SYSTEM_PROMPT);
  };

  const savePromptConfig = () => {
    const next = systemPromptDraft.trim() || DEFAULT_STRATEGY_SYSTEM_PROMPT;
    setSystemPrompt(next);
    saveStrategySystemPrompt(next);
    setPromptOpen(false);
  };

  return (
    <>
      <div
        className={parsed.containerClass}
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />

      <button
        className="fixed right-6 top-20 z-[70] rounded-lg border border-white/20 bg-[#1b1f2c] px-3 py-2 text-xs text-slate-200 hover:bg-[#22283a]"
        onClick={() => setCfgOpen(true)}
      >
        {lang === "zh" ? "AI 策略配置" : "AI Strategy Config"}
      </button>

      <button
        className="fixed right-6 top-32 z-[70] rounded-lg border border-white/20 bg-[#1b1f2c] px-3 py-2 text-xs text-slate-200 hover:bg-[#22283a]"
        onClick={() => {
          setSystemPromptDraft(systemPrompt);
          setPromptOpen(true);
        }}
      >
        {lang === "zh" ? "提示词设定" : "Prompt Settings"}
      </button>

      {loading && (
        <div className="fixed right-6 top-44 z-[70] rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
          {lang === "zh"
            ? "AI 正在生成策略代码..."
            : "Generating strategy code..."}
        </div>
      )}

      {error && (
        <div className="fixed right-6 top-56 z-[70] max-w-[420px] rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {error}
        </div>
      )}

      {promptOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setPromptOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#131824] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold">
                {lang === "zh" ? "策略提示词设定" : "Strategy Prompt Settings"}
              </h3>
              <button
                className="text-slate-400 hover:text-white"
                onClick={() => setPromptOpen(false)}
              >
                ✕
              </button>
            </div>

            <p className="mb-2 text-xs text-slate-400">
              {lang === "zh"
                ? "该提示词将作为系统指令，用于约束策略代码生成风格与完整性。"
                : "This prompt is used as system instruction to control strategy generation quality and style."}
            </p>
            <textarea
              className="min-h-[220px] w-full rounded bg-[#0a0e1a] border border-white/10 px-3 py-2 text-sm text-slate-100"
              value={systemPromptDraft}
              onChange={(e) => setSystemPromptDraft(e.target.value)}
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded border border-white/10 text-slate-300"
                onClick={resetPromptToDefault}
              >
                {lang === "zh" ? "恢复默认提示词" : "Reset Default Prompt"}
              </button>
              <button
                className="px-3 py-2 rounded bg-blue-600 text-white"
                onClick={savePromptConfig}
              >
                {lang === "zh" ? "保存并生效" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cfgOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setCfgOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-white/10 bg-[#131824] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold">
                {lang === "zh" ? "AI 策略配置" : "AI Strategy Config"}
              </h3>
              <button
                className="text-slate-400 hover:text-white"
                onClick={() => setCfgOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <label className="block">
                <div className="text-slate-400 mb-1">Base URL</div>
                <input
                  className="w-full rounded bg-[#0a0e1a] border border-white/10 px-3 py-2 text-slate-100"
                  value={cfg.baseUrl}
                  onChange={(e) =>
                    setCfg((s) => ({ ...s, baseUrl: e.target.value }))
                  }
                />
              </label>
              <label className="block">
                <div className="text-slate-400 mb-1">API Key</div>
                <input
                  type="password"
                  className="w-full rounded bg-[#0a0e1a] border border-white/10 px-3 py-2 text-slate-100"
                  value={cfg.apiKey}
                  onChange={(e) =>
                    setCfg((s) => ({ ...s, apiKey: e.target.value }))
                  }
                />
              </label>
              <label className="block">
                <div className="text-slate-400 mb-1">Model</div>
                <input
                  className="w-full rounded bg-[#0a0e1a] border border-white/10 px-3 py-2 text-slate-100"
                  value={cfg.model}
                  onChange={(e) =>
                    setCfg((s) => ({ ...s, model: e.target.value }))
                  }
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded border border-white/10 text-slate-300"
                onClick={resetToEnv}
              >
                {lang === "zh" ? "恢复.env默认" : "Reset .env defaults"}
              </button>
              <button
                className="px-3 py-2 rounded bg-blue-600 text-white"
                onClick={() => {
                  saveAiConfig("strategy", cfg);
                  setCfgOpen(false);
                }}
              >
                {lang === "zh" ? "保存" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
