import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  LoaderCircle,
  MessageCircleMore,
  Send,
  Square,
  X,
} from "lucide-react";
import { useLanguage } from "../shared/language";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { api } from "../api";
import { useAiModelSelection } from "../shared/aiModels";
import { useMarket } from "../shared/market";

const KEY = "quartsys_assistant_pos";
const HISTORY_KEY = "quartsys_assistant_history_v1";
const ASSISTANT_HISTORY_LIMIT = 20;

type AssistantHistoryMessage = { role: "user" | "assistant"; content: string };

type AssistantStreamEvent = {
  done?: boolean;
  delta?: string;
  error?: string;
};

type AssistantBlock =
  | { type: "heading"; level?: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "formula"; latex: string }
  | { type: "code"; language?: string; content: string }
  | { type: "callout"; tone?: string; text: string };

type AssistantStructuredResponse = {
  ok?: boolean;
  mode?: string;
  blocks?: AssistantBlock[];
  metadata?: {
    model?: string;
    repaired?: boolean;
    warnings?: string[];
  };
};

type AssistantSkill = {
  key: string;
  name: string;
  name_en?: string;
  mode?: string;
  description?: string;
  source_url?: string;
  enabled?: boolean;
};

function clamp(x: number, y: number) {
  const maxX = Math.max(8, window.innerWidth - 64);
  const maxY = Math.max(8, window.innerHeight - 64);
  return { x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) };
}

function loadPos() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === "number" && typeof pos.y === "number") return pos;
  } catch {
    return null;
  }
  return null;
}

function trimAssistantHistory(items: AssistantHistoryMessage[]) {
  return items
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.content.trim())
    .map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }))
    .slice(-ASSISTANT_HISTORY_LIMIT);
}

function loadAssistantHistory(): AssistantHistoryMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? trimAssistantHistory(parsed) : [];
  } catch {
    return [];
  }
}

function getShanghaiNowText() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  return `${date} ${time} (Asia/Shanghai)`;
}

function getSseData(block: string) {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("\n");
}

function parseAssistantEvent(data: string): AssistantStreamEvent {
  const trimmed = data.trim();
  if (!trimmed) return {};
  if (trimmed === "[DONE]") return { done: true };
  if (trimmed.startsWith("[ERROR]")) {
    return { error: trimmed.slice(8).trim() || "AI服务调用失败" };
  }
  try {
    const payload = JSON.parse(trimmed);
    if (payload?.type === "done") return { done: true };
    if (payload?.type === "error") {
      return { error: String(payload.message || payload.error || "AI服务调用失败") };
    }
    if (payload?.type === "delta") {
      return { delta: String(payload.delta ?? "") };
    }
    if (typeof payload?.delta === "string") return { delta: payload.delta };
    if (typeof payload?.content === "string") return { delta: payload.content };
  } catch {
    return { delta: data };
  }
  return {};
}

function unwrapMarkdownFence(content: string) {
  const trimmed = (content || "").trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : content;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAssistantContent(content: string) {
  const raw = content || "";
  const eventPattern =
    /\{\s*"type"\s*:\s*"(delta|done|error)"(?:\s*,\s*"(?:delta|message|error)"\s*:\s*"(?:\\.|[^"\\])*")?\s*\}/g;
  let result = "";
  let lastIndex = 0;
  let matched = false;
  for (const match of raw.matchAll(eventPattern)) {
    const prefix = raw.slice(lastIndex, match.index);
    if (prefix.trim()) return raw;
    try {
      const payload = JSON.parse(match[0]);
      if (payload?.type === "delta") result += String(payload.delta ?? "");
      if (payload?.type === "error") result += String(payload.message || payload.error || "");
      matched = true;
    } catch {
      return raw;
    }
    lastIndex = (match.index || 0) + match[0].length;
  }
  if (!matched || raw.slice(lastIndex).trim()) return raw;
  return result;
}

function protectCodeFences(content: string, transform: (value: string) => string) {
  const fences: string[] = [];
  const protectedText = content.replace(/```[\s\S]*?```/g, (block) => {
    const token = `@@QCODE_${fences.length}@@`;
    fences.push(block);
    return token;
  });
  return transform(protectedText).replace(/@@QCODE_(\d+)@@/g, (_, index) => fences[Number(index)] || "");
}

function normalizeCodeFences(content: string) {
  const languagePattern =
    "python|py|javascript|js|typescript|ts|tsx|jsx|json|bash|sh|shell|sql|yaml|yml|html|css|text|md|markdown";
  let text = content
    .replace(/([^\n])```/g, "$1\n\n```")
    .replace(new RegExp(`\`\`\`(${languagePattern})(?=[^\\s\\n\`])`, "gi"), "```$1\n")
    .replace(new RegExp(`\`\`\`(${languagePattern})\\s+`, "gi"), "```$1\n");

  const lines = text.split("\n");
  const result: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      result.push(line);
      continue;
    }
    if (
      inFence &&
      (/^---+\s*$/.test(trimmed) ||
        /^#{2,6}\s+/.test(trimmed) ||
        /^\|.+\|$/.test(trimmed) ||
        /^[一二三四五六七八九十]+、/.test(trimmed))
    ) {
      result.push("```");
      inFence = false;
    }
    result.push(line);
  }
  if (inFence) result.push("```");
  text = result.join("\n");
  return text.replace(/\n{3,}```/g, "\n\n```");
}

function splitPipeRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isPipeSeparator(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line.trim());
}

function isLikelyPipeTableLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed === "|") return true;
  if (trimmed.startsWith("|")) return true;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return pipeCount >= 2;
}

function normalizePipeTables(content: string) {
  const lines = content.split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!isLikelyPipeTableLine(lines[i])) {
      result.push(lines[i]);
      continue;
    }

    const block: string[] = [];
    while (i < lines.length && isLikelyPipeTableLine(lines[i])) {
      block.push(lines[i]);
      i += 1;
    }
    i -= 1;

    const rows = block
      .filter((line) => line.trim() !== "|")
      .filter((line) => !isPipeSeparator(line))
      .map(splitPipeRow)
      .filter((row) => row.length >= 2 && row.some((cell) => cell && !/^-+$/.test(cell)));

    if (rows.length < 2) {
      result.push(...block);
      continue;
    }

    const columnCount = Math.max(...rows.map((row) => row.length));
    const normalizeRow = (row: string[]) =>
      `| ${Array.from({ length: columnCount }, (_, idx) => row[idx] || "").join(" | ")} |`;
    result.push(normalizeRow(rows[0]));
    result.push(`| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`);
    rows.slice(1).forEach((row) => result.push(normalizeRow(row)));
  }
  return result.join("\n");
}

function extractHtmlTables(content: string) {
  const tables: string[] = [];
  const lines = content.split("\n");
  const result: string[] = [];

  const nextNonBlankStartsTable = (start: number) => {
    for (let idx = start; idx < lines.length; idx += 1) {
      const trimmed = lines[idx].trim();
      if (!trimmed) continue;
      return isLikelyPipeTableLine(trimmed);
    }
    return false;
  };

  const buildTable = (block: string[]) => {
    const rows = block
      .filter((line) => line.trim() && line.trim() !== "|")
      .filter((line) => !isPipeSeparator(line))
      .map(splitPipeRow)
      .filter((row) => row.length >= 2 && row.some((cell) => cell && !/^-+$/.test(cell)));

    if (rows.length < 2) return null;

    const columnCount = Math.max(...rows.map((row) => row.length));
    const normalizeRow = (row: string[]) =>
      Array.from({ length: columnCount }, (_, idx) => row[idx] || "");
    const [header, ...body] = rows.map(normalizeRow);

    return [
      '<div class="assistant-table-wrap"><table class="assistant-table">',
      `<thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>`,
      `<tbody>${body
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`,
      "</table></div>",
    ].join("");
  };

  for (let i = 0; i < lines.length; i += 1) {
    if (!isLikelyPipeTableLine(lines[i])) {
      result.push(lines[i]);
      continue;
    }

    const block: string[] = [];
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (isLikelyPipeTableLine(trimmed)) {
        block.push(lines[i]);
        i += 1;
        continue;
      }
      if (!trimmed && nextNonBlankStartsTable(i + 1)) {
        block.push(lines[i]);
        i += 1;
        continue;
      }
      break;
    }
    i -= 1;

    const tableHtml = buildTable(block);
    if (!tableHtml) {
      result.push(...block);
      continue;
    }

    const token = `@@QTABLE_${tables.length}@@`;
    tables.push(tableHtml);
    result.push(token);
  }

  return { markdown: result.join("\n"), tables };
}

