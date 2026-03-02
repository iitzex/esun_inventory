import configparser
import logging
import os
import getpass
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, Union

import pandas as pd
from esun_trade.sdk import SDK
from esun_trade.util import (
    TRADE_SDK_ACCOUNT_KEY,
    TRADE_SDK_CERT_KEY,
    setup_keyring
)
import keyring
from utils import ToonConverter

# 設定 Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("EsunInventory")

class EsunInventoryDownloader:
    """玉山證券庫存下載器 (TOON 驅動版)"""

    def __init__(self, config_path: str = "config.ini"):
        self.config_path = Path(config_path)
        self.config = configparser.ConfigParser()
        self.sdk: Optional[SDK] = None
        self.account_id: str = ""
        
        if not self.config_path.exists():
            raise FileNotFoundError(f"找不到設定檔: {self.config_path}")
        
        self.config.read(self.config_path)
        self._validate_config()

    def _validate_config(self):
        """驗證設定檔必要欄位"""
        required = {
            'Core': ['Entry'],
            'Api': ['Key', 'Secret'],
            'Cert': ['Path'],
            'User': ['Account']
        }
        for section, keys in required.items():
            if section not in self.config:
                raise ValueError(f"設定檔缺少區段: [{section}]")
            for key in keys:
                if key not in self.config[section]:
                    raise ValueError(f"設定檔 [{section}] 缺少金鑰: {key}")

    def _prepare_credentials(self):
        """從設定檔讀取密碼並注入系統 Keyring，若無則提示輸入"""
        self.account_id = self.config['User']['Account']
        setup_keyring(self.account_id)
        
        # 1. 處理帳戶密碼 (Account Password)
        acc_pwd = self.config['User'].get('Password')
        if not acc_pwd:
            # 檢查 Keyring 是否已有
            if not keyring.get_password(TRADE_SDK_ACCOUNT_KEY, self.account_id):
                print(f"--- 帳戶密碼缺失 (帳號: {self.account_id}) ---")
                acc_pwd = getpass.getpass("請輸入您的玉山證券帳戶密碼: ")
                keyring.set_password(TRADE_SDK_ACCOUNT_KEY, self.account_id, acc_pwd)
        else:
            # 寫入 Keyring 供 SDK 使用
            keyring.set_password(TRADE_SDK_ACCOUNT_KEY, self.account_id, acc_pwd)
            logger.info("已從設定檔讀取帳戶密碼。")

        # 2. 處理憑證密碼 (Cert Password)
        cert_pwd = self.config['Cert'].get('Password')
        if not cert_pwd:
            if not keyring.get_password(TRADE_SDK_CERT_KEY, self.account_id):
                print(f"--- 憑證密碼缺失 (帳號: {self.account_id}) ---")
                cert_pwd = getpass.getpass("請輸入您的交易憑證密碼: ")
                keyring.set_password(TRADE_SDK_CERT_KEY, self.account_id, cert_pwd)
        else:
            keyring.set_password(TRADE_SDK_CERT_KEY, self.account_id, cert_pwd)
            logger.info("已從設定檔讀取憑證密碼。")

    def login(self):
        """執行 SDK 登入"""
        try:
            # 準備憑證
            self._prepare_credentials()
            
            # 初始化 SDK
            self.sdk = SDK(self.config)
            
            # SDK login 會自動調用 load_credentials 並從 Keyring 抓取
            self.sdk.login()
            logger.info("登入成功！")
            
        except Exception as e:
            logger.error(f"登入失敗: {e}")
            raise

    def download_inventory(self, output_dir: str = "inventory") -> None:
        """
        獲取庫存與餘額並整合儲存為單一 TOON 檔案
        """
        if not self.sdk:
            raise RuntimeError("請先執行 login()")

        try:
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)

            logger.info("正在抓取庫存資料...")
            inventories = self.sdk.get_inventories()
            
            # --- 銀行餘額與交割項處理 ---
            balance_data = self._fetch_balance()
            settlements = self.sdk.get_settlements()

            if not inventories and not balance_data and not settlements:
                logger.warning("目前帳戶無資料 (庫存、餘額與交割皆空)。")
                return

            # 整合資料結構
            consolidated_data = {
                "inventory": inventories or [],
                "balance": balance_data or {},
                "settlements": settlements or []
            }
            
            # 使用 TOON 格式保存整合資料
            toon_content = ToonConverter.to_toon(consolidated_data)
            
            # --- 去重/比對邏輯 ---
            # 尋找現有的最新 TOON 檔案 (YYYYMMDD.toon)
            existing_files = [f for f in output_path.glob("*.toon") if len(f.stem) == 8 and f.stem.isdigit()]
            latest_file = max(existing_files, key=lambda p: p.stat().st_mtime) if existing_files else None
            
            is_same = False
            if latest_file:
                try:
                    with open(latest_file, 'r', encoding='utf-8') as f:
                        old_content = f.read()
                    if toon_content.strip() == old_content.strip():
                        is_same = True
                except Exception as eval_e:
                    logger.error(f"比對過程中發生錯誤: {eval_e}")

            timestamp = datetime.now().strftime("%Y%m%d")
            if is_same and latest_file:
                # 資料相同，覆蓋舊檔（更新時間戳）
                with open(latest_file, 'w', encoding='utf-8') as f:
                    f.write(toon_content)
                logger.info(f"✨ 資料無變化 (Consolidated TOON)，已覆蓋更新原有檔案: {latest_file.name}")
            else:
                # 資料不同或無舊檔，建立新檔 (YYYYMMDD.toon)
                filename = f"{timestamp}.toon"
                new_path = output_path / filename
                with open(new_path, 'w', encoding='utf-8') as f:
                    f.write(toon_content)
                logger.info(f"🆕 資料有變動，已建立整合檔案: {new_path.name}")
            
            print(f"\n成功！庫存: {len(inventories) if inventories else 0} 筆, 餘額已更新。")
            
        except Exception as e:
            logger.error(f"下載或儲存失敗: {e}")
            raise

    def _fetch_balance(self) -> Optional[dict]:
        """獲取銀行餘額 (具備 180s 頻率限制處理)"""
        try:
            logger.info("正在獲取銀行餘額...")
            balance = self.sdk.get_balance()
            return balance
        except Exception as e:
            if "180" in str(e):
                logger.warning("銀行餘額查詢頻率過快 (180秒限制)，跳過本次查詢。")
            else:
                logger.error(f"獲取銀行餘額時發生錯誤: {e}")
            return None

if __name__ == "__main__":
    # 使用 uv 建議的執行方式或直接執行
    logger.info("🎬 啟動玉山證券庫存下載程序...")
    try:
        downloader = EsunInventoryDownloader()
        downloader.login()
        downloader.download_inventory("inventory")
        logger.info("✅ 程序順利完成。")
    except KeyboardInterrupt:
        logger.warning("⚠️ 使用者手動取消操作。")
    except Exception as e:
        logger.critical(f"💥 程式執行發生嚴重異常: {e}", exc_info=True)
