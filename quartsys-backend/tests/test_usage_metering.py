import unittest

import usage_metering


class UsageMeteringTests(unittest.TestCase):
    def test_openai_cached_prompt_tokens_are_split_from_uncached_input(self):
        usage = usage_metering.normalize_token_usage(
            {
                "prompt_tokens": 1_000,
                "completion_tokens": 200,
                "prompt_tokens_details": {"cached_tokens": 300},
            },
            provider="openai",
        )

        self.assertEqual(usage["input_tokens"], 700)
        self.assertEqual(usage["output_tokens"], 200)
        self.assertEqual(usage["cache_read_tokens"], 300)
        self.assertEqual(usage["cache_write_tokens"], 0)
        self.assertEqual(usage["total_tokens"], 1_200)
        self.assertEqual(usage["source"], "upstream")

    def test_anthropic_usage_preserves_uncached_input_and_cache_components(self):
        usage = usage_metering.normalize_token_usage(
            {
                "input_tokens": 500,
                "output_tokens": 100,
                "cache_read_input_tokens": 300,
                "cache_creation_input_tokens": 200,
            },
            provider="anthropic",
        )

        self.assertEqual(usage["input_tokens"], 500)
        self.assertEqual(usage["output_tokens"], 100)
        self.assertEqual(usage["cache_read_tokens"], 300)
        self.assertEqual(usage["cache_write_tokens"], 200)
        self.assertEqual(usage["total_tokens"], 1_100)

    def test_cost_calculation_uses_usd_per_million_token_rates(self):
        costs = usage_metering.calculate_cost_micros(
            {
                "input_tokens": 1_000,
                "output_tokens": 500,
                "cache_read_tokens": 200,
                "cache_write_tokens": 100,
            },
            {
                "input_per_million": 2,
                "output_per_million": 10,
                "cache_read_per_million": 0.5,
                "cache_write_per_million": 3,
            },
        )

        self.assertEqual(costs["input_cost_micros"], 2_000)
        self.assertEqual(costs["output_cost_micros"], 5_000)
        self.assertEqual(costs["cache_read_cost_micros"], 100)
        self.assertEqual(costs["cache_write_cost_micros"], 300)
        self.assertEqual(costs["total_cost_micros"], 7_400)

    def test_missing_usage_falls_back_to_text_estimation(self):
        usage = usage_metering.normalize_token_usage(
            provider="openai",
            input_text="分析贵州茅台的基本面",
            output_text="结论：保持关注。",
        )

        self.assertGreater(usage["input_tokens"], 0)
        self.assertGreater(usage["output_tokens"], 0)
        self.assertEqual(usage["source"], "estimated")

    def test_missing_usage_can_be_recorded_as_unreported_without_estimation(self):
        usage = usage_metering.normalize_token_usage(
            provider="openai",
            input_text="should not be estimated",
            output_text="should not be estimated",
            allow_estimate=False,
        )

        self.assertEqual(usage["total_tokens"], 0)
        self.assertEqual(usage["source"], "unreported")


if __name__ == "__main__":
    unittest.main()
