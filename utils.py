import io
import math
from typing import Any
from datetime import datetime

class ToonConverter:
    """
    Token-Oriented Object Notation (TOON) 轉換器
    用於將 Python 資料結構轉換為輕量、易讀的自定義格式。
    """

    @staticmethod
    def to_toon(data: Any) -> str:
        """
        將 Python 物件轉換為 TOON 字串
        """
        output = io.StringIO()
        ToonConverter._serialize(data, output, 0)
        return output.getvalue().strip()

    @staticmethod
    def _serialize(data: Any, output: io.StringIO, indent: int) -> None:
        """
        遞迴序列化資料結構
        """
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
        """
        檢查是否為空值 (Null Pruning)
        """
        if v is None:
            return True
        if isinstance(v, str) and not v.strip():
            return True
        if isinstance(v, float) and math.isnan(v):
            return True
        if v == "nan" or v == "NaN":
            return True
        return False

def format_timestamp(ts: Any) -> str:
    """
    格式化時間戳記
    """
    if not ts: return "--"
    if isinstance(ts, dict) and "seconds" in ts:
        return datetime.fromtimestamp(ts["seconds"]).strftime("%Y/%m/%d %H:%M:%S")
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts).strftime("%Y/%m/%d %H:%M:%S")
    return str(ts)
