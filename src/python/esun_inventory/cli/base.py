"""CLI 基底類別：封裝重複的 Setup 與 Output 邏輯。"""

from abc import ABC, abstractmethod
from typing import Any

from esun_trade.sdk import SDK

from esun_inventory.cli._runner import run_cli
from esun_inventory.client import EsunClient, EsunConfig
from esun_inventory.utils.toon import ToonConverter


class BaseCommand(ABC):
    """所有 CLI 命令的基底類別。"""

    def __init__(self, prepare: bool = False):
        self.prepare = prepare

    def main(self) -> None:
        """Entrypoint，由 run_cli 包裝。"""
        run_cli(self._run)

    def _run(self) -> None:
        """內部執行邏輯。"""
        config = EsunConfig.load()
        client = EsunClient(config)
        if self.prepare:
            client.prepare()

        sdk = client.login()
        result = self.execute(sdk)

        if result is not None:
            print(ToonConverter.to_toon(result))

    @abstractmethod
    def execute(self, sdk: SDK) -> Any | None:
        """子類別需實作的具體業務邏輯。回傳非 None 時會自動轉為 TOON 輸出。"""
