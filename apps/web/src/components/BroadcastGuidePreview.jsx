// DOM renderer for the shared broadcast agenda. Native uses the same core view model.
// Layout is the Calendar/History shell: a narrow sticky column of cards on the
// left (week, my channels), the stream on the right. Option C from the 17 Sep
// 2026 Guide canvas: what's on now first, then the evening grouped by hour.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { readBroadcastRegion } from '../utils/broadcastPreviewStorage.js';
import { GUIDE_REGIONS, guideDay, isOnNow, broadcastTime, broadcastDayLabel, groupByHour, programmeProgress } from '@plot/core/broadcastGuide.js';
import { useBroadcastAgenda } from '@plot/core/useBroadcastAgenda.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import { FilterRow } from './SideFilters.jsx';
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

const SearchIcon = () => <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></svg>;
const ChevronRight = () => <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6" /></svg>;

/* The network's own logo when the feed supplies one, else a monogram tile. */
function ChannelMark({ channel, small = false }) {
  const [failed, setFailed] = useState(false);
  const name = channel?.name ?? '';
  const mono = /^\d/.test(name) ? name.split(' ')[0] : name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const cls = `guide-mark${small ? ' guide-mark--sm' : ''}`;
  if (channel?.logo && !failed) return <span className={`${cls} guide-mark--logo`}><img src={channel.logo} alt="" loading="lazy" onError={() => setFailed(true)} /></span>;
  return <span className={cls} aria-hidden="true">{mono}</span>;
}

function DayPicker({ market, today, offset, onPick }) {
  return <div className="guide-days" role="group" aria-label={COPY.week}>{Array.from({ length: market.days }, (_, index) => {
    const day = guideDay(today, index);
    return <button key={day} type="button" className={`guide-day${index === offset ? ' guide-day--on' : ''}`} aria-pressed={index === offset} onClick={() => onPick(index)}>
      <span>{index === 0 ? COPY.today : broadcastDayLabel(day, { weekday: 'short' })}</span><strong>{broadcastDayLabel(day, { day: 'numeric' })}</strong>
    </button>;
  })}</div>;
}

function ChannelsCard({ channels, visibleChannels, draft, setDraft, saving, saveError, onApply, onToggle, disabled }) {
  return <div className="hist-card guide-channels">
    <div className="hist-card-head guide-card-head">
      <span className="cal-filter-label">{COPY.channels}</span>
      <span className="hist-card-note">{COPY.of(visibleChannels.length, channels.length)}</span>
    </div>
    {draft === null ? <div>
      {visibleChannels.map(c => <FilterRow key={c.id} label={c.name} on onToggle={() => onToggle(c.id)} />)}
      <button type="button" className="cal-filter-row guide-edit-row" onClick={() => setDraft(visibleChannels.map(c => c.id))} disabled={disabled}>
        <span className="cal-filter-name">{COPY.editChannels}</span><span className="cal-filter-chev"><ChevronRight /></span>
      </button>
    </div> : <fieldset className="guide-picker" disabled={saving}>
      <legend>{COPY.channels}</legend>
      <div className="guide-picker-actions"><button type="button" className="btn btn-secondary btn-xs" onClick={() => setDraft(channels.map(c => c.id))}>{COPY.allChannels}</button><button type="button" className="btn btn-secondary btn-xs" onClick={() => setDraft([])}>{COPY.noChannels}</button></div>
      <div className="guide-picker-list">{channels.map(c => <FilterRow key={c.id} label={c.name} on={draft.includes(c.id)} onToggle={() => setDraft(current => current.includes(c.id) ? current.filter(id => id !== c.id) : [...current, c.id])} />)}</div>
      <div className="guide-picker-actions"><button type="button" className="btn btn-primary btn-sm" onClick={onApply}>{COPY.apply}</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>{COPY.cancel}</button></div>
      {saveError && <p role="alert" className="hist-card-note">{COPY.saveError}</p>}
    </fieldset>}
  </div>;
}

