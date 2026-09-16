#!/usr/bin/env python3
"""Import a curated broadcast market into an atomic local snapshot. No API key."""
import argparse
import datetime as dt
import json
from pathlib import Path
from providers import IMPORTERS, build_snapshot

ROOT = Path(__file__).resolve().parents[2]

def main():
    markets = json.loads((ROOT / 'packages/core/broadcastMarkets.json').read_text())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('region', choices=[m['id'] for m in markets])
    args = parser.parse_args()
    market = next(m for m in markets if m['id'] == args.region)
    root = ROOT / '.guide-cache'
    root.mkdir(exist_ok=True)
    target = root / (args.region + '.json')
    now = dt.datetime.now(dt.timezone.utc)
    if target.exists() and now.timestamp() - target.stat().st_mtime < 21600:
        try:
            old = json.loads(target.read_text())
            if old.get('region') == args.region and old.get('schemaVersion') == 2 and old.get('channels') and old.get('programmes') and dt.datetime.fromisoformat(old['coverageEnd']) > now:
                print('Using recent snapshot:', target)
                return
        except (ValueError, KeyError, TypeError):
            pass
    channels, programmes = IMPORTERS[market['provider']](market, now)
    snapshot = build_snapshot(market, channels, programmes, now)
    # Only write after all requested channels/days have passed validation.
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(snapshot), encoding='utf-8')
    temp.replace(target)
    print(f"{args.region}: {len(channels)} channels, {len(snapshot['programmes'])} programmes. Saved {target}")

if __name__ == '__main__':
    main()
