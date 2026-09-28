// Collaborative lists (PLO-525): the Invite people dialog a Premium list owner
// opens from a list's menu. The invite link lets anyone join for free; people
// you already watch together with can be added straight away. Rules and data
// live in @plot/core (listInvites.js, useListInvites.js). Mobile parity: not
// built yet; tracked in #1089.
import { useState } from 'react';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import { PersonAvatar } from './WatchTogetherParts.jsx';
import { useApp } from '../hooks/useApp.js';
import { useWatchTogether } from '@plot/core/useWatchTogether.js';
import { useListInvite, reportListInviteShared } from '@plot/core/useListInvites.js';
import { personName } from '@plot/core/watchTogether.js';
import { buildListInviteUrl, SHARE_ORIGIN } from '@plot/core/sharing.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COLLABORATIVE_LISTS as C } from '@plot/core/copy/collaborativeLists.js';
import { isPreviewDeployment } from '../utils/previewDeployment.js';
import { shareUrl } from '../utils/share.js';
import './WatchTogetherView.css';

/** Links point at the host you're on for previews (they use Staging's data). */
function linkOrigin() {
  return isPreviewDeployment() && typeof window !== 'undefined' ? window.location.origin : SHARE_ORIGIN;
}

/**
 * @param {{ list: { id: string, name: string, people?: { user_id: string }[] }, onClose: () => void }} props
 */
export function ListInviteDialog({ list, onClose }) {
  const { user, customLists } = useApp();
  const { key, code, reset } = useListInvite(list.id);
  const { partners } = useWatchTogether(user?.id);
  const [copied, setCopied] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [added, setAdded] = useState(() => new Set());
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const url = buildListInviteUrl({ key: key || '', origin: linkOrigin() });
  const display = url ? url.replace(/^https?:\/\//, '') : '';
  const onList = new Set((list.people || []).map(p => p.user_id));
  const candidates = partners.filter(p => !onList.has(p.other_id));
  const linkError = code ? (C.errors[code] || T.errors.generic) : null;

  const share = async () => {
    if (!url) return;
    const result = await shareUrl({ url, title: C.dialog.shareTitle(list.name), text: C.dialog.shareText });
    if (result.ok) reportListInviteShared(result.method);
    if (result.ok && result.method === 'copy') setCopied(true);
  };
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); reportListInviteShared('copy'); } catch { /* clipboard blocked */ }
  };
  const add = async (id) => {
    setError(null);
    if (await customLists.addMember(list.id, id)) setAdded(prev => new Set(prev).add(id));
    else setError(T.errors.generic);
  };

  return (
    <ResponsiveDialog title={C.invite} onClose={onClose}>
      <div className="wt-accept">
        <p className="wt-note">{C.dialog.body}</p>
        <div className="wt-settings-group">
          <span className="wt-accept-label">{T.link.kicker}</span>
          {linkError
            ? <p className="wt-error" role="alert">{linkError}</p>
            : (
              <div className="wt-linkrow">
                <span className="wt-linkurl">{display}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={copy} disabled={!url}>{copied ? T.link.copied : T.link.copy}</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={share} disabled={!url}>{T.link.share}</button>
              </div>
            )}
          {!linkError && (
            <div className="wt-person">
              <span className="wt-person-text"><span className="wt-note">{C.dialog.resetNote}</span></span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!key || resetDone}
                onClick={async () => { const r = await reset(); if (r.ok) { setResetDone(true); setCopied(false); } }}>{T.link.reset}</button>
            </div>
          )}
        </div>
        {candidates.length > 0 && (
          <div className="wt-settings-group">
            <span className="wt-accept-label">{C.dialog.partnersLabel}</span>
            <span className="wt-note">{C.dialog.partnersNote}</span>
            {candidates.map(p => (
              <div key={p.other_id} className="wt-row">
                <PersonAvatar person={p} />
                <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span></span>
                {added.has(p.other_id)
                  ? <span className="wt-chip wt-chip--ok">{T.sharedList.shared}</span>
                  : <button type="button" className="btn btn-primary btn-sm" onClick={() => add(p.other_id)}>{T.sharedList.add}</button>}
              </div>
            ))}
          </div>
        )}
        {error && <p className="wt-error" role="alert">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}
