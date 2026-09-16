import datetime as dt
import unittest
from providers import parse_xmltv, parse_passport, parse_freeview, build_snapshot, programme

NOW = dt.datetime(2026, 9, 16, tzinfo=dt.timezone.utc)
CHANNELS = [{'id': 'one', 'name': 'Channel One'}]

class ProviderTests(unittest.TestCase):
    def test_xmltv_declaration_and_timezone(self):
        data = b'''<?xml version="1.0"?><!DOCTYPE tv SYSTEM "xmltv.dtd"><tv><programme channel="one" start="20260916120000 +1200" stop="20260916123000 +1200"><title>News &amp; weather</title></programme></tv>'''
        p = parse_xmltv(data, CHANNELS)[0]
        self.assertEqual(p['start'], '2026-09-16T00:00:00+00:00')
        self.assertEqual(p['title'], 'News & weather')
        with self.assertRaises(ValueError):
            parse_xmltv(b'<!DOCTYPE tv [<!ENTITY x "bad">]><tv/>', CHANNELS)

    def test_passport_uses_source_timezone_not_machine_timezone(self):
        html = '''<select id="timezone_selector"><option selected value="America/Los_Angeles">Pacific</option></select><div class="list-group-item" data-st="2026-09-16 23:30:00" data-duration="60" data-showname="Movie" data-episodetitle="An Example Film"></div>'''
        p = parse_passport(html, CHANNELS[0])[0]
        self.assertEqual(p['start'], '2026-09-17T06:30:00+00:00')
        self.assertEqual(p['end'], '2026-09-17T07:30:00+00:00')
        self.assertEqual(p['title'], 'An Example Film')
        with self.assertRaises(ValueError):
            parse_passport(html.replace('selected', ''), CHANNELS[0])
        with self.assertRaises(ValueError):
            parse_passport(html.replace('2026-09-16 23:30:00','2026-11-01 01:30:00'), CHANNELS[0])

    def test_freeview_requires_known_station_and_explicit_time(self):
        data = {'data': {'programs': [{'service_id': '123', 'events': [{'start_time': '2026-09-16T18:00:00Z', 'duration': 'PT1H30M', 'main_title': 'Evening film'}]}]}}
        p = parse_freeview(data, [{'id': 'one', 'siteId': '123'}])[0]
        self.assertEqual(p['end'], '2026-09-16T19:30:00+00:00')
        with self.assertRaises(ValueError):
            parse_freeview(data, [{'id': 'two', 'siteId': '456'}])

    def test_snapshot_refuses_expired_and_partial_station_refresh(self):
        market = {'id': 'US-test', 'country': 'US', 'provider': 'tvpassport'}
        p = programme('one', 'News', NOW, NOW + dt.timedelta(hours=1))
        snapshot = build_snapshot(market, CHANNELS, [p, p], NOW)
        self.assertEqual(len(snapshot['programmes']), 1)
        with self.assertRaises(ValueError):
            build_snapshot(market, CHANNELS, [p], NOW + dt.timedelta(days=1))
        with self.assertRaises(ValueError):
            build_snapshot(market, CHANNELS + [{'id': 'two', 'name': 'Two'}], [p], NOW)
        with self.assertRaises(ValueError):
            build_snapshot(market, CHANNELS, [p, {**p, 'title': 'Conflicting title'}], NOW)

if __name__ == '__main__':
    unittest.main()

class AtomicImportTests(unittest.TestCase):
    def test_failed_refresh_keeps_last_good_file(self):
        import importlib.util
        import json
        import os
        from pathlib import Path
        import tempfile
        from unittest.mock import patch
        spec = importlib.util.spec_from_file_location('guide_import', Path(__file__).with_name('import-feed.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'packages/core').mkdir(parents=True)
            (root / '.guide-cache').mkdir()
            market = {'id': 'test', 'country': 'US', 'provider': 'tvpassport'}
            (root / 'packages/core/broadcastMarkets.json').write_text(json.dumps([market]))
            cache = root / '.guide-cache/test.json'
            cache.write_text('last good snapshot')
            os.utime(cache, (0, 0))
            def fail(_market, _now):
                raise ValueError('Source failed')
            with patch.object(module, 'ROOT', root), patch.dict(module.IMPORTERS, {'tvpassport': fail}), patch('sys.argv', ['import-feed.py', 'test']):
                with self.assertRaises(ValueError):
                    module.main()
            self.assertEqual(cache.read_text(), 'last good snapshot')
