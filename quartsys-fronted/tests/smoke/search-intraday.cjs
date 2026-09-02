/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function read(root, file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function run() {
  const root = path.resolve(__dirname, "..", "..");
  const shell = read(root, "src/layout/AppShell.tsx");
  const quote = read(root, "src/pages/QuotePage.tsx");
  const intraday = read(root, "src/components/IntradayChart.tsx");
  const matcher = read(root, "src/shared/securitySearch.ts");

  must(matcher.includes("pickBestSecurityMatch"), "缺少统一的最匹配标的选择逻辑");
  must(shell.includes("onSubmit=") && shell.includes("submitSearch"), "顶部搜索未接入提交逻辑");
  must(shell.includes("requestSequence") && shell.includes("requestSequence.current !== requestId"), "顶部搜索未防止旧请求覆盖新结果");
  must(shell.includes("openResult(r)"), "顶部联想项未复用统一跳转逻辑");
  must(shell.includes("未找到匹配标的"), "顶部搜索缺少无结果提示");
  must(quote.includes("handleSearchKeyDown") && quote.includes("onKeyDown={handleSearchKeyDown}"), "股票详情搜索未支持回车提交");
  must(quote.includes("openSearchResult(r)") && quote.includes("pickBestSecurityMatch"), "股票详情搜索未复用统一匹配和跳转逻辑");
  must(quote.includes("searchRequestSequence.current !== requestId"), "股票详情搜索未防止旧请求覆盖新结果");
  must(intraday.includes("function priceGridStep"), "分时图缺少动态价格网格步长");
  must(!intraday.includes("Math.min(10, Math.max(3"), "分时图仍将涨跌幅硬限制在 10%");
  must(intraday.includes("percentLimit = Math.ceil(rawPercentLimit / gridStep) * gridStep"), "分时图未按真实波动范围计算坐标轴");

  console.log(JSON.stringify({ status: "ok", checks: ["search-submit", "search-race-guard", "search-empty-state", "intraday-wide-range"] }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: String(error.message || error) }, null, 2));
  process.exit(1);
}
