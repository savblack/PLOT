import contextlib
import datetime as dt
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

    def _run_main(self, market, importer):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            core = root / 'packages' / 'core'
            core.mkdir(parents=True)
            (core / 'broadcastMarkets.json').write_text(json.dumps([market]))
            output = root / 'refresh-out'
            stdout, stderr = io.StringIO(), io.StringIO()
            argv = ['refresh.py', '--output', str(output)]
            code = 0
            with patch('refresh.ROOT', root), patch.dict('refresh.IMPORTERS', {market['provider']: importer}), \
                    patch('sys.argv', argv), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                try:
                    main()
                except SystemExit as error:
                    code = error.code if error.code is not None else 0
            health = json.loads((output / 'health.json').read_text())
            return code, stdout.getvalue(), stderr.getvalue(), health

    def test_mjh_missing_channel_warns_and_exits_zero(self):
        def importer(market, now):
            channels = [{'id': 'mjh-seven-hob', 'name': 'Seven'}, {'id': 'mjh-abc-hob', 'name': 'ABC'}]
            rows = [programme('mjh-abc-hob', 'News', now, now + dt.timedelta(hours=2))]
            return channels, rows
        market = {'id': 'Hobart', 'country': 'AU', 'provider': 'mjh', 'scope': 'capital'}
        code, stdout, stderr, health = self._run_main(market, importer)
        self.assertEqual(code, 0)
        self.assertIn('warning: Hobart snapshot is missing future programmes for 1 channel (mjh-seven-hob)', stderr)
        self.assertNotIn('warning:', stdout)
        self.assertEqual(health[0]['market'], 'Hobart')
        self.assertEqual(health[0]['ok'], True)
        self.assertEqual(health[0]['missingChannels'], 1)
        self.assertEqual([c['channelId'] for c in health[0]['channels']], ['mjh-seven-hob', 'mjh-abc-hob'])
        self.assertEqual([c['futureProgrammes'] for c in health[0]['channels']], [0, 1])
        self.assertIn('"ok": true', stdout)
        self.assertIn('"missingChannels": 1', stdout)

    def test_non_mjh_missing_channel_exits_nonzero(self):
        def importer(market, now):
            channels = [{'id': 'one', 'name': 'One'}, {'id': 'two', 'name': 'Two'}]
            rows = [programme('one', 'News', now, now + dt.timedelta(hours=2))]
            return channels, rows
        market = {'id': 'US-test', 'country': 'US', 'provider': 'tvpassport', 'scope': 'capital'}
        code, stdout, stderr, health = self._run_main(market, importer)
        self.assertEqual(code, 1)
        self.assertEqual(health, [{'market': 'US-test', 'ok': False, 'errorType': 'ValueError'}])
        self.assertNotIn('warning:', stderr)
        self.assertIn('"ok": false', stdout)
