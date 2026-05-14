"""CLI: 輸出委託/成交紀錄（TOON）到 stdout。支援 --range。"""

import argparse
from typing import Optional

from esun_trade.sdk import SDK

from esun_inventory.cli.base import BaseCommand

VALID_RANGES = ("0d", "3d", "1m", "3m")


class NewsInfoCommand(BaseCommand):
    def __init__(self, query_range: str = "0d"):
        super().__init__()
        self.query_range = query_range

    def execute(self, sdk: SDK) -> dict:
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
    args = parser.parse_args()
    NewsInfoCommand(query_range=args.range).main()


if __name__ == "__main__":
    main()
