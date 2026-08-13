from unittest.mock import MagicMock

from esun_inventory.cli.download_inventory import (
    DownloadInventoryCommand,
    fetch_balance,
    write_snapshot,
)
from esun_inventory.cli.home_info import HomeInfoCommand
from esun_inventory.cli.market_info import MarketInfoCommand
from esun_inventory.cli.news_info import NewsInfoCommand

# --- fetch_balance ---

def test_fetch_balance_success():
    sdk = MagicMock()
    sdk.get_balance.return_value = {"available_balance": 1000}
    assert fetch_balance(sdk) == {"available_balance": 1000}


def test_fetch_balance_rate_limit():
    sdk = MagicMock()
    sdk.get_balance.side_effect = Exception("超過180秒頻率限制")
    assert fetch_balance(sdk) is None


def test_fetch_balance_other_error():
    sdk = MagicMock()
    sdk.get_balance.side_effect = Exception("network error")
    assert fetch_balance(sdk) is None


# --- write_snapshot ---

def test_write_snapshot_creates_dated_file(tmp_path):
    write_snapshot("key: value", tmp_path)
    files = list(tmp_path.glob("*.toon"))
    assert len(files) == 1
    assert files[0].read_text(encoding="utf-8") == "key: value"


def test_write_snapshot_overwrites_same_day(tmp_path):
    write_snapshot("first", tmp_path)
    write_snapshot("second", tmp_path)
    files = list(tmp_path.glob("*.toon"))
    assert len(files) == 1
    assert files[0].read_text(encoding="utf-8") == "second"


# --- DownloadInventoryCommand ---

def test_download_inventory_execute(mocker, tmp_path, capsys):
    sdk = MagicMock()
    sdk.get_inventories.return_value = [{"stk_no": "2330"}]
    sdk.get_balance.return_value = {"available_balance": 5000}
    sdk.get_settlements.return_value = []

    cmd = DownloadInventoryCommand(output_dir=str(tmp_path))
    cmd.execute(sdk)

    captured = capsys.readouterr()
    assert "成功" in captured.out
    assert len(list(tmp_path.glob("*.toon"))) == 1


def test_download_inventory_empty(mocker, tmp_path, capsys):
    sdk = MagicMock()
    sdk.get_inventories.return_value = []
    sdk.get_balance.return_value = {}
    sdk.get_settlements.return_value = []
    mocker.patch("esun_inventory.cli.download_inventory.fetch_balance", return_value=None)

    cmd = DownloadInventoryCommand(output_dir=str(tmp_path))
    cmd.execute(sdk)

    assert len(list(tmp_path.glob("*.toon"))) == 0


# --- NewsInfoCommand ---

def test_news_info_execute():
    sdk = MagicMock()
    sdk.get_order_results.return_value = [{"order_id": "1"}]
    sdk.get_transactions.return_value = [{"tx_id": "2"}]

    result = NewsInfoCommand(query_range="0d").execute(sdk)

    assert result["orders"] == [{"order_id": "1"}]
    assert result["transactions"] == [{"tx_id": "2"}]
    sdk.get_transactions.assert_called_once_with(query_range="0d")


def test_news_info_empty_results():
    sdk = MagicMock()
    sdk.get_order_results.return_value = None
    sdk.get_transactions.return_value = None

    result = NewsInfoCommand().execute(sdk)
    assert result["orders"] == []
    assert result["transactions"] == []


def test_news_info_by_date_execute():
    sdk = MagicMock()
    sdk.get_order_results_by_date.return_value = [{"order_id": "3"}]
    sdk.get_transactions_by_date.return_value = [{"tx_id": "4"}]

    result = NewsInfoCommand(start="20260701", end="20260731").execute(sdk)

    assert result["orders"] == [{"order_id": "3"}]
    assert result["transactions"] == [{"tx_id": "4"}]
    sdk.get_order_results_by_date.assert_called_once_with("2026-07-01", "2026-07-31")
    sdk.get_transactions_by_date.assert_called_once_with("2026-07-01", "2026-07-31")
    sdk.get_order_results.assert_not_called()
    sdk.get_transactions.assert_not_called()


# --- HomeInfoCommand ---

def test_home_info_execute():
    sdk = MagicMock()
    sdk.certinfo.return_value = {"expiry": "2026-12-31"}
    sdk.get_key_info.return_value = {"status": "active"}
    sdk.get_trade_status.return_value = {"limit": 1000000}

    result = HomeInfoCommand().execute(sdk)

    assert result["cert"] == {"expiry": "2026-12-31"}
    assert result["key"] == {"status": "active"}
    assert result["trade_status"] == {"limit": 1000000}


# --- MarketInfoCommand ---

def test_market_info_execute():
    sdk = MagicMock()
    sdk.get_market_status.return_value = {
        "is_trading_day": True,
        "last_trading_day": "20260812",
        "next_trading_day": "20260814",
    }

    result = MarketInfoCommand().execute(sdk)

    assert result["is_trading_day"] is True
    assert result["last_trading_day"] == "20260812"
    assert result["next_trading_day"] == "20260814"
