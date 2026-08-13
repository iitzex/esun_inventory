from esun_inventory.cli.base import BaseCommand


class MockSDK:
    def get_info(self):
        return {"data": "test"}

class SuccessCommand(BaseCommand):
    def execute(self, sdk):
        return {"status": "ok"}

class NoneCommand(BaseCommand):
    def execute(self, sdk):
        return None

def test_base_command_logic(mocker, capsys):
    # Mock dependencies to avoid actual login/config load
    mocker.patch("esun_inventory.cli.base.EsunConfig.load")
    mock_client_cls = mocker.patch("esun_inventory.cli.base.EsunClient")
    mock_client = mock_client_cls.return_value
    mock_client.login.return_value = MockSDK()
    
    # Test command that returns data
    cmd = SuccessCommand()
    cmd._run()
    
    captured = capsys.readouterr()
    assert "status: ok" in captured.out
    
    # Test command that returns None (no output)
    cmd_none = NoneCommand()
    cmd_none._run()
    
    captured = capsys.readouterr()
    assert captured.out == ""

def test_base_command_prepare_called(mocker):
    mocker.patch("esun_inventory.cli.base.EsunConfig.load")
    mock_client_cls = mocker.patch("esun_inventory.cli.base.EsunClient")
    mock_client = mock_client_cls.return_value
    
    cmd = SuccessCommand(prepare=True)
    cmd._run()
    
    mock_client.prepare.assert_called_once()
