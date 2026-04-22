"""玉山證券 SDK 登入共用邏輯：設定檔載入、Keyring 密碼同步、SDK 登入。"""

import configparser
import getpass
import sys
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

REQUIRED_CONFIG = {
    "Core": ["Entry"],
    "Api": ["Key", "Secret"],
    "Cert": ["Path"],
    "User": ["Account"],
}


def load_config(path: str = "config.ini") -> configparser.ConfigParser:
    """讀取並驗證 config.ini。缺區段或金鑰會 raise。"""
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f"找不到設定檔: {config_path}")

    config = configparser.ConfigParser()
    config.read(config_path)

    for section, keys in REQUIRED_CONFIG.items():
        if section not in config:
            raise ValueError(f"設定檔缺少區段: [{section}]")
        for key in keys:
            if key not in config[section]:
                raise ValueError(f"設定檔 [{section}] 缺少金鑰: {key}")

    return config


def prepare_credentials(config: configparser.ConfigParser) -> None:
    """把 config 的密碼同步到 Keyring；缺少時互動式輸入。"""
    account_id = config["User"]["Account"]
    setup_keyring(account_id)
    _sync_password(
        TRADE_SDK_ACCOUNT_KEY,
        account_id,
        config["User"].get("Password"),
        prompt="請輸入您的玉山證券帳戶密碼: ",
        label="帳戶密碼",
    )
    _sync_password(
        TRADE_SDK_CERT_KEY,
        account_id,
        config["Cert"].get("Password"),
        prompt="請輸入您的交易憑證密碼: ",
        label="憑證密碼",
    )


def _sync_password(
    key: str,
    account_id: str,
    cfg_password: Optional[str],
    prompt: str,
    label: str,
) -> None:
    if cfg_password:
        keyring.set_password(key, account_id, cfg_password)
        logger.info(f"已從設定檔讀取{label}。")
        return
    if keyring.get_password(key, account_id):
        return
    print(f"--- {label}缺失 (帳號: {account_id}) ---", file=sys.stderr)
    pwd = getpass.getpass(prompt)
    keyring.set_password(key, account_id, pwd)


def login(
    config: Optional[configparser.ConfigParser] = None,
    prepare: bool = False,
) -> SDK:
    """載入 config、登入 SDK。prepare=True 會先同步 Keyring 密碼（互動模式）。"""
    if config is None:
        config = load_config()
    if prepare:
        prepare_credentials(config)
    sdk = SDK(config)
    sdk.login()
    return sdk
