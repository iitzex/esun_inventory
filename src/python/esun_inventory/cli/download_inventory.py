"""CLI: 下載庫存/餘額/交割資料，寫入 inventory/YYYYMMDD.toon（同日覆蓋）。"""

from datetime import datetime
from pathlib import Path
from typing import Optional

from esun_trade.sdk import SDK

from esun_inventory.cli.base import BaseCommand
from esun_inventory.utils.logger import get_logger
from esun_inventory.utils.toon import ToonConverter

logger = get_logger(__name__)


def fetch_balance(sdk: SDK) -> Optional[dict]:
    """取得銀行餘額。任何錯誤皆回傳 None（不中斷流程）。"""
    try:
        logger.info("正在獲取銀行餘額...")
        return sdk.get_balance()
    except Exception as e:
        logger.warning(f"獲取銀行餘額失敗，跳過: {e}")
        return None


def fetch_settlements(sdk: SDK) -> Optional[list]:
    """取得交割資料。任何錯誤皆回傳 None（不中斷流程）。"""
    try:
        logger.info("正在獲取交割資料...")
        return sdk.get_settlements()
    except Exception as e:
        logger.warning(f"獲取交割資料失敗，跳過: {e}")
        return None


def write_snapshot(content: str, output_dir: Path) -> None:
    """寫入 YYYYMMDD.toon，同天執行時覆蓋。"""
    path = output_dir / f"{datetime.now().strftime('%Y%m%d')}.toon"
    path.write_text(content, encoding="utf-8")
    logger.info(f"已寫入快照: {path.name}")


class DownloadInventoryCommand(BaseCommand):
    def __init__(self, output_dir: str = "inventory"):
        super().__init__(prepare=True)
        self.output_dir = output_dir

    def execute(self, sdk: SDK) -> None:
        output_path = Path(self.output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        logger.info("正在抓取庫存資料...")
        inventories = sdk.get_inventories()
        balance = fetch_balance(sdk)
        settlements = fetch_settlements(sdk)

        if not inventories and not balance and not settlements:
            logger.warning("目前帳戶無資料 (庫存、餘額與交割皆空)。")
            return

        consolidated = {
            "inventory": inventories or [],
            "balance": balance or {},
            "settlements": settlements or [],
        }
        toon_content = ToonConverter.to_toon(consolidated)
        write_snapshot(toon_content, output_path)

        skipped = sum(1 for v in (balance, settlements) if v is None)
        note = "，餘額或交割擷取失敗已跳過" if skipped else ""
        print(f"\n成功！庫存: {len(inventories) if inventories else 0} 筆{note}。")


def main() -> None:
    logger.info("🎬 啟動玉山證券庫存下載程序...")
    DownloadInventoryCommand().main()
    logger.info("✅ 程序順利完成。")


if __name__ == "__main__":
    main()
