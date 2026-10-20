// One-time prompt after the first forward episode tick. The decision lives in
// @plot/core/episodeAlertsPrompt.js. Alerts are free. This does not open
// checkout or the calendar subscribe flow.
import { useMemo } from 'react';
import { EPISODE_ALERTS as T } from '@plot/core/copy/episodeAlerts.js';
import { COMMON } from '@plot/core/copy/common.js';
import { UNDO } from '@plot/core/copy/undo.js';
import {
  episodeAlertsPromptStorageKey,
  useEpisodeAlertsPromptActions,
  useEpisodeAlertsPromptController,
} from '@plot/core/episodeAlertsPrompt.js';
import { track, EVENTS } from '../lib/analytics.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import './UndoToast.css';

export default function EpisodeAlertsPrompt({ userId }) {
  const storage = useMemo(() => ({
    readSeen: async (id) => readStorage(episodeAlertsPromptStorageKey(id)) === '1',
    writeSeen: async (id) => { writeStorage(episodeAlertsPromptStorageKey(id), '1'); },
  }), []);
  useEpisodeAlertsPromptController(userId, storage);
  const { offer, busy, failed, accept, dismiss } = useEpisodeAlertsPromptActions(userId);

  if (!offer) return null;

  const turnOn = async () => {
    const result = await accept();
    if (result.ok) track(EVENTS.EPISODE_ALERTS_TOGGLED, { tmdb_id: result.tmdbId, on: true });
  };

  return (
    <div className={`undo-toast episode-alerts-prompt${failed ? ' undo-toast--error' : ''}`} role="status" aria-live="polite">
      <span className="undo-toast-message">{failed ? T.error : T.promptQuestion}</span>
      <button type="button" className="btn btn-secondary btn-sm undo-toast-action" disabled={busy} onClick={turnOn}>
        {busy ? COMMON.saving : T.promptAction}
      </button>
      <button type="button" className="undo-toast-close" aria-label={UNDO.dismiss} onClick={dismiss}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
