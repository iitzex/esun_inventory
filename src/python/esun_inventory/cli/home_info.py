"""CLI: 輸出憑證/金鑰/交易狀態（TOON）到 stdout。"""

from esun_trade.sdk import SDK

from esun_inventory.cli.base import BaseCommand


class HomeInfoCommand(BaseCommand):
    def execute(self, sdk: SDK) -> dict:
        return {
            "cert": sdk.certinfo(),
            "key": sdk.get_key_info(),
            "trade_status": sdk.get_trade_status(),
        }


def main() -> None:
    HomeInfoCommand().main()


if __name__ == "__main__":
    main()
