import os
import shutil
import sys
import tempfile
import types
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
os.environ["DATABASE_URL"] = (
    f"sqlite:///{Path(tempfile.gettempdir()) / 'quartsys-smart-research-depth-test.db'}"
)
sys.path.insert(0, str(BACKEND_DIR))

import main


class SmartResearchDepthTests(unittest.TestCase):
    @staticmethod
    def estimate(debate_rounds: int, risk_rounds: int) -> dict:
        payload = main.SmartResearchRunRequest(
            symbols=["600519"],
            use_trading_agents=True,
            max_debate_rounds=debate_rounds,
            max_risk_rounds=risk_rounds,
            model="smart",
        )
        billing = {
            "module_key": "smart_research",
            "base_unit_credits": 100,
            "unit_credits": 100,
            "model_tier": "smart",
            "model_multiplier": 1.0,
        }
        with patch.object(main, "_llm_tier_billing_details", return_value=billing):
            return main._smart_research_credit_estimate(
                None,
                payload,
                SimpleNamespace(role="normal"),
                symbol_count=1,
                analyst_count=4,
            )

    def test_depth_options_change_rounds_duration_and_credit_estimate(self):
        standard = self.estimate(1, 1)
        deep = self.estimate(2, 1)
        intensive = self.estimate(2, 2)

        self.assertEqual(standard["research_depth"], "standard")
        self.assertEqual(deep["research_depth"], "deep")
        self.assertEqual(intensive["research_depth"], "intensive")
        self.assertEqual(
            [standard["estimated_seconds_per_symbol"], deep["estimated_seconds_per_symbol"], intensive["estimated_seconds_per_symbol"]],
            [600, 708, 816],
        )
        self.assertEqual(
            [standard["multipliers"]["deep_research"], deep["multipliers"]["deep_research"], intensive["multipliers"]["deep_research"]],
            [1.0, 1.18, 1.36],
        )
        self.assertLess(standard["estimated_credits"], deep["estimated_credits"])
        self.assertLess(deep["estimated_credits"], intensive["estimated_credits"])

    def test_quote_round_cap_matches_tradingagents_execution_cap(self):
        estimate = self.estimate(99, 99)

        self.assertEqual(estimate["max_debate_rounds"], 3)
        self.assertEqual(estimate["max_risk_rounds"], 3)
        self.assertEqual(estimate["estimated_seconds_per_symbol"], 1032)

    def test_public_model_options_expose_tiers_not_provider_model_names(self):
        public = main._public_llm_model_options(
            main._default_llm_model_options(),
            SimpleNamespace(role="vip"),
        )

        self.assertEqual(public["scope"], "tier_selection")
        self.assertEqual(public["models"], ["smart", "advanced", "ultra"])
        self.assertEqual(public["module_models"]["smart_research"], "smart")
        self.assertTrue(all("model" not in item for item in public["tier_options"]))
        self.assertTrue(all("provider" not in item for item in public["tier_options"]))

    def test_tradingagents_receives_selected_debate_and_risk_rounds(self):
        captured: dict = {}
        task_id = int(uuid.uuid4().int % 1_000_000_000)
        task_dir = BACKEND_DIR / "generated" / "smart_research" / f"task_{task_id}"

        class FakeUsageCallback:
            def usage(self):
                return {"source": "test", "input_tokens": 0, "output_tokens": 0}

        class FakeGraph:
            def __init__(self, *, selected_analysts, debug, config, callbacks):
                captured["selected_analysts"] = selected_analysts
                captured["config"] = config

            def propagate(self, symbol, analysis_date, asset_type):
                return {"symbol": symbol}, {"action": "hold"}

            def save_reports(self, final_state, trading_symbol, save_path):
                save_path.mkdir(parents=True, exist_ok=True)
                report_path = save_path / "report.md"
                report_path.write_text("# Test report", encoding="utf-8")
                return report_path

        default_config_module = types.ModuleType("tradingagents.default_config")
        default_config_module.DEFAULT_CONFIG = {
            "data_vendors": {},
            "global_news_queries": [],
        }
        graph_module = types.ModuleType("tradingagents.graph.trading_graph")
        graph_module.TradingAgentsGraph = FakeGraph
        fake_modules = {
            "tradingagents.default_config": default_config_module,
            "tradingagents.graph.trading_graph": graph_module,
        }

        try:
            with patch.dict(sys.modules, fake_modules), patch.object(
                main,
                "_tradingagents_usage_callback",
                return_value=FakeUsageCallback(),
            ):
                main._run_tradingagents_research(
                    {"code": "600519", "name": "贵州茅台", "market": "CN"},
                    "2026-07-30",
                    ["fundamental", "technical"],
                    {
                        "provider": "custom",
                        "model": "test-model",
                        "api_key": "test-key",
                        "base_url": "https://llm.example.test/v1",
                    },
                    task_id,
                    2,
                    2,
                    {},
                    {},
                    {},
                    {"action": "hold"},
                    "en",
                )
        finally:
            shutil.rmtree(task_dir, ignore_errors=True)

        self.assertEqual(captured["selected_analysts"], ("fundamentals", "market"))
        self.assertEqual(captured["config"]["max_debate_rounds"], 2)
        self.assertEqual(captured["config"]["max_risk_discuss_rounds"], 2)
        self.assertEqual(captured["config"]["output_language"], "English")


if __name__ == "__main__":
    unittest.main()
