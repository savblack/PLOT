import { SHARING } from '@plot/core/copy/sharing.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { COMMON } from '../copy/common.js';
import { tmdb } from '@plot/core/tmdb.js';
import { useEffect, useState } from 'react';
import { posterUrl } from '../utils/images.js';
import Spinner from './Spinner.jsx';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import { useStableClose } from '../hooks/useDialogClose.js';
import './SaveRecommendationPrompt.css';

// Web-only presentation: this is an authenticated handoff over the existing
// app shell, a dialog rather than a new route. The title is in the header
// with Cancel; the two choices stay beside the poster, Add to watchlist first
// and focused, so Enter saves.
export default function SaveRecommendationPrompt({ itemId, itemType, source, watchlist, onChooseList, onClose, onSaved }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const inWatchlist = watchlist.isInList(itemId);

  useEffect(() => {
    let cancelled = false;
    tmdb.getDetails(itemType, itemId)
      .then(({ ok, data }) => { if (!cancelled && ok) setDetails(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemId, itemType]);

  const close = useStableClose(onClose);

  const title = details?.title || details?.name || null;
  const year = (details?.release_date || details?.first_air_date || '').slice(0, 4);
  const poster = posterUrl(details?.poster_path, 'w185');

  const addToWatchlist = async () => {
    if (inWatchlist) { onClose(); return; }
    if (!details?.id || saving) return;
    setSaving(true);
    const added = await watchlist.addToList({
      ...details,
      media_type: itemType,
      genre_ids: Array.isArray(details.genres) ? details.genres.map(genre => genre.id) : [],
    }, { source: source || 'deep_link' });
    setSaving(false);
    if (added || watchlist.isInList(itemId)) {
      onSaved({ status: 'success', title: title || '', message: `Saved${title ? ` ${title}` : ''} to your watchlist` });
      onClose();
    }
  };

  return (
    <ResponsiveDialog title={SHARING.savePromptTitle(title)} onClose={close}>
      <div className="save-prompt">
        {loading ? <div className="save-prompt-loading"><Spinner /></div> : (
          <div className="save-prompt-content">
            {poster ? <img className="save-prompt-poster" src={poster} alt="" /> : <div className="save-prompt-poster save-prompt-poster-empty" />}
            <div className="save-prompt-copy">
              <p className="save-prompt-kicker">{SHARING.previewKicker(source)}</p>
              {year && <p className="save-prompt-year">{year}</p>}
              <p className="save-prompt-body">{SHARING.savePromptBody}</p>
              <div className="save-prompt-actions">
                <button type="button" className="btn btn-primary" onClick={addToWatchlist} disabled={saving || !details} autoFocus>
                  {inWatchlist ? MEDIA_PANEL.inWatchlist : saving ? COMMON.saving : MEDIA_PANEL.addToWatchlist}
                </button>
                <button type="button" className="btn btn-secondary" onClick={onChooseList}>{SHARING.chooseList}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
