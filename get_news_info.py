import configparser
import json
import logging
import os
import argparse
from typing import Any, Optional
from pathlib import Path
from esun_trade.sdk import SDK
from datetime import datetime
from utils import ToonConverter

def get_news_info(query_range: str = '0d'):
    config = configparser.ConfigParser()
    config.read("config.ini")
    
    # SDK transaction 預期 '0d', '3d', '1m', '3m'
    api_range = query_range
    
    try:
        sdk = SDK(config)
        sdk.login()
        
        # 委託紀錄 (當日)
        orders = sdk.get_order_results()
        
        # 近期成交 (query_range: '0'|'3'|'1m'|'3m')
        transactions = sdk.get_transactions(query_range=api_range)
        
        info = {
            "orders": orders if orders else [],
            "transactions": transactions if transactions else []
        }
        
        print(ToonConverter.to_toon(info))
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--range", type=str, default="0d", help="Time range (0d, 3d, 1m, 3m)")
    args = parser.parse_args()
    
    get_news_info(args.range)

