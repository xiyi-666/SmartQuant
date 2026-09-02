import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../..");
const baseUrl = process.env.GUIDE_BASE_URL || "http://127.0.0.1:15473";
const username = process.env.GUIDE_USERNAME;
const password = process.env.GUIDE_PASSWORD;
const guideLanguage = process.env.GUIDE_LANGUAGE || "zh";
const assetVariant = process.env.GUIDE_ASSET_VARIANT || (guideLanguage === "zh" ? "" : guideLanguage);
const defaultMarketByLanguage = { zh: "CN", "zh-TW": "HK", en: "US" };
const guideMarket = process.env.GUIDE_MARKET || defaultMarketByLanguage[guideLanguage];
const defaultQuoteCodeByMarket = { CN: "600519", HK: "hk00700", US: "usNVDA" };
const guideQuoteCode = process.env.GUIDE_QUOTE_CODE || defaultQuoteCodeByMarket[guideMarket];
const outputDir = path.resolve(frontendRoot, "public/user-guide/assets", assetVariant);

function requireGuideCredentials() {
  if (!username || !password) {
    throw new Error("Set GUIDE_USERNAME and GUIDE_PASSWORD before capturing user-guide screenshots.");
  }
  if (!new Set(["zh", "zh-TW", "en"]).has(guideLanguage)) {
    throw new Error("GUIDE_LANGUAGE must be zh, zh-TW, or en.");
  }
  if (!new Set(["CN", "HK", "US"]).has(guideMarket) || !guideQuoteCode) {
    throw new Error("GUIDE_MARKET must be CN, HK, or US and resolve to a quote code.");
  }
}

async function useLightTheme(page) {
  await page.evaluate(({ language, market }) => {
    const key = "quartsys_prefs";
    let prefs = {};
    try {
      prefs = JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      // A fresh capture context may contain malformed browser storage.
    }
    localStorage.setItem(key, JSON.stringify({ ...prefs, theme: "light" }));
    localStorage.setItem("quartsys_lang", language);
    localStorage.setItem("quartsys_market", market);
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.remove("dark");
  }, { language: guideLanguage, market: guideMarket });
}

