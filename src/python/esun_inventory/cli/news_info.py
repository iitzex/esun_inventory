"""CLI: 輸出委託/成交紀錄（TOON）到 stdout。支援 --range 或 --start/--end。"""

import argparse
import re

from esun_trade.sdk import SDK

from esun_inventory.cli.base import BaseCommand

VALID_RANGES = ("0d", "3d", "1m", "3m")
DATE_PATTERN = re.compile(r"^\d{8}$")


def _to_iso(date: str) -> str:
    """YYYYMMDD → yyyy-MM-dd（by_date 系列 API 要求）。"""
    return f"{date[:4]}-{date[4:6]}-{date[6:8]}"


def _resolve_range(start: str | None, end: str | None) -> tuple[str, str] | None:
    """驗證自訂日期區間並轉 ISO；未提供時回傳 None，不合規拋 ValueError。"""
    if (start is None) != (end is None):
        raise ValueError("--start 與 --end 必須成對提供")
    if start and (not DATE_PATTERN.match(start) or not DATE_PATTERN.match(end)):
        raise ValueError("日期格式須為 YYYYMMDD")
    if start and start > end:
        raise ValueError("--start 不得晚於 --end")
    return (_to_iso(start), _to_iso(end)) if start else None


class NewsInfoCommand(BaseCommand):
    def __init__(self, query_range: str = "0d", start: str | None = None, end: str | None = None):
        super().__init__()
        self.query_range = query_range
        self._date_range = _resolve_range(start, end)

    def execute(self, sdk: SDK) -> dict:
        if self._date_range:
            start, end = self._date_range
            return {
                "orders": sdk.get_order_results_by_date(start, end) or [],
                "transactions": sdk.get_transactions_by_date(start, end) or [],
            }
        return {
            "orders": sdk.get_order_results() or [],
            "transactions": sdk.get_transactions(query_range=self.query_range) or [],
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--range",
        type=str,
        default="0d",
        choices=VALID_RANGES,
        help="查詢區間 (0d, 3d, 1m, 3m)",
    )
    parser.add_argument(
        "--start",
        type=str,
        default=None,
        help="自訂起日 YYYYMMDD（須搭配 --end）",
    )
    parser.add_argument(
        "--end",
        type=str,
        default=None,
        help="自訂迄日 YYYYMMDD（須搭配 --start）",
    )
    args = parser.parse_args()

    try:
        command = NewsInfoCommand(query_range=args.range, start=args.start, end=args.end)
    except ValueError as e:
        parser.error(str(e))

    command.main()


if __name__ == "__main__":
    main()
