import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QUARTSYS_BASE_URL || "http://127.0.0.1:15473";
const username = process.env.QUARTSYS_TEST_USERNAME || "admin";
const password = process.env.QUARTSYS_TEST_PASSWORD || "admin123";
const outputDir = process.env.QUARTSYS_AUDIT_DIR || "/tmp/quartsys-mobile-audit";
const deviceFilter = new Set(
  (process.env.QUARTSYS_AUDIT_DEVICES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const routeFilter = new Set(
  (process.env.QUARTSYS_AUDIT_ROUTES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const devices = [
  { name: "iphone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "android", viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  { name: "ipad-portrait", viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "ipad-landscape", viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

const publicRoutes = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "register", path: "/login?mode=register" },
];

const protectedRoutes = [
  { name: "dashboard", path: "/dashboard" },
  { name: "ai-insights", path: "/ai-insights" },
  { name: "screener-filter", path: "/screener", mobilePanel: 0 },
  { name: "screener-chart", path: "/screener", mobilePanel: 1 },
  { name: "screener-results", path: "/screener", mobilePanel: 2 },
  { name: "quote", path: "/quote" },
  { name: "quote-detail", path: "/quote?code=000001" },
  { name: "smart-research", path: "/smart-research" },
  { name: "agent-analysis", path: "/agent-analysis" },
  { name: "strategy", path: "/strategy" },
  { name: "factor-mining", path: "/factor-mining" },
  { name: "backtesting", path: "/backtesting" },
  { name: "risk", path: "/risk" },
  { name: "trading", path: "/trading" },
  { name: "token-cost", path: "/token-cost" },
  { name: "settings-subscription", path: "/settings?tab=subscription" },
  { name: "settings-site", path: "/settings?tab=site-config" },
  { name: "settings-payment", path: "/settings?tab=payment" },
  { name: "settings-billing", path: "/settings?tab=billing-config" },
  { name: "settings-auth", path: "/settings?tab=auth-security" },
  { name: "settings-notifications", path: "/settings?tab=notifications" },
  { name: "settings-preferences", path: "/settings?tab=preferences" },
  { name: "settings-news", path: "/settings?tab=news-config" },
  { name: "settings-risk", path: "/settings?tab=risk-config" },
  { name: "settings-ai", path: "/settings?tab=ai-config" },
  { name: "settings-support", path: "/settings?tab=support" },
  { name: "settings-logs", path: "/settings?tab=logs" },
  { name: "settings-users", path: "/settings?tab=users" },
  { name: "settings-profile", path: "/settings?tab=profile" },
];

const selectedDevices = deviceFilter.size
  ? devices.filter((device) => deviceFilter.has(device.name))
  : devices;
const selectedPublicRoutes = routeFilter.size
  ? publicRoutes.filter((route) => routeFilter.has(route.name))
  : publicRoutes;
const selectedProtectedRoutes = routeFilter.size
  ? protectedRoutes.filter((route) => routeFilter.has(route.name))
  : protectedRoutes;

function createIssueCollector() {
  const issues = [];
  return {
    issues,
    bind(page) {
      page.on("pageerror", (error) => issues.push({ type: "pageerror", message: String(error?.message || error) }));
      page.on("console", (message) => {
        if (message.type() === "error") issues.push({ type: "console", message: message.text() });
      });
    },
  };
}

async function inspectViewport(page) {
  return page.evaluate(() => {
    const hitTargetFor = (element) => {
      if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
        const wrappingLabel = element.closest("label");
        const linkedLabel = element.id
          ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
          : null;
        return wrappingLabel || linkedLabel || element;
      }
      return element;
    };
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const root = document.documentElement;
    const body = document.body;
    const rootScrollWidth = Math.max(root.scrollWidth, body?.scrollWidth || 0);
    const overflowElements = Array.from(document.querySelectorAll("body *"))
      .filter((element) => {
        const node = element;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        return rect.left < -4 || rect.right > viewportWidth + 4;
      })
      .slice(0, 16)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      });
    const tinyControls = Array.from(document.querySelectorAll("button, a, input, select, textarea, [role='button']"))
      .filter((element) => {
        const hitTarget = hitTargetFor(element);
        const style = window.getComputedStyle(hitTarget);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = hitTarget.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > viewportHeight) return false;
        return rect.width < 40 || rect.height < 40;
      })
      .slice(0, 20)
      .map((element) => {
        const hitTarget = hitTargetFor(element);
        const rect = hitTarget.getBoundingClientRect();
        return {
          tag: hitTarget.tagName.toLowerCase(),
          text: (hitTarget.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 60),
          className: typeof hitTarget.className === "string" ? hitTarget.className.slice(0, 120) : "",
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    const clippedContainers = Array.from(document.querySelectorAll("body *"))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
        const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
        return (
          (clipsX && element.scrollWidth > element.clientWidth + 8) ||
          (clipsY && element.scrollHeight > element.clientHeight + 8)
        );
      })
      .slice(0, 20)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
    return {
      viewportWidth,
      viewportHeight,
      rootScrollWidth,
      horizontalOverflow: rootScrollWidth > viewportWidth + 2,
      overflowElements,
      tinyControls,
      clippedContainers,
      title: document.title,
      pathname: window.location.pathname,
    };
  });
}

async function captureRoute(page, deviceName, route, authenticated) {
  const collector = createIssueCollector();
  collector.bind(page);
  await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(authenticated ? 1_400 : 700);
  if (route.name === "agent-analysis") {
    await page
      .locator(".agent-analysis-loading")
      .waitFor({ state: "hidden", timeout: 8_000 })
      .catch(() => {});
  }
  if (typeof route.mobilePanel === "number") {
    const tabs = page.locator(".screener-mobile-tabs button");
    const targetTab = tabs.nth(route.mobilePanel);
    if ((await tabs.count()) && (await targetTab.isVisible())) {
      await targetTab.click();
      await page.waitForTimeout(250);
    }
  }
  const metrics = await inspectViewport(page);
  const screenshotPath = path.join(outputDir, deviceName, `${route.name}.png`);
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled" });
  return { route: route.name, url: page.url(), authenticated, metrics, runtimeIssues: collector.issues, screenshotPath };
}

async function loginAndGetStorage(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByPlaceholder("输入用户名").fill(username);
  await page.getByPlaceholder("输入密码").fill(password);
  await page.locator("form .submit-btn").click();
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 60_000 });
  await page.waitForTimeout(500);
  const state = await context.storageState();
  await context.close();
  return state;
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const storageState = await loginAndGetStorage(browser);
    const results = [];
    for (const device of selectedDevices) {
      const publicContext = await browser.newContext({
        ...device,
        locale: "zh-CN",
        colorScheme: "dark",
      });
      for (const route of selectedPublicRoutes) {
        const page = await publicContext.newPage();
        results.push({ device: device.name, ...(await captureRoute(page, device.name, route, false)) });
        await page.close();
      }
      await publicContext.close();

      const appContext = await browser.newContext({
        ...device,
        locale: "zh-CN",
        colorScheme: "dark",
        storageState,
      });
      for (const route of selectedProtectedRoutes) {
        const page = await appContext.newPage();
        results.push({ device: device.name, ...(await captureRoute(page, device.name, route, true)) });
        await page.close();
      }
      await appContext.close();
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      pages: results.length,
      horizontalOverflow: results.filter((item) => item.metrics.horizontalOverflow).map((item) => `${item.device}:${item.route}`),
      runtimeErrors: results
        .filter((item) => item.runtimeIssues.length)
        .map((item) => ({ page: `${item.device}:${item.route}`, issues: item.runtimeIssues })),
      touchTargetWarnings: results
        .filter((item) => item.metrics.tinyControls.length)
        .map((item) => ({ page: `${item.device}:${item.route}`, controls: item.metrics.tinyControls })),
      clippedContainerWarnings: results
        .filter((item) => item.metrics.clippedContainers.length)
        .map((item) => ({ page: `${item.device}:${item.route}`, containers: item.metrics.clippedContainers })),
      results,
    };
    await fs.writeFile(path.join(outputDir, "audit.json"), JSON.stringify(summary, null, 2), "utf8");
    process.stdout.write(`${JSON.stringify({
      outputDir,
      pages: summary.pages,
      horizontalOverflow: summary.horizontalOverflow,
      runtimeErrorPages: summary.runtimeErrors.map((item) => item.page),
      touchTargetWarningPages: summary.touchTargetWarnings.map((item) => item.page),
      clippedContainerWarningPages: summary.clippedContainerWarnings.map((item) => item.page),
    }, null, 2)}\n`);
    if (summary.horizontalOverflow.length || summary.runtimeErrors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
