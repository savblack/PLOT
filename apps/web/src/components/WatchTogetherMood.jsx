// Watch together's mood step, at /together/decide/:username (Nov 21 2026).
// Before the cards: Movies or TV, any number of moods, and My services. Each
// chip shows how many shared titles it keeps, a chip that keeps none can't be
// picked, and when the choices together keep nothing, the card offers the one
// change that brings titles back. The deck is then only what fits
// (start_watch_together_session_filtered). Rules: @plot/core watchTogether.js,
// "The mood step". Mobile: apps/mobile/components/watch/WatchMood.tsx.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useWatchTogetherTitles, startWatchTogetherSession } from '@plot/core/useWatchTogether.js';
import {
  NO_MOOD, personName, moodsFor, filterByMood, moodCounts, moodFixes, toggleMoodChoice, setMoodKind,
} from '@plot/core/watchTogether.js';
import { pickerProviderIds } from '@plot/core/tonightPicker.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { TONIGHT_PICKER as TP } from '@plot/core/copy/tonightPicker.js';
import { COMMON } from '../copy/common.js';
import { PersonAvatar } from './WatchTogetherParts.jsx';
import BackLink from './BackLink.jsx';
import Chip, { ChipRow } from './Chip.jsx';
import EmptyState from './EmptyState.jsx';
import Segmented from './Segmented.jsx';
import PremiumGateButton from './PremiumGateButton.jsx';
import './WatchTogetherView.css';

const M = T.mood;

export default function WatchTogetherMood({ wt, username }) {
  const navigate = useNavigate();
  const { profile } = useApp();
  const partner = wt.partners.find(p => p.username === username);
  const { titles, loading, error } = useWatchTogetherTitles(partner ? [partner.other_id] : []);
  const providerIds = useMemo(() => pickerProviderIds(profile?.streaming_providers), [profile?.streaming_providers]);
  const [choice, setChoice] = useState(NO_MOOD);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const name = personName(partner || {});

  const back = <BackLink to="/together" label={T.hub.title} />;
  if (!wt.loading && !partner) return <div className="wt-page">{back}<p className="wt-note">{T.overlap.notPartners}</p></div>;
  if (!partner || (loading && !titles.length)) return <div className="wt-page"><p className="wt-note" role="status">{COMMON.loading}</p></div>;
  if (error === 'premium_required') {
    return (
      <div className="wt-page">
        {back}
        <section className="wt-card" role="status">
          <h2 className="wt-card-title">{T.locked.title}</h2>
          <p className="wt-card-body">{T.locked.body(name)}</p>
          <div><PremiumGateButton reason="watchTogether" /></div>
        </section>
      </div>
    );
  }
  if (error) return <div className="wt-page">{back}<p className="wt-note" role="alert">{T.errors[error] || T.errors.generic}</p></div>;
  if (!titles.length) return <div className="wt-page">{back}<EmptyState body={T.session.empty(name)} /></div>;

  const kept = filterByMood(titles, choice, providerIds);
  const counts = moodCounts(titles, choice, providerIds);
  const fixes = kept.length ? [] : moodFixes(titles, choice, providerIds);

  const chose = choice.kind !== 'all' || choice.moods.length > 0 || choice.services;
  const start = async (withMood) => {
    setStarting(true); setStartError(null);
    const result = await startWatchTogetherSession(partner.other_id,
      withMood && chose ? { choice, providerIds, deckSize: kept.length } : null);
    setStarting(false);
    if (result.ok) navigate(`/together/session/${result.data}`, { replace: true });
    else setStartError(T.errors[result.code] || T.errors.generic);
  };

  return (
    <div className="wt-page">
      {back}
      <div className="wt-who"><PersonAvatar person={partner} size="sm" /><span className="wt-note">{T.session.heading(name)}</span></div>
      <div className="wt-mood-head">
        <h2 className="discover-section-title">{TP.moodTitle}</h2>
        <p className="wt-note">{M.fromShared(titles.length)}</p>
      </div>

      <section className="wt-card wt-mood" aria-label={TP.moodTitle}>
        <div className="wt-mood-row">
          <span className="wt-mood-label" id="wt-mood-kind">{M.kindLabel}</span>
          <Segmented
            ariaLabel={M.kindLabel}
            options={[
              { value: 'all', label: T.hub.both },
              { value: 'movie', label: TP.chips.movies },
              { value: 'tv', label: TP.chips.shows },
            ]}
            value={choice.kind}
            onChange={(kind) => setChoice(c => setMoodKind(c, kind))}
          />
        </div>
        <div className="wt-mood-row">
          <span className="wt-mood-label" id="wt-mood-moods">{M.moodLabel}</span>
          <ChipRow role="group" aria-labelledby="wt-mood-moods">
            {moodsFor(choice.kind).map(m => {
              const on = choice.moods.includes(m);
              return (
                <Chip key={m} size="sm" label={TP.chips.moods[m]} count={counts[m] ?? 0} selected={on}
                  disabled={!on && !counts[m]} onClick={() => setChoice(c => toggleMoodChoice(c, m))} />
              );
            })}
          </ChipRow>
        </div>
        {providerIds.length > 0 && (
          <div className="wt-mood-row">
            <span className="wt-mood-label" id="wt-mood-where">{M.whereLabel}</span>
            <ChipRow role="group" aria-labelledby="wt-mood-where">
              <Chip size="sm" label={TP.summary.services} selected={choice.services}
                onClick={() => setChoice(c => ({ ...c, services: !c.services }))} />
            </ChipRow>
          </div>
        )}
      </section>

      {kept.length === 0 && (
        <section className="wt-card" role="status">
          <h2 className="wt-card-title">{M.noneTitle}</h2>
          <p className="wt-card-body">{M.noneBody}</p>
          <div className="wt-mood-fixes">
            {fixes.map(f => (
              <button key={f.change} type="button" className="wt-mood-fix interactive-surface" onClick={() => setChoice(f.choice)}>
                <span>{M.fixes[f.change]}</span>
                <span className="wt-note">{M.fixCount(f.count)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {startError && <p className="wt-error" role="alert">{startError}</p>}
      <div className="wt-mood-actions">
        <button type="button" className="btn btn-primary" disabled={!kept.length || starting} onClick={() => start(true)}>{M.start(kept.length)}</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={starting} onClick={() => start(false)}>{M.skip(titles.length)}</button>
      </div>
    </div>
  );
}
