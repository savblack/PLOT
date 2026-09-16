"""Read-only source adapters. Only curated markets are requested; no stream URLs.
TV Passport and Freeview fields checked against iptv-org/epg adapters, 2026-09-16.
"""
import datetime as dt
import gzip
import io
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc
SOURCES = {
    'mjh': ('Matt Huisman', 'https://i.mjh.nz/'),
    'tvpassport': ('TV Passport', 'https://www.tvpassport.com/'),
    'freeview': ('Freeview', 'https://www.freeview.co.uk/tv-guide'),
}

def download(url):
    with urllib.request.urlopen(url, timeout=20) as response:
        data = response.read(20_000_001)
    if len(data) > 20_000_000:
        raise ValueError('Feed exceeds size limit')
    return data

def unpack(data):
    # Bound expansion before allocating a potentially huge decompressed body.
    with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:
        xml = stream.read(60_000_001)
    if len(xml) > 60_000_000:
        raise ValueError('Expanded feed exceeds size limit')
    return xml

def programme(channel_id, title, start, end, description=''):
    if start.tzinfo is None or end.tzinfo is None or end <= start or not title.strip():
        raise ValueError('Invalid programme interval or title')
    start = start.astimezone(UTC).isoformat()
    end = end.astimezone(UTC).isoformat()
    return dict(id=channel_id + ':' + start, channelId=channel_id, title=title.strip(),
                start=start, end=end, description=description)

def parse_xmltv(xml, channels):
    xml = xml.replace(b'<!DOCTYPE tv SYSTEM "xmltv.dtd">', b'')
    if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
        raise ValueError('Unsupported XML declarations')
    ids = {c['id'] for c in channels}
    rows = []
    for item in ET.fromstring(xml).findall('programme'):
        if item.get('channel') not in ids:
            continue
        start = dt.datetime.strptime(item.attrib['start'], '%Y%m%d%H%M%S %z')
        end = dt.datetime.strptime(item.attrib['stop'], '%Y%m%d%H%M%S %z')
        rows.append(programme(item.get('channel'), item.findtext('title') or '', start, end, item.findtext('desc') or ''))
    return rows

def import_mjh(market, now):
    base = 'https://i.mjh.nz/' + market['feedPath'] + '/'
    metadata = json.loads(download(base + 'tv.json'))
    channels = []
    for channel in metadata.values():
        number = str(channel.get('chno', ''))
        if not (number.isdigit() and 1 <= int(number) < 100):
            continue
        if market['country'] == 'AU' and channel.get('network') not in ['ABC', 'SBS', 'Seven', 'Nine', 'Ten']:
            continue
        channels.append(dict(id=channel['epg_id'], name=channel['name'], number=int(number), network=channel.get('network')))
    channels.sort(key=lambda c: (c['number'], c['name']))
    return channels, parse_xmltv(unpack(download(base + 'epg.xml.gz')), channels)

class PassportHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.timezone_select = False
        self.timezone = None
        self.rows = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'select' and attrs.get('id') == 'timezone_selector':
            self.timezone_select = True
        if tag == 'option' and self.timezone_select and 'selected' in attrs:
            self.timezone = attrs.get('value')
        if 'list-group-item' in attrs.get('class', '').split() and 'data-st' in attrs:
            self.rows.append(attrs)
    def handle_endtag(self, tag):
        if tag == 'select':
            self.timezone_select = False

def parse_passport(html, channel):
    parser = PassportHTML()
    parser.feed(html)
    if not parser.timezone or not parser.rows:
        raise ValueError('Missing station timezone or programme rows')
    tz = ZoneInfo(parser.timezone)
    rows = []
    for row in parser.rows:
        wall = dt.datetime.strptime(row['data-st'], '%Y-%m-%d %H:%M:%S')
        start = wall.replace(tzinfo=tz)
        # Do not guess which repeated hour a programme belongs to at DST rollback.
        if start.utcoffset() != wall.replace(tzinfo=tz, fold=1).utcoffset():
            raise ValueError('Ambiguous or nonexistent source time')
        start = start.astimezone(UTC)
        duration = int(row['data-duration'])
        if not 0 < duration <= 1440:
            raise ValueError('Invalid programme duration')
        title = row.get('data-showname', '')
        if title in ['Movie', 'Cinéma']:
            title = row.get('data-episodetitle') or title
        rows.append(programme(channel['id'], title, start, start + dt.timedelta(minutes=duration), row.get('data-description', '')))
    return rows

