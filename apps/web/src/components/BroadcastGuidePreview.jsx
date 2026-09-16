// DOM renderer for the shared broadcast agenda. Native uses the same core view model.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { readBroadcastRegion } from '../utils/broadcastPreviewStorage.js';
import { GUIDE_REGIONS, guideDay, isOnNow, broadcastTime, broadcastDayLabel } from '@plot/core/broadcastGuide.js';
import { useBroadcastAgenda } from '@plot/core/useBroadcastAgenda.js';
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
  return <PreviewAgenda key={region} region={region} />;
}

function PreviewAgenda({ region }) {
  const [selection, setSelection] = useState(() => readSelection(region));
  const save = async (next) => {
    try { localStorage.setItem(`plot-guide-preview:${region}`, JSON.stringify(next)); }
    catch { return false; }
    setSelection(next);
    return true;
  };
  return <BroadcastAgenda region={region} selection={selection} onSave={save} endpoint="/__guide-preview" settingsPath="/guide-settings-preview" preview />;
}

export function BroadcastAgenda({ region, selection, onSave, saving = false, endpoint = '', settingsPath = '/settings?section=viewing', preview = false }) {
  const { market, timezone, now, today, date, offset, setOffset, mode, setMode, query, setQuery,
    data, error, loading, channels, visibleChannels, programmes, missingChannelCount, stale, retry } = useBroadcastAgenda(region, selection, endpoint);
  const [draft, setDraft] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [selected, setSelected] = useState(null);
  const dialog = useRef(null);
  useEffect(() => { if (selected) dialog.current?.showModal(); }, [selected]);
  const channelById = new Map(channels.map(c => [c.id, c]));
  const time = stamp => broadcastTime(stamp, date, timezone);
  const label = broadcastDayLabel;
  async function apply() {
    setSaveError(false);
    if (await onSave(draft)) setDraft(null);
    else setSaveError(true);
  }
  return <main className="broadcast-guide">
    <header className="broadcast-heading"><p>{preview ? COPY.preview : COPY.kicker}</p><h1>{COPY.title}<span>.</span></h1><p>{COPY.subtitle}</p></header>
    <div className="broadcast-layout">
      <aside className="broadcast-sidebar">
        <div className="broadcast-side-title"><h2>{COPY.channels}</h2><span>{visibleChannels.length}/{channels.length}</span></div>
        {draft === null ? <>
          <button onClick={() => setDraft(visibleChannels.map(c => c.id))} disabled={!data}>{COPY.channels}</button>
          <div className="broadcast-channel-list">{visibleChannels.map(c => <div key={c.id}><span>{c.number ?? ""}</span><span>{c.name}</span></div>)}</div>
        </> : <fieldset className="broadcast-picker" disabled={saving}><legend>{COPY.channels}</legend>
          <div className="broadcast-actions"><button onClick={() => setDraft(channels.map(c => c.id))}>{COPY.allChannels}</button><button onClick={() => setDraft([])}>{COPY.noChannels}</button></div>
          {channels.map(c => <label key={c.id}><input type="checkbox" checked={draft.includes(c.id)} onChange={event => setDraft(current => event.target.checked ? [...current, c.id] : current.filter(id => id !== c.id))} />{c.name}</label>)}
          <div className="broadcast-actions"><button className="broadcast-primary" onClick={apply}>{COPY.apply}</button><button onClick={() => setDraft(null)}>{COPY.cancel}</button></div>
        {saveError && <p role="alert">{COPY.saveError}</p>}
        </fieldset>}
        <p className="broadcast-note">{preview ? COPY.previewNote : COPY.accountNote}</p>
      </aside>
      <section className="broadcast-content" aria-label={COPY.title}>
        <div className="broadcast-region-link"><span>{market.name}</span> · <Link to={settingsPath}>{COPY.changeRegion}</Link></div>
        <nav className="broadcast-days" aria-label={COPY.allDay}>{Array.from({ length: market.days }, (_, index) => {
          const day = guideDay(today, index);
          return <button key={day} aria-pressed={index === offset} onClick={() => { setOffset(index); setMode('all'); }}><span>{index === 0 ? COPY.today : label(day, { weekday: 'short' })}</span><strong>{label(day, { day: 'numeric' })}</strong></button>;
        })}</nav>
        <p className="broadcast-note">{COPY.coverage[market.scope]}</p>
        <div className="broadcast-toolbar"><div className="broadcast-actions"><button aria-pressed={mode === 'all'} onClick={() => setMode('all')}>{COPY.allDay}</button><button aria-pressed={mode === 'now'} onClick={() => { setMode('now'); setOffset(0); }}>{COPY.now}</button></div><input type="search" aria-label={COPY.search} placeholder={COPY.search} value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="broadcast-date"><h2>{label(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><span>{COPY.timezone} {timezone}</span></div>
        {(stale || ((error || data?.refreshFailed) && data)) && <p role="status" className="broadcast-notice">{error || data?.refreshFailed ? COPY.cached : COPY.stale} <button onClick={retry}>{COPY.retry}</button></p>}
        {data && missingChannelCount > 0 && <p className="broadcast-note" role="status">{COPY.missingChannels(missingChannelCount)}</p>}
        {loading ? <p role="status">{COPY.loading}</p> : !data ? <div className="broadcast-empty" role="status"><h3>{COPY.unavailable}</h3><p>{COPY.unavailableBody}</p><button onClick={retry}>{COPY.retry}</button></div> : !programmes.length ? <p className="broadcast-empty">{!visibleChannels.length ? COPY.noneSelected : COPY.empty}</p> : <div className="broadcast-programmes">{programmes.map(p => <button className="broadcast-row" key={p.id} onClick={() => setSelected(p)}>
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
