// Dismissible Watch together card on Home. Rules live in
// @plot/core/watchTogetherHome.js. Mobile: components/WatchTogetherHomeCard.tsx.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WATCH_TOGETHER } from '@plot/core/copy/watchTogether.js';
import { APP_SHELL } from '@plot/core/copy/appShell.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import {
  WATCH_TOGETHER_HOME_DISMISSED,
  watchTogetherHomeDismissed,
  watchTogetherHomeKey,
  watchTogetherHomeVisible,
} from '@plot/core/watchTogetherHome.js';
import { SHOW_WATCH_TOGETHER } from '../launchFeatures.js';
import { useApp } from '../hooks/useApp.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import './WatchTogetherHomeCard.css';

export function WatchTogetherHomeCardView({ premium, onOpen, onDismiss }) {
  return (
    <div className="wt-home">
      <button type="button" className="wt-home-open" onClick={onOpen}>
        <span className="wt-home-row">
          <span className="wt-home-title">{WATCH_TOGETHER.navLabel}</span>
          {!premium && <span className="wt-home-pill">{APP_SHELL.premium}</span>}
        </span>
        <span className="wt-home-body">{WATCH_TOGETHER.start.pitchTitle}</span>
        {!premium && <span className="wt-home-note">{WATCH_TOGETHER.hub.lockedNote}</span>}
      </button>
      <button type="button" className="wt-home-dismiss" onClick={onDismiss}>
        {WATCH_TOGETHER.hub.dismiss}
      </button>
    </div>
  );
}

export default function WatchTogetherHomeCard() {
  const { user, profile } = useApp();
  const navigate = useNavigate();
  const userId = user?.id ?? null;
  const [dismissedFor, setDismissedFor] = useState(null);
  const dismissed = dismissedFor === userId || (userId ? watchTogetherHomeDismissed(readStorage(watchTogetherHomeKey(userId))) : false);

  if (!SHOW_WATCH_TOGETHER || !watchTogetherHomeVisible({ signedIn: !!userId, dismissed })) return null;

  const dismiss = () => {
    if (!userId) return;
    writeStorage(watchTogetherHomeKey(userId), WATCH_TOGETHER_HOME_DISMISSED);
    setDismissedFor(userId);
  };

  return (
    <WatchTogetherHomeCardView
      premium={isPremiumProfile(profile)}
      onOpen={() => navigate('/together')}
      onDismiss={dismiss}
    />
  );
}