function normalizeTabTables(content: string) {
  const lines = content.split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes("\t")) {
      result.push(lines[i]);
      continue;
    }
    const block: string[] = [];
    while (i < lines.length && lines[i].includes("\t")) {
      block.push(lines[i]);
      i += 1;
    }
    i -= 1;
    const rows = block.map((line) => line.split("\t").map((cell) => cell.trim()));
    const columnCount = Math.max(...rows.map((row) => row.length));
    if (columnCount < 2) {
      result.push(...block);
      continue;
    }
    const normalizeRow = (row: string[]) =>
      `| ${Array.from({ length: columnCount }, (_, idx) => row[idx] || "").join(" | ")} |`;
    result.push(normalizeRow(rows[0]));
    result.push(`| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`);
    rows.slice(1).forEach((row) => result.push(normalizeRow(row)));
  }
  return result.join("\n");
}

function normalizeMarkdownStructure(content: string) {
  const normalized = normalizeCodeFences(unwrapMarkdownFence(normalizeAssistantContent(content)))
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\\%/g, "%")
    .replace(/(^|[^\d])\.(\d+)/g, "$10.$2")
    .replace(/([=+\-−])\s*\.\s*(?=[×*÷A-Za-z])/g, "$1 ? ");

  return protectCodeFences(normalized, (value) => {
    const prepared = value
      .replace(/([^\n])(\|\s*[^|\n]+\s*\|[^\n]*\|)/g, "$1\n\n$2")
      .replace(/(\n\|[^\n]*)\n{2,}(?=\|)/g, "$1\n");
    return normalizePipeTables(normalizeTabTables(prepared))
      .replace(/[ \t]+\n/g, "\n")
      .replace(/([^\n])>\s+([\u4e00-\u9fff])/g, "$1\n\n> $2")
      .replace(/([^\n])([#]{2,6}\s+)/g, "$1\n\n$2")
      .replace(/(^|\n)#{1,6}\.\s*/g, "$1### ")
      .replace(/([^\n])---(?=\s|$)/g, "$1\n\n---\n\n")
      .replace(/---(?=\S)/g, "---\n\n")
      .replace(/([^\n])-\s+([\u4e00-\u9fffA-Za-z*])/g, "$1\n- $2")
      .replace(
        /(^|\n)([一二三四五六七八九十]+、[^\n]{2,16}?)(?=(短线|股票|买入|卖出|风控|止盈|止损|回测|参数|示例|条件|公式|通常|当日|核心|策略|成交|价格|风险))/g,
        "$1\n\n### $2\n\n",
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  });
}

function formatMathExpression(expression: string) {
  const repaired = expression
    .trim()
    .replace(/\\%/g, "%")
    .replace(/(^|[^\d])\.(\d+)/g, "$10.$2")
    .replace(/([=+\-−])\s*\.\s*(?=[×*÷A-Za-z])/g, "$1 ? ");
  let html = escapeHtml(repaired)
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/&gt;=/g, "≥")
    .replace(/&lt;=/g, "≤")
    .replace(/!=/g, "≠")
    .replace(/\*/g, "×");
  html = html
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="assistant-frac"><span>$1</span><span>$2</span></span>')
    .replace(/([A-Za-z][A-Za-z0-9]*)_\{([^}]+)\}\^\{([^}]+)\}/g, "$1<sub>$2</sub><sup>$3</sup>")
    .replace(/([A-Za-z][A-Za-z0-9]*)\^\{([^}]+)\}_\{([^}]+)\}/g, "$1<sub>$3</sub><sup>$2</sup>")
    .replace(/([A-Za-z][A-Za-z0-9]*)_\{([^}]+)\}/g, "$1<sub>$2</sub>")
    .replace(/([A-Za-z][A-Za-z0-9]*)\^\{([^}]+)\}/g, "$1<sup>$2</sup>")
    .replace(/([A-Za-z][A-Za-z0-9]*)_([A-Za-z0-9+-]+)/g, "$1<sub>$2</sub>")
    .replace(/([A-Za-z][A-Za-z0-9]*)\^([A-Za-z0-9+-]+)/g, "$1<sup>$2</sup>");
  return html;
}

