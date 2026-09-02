import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useLangText } from "../shared/language";
import {
  isCodeInMarket,
  normalizeSecurityInput,
  useMarket,
} from "../shared/market";

interface Position {
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  market_value: number;
  daily_change_pct?: number;
  daily_change_amount?: number;
  price_date?: string | null;
}

interface TradeRecord {
  id: number;
  stock_code: string;
  stock_name: string;
  trade_type: string;
  price: number;
  quantity: number;
  amount: number;
  fee: number;
  trade_time: string;
}

interface Account {
  market?: string;
  currency?: string;
  currency_symbol?: string;
  balance: number;
  frozen_balance: number;
  total_assets: number;
  positions: Position[];
}

interface StrategyOption {
  id: number;
  name: string;
  factor_ids?: number[];
  factors?: { id: number; display_name?: string; name?: string }[];
}

interface StrategyAutomation {
  id: number;
  name: string;
  status: string;
  market?: string;
  strategy_id: number;
  strategy_name?: string;
  stock_pool_codes?: string[];
  max_positions: number;
  per_trade_amount: number;
  max_position_pct: number;
  run_interval_minutes: number;
  last_run_at?: string | null;
  last_error?: string | null;
  last_result?: {
    candidate_count?: number;
    buy_count?: number;
    sell_count?: number;
    hold_count?: number;
    skipped_count?: number;
    pool_source?: string;
    actions?: any[];
  };
}

const isCodeLike = (value: string) => {
  const text = (value || "").trim();
  return /^\d{5,6}(\.\w+)?$/i.test(text) || /^[a-z]{2}\d{6}$/i.test(text);
};

