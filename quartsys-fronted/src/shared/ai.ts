import { DEFAULT_AI_MODEL } from "./aiDefaults";

export type AiRole = "strategy" | "assistant";

export type AiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type AiRequestParams = {
  config: AiConfig;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
};

export type AiStreamParams = AiRequestParams & {
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
};

const normalize = (v: string) => (v || "").trim().replace(/\/+$/, "");

function demoCacheKey(config: AiConfig, systemPrompt: string, userPrompt: string) {
  if (typeof window === "undefined" || window.localStorage.getItem("quartsys_demo_mode_active") !== "1") return "";
  const raw = JSON.stringify([config.baseUrl, config.model, systemPrompt, userPrompt]);
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) hash = ((hash << 5) - hash + raw.charCodeAt(index)) | 0;
  return `quartsys_demo_ai_cache:${Math.abs(hash).toString(36)}`;
}

function readDemoCache(key: string) {
  if (!key) return "";
  try { return window.localStorage.getItem(key) || ""; } catch { return ""; }
}

function writeDemoCache(key: string, value: string) {
  if (!key || !value.trim()) return;
  try { window.localStorage.setItem(key, value.slice(0, 120000)); } catch { /* cache is best effort */ }
}
const normalizeApiKey = (v: string) => String(v || "").trim().replace(/^['\"]|['\"]$/g, "");
const MAX_COMPLETION_TOKENS = 4096;
const MAX_OUTPUT_TOKENS = 4096;

function buildMessages(systemPrompt: string | undefined, userPrompt: string) {
  return [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    { role: "user", content: userPrompt },
  ];
}

function normalizeText(v: any): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        if (typeof part.text === "string") return part.text;
        if (typeof part.content === "string") return part.content;
        if (typeof part.reasoning_content === "string") return part.reasoning_content;
        if (typeof part.delta === "string") return part.delta;
        return "";
      })
      .join("");
  }
  if (v && typeof v === "object") {
    if (typeof v.text === "string") return v.text;
    if (typeof v.content === "string") return v.content;
    if (typeof v.delta === "string") return v.delta;
  }
  return "";
}

function extractBodyText(responseBody: any) {
  const choice = responseBody?.choices?.[0];
  const outputText =
    Array.isArray(responseBody?.output)
      ? responseBody.output
          .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
          .map((item: any) => item?.text || "")
          .join("")
      : "";

  const text =
    normalizeText(choice?.message?.content) ||
    normalizeText(choice?.delta?.content) ||
    normalizeText(responseBody?.message) ||
    normalizeText(responseBody?.response) ||
    normalizeText(responseBody?.output_text) ||
    normalizeText(outputText);

  return {
    text,
    finishReason: choice?.finish_reason || choice?.native_finish_reason || "unknown",
  };
}

function extractDeltaFromChunk(chunk: any): string {
  const fromChat = normalizeText(chunk?.choices?.[0]?.delta?.content) || normalizeText(chunk?.choices?.[0]?.message?.content);
  if (fromChat) return fromChat;

  const evtType = String(chunk?.type || "");
  if (evtType.includes("response.output_text.delta")) {
    return normalizeText(chunk?.delta);
  }
  if (evtType.includes("response.output_text.done")) {
    return normalizeText(chunk?.text);
  }

  return (
    normalizeText(chunk?.delta) ||
    normalizeText(chunk?.output_text) ||
    normalizeText(chunk?.message) ||
    normalizeText(chunk?.response)
  );
}

function isTruncatedFinishReason(reason: string | undefined) {
  const r = String(reason || "").toLowerCase();
  return r === "length" || r === "max_tokens" || r.includes("token_limit");
}

async function readJsonResponse(res: Response) {
  const rawText = await res.text();
  let body: any = {};
  try {
    body = JSON.parse(rawText);
  } catch {
    body = {};
  }
  return { rawText, body };
}

function authErrorMessage(status: number, providerMsg: string, model: string, base: string) {
  return `鉴权失败（${status}）。请检查 Base URL 与 API Key 是否匹配；当前 model=${model}，接口=${base}/chat/completions。服务端信息: ${providerMsg}`;
}

async function requestChatCompletions(params: AiRequestParams, signal?: AbortSignal) {
  const { config, systemPrompt, userPrompt, temperature = 0.3 } = params;
  const base = normalize(config.baseUrl || "https://api.openai.com/v1");
  const apiKey = normalizeApiKey(config.apiKey);
  const messages = buildMessages(systemPrompt, userPrompt);

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      messages,
    }),
    signal,
  });

  const { rawText, body } = await readJsonResponse(res);
  return { res, rawText, body, base, apiKey, messages };
}

