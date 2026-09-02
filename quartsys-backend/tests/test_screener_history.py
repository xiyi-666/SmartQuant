import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base
from models import DailyPrice, Stock
import screener


class ScreenerHistoryTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine, tables=[Stock.__table__, DailyPrice.__table__])
        self.session = sessionmaker(bind=engine)()
        self.session.add(Stock(code="510300", name="沪深300ETF", asset_type="etf"))

        today = datetime.now().date()
        for index, age_days in enumerate((5, 400, 1_200, 2_500), start=1):
            self.session.add(
                DailyPrice(
                    stock_code="510300",
                    date=today - timedelta(days=age_days),
                    open=float(index),
                    close=float(index),
                    high=float(index),
                    low=float(index),
                    volume=float(index * 100),
                )
            )
        self.session.commit()

    def tearDown(self):
        self.session.close()

    def test_none_days_returns_complete_history(self):
        full_history = screener.get_stock_data_from_db("510300", self.session, days=None)
        three_year_history = screener.get_stock_data_from_db("510300", self.session, days=1095)

        self.assertEqual(len(full_history), 4)
        self.assertEqual(len(three_year_history), 2)
        self.assertLess(full_history.iloc[0]["日期"], three_year_history.iloc[0]["日期"])


if __name__ == "__main__":
    unittest.main()
