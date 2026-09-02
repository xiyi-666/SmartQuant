#!/usr/bin/env python3
"""Import a user-maintained security universe without fetching external data."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Iterable

import data_sources
from models import Stock


def _read_rows(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        raise FileNotFoundError(f"CSV 文件不存在: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = {str(item or "").strip().lower() for item in (reader.fieldnames or [])}
        if not {"code", "name"}.issubset(headers):
            raise ValueError("CSV 必须包含 code 和 name 列")
        return [dict(row) for row in reader]


def _normalize_row(row: dict[str, str], row_number: int) -> dict[str, str]:
    code = data_sources.normalize_stock_code(row.get("code") or "")
    if not code or not data_sources.is_supported_security_code(code):
        raise ValueError(f"第 {row_number} 行证券代码无效")
    name = str(row.get("name") or "").strip()
    if not name:
        raise ValueError(f"第 {row_number} 行 name 不能为空")
    board = str(row.get("board") or "").strip() or data_sources.infer_listing_board(code)
    market = data_sources.equity_market(code)
    return {
        "code": code,
        "name": name,
        "asset_type": data_sources.infer_asset_type(code, name, board, row.get("asset_type")),
        "market": market,
        "exchange": data_sources.infer_exchange(code, market=market),
        "currency": data_sources.market_currency(market),
        "industry": str(row.get("industry") or "").strip(),
        "sector": str(row.get("sector") or "").strip(),
        "board": board,
        "area": str(row.get("area") or "").strip(),
    }


def import_security_universe(path: str | Path, session) -> dict[str, int]:
    """Create or update securities from a local CSV and return import counts."""
    rows = [_normalize_row(row, index) for index, row in enumerate(_read_rows(Path(path)), start=2)]
    created = 0
    updated = 0
    skipped = 0
    for values in rows:
        stock = session.query(Stock).filter(Stock.code == values["code"]).first()
        if stock is None:
            session.add(Stock(**values))
            created += 1
            continue
        changed = False
        for key, value in values.items():
            if key == "code" or value == "":
                continue
            if getattr(stock, key) != value:
                setattr(stock, key, value)
                changed = True
        if changed:
            updated += 1
        else:
            skipped += 1
    session.commit()
    return {"total": len(rows), "created": created, "updated": updated, "skipped": skipped}


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导入用户维护的证券池 CSV，不请求任何第三方数据")
    parser.add_argument("--file", required=True, help="CSV 文件路径")
    return parser.parse_args(argv)


def main() -> None:
    args = _parse_args()
    from database import Base, SessionLocal, engine

    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        result = import_security_universe(args.file, session)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    print(
        "导入完成: "
        f"总计 {result['total']}，新增 {result['created']}，更新 {result['updated']}，未变化 {result['skipped']}"
    )


if __name__ == "__main__":
    main()
