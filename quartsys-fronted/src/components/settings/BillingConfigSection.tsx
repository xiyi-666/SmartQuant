import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Coins, Megaphone, RefreshCw, Save } from "lucide-react";
import { api } from "../../api";
import { hasPermission } from "../../shared/auth";
import { useLangText } from "../../shared/language";

type SubscriptionPlan = {
  id: number;
  key: string;
  name: string;
  description?: string;
  role?: string;
  price_cents: number;
  currency?: string;
  interval?: string;
  credits: number;
  enabled?: boolean;
  sort_order?: number;
  features?: string[];
  stripe_price_id?: string;
};

type PlanDraft = SubscriptionPlan & {
  price_yuan: string;
  credits_input: string;
  sort_order_input: string;
};

type ModuleCostMeta = {
  key: string;
  label: string;
  default_cost: number;
};

type BillingForm = {
  credits_per_cny: string;
  quarter_discount_pct: string;
  recharge_min_yuan: string;
  recharge_max_yuan: string;
  recharge_presets_yuan: string;
  module_credit_costs: Record<string, string>;
  credit_recharge: {
    enabled: boolean;
  };
  enterprise_plan: {
    enabled: boolean;
  };
  rewarded_ads: {
    enabled: boolean;
    reward_credits: string;
    daily_limit: string;
    cooldown_seconds: string;
    session_ttl_seconds: string;
    google: {
      enabled: boolean;
      publisher_id: string;
      ad_unit_path: string;
    };
    meta: RewardedExternalProviderConfig;
    pangle: RewardedExternalProviderConfig;
    gdt: RewardedExternalProviderConfig;
    baidu: RewardedExternalProviderConfig;
    kuaishou: RewardedExternalProviderConfig;
  };
};

type RewardedExternalProviderKey = "meta" | "pangle" | "gdt" | "baidu" | "kuaishou";

type RewardedExternalProviderConfig = {
      enabled: boolean;
      app_id: string;
      placement_id: string;
      launch_url: string;
      callback_secret: string;
};

const REWARDED_EXTERNAL_PROVIDERS: Array<{
  key: RewardedExternalProviderKey;
  name: string;
  nameEn: string;
  desc: string;
  descEn: string;
}> = [
  {
    key: "meta",
    name: "Meta Rewarded Video",
    nameEn: "Meta Rewarded Video",
    desc: "获批 SDK 或外部广告页回调",
    descEn: "Approved SDK or external rewarded-ad callback",
  },
  {
    key: "pangle",
    name: "穿山甲广告",
    nameEn: "Pangle / Ocean Engine Ads",
    desc: "字节跳动广告平台，建议通过服务端中转页完成回调确认",
    descEn: "ByteDance ad network, recommended through a server-side bridge callback",
  },
  {
    key: "gdt",
    name: "腾讯优量汇",
    nameEn: "Tencent Youlianghui",
    desc: "腾讯广告联盟，适合国内移动端或 H5 激励广告接入",
    descEn: "Tencent ad network for China mobile or H5 rewarded ads",
  },
  {
    key: "baidu",
    name: "百度联盟",
    nameEn: "Baidu Union",
    desc: "百度广告联盟，适合 H5 广告页或中转验证",
    descEn: "Baidu ad network for H5 ad pages or bridge verification",
  },
  {
    key: "kuaishou",
    name: "快手联盟",
    nameEn: "Kuaishou Ads",
    desc: "快手广告联盟，适合国内激励视频广告接入",
    descEn: "Kuaishou ad network for China rewarded video ads",
  },
];

function emptyExternalProvider(): RewardedExternalProviderConfig {
  return {
    enabled: false,
    app_id: "",
    placement_id: "",
    launch_url: "",
    callback_secret: "",
  };
}

const MODULE_LABELS_EN: Record<string, string> = {
  ai_insights: "AI Insights analysis",
  position_advice_refresh: "Position advice refresh",
  factor_generation: "AI factor generation",
  strategy_generation: "AI strategy generation",
  risk_ai_assessment: "Risk assessment refresh",
  smart_research: "Smart Research per stock",
  agent_analysis_turn: "AI Analyst per analyst round",
  agent_analysis_moderator: "AI Analyst moderator summary",
};

