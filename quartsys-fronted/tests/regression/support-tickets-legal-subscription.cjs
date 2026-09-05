/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function run() {
  const root = path.resolve(__dirname, "..", "..");
  const workspace = path.resolve(root, "..");
  const api = read(root, "src/api.ts");
  const support = read(root, "src/components/settings/SupportTicketsPanel.tsx");
  const supportPage = read(root, "src/pages/SupportPage.tsx");
  const settings = read(root, "src/pages/SettingsPage.tsx");
  const legal = read(root, "src/pages/LegalPage.tsx");
  const shell = read(root, "src/layout/AppShell.tsx");
  const styles = read(root, "src/styles.css");
  const risk = read(root, "src/pages/RiskPage.tsx");
  const screener = read(root, "src/pages/ScreenerPage.tsx");
  const landing = read(root, "src/pages/LandingPage.tsx");
  const backend = fs.readFileSync(path.join(workspace, "quartsys-backend", "main.py"), "utf8");

  ["/support/tickets", "/admin/support/tickets"].forEach((endpoint) => {
    must(api.includes(endpoint), `missing frontend API endpoint ${endpoint}`);
  });
  must(supportPage.includes("<SupportTicketsPanel />"), "support ticket panel is not mounted in the standalone Support page");
  must(supportPage.includes('to="/guide"'), "standalone Support page is missing the user-guide entry");
  must(settings.includes('<Navigate to="/support" replace />'), "legacy settings support link is not redirected");
  must(support.includes('hasPermission("system.manage")'), "admin workbench permission guard missing");
  must(support.includes("listMySupportTickets"), "user ticket history missing");
  must(support.includes("updateAdminSupportTicket"), "admin ticket update missing");

  must(legal.includes("legal-back-button"), "legal back button missing");
  must(legal.includes("navigate(-1)"), "legal history navigation missing");
  must(styles.includes(".legal-back-button"), "legal back button styles missing");

  must(shell.includes("quartsys:notifications-refresh"), "notification refresh event missing");
  must(shell.includes("30_000"), "notification polling interval missing");

  must(settings.includes('lt("使用中", "In Use")'), "active plan label missing");
  must(settings.includes("settings-plan-current-state"), "active plan state panel missing");
  must(styles.includes(".settings-plan-card.current::before"), "active plan visual emphasis missing");

  [risk, screener, landing, settings, backend].forEach((content, index) => {
    ["本地缓存", "数据缓存", "数据库缓存", "结果缓存", "Local cache", "Database cache"].forEach((phrase) => {
      must(!content.includes(phrase), `legacy cache label '${phrase}' remains in checked source ${index + 1}`);
    });
  });

  console.log(JSON.stringify({
    status: "ok",
    checks: [
      "support-ticket-user-and-admin-ui",
      "legal-back-navigation",
      "notification-auto-refresh",
      "active-subscription-visual-state",
      "system-data-user-facing-copy",
    ],
  }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: String(error?.message || error) }, null, 2));
  process.exit(1);
}