export default function TradingPage() {
  const lt = useLangText();
  const { market, definition } = useMarket();
  const minimumOrderQuantity = market === "CN" ? 100 : 1;
  const [account, setAccount] = useState<Account | null>(null);
  const [records, setRecords] = useState<TradeRecord[]>([]);
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [automations, setAutomations] = useState<StrategyAutomation[]>([]);
  const [tab, setTab] = useState<"positions" | "records">("positions");
  const [form, setForm] = useState({
    stock_code: "",
    quantity: "",
    price: "",
    trade_type: "buy",
  });
  const [automationForm, setAutomationForm] = useState({
    id: 0,
    strategy_id: "",
    name: "",
    stock_pool_text: "",
    per_trade_amount: "100000",
    max_positions: "5",
    max_position_pct: "20",
    run_interval_minutes: "5",
  });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [automationMsg, setAutomationMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteName, setQuoteName] = useState("");
  const [loading, setLoading] = useState(false);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationExpanded, setAutomationExpanded] = useState(false);
  const [feeSettings, setFeeSettings] = useState<{ fee_rate?: number; minimum_fee?: number } | null>(null);

  const loadAccount = useCallback(async () => {
    try {
      const data = await api.getSimulationAccount(market);
      setAccount(data);
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    }
  }, [market]);

  const loadRecords = useCallback(async () => {
    try {
      const data = await api.getTradeRecords(market);
      setRecords(Array.isArray(data) ? data : data.records || []);
    } catch {}
  }, [market]);

  const loadAutomationData = useCallback(async () => {
    try {
      const [strategyRows, automationRows] = await Promise.all([
        api.listSimulationAutomationStrategies(),
        api.listStrategyAutomations(market),
      ]);
      const nextStrategies = Array.isArray(strategyRows) ? strategyRows : [];
      setStrategies(nextStrategies);
      setAutomations(Array.isArray(automationRows) ? automationRows : []);
      setAutomationForm((prev) =>
        prev.strategy_id || nextStrategies.length === 0
          ? prev
          : { ...prev, strategy_id: String(nextStrategies[0].id) },
      );
    } catch (e: any) {
      setAutomationMsg({ text: e.message, ok: false });
    }
  }, [market]);

  useEffect(() => {
    loadAccount();
    loadRecords();
    loadAutomationData();
    api.getSimulationFeeSettings().then((payload: any) => {
      setFeeSettings(payload?.settings?.[market] || null);
    }).catch(() => setFeeSettings(null));
  }, [loadAccount, loadRecords, loadAutomationData, market]);

  useEffect(() => {
    setAccount(null);
    setRecords([]);
    setAutomations([]);
    setForm((current) => ({
      ...current,
      stock_code: "",
      quantity: "",
      price: "",
    }));
    setQuoteName("");
    setMsg(null);
    setAutomationMsg(null);
    setAutomationForm((current) => ({
      ...current,
      id: 0,
      name: "",
      stock_pool_text: "",
    }));
  }, [market]);

  useEffect(() => {
    const query = form.stock_code.trim();
    if (query.length < 2) {
      setQuoteName("");
      return;
    }
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const looksLikeCode =
          isCodeLike(query) ||
          (market === "US" && /^[A-Za-z.]{1,10}$/.test(query)) ||
          (market === "HK" && /^(?:hk)?\d{1,5}(?:\.hk)?$/i.test(query));
        let code = looksLikeCode ? normalizeSecurityInput(query, market) : query;
        let name = "";
        if (!looksLikeCode) {
          const hits: any = await api.searchStocks(query, market);
          const first = Array.isArray(hits) ? hits[0] : null;
          if (first?.code) {
            code = normalizeSecurityInput(first.code, market);
            name = first.name || "";
            setForm((f) =>
              f.stock_code === code ? f : { ...f, stock_code: code },
            );
          }
        }
        const quote: any = await api.getStockQuote(code);
        const price = Number(
          quote?.price ?? quote?.current_price ?? quote?.close ?? 0,
        );
        if (price > 0) {
          setForm((f) => ({ ...f, price: price.toFixed(2) }));
          setQuoteName(quote?.name || name || code);
        }
      } catch {
        setQuoteName("");
      } finally {
        setQuoteLoading(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [form.stock_code, market]);

  const handleTrade = async () => {
    if (!form.stock_code || !form.quantity || !form.price) {
      setMsg({
        text: lt(
          "请填写股票代码、价格和数量",
          "Please fill ticker, price and quantity",
        ),
        ok: false,
      });
      return;
    }
    const quantity = Number(form.quantity);
    const price = Number(form.price);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isInteger(quantity)
    ) {
      setMsg({
        text: lt(
          "数量必须为正整数（单位：股）",
          "Quantity must be a positive integer (shares)",
        ),
        ok: false,
      });
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setMsg({
        text: lt(
          "价格必须为大于0的数字",
          "Price must be a number greater than 0",
        ),
        ok: false,
      });
      return;
    }
    if (
      quantity < minimumOrderQuantity ||
      (market === "CN" && quantity % minimumOrderQuantity !== 0)
    ) {
      setMsg({
        text:
          market === "CN"
            ? lt(
                "A股买卖数量需为1手起，且按100股整数倍下单",
                "A-share quantity must start from 1 lot and be multiples of 100 shares",
              )
            : lt(
                `${definition.labelZh}模拟交易数量至少为1股`,
                `${definition.labelEn} paper orders require at least 1 share`,
              ),
        ok: false,
      });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const stockCode = normalizeSecurityInput(form.stock_code, market);
      await api.executeTrade({
        stock_code: stockCode,
        trade_type: form.trade_type,
        quantity,
        price,
        market,
      });
      setMsg({
        text: `${form.trade_type === "buy" ? lt("买入", "Buy") : lt("卖出", "Sell")}${lt("成功", " success")}`,
        ok: true,
      });
      setForm((f) => ({ ...f, stock_code: "", quantity: "", price: "" }));
      await loadAccount();
      await loadRecords();
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  const stockPoolCodesFromText = (text: string) =>
    text
      .split(/[\s,，;；]+/)
      .map((item) => normalizeSecurityInput(item, market))
      .filter(Boolean);

  const handleSaveAutomation = async () => {
    if (!automationForm.strategy_id) {
      setAutomationMsg({
        text: lt("请选择要绑定的策略", "Please select a strategy"),
        ok: false,
      });
      return;
    }
    setAutomationLoading(true);
    setAutomationMsg(null);
    try {
      const payload = {
        id: automationForm.id || undefined,
        strategy_id: Number(automationForm.strategy_id),
        market,
        name: automationForm.name,
        stock_pool_codes: stockPoolCodesFromText(automationForm.stock_pool_text),
        per_trade_amount: Number(automationForm.per_trade_amount || 100000),
        max_positions: Number(automationForm.max_positions || 5),
        max_position_pct: Number(automationForm.max_position_pct || 20),
        run_interval_minutes: Number(automationForm.run_interval_minutes || 5),
      };
      const saved = await api.saveStrategyAutomation(payload);
      setAutomationMsg({
        text: lt("策略自动化配置已保存", "Strategy automation saved"),
        ok: true,
      });
      setAutomationForm((prev) => ({ ...prev, id: saved?.id || prev.id }));
      await loadAutomationData();
    } catch (e: any) {
      setAutomationMsg({ text: e.message, ok: false });
    } finally {
      setAutomationLoading(false);
    }
  };

  const loadAutomationIntoForm = (row: StrategyAutomation) => {
    setAutomationForm({
      id: row.id,
      strategy_id: String(row.strategy_id),
      name: row.name || "",
      stock_pool_text: (row.stock_pool_codes || []).join(", "),
      per_trade_amount: String(row.per_trade_amount || 100000),
      max_positions: String(row.max_positions || 5),
      max_position_pct: String(row.max_position_pct || 20),
      run_interval_minutes: String(row.run_interval_minutes || 5),
    });
    setAutomationMsg({
      text: lt("已载入配置，可修改后保存", "Loaded for editing"),
      ok: true,
    });
  };

  const handleAutomationAction = async (
    row: StrategyAutomation,
    action: "start" | "stop" | "run" | "delete",
  ) => {
    setAutomationLoading(true);
    setAutomationMsg(null);
    try {
      if (action === "start") {
        await api.startStrategyAutomation(row.id);
        setAutomationMsg({ text: lt("自动交易已启动", "Automation started"), ok: true });
      } else if (action === "stop") {
        await api.stopStrategyAutomation(row.id);
        setAutomationMsg({ text: lt("自动交易已暂停", "Automation stopped"), ok: true });
      } else if (action === "run") {
        const result = await api.runStrategyAutomation(row.id);
        const summary = result?.result || result?.automation?.last_result || {};
        setAutomationMsg({
          text: lt(
            `运行完成：买入 ${summary.buy_count || 0}，卖出 ${summary.sell_count || 0}，跳过 ${summary.skipped_count || 0}`,
            `Run completed: buy ${summary.buy_count || 0}, sell ${summary.sell_count || 0}, skipped ${summary.skipped_count || 0}`,
          ),
          ok: true,
        });
        await loadAccount();
        await loadRecords();
      } else {
        await api.deleteStrategyAutomation(row.id);
        setAutomationMsg({ text: lt("配置已删除", "Automation deleted"), ok: true });
        if (automationForm.id === row.id) {
          setAutomationForm((prev) => ({ ...prev, id: 0, name: "" }));
        }
      }
      await loadAutomationData();
    } catch (e: any) {
      setAutomationMsg({ text: e.message, ok: false });
    } finally {
      setAutomationLoading(false);
    }
  };

  const fmt = (n: number) =>
    n?.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) ?? "-";
  const currencySymbol = account?.currency_symbol || definition.currencySymbol;
  const money = (n: number) => `${currencySymbol}${fmt(n)}`;
  const orderMoney = (n: number) => `${definition.currencySymbol}${fmt(n)}`;
  const marketPositions = (account?.positions ?? []).filter((position) =>
    isCodeInMarket(position.stock_code, market),
  );
  const marketRecords = records.filter((record) =>
    isCodeInMarket(record.stock_code, market),
  );

  const totalAssets = account?.total_assets ?? 0;
  const balance = account?.balance ?? 0;
  const positionValue = totalAssets - balance;
  const positionDayStats = marketPositions.reduce(
    (acc, p) => {
      const marketValue = Number(p.market_value || 0);
      const qty = Number(p.quantity || 0);
      const pct = Number(p.daily_change_pct ?? 0);
      const perShareChange = Number(p.daily_change_amount ?? 0);
      const amount =
        Number.isFinite(perShareChange) && perShareChange !== 0
          ? perShareChange * qty
          : marketValue - marketValue / (1 + pct / 100);
      const base = marketValue - amount;
      return {
        amount: acc.amount + (Number.isFinite(amount) ? amount : 0),
        base: acc.base + (Number.isFinite(base) && base > 0 ? base : 0),
      };
    },
    { amount: 0, base: 0 },
  );
  const positionDayPct =
    positionDayStats.base > 0
      ? (positionDayStats.amount / positionDayStats.base) * 100
      : 0;
  const positionDayClass =
    positionDayPct > 0
      ? "figma-badge-up"
      : positionDayPct < 0
        ? "figma-badge-down"
        : "";
  const selectedStrategy = strategies.find(
    (item) => String(item.id) === automationForm.strategy_id,
  );
  const selectedFactorNames = (selectedStrategy?.factors || [])
    .map((item) => item.display_name || item.name)
    .filter(Boolean)
    .join("、");
  const runningAutomationCount = automations.filter(
    (row) => row.status === "running",
  ).length;
  const currencyLabelZh =
    definition.currency === "CNY"
      ? "人民币"
      : definition.currency === "HKD"
        ? "港币"
        : "美元";

  return (
    <div className="trading-page">
      {/* ─── Asset Cards Row ─── */}
      <div className="trading-cards-row">
        <div className="trading-asset-card">
          <div>
            <div className="trading-asset-title">
              {lt("总资产", "TOTAL ASSETS")}
            </div>
            <div
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
            >
              {lt(`${currencyLabelZh}计价`, `${definition.currency} Base`)}
            </div>
          </div>
          <div className="trading-asset-value">{money(totalAssets)}</div>
        </div>
        <div className="trading-asset-card">
          <div>
            <div className="trading-asset-title">
              {lt("可用资金", "AVAILABLE BALANCE")}
            </div>
            <div
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
            >
              {lt("可用现金", "Unencumbered Cash")}
            </div>
          </div>
          <div className="trading-asset-value">{money(balance)}</div>
        </div>
        <div className="trading-asset-card">
          <div>
            <div className="trading-asset-title">
              {lt("持仓市值", "POSITION VALUE")}
            </div>
            <div
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
            >
              {lt("盯市估值", "Mark-to-Market")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
            <div className="trading-asset-value">{money(positionValue)}</div>
            <span
              className={`figma-badge ${positionDayClass}`}
              title={lt("持仓组合当日涨幅", "Position daily change")}
            >
              {positionDayPct > 0 ? "+" : ""}
              {positionDayPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
      {feeSettings && <p className="trading-fee-hint">{lt("佣金规则", "Commission")}: {lt(`万${(Number(feeSettings.fee_rate || 0) * 10000).toFixed(1)}`, `${(Number(feeSettings.fee_rate || 0) * 10000).toFixed(1)} bp`)} ({((Number(feeSettings.fee_rate || 0) * 100).toFixed(3))}%) · {lt("最低", "minimum")} {money(Number(feeSettings.minimum_fee || 0))}</p>}

      <div className="trading-automation-panel">
        <div className="trading-automation-header">
          <div>
            <h2>{lt("策略自动模拟交易", "Strategy Automation")}</h2>
            <p>
              {lt(
                `绑定已保存策略到${definition.labelZh}模拟账户；因子负责股票池，策略代码负责买入、卖出、仓位和风控。`,
                `Bind a saved strategy to the ${definition.labelEn} paper account. Factors define the pool; strategy code controls orders and risk.`,
              )}
            </p>
          </div>
          <div className="trading-automation-header-actions">
            <span className="figma-badge figma-badge-success">
              {lt("模拟账户", "PAPER")}
            </span>
            <button
              className="figma-btn figma-btn-sm"
              type="button"
              onClick={() => setAutomationExpanded((value) => !value)}
            >
              {automationExpanded
                ? lt("隐藏配置", "Hide Config")
                : lt("展开配置", "Show Config")}
            </button>
          </div>
        </div>

        <div className="trading-automation-summary">
          <span>
            {lt("已绑定", "Bindings")} <strong>{automations.length}</strong>
          </span>
          <span>
            {lt("运行中", "Running")} <strong>{runningAutomationCount}</strong>
          </span>
          <span>
            {lt("可用策略", "Strategies")} <strong>{strategies.length}</strong>
          </span>
        </div>

        {!automationExpanded && (
          <div className="trading-automation-summary-list">
            {automations.map((row) => {
              const result = row.last_result || {};
              const isRunning = row.status === "running";
              return (
                <button
                  key={row.id}
                  type="button"
                  className="trading-automation-summary-item"
                  onClick={() => {
                    loadAutomationIntoForm(row);
                    setAutomationExpanded(true);
                  }}
                >
                  <span>
                    <strong>{row.name || lt("未命名配置", "Untitled")}</strong>
                    <small>{row.strategy_name || lt("未知策略", "Unknown strategy")}</small>
                  </span>
                  <em className={isRunning ? "running" : ""}>
                    {isRunning ? lt("运行中", "Running") : lt("已暂停", "Stopped")}
                  </em>
                  <small>
                    {lt("候选", "Pool")} {result.candidate_count ?? "-"} ·{" "}
                    {lt("买入", "Buy")} {result.buy_count ?? 0} ·{" "}
                    {lt("卖出", "Sell")} {result.sell_count ?? 0}
                  </small>
                </button>
              );
            })}
            {automations.length === 0 && (
              <div className="trading-automation-empty compact">
                {lt(
                  "暂无自动交易绑定，展开配置后可以创建。",
                  "No automation binding yet. Show config to create one.",
                )}
              </div>
            )}
          </div>
        )}

        {automationExpanded && (
        <div className="trading-automation-grid">
          <div className="trading-automation-form">
            <div className="settings-field">
              <label>{lt("绑定策略", "Strategy")}</label>
              <select
                className="figma-input"
                value={automationForm.strategy_id}
                onChange={(e) =>
                  setAutomationForm((f) => ({
                    ...f,
                    strategy_id: e.target.value,
                  }))
                }
              >
                {strategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </option>
                ))}
                {strategies.length === 0 && (
                  <option value="">
                    {lt("暂无可绑定策略", "No saved strategies")}
                  </option>
                )}
              </select>
              <div className="trading-automation-hint">
                {selectedFactorNames
                  ? `${lt("策略股票池因子", "Pool factors")}: ${selectedFactorNames}`
                  : lt(
                      "未手动填写股票池时，将优先使用策略保存的因子股票池。",
                      "If no manual pool is set, saved strategy factors are used first.",
                    )}
              </div>
            </div>

            <div className="settings-field">
              <label>{lt("配置名称", "Name")}</label>
              <input
                className="figma-input"
                value={automationForm.name}
                onChange={(e) =>
                  setAutomationForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder={lt("如：海龟策略模拟盘", "e.g. Turtle paper run")}
              />
            </div>

            <div className="settings-field trading-automation-wide">
              <label>{lt("手动股票池（可选）", "Manual Pool (Optional)")}</label>
              <textarea
                className="figma-input"
                value={automationForm.stock_pool_text}
                onChange={(e) =>
                  setAutomationForm((f) => ({
                    ...f,
                    stock_pool_text: e.target.value,
                  }))
                }
                placeholder={lt(
                  "输入代码或名称筛选后的股票代码，逗号或换行分隔；留空则使用策略因子股票池",
                  "Codes separated by commas or new lines. Leave empty to use strategy factors.",
                )}
              />
            </div>

            <div className="settings-field">
              <label>{lt("单笔金额", "Cash / Trade")}</label>
              <input
                className="figma-input"
                type="number"
                min="1000"
                step="1000"
                value={automationForm.per_trade_amount}
                onChange={(e) =>
                  setAutomationForm((f) => ({
                    ...f,
                    per_trade_amount: e.target.value,
                  }))
                }
              />
            </div>
            <div className="settings-field">
              <label>{lt("最大持仓数", "Max Positions")}</label>
              <input
                className="figma-input"
                type="number"
                min="1"
                max="50"
                value={automationForm.max_positions}
                onChange={(e) =>
                  setAutomationForm((f) => ({
                    ...f,
                    max_positions: e.target.value,
                  }))
                }
              />
            </div>
            <div className="settings-field">
              <label>{lt("单票上限 %", "Max / Stock %")}</label>
              <input
                className="figma-input"
                type="number"
                min="1"
                max="100"
                value={automationForm.max_position_pct}
                onChange={(e) =>
                  setAutomationForm((f) => ({
                    ...f,
                    max_position_pct: e.target.value,
                  }))
                }
              />
            </div>
            <div className="settings-field">
              <label>{lt("运行间隔（分钟）", "Interval (min)")}</label>
              <input
                className="figma-input"
                type="number"
                min="1"
                max="240"
                value={automationForm.run_interval_minutes}
                onChange={(e) =>
                  setAutomationForm((f) => ({
                    ...f,
                    run_interval_minutes: e.target.value,
                  }))
                }
              />
            </div>

            <div className="trading-automation-actions">
              <button
                className="figma-btn figma-btn-primary"
                onClick={handleSaveAutomation}
                disabled={automationLoading || strategies.length === 0}
              >
                {automationLoading
                  ? lt("保存中...", "Saving...")
                  : automationForm.id
                    ? lt("保存修改", "Save Changes")
                    : lt("创建绑定", "Create Binding")}
              </button>
              <button
                className="figma-btn"
                onClick={() =>
                  setAutomationForm({
                    id: 0,
                    strategy_id: strategies[0]?.id ? String(strategies[0].id) : "",
                    name: "",
                    stock_pool_text: "",
                    per_trade_amount: "100000",
                    max_positions: "5",
                    max_position_pct: "20",
                    run_interval_minutes: "5",
                  })
                }
              >
                {lt("新建配置", "New Config")}
              </button>
            </div>
            {automationMsg && (
              <p
                className={
                  automationMsg.ok
                    ? "trading-automation-message ok"
                    : "trading-automation-message"
                }
              >
                {automationMsg.text}
              </p>
            )}
          </div>

          <div className="trading-automation-list">
            {automations.map((row) => {
              const result = row.last_result || {};
              const isRunning = row.status === "running";
              const latestActions = Array.isArray(result.actions)
                ? result.actions.slice(-3)
                : [];
              return (
                <div className="trading-automation-item" key={row.id}>
                  <div className="trading-automation-item-top">
                    <div>
                      <strong>{row.name}</strong>
                      <span>{row.strategy_name || lt("未知策略", "Unknown strategy")}</span>
                    </div>
                    <span
                      className={`figma-badge ${isRunning ? "figma-badge-up" : ""}`}
                    >
                      {isRunning ? lt("运行中", "RUNNING") : lt("已暂停", "STOPPED")}
                    </span>
                  </div>
                  <div className="trading-automation-metrics">
                    <span>
                      {lt("候选", "Pool")} {result.candidate_count ?? "-"}
                    </span>
                    <span>
                      {lt("买入", "Buy")} {result.buy_count ?? 0}
                    </span>
                    <span>
                      {lt("卖出", "Sell")} {result.sell_count ?? 0}
                    </span>
                    <span>
                      {lt("间隔", "Interval")} {row.run_interval_minutes}m
                    </span>
                  </div>
                  {row.last_error ? (
                    <div className="trading-automation-error">
                      {row.last_error}
                    </div>
                  ) : latestActions.length > 0 ? (
                    <div className="trading-automation-log">
                      {latestActions.map((action, idx) => (
                        <span key={`${row.id}-${idx}`}>
                          {action.code} {action.action}
                          {action.quantity ? ` ${action.quantity}${lt("股", " shares")}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="trading-automation-log">
                      {lt("暂无运行记录", "No run history")}
                    </div>
                  )}
                  <div className="trading-automation-row-actions">
                    <button
                      className="figma-btn figma-btn-sm"
                      onClick={() => loadAutomationIntoForm(row)}
                    >
                      {lt("编辑", "Edit")}
                    </button>
                    <button
                      className="figma-btn figma-btn-sm"
                      disabled={automationLoading}
                      onClick={() =>
                        handleAutomationAction(row, isRunning ? "stop" : "start")
                      }
                    >
                      {isRunning ? lt("暂停", "Stop") : lt("启动", "Start")}
                    </button>
                    <button
                      className="figma-btn figma-btn-sm figma-btn-primary"
                      disabled={automationLoading}
                      onClick={() => handleAutomationAction(row, "run")}
                    >
                      {lt("立即运行", "Run Now")}
                    </button>
                    <button
                      className="figma-btn figma-btn-sm"
                      disabled={automationLoading}
                      onClick={() => handleAutomationAction(row, "delete")}
                    >
                      {lt("删除", "Delete")}
                    </button>
                  </div>
                </div>
              );
            })}
            {automations.length === 0 && (
              <div className="trading-automation-empty">
                {lt(
                  "还没有策略自动化绑定。先选择策略并保存配置，再启动或立即运行。",
                  "No automation bindings yet. Select a strategy, save it, then start or run once.",
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* ─── Split View: Order Entry + Positions ─── */}
      <div className="trading-split">
        {/* ─── Order Entry Panel (Left) ─── */}
        <div className="trading-order-panel">
          <h2
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
              marginBottom: 20,
            }}
          >
            {lt("模拟下单", "PAPER ORDER")}
          </h2>

          {/* BUY / SELL Toggle */}
          <div className="trading-buy-sell">
            <button
              className={`trading-bs-btn${form.trade_type === "buy" ? " active" : ""}`}
              onClick={() => setForm((f) => ({ ...f, trade_type: "buy" }))}
            >
              {lt("买入", "BUY")}
            </button>
            <button
              className={`trading-bs-btn${form.trade_type === "sell" ? " active" : ""}`}
              onClick={() => setForm((f) => ({ ...f, trade_type: "sell" }))}
            >
              {lt("卖出", "SELL")}
            </button>
          </div>

          {/* Form Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="settings-field">
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                {lt("股票代码", "Ticker")}
              </label>
              <input
                className="figma-input"
                value={form.stock_code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, stock_code: e.target.value }))
                }
                placeholder={lt(
                  market === "CN"
                    ? "如：600519 或 贵州茅台"
                    : market === "HK"
                      ? "如：00700 或 腾讯控股"
                      : "如：AAPL 或 Apple",
                  market === "CN"
                    ? "e.g. 600519 or stock name"
                    : market === "HK"
                      ? "e.g. 00700 or Tencent"
                      : "e.g. AAPL or Apple",
                )}
                style={{ width: "100%", fontSize: 13 }}
              />
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                {quoteLoading
                  ? lt("正在获取最新价...", "Fetching latest price...")
                  : quoteName
                    ? `${lt("已匹配", "Matched")}: ${quoteName}`
                    : lt(
                        "输入代码或名称后自动回填最新价",
                        "Enter code/name to auto-fill latest price",
                      )}
              </div>
            </div>

            <div className="settings-field">
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                {lt("委托类型", "Order Type")}
              </label>
              <select
                className="figma-input"
                style={{ width: "100%", fontSize: 13 }}
              >
                <option>{lt("市价", "Market")}</option>
                <option>{lt("限价", "Limit")}</option>
                <option>{lt("止损", "Stop")}</option>
              </select>
            </div>

            <div className="settings-field">
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                {lt("价格", "Price")}
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="figma-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                  placeholder="12.34"
                  style={{ flex: 1, fontSize: 13 }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-muted)",
                  }}
                >
                  {definition.currencySymbol}
                </span>
              </div>
            </div>

            <div className="settings-field">
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                {lt("数量", "Quantity")}
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="figma-input"
                  type="number"
                  min={minimumOrderQuantity}
                  step={minimumOrderQuantity}
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                  placeholder={String(minimumOrderQuantity)}
                  style={{ flex: 1, fontSize: 13 }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-muted)",
                  }}
                >
                  {lt("股", "shares")}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                {market === "CN"
                  ? lt(
                      "A股规则：1手 = 100股，买卖均按100股整数倍",
                      "A-share rule: 1 lot = 100 shares; buy/sell in multiples of 100",
                    )
                  : market === "HK"
                    ? lt(
                        "港股模拟盘按整股下单；实际每手股数因证券而异",
                        "Hong Kong paper orders use whole shares; real board lots vary by security",
                      )
                    : lt(
                        "美股模拟盘按整股下单",
                        "US paper orders use whole shares",
                      )}
              </div>
            </div>
          </div>

          {/* Estimate */}
          <div
            style={{
              marginTop: 20,
              padding: 16,
              background: "var(--bg-gray)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {lt("预估价格", "Est. Price")}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                }}
              >
                {form.price ? orderMoney(Number(form.price)) : "-"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {lt("预估金额", "Est. Value")}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                }}
              >
                {form.quantity && form.price
                  ? orderMoney(Number(form.quantity) * Number(form.price))
                  : "-"}
              </span>
            </div>
          </div>

          {/* Status message */}
          {msg && (
            <p
              style={{
                marginTop: 12,
                fontSize: 12,
                color: msg.ok ? "var(--success)" : "#EF4444",
              }}
            >
              {msg.text}
            </p>
          )}

          {/* Confirm Button */}
          <button
            className="figma-btn figma-btn-primary"
            onClick={handleTrade}
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 20,
              padding: "14px 0",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.1em",
            }}
          >
            {loading
              ? lt("处理中...", "PROCESSING...")
              : form.trade_type === "buy"
                ? lt("模拟买入", "PAPER BUY")
                : lt("模拟卖出", "PAPER SELL")}
          </button>
        </div>

        {/* ─── Positions Panel (Right) ─── */}
        <div className="trading-positions-panel">
          {/* Tabs */}
          <div
            className="figma-tabs"
            style={{
              padding: "0 24px",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            <button
              className={`figma-tab${tab === "records" ? " active" : ""}`}
              onClick={() => setTab("records")}
            >
              {lt("成交记录", "TRADE HISTORY")}
            </button>
            <button
              className={`figma-tab${tab === "positions" ? " active" : ""}`}
              onClick={() => setTab("positions")}
            >
              {lt("当前持仓", "CURRENT POSITIONS")}
            </button>
          </div>

          {/* Positions Table */}
          {tab === "positions" ? (
            <div style={{ padding: 0 }}>
              <table className="figma-table">
                <thead>
                  <tr>
                    <th>{lt("标的", "ASSET")}</th>
                    <th>{lt("数量", "SIZE")}</th>
                    <th>{lt("成本价", "ENTRY PRICE")}</th>
                    <th>{lt("现价", "MARK PRICE")}</th>
                    <th>{lt("当日涨跌", "DAILY CHANGE")}</th>
                    <th>{lt("操作", "ACTION")}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* API positions */}
                  {marketPositions.map((p) => {
                    const dailyPct = Number(p.daily_change_pct ?? 0);
                    const dailyAmount =
                      Number(p.daily_change_amount ?? 0) * Number(p.quantity || 0);
                    return (
                      <tr key={p.stock_code}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.stock_code}</div>
                          <div
                            style={{ fontSize: 11, color: "var(--text-muted)" }}
                          >
                            {p.stock_name}
                          </div>
                        </td>
                        <td className="mono">{p.quantity.toLocaleString()}</td>
                        <td className="mono">{fmt(p.avg_price)}</td>
                        <td className="mono">{fmt(p.current_price)}</td>
                        <td className={`mono ${dailyPct > 0 ? "up" : dailyPct < 0 ? "down" : ""}`}>
                          <div>
                            {dailyPct > 0 ? "+" : ""}
                            {dailyPct.toFixed(2)}%
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {dailyAmount > 0 ? "+" : ""}
                            {money(dailyAmount)}
                          </div>
                        </td>
                        <td>
                          <button
                            className="figma-btn figma-btn-sm"
                            style={{ fontSize: 11 }}
                          >
                            {lt("平仓", "Close")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {marketPositions.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          textAlign: "center",
                          padding: 32,
                          color: "var(--text-muted)",
                        }}
                      >
                        {lt("暂无持仓", "No positions")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* Trade History Table */
            <div style={{ padding: 0 }}>
              <table className="figma-table">
                <thead>
                  <tr>
                    <th>{lt("时间", "TIME")}</th>
                    <th>{lt("代码", "CODE")}</th>
                    <th>{lt("名称", "NAME")}</th>
                    <th>{lt("方向", "SIDE")}</th>
                    <th>{lt("价格", "PRICE")}</th>
                    <th>{lt("数量", "QTY")}</th>
                    <th>{lt("金额", "AMOUNT")}</th>
                  </tr>
                </thead>
                <tbody>
                  {marketRecords.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.trade_time?.slice(0, 16)}</td>
                      <td className="mono">{r.stock_code}</td>
                      <td>{r.stock_name}</td>
                      <td
                        className={r.trade_type === "buy" ? "up" : "down"}
                        style={{ fontWeight: 600 }}
                      >
                        {r.trade_type === "buy"
                          ? lt("买入", "BUY")
                          : lt("卖出", "SELL")}
                      </td>
                      <td className="mono">{fmt(r.price)}</td>
                      <td className="mono">{r.quantity}</td>
                      <td className="mono">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  {marketRecords.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          textAlign: "center",
                          padding: 32,
                          color: "var(--text-muted)",
                        }}
                      >
                        {lt("暂无成交记录", "No trade history")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