const EMPTY_FORM: BillingForm = {
  credits_per_cny: "100",
  quarter_discount_pct: "5",
  recharge_min_yuan: "1",
  recharge_max_yuan: "1000",
  recharge_presets_yuan: "10, 30, 50, 100",
  module_credit_costs: {},
  credit_recharge: {
    enabled: false,
  },
  enterprise_plan: {
    enabled: false,
  },
  rewarded_ads: {
    enabled: false,
    reward_credits: "20",
    daily_limit: "5",
    cooldown_seconds: "60",
    session_ttl_seconds: "600",
    google: {
      enabled: false,
      publisher_id: "",
      ad_unit_path: "",
    },
    meta: {
      enabled: false,
      app_id: "",
      placement_id: "",
      launch_url: "",
      callback_secret: "",
    },
    pangle: emptyExternalProvider(),
    gdt: emptyExternalProvider(),
    baidu: emptyExternalProvider(),
    kuaishou: emptyExternalProvider(),
  },
};

function toPlanDraft(plan: SubscriptionPlan): PlanDraft {
  return {
    ...plan,
    price_yuan: ((Number(plan.price_cents) || 0) / 100).toFixed(2),
    credits_input: String(Number(plan.credits) || 0),
    sort_order_input: String(Number(plan.sort_order) || 0),
  };
}

function toBillingForm(settings: any, moduleCosts: ModuleCostMeta[]): BillingForm {
  const rewardedAds = settings?.rewarded_ads || {};
  const google = rewardedAds.google || {};
  const externalProvider = (key: RewardedExternalProviderKey): RewardedExternalProviderConfig => {
    const value = rewardedAds[key] || {};
    return {
      enabled: Boolean(value.enabled),
      app_id: String(value.app_id || ""),
      placement_id: String(value.placement_id || ""),
      launch_url: String(value.launch_url || ""),
      callback_secret: String(value.callback_secret || ""),
    };
  };
  const costs = settings?.module_credit_costs || {};
  const creditRecharge = settings?.credit_recharge || {};
  const enterprisePlan = settings?.enterprise_plan || {};
  return {
    credits_per_cny: String(settings?.credits_per_cny ?? 100),
    quarter_discount_pct: String(settings?.quarter_discount_pct ?? 5),
    recharge_min_yuan: String((Number(settings?.recharge_min_cents ?? 100) / 100).toFixed(2)),
    recharge_max_yuan: String((Number(settings?.recharge_max_cents ?? 100000) / 100).toFixed(2)),
    recharge_presets_yuan: (Array.isArray(settings?.recharge_presets_cents)
      ? settings.recharge_presets_cents
      : [1000, 3000, 5000, 10000]
    )
      .map((value: number) => Number(value) / 100)
      .join(", "),
    module_credit_costs: Object.fromEntries(
      moduleCosts.map((item) => [
        item.key,
        String(costs[item.key] ?? item.default_cost ?? 0),
      ]),
    ),
    credit_recharge: {
      enabled: Boolean(creditRecharge.enabled),
    },
    enterprise_plan: {
      enabled: Boolean(enterprisePlan.enabled),
    },
    rewarded_ads: {
      enabled: Boolean(rewardedAds.enabled),
      reward_credits: String(rewardedAds.reward_credits ?? 20),
      daily_limit: String(rewardedAds.daily_limit ?? 5),
      cooldown_seconds: String(rewardedAds.cooldown_seconds ?? 60),
      session_ttl_seconds: String(rewardedAds.session_ttl_seconds ?? 600),
      google: {
        enabled: Boolean(google.enabled),
        publisher_id: String(google.publisher_id || ""),
        ad_unit_path: String(google.ad_unit_path || ""),
      },
      meta: externalProvider("meta"),
      pangle: externalProvider("pangle"),
      gdt: externalProvider("gdt"),
      baidu: externalProvider("baidu"),
      kuaishou: externalProvider("kuaishou"),
    },
  };
}

