import datetime as dt
import unittest
from unittest.mock import patch, Mock
from refresh import refresh
from providers import programme

class RefreshTests(unittest.TestCase):
    def test_invalid_import_never_replaces_remote_snapshot(self):
        publish = Mock()
        market = {'id': 'Sydney', 'country': 'AU', 'provider': 'mjh'}
        with patch.dict('refresh.IMPORTERS', {'mjh': lambda m, n: ([], [])}):
            with self.assertRaises(ValueError):
                refresh(market, publish)
        publish.assert_not_called()

    def test_success_records_per_channel_coverage_before_upload(self):
        publish = Mock()
        market = {'id': 'Sydney', 'country': 'AU', 'provider': 'mjh'}
        def importer(market, now):
            return [{'id': 'abc', 'name': 'ABC'}], [programme('abc', 'News', now, now + dt.timedelta(hours=2))]
        with patch.dict('refresh.IMPORTERS', {'mjh': importer}):
            result = refresh(market, publish)
        self.assertEqual(result['channelHealth'][0]['futureProgrammes'], 1)
        publish.assert_called_once_with(result)
