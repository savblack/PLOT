// Development-only web rendering. Shared schedule logic and copy are ready for
// mobile; native rendering and account persistence are tracked in docs/guide/implementation.md.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { readBroadcastRegion } from '../utils/broadcastPreviewStorage.js';
import { GUIDE_REGIONS, guideDate, guideDay, guideAgenda, isOnNow, selectedGuideChannels } from '@plot/core/broadcastGuide.js';
import { useBroadcastGuide } from '@plot/core/useBroadcastGuide.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import './BroadcastGuidePreview.css';

function readSelection(region) {
  try {
    const saved = JSON.parse(localStorage.getItem(`plot-guide-preview:${region}`));
    return Array.isArray(saved) && saved.every(id => typeof id === 'string') ? saved : null;
  } catch { return null; }
}

export default function BroadcastGuidePreview() {
  const [region] = useState(readBroadcastRegion);
  const market = GUIDE_REGIONS.find(item => item.id === region);
  if (!market.provider) return <main className="broadcast-guide"><header className="broadcast-heading"><p>{COPY.countries[market.country]}</p><h1>{COPY.title}</h1></header><h2>{COPY.unsupported}</h2><p>{COPY.chooseArea}</p><Link to="/guide-settings-preview">{COPY.changeRegion}</Link></main>;
  return <GuideAgenda key={region} region={region} />;
}