function requiredNumber(raw: string, label: string, minimum = 0) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be at least ${minimum}`);
  }
  return value;
}

function requiredInteger(raw: string, label: string, minimum = 0) {
  const value = requiredNumber(raw, label, minimum);
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  return value;
}

function parseRechargePresets(raw: string) {
  return raw
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => requiredNumber(item, "Recharge preset", 1));
}

export default function BillingConfigSection() {
  const lt = useLangText();
  const canManageSystem = hasPermission("system.manage");
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [moduleCosts, setModuleCosts] = useState<ModuleCostMeta[]>([]);
  const [form, setForm] = useState<BillingForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"muted" | "success" | "error">("muted");

  const loadConfig = async () => {
    if (!canManageSystem) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const [planPayload, billingPayload]: any[] = await Promise.all([
        (api as any).getAdminSubscriptionPlans(),
        (api as any).getAdminBillingSettings(),
      ]);
      const nextPlans = Array.isArray(planPayload?.plans) ? planPayload.plans : [];
      const nextModuleCosts = Array.isArray(billingPayload?.module_costs)
        ? billingPayload.module_costs
        : [];
      setPlans(nextPlans.map(toPlanDraft));
      setModuleCosts(nextModuleCosts);
      setForm(toBillingForm(billingPayload?.settings || {}, nextModuleCosts));
    } catch (error: any) {
      setMsg(error?.message || lt("计费配置加载失败", "Failed to load billing config"));
      setMsgTone("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, [canManageSystem]);

  const patchPlan = (planId: number, key: keyof PlanDraft, value: any) => {
    setPlans((current) =>
      current.map((plan) => (plan.id === planId ? { ...plan, [key]: value } : plan)),
    );
  };

  const patchForm = (key: keyof BillingForm, value: any) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const patchCreditRecharge = (key: "enabled", value: boolean) => {
    setForm((current) => ({
      ...current,
      credit_recharge: { ...current.credit_recharge, [key]: value },
    }));
  };

  const patchEnterprisePlan = (key: "enabled", value: boolean) => {
    setForm((current) => ({
      ...current,
      enterprise_plan: { ...current.enterprise_plan, [key]: value },
    }));
  };

  const patchRewardedAds = (key: string, value: any) => {
    setForm((current) => ({
      ...current,
      rewarded_ads: { ...current.rewarded_ads, [key]: value },
    }));
  };

  const patchAdProvider = (provider: "google" | RewardedExternalProviderKey, key: string, value: any) => {
    setForm((current) => ({
      ...current,
      rewarded_ads: {
        ...current.rewarded_ads,
        [provider]: { ...current.rewarded_ads[provider], [key]: value },
      },
    }));
  };

  const patchModuleCost = (key: string, value: string) => {
    setForm((current) => ({
      ...current,
      module_credit_costs: { ...current.module_credit_costs, [key]: value },
    }));
  };

  const rechargePreview = useMemo(() => {
    const rate = Number(form.credits_per_cny) || 0;
    return Math.max(0, Math.floor(rate * 10));
  }, [form.credits_per_cny]);

  const saveConfig = async () => {
    setSaving(true);
    setMsg("");
    try {
      const planPayloads = plans.map((plan) => ({
        id: plan.id,
        payload: {
          name: plan.name,
          description: plan.description || "",
          role: plan.role || "normal",
          price_cents: Math.round(
            requiredNumber(
              plan.price_yuan,
              lt(`${plan.name}价格`, `${plan.name} price`),
              0,
            ) * 100,
          ),
          currency: plan.currency || "CNY",
          interval: plan.interval || "month",
          credits: requiredInteger(
            plan.credits_input,
            lt(`${plan.name}积分`, `${plan.name} credits`),
            0,
          ),
          enabled: Boolean(plan.enabled),
          sort_order: requiredInteger(
            plan.sort_order_input,
            lt(`${plan.name}排序`, `${plan.name} order`),
            0,
          ),
          features: Array.isArray(plan.features) ? plan.features : [],
          stripe_price_id: plan.stripe_price_id || "",
        },
      }));

      const creditsPerCny = requiredInteger(
        form.credits_per_cny,
        lt("每元积分", "Credits per CNY"),
        1,
      );
      const rechargeMinYuan = requiredNumber(
        form.recharge_min_yuan,
        lt("最低充值金额", "Minimum recharge"),
        1,
      );
      const rechargeMaxYuan = requiredNumber(
        form.recharge_max_yuan,
        lt("最高充值金额", "Maximum recharge"),
        rechargeMinYuan,
      );
      const rechargePresets = parseRechargePresets(form.recharge_presets_yuan);
      if (!rechargePresets.length) {
        throw new Error(lt("至少配置一个充值预设金额", "Configure at least one recharge preset"));
      }
      if (rechargePresets.some((value) => value < rechargeMinYuan || value > rechargeMaxYuan)) {
        throw new Error(
          lt(
            "充值预设金额必须位于最低和最高充值金额之间",
            "Recharge presets must be between the minimum and maximum amounts",
          ),
        );
      }

      const normalizedModuleCosts = Object.fromEntries(
        moduleCosts.map((item) => [
          item.key,
          requiredInteger(
            form.module_credit_costs[item.key] ?? String(item.default_cost || 0),
            lt(item.label, MODULE_LABELS_EN[item.key] || item.key),
            0,
          ),
        ]),
      );

      const rewardedAds = form.rewarded_ads;
      const billingConfig = {
        credits_per_cny: creditsPerCny,
        quarter_discount_pct: requiredNumber(
          form.quarter_discount_pct,
          lt("季度优惠率", "Quarterly discount"),
          0,
        ),
        recharge_min_cents: Math.round(rechargeMinYuan * 100),
        recharge_max_cents: Math.round(rechargeMaxYuan * 100),
        recharge_presets_cents: rechargePresets.map((value) => Math.round(value * 100)),
        module_credit_costs: normalizedModuleCosts,
        credit_recharge: {
          enabled: Boolean(form.credit_recharge.enabled),
        },
        enterprise_plan: {
          enabled: Boolean(form.enterprise_plan.enabled),
        },
        rewarded_ads: {
          enabled: rewardedAds.enabled,
          free_only: true,
          reward_credits: requiredInteger(
            rewardedAds.reward_credits,
            lt("单次广告奖励积分", "Reward credits per ad"),
            1,
          ),
          daily_limit: requiredInteger(
            rewardedAds.daily_limit,
            lt("每日广告次数", "Daily ad limit"),
            1,
          ),
          cooldown_seconds: requiredInteger(
            rewardedAds.cooldown_seconds,
            lt("广告冷却时间", "Ad cooldown"),
            15,
          ),
          session_ttl_seconds: requiredInteger(
            rewardedAds.session_ttl_seconds,
            lt("广告会话有效期", "Ad session lifetime"),
            120,
          ),
          google: rewardedAds.google,
          meta: rewardedAds.meta,
          pangle: rewardedAds.pangle,
          gdt: rewardedAds.gdt,
          baidu: rewardedAds.baidu,
          kuaishou: rewardedAds.kuaishou,
        },
      };

      const updatedPlanPayloads: any[] = await Promise.all(
        planPayloads.map((item) =>
          (api as any).updateAdminSubscriptionPlan(item.id, item.payload),
        ),
      );
      const billingPayload: any = await (api as any).saveAdminBillingSettings({
        config: billingConfig,
      });

      const refreshedPlans = Array.isArray(billingPayload?.plans)
        ? billingPayload.plans
        : updatedPlanPayloads.map((item) => item?.plan).filter(Boolean);
      setPlans(refreshedPlans.filter(Boolean).map(toPlanDraft));
      const nextModuleCosts = Array.isArray(billingPayload?.module_costs)
        ? billingPayload.module_costs
        : moduleCosts;
      setModuleCosts(nextModuleCosts);
      setForm(toBillingForm(billingPayload?.settings || billingConfig, nextModuleCosts));
      setMsg(
        lt(
          "计费配置已保存，新的套餐价格和 AI 积分消耗立即生效。",
          "Billing config saved. Plan prices and AI credit costs are now active.",
        ),
      );
      setMsgTone("success");
    } catch (error: any) {
      setMsg(error?.message || lt("计费配置保存失败", "Failed to save billing config"));
      setMsgTone("error");
    } finally {
      setSaving(false);
    }
  };

  if (!canManageSystem) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>{lt("计费配置", "Billing Config")}</h2>
          <p>{lt("计费配置仅系统管理员可见。", "Billing config is only visible to administrators.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section settings-billing-config-section">
      <div className="settings-section-accent settings-billing-accent" />
      <div className="settings-section-header settings-billing-header">
        <div>
          <h2>{lt("计费配置", "Billing Config")}</h2>
          <p>
            {lt(
              "集中维护订阅套餐、积分充值规则、AI 功能扣分与免费用户奖励广告。支付密钥仍在支付配置中维护。",
              "Manage plans, credit recharge rules, AI usage costs and rewarded ads. Payment secrets remain under Payment Config.",
            )}
          </p>
        </div>
        <div className="settings-billing-actions">
          <button className="figma-btn" type="button" onClick={loadConfig} disabled={loading || saving}>
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? lt("刷新中...", "Refreshing...") : lt("刷新", "Refresh")}
          </button>
          <button className="figma-btn figma-btn-primary" type="button" onClick={saveConfig} disabled={loading || saving}>
            <Save size={15} aria-hidden="true" />
            {saving ? lt("保存中...", "Saving...") : lt("保存全部计费配置", "Save Billing Config")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="settings-billing-loading">{lt("正在加载计费配置...", "Loading billing config...")}</p>
      ) : (
        <div className="settings-billing-stack">
          <section className="settings-billing-panel settings-billing-plan-panel">
            <div className="settings-billing-panel-header settings-billing-ad-header">
              <span className="settings-billing-panel-icon"><BadgeDollarSign size={18} aria-hidden="true" /></span>
              <div>
                <h3>{lt("订阅套餐定价", "Subscription Pricing")}</h3>
                <p>{lt("价格单位为人民币，积分在每个订阅周期发放。停用后套餐不会出现在用户订阅页，企业版入口由右侧开关控制。", "Prices are in CNY and credits are issued per billing cycle. Disabled plans are hidden from users; the enterprise entry is controlled by the switch on the right.")}</p>
              </div>
              <label className="settings-billing-master-switch">
                <input
                  type="checkbox"
                  checked={form.enterprise_plan.enabled}
                  onChange={(event) => patchEnterprisePlan("enabled", event.target.checked)}
                />
                <span>
                  {form.enterprise_plan.enabled
                    ? lt("企业版已显示", "Enterprise shown")
                    : lt("企业版未显示", "Enterprise hidden")}
                </span>
              </label>
            </div>
            <div className="settings-billing-quarter-rule">
              <label className="settings-billing-field">
                <span>{lt("季度优惠率", "Quarterly Discount")}</span>
                <div className="settings-billing-input-affix suffix">
                  <input
                    type="number"
                    min="0"
                    max="80"
                    step="0.1"
                    value={form.quarter_discount_pct}
                    onChange={(event) => patchForm("quarter_discount_pct", event.target.value)}
                  />
                  <span>%</span>
                </div>
                <small>
                  {lt(
                    "季度价格 = 月付价格 × 3 × (1 - 优惠率)，保存后自动同步季度套餐。",
                    "Quarterly price = monthly price x 3 x (1 - discount), synced after saving.",
                  )}
                </small>
              </label>
            </div>
            <div className="settings-billing-plan-list">
              {plans.map((plan) => (
                <div className={`settings-billing-plan-row tier-${plan.role || "normal"}`} key={plan.id}>
                  <div className="settings-billing-plan-identity">
                    <label className="settings-billing-enable">
                      <input type="checkbox" checked={Boolean(plan.enabled)} onChange={(event) => patchPlan(plan.id, "enabled", event.target.checked)} />
                      <span>{plan.enabled ? lt("启用", "Enabled") : lt("停用", "Disabled")}</span>
                    </label>
                    <strong>{plan.name}</strong>
                    <small>{plan.key}</small>
                  </div>
                  <label className="settings-billing-field">
                    <span>{lt("权限等级", "Tier")}</span>
                    <select value={plan.role || "normal"} onChange={(event) => patchPlan(plan.id, "role", event.target.value)}>
                      <option value="normal">{lt("免费用户", "Free")}</option>
                      <option value="vip">{lt("专业版", "VIP")}</option>
                      <option value="svip">{lt("旗舰版", "SVIP")}</option>
                    </select>
                  </label>
                  <label className="settings-billing-field">
                    <span>{lt("计费周期", "Billing Cycle")}</span>
                    <select value={plan.interval || "month"} onChange={(event) => patchPlan(plan.id, "interval", event.target.value)}>
                      <option value="trial">{lt("试用", "Trial")}</option>
                      <option value="month">{lt("月付", "Monthly")}</option>
                      <option value="quarter">{lt("季付", "Quarterly")}</option>
                      <option value="year">{lt("年付", "Annual")}</option>
                    </select>
                  </label>
                  <label className="settings-billing-field">
                    <span>{lt("售价", "Price")}</span>
                    <div className="settings-billing-input-affix">
                      <span>￥</span>
                      <input type="number" min="0" step="0.01" value={plan.price_yuan} onChange={(event) => patchPlan(plan.id, "price_yuan", event.target.value)} />
                    </div>
                  </label>
                  <label className="settings-billing-field">
                    <span>{lt("周期积分", "Cycle Credits")}</span>
                    <div className="settings-billing-input-affix suffix">
                      <input type="number" min="0" step="1" value={plan.credits_input} onChange={(event) => patchPlan(plan.id, "credits_input", event.target.value)} />
                      <span>{lt("积分", "credits")}</span>
                    </div>
                  </label>
                  <label className="settings-billing-field settings-billing-order-field">
                    <span>{lt("排序", "Order")}</span>
                    <input type="number" min="0" step="1" value={plan.sort_order_input} onChange={(event) => patchPlan(plan.id, "sort_order_input", event.target.value)} />
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="settings-billing-panel">
            <div className="settings-billing-panel-header">
              <span className="settings-billing-panel-icon"><Coins size={18} aria-hidden="true" /></span>
              <div>
                <h3>{lt("AI 模块积分消耗", "AI Module Credit Costs")}</h3>
                <p>{lt("设置每次调用实际扣除的积分，系统管理员仍保持无限额度且不扣分。", "Set the credits charged per call. Administrators remain unlimited and are not charged.")}</p>
              </div>
            </div>
            <div className="settings-billing-cost-grid">
              {moduleCosts.map((item) => (
                <label className="settings-billing-cost-item" key={item.key}>
                  <span className="settings-billing-cost-name">
                    <strong>{lt(item.label, MODULE_LABELS_EN[item.key] || item.key)}</strong>
                    <small>{item.key} · {lt(`默认 ${item.default_cost}`, `Default ${item.default_cost}`)}</small>
                  </span>
                  <span className="settings-billing-cost-input">
                    <input type="number" min="0" step="1" value={form.module_credit_costs[item.key] ?? ""} onChange={(event) => patchModuleCost(item.key, event.target.value)} />
                    <span>{lt("积分/次", "credits/call")}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-billing-panel">
            <div className="settings-billing-panel-header settings-billing-ad-header">
              <span className="settings-billing-panel-icon"><Coins size={18} aria-hidden="true" /></span>
              <div>
                <h3>{lt("积分充值规则", "Credit Recharge Rules")}</h3>
                <p>
                  {lt(
                    `当前预览：充值 10 元可获得 ${rechargePreview} 积分。开启后用户订阅页才显示购买积分入口。`,
                    `Preview: CNY 10 grants ${rechargePreview} credits. The credit purchase entry is shown only when enabled.`,
                  )}
                </p>
              </div>
              <label className="settings-billing-master-switch">
                <input
                  type="checkbox"
                  checked={form.credit_recharge.enabled}
                  onChange={(event) => patchCreditRecharge("enabled", event.target.checked)}
                />
                <span>
                  {form.credit_recharge.enabled
                    ? lt("购买积分已显示", "Credit purchase shown")
                    : lt("购买积分已隐藏", "Credit purchase hidden")}
                </span>
              </label>
            </div>
            <div className="settings-billing-recharge-grid">
              <label className="settings-billing-field">
                <span>{lt("1 元兑换积分", "Credits per CNY")}</span>
                <input type="number" min="1" step="1" value={form.credits_per_cny} onChange={(event) => patchForm("credits_per_cny", event.target.value)} />
              </label>
              <label className="settings-billing-field">
                <span>{lt("最低充值金额", "Minimum Recharge")}</span>
                <div className="settings-billing-input-affix"><span>￥</span><input type="number" min="1" step="0.01" value={form.recharge_min_yuan} onChange={(event) => patchForm("recharge_min_yuan", event.target.value)} /></div>
              </label>
              <label className="settings-billing-field">
                <span>{lt("最高充值金额", "Maximum Recharge")}</span>
                <div className="settings-billing-input-affix"><span>￥</span><input type="number" min="1" step="0.01" value={form.recharge_max_yuan} onChange={(event) => patchForm("recharge_max_yuan", event.target.value)} /></div>
              </label>
              <label className="settings-billing-field settings-billing-presets-field">
                <span>{lt("充值预设金额", "Recharge Presets")}</span>
                <input value={form.recharge_presets_yuan} onChange={(event) => patchForm("recharge_presets_yuan", event.target.value)} placeholder={lt("例如：10, 30, 50, 100", "Example: 10, 30, 50, 100")} />
                <small>{lt("使用逗号分隔，单位为元，最多保存 8 个。", "Comma-separated CNY amounts, up to 8 values.")}</small>
              </label>
            </div>
          </section>

          <section className="settings-billing-panel settings-billing-ad-panel">
            <div className="settings-billing-panel-header settings-billing-ad-header">
              <span className="settings-billing-panel-icon"><Megaphone size={18} aria-hidden="true" /></span>
              <div>
                <h3>{lt("免费用户奖励广告", "Rewarded Ads for Free Users")}</h3>
                <p>{lt("仅完整观看获批的奖励广告后发放积分；未启用或未配置广告商时，用户侧不会展示入口。", "Credits are granted only after an approved rewarded ad completes. The user entry stays hidden until a provider is enabled and configured.")}</p>
              </div>
              <label className="settings-billing-master-switch">
                <input type="checkbox" checked={form.rewarded_ads.enabled} onChange={(event) => patchRewardedAds("enabled", event.target.checked)} />
                <span>{form.rewarded_ads.enabled ? lt("已启用", "Enabled") : lt("未启用", "Disabled")}</span>
              </label>
            </div>

            <div className="settings-billing-ad-common-grid">
              <label className="settings-billing-field">
                <span>{lt("单次奖励", "Credits per Ad")}</span>
                <input type="number" min="1" step="1" value={form.rewarded_ads.reward_credits} onChange={(event) => patchRewardedAds("reward_credits", event.target.value)} />
              </label>
              <label className="settings-billing-field">
                <span>{lt("每日上限", "Daily Limit")}</span>
                <input type="number" min="1" step="1" value={form.rewarded_ads.daily_limit} onChange={(event) => patchRewardedAds("daily_limit", event.target.value)} />
              </label>
              <label className="settings-billing-field">
                <span>{lt("冷却时间（秒）", "Cooldown (seconds)")}</span>
                <input type="number" min="15" step="1" value={form.rewarded_ads.cooldown_seconds} onChange={(event) => patchRewardedAds("cooldown_seconds", event.target.value)} />
              </label>
              <label className="settings-billing-field">
                <span>{lt("会话有效期（秒）", "Session Lifetime (seconds)")}</span>
                <input type="number" min="120" step="1" value={form.rewarded_ads.session_ttl_seconds} onChange={(event) => patchRewardedAds("session_ttl_seconds", event.target.value)} />
              </label>
            </div>

            <div className="settings-billing-ad-provider-grid">
              <div className="settings-billing-ad-provider google">
                <div className="settings-billing-provider-head">
                  <div><strong>Google Rewarded Ads</strong><small>{lt("Google Publisher Tag 奖励广告位", "Google Publisher Tag rewarded ad unit")}</small></div>
                  <label><input type="checkbox" checked={form.rewarded_ads.google.enabled} onChange={(event) => patchAdProvider("google", "enabled", event.target.checked)} /><span>{lt("启用", "Enable")}</span></label>
                </div>
                <label className="settings-billing-field"><span>Publisher ID</span><input value={form.rewarded_ads.google.publisher_id} onChange={(event) => patchAdProvider("google", "publisher_id", event.target.value)} placeholder="pub-..." /></label>
                <label className="settings-billing-field"><span>{lt("奖励广告位路径", "Rewarded Ad Unit Path")}</span><input value={form.rewarded_ads.google.ad_unit_path} onChange={(event) => patchAdProvider("google", "ad_unit_path", event.target.value)} placeholder="/1234567/rewarded_web" /></label>
              </div>

              {REWARDED_EXTERNAL_PROVIDERS.map((provider) => {
                const providerForm = form.rewarded_ads[provider.key];
                return (
                  <div className={`settings-billing-ad-provider ${provider.key}`} key={provider.key}>
                    <div className="settings-billing-provider-head">
                      <div>
                        <strong>{lt(provider.name, provider.nameEn)}</strong>
                        <small>{lt(provider.desc, provider.descEn)}</small>
                      </div>
                      <label>
                        <input
                          type="checkbox"
                          checked={providerForm.enabled}
                          onChange={(event) => patchAdProvider(provider.key, "enabled", event.target.checked)}
                        />
                        <span>{lt("启用", "Enable")}</span>
                      </label>
                    </div>
                    <div className="settings-billing-meta-grid">
                      <label className="settings-billing-field">
                        <span>App ID</span>
                        <input
                          value={providerForm.app_id}
                          onChange={(event) => patchAdProvider(provider.key, "app_id", event.target.value)}
                        />
                      </label>
                      <label className="settings-billing-field">
                        <span>Placement ID</span>
                        <input
                          value={providerForm.placement_id}
                          onChange={(event) => patchAdProvider(provider.key, "placement_id", event.target.value)}
                        />
                      </label>
                      <label className="settings-billing-field wide">
                        <span>{lt("广告跳转地址", "Ad Launch URL")}</span>
                        <input
                          value={providerForm.launch_url}
                          onChange={(event) => patchAdProvider(provider.key, "launch_url", event.target.value)}
                          placeholder="https://ads.example.com/reward"
                        />
                      </label>
                      <label className="settings-billing-field wide">
                        <span>{lt("回调签名密钥", "Callback Secret")}</span>
                        <input
                          value={providerForm.callback_secret}
                          onChange={(event) => patchAdProvider(provider.key, "callback_secret", event.target.value)}
                          placeholder={lt("保存后显示脱敏值", "Masked after saving")}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="settings-billing-provider-note">
              {lt(
                "国内广告平台建议使用自有广告中转页；用户完成观看后，由中转服务 POST /api/subscription/reward-ads/callback/{provider}，签名为 HMAC_SHA256(session_token:event_id:timestamp, 回调签名密钥)。",
                "For China ad networks, use your own ad bridge page. After completion, the bridge should POST /api/subscription/reward-ads/callback/{provider}; signature = HMAC_SHA256(session_token:event_id:timestamp, callback secret).",
              )}
            </p>
          </section>
        </div>
      )}

      {msg && <p className={`settings-billing-message ${msgTone}`} role="status">{msg}</p>}
    </div>
  );
}
