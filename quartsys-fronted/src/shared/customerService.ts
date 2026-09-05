import { DEFAULT_AI_MODEL } from "./aiDefaults";

export type CustomerServiceFaq = {
  question: string;
  answer: string;
  enabled: boolean;
};

export type CustomerServiceKbFile = {
  name: string;
  content: string;
  type: string;
  enabled: boolean;
};

export type CustomerServiceAiConfig = {
  enabled: boolean;
  display_title: string;
  use_system_ai: boolean;
  provider: string;
  model: string;
  api_url: string;
  api_key: string;
  welcome_message: string;
  system_prompt: string;
  capabilities: string[];
  knowledge_base: {
    internal: { enabled: boolean; text: string };
    text: { enabled: boolean; content: string };
    uploaded_files: CustomerServiceKbFile[];
    rag_files: CustomerServiceKbFile[];
    graph: { enabled: boolean; nodes: any[]; edges: any[]; notes: string };
    external: { enabled: boolean; endpoint: string; method: "GET" | "POST"; api_key: string };
  };
  faqs: CustomerServiceFaq[];
  recommended_questions: string[];
};

export type PublicCustomerServiceAiSettings = Pick<
  CustomerServiceAiConfig,
  "enabled" | "display_title" | "welcome_message" | "capabilities" | "faqs" | "recommended_questions"
>;

export const DEFAULT_CUSTOMER_SERVICE_AI_CONFIG: CustomerServiceAiConfig = {
  enabled: false,
  display_title: "QaurtSmart 站点助手",
  use_system_ai: true,
  provider: "openai",
  model: DEFAULT_AI_MODEL,
  api_url: "",
  api_key: "",
  welcome_message: "你好，我可以介绍本地部署、数据源配置和社区版使用流程。",
  system_prompt:
    "你是部署者自行配置的站点助手，只介绍本地部署、数据源、因子、回测与模拟交易。回答要简洁、准确，不能承诺收益，不提供直接买卖指令。",
  capabilities: ["部署说明", "数据源配置", "使用引导"],
  knowledge_base: {
    internal: {
      enabled: true,
      text: "QaurtSmart 是一套自部署量化研究平台，提供行情接入、选股、因子、回测、模拟交易以及用户自定义扩展接口。",
    },
    text: { enabled: true, content: "" },
    uploaded_files: [],
    rag_files: [],
    graph: { enabled: false, nodes: [], edges: [], notes: "" },
    external: { enabled: false, endpoint: "", method: "GET", api_key: "" },
  },
  faqs: [
    {
      question: "这个系统适合什么用户？",
      answer: "适合希望在自己的环境中管理行情、选股、因子、回测和模拟交易流程的研究者。",
      enabled: true,
    },
    {
      question: "社区版如何接入 AI？",
      answer: "由部署者配置自己的模型接口或工作流，项目不会默认连接平台模型服务。",
      enabled: true,
    },
  ],
  recommended_questions: [
    "社区版支持哪些研究流程？",
    "如何配置自己的数据源？",
    "如何导入 CSV 证券池？",
    "如何运行策略回测？",
  ],
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  return String(value ?? fallback);
}

function normalizeStringList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;；]+/)
      : fallback;
  return Array.from(
    new Set(source.map((item) => String(item || "").trim()).filter(Boolean)),
  );
}

function normalizeFaqs(value: unknown, fallback: CustomerServiceFaq[]) {
  const source = asArray(value).length ? asArray(value) : fallback;
  return source
    .map((item: any) => ({
      question: text(item?.question).trim(),
      answer: text(item?.answer).trim(),
      enabled: item?.enabled !== false,
    }))
    .filter((item) => item.question && item.answer);
}

function normalizeKbFiles(value: unknown): CustomerServiceKbFile[] {
  return asArray(value)
    .map((item: any, index) => ({
      name: text(item?.name, `知识库文件 ${index + 1}`).trim(),
      content: text(item?.content || item?.text).trim(),
      type: text(item?.type, "text").trim() || "text",
      enabled: item?.enabled !== false,
    }))
    .filter((item) => item.content);
}

export function normalizeCustomerServiceAiConfig(value: unknown): CustomerServiceAiConfig {
  const raw = value && typeof value === "object" ? (value as any) : {};
  const defaults = DEFAULT_CUSTOMER_SERVICE_AI_CONFIG;
  const kb = raw.knowledge_base && typeof raw.knowledge_base === "object" ? raw.knowledge_base : {};
  const internal = kb.internal && typeof kb.internal === "object" ? kb.internal : {};
  const textKb = kb.text && typeof kb.text === "object" ? kb.text : {};
  const graph = kb.graph && typeof kb.graph === "object" ? kb.graph : {};
  const external = kb.external && typeof kb.external === "object" ? kb.external : {};
  const method = String(external.method || "GET").toUpperCase() === "POST" ? "POST" : "GET";
  return {
    enabled: Boolean(raw.enabled),
    display_title: text(raw.display_title, defaults.display_title),
    use_system_ai: raw.use_system_ai !== false,
    provider: text(raw.provider, defaults.provider),
    model: text(raw.model, defaults.model),
    api_url: text(raw.api_url || raw.base_url),
    api_key: text(raw.api_key),
    welcome_message: text(raw.welcome_message, defaults.welcome_message),
    system_prompt: text(raw.system_prompt, defaults.system_prompt),
    capabilities: normalizeStringList(raw.capabilities, defaults.capabilities),
    knowledge_base: {
      internal: {
        enabled: internal.enabled !== false,
        text: text(internal.text, defaults.knowledge_base.internal.text),
      },
      text: {
        enabled: textKb.enabled !== false,
        content: text(textKb.content),
      },
      uploaded_files: normalizeKbFiles(kb.uploaded_files),
      rag_files: normalizeKbFiles(kb.rag_files),
      graph: {
        enabled: Boolean(graph.enabled),
        nodes: asArray(graph.nodes),
        edges: asArray(graph.edges),
        notes: text(graph.notes),
      },
      external: {
        enabled: Boolean(external.enabled),
        endpoint: text(external.endpoint),
        method,
        api_key: text(external.api_key),
      },
    },
    faqs: normalizeFaqs(raw.faqs, defaults.faqs),
    recommended_questions: normalizeStringList(
      raw.recommended_questions,
      defaults.recommended_questions,
    ),
  };
}

export function normalizePublicCustomerServiceAiSettings(value: unknown): PublicCustomerServiceAiSettings {
  const config = normalizeCustomerServiceAiConfig(value);
  return {
    enabled: Boolean((value as any)?.enabled),
    display_title: config.display_title,
    welcome_message: config.welcome_message,
    capabilities: config.capabilities,
    faqs: config.faqs.filter((item) => item.enabled),
    recommended_questions: config.recommended_questions,
  };
}