function GuideAgenda({ region }) {
  const market = GUIDE_REGIONS.find(item => item.id === region);
  const timezone = market.timezone;
  const [now, setNow] = useState(Date.now);
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState('all');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState(() => readSelection(region));
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const dialog = useRef(null);
  const { data, error, loading } = useBroadcastGuide('/__guide-preview', region, revision);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  const today = guideDate(now, timezone);
  const date = guideDay(today, offset);
  const channels = data?.channels ?? [];
  const visibleChannels = selectedGuideChannels(channels, selection);
  const programmes = guideAgenda(data?.programmes ?? [], {
    date, timezone, channelIds: visibleChannels.map(c => c.id), now, mode,
  }).filter(p => !query || p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const channelById = new Map(channels.map(c => [c.id, c]));
  const time = stamp => {
    const instant = new Date(stamp);
    const clock = instant.toLocaleTimeString('en-AU', { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
    return guideDate(stamp, timezone) === date ? clock : `${instant.toLocaleDateString('en-AU', { timeZone: timezone, day: 'numeric', month: 'short' })} ${clock}`;
  };
  const label = (day, options) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-AU', { timeZone: 'UTC', ...options });
  const stale = data && (now - Date.parse(data.fetchedAt) > 24 * 60 * 60 * 1000 || Date.parse(data.coverageEnd) <= now);
  const channelsWithListings = new Set(guideAgenda(data?.programmes ?? [], { date, timezone, channelIds: visibleChannels.map(c => c.id), now, mode: 'all' }).map(p => p.channelId));
  const missingChannelCount = visibleChannels.filter(c => !channelsWithListings.has(c.id)).length;
  function apply() {
    setSelection(draft);
    try { localStorage.setItem(`plot-guide-preview:${region}`, JSON.stringify(draft)); } catch { /* Session selection still works when storage is unavailable. */ }
    setDraft(null);
  }
  return <main className="broadcast-guide">
    <header className="broadcast-heading"><p>{COPY.preview}</p><h1>{COPY.title}<span>.</span></h1><p>{COPY.subtitle}</p></header>
    <div className="broadcast-layout">
      <aside className="broadcast-sidebar">
        <div className="broadcast-side-title"><h2>{COPY.channels}</h2><span>{visibleChannels.length}/{channels.length}</span></div>
        {draft === null ? <>
          <button onClick={() => setDraft(visibleChannels.map(c => c.id))} disabled={!data}>{COPY.channels}</button>
          <div className="broadcast-channel-list">{visibleChannels.map(c => <div key={c.id}><span>{c.number ?? ""}</span><span>{c.name}</span></div>)}</div>
        </> : <fieldset className="broadcast-picker"><legend>{COPY.channels}</legend>
          <div className="broadcast-actions"><button onClick={() => setDraft(channels.map(c => c.id))}>{COPY.allChannels}</button><button onClick={() => setDraft([])}>{COPY.noChannels}</button></div>
          {channels.map(c => <label key={c.id}><input type="checkbox" checked={draft.includes(c.id)} onChange={event => setDraft(current => event.target.checked ? [...current, c.id] : current.filter(id => id !== c.id))} />{c.name}</label>)}
          <div className="broadcast-actions"><button className="broadcast-primary" onClick={apply}>{COPY.apply}</button><button onClick={() => setDraft(null)}>{COPY.cancel}</button></div>
        </fieldset>}
        <p className="broadcast-note">{COPY.previewNote}</p>
      </aside>
      <section className="broadcast-content" aria-label={COPY.title}>
        <div className="broadcast-region-link"><span>{market.name}</span> · <Link to="/guide-settings-preview">{COPY.changeRegion}</Link></div>
        <nav className="broadcast-days" aria-label={COPY.allDay}>{Array.from({ length: market.days }, (_, index) => {
          const day = guideDay(today, index);
          return <button key={day} aria-pressed={index === offset} onClick={() => { setOffset(index); setMode('all'); }}><span>{index === 0 ? COPY.today : label(day, { weekday: 'short' })}</span><strong>{label(day, { day: 'numeric' })}</strong></button>;
        })}</nav>
        <p className="broadcast-note">{COPY.coverage[market.scope]}</p>
        <div className="broadcast-toolbar"><div className="broadcast-actions"><button aria-pressed={mode === 'all'} onClick={() => setMode('all')}>{COPY.allDay}</button><button aria-pressed={mode === 'now'} onClick={() => { setMode('now'); setOffset(0); }}>{COPY.now}</button></div><input type="search" aria-label={COPY.search} placeholder={COPY.search} value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="broadcast-date"><h2>{label(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><span>{COPY.timezone} {timezone}</span></div>
        {(stale || ((error || data?.refreshFailed) && data)) && <p role="status" className="broadcast-notice">{error || data?.refreshFailed ? COPY.cached : COPY.stale} <button onClick={() => setRevision(value => value + 1)}>{COPY.retry}</button></p>}
        {data && missingChannelCount > 0 && <p className="broadcast-note" role="status">{COPY.missingChannels(missingChannelCount)}</p>}
        {loading ? <p role="status">{COPY.loading}</p> : !data ? <div className="broadcast-empty" role="status"><h3>{COPY.unavailable}</h3><p>{COPY.unavailableBody}</p><button onClick={() => setRevision(value => value + 1)}>{COPY.retry}</button></div> : !programmes.length ? <p className="broadcast-empty">{!visibleChannels.length ? COPY.noneSelected : COPY.empty}</p> : <div className="broadcast-programmes">{programmes.map(p => <button className="broadcast-row" key={p.id} onClick={() => setSelected(p)}>
          <time dateTime={p.start}>{time(p.start)}</time><span className="broadcast-programme"><strong>{p.title}</strong><span>{channelById.get(p.channelId)?.name} · {time(p.start)}–{time(p.end)}</span></span>{isOnNow(p, now) && <span className="broadcast-live">{COPY.now}</span>}<span aria-hidden="true">↗</span>
        </button>)}</div>}
        {data && <footer className="broadcast-note"><a href={data.sourceUrl || "https://i.mjh.nz/"} target="_blank" rel="noreferrer">{COPY.providerLabel}: {data.source}</a> · {COPY.updated} {new Date(data.fetchedAt).toLocaleString('en-AU', { timeZone: timezone })}</footer>}
      </section>
    </div>
    <dialog ref={dialog} className="broadcast-dialog" onClose={() => setSelected(null)}>
      {selected && <><button onClick={() => dialog.current.close()} aria-label={COPY.close}>×</button><p>{channelById.get(selected.channelId)?.name} · {time(selected.start)}–{time(selected.end)}</p><h2>{selected.title}</h2><p>{selected.description || COPY.noDescription}</p></>}
    </dialog>
  </main>;
}
