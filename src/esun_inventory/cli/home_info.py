"""CLI: 輸出憑證/金鑰/交易狀態（TOON）到 stdout。"""

from esun_inventory.cli._runner import run_cli
from esun_inventory.client import login
from esun_inventory.utils.toon import ToonConverter


def main() -> None:
    sdk = login()
    info = {
        "cert": sdk.certinfo(),
        "key": sdk.get_key_info(),
        "trade_status": sdk.get_trade_status(),
    }
    print(ToonConverter.to_toon(info))


if __name__ == "__main__":
    run_cli(main)
