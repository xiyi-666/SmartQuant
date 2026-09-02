/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function text(file) {
  return fs.readFileSync(file, "utf8");
}

function checkNoTokens(content, fileName, tokens) {
  for (const t of tokens) {
    must(!content.includes(t), `${fileName} 仍包含硬编码占位: ${t}`);
  }
}

function run() {
  const root = path.resolve(__dirname, "..", "..");
  const pages = {
    dashboard: text(path.join(root, "src", "pages", "DashboardPage.tsx")),
    risk: text(path.join(root, "src", "pages", "RiskPage.tsx")),
    trading: text(path.join(root, "src", "pages", "TradingPage.tsx")),
    backtesting: text(path.join(root, "src", "pages", "BacktestingPage.tsx")),
    ai: text(path.join(root, "src", "pages", "AiInsightsPage.tsx")),
    settings: text(path.join(root, "src", "pages", "SettingsPage.tsx")),
  };
  const appShell = text(path.join(root, "src", "layout", "AppShell.tsx"));
  const indexHtml = text(path.join(root, "index.html"));
  const styles = text(path.join(root, "src", "styles.css"));

  checkNoTokens(pages.dashboard, "DashboardPage", [
    "FALLBACK_INDICES",
    "FALLBACK_STOCKS",
    "FALLBACK_GAINERS",
    "FALLBACK_NEWS",
  ]);
  checkNoTokens(pages.risk, "RiskPage", [
    "figmaEvents",
    "figmaAiAssessment",
    "figmaFundFlow",
  ]);
  checkNoTokens(pages.trading, "TradingPage", ["FIGMA_POSITIONS"]);
  checkNoTokens(pages.backtesting, "BacktestingPage", [
    "fallbackRankings",
    "回测周期: 90 Days",
    "90D YIELD",
    "1H",
    "4H",
  ]);
  checkNoTokens(pages.ai, "AiInsightsPage", ["figmaRecommendations"]);
  checkNoTokens(pages.settings, "SettingsPage", ["MOCK_LOGS"]);

  const checks = [
    /getMarketIndices\s*\(/.test(pages.dashboard),
    /getRiskTrend\s*\(/.test(pages.risk),
    /getSimulationAccount\s*\(/.test(pages.trading),
    /listAgents\s*\(/.test(pages.backtesting),
    /runAlphaRecommend\s*\(/.test(pages.ai),
    /getLogs\s*\(/.test(pages.settings),
  ];
  must(checks.every(Boolean), "存在页面未绑定对应 API 的情况");
  must(
    /buildBacktestPeriodLabel/.test(pages.backtesting) &&
      /performanceDates/.test(pages.backtesting) &&
      /Days/.test(pages.backtesting) &&
      /getBenchmark/.test(pages.backtesting) &&
      /label: "日"/.test(pages.backtesting) &&
      /label: "周"/.test(pages.backtesting) &&
      /label: "月"/.test(pages.backtesting),
    "BacktestingPage 未从收益曲线日期计算回测周期",
  );
  must(
    pages.settings.includes('"RISK CONFIG"') &&
      pages.settings.includes("RiskMonitorSettingsSection") &&
      pages.settings.includes("settings-risk-config-card") &&
      pages.settings.includes("settings-risk-field-config") &&
      pages.settings.includes("settings-json-panel") &&
      pages.settings.includes("settings-json-textarea") &&
      pages.settings.includes("settings-json-toolbar") &&
      pages.settings.includes("updateRiskListField") &&
      pages.settings.includes("formatRiskConfigDraft") &&
      pages.settings.includes("resetRiskConfigDraft") &&
      /wrap="off"/.test(pages.settings) &&
      styles.includes(".settings-risk-config-card") &&
      styles.includes(".settings-risk-settings-section") &&
      styles.includes(".settings-risk-field-config") &&
      styles.includes(".settings-json-panel") &&
      styles.includes(".settings-json-toolbar") &&
      /\.settings-risk-config-card[\s\S]*max-width:\s*100%/.test(styles) &&
      /\.settings-risk-settings-section[\s\S]*max-height:\s*none/.test(styles) &&
      /\.settings-json-panel[\s\S]*overflow:\s*hidden/.test(styles) &&
      /\.settings-json-textarea[\s\S]*max-width:\s*100%/.test(styles) &&
      /\.settings-json-textarea[\s\S]*overflow:\s*auto/.test(styles) &&
      /\.settings-json-textarea[\s\S]*max-height:\s*280px/.test(styles),
    "Settings 风险监控独立配置页缺少字段配置或 JSON 防横向溢出约束",
  );
  {
    const prefStart = pages.settings.indexOf("function PreferencesSection");
    const usersStart = pages.settings.indexOf("function UsersPermissionsSection");
    const prefBlock = prefStart >= 0 && usersStart > prefStart ? pages.settings.slice(prefStart, usersStart) : "";
    must(
      prefBlock &&
        !prefBlock.includes("settings-risk-config-card") &&
        !prefBlock.includes("getRiskMonitorSettings") &&
        !prefBlock.includes("saveRiskMonitorSettings"),
      "风险监控配置仍残留在偏好设置页",
    );
  }
  must(
    pages.ai.includes("ACTIVE_AI_INSIGHT_TASK_KEY") &&
      pages.ai.includes("activeTaskStorageKey") &&
      pages.ai.includes("beginInsightPolling") &&
      pages.ai.includes("localStorage.setItem(activeTaskStorageKey") &&
      pages.ai.includes("localStorage.getItem(activeTaskStorageKey") &&
      pages.ai.includes("后台分析运行中，预计需要 1-2 分钟；完成后将自动刷新本页结果") &&
      pages.ai.includes("后台分析中"),
    "AI 洞察缺少后台任务持久化轮询或完成后自动渲染提示",
  );
  must(
    appShell.includes('key={`sidebar-nav-${lang}`}') &&
      appShell.includes('className="qs-sidebar-nav no-scrollbar notranslate"') &&
      appShell.includes('translate="no"') &&
      appShell.includes('key={`${lang}-${item.to}`}') &&
      appShell.includes("qs-nav-svg-icon") &&
      appShell.includes("LayoutDashboard") &&
      !appShell.includes('<span className="material-symbols-outlined">{item.icon}</span>') &&
      styles.includes(".qs-nav-svg-icon") &&
      styles.includes("html:not(.qs-material-icons-ready) .material-symbols-outlined") &&
      indexHtml.includes("qs-material-icons-ready"),
    "AppShell 侧边栏导航缺少语言重挂载或禁止自动翻译约束",
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        checks: [
          "no-hardcoded-fallbacks-six-pages",
          "api-binding-six-pages",
          "settings-risk-json-overflow-guard",
          "sidebar-language-flicker-guard",
        ],
      },
      null,
      2,
    ),
  );
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
