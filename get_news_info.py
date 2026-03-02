import configparser
import json
import logging
import os
from typing import Any, Optional
from pathlib import Path
from esun_trade.sdk import SDK
from datetime import datetime
from utils import ToonConverter

def get_news_info():
    config = configparser.ConfigParser()
    config.read("config.ini")
    
    try:
        sdk = SDK(config)
        sdk.login()
        
        # 委託紀錄 (當日)
        orders = sdk.get_order_results()
        
        # 近期成交 (query_range='0' 代表當日)
        transactions = sdk.get_transactions(query_range='0')
        
        info = {
            "orders": orders if orders else [],
            "transactions": transactions if transactions else []
        }
        
        print(ToonConverter.to_toon(info))
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    get_news_info()

