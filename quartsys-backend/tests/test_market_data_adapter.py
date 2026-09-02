import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import market_data_adapter


class MarketDataAdapterTests(unittest.TestCase):
    def setUp(self):
        market_data_adapter._provider = None
        market_data_adapter._provider_name = ""

    def tearDown(self):
        market_data_adapter._provider = None
        market_data_adapter._provider_name = ""

    def test_default_adapter_does_not_fetch(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(market_data_adapter.update_single_stock("600000", "示例"), 0)
            result = market_data_adapter.handle_worker_update_request({"code": "600000"})
            self.assertFalse(result["success"])
            with self.assertRaises(market_data_adapter.DataAdapterNotConfigured):
                market_data_adapter.run_update()

    def test_status_helpers_have_safe_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            stock = SimpleNamespace(data_status="error", data_status_reason="provider unavailable")
            self.assertTrue(market_data_adapter.is_stock_marked_unavailable(stock))
            self.assertEqual(market_data_adapter.stock_unavailable_message(stock), "provider unavailable")
            self.assertTrue(market_data_adapter.is_st_or_delisted("*ST 示例"))
            self.assertTrue(market_data_adapter.is_st_or_delisted("示例退"))
            self.assertFalse(market_data_adapter.is_st_or_delisted("示例证券"))

    def test_configured_provider_is_delegated(self):
        provider = SimpleNamespace(update_single_stock=lambda code, name: f"{code}:{name}")
        with patch.dict(os.environ, {"QUARTSYS_DATA_ADAPTER_MODULE": "custom_provider"}, clear=True):
            with patch("market_data_adapter.importlib.import_module", return_value=provider):
                self.assertEqual(
                    market_data_adapter.update_single_stock("600000", "示例"),
                    "600000:示例",
                )


if __name__ == "__main__":
    unittest.main()
