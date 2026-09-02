import sys
import types
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class _DummyQuery:
    def __init__(self, cfg):
        self.cfg = cfg

    def first(self):
        return self.cfg


class _DummyDb:
    def __init__(self, cfg):
        self.cfg = cfg

    def query(self, _model):
        return _DummyQuery(self.cfg)


class AiInsightsLlmTests(unittest.TestCase):
    def test_openai_provider_passes_base_url_to_crewai_llm(self):
        calls = []
        fake_crewai = types.SimpleNamespace(
            LLM=lambda **kwargs: calls.append(kwargs) or kwargs
        )
        old_crewai = sys.modules.get("crewai")
        sys.modules["crewai"] = fake_crewai
        try:
            from llm_factory import build_crewai_llm

            cfg = types.SimpleNamespace(
                provider="openai",
                model="gpt-5.5",
                api_key="sk-test",
                base_url="https://example.test/v1/",
            )
            llm = build_crewai_llm(_DummyDb(cfg))
        finally:
            if old_crewai is None:
                sys.modules.pop("crewai", None)
            else:
                sys.modules["crewai"] = old_crewai

        self.assertEqual(llm["model"], "openai/gpt-5.5")
        self.assertEqual(llm["api_key"], "sk-test")
        self.assertEqual(llm["base_url"], "https://example.test/v1")
        self.assertEqual(calls[0], llm)

    def test_ai_insights_error_result_has_all_dimensions_and_masks_key(self):
        from crews.ai_insights_crew import (
            AI_INSIGHT_DIMENSIONS,
            build_ai_insights_error_result,
        )

        result = build_ai_insights_error_result(
            RuntimeError("Incorrect API key provided: sk-abc123********xyz")
        )

        self.assertEqual(result["status"], "failed")
        self.assertEqual(set(result["dimensions"].keys()), set(AI_INSIGHT_DIMENSIONS))
        self.assertEqual(len(result["analysis_list"]), len(AI_INSIGHT_DIMENSIONS))
        self.assertNotIn("abc123", result["summary"])
        self.assertIn("sk-****", result["summary"])


if __name__ == "__main__":
    unittest.main()
