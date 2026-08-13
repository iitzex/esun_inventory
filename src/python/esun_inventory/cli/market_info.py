"""CLI: 輸出市場開盤狀態（TOON）到 stdout。"""

from esun_trade.sdk import SDK

from esun_inventory.cli.base import BaseCommand


class MarketInfoCommand(BaseCommand):
    def execute(self, sdk: SDK) -> dict:
        return sdk.get_market_status()


def main() -> None:
    MarketInfoCommand().main()


if __name__ == "__main__":
    main()