function extractMathBlocks(content: string) {
  const mathHtml: string[] = [];
  const addMath = (expression: string, block: boolean) => {
    const token = `@@QMATH_${mathHtml.length}@@`;
    const tag = block ? "div" : "span";
    mathHtml.push(
      `<${tag} class="${block ? "assistant-math-block" : "assistant-math-inline"}">${formatMathExpression(expression)}</${tag}>`,
    );
    return token;
  };
  const markdown = protectCodeFences(content, (value) =>
    value
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression) => addMath(expression, true))
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression) => addMath(expression, true))
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression) => addMath(expression, false))
      .replace(/(^|\n)\[\s*\n([^\]]{1,500}(?:[<>=_^]|max|min|sum|avg|mean)[^\]]{0,500})\n\](?=\n|$)/gi, (_, prefix, expression) => `${prefix}${addMath(expression, true)}`)
      .replace(/(^|\n)\[\s*([^\]\n]*(?:[<>=_^]|max|min|sum|avg|mean)[^\]\n]*)\s*\](?=\n|$)/gi, (_, prefix, expression) => `${prefix}${addMath(expression, true)}`),
  );
  return { markdown, mathHtml };
}

function highlightCodeBlocks(html: string) {
  const keywordPattern =
    /\b(and|as|assert|async|await|break|class|continue|def|elif|else|except|False|finally|for|from|if|import|in|is|lambda|None|not|or|pass|return|True|try|while|with|yield|print|range|len|mean|max|min|sum)\b/g;

  const highlightPython = (code: string) =>
    code
      .split("\n")
      .map((line) => {
        const commentIndex = line.indexOf("#");
        const body = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
        const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
        const highlightedBody = body
          .replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="code-string">$1</span>')
          .replace(keywordPattern, '<span class="code-keyword">$1</span>')
          .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="code-number">$1</span>');
        return `${highlightedBody}${comment ? `<span class="code-comment">${comment}</span>` : ""}`;
      })
      .join("\n");

  return html.replace(
    /<pre><code class="language-(python|py)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => `<pre class="assistant-code-block"><code class="language-${lang}">${highlightPython(code)}</code></pre>`,
  );
}

function renderMarkdown(content: string) {
  const normalized = normalizeMarkdownStructure(content);
  const { markdown: tableMarkdown, tables } = extractHtmlTables(normalized);
  const { markdown, mathHtml } = extractMathBlocks(tableMarkdown);
  const html = highlightCodeBlocks(marked.parse(markdown, { gfm: true, breaks: true }) as string)
    .replace(/<p>\s*@@QTABLE_(\d+)@@\s*<\/p>/g, (_, index) => tables[Number(index)] || "")
    .replace(/@@QTABLE_(\d+)@@/g, (_, index) => tables[Number(index)] || "")
    .replace(/@@QMATH_(\d+)@@/g, (_, index) => mathHtml[Number(index)] || "");
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["sub", "sup", "span", "table", "thead", "tbody", "tr", "th", "td"],
    ADD_ATTR: ["class"],
  });
}

function renderInlineText(text: string) {
  return String(text || "")
    .split("\n")
    .map((line, index, lines) => (
      <span key={`${line}-${index}`}>
        {line}
        {index < lines.length - 1 ? <br /> : null}
      </span>
    ));
}

