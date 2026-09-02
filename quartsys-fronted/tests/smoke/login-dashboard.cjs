/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function must(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function run() {
  const root = path.resolve(__dirname, "..", "..");
  const apiPath = path.join(root, "src", "api.ts");
  const loginPath = path.join(root, "src", "pages", "LoginPage.tsx");
  const dashPath = path.join(root, "src", "pages", "DashboardPage.tsx");

  const apiText = fs.readFileSync(apiPath, "utf8");
  const loginText = fs.readFileSync(loginPath, "utf8");
  const dashText = fs.readFileSync(dashPath, "utf8");

  must(apiText.includes("quartsys_api_base"), "api.ts 缺少 API base override 支持");
  must(/getSimulationAccount\s*:\s*\([^)]*\)\s*=>/.test(apiText), "api.ts 缺少 simulation/account 客户端");
  must(/login\s*:\s*\(\s*payload/.test(apiText), "api.ts 缺少 login 客户端");
  must(/(?:api|\(api as any\))\s*\.?\s*login\s*\(/.test(loginText), "LoginPage 未调用 api.login");
  must(
    loginText.includes("setToken(") || loginText.includes("localStorage.setItem"),
    "LoginPage 未持久化 token",
  );
  must(/getMarketIndices\s*\(/.test(dashText), "Dashboard 未请求市场指数");
  must(/getSimulationAccount\s*\(/.test(dashText), "Dashboard 未请求账户数据");
  must(!dashText.includes("FALLBACK_INDICES"), "Dashboard 仍存在 fallback 指数数据");
  must(/getIndustryHistory\s*\(/.test(dashText), "Dashboard 行业弹窗未请求行业历史K线");
  must(/function parseHistory/.test(dashText), "Dashboard 缺少历史K线数据清洗");
  must(/normalizedLow/.test(dashText) && /normalizedHigh/.test(dashText), "Dashboard 未规范化K线高低点");
  must(/\.sort\(\(a, b\)/.test(dashText), "Dashboard 行业K线未按日期排序");
  must(/industryLoading\s*\|\|/.test(dashText), "Dashboard 行业K线初始化未等待加载状态");
  must(/function scheduleChartResize/.test(dashText), "Dashboard 缺少弹窗K线延迟resize");
  must(/ResizeObserver/.test(dashText), "Dashboard 行业K线缺少容器尺寸监听");

  const out = {
    status: "ok",
    checks: [
      "api-base-config",
      "login-token-persistence",
      "dashboard-indices-fetch",
      "dashboard-account-fetch",
      "no-dashboard-fallback-indices",
      "industry-kline-data-sanitized",
      "industry-kline-modal-resize-guard",
    ],
  };
  console.log(JSON.stringify(out, null, 2));
}

try {
  run();
} catch (err) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: String(err && err.message ? err.message : err),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
