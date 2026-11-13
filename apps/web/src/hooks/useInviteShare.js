import { useState } from 'react';
import { useApp } from './useApp.js';
import { personName, INVITE_SHARED_KEY } from '@plot/core/watchTogether.js';
import { useWatchTogetherLink, reportWatchTogether } from '@plot/core/useWatchTogether.js';
import { buildWatchTogetherLinkUrl, SHARE_ORIGIN } from '@plot/core/sharing.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { isPreviewDeployment } from '../utils/previewDeployment.js';
import { shareUrl } from '../utils/share.js';
import { readStorage, writeStorage } from '../utils/storage.js';

/** Links point at the host you're on for previews (they use Staging's data). */
function linkOrigin() {
  return isPreviewDeployment() && typeof window !== 'undefined' ? window.location.origin : SHARE_ORIGIN;
}

/** The signed-in person's reusable invite link, with Share and Copy. */
export function useInviteShare() {
  const { user, profile } = useApp();
  const { key } = useWatchTogetherLink(user?.id);
  const [copied, setCopied] = useState(false);
  // When the link last went out, so the hub can say "Waiting for someone to join".
  const [sharedAt, setSharedAt] = useState(() => readStorage(INVITE_SHARED_KEY) || null);
  const markShared = () => { const now = new Date().toISOString(); writeStorage(INVITE_SHARED_KEY, now); setSharedAt(now); };
  const url = buildWatchTogetherLinkUrl({ username: profile?.username || '', key: key || '', origin: linkOrigin() });
  const name = personName(profile || {});
  const display = url ? url.replace(/^https?:\/\//, '') : '';

  const share = async () => {
    if (!url) return;
    const result = await shareUrl({ url, title: T.link.previewTitle(name), text: T.link.shareText });
    if (result.ok) { reportWatchTogether('link_shared', { method: result.method }); markShared(); }
    if (result.ok && result.method === 'copy') setCopied(true);
  };
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); reportWatchTogether('link_shared', { method: 'copy' }); markShared(); } catch { /* clipboard blocked */ }
  };
  return { url, display, copied, share, copy, sharedAt };
}
