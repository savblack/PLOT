import datetime as dt
import os
import unittest
from unittest.mock import patch, Mock
from refresh import SNAPSHOT_CACHE_CONTROL, publish, refresh
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

    def test_public_snapshots_cache_until_the_next_import(self):
        self.assertEqual(SNAPSHOT_CACHE_CONTROL, 'max-age=21600')
        captured = {}
        def fake_urlopen(request, timeout=60):
            captured['cache-control'] = request.get_header('Cache-control')
            return Mock(__enter__=lambda s: Mock(status=200), __exit__=Mock(return_value=False))
        with patch.dict(os.environ, {'SUPABASE_URL': 'https://example.test', 'SUPABASE_SERVICE_ROLE_KEY': 'key'}):
            with patch('refresh.urllib.request.urlopen', fake_urlopen):
                publish({'region': 'Sydney'})
        self.assertEqual(captured['cache-control'], SNAPSHOT_CACHE_CONTROL)
