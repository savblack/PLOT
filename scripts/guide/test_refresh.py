import datetime as dt
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock
from refresh import SNAPSHOT_CACHE_CONTROL, main, publish, refresh
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

    def test_missing_mjh_channel_warns_without_failing_successful_refresh(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'packages/core').mkdir(parents=True)
            (root / 'packages/core/broadcastMarkets.json').write_text(json.dumps([
                {'id': 'Hobart', 'provider': 'mjh', 'scope': 'capital'}]))
            snapshot = {'coverageEnd': '2026-10-21T04:00:00+00:00', 'channelHealth': [
                {'channelId': 'mjh-seven-hob', 'futureProgrammes': 0},
                {'channelId': 'mjh-abc-hob', 'futureProgrammes': 1}]}
            output = io.StringIO()
            with patch('refresh.ROOT', root), patch('refresh.refresh', return_value=snapshot), \
                    patch('sys.argv', ['refresh.py', '--output', str(root / 'output')]), redirect_stdout(output):
                main()
            report = json.loads((root / 'output/health.json').read_text())
            self.assertEqual(report[0]['missingChannels'], 1)
            self.assertIn('Warning: Hobart has no future programmes for: mjh-seven-hob', output.getvalue())

    def test_failed_market_still_fails_job(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'packages/core').mkdir(parents=True)
            (root / 'packages/core/broadcastMarkets.json').write_text(json.dumps([
                {'id': 'Hobart', 'provider': 'mjh', 'scope': 'capital'}]))
            with patch('refresh.ROOT', root), patch('refresh.refresh', side_effect=ValueError('No usable schedule')), \
                    patch('sys.argv', ['refresh.py', '--output', str(root / 'output')]), redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    main()
            self.assertEqual(error.exception.code, 1)
            report = json.loads((root / 'output/health.json').read_text())
            self.assertFalse(report[0]['ok'])
