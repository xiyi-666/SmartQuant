import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MAIN_PY = ROOT / "quartsys-backend" / "main.py"
MODELS_PY = ROOT / "quartsys-backend" / "models.py"
DATA_SOURCES_PY = ROOT / "quartsys-backend" / "data_sources.py"
RISK_PAGE_TSX = ROOT / "quartsys-fronted" / "src" / "pages" / "RiskPage.tsx"


class ContractCoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main_text = MAIN_PY.read_text(encoding="utf-8")
        cls.models_text = MODELS_PY.read_text(encoding="utf-8")
        cls.data_sources_text = DATA_SOURCES_PY.read_text(encoding="utf-8")
        cls.screener_text = (ROOT / "quartsys-backend" / "screener.py").read_text(
            encoding="utf-8"
        )
        cls.risk_page_text = RISK_PAGE_TSX.read_text(encoding="utf-8")

    def test_simulation_account_contract_fields(self):
        for token in [
            '"frozen_balance"',
            '"status"',
            '"current_price"',
            '"market_value"',
            '"profit"',
        ]:
            self.assertIn(token, self.main_text)

    def test_agents_user_scoped(self):
        self.assertIn("Agent.user_id == current_user.id", self.main_text)
        self.assertIn("status_reason = Column(String", self.models_text)
        self.assertIn("last_run_at = Column(DateTime", self.models_text)
        self.assertIn("last_error = Column(Text", self.models_text)
        self.assertIn("updated_at = Column(DateTime", self.models_text)
        self.assertIn('"status_reason"', self.main_text)
        self.assertIn('"last_run_at"', self.main_text)
        self.assertIn('"last_error"', self.main_text)
        self.assertIn('"updated_at"', self.main_text)
        self.assertIn("serialize_agent_runtime(agent)", self.main_text)
        self.assertIn("SIMULATED_BACKTEST_DAYS = 90", self.main_text)
        self.assertIn("def ensure_agent_simulated_performance(", self.main_text)
        self.assertIn("ensure_agent_simulated_performance(db, agent)", self.main_text)
        self.assertIn('"return_pct"', self.main_text)
        self.assertIn('"source": "simulated_benchmark"', self.main_text)

    def test_notifications_persisted(self):
        self.assertIn("class Notification(Base):", self.models_text)
        self.assertIn("db.query(Notification)", self.main_text)
        self.assertNotIn("_notifications: list", self.main_text)

    def test_risk_endpoints_no_static_fallback(self):
        self.assertNotIn("figma/demo", self.main_text.lower())
        self.assertIn("RiskTrendSnapshot", self.main_text)
        self.assertIn("def _build_local_fund_flow(", self.main_text)
        self.assertIn("def _build_risk_assessment(", self.main_text)
        self.assertIn('"/api/risk/systemic"', self.main_text)
        self.assertIn("def _build_systemic_risk_context(", self.main_text)
        self.assertIn("ak.stock_hsgt_fund_flow_summary_em", self.main_text)
        self.assertIn("ak.stock_sector_fund_flow_rank", self.main_text)
        self.assertIn("eastmoney.kamt", self.main_text)
        self.assertIn("eastmoney.sector_fund_flow", self.main_text)
        self.assertIn("tencent.quote", self.main_text)
        self.assertIn("tencent.index_kline", self.main_text)
        self.assertIn("eastmoney.datacenter", self.main_text)
        self.assertIn("eastmoney.web_news_col", self.main_text)
        self.assertIn("fetch_mootdx_daily_df", self.data_sources_text)
        self.assertIn('"unavailable": "数据待同步"', self.main_text)
        self.assertIn("def _fetch_eastmoney_hsgt_turnover_history(", self.main_text)
        self.assertIn("成交额较上一交易日", self.main_text)
        self.assertNotIn("实时净额暂停披露", self.main_text)
        self.assertIn('def _with_flow_total_channel(', self.main_text)
        self.assertIn('_with_flow_total_channel(payload_southbound, "南向资金")', self.main_text)
        self.assertIn("def _fund_flow_needs_refresh(", self.main_text)
        self.assertIn('f"risk:fund-flow:v14:{market_code}:full-market"', self.main_text)
        self.assertIn("allow_slow_fallback=True", self.main_text)
        self.assertIn('"southbound": payload_southbound', self.main_text)
        self.assertIn('"source_label": _risk_source_label', self.main_text)
        self.assertIn("SYSTEMIC_RISK_WEIGHTS", self.main_text)
        self.assertIn(
            "系统性风险 = 市场宽度 + 市场适用的跨境资金 + 全市场板块资金流 + 指数波动率 + 市场宏观金融数据 + 地缘政治事件 + 政策事件",
            self.main_text,
        )
        self.assertIn('"source": "local_market"', self.main_text)
        self.assertIn('"status": "partial"', self.main_text)
        self.assertIn('"analysis_source": "structured_market_context_fallback"', self.main_text)
        self.assertIn('"RISK_AI_ASSESSMENT_FAILED"', self.main_text)
        self.assertIn('"nodes": nodes', self.main_text)
        self.assertIn('"links": links', self.main_text)
        self.assertIn('"channels": safe_channels[:8]', self.main_text)
        self.assertNotIn('"source": "none"', self.main_text)
        self.assertNotIn('"source": "static"', self.main_text)
        self.assertNotIn('"沪股通":', self.main_text)
        self.assertNotIn('"深股通":', self.main_text)
        self.assertNotIn("模拟账户暂无持仓", self.main_text)
        self.assertNotIn("本地行情样本不足", self.main_text)
        self.assertNotIn("本地资金流净额", self.main_text)
        self.assertNotIn("本地市场净流入估算", self.main_text)
        self.assertIn("当前没有可计算的板块资金流数据。", self.main_text)
        self.assertNotIn("84.5%", self.risk_page_text)
        self.assertNotIn("GLOBAL VAR", self.risk_page_text)
        self.assertIn("系统性风险因子拆解", self.risk_page_text)
        self.assertIn("source_label", self.risk_page_text)
        self.assertIn("southbound", self.risk_page_text)
        self.assertIn("loadRiskData", self.risk_page_text)
        self.assertIn("fundFlowSourceText", self.risk_page_text)
        self.assertIn("formatFlowYi", self.risk_page_text)
        self.assertIn("Math.abs(b[1]) - Math.abs(a[1])", self.risk_page_text)

    def test_strategy_alpha_structured_status(self):
        self.assertIn('"status": "empty"', self.main_text)
        self.assertIn('"status": "failed"', self.main_text)
        self.assertIn("error_payload(", self.main_text)

    def test_ma60_gap_decimal_threshold_is_percent_ratio(self):
        self.assertIn("def normalize_percent_threshold(", self.main_text)
        self.assertIn("return value * 100.0 if 0 < value <= 1 else value", self.main_text)
        self.assertIn("gap_max = normalize_percent_threshold(gap_max)", self.main_text)

    def test_volume_spike_observe_days_is_bounded(self):
        self.assertIn("def cap_post_spike_days(", self.main_text)
        self.assertIn("default=5", self.main_text)
        self.assertIn("cap_post_spike_days(", self.main_text)

    def test_financial_filters_require_real_fields(self):
        self.assertIn("if pe_ratio is None:", self.main_text)
        self.assertIn("if pb_ratio is None:", self.main_text)
        self.assertNotIn("pe_base =", self.main_text)
        self.assertNotIn("else close_price * volume", self.main_text)
        self.assertIn("normalize_market_cap_yi(", self.main_text)
        self.assertNotIn("当前页基础指标补齐", self.main_text)
        self.assertNotIn("腾讯基础指标补齐失败", self.main_text)
        self.assertIn("backfill_stock_board_cache()", self.main_text)

    def test_data_sources_expose_provider_chain(self):
        self.assertIn("board = Column(String", self.models_text)
        self.assertIn('("board", "VARCHAR")', self.main_text)
        self.assertIn("data_sources.fetch_tencent_fundamentals", self.main_text)
        self.assertIn("fetch_mootdx_daily_df", self.data_sources_text)
        self.assertIn("fetch_tencent_daily_df", self.data_sources_text)

    def test_kline_history_uses_all_stored_database_rows(self):
        self.assertIn(
            "screener.get_stock_data_from_db(normalized_code, db, days=None)",
            self.main_text,
        )
        self.assertIn("if days is not None and days > 0:", self.screener_text)
        self.assertIn("stock.asset_type = inferred_asset_type", self.main_text)

    def test_stock_dtos_include_board_and_fundamentals(self):
        for token in [
            '"board"',
            '"industry"',
            '"pe_ratio"',
            '"market_cap"',
            '"circulating_market_cap"',
        ]:
            self.assertIn(token, self.main_text)

    def test_public_site_contact_channels(self):
        self.assertIn('"contact": {"qq": "1049674092", "wechat": "W1049674092", "telegram": "", "whatsapp": ""}', self.main_text)
        self.assertIn('"telegram": str(contact.get("telegram") or "").strip()[:160]', self.main_text)
        self.assertIn('"whatsapp": str(contact.get("whatsapp") or "").strip()[:160]', self.main_text)

    def test_screener_runs_inline_and_custom_factors(self):
        self.assertIn("class InlineFactorConfigItem", self.main_text)
        self.assertIn("inline_factors: List[InlineFactorConfigItem]", self.main_text)
        self.assertIn("custom_factor_specs", self.main_text)
        self.assertIn("factor_spec_passes(", self.main_text)
        self.assertIn("query.limit(max(10000, payload.offset + payload.limit))", self.main_text)
        self.assertIn("def load_screening_histories(", self.main_text)


if __name__ == "__main__":
    unittest.main()