async function requestResponses(params: AiRequestParams, messages: Array<{ role: string; content: string }>, signal?: AbortSignal) {
  const { config, temperature = 0.3 } = params;
  const base = normalize(config.baseUrl || "https://api.openai.com/v1");
  const apiKey = normalizeApiKey(config.apiKey);

  const res = await fetch(`${base}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: messages,
    }),
    signal,
  });

  const { rawText, body } = await readJsonResponse(res);
  return { res, rawText, body, base };
}

async function readSSEStream(res: Response, onDelta: (delta: string) => void) {
  if (!res.body) return { fullText: "", finishReason: "unknown" };

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";
  let finishReason = "unknown";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const chunkFinishReason = json?.choices?.[0]?.finish_reason || json?.native_finish_reason;
        if (chunkFinishReason) finishReason = String(chunkFinishReason);
        const delta = extractDeltaFromChunk(json);
        if (!delta) continue;
        fullText += delta;
        onDelta(delta);
      } catch {
        // Ignore malformed event chunks from some gateways.
      }
    }
  }

  return { fullText, finishReason };
}

export function getDefaultAiConfig(role: AiRole): AiConfig {
  const env = (import.meta as any).env || {};
  if (role === "strategy") {
    return {
      baseUrl: normalize(env.VITE_STRATEGY_AI_BASE_URL || env.VITE_OPENAI_BASE_URL || "https://api.openai.com/v1"),
      apiKey: normalizeApiKey(env.VITE_STRATEGY_AI_API_KEY || env.VITE_OPENAI_API_KEY || ""),
      model: String(env.VITE_STRATEGY_AI_MODEL || env.VITE_OPENAI_MODEL || DEFAULT_AI_MODEL),
    };
  }
  return {
    baseUrl: normalize(env.VITE_ASSISTANT_AI_BASE_URL || env.VITE_OPENAI_BASE_URL || "https://api.openai.com/v1"),
    apiKey: normalizeApiKey(env.VITE_ASSISTANT_AI_API_KEY || env.VITE_OPENAI_API_KEY || ""),
    model: String(env.VITE_ASSISTANT_AI_MODEL || env.VITE_OPENAI_MODEL || DEFAULT_AI_MODEL),
  };
}

export function loadAiConfig(role: AiRole): AiConfig {
  const defaults = getDefaultAiConfig(role);
  try {
    const raw = localStorage.getItem(`quartsys_ai_cfg_${role}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      baseUrl: normalize(String(parsed?.baseUrl || defaults.baseUrl)),
      apiKey: normalizeApiKey(parsed?.apiKey ?? defaults.apiKey),
      model: String(parsed?.model || defaults.model),
    };
  } catch {
    return defaults;
  }
}

export function saveAiConfig(role: AiRole, cfg: AiConfig) {
  localStorage.setItem(
    `quartsys_ai_cfg_${role}`,
    JSON.stringify({ ...cfg, baseUrl: normalize(cfg.baseUrl), apiKey: normalizeApiKey(cfg.apiKey), model: String(cfg.model || "") })
  );
}

export async function callOpenAICompatible(params: AiRequestParams) {
  const { config, systemPrompt = "", userPrompt = "" } = params;
  const cacheKey = demoCacheKey(config, systemPrompt, userPrompt);
  const cached = readDemoCache(cacheKey);
  if (cached) return cached;
  const chat = await requestChatCompletions(params);

  if (!chat.res.ok) {
    if (chat.res.status === 401 || chat.res.status === 403) {
      const providerMsg = chat.body?.error?.message || chat.body?.detail || chat.rawText.slice(0, 200);
      throw new Error(authErrorMessage(chat.res.status, providerMsg, config.model, chat.base));
    }
    const msg = chat.body?.error?.message || chat.body?.detail || `AI request failed (${chat.res.status}): ${chat.rawText.slice(0, 50)}`;
    throw new Error(msg);
  }

  let extracted = extractBodyText(chat.body);
  if (extracted.text && extracted.text.trim()) { writeDemoCache(cacheKey, extracted.text); return extracted.text; }

  const responses = await requestResponses(params, chat.messages);
  if (!responses.res.ok) {
    const providerMsg = responses.body?.error?.message || responses.body?.detail || responses.rawText.slice(0, 200);
    throw new Error(`回退到 /responses 失败(${responses.res.status})。服务端信息: ${providerMsg}`);
  }

  extracted = extractBodyText(responses.body);
  if (extracted.text && extracted.text.trim()) { writeDemoCache(cacheKey, extracted.text); return extracted.text; }

  throw new Error(
    `chat/completions 与 /responses 都未返回正文。finish_reason=${extracted.finishReason}。chat 原始(前300字): ${chat.rawText.slice(0, 300)} | responses 原始(前300字): ${responses.rawText.slice(0, 300)}`
  );
}

