import sys
import types
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import data_sources


class DataSourcesTests(unittest.TestCase):
    def test_normalize_stock_code(self):
        self.assertEqual(data_sources.normalize_stock_code("1"), "000001")
        self.assertEqual(data_sources.normalize_stock_code("000001"), "000001")
        self.assertEqual(data_sources.normalize_stock_code("SH600000"), "600000")
        self.assertEqual(data_sources.normalize_stock_code("700.HK"), "hk00700")
        self.assertEqual(data_sources.normalize_stock_code("AAPL"), "usAAPL")

    def test_infer_listing_board(self):
        cases = {
            "688001": "科创板",
            "300001": "创业板",
            "830799": "北交所",
            "600000": "沪市主板",
            "000001": "深市主板",
            "hk00700": "港股",
            "usAAPL": "美股",
        }
        for code, board in cases.items():
            self.assertEqual(data_sources.infer_listing_board(code), board)

    def test_tencent_symbol(self):
        self.assertEqual(data_sources.tencent_symbol("600000"), "sh600000")
        self.assertEqual(data_sources.tencent_symbol("000001"), "sz000001")
        self.assertEqual(data_sources.tencent_symbol("300001"), "sz300001")
        self.assertEqual(data_sources.tencent_symbol("830799"), "bj830799")
        self.assertEqual(data_sources.tencent_symbol("hk00700"), "hk00700")
        self.assertEqual(data_sources.tencent_symbol("usAAPL"), "usAAPL")
        self.assertEqual(data_sources.tencent_symbol("510300"), "sh510300")
        self.assertEqual(data_sources.tencent_symbol("159915"), "sz159915")

    def test_yfinance_symbol(self):
        self.assertEqual(data_sources.yfinance_symbol("hk00700"), "0700.HK")
        self.assertEqual(data_sources.yfinance_symbol("usBRK.B"), "BRK-B")
        self.assertEqual(data_sources.yfinance_symbol("600000"), "600000.SS")

    @patch.object(data_sources.requests, "get")
    def test_eastmoney_equity_profile_parses_market_currency_and_fundamentals(self, mock_get):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "data": {
                "f43": 461600,
                "f57": "00700",
                "f58": "腾讯控股",
                "f59": 3,
                "f60": 484000,
                "f116": 4197105519002.4,
                "f117": 4197105519002.4,
                "f127": "软件服务",
                "f128": "",
                "f162": 1686,
                "f167": 330,
                "f173": 5.09,
            }
        }
        mock_get.return_value = response

        result = data_sources.fetch_eastmoney_equity_profile("hk00700")

        self.assertEqual(result["exchange"], "HKEX")
        self.assertEqual(result["currency"], "HKD")
        self.assertEqual(result["industry"], "软件服务")
        self.assertEqual(result["sector"], "软件服务")
        self.assertEqual(result["price"], 461.6)
        self.assertEqual(result["pe_ratio"], 16.86)
        self.assertEqual(result["pb_ratio"], 3.3)
        self.assertEqual(result["roe"], 5.09)
        self.assertAlmostEqual(result["market_cap"], 41971.05519, places=5)

    def test_equity_profile_prefers_fast_public_source(self):
        expected = {"source": "eastmoney.stock_profile", "industry": "信息技术"}
        with patch.object(
            data_sources,
            "fetch_eastmoney_equity_profile",
            return_value=expected,
        ), patch.object(data_sources, "fetch_yfinance_equity_profile") as yahoo:
            result = data_sources.fetch_equity_profile("usAAPL")

        self.assertEqual(result, expected)
        yahoo.assert_not_called()

    def test_akshare_adjusted_daily_normalizes_columns(self):
        calls = {}

        def fake_stock_zh_a_hist(**kwargs):
            calls.update(kwargs)
            return pd.DataFrame(
                [
                    {
                        "日期": "2026-07-20",
                        "开盘": 10.0,
                        "收盘": 10.5,
                        "最高": 10.8,
                        "最低": 9.9,
                        "成交量": 120000,
                        "成交额": 126000000,
                    }
                ]
            )

        fake_akshare = types.SimpleNamespace(stock_zh_a_hist=fake_stock_zh_a_hist)
        with patch.dict(sys.modules, {"akshare": fake_akshare}):
            frame = data_sources.fetch_akshare_a_daily_df(
                "000001",
                date(2026, 7, 1),
                date(2026, 7, 21),
                adjust="qfq",
            )

        self.assertEqual(calls["symbol"], "000001")
        self.assertEqual(calls["adjust"], "qfq")
        self.assertEqual(list(frame.columns), ["日期", "开盘", "收盘", "最高", "最低", "成交量", "成交额"])
        self.assertEqual(len(frame), 1)

    def test_local_adjusted_daily_fills_ex_right_gap(self):
        raw = pd.DataFrame(
            [
                {
                    "日期": date(2026, 7, 17),
                    "开盘": 10.0,
                    "收盘": 10.0,
                    "最高": 10.2,
                    "最低": 9.8,
                    "成交量": 1000.0,
                    "成交额": 1000000.0,
                    "涨跌幅": 0.0,
                },
                {
                    "日期": date(2026, 7, 20),
                    "开盘": 5.0,
                    "收盘": 5.1,
                    "最高": 5.2,
                    "最低": 4.9,
                    "成交量": 1200.0,
                    "成交额": 612000.0,
                    "涨跌幅": 2.0,
                },
                {
                    "日期": date(2026, 7, 21),
                    "开盘": 5.1,
                    "收盘": 5.2,
                    "最高": 5.3,
                    "最低": 5.0,
                    "成交量": 1300.0,
                    "成交额": 676000.0,
                    "涨跌幅": 1.96,
                },
            ]
        )

        qfq = data_sources.build_adjusted_daily_df_from_change_pct(raw, adjust="qfq")
        hfq = data_sources.build_adjusted_daily_df_from_change_pct(raw, adjust="hfq")

        self.assertAlmostEqual(float(qfq.iloc[0]["收盘"]), 5.0, places=4)
        self.assertAlmostEqual(float(qfq.iloc[1]["收盘"]), 5.1, places=4)
        self.assertAlmostEqual(float(hfq.iloc[0]["收盘"]), 10.0, places=4)
        self.assertAlmostEqual(float(hfq.iloc[1]["收盘"]), 10.2, places=4)
        self.assertEqual(float(qfq.iloc[1]["成交量"]), 1200.0)

    def test_tencent_adjusted_rows_are_strict(self):
        payload = {
            "data": {
                "sh600000": {
                    "day": [["2026-07-20", "10", "10.5", "10.8", "9.9", "100"]]
                }
            }
        }
        self.assertEqual(
            data_sources.extract_tencent_kline_rows(
                payload, "sh600000", "qfqday", strict=True
            ),
            [],
        )

        payload["data"]["sh600000"]["qfqday"] = [
            ["2026-07-20", "5", "5.25", "5.4", "4.9", "100"]
        ]
        rows = data_sources.extract_tencent_kline_rows(
            payload, "sh600000", "qfqday", strict=True
        )
        self.assertEqual(rows[0][2], "5.25")

    @patch.object(data_sources.requests, "get")
    def test_tencent_daily_adjustment_does_not_fallback_to_raw_day(self, mock_get):
        response = Mock()
        response.json.return_value = {
            "data": {
                "sh600000": {
                    "day": [["2026-07-20", "10", "10.5", "10.8", "9.9", "100"]]
                }
            }
        }
        mock_get.return_value = response

        frame = data_sources.fetch_tencent_daily_df(
            "600000",
            date(2026, 7, 1),
            date(2026, 7, 21),
            adjust="qfq",
        )

        self.assertTrue(frame.empty)
        self.assertEqual(
            mock_get.call_args.kwargs["params"]["param"].split(",", 2)[:2],
            ["sh600000", "qfqday"],
        )

    def test_overlay_live_adjusted_daily_uses_completed_day_factor(self):
        adjusted = pd.DataFrame(
            [
                {
                    "日期": date(2026, 7, 20),
                    "开盘": 10.0,
                    "收盘": 10.5,
                    "最高": 10.8,
                    "最低": 9.9,
                    "成交量": 100.0,
                    "成交额": 105000.0,
                }
            ]
        )
        raw = pd.DataFrame(
            [
                {
                    "日期": date(2026, 7, 20),
                    "开盘": 10.0,
                    "收盘": 10.5,
                    "最高": 10.8,
                    "最低": 9.9,
                    "成交量": 100.0,
                    "成交额": 105000.0,
                },
                {
                    "日期": date(2026, 7, 21),
                    "开盘": 13.2,
                    "收盘": 13.88,
                    "最高": 14.0,
                    "最低": 13.1,
                    "成交量": 200.0,
                    "成交额": 277600.0,
                },
            ]
        )
        result = data_sources.overlay_live_adjusted_daily_df(adjusted, raw)
        latest = result.iloc[-1]
        self.assertEqual(latest["日期"].date(), date(2026, 7, 21))
        self.assertAlmostEqual(float(latest["收盘"]), 13.88, places=4)
        self.assertAlmostEqual(float(latest["最高"]), 14.0, places=4)

    def test_equity_market(self):
        self.assertEqual(data_sources.equity_market("600000"), "CN")
        self.assertEqual(data_sources.equity_market("00700.HK"), "HK")
        self.assertEqual(data_sources.equity_market("MSFT"), "US")

    def test_supported_instrument_codes_and_asset_types(self):
        cases = {
            "510300": "etf",
            "159915": "etf",
            "508000": "reit",
            "113001": "convertible_bond",
            "010107": "bond",
            "fund:000001": "fund",
            "trust:QH001": "trust",
        }
        for code, expected_type in cases.items():
            with self.subTest(code=code):
                self.assertTrue(data_sources.is_supported_security_code(code))
                self.assertEqual(data_sources.infer_asset_type(code), expected_type)

    def test_asset_type_inference_repairs_legacy_stock_etf_marker(self):
        self.assertEqual(
            data_sources.infer_asset_type("510300", "沪深300ETF", explicit="stock"),
            "etf",
        )
        self.assertEqual(
            data_sources.infer_asset_type("510300", "沪深300ETF", explicit="fund"),
            "fund",
        )

    def test_stock_universe_excludes_non_stock_instruments(self):
        self.assertFalse(data_sources.is_a_share_code("510300"))
        self.assertTrue(data_sources.is_cn_listed_security_code("510300"))
        self.assertEqual(data_sources.infer_listing_board("508000"), "公募REITs")

    def test_tencent_quote_parser_uses_market_specific_currency_amount_and_pb(self):
        hk_fields = [""] * 78
        hk_fields[1] = "腾讯控股"
        hk_fields[2] = "00700"
        hk_fields[3] = "461.600"
        hk_fields[4] = "484.000"
        hk_fields[31] = "-22.400"
        hk_fields[32] = "-4.63"
        hk_fields[37] = "16928705332.905"
        hk_fields[39] = "16.86"
        hk_fields[44] = "41971.0552"
        hk_fields[45] = "41971.0552"
        hk_fields[58] = "3.34"
        hk_fields[75] = "HKD"
        hk = data_sources._parse_tencent_quote_fields(hk_fields, "hk00700")
        self.assertEqual(hk["currency"], "HKD")
        self.assertEqual(hk["amount"], 16928705332.905)
        self.assertEqual(hk["pb_ratio"], 3.34)
        self.assertEqual(hk["change_pct"], -4.63)

        us_fields = [""] * 71
        us_fields[1] = "苹果"
        us_fields[2] = "AAPL.OQ"
        us_fields[3] = "333.74"
        us_fields[4] = "333.26"
        us_fields[32] = "0.14"
        us_fields[35] = "USD"
        us_fields[37] = "21088260742"
        us_fields[39] = "40.40"
        us_fields[44] = "48987.30795"
        us_fields[45] = "49017.58191"
        us_fields[58] = "34.91"
        us = data_sources._parse_tencent_quote_fields(us_fields, "usAAPL")
        self.assertEqual(us["code"], "usAAPL")
        self.assertEqual(us["currency"], "USD")
        self.assertEqual(us["amount"], 21088260742.0)
        self.assertEqual(us["pb_ratio"], 34.91)

    def test_parse_sina_us_intraday_text_keeps_full_latest_session(self):
        payload = (
            'var _quartsys_us_min=([{"d":"2026-07-17 09:31:00","c":"330.10","v":"100","a":"33010"},'
            '{"d":"2026-07-17 12:00:00","c":"331.20","v":"200","a":"66240"},'
            '{"d":"2026-07-17 16:00:00","c":"333.40","v":"300","a":"100020"},'
            '{"d":"2026-07-16 16:00:00","c":"329.00","v":"10","a":"3290"}]);'
        )
        result = data_sources.parse_sina_us_intraday_text(payload, "usAAPL")
        self.assertEqual(result["date"], "2026-07-17")
        self.assertEqual([item["time"] for item in result["data"]], ["09:31", "12:00", "16:00"])
        self.assertEqual(result["data"][-1]["cum_volume"], 600.0)

    @patch.object(data_sources.requests, "get")
    def test_tencent_intraday_keeps_afternoon_volume_after_cumulative_reset(self, mock_get):
        quote = [""] * 6
        quote[1] = "平安银行"
        quote[4] = "10.00"
        response = Mock()
        response.json.return_value = {
            "data": {
                "sz000001": {
                    "data": {
                        "date": "20260717",
                        "data": [
                            "0930 10.10 100 1010",
                            "1130 10.20 500 5100",
                            "1300 10.15 50 507.5",
                            "1301 10.18 80 814.4",
                        ],
                    },
                    "qt": {"sz000001": quote},
                }
            }
        }
        mock_get.return_value = response

        result = data_sources.fetch_tencent_intraday_points("000001")

        self.assertEqual([item["volume"] for item in result["data"]], [100.0, 400.0, 50.0, 30.0])
        self.assertEqual(result["data"][-1]["cum_volume"], 580.0)
        self.assertGreater(result["data"][2]["amount"], 0)

    def test_us_intraday_prefers_fuller_same_day_fallback(self):
        primary = {
            "code": "usAAPL",
            "date": "20260717",
            "source": "tencent.minute",
            "prev_close": 330.0,
            "data": [{"time": "09:30", "price": 331.0}] * 45,
        }
        fallback = {
            "code": "usAAPL",
            "date": "2026-07-17",
            "source": "sina.us.minute",
            "data": [
                {"time": f"{9 + index // 60:02d}:{30 + index % 30:02d}", "price": 331.0}
                for index in range(120)
            ],
        }
        with patch.object(data_sources, "fetch_tencent_intraday_points", return_value=primary), patch.object(
            data_sources, "fetch_sina_us_intraday_points", return_value=fallback
        ), patch.object(
            data_sources,
            "fetch_tencent_fundamentals",
            return_value={"usAAPL": {"name": "Apple", "prev_close": 330.0}},
        ):
            result = data_sources.fetch_stock_intraday_points("usAAPL")

        self.assertEqual(result["source"], "sina.us.minute")
        self.assertEqual(result["name"], "Apple")
        self.assertEqual(result["prev_close"], 330.0)

    def test_us_intraday_keeps_newer_live_session_over_older_full_fallback(self):
        primary = {
            "code": "usAAPL",
            "date": "2026-07-18",
            "source": "tencent.minute",
            "data": [{"time": "09:30", "price": 331.0}] * 20,
        }
        fallback = {
            "code": "usAAPL",
            "date": "2026-07-17",
            "source": "sina.us.minute",
            "data": [{"time": "09:30", "price": 330.0}] * 390,
        }
        with patch.object(data_sources, "fetch_tencent_intraday_points", return_value=primary), patch.object(
            data_sources, "fetch_sina_us_intraday_points", return_value=fallback
        ):
            result = data_sources.fetch_stock_intraday_points("usAAPL")

        self.assertEqual(result["source"], "tencent.minute")
        self.assertEqual(result["date"], "2026-07-18")

    def test_extract_tencent_kline_rows_is_defensive(self):
        payload = {"data": {"sh600000": {"day": [["2026-06-29", "1", "2", "3", "1", "10"]]}}}
        self.assertEqual(len(data_sources.extract_tencent_kline_rows(payload, "sh600000")), 1)
        self.assertEqual(data_sources.extract_tencent_kline_rows({"data": []}, "sh600000"), [])
        self.assertEqual(data_sources.extract_tencent_kline_rows({"data": {"sh600000": []}}, "sh600000"), [])
        self.assertEqual(data_sources.extract_tencent_kline_rows([], "sh600000"), [])

    def test_extract_tencent_us_kline_alias(self):
        payload = {
            "data": {
                "us.INX": {
                    "day": [["2026-07-10", "7500", "7575", "7580", "7490", "123"]]
                }
            }
        }
        rows = data_sources.extract_tencent_kline_rows(payload, "usINX")
        self.assertEqual(rows[0][0], "2026-07-10")

    def test_parse_sina_us_daily_text(self):
        payload = (
            'var _quartsys_us_daily=([{"d":"2026-07-09","o":"310.51",'
            '"h":"316.53","l":"308.16","c":"316.22","v":"48124426",'
            '"a":"15133500000"}]);'
        )
        frame = data_sources.parse_sina_us_daily_text(
            payload,
            date(2026, 7, 1),
            date(2026, 7, 11),
        )
        self.assertEqual(len(frame), 1)
        self.assertEqual(frame.iloc[0]["收盘"], 316.22)
        self.assertEqual(frame.iloc[0]["成交量"], 48124426.0)

    @patch.object(data_sources.requests, "get")
    def test_hk_tencent_history_respects_provider_count_limit(self, mock_get):
        response = Mock()
        response.json.return_value = {
            "data": {
                "hk00700": {
                    "day": [
                        [
                            "2026-07-10",
                            "455.0",
                            "460.2",
                            "463.8",
                            "452.4",
                            "18123456",
                        ]
                    ]
                }
            }
        }
        mock_get.return_value = response

        frame = data_sources.fetch_tencent_daily_df(
            "hk00700",
            date(2023, 7, 12),
            date(2026, 7, 11),
        )

        self.assertEqual(len(frame), 1)
        request_param = mock_get.call_args.kwargs["params"]["param"]
        self.assertEqual(request_param, "hk00700,day,,,800")

    @patch.object(data_sources, "fetch_sina_us_daily_df")
    @patch.object(data_sources, "fetch_tencent_daily_df")
    def test_us_daily_falls_back_when_tencent_history_is_sparse(
        self,
        mock_tencent,
        mock_sina,
    ):
        mock_tencent.return_value = pd.DataFrame(
            [{"日期": pd.Timestamp("2026-07-10"), "收盘": 315.32}]
        )
        mock_sina.return_value = pd.DataFrame(
            {
                "日期": pd.date_range("2026-04-01", periods=60, freq="B"),
                "开盘": [100.0] * 60,
                "收盘": [101.0] * 60,
                "最高": [102.0] * 60,
                "最低": [99.0] * 60,
                "成交量": [1000.0] * 60,
                "成交额": [101000.0] * 60,
            }
        )
        frame = data_sources.fetch_daily_price_df(
            "AAPL",
            date(2026, 1, 1),
            date(2026, 7, 11),
        )
        self.assertEqual(len(frame), 60)
        mock_sina.assert_called_once()


if __name__ == "__main__":
    unittest.main()