def import_passport(market, now):
    # Include yesterday: station guide days often run from 06:00 to 06:00.
    today = now.astimezone(ZoneInfo(market['timezone'])).date()
    rows = []
    for channel in market['channels']:
        for offset in range(-1, market['days']):
            day = today + dt.timedelta(days=offset)
            url = f"https://www.tvpassport.com/tv-listings/stations/{channel['siteId']}/{day}"
            parsed = parse_passport(download(url).decode('utf-8'), channel)
            if not any(dt.datetime.fromisoformat(p['start']).astimezone(ZoneInfo(market['timezone'])).date() == day for p in parsed):
                if offset < 0:
                    continue  # Some stations do not retain yesterday. Never relabel it.
                raise ValueError(f"Wrong schedule date: {channel['siteId']} requested {day}, got {parsed[0]['start']}")
            rows.extend(parsed)
    return market['channels'], rows

def parse_freeview(data, channels):
    services = data.get('data', {}).get('programs')
    if not isinstance(services, list):
        raise ValueError('Missing Freeview services')
    by_id = {str(service['service_id']): service for service in services}
    rows = []
    for channel in channels:
        service = by_id.get(channel['siteId'])
        if not service or not service.get('events'):
            raise ValueError('Missing Freeview channel schedule')
        for event in service['events']:
            start = dt.datetime.fromisoformat(event['start_time'].replace('Z', '+00:00'))
            # Freeview uses ISO 8601 durations, e.g. PT30M.
            match = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', event['duration'])
            if not match:
                raise ValueError('Unsupported Freeview duration')
            hours, minutes, seconds = [int(v or 0) for v in match.groups()]
            rows.append(programme(channel['id'], event['main_title'], start, start + dt.timedelta(hours=hours, minutes=minutes, seconds=seconds)))
    return rows

def import_freeview(market, now):
    rows = []
    for offset in range(market['days']):
        day = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0) + dt.timedelta(days=offset)
        url = f"https://www.freeview.co.uk/api/tv-guide?nid={market['networkId']}&start={int(day.timestamp())}"
        rows.extend(parse_freeview(json.loads(download(url)), market['channels']))
    return market['channels'], rows

IMPORTERS = {'mjh': import_mjh, 'tvpassport': import_passport, 'freeview': import_freeview}

def build_snapshot(market, channels, rows, now):
    ids = {c['id'] for c in channels}
    if not channels or len(ids) != len(channels):
        raise ValueError('Invalid channel directory')
    unique = {}
    for p in rows:
        if p['channelId'] not in ids:
            raise ValueError('Orphan programme')
        if p['id'] in unique and unique[p['id']] != p:
            raise ValueError('Conflicting programme at the same instant')
        unique[p['id']] = p
    rows = sorted(unique.values(), key=lambda p: (p['start'], p['channelId']))
    future = [p for p in rows if dt.datetime.fromisoformat(p['end']) > now]
    if not future:
        raise ValueError('No usable future schedule; previous snapshot retained')
    # Station adapters require every curated station to have future listings.
    if market['provider'] != 'mjh' and {p['channelId'] for p in future} != ids:
        raise ValueError('Incomplete station refresh; previous snapshot retained')
    source, source_url = SOURCES[market['provider']]
    return dict(region=market['id'], country=market['country'], fetchedAt=now.isoformat(),
                source=source, sourceUrl=source_url, channels=channels, programmes=rows,
                coverageEnd=max(p['end'] for p in future), schemaVersion=2)
