"""統一 logging 設定。

log 走 stderr，避免污染 stdout 的 TOON 輸出（main.js 只讀 stdout 當結果）。
"""

import logging
import sys

_LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


def setup_logging(level: int = logging.INFO) -> None:
    """初始化 root logger，輸出到 stderr。basicConfig 本身冪等，重複呼叫 no-op。"""
    logging.basicConfig(level=level, format=_LOG_FORMAT, stream=sys.stderr)


def get_logger(name: str) -> logging.Logger:
    """取得指定名稱 logger，首次呼叫時自動初始化。"""
    setup_logging()
    return logging.getLogger(name)