async function waitForVisualStability(page) {
  // Vite keeps a development connection open, so document.readyState can stay
  // at "interactive" after React has rendered the complete page.
  await page.waitForFunction(() => document.readyState !== "loading", { timeout: 30_000 });
  await page.evaluate(async () => {
    // Some dev-server font requests never settle even though the fallback font
    // and the full application UI are already painted. Do not block capture
    // forever on that browser-level promise.
    await Promise.race([
      document.fonts?.ready,
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll(".animate-pulse")).some((node) => node.checkVisibility()),
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1_200);
}

async function applyTraditionalScreenshotText(page) {
  if (guideLanguage !== "zh-TW") return;
  await page.evaluate(async () => {
    const { toTraditionalText } = await import("/src/shared/language.tsx");
    const excluded = "script,style,noscript,textarea,code,pre";
    const convertElement = (element) => {
      if (element.closest(excluded)) return;
      for (const attr of ["title", "aria-label", "placeholder", "alt"]) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        const converted = toTraditionalText(value);
        if (converted !== value) element.setAttribute(attr, converted);
      }
    };
    document.querySelectorAll("[title],[aria-label],[placeholder],[alt]").forEach(convertElement);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (node.nodeValue && !parent?.closest(excluded)) {
        const converted = toTraditionalText(node.nodeValue);
        if (converted !== node.nodeValue) node.nodeValue = converted;
      }
      node = walker.nextNode();
    }
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

async function saveViewportScreenshot(page, filename) {
  // Playwright waits indefinitely for the application's external font requests.
  // Capture the already-stable Chromium viewport directly instead.
  const cdp = await page.context().newCDPSession(page);
  const image = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(path.join(outputDir, filename), Buffer.from(image.data, "base64"));
  await cdp.detach();
  console.log(`Saved ${path.join(assetVariant || "default", filename)}`);
}

async function navigateWithinApp(page, pathname) {
  const next = new URL(pathname, baseUrl);
  const target = `${next.pathname}${next.search}`;
  const currentUrl = new URL(page.url());
  const current = `${currentUrl.pathname}${currentUrl.search}`;
  if (current === target) return;

  const routeLink = page.locator(`a[href="${next.pathname}"]`).first();
  if (await routeLink.isVisible().catch(() => false)) {
    await routeLink.click({ noWaitAfter: true, timeout: 5_000 });
    if (next.search) {
      await page.waitForTimeout(100);
      await page.evaluate((nextTarget) => {
        window.history.replaceState({}, "", nextTarget);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, target);
    }
    return;
  }

  throw new Error(`No in-app navigation link is available for ${next.pathname}.`);
}

async function capture(page, filename, pathname, options = {}) {
  console.log(`Capturing ${filename}`);
  const previousViewport = page.viewportSize();
  if (options.viewport) await page.setViewportSize(options.viewport);
  await navigateWithinApp(page, pathname);
  console.log(`Navigated to ${pathname}`);
  if (options.waitFor) await page.locator(options.waitFor).first().waitFor({ state: "visible", timeout: 20_000 });
  if (options.readyFor) await page.locator(options.readyFor).first().waitFor({ state: "visible", timeout: 30_000 });
  if (options.waitForData) {
    const timeoutMs = options.dataTimeoutMs || 45_000;
    const deadline = Date.now() + timeoutMs;
    while (!(await options.waitForData(page))) {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for rendered data before capturing ${filename}.`);
      }
      console.log(`Waiting for rendered data: ${filename}`);
      await page.waitForTimeout(4_000);
    }
  }
  await waitForVisualStability(page);
  if (options.beforeCapture) await options.beforeCapture(page);
  await applyTraditionalScreenshotText(page);
  await saveViewportScreenshot(page, filename);
  if (previousViewport) await page.setViewportSize(previousViewport);
}

async function login(page) {
  console.log("Signing in for guide capture");
  await page.goto(`${baseUrl}/login`, { waitUntil: "commit", timeout: 60_000 });
  await useLightTheme(page);
  await page.reload({ waitUntil: "commit", timeout: 60_000 });
  await page.locator("#login-username").fill(username);
  await page.locator("#login-password").fill(password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { waitUntil: "commit", timeout: 30_000 }),
    page.locator("button.submit-btn").click(),
  ]);
  console.log("Signed in");
}

async function main() {
  requireGuideCredentials();
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  await context.addInitScript(({ language, market }) => {
    const key = "quartsys_prefs";
    try {
      const prefs = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...prefs, theme: "light" }));
      localStorage.setItem("quartsys_lang", language);
      localStorage.setItem("quartsys_market", market);
    } catch {
      // about:blank does not grant localStorage access; the next document will.
    }
  }, { language: guideLanguage, market: guideMarket });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/login`, { waitUntil: "commit", timeout: 60_000 });
  await useLightTheme(page);
  await page.reload({ waitUntil: "commit", timeout: 60_000 });
  const startAt = Number(process.env.GUIDE_CAPTURE_START || 1);
  if (startAt <= 1) {
    await page.locator(".login-page").waitFor({ state: "visible", timeout: 20_000 });
    await waitForVisualStability(page);
    console.log("Capturing 01-login.png");
    await applyTraditionalScreenshotText(page);
    await saveViewportScreenshot(page, "01-login.png");
  }
  await login(page);

  const captures = [
    [2, "02-dashboard.png", "/dashboard", ".dashboard-page", ".dashboard-index-card-button"],
    [3, "03-market-data.png", `/quote?code=${encodeURIComponent(guideQuoteCode)}`, ".quote-page", ".quote-chart-section"],
    [4, "04-ai-insights.png", "/ai-insights", ".ai-insights-page", ".ai-thermometer-card"],
    [5, "05-factor-mining.png", "/factor-mining", ".factor-mining-page", ".factor-editor-panel", {
      viewport: { width: 1440, height: 1600 },
      waitForData: async (currentPage) => {
        const libraryText = await currentPage.locator(".factor-library-panel").innerText();
        return libraryText.includes("放量突破动量") || libraryText.includes("放量突破動量") || libraryText.includes("Volume Breakout Momentum");
      },
      dataTimeoutMs: 45_000,
    }],
    [6, "06-strategy-workbench.png", "/strategy", ".strategy-page", ".strategy-editor-shell"],
    [7, "07-smart-research.png", "/smart-research", ".smart-research-page", ".smart-research-control"],
    [8, "08-risk-monitor.png", "/risk", ".risk-page", ".risk-metrics", {
      waitForData: async (currentPage) => {
        const value = await currentPage.locator(".risk-metric-value").first().textContent();
        return Boolean(value && value.trim() !== "—");
      },
      dataTimeoutMs: 45_000,
    }],
  ];
  const onlySequence = Number(process.env.GUIDE_CAPTURE_ONLY || 0);
  for (const [sequence, filename, pathname, selector, readyFor, options] of captures) {
    if (sequence >= startAt && (!onlySequence || sequence === onlySequence)) {
      await capture(page, filename, pathname, { waitFor: selector, readyFor, ...options });
    }
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
