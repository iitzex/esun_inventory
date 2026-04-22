"""CLI: 輸出委託/成交紀錄（TOON）到 stdout。支援 --range。"""

import argparse

from esun_inventory.cli._runner import run_cli
from esun_inventory.client import login
from esun_inventory.utils.toon import ToonConverter

VALID_RANGES = ("0d", "3d", "1m", "3m")


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

    sdk = login()
    info = {
        "orders": sdk.get_order_results() or [],
        "transactions": sdk.get_transactions(query_range=args.range) or [],
    }
    print(ToonConverter.to_toon(info))


if __name__ == "__main__":
    run_cli(main)
