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
  const css = read(root, "src/styles.css");
  const html = read(root, "index.html");
  const loginStart = css.indexOf("Login Page");
  const loginEnd = css.indexOf("Dashboard Page", loginStart);
  const loginCss = css.slice(loginStart, loginEnd);
  const settings = read(root, "src/pages/SettingsPage.tsx");
  const app = read(root, "src/App.tsx");
  const shell = read(root, "src/layout/AppShell.tsx");
  const auth = read(root, "src/shared/auth.ts");
  const api = read(root, "src/api.ts");
  const landing = read(root, "src/pages/LandingPage.tsx");
  const siteConfig = read(root, "src/shared/siteConfig.ts");
  const tokenCost = read(root, "src/components/settings/TokenCostSection.tsx");
  const billingConfig = read(root, "src/components/settings/BillingConfigSection.tsx");

  must(loginStart >= 0 && loginEnd > loginStart, "无法定位登录页样式作用域");
  must(loginCss.includes("--login-red: #ef4444"), "登录页缺少红色品牌变量");
  must(loginCss.includes("--login-gold: #d9aa4e"), "登录页缺少金色品牌变量");
  must(loginCss.includes("Space Grotesk"), "登录页标题字体未与主页统一");
  must(!/#0052ff|rgba\(0,\s*82,\s*255|#7da6ff|#bfd4ff|#a9c4ff/i.test(loginCss), "登录页仍包含旧蓝色视觉值");

  must(!settings.includes('"TOKEN COST"'), "Token 成本仍存在于设置标签中");
  must(auth.includes('"/token-cost": "system.manage"'), "Token 成本路由未绑定管理员权限");
  must(shell.includes('to: "/token-cost"') && shell.includes("Icon: Coins"), "侧边栏缺少 Token 成本入口");
  must(app.includes('path="/token-cost"') && app.includes('ROUTE_PERMISSIONS["/token-cost"]'), "应用路由缺少 Token 成本权限守卫");
  must(tokenCost.includes("applyFilter({"), "Token 成本筛选项未触发实际查询");
  must(tokenCost.includes("listLLMModels") && tokenCost.includes("拉取接口模型"), "模型价格页缺少接口模型拉取能力");
  must(settings.includes('"SITE CONFIG"') && settings.includes("<SiteConfigSection />"), "设置中心缺少管理员站点设置入口");
  must(settings.includes('"BILLING CONFIG"') && settings.includes("<BillingConfigSection />"), "设置中心缺少独立计费配置入口");
  must(
    billingConfig.includes("getAdminSubscriptionPlans") &&
      billingConfig.includes("updateAdminSubscriptionPlan") &&
      billingConfig.includes("getAdminBillingSettings") &&
      billingConfig.includes("saveAdminBillingSettings"),
    "计费配置页未同时接入套餐定价和 AI 模块积分接口",
  );
  must(
    billingConfig.includes("AI 模块积分消耗") && billingConfig.includes("订阅套餐定价"),
    "计费配置页缺少套餐价格或 AI 积分配置界面",
  );
  must(settings.includes("getAdminSiteSettings") && settings.includes("saveAdminSiteSettings"), "站点设置未接入管理员读写接口");
  must(api.includes('request("/admin/site-settings"'), "前端 API 缺少管理员站点设置接口");
  must(
    siteConfig.includes('telegram: string') && siteConfig.includes('whatsapp: string'),
    "站点配置类型缺少 Telegram 或 WhatsApp 联系方式字段",
  );
  must(landing.includes("SiTencentqq") && landing.includes("SiWechat") && landing.includes("SiTelegram") && landing.includes("SiWhatsapp"), "首页联系方式未使用真实品牌图标");
  must(landing.includes("footerContacts.length > 0") && !landing.includes("待管理员配置"), "首页仍会展示未配置的联系方式");
  must(settings.includes("SiAlipay") && settings.includes("SiStripe"), "支付配置未使用支付宝和 Stripe 官方图标");
  must(settings.includes("<Bot aria-hidden=\"true\" />"), "社区版通知机器人图标未使用通用图标");
  must(!html.includes("<link rel=\"icon\"") && !html.includes("apple-touch-icon"), "社区版 HTML 仍引用品牌图标资源");
  must(!landing.includes("<img src=\"/"), "社区版首页仍引用图片品牌资源");
  must(!shell.includes("<img src=\"/"), "社区版控制台仍引用图片品牌资源");
  must(html.includes("viewport-fit=cover"), "页面缺少 iOS 安全区域 viewport 配置");
  must(shell.includes("qs-mobile-menu-btn") && shell.includes("mobileSidebarOpen"), "控制台缺少移动端导航抽屉");
  must(css.includes("Device adaptation: iPad, iPhone and Android") && css.includes("safe-area-inset-top"), "缺少手机和平板响应式安全区适配");

  console.log(
    JSON.stringify(
      {
        status: "ok",
        checks: [
          "login-red-gold-brand-scope",
          "login-space-grotesk",
          "token-cost-removed-from-settings",
          "token-cost-admin-route-guard",
          "token-cost-sidebar-entry",
          "token-cost-live-filters",
          "token-cost-model-import",
          "admin-site-settings-tab",
          "admin-site-settings-api",
          "admin-billing-config-tab",
          "subscription-and-ai-credit-config",
          "homepage-contact-binding",
          "real-brand-contact-icons",
          "real-payment-and-bot-icons",
          "mobile-ipad-safe-area-layout",
        ],
      },
      null,
      2,
    ),
  );
}

try {
  run();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: String(error && error.message ? error.message : error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
