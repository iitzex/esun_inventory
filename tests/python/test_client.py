import configparser
import pytest
from pathlib import Path
from esun_inventory.client import EsunConfig, EsunClient

def test_esun_config_load(tmp_path):
    config_file = tmp_path / "config.ini"
    config_file.write_text("""
[Core]
Entry = test
[Api]
Key = k
Secret = s
[Cert]
Path = p
[User]
Account = a
Password = p
""", encoding="utf-8")
    
    config = EsunConfig.load(str(config_file))
    assert config.account == "a"
    assert config.get_password("User") == "p"

def test_esun_config_missing_section(tmp_path):
    config_file = tmp_path / "config.ini"
    config_file.write_text("""
[Core]
Entry = test
""", encoding="utf-8")
    
    with pytest.raises(ValueError, match="設定檔缺少區段"):
        EsunConfig.load(str(config_file))

def test_esun_client_prepare(mocker):
    mock_sdk = mocker.patch("esun_inventory.client.SDK")
    mock_keyring = mocker.patch("esun_inventory.client.keyring")
    mock_setup = mocker.patch("esun_inventory.client.setup_keyring")
    
    raw_config = configparser.ConfigParser()
    raw_config.read_dict({
        "User": {"Account": "test_acc", "Password": "pwd"},
        "Cert": {"Password": "cert_pwd"}
    })
    config = EsunConfig(raw_config=raw_config)
    client = EsunClient(config)
    
    client.prepare()
    
    mock_setup.assert_called_once_with("test_acc")
    assert mock_keyring.set_password.call_count == 2

def test_esun_client_login(mocker):
    mock_sdk_cls = mocker.patch("esun_inventory.client.SDK")
    mock_sdk_instance = mock_sdk_cls.return_value
    mocker.patch("esun_inventory.client.keyring.get_password", return_value="pwd")

    raw_config = configparser.ConfigParser()
    raw_config.read_dict({"User": {"Account": "test_acc"}})
    config = EsunConfig(raw_config=raw_config)
    client = EsunClient(config)

    sdk = client.login()

    mock_sdk_cls.assert_called_once()
    mock_sdk_instance.login.assert_called_once()
    assert sdk == mock_sdk_instance
    assert client.sdk == sdk


def test_esun_client_login_missing_password_no_tty(mocker):
    mock_sdk_cls = mocker.patch("esun_inventory.client.SDK")
    mocker.patch("esun_inventory.client.keyring.get_password", return_value=None)
    mocker.patch("esun_inventory.client.sys.stdin.isatty", return_value=False)

    raw_config = configparser.ConfigParser()
    raw_config.read_dict({"User": {"Account": "test_acc"}})
    config = EsunConfig(raw_config=raw_config)
    client = EsunClient(config)

    with pytest.raises(RuntimeError, match="無法互動輸入"):
        client.login()
    mock_sdk_cls.assert_not_called()
