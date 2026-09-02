import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from import_security_universe import import_security_universe
from models import Base, Stock


class ImportSecurityUniverseTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.session = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def _csv(self, content: str) -> Path:
        handle = tempfile.NamedTemporaryFile("w", suffix=".csv", encoding="utf-8", delete=False)
        with handle:
            handle.write(content)
        self.addCleanup(Path(handle.name).unlink, missing_ok=True)
        return Path(handle.name)

    def test_import_creates_and_updates_without_external_requests(self):
        path = self._csv("code,name,industry,area,board,asset_type\n600000,示例银行,银行,上海,主板,stock\n")
        first = import_security_universe(path, self.session)
        self.assertEqual(first, {"total": 1, "created": 1, "updated": 0, "skipped": 0})

        path = self._csv("code,name,industry,area,board,asset_type\n600000,示例银行,金融,上海,主板,stock\n")
        second = import_security_universe(path, self.session)
        self.assertEqual(second["updated"], 1)
        self.assertEqual(self.session.get(Stock, "600000").industry, "金融")

    def test_import_rejects_missing_required_columns(self):
        path = self._csv("symbol,title\n600000,示例\n")
        with self.assertRaisesRegex(ValueError, "code 和 name"):
            import_security_universe(path, self.session)


if __name__ == "__main__":
    unittest.main()
