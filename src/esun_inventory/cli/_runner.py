"""CLI 共用 entrypoint：統一例外 → main.js 可識別的失敗格式。

main.js (main.js:41-61) 契約：
- stdout 以 'Error:' 開頭 → 失敗
- 或 exit code 非 0 → 失敗
這裡兩者同時滿足，讓前端無論哪個分支都能顯示錯誤訊息。
"""

import sys
from typing import Callable

from esun_inventory.utils.logger import get_logger

logger = get_logger(__name__)


def run_cli(fn: Callable[[], None]) -> None:
    """執行 CLI 主函式，catch 所有例外後以統一格式輸出錯誤。"""
    try:
        fn()
    except KeyboardInterrupt:
        logger.warning("使用者手動取消操作。")
        sys.exit(130)
    except Exception as e:
        print(f"Error: {e}")
        logger.error("CLI 執行失敗", exc_info=True)
        sys.exit(1)
