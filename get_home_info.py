import configparser
import json
import logging
import os
from typing import Any, Optional
from pathlib import Path
from esun_trade.sdk import SDK
from esun_trade.util import setup_keyring, TRADE_SDK_ACCOUNT_KEY, TRADE_SDK_CERT_KEY
import keyring
from datetime import datetime
from utils import ToonConverter, format_timestamp

def get_home_info():
    config = configparser.ConfigParser()
    config.read("config.ini")
    
    try:
        sdk = SDK(config)
        sdk.login()
        
        info = {
            "cert": sdk.certinfo(),
            "key": sdk.get_key_info(),
            "trade_status": sdk.get_trade_status()
        }
        
        print(ToonConverter.to_toon(info))
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    get_home_info()
