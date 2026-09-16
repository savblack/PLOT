#!/usr/bin/env python3
"""Refresh validated production snapshots. Local dry run unless --publish is explicit."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
import json
import os
from pathlib import Path
import urllib.request
import urllib.error
import time
from providers import IMPORTERS, build_snapshot

ROOT = Path(__file__).resolve().parents[2]


def wait_for_bucket():
    """A merge can start ingestion before Supabase has applied its migration."""
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    for attempt in range(24):
        request = urllib.request.Request(f'{base}/storage/v1/bucket/broadcast-guide',
                                         headers={'Authorization': f'Bearer {key}', 'apikey': key})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                metadata = json.load(response)
            if metadata.get('id') != 'broadcast-guide' or not metadata.get('public'):
                raise ValueError('Broadcast bucket is not ready')
            return
        except urllib.error.HTTPError as error:
            if error.code not in (400, 404) or attempt == 23:
                raise ValueError('Broadcast bucket unavailable') from None
            time.sleep(10)


def publish(snapshot):
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    request = urllib.request.Request(
        f"{base}/storage/v1/object/broadcast-guide/{snapshot['region']}.json",
        data=json.dumps(snapshot).encode(), method='POST',
        headers={'Authorization': f'Bearer {key}', 'apikey': key,
                 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=300'})
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status not in (200, 201):
            raise ValueError('Snapshot upload failed')


def refresh(market, publish_snapshot=None):
    now = dt.datetime.now(dt.timezone.utc)
    channels, rows = IMPORTERS[market['provider']](market, now)
    snapshot = build_snapshot(market, channels, rows, now)
    # Keep coverage visible per channel; zero listings must never look healthy.
    health = []
    for channel in channels:
        future = [p for p in snapshot['programmes'] if p['channelId'] == channel['id'] and dt.datetime.fromisoformat(p['end']) > now]
        ordered = sorted(future, key=lambda p: p['start'])
        gaps = overlaps = 0
        for left, right in zip(ordered, ordered[1:]):
            seconds = (dt.datetime.fromisoformat(right['start']) - dt.datetime.fromisoformat(left['end'])).total_seconds()
            gaps += seconds > 60
            overlaps += seconds < 0
        health.append({'gapsOverOneMinute': gaps, 'overlaps': overlaps, 'channelId': channel['id'], 'futureProgrammes': len(future),
                       'coverageEnd': max((p['end'] for p in future), default=None)})
    snapshot['channelHealth'] = health
    if publish_snapshot:
        publish_snapshot(snapshot)
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--region')
    parser.add_argument('--output', default='.guide-cache/refresh')
    args = parser.parse_args()
    markets = json.loads((ROOT / 'packages/core/broadcastMarkets.json').read_text())
    # Explicitly unavailable sources are not repeatedly hit or reported healthy.
    markets = [m for m in markets if m.get('provider') and m['scope'] != 'unavailable']
    if args.region:
        markets = [m for m in markets if m['id'] == args.region]
    if not markets:
        parser.error('No supported markets selected')
    if args.publish and not all(os.environ.get(k) for k in ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']):
        parser.error('Publishing requires server-side Supabase credentials')
    if args.publish:
        wait_for_bucket()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    results = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(refresh, m, publish if args.publish else None): m for m in markets}
        for future in as_completed(futures):
            market = futures[future]
            try:
                snapshot = future.result()
                (output / (market['id'] + '.json')).write_text(json.dumps(snapshot))
                missing = sum(c['futureProgrammes'] == 0 for c in snapshot['channelHealth'])
                result = {'market': market['id'], 'ok': True, 'missingChannels': missing,
                          'coverageEnd': snapshot['coverageEnd'], 'channels': snapshot['channelHealth']}
            except Exception as error:
                # Never log requests/headers or credentials. Failed refreshes do
                # not delete or overwrite the last successfully uploaded object.
                result = {'market': market['id'], 'ok': False, 'errorType': type(error).__name__}
            results.append(result)
            print(json.dumps({k: v for k, v in result.items() if k != 'channels'}))
    (output / 'health.json').write_text(json.dumps(results, indent=2))
    if any(not r['ok'] or r.get('missingChannels') for r in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
