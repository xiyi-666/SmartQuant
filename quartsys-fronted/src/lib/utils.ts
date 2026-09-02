// ============================================
// QuartSys Utility Functions
// ============================================

/**
 * Format number as currency (CNY)
 */
export function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return "-";
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format number with thousand separators
 */
export function fmtNumber(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return "-";
  return n.toLocaleString("zh-CN");
}

/**
 * Format percentage with sign
 */
export function fmtPct(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return "-";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/**
 * Format volume (e.g. 1.2M, 500K)
 */
export function fmtVol(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return "-";
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(2) + "万";
  return n.toLocaleString("zh-CN");
}

/**
 * Format date string
 */
export function fmtDate(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("zh-CN");
  } catch {
    return dateStr;
  }
}

/**
 * Format datetime string
 */
export function fmtDateTime(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get color class based on change percentage
 */
export function getChangeColorClass(pct: number | undefined): string {
  if (pct === undefined || pct === null) return "text-on-surface-variant";
  return pct >= 0 ? "text-market-up" : "text-market-down";
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Poll a function until condition is met or timeout
 */
export async function poll<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  interval: number = 2000,
  timeout: number = 60000
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (condition(result)) return result;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("Polling timeout");
}

/**
 * Parse HTML string to Document
 */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/**
 * Extract styles from HTML document
 */
export function extractStyles(doc: Document): string[] {
  return Array.from(doc.querySelectorAll("head style"))
    .map((s) => s.textContent || "")
    .filter(Boolean);
}

/**
 * Clean prototype HTML for integration
 * - Remove nav/aside (handled by AppShell)
 * - Adjust layout classes
 */
export function cleanPrototypeHtml(doc: Document): { html: string; styles: string[] } {
  // Remove existing navigation elements
  doc.querySelector("body > nav")?.remove();
  doc.querySelector("body > aside")?.remove();
  doc.querySelector("body > header")?.remove();

  // Clean up main element classes
  const main = doc.querySelector("main");
  if (main) {
    const cleaned = (main.getAttribute("class") || "")
      .replace(/\bpl-64\b/g, "")
      .replace(/\bpt-14\b/g, "")
      .replace(/\bml-64\b/g, "")
      .replace(/\bh-screen\b/g, "")
      .replace(/\boverflow-y-auto\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    main.setAttribute("class", cleaned);
  }

  // Remove floating assistant buttons
  const floatingAiBtns = Array.from(doc.querySelectorAll("button.fixed")).filter((btn) =>
    (btn.textContent || "").includes("psychology")
  );
  floatingAiBtns.forEach((btn) => btn.remove());

  // Extract styles
  const styles = extractStyles(doc);

  // Get body inner HTML (without scripts that might conflict)
  const html = doc.body.innerHTML;

  return { html, styles };
}

/**
 * Inject styles into document head
 */
export function injectStyles(styles: string[], prefix: string): string[] {
  const ids: string[] = [];
  styles.forEach((css, idx) => {
    const id = `${prefix}-${idx}`;
    ids.push(id);
    let node = document.getElementById(id) as HTMLStyleElement | null;
    if (!node) {
      node = document.createElement("style");
      node.id = id;
      document.head.appendChild(node);
    }
    node.textContent = css;
  });
  return ids;
}

/**
 * Remove injected styles
 */
export function removeStyles(ids: string[]): void {
  ids.forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.remove();
  });
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T = any>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * Generate unique ID
 */
export function uid(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Calculate PnL color class
 */
export function pnlClass(value: number): string {
  if (value > 0) return "text-market-up";
  if (value < 0) return "text-market-down";
  return "text-on-surface-variant";
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str: string, maxLen: number): string {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen) + "...";
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
