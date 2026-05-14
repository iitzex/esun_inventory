"""CLI: 下載庫存/餘額/交割資料，寫入 inventory/*.toon（增量比對）。"""

from datetime import datetime
from pathlib import Path
from typing import Optional

from esun_trade.sdk import SDK

from esun_inventory.cli.base import BaseCommand
from esun_inventory.utils.logger import get_logger
from esun_inventory.utils.toon import ToonConverter

logger = get_logger(__name__)


def fetch_balance(sdk: SDK) -> Optional[dict]:
    """取得銀行餘額。遇到 180 秒頻率限制時回傳 None（不中斷流程）。"""
    try:
        logger.info("正在獲取銀行餘額...")
        return sdk.get_balance()
    except Exception as e:
        if "180秒" in str(e):
            logger.warning("銀行餘額查詢頻率過快 (180秒限制)，跳過本次查詢。")
        else:
            logger.error(f"獲取銀行餘額時發生錯誤: {e}")
        return None


def write_snapshot(content: str, output_dir: Path) -> None:
    """寫入 TOON 檔：內容與最近檔案相同則覆蓋；否則建立 YYYYMMDD.toon。"""
    existing = [f for f in output_dir.glob("*.toon") if len(f.stem) == 8 and f.stem.isdigit()]
    latest = max(existing, key=lambda p: p.stat().st_mtime) if existing else None

    if latest:
        try:
            if content.strip() == latest.read_text(encoding="utf-8").strip():
                latest.write_text(content, encoding="utf-8")
                logger.info(f"✨ 資料無變化，已覆蓋更新原有檔案: {latest.name}")
                return
        except OSError as e:
            logger.error(f"比對過程中發生錯誤: {e}")

    filename = f"{datetime.now().strftime('%Y%m%d')}.toon"
    new_path = output_dir / filename
    new_path.write_text(content, encoding="utf-8")
    logger.info(f"🆕 資料有變動，已建立整合檔案: {new_path.name}")


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
        settlements = sdk.get_settlements()

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

        print(f"\n成功！庫存: {len(inventories) if inventories else 0} 筆, 餘額已更新。")


def main() -> None:
    logger.info("🎬 啟動玉山證券庫存下載程序...")
    DownloadInventoryCommand().main()
    logger.info("✅ 程序順利完成。")


if __name__ == "__main__":
    main()