export async function streamOpenAICompatible(params: AiStreamParams) {
  const { config, onDelta, systemPrompt, userPrompt, temperature = 0.3, signal } = params;
  const cacheKey = demoCacheKey(config, systemPrompt, userPrompt);
  const cached = readDemoCache(cacheKey);
  if (cached) { onDelta(cached); return cached; }
  const base = normalize(config.baseUrl || "https://api.openai.com/v1");
  const apiKey = normalizeApiKey(config.apiKey);
  const messages = buildMessages(systemPrompt, userPrompt);

  const chatRes = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      stream: true,
      messages,
    }),
    signal,
  });

  if (chatRes.status === 401 || chatRes.status === 403) {
    const { rawText, body } = await readJsonResponse(chatRes);
    const providerMsg = body?.error?.message || body?.detail || rawText.slice(0, 200);
    throw new Error(authErrorMessage(chatRes.status, providerMsg, config.model, base));
  }

  if (chatRes.ok) {
    const contentType = chatRes.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      const streamResult = await readSSEStream(chatRes, onDelta);
      if (streamResult.fullText.trim()) {
        if (isTruncatedFinishReason(streamResult.finishReason)) {
          const tail = streamResult.fullText.slice(-600);
          const continuation = await callOpenAICompatible({
            config,
            systemPrompt,
            userPrompt: `${userPrompt}\n\n以上回答被截断。请仅继续输出后续未完成内容，不要重复前文。已输出末尾片段：\n${tail}`,
            temperature,
          });
          if (continuation.trim()) {
            const merged = `${streamResult.fullText}\n${continuation}`;
            onDelta(`\n${continuation}`);
            return merged;
          }
        }
        writeDemoCache(cacheKey, streamResult.fullText);
        return streamResult.fullText;
      }
    } else {
      const { rawText, body } = await readJsonResponse(chatRes);
      const extracted = extractBodyText(body);
      if (extracted.text.trim()) {
        let text = extracted.text;
        if (isTruncatedFinishReason(extracted.finishReason)) {
          const continuation = await callOpenAICompatible({
            config,
            systemPrompt,
            userPrompt: `${userPrompt}\n\n以上回答被截断。请仅继续输出后续未完成内容，不要重复前文。`,
            temperature,
          });
          if (continuation.trim()) text = `${text}\n${continuation}`;
        }
        onDelta(text);
        writeDemoCache(cacheKey, text);
        return text;
      }
      if (rawText.trim() && !contentType.includes("application/json")) {
        onDelta(rawText);
        writeDemoCache(cacheKey, rawText);
        return rawText;
      }
    }
  }

  const responsesRes = await fetch(`${base}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      input: messages,
    }),
    signal,
  });

  if (!responsesRes.ok) {
    const { rawText, body } = await readJsonResponse(responsesRes);
    const providerMsg = body?.error?.message || body?.detail || rawText.slice(0, 200);
    throw new Error(`流式回退到 /responses 失败(${responsesRes.status})。服务端信息: ${providerMsg}`);
  }

  const responsesType = responsesRes.headers.get("content-type") || "";
  if (responsesType.includes("text/event-stream")) {
    const responseStreamResult = await readSSEStream(responsesRes, onDelta);
    if (responseStreamResult.fullText.trim()) { writeDemoCache(cacheKey, responseStreamResult.fullText); return responseStreamResult.fullText; }
  } else {
    const { rawText, body } = await readJsonResponse(responsesRes);
    const extracted = extractBodyText(body);
    if (extracted.text.trim()) {
      onDelta(extracted.text);
      writeDemoCache(cacheKey, extracted.text);
      return extracted.text;
    }
    if (rawText.trim() && !responsesType.includes("application/json")) {
      onDelta(rawText);
      writeDemoCache(cacheKey, rawText);
      return rawText;
    }
  }

  const nonStreamText = await callOpenAICompatible({ config, systemPrompt, userPrompt, temperature });
  if (nonStreamText.trim()) {
    onDelta(nonStreamText);
    return nonStreamText;
  }

  throw new Error("流式与非流式模式均未获取到正文");
}
