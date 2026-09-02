import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MAIN_PY = ROOT / "quartsys-backend" / "main.py"


class CacheContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main_text = MAIN_PY.read_text(encoding="utf-8")

    def test_risk_trend_cache_is_user_market_and_range_scoped(self):
        self.assertIn('f"risk:trend:v1:{current_user.id}:{market_code}:{normalized_days}"', self.main_text)
        self.assertIn("RISK_TREND_CACHE_TTL_SECONDS = 300", self.main_text)
        self.assertIn("RISK_TREND_STALE_TTL_SECONDS = 3600", self.main_text)
        self.assertIn("ttl=RISK_TREND_CACHE_TTL_SECONDS", self.main_text)
        self.assertIn("stale_ttl=RISK_TREND_STALE_TTL_SECONDS", self.main_text)

    def test_alpha_recommend_cache_is_role_strategy_and_config_scoped(self):
        self.assertIn("def _alpha_recommend_cache_key(", self.main_text)
        self.assertIn('"alpha:recommend:v1:"', self.main_text)
        self.assertIn('f"{market_code}:{role}:{strategy_key}:{effective_limit}:{settings_fingerprint}"', self.main_text)
        self.assertIn("ALPHA_RECOMMEND_CACHE_TTL_SECONDS = 300", self.main_text)
        self.assertIn("ALPHA_RECOMMEND_STALE_TTL_SECONDS = 3600", self.main_text)
        self.assertIn("ttl=ALPHA_RECOMMEND_CACHE_TTL_SECONDS", self.main_text)
        self.assertIn("stale_ttl=ALPHA_RECOMMEND_STALE_TTL_SECONDS", self.main_text)

    def test_hot_market_endpoints_use_request_coalescing(self):
        self.assertIn("def _coalesced_cached_json(", self.main_text)
        self.assertIn('f"market:group-constituents:v1:{cache_hash}"', self.main_text)
        self.assertIn('f"market:top-gainers:v3:{market_code}:{group_key}:"', self.main_text)
        self.assertIn('f"{cache_key}:stale"', self.main_text)


if __name__ == "__main__":
    unittest.main()
