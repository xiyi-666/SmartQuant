import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

try:
    import factor_engine  # noqa: E402
except ModuleNotFoundError as exc:  # pragma: no cover - environment guard
    if exc.name in {"dotenv", "sqlalchemy", "pandas", "numpy"}:
        raise unittest.SkipTest("backend dependencies are not installed") from exc
    raise


class FactorEngineTests(unittest.TestCase):
    def test_close_variable_does_not_trip_os_keyword_guard(self):
        result = factor_engine.validate_expression("ROC(close, $window)", {"window": 20})

        self.assertTrue(result["valid"], result.get("error"))

    def test_dangerous_keyword_still_rejected(self):
        result = factor_engine.validate_expression("os.system('echo bad')", {})

        self.assertFalse(result["valid"])
        self.assertIn("os", result["error"])


if __name__ == "__main__":
    unittest.main()