export function BroadcastAgenda({ region, selection, onSave, saving = false, endpoint = '', settingsPath = '/settings?section=viewing', preview = false }) {
  const { market, timezone, now, today, date, offset, setOffset, mode, setMode, query, setQuery,
    data, error, loading, channels, visibleChannels, programmes, missingChannelCount, stale, retry } = useBroadcastAgenda(region, selection, endpoint);
  const [draft, setDraft] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const dialog = useRef(null);
  useEffect(() => { if (selected) dialog.current?.showModal(); }, [selected]);
  const channelById = new Map(channels.map(c => [c.id, c]));
  const time = stamp => broadcastTime(stamp, date, timezone);
  async function persist(next) {
    setSaveError(false);
    if (await onSave(next)) return true;
    setSaveError(true);
    return false;
  }
  async function apply() { if (await persist(draft)) setDraft(null); }
  const toggleChannel = (id) => persist(visibleChannels.map(c => c.id).filter(cid => cid !== id));

  // On now leads only on today's page; other days are just the hour stream.
  const onNow = offset === 0 ? programmes.filter(p => isOnNow(p, now)) : [];
  const upcoming = mode === 'now' ? [] : (offset === 0 ? programmes.filter(p => Date.parse(p.end) > now && !isOnNow(p, now)) : programmes);
  const hours = groupByHour(upcoming, timezone);
  const dayTitle = broadcastDayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });

  const channelsCard = <ChannelsCard channels={channels} visibleChannels={visibleChannels} draft={draft} setDraft={setDraft} saving={saving}
    saveError={saveError} onApply={apply} onToggle={toggleChannel} disabled={!data} />;

  return <div className="hist-page guide-page">
    {preview && <header className="broadcast-heading"><h1>{COPY.title}</h1><p>{COPY.subtitle}</p></header>}
    <div className="hist-toolbar">
      <span className="hist-toolbar-sub">{market.name} · <Link to={settingsPath}>{COPY.changeRegion}</Link></span>
      <div className="hist-toolbar-controls">
        <div className="cal-scope" role="group" aria-label={COPY.title}>
          <button type="button" className={`cal-scope-btn${mode === 'all' ? ' active' : ''}`} aria-pressed={mode === 'all'} onClick={() => setMode('all')}>{COPY.allDay}</button>
          <button type="button" className={`cal-scope-btn${mode === 'now' ? ' active' : ''}`} aria-pressed={mode === 'now'} onClick={() => { setMode('now'); setOffset(0); }}>{COPY.now}</button>
        </div>
        <label className="hist-search guide-search"><SearchIcon /><input type="search" placeholder={COPY.search} aria-label={COPY.search} value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
    </div>

    <div className="cal-body">
      <aside className="cal-side guide-side">
        <div className="hist-card"><span className="cal-filter-label">{COPY.week}</span><DayPicker market={market} today={today} offset={offset} onPick={index => { setOffset(index); setMode('all'); }} /></div>
        {channelsCard}
        <p className="hist-card-note guide-note">{COPY.coverage[market.scope]} {COPY.timezone} {timezone}.</p>
        {preview && <p className="hist-card-note guide-note">{COPY.previewNote}</p>}
      </aside>

      <section className="cal-stream guide-stream" aria-label={COPY.title}>
        {/* Below the sidebar breakpoint the column is hidden, so its controls sit here. */}
        <div className="guide-mobile-bar">
          <DayPicker market={market} today={today} offset={offset} onPick={index => { setOffset(index); setMode('all'); }} />
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={channelsOpen} onClick={() => setChannelsOpen(v => !v)}>{channelsOpen ? COPY.done : COPY.channelsCount(visibleChannels.length)}</button>
          {channelsOpen && channelsCard}
        </div>

        {(stale || ((error || data?.refreshFailed) && data)) && <p role="status" className="hist-card-note guide-notice">{error || data?.refreshFailed ? COPY.cached : COPY.stale} <button type="button" className="btn btn-secondary btn-xs" onClick={retry}>{COPY.retry}</button></p>}
        {loading ? <p role="status" className="hist-card-note">{COPY.loading}</p>
          : !data ? <div className="empty-state"><div className="empty-title">{COPY.unavailable}</div><div className="empty-body">{COPY.unavailableBody}</div><button type="button" className="btn btn-secondary btn-sm" onClick={retry}>{COPY.retry}</button></div>
          : !visibleChannels.length ? <div className="empty-state"><div className="empty-body">{COPY.noneSelected}</div></div>
          : <>
            {offset === 0 && <>
              <div className="cal-stream-month"><h2 className="cal-stream-month-name">{COPY.now}</h2><span className="cal-stream-month-count">{time(now)}</span></div>
              {onNow.length
                ? <div className="guide-now-grid">{onNow.map(p => { const c = channelById.get(p.channelId); return <button type="button" className="guide-now-card interactive-surface" key={p.id} onClick={() => setSelected(p)}>
                    <span className="guide-now-head"><span className="guide-now-channel"><ChannelMark channel={c} small /><span>{c?.name}</span></span><span className="hist-card-note guide-now-ends">{COPY.ends(time(p.end))}</span></span>
                    <span className="guide-now-title">{p.title}</span>
                    <span className="guide-bar" aria-hidden="true"><i style={{ width: `${Math.round(programmeProgress(p, now) * 100)}%` }} /></span>
                    <span className="hist-card-note guide-now-ends guide-now-ends--below">{COPY.ends(time(p.end))}</span>
                  </button>; })}</div>
                : <p className="hist-card-note guide-notice">{COPY.nothingOnNow}</p>}
            </>}
            {mode === 'all' && <>
              <div className={`cal-stream-month${offset === 0 ? ' guide-upcoming-head' : ''}`}><h2 className="cal-stream-month-name">{offset === 0 ? COPY.comingUp : dayTitle}</h2><span className="cal-stream-month-count">{offset === 0 ? dayTitle : `${upcoming.length}`}</span></div>
              {!hours.length && <p className="hist-card-note guide-notice">{COPY.empty}</p>}
              {hours.map(group => <div className="cal-stream-day" key={group.key}>
                <div className="cal-stream-gutter"><span className="cal-stream-num guide-hour">{group.label}</span></div>
                <div className="cal-stream-rows">
                  {group.items.map(p => { const c = channelById.get(p.channelId); return <button type="button" className="guide-row interactive-surface" key={p.id} onClick={() => setSelected(p)}>
                    <ChannelMark channel={c} />
                    <span className="guide-row-text"><strong>{p.title}</strong><span>{c?.name} · {time(p.start)}–{time(p.end)}</span></span>
                  </button>; })}
                </div>
              </div>)}
            </>}
          </>}
        {data && missingChannelCount > 0 && <p className="hist-card-note guide-note guide-missing-notice" role="status">{COPY.missingChannels(missingChannelCount)}</p>}
      </section>
    </div>

    <dialog ref={dialog} className="broadcast-dialog" onClose={() => setSelected(null)}>
      {selected && <><button type="button" className="btn btn-secondary btn-xs" onClick={() => dialog.current.close()} aria-label={COPY.close}>×</button><p className="hist-card-note"><ChannelMark channel={channelById.get(selected.channelId)} small /> {channelById.get(selected.channelId)?.name} · {time(selected.start)}–{time(selected.end)}</p><h2>{selected.title}</h2><p>{selected.description || COPY.noDescription}</p></>}
    </dialog>
  </div>;
}
