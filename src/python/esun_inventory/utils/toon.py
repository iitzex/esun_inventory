"""Token-Oriented Object Notation (TOON) 轉換器。

輕量、易讀的自定義格式，用於把 Python 資料結構輸出成文字。

注意：TOON 對空容器不可逆——空 list/dict 都只會輸出 `key:` 一行，
解析端會把 `key:` 還原成 `{}`。消費端應以 `Array.isArray` 等型別檢查容錯。
"""

import io
import math
from typing import Any


class ToonConverter:
    """把 Python 物件序列化成 TOON 字串。"""

    @staticmethod
    def to_toon(data: Any) -> str:
        """轉成 TOON 字串（首尾空白會 strip 掉）。"""
        output = io.StringIO()
        ToonConverter._serialize(data, output, 0)
        return output.getvalue().strip()

    @staticmethod
    def _serialize(data: Any, output: io.StringIO, indent: int) -> None:
        """遞迴序列化。null 值會被略過（null pruning）。"""
        space = " " * indent

        if isinstance(data, dict):
            for k, v in data.items():
                if ToonConverter._is_null(v):
                    continue
                if isinstance(v, (dict, list)):
                    output.write(f"{space}{k}:\n")
                    ToonConverter._serialize(v, output, indent + 2)
                else:
                    output.write(f"{space}{k}: {v}\n")
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, (dict, list)):
                    output.write(f"{space}-\n")
                    ToonConverter._serialize(item, output, indent + 2)
                else:
                    output.write(f"{space}- {item}\n")
        else:
            output.write(f"{space}{data}\n")

    @staticmethod
    def _is_null(v: Any) -> bool:
        if v is None:
            return True
        if isinstance(v, str):
            return not v.strip() or v.strip().lower() == "nan"
        if isinstance(v, float) and math.isnan(v):
            return True
        return False
