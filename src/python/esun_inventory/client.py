"""玉山證券 SDK 登入共用邏輯：封裝設定與客戶端。"""

import configparser
import getpass
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import keyring
from esun_trade.sdk import SDK
from esun_trade.util import (
    TRADE_SDK_ACCOUNT_KEY,
    TRADE_SDK_CERT_KEY,
    setup_keyring,
)

from esun_inventory.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class EsunConfig:
    """封裝玉山證券設定。"""

    raw_config: configparser.ConfigParser

    REQUIRED_KEYS = {
        "Core": ["Entry"],
        "Api": ["Key", "Secret"],
        "Cert": ["Path"],
        "User": ["Account"],
    }

    @classmethod
    def load(cls, path: str = "private/config.ini") -> "EsunConfig":
        """讀取並驗證 config.ini。"""
        config_path = Path(path)
        if not config_path.exists():
            raise FileNotFoundError(f"找不到設定檔: {config_path}")

        config = configparser.ConfigParser()
        config.read(config_path)

        for section, keys in cls.REQUIRED_KEYS.items():
            if section not in config:
                raise ValueError(f"設定檔缺少區段: [{section}]")
            for key in keys:
                if key not in config[section]:
                    raise ValueError(f"設定檔 [{section}] 缺少金鑰: {key}")

        return cls(raw_config=config)

    @property
    def account(self) -> str:
        return self.raw_config["User"]["Account"]

    def get_password(self, section: str) -> Optional[str]:
        return self.raw_config[section].get("Password")


class EsunClient:
    """管理玉山證券 SDK 登入與會話。"""

    def __init__(self, config: EsunConfig):
        self.config = config
        self._sdk: Optional[SDK] = None

    def prepare(self) -> None:
        """同步密碼至 Keyring；缺少時互動式輸入。"""
        account_id = self.config.account
        setup_keyring(account_id)

        self._sync_password(
            TRADE_SDK_ACCOUNT_KEY,
            self.config.get_password("User"),
            prompt="請輸入您的玉山證券帳戶密碼: ",
            label="帳戶密碼",
        )
        self._sync_password(
            TRADE_SDK_CERT_KEY,
            self.config.get_password("Cert"),
            prompt="請輸入您的交易憑證密碼: ",
            label="憑證密碼",
        )

    def _sync_password(
        self,
        key: str,
        cfg_password: Optional[str],
        prompt: str,
        label: str,
    ) -> None:
        account_id = self.config.account
        if cfg_password:
            keyring.set_password(key, account_id, cfg_password)
            logger.info(f"已從設定檔讀取{label}。")
            return
        if keyring.get_password(key, account_id):
            return
        print(f"--- {label}缺失 (帳號: {account_id}) ---", file=sys.stderr)
        pwd = getpass.getpass(prompt)
        keyring.set_password(key, account_id, pwd)

    def login(self) -> SDK:
        """執行登入。"""
        self._sdk = SDK(self.config.raw_config)
        self._sdk.login()
        return self._sdk

    @property
    def sdk(self) -> SDK:
        if self._sdk is None:
            raise RuntimeError("SDK 尚未登入，請先呼叫 login()")
        return self._sdk