function structuredBlocksToText(blocks: AssistantBlock[]) {
  return blocks
    .map((block) => {
      if (block.type === "heading") return block.text;
      if (block.type === "paragraph" || block.type === "callout") return block.text;
      if (block.type === "list") return block.items.join("\n");
      if (block.type === "formula") return block.latex;
      if (block.type === "code") return block.content;
      if (block.type === "table") {
        return [block.columns.join("\t"), ...block.rows.map((row) => row.join("\t"))].join("\n");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function AssistantBlockRenderer({ blocks }: { blocks: AssistantBlock[] }) {
  return (
    <div className="assistant-structured">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const level = Math.max(2, Math.min(4, Number(block.level || 2)));
          const Heading = (`h${level}` as keyof JSX.IntrinsicElements);
          return <Heading key={index}>{block.text}</Heading>;
        }
        if (block.type === "paragraph") {
          return <p key={index}>{renderInlineText(block.text)}</p>;
        }
        if (block.type === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInlineText(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "table") {
          return (
            <div key={index} className="assistant-table-wrap">
              <table className="assistant-table">
                <thead>
                  <tr>
                    {block.columns.map((column, columnIndex) => (
                      <th key={`${column}-${columnIndex}`}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {block.columns.map((_, columnIndex) => (
                        <td key={columnIndex}>{renderInlineText(row[columnIndex] || "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "formula") {
          const html = DOMPurify.sanitize(formatMathExpression(block.latex), {
            ADD_TAGS: ["sub", "sup", "span"],
            ADD_ATTR: ["class"],
          });
          return (
            <div
              key={index}
              className="assistant-math-block"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        if (block.type === "code") {
          const language = (block.language || "text").replace(/[^a-z0-9_-]/gi, "") || "text";
          const rawHtml = `<pre><code class="language-${language}">${escapeHtml(
            block.content,
          )}</code></pre>`;
          const html = DOMPurify.sanitize(highlightCodeBlocks(rawHtml), {
            ADD_TAGS: ["span"],
            ADD_ATTR: ["class"],
          });
          return <div key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        if (block.type === "callout") {
          const tone = (block.tone || "info").replace(/[^a-z0-9_-]/gi, "") || "info";
          return (
            <div key={index} className={`assistant-callout assistant-callout-${tone}`}>
              {renderInlineText(block.text)}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function AssistantFab() {
  const { t, lang } = useLanguage();
  const { market, definition } = useMarket();
  const { selectedModel } = useAiModelSelection("assistant");
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState(() => loadPos() || { x: window.innerWidth - 84, y: window.innerHeight - 120 });
  const [touchAnchored, setTouchAnchored] = useState(() =>
    window.matchMedia("(max-width: 820px), (pointer: coarse)").matches,
  );
  const [dragging, setDragging] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [structuredBlocks, setStructuredBlocks] = useState<AssistantBlock[] | null>(null);
  const [streamStatus, setStreamStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<AssistantHistoryMessage[]>(() => loadAssistantHistory());
  const [researchMode, setResearchMode] = useState(false);
  const [assistantSkills, setAssistantSkills] = useState<AssistantSkill[]>([]);
  const [selectedSkillKey, setSelectedSkillKey] = useState("serenity");
  const [skillsLoading, setSkillsLoading] = useState(false);
  const responseScrollRef = useRef<HTMLDivElement | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const dragMeta = useRef({ dx: 0, dy: 0, moved: false });
  const availableResearchSkills = useMemo(
    () => assistantSkills.filter((item) => (item.mode || "research") === "research"),
    [assistantSkills],
  );
  const activeSkill = useMemo(
    () => availableResearchSkills.find((item) => item.key === selectedSkillKey) || availableResearchSkills[0],
    [availableResearchSkills, selectedSkillKey],
  );
  const quickQuestions = useMemo(
    () =>
      researchMode
        ? (lang === "zh"
          ? [
              `用投研模式分析${definition.labelZh}代表性公司`,
              `用 Serenity 框架研究${definition.labelZh}龙头`,
              `挑战一只${definition.labelZh}公司的投资逻辑`,
              `分析${definition.labelZh}当前产业链机会`,
            ]
          : [
              `Analyze a leading ${definition.labelEn} company`,
              `Use Serenity on a ${definition.labelEn} market leader`,
              `Challenge an investment thesis in ${definition.labelEn}`,
              `Map current ${definition.labelEn} supply-chain opportunities`,
            ])
        : (lang === "zh"
          ? [
              "帮我总结今天市场风险点",
              "给我一个短线突破策略模板",
              "当前仓位怎么做止损更稳健？",
              "请解释下量化回测里的夏普比率",
            ]
          : [
              "Summarize today's market risks",
              "Give me a breakout strategy template",
              "How should I set safer stop-loss for current positions?",
              "Explain Sharpe ratio in backtesting",
            ]),
    [definition.labelEn, definition.labelZh, lang, researchMode],
  );

  const markdownHtml = useMemo(
    () => (panelOpen && answer ? renderMarkdown(answer) : ""),
    [answer, panelOpen],
  );
  const errorHtml = useMemo(
    () => (panelOpen && error ? renderMarkdown(error) : ""),
    [error, panelOpen],
  );
  const hasAssistantContent = Boolean((structuredBlocks && structuredBlocks.length > 0) || answer);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px), (pointer: coarse)");
    const sync = () => setTouchAnchored(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (touchAnchored) return;
    const next = clamp(pos.x, pos.y);
    if (next.x !== pos.x || next.y !== pos.y) setPos(next);
  }, [touchAnchored]);

  useEffect(() => {
    if (touchAnchored) return;
    localStorage.setItem(KEY, JSON.stringify(pos));
  }, [pos, touchAnchored]);

  useEffect(() => {
    if (!panelOpen || !researchMode) return;
    let cancelled = false;
    setSkillsLoading(true);
    api
      .getAssistantSkills()
      .then((payload: any) => {
        if (cancelled) return;
        const skills = Array.isArray(payload?.skills) ? payload.skills : [];
        setAssistantSkills(skills);
        const researchSkills = skills.filter((item: AssistantSkill) => (item.mode || "research") === "research");
        if (researchSkills.length > 0 && !researchSkills.some((item: AssistantSkill) => item.key === selectedSkillKey)) {
          setSelectedSkillKey(researchSkills[0].key);
        }
      })
      .catch(() => {
        if (!cancelled) setAssistantSkills([]);
      })
      .finally(() => {
        if (!cancelled) setSkillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [panelOpen, researchMode]);

  useEffect(() => {
    function onResize() {
      if (touchAnchored) return;
      setPos((p) => clamp(p.x, p.y));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [touchAnchored]);

  useEffect(() => {
    return () => requestControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimAssistantHistory(history)));
  }, [history]);

  useEffect(() => {
    if (!loading && !hasAssistantContent) return;
    const frame = window.requestAnimationFrame(() => {
      const container = responseScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [answer, structuredBlocks, streamStatus, loading, hasAssistantContent]);

  const ask = async () => {
    if (loading) return;
    const prompt = q.trim();
    if (!prompt) return;
    await askWithPrompt(prompt);
  };

  const askWithPrompt = async (prompt: string) => {
    if (loading) return;
    const normalized = prompt.trim();
    if (!normalized) return;
    if (researchMode && !activeSkill) {
      setError(lang === "zh" ? "投研模式暂未启用可用 Skill，请联系系统管理员配置。" : "No research skill is enabled. Contact the administrator.");
      return;
    }
    setQ(normalized);
    setLoading(true);
    setError("");
    setAnswer("");
    setStructuredBlocks(null);
    setStreamStatus(lang === "zh" ? "正在连接模型..." : "Connecting to the model...");
    const conversationHistory = trimAssistantHistory(history);
    const userMessage: AssistantHistoryMessage = { role: "user", content: normalized };
    setHistory(trimAssistantHistory([...conversationHistory, userMessage]));
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let streamedBlocks: AssistantBlock[] = [];
    let finalBlocks: AssistantBlock[] = [];
    let streamedAnswer = "";
    let receivedFinal = false;
    try {
      await api.streamAssistantStructured(
        {
          message: normalized,
          model: selectedModel || undefined,
          context: {
            page: location.pathname,
            market,
            language: lang,
          },
          history: conversationHistory,
          mode: researchMode ? "research" : "structured",
          skill_key: researchMode ? activeSkill?.key : undefined,
        },
        {
          onDelta: (delta) => {
            streamedAnswer += delta;
            setAnswer(streamedAnswer);
          },
          onEvent: (event) => {
            if (event?.type === "status") {
              const phase = String(event.phase || "");
              const englishStatus: Record<string, string> = {
                connecting: "Connecting to the model and preparing research data...",
                validating: "Validating tables, formulas and code...",
                repairing: "Repairing incomplete structured content...",
              };
              setStreamStatus(
                lang === "zh"
                  ? String(event.message || "正在生成回答...")
                  : (englishStatus[phase] || "Generating response..."),
              );
              return;
            }
            if (event?.type === "heartbeat") {
              const elapsed = Math.max(0, Number(event.elapsed_seconds || 0));
              setStreamStatus(
                lang === "zh"
                  ? `模型正在生成，已等待 ${elapsed} 秒...`
                  : `The model is generating... ${elapsed}s elapsed`,
              );
              return;
            }
            if (event?.type === "block" && event.block) {
              const index = Math.max(0, Number(event.index || 0));
              streamedBlocks = [...streamedBlocks];
              streamedBlocks[index] = event.block as AssistantBlock;
              streamedBlocks = streamedBlocks.filter(Boolean);
              setStructuredBlocks(streamedBlocks);
              setStreamStatus(lang === "zh" ? "正在继续生成..." : "Continuing generation...");
              return;
            }
            if (event?.type === "final") {
              receivedFinal = true;
              const payload = event as AssistantStructuredResponse;
              if (Array.isArray(payload.blocks) && payload.blocks.length > 0) {
                finalBlocks = payload.blocks;
                streamedBlocks = payload.blocks;
                setStructuredBlocks(payload.blocks);
                setAnswer("");
              }
              setStreamStatus("");
            }
          },
        },
        controller.signal,
      );
      const completedBlocks = finalBlocks.length > 0 ? finalBlocks : streamedBlocks;
      if (!receivedFinal && completedBlocks.length === 0 && !streamedAnswer.trim()) {
        throw new Error(lang === "zh" ? "流式响应意外中断" : "The streaming response ended unexpectedly");
      }
      const historyContent = completedBlocks.length > 0
        ? structuredBlocksToText(completedBlocks)
        : streamedAnswer;
      if (historyContent.trim()) {
        setHistory(
          trimAssistantHistory([
            ...conversationHistory,
            userMessage,
            { role: "assistant", content: historyContent },
          ]),
        );
      }
    } catch (e: any) {
      if (controller.signal.aborted) {
        setStreamStatus(lang === "zh" ? "已停止生成" : "Generation stopped");
      } else {
        setError(e?.message || (lang === "zh" ? "系统响应失联" : "Assistant call failed"));
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setLoading(false);
      window.setTimeout(() => setStreamStatus(""), 1200);
    }
  };

  return (
    <>
      <button
        ref={ref}
        className={`qs-assistant-fab ${dragging ? "dragging" : ""}`}
        style={touchAnchored ? undefined : { left: pos.x, top: pos.y }}
        title={t("aiAssistant")}
        aria-label={t("aiAssistant")}
        onClick={() => {
          if (touchAnchored) setPanelOpen(true);
        }}
        onPointerDown={(e) => {
          if (touchAnchored) return;
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          dragMeta.current.dx = e.clientX - rect.left;
          dragMeta.current.dy = e.clientY - rect.top;
          dragMeta.current.moved = false;
          setDragging(true);
          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (touchAnchored) return;
          if (!dragging) return;
          dragMeta.current.moved = true;
          const next = clamp(e.clientX - dragMeta.current.dx, e.clientY - dragMeta.current.dy);
          setPos(next);
        }}
        onPointerUp={() => {
          if (touchAnchored) return;
          const moved = dragMeta.current.moved;
          setDragging(false);
          if (!moved) setPanelOpen(true);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        <Bot size={26} aria-hidden="true" />
      </button>

      {panelOpen && (
        <div className="pointer-events-none fixed inset-0 z-[120]">
          <div 
            className="qs-assistant-panel pointer-events-auto fixed bottom-4 right-4 flex w-[420px] max-w-[calc(100vw-2rem)] translate-y-0 flex-col overflow-hidden"
            style={{ animation: "slideUp 0.26s cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            {/* Header Area */}
            <div className="qs-assistant-panel-header relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="qs-assistant-panel-icon">
                  <MessageCircleMore size={22} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="qs-assistant-panel-title">{lang === "zh" ? "量化投研助手" : "Quant Research Assistant"}</h3>
                  <p className="qs-assistant-panel-subtitle">
                    {researchMode
                      ? (lang === "zh" ? "产业链卡点、证据分层与反方验证" : "Bottlenecks, evidence ladder and thesis challenge")
                      : (lang === "zh" ? "策略、因子、行情与回测协作" : "Strategy, factor, market and backtest copilot")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  className="qs-assistant-close"
                  onClick={() => setPanelOpen(false)}
                  aria-label={lang === "zh" ? "关闭量化投研助手" : "Close quant research assistant"}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="assistant-mode-shell qs-assistant-surface px-6 pt-4">
              <div className="assistant-mode-row">
                <button
                  type="button"
                  className={`assistant-mode-btn ${!researchMode ? "active" : ""}`}
                  onClick={() => setResearchMode(false)}
                >
                  {lang === "zh" ? "协作问答" : "Copilot"}
                </button>
                <button
                  type="button"
                  className={`assistant-mode-btn ${researchMode ? "active" : ""}`}
                  onClick={() => setResearchMode(true)}
                >
                  {lang === "zh" ? "投研模式" : "Research Mode"}
                </button>
                {researchMode && (
                  <div className="assistant-skill-select-wrap">
                    <select
                      className="assistant-skill-select"
                      value={activeSkill?.key || ""}
                      onChange={(event) => setSelectedSkillKey(event.target.value)}
                      disabled={skillsLoading || availableResearchSkills.length === 0}
                    >
                      {availableResearchSkills.length === 0 ? (
                        <option value="">
                          {skillsLoading
                            ? (lang === "zh" ? "加载中" : "Loading")
                            : (lang === "zh" ? "未启用 Skill" : "No skill")}
                        </option>
                      ) : (
                        availableResearchSkills.map((skill) => (
                          <option key={skill.key} value={skill.key}>
                            {lang === "zh" ? skill.name : (skill.name_en || skill.name)}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
              </div>
              {researchMode && (
                <p className="assistant-mode-desc">
                  {activeSkill?.description ||
                    (lang === "zh"
                      ? "使用管理员挂载的投研 Skill，对系统市场数据和股票内容进行专业化分析。"
                      : "Use administrator-mounted research skills against system market data.")}
                </p>
              )}
            </div>

            {/* Main Chat Interface */}
            <div className="qs-assistant-surface relative flex min-h-[140px] flex-col px-6 pt-4">
              {hasAssistantContent ? (
                <div
                  ref={responseScrollRef}
                  className="mb-4 max-h-[35vh] overflow-y-auto pr-2 custom-scrollbar"
                >
                  <div className="assistant-markdown qs-assistant-response inline-block w-full p-4 text-sm font-medium leading-relaxed">
                    {structuredBlocks && structuredBlocks.length > 0 ? (
                      <AssistantBlockRenderer blocks={structuredBlocks} />
                    ) : (
                      <div dangerouslySetInnerHTML={{ __html: markdownHtml }} />
                    )}
                    {loading && (
                      <div className="assistant-stream-progress" role="status" aria-live="polite">
                        <span className="assistant-stream-cursor" aria-hidden="true" />
                        <span>{streamStatus || (lang === "zh" ? "正在生成..." : "Generating...")}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-4 flex flex-col items-center justify-center py-6 text-center">
                  <div className={`qs-assistant-empty-icon mb-2 ${loading ? "is-streaming" : ""}`}>
                    {loading ? (
                      <LoaderCircle className="animate-spin" size={28} aria-hidden="true" />
                    ) : (
                      <MessageCircleMore size={28} aria-hidden="true" />
                    )}
                  </div>
                  <span className="qs-assistant-empty-label text-base font-black">
                    {loading
                      ? (streamStatus || (lang === "zh" ? "正在生成回答..." : "Generating response..."))
                      : researchMode
                      ? (lang === "zh" ? "输入股票，开始专业投研分析" : "Enter a stock for research analysis")
                      : (lang === "zh" ? "今天需要什么投资见解？" : "How can I help you today?")}
                  </span>
                </div>
              )}

              {error && (
                <div className="qs-assistant-error mb-4 px-4 py-3 text-sm font-bold">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={18} aria-hidden="true" />
                    <div
                      className="assistant-markdown assistant-markdown-error min-w-0 flex-1"
                      dangerouslySetInnerHTML={{ __html: errorHtml }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="qs-assistant-surface mt-auto p-6 pt-0">
              <div className="mb-3 flex flex-wrap gap-2">
                {quickQuestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="qs-assistant-quick-question px-3 py-1.5 text-xs font-bold"
                    onClick={() => {
                      void askWithPrompt(item);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="relative flex items-end">
                <textarea
                  className="qs-assistant-input w-full min-h-[90px] resize-none px-4 py-3 pb-12 text-sm font-medium focus:outline-none"
                  placeholder={
                    researchMode
                      ? (lang === "zh"
                        ? `输入${definition.labelZh}代码或名称，例如：分析 ${definition.defaultSymbol}`
                        : `Enter a ${definition.labelEn} ticker or name, e.g. analyze ${definition.defaultSymbol}`)
                      : (lang === "zh" ? "输入策略、因子、行情、回测或风险问题..." : "Ask about strategies, factors, market data, backtests or risk...")
                  }
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void ask();
                    }
                  }}
                />
                <button 
                  className={`qs-assistant-send absolute bottom-3 right-3 flex h-9 w-[110px] items-center justify-center gap-1.5 px-3 font-bold disabled:opacity-60 ${loading ? "is-stop" : ""}`}
                  onClick={() => {
                    if (loading) requestControllerRef.current?.abort();
                    else void ask();
                  }}
                  disabled={!loading && !q.trim()}
                  aria-label={loading
                    ? (lang === "zh" ? "停止生成" : "Stop generation")
                    : (lang === "zh" ? "发送" : "Send")}
                >
                  {loading ? (
                    <>
                      <Square size={14} fill="currentColor" aria-hidden="true" />
                      {lang === "zh" ? "停止" : "Stop"}
                    </>
                  ) : (
                    <>
                      {lang === "zh" ? "发送" : "Send"}
                      <Send size={15} aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
