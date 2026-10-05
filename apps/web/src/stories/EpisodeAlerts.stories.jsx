import { useState } from 'react';
import EpisodeAlertsView from '../components/EpisodeAlertsView.jsx';
import NoticeToast from '../components/NoticeToast.jsx';
import { emit, NOTICE_EVENT } from '@plot/core/events.js';
import { EPISODE_ALERTS as T } from '@plot/core/copy/episodeAlerts.js';

// A fictional show; no TMDB ids involved.
const next = { when: 'Fri 9 Oct', label: 'Season 5 premiere' };

function Card({ initialOn = true, isPremium = false, nextLine = next, menu = false }) {
  const [on, setOn] = useState(initialOn);
  return (
    <>
      <EpisodeAlertsView
        title="Slow Lane"
        on={on}
        ready
        busy={false}
        error={false}
        next={nextLine}
        isPremium={isPremium}
        defaultMenuOpen={menu}
        onToggle={() => { const nextOn = !on; setOn(nextOn); emit(NOTICE_EVENT, { message: nextOn ? T.toastOn('Slow Lane') : T.toastOff('Slow Lane') }); }}
        onSubscribe={() => {}}
        onDownload={() => {}}
      />
      <NoticeToast />
    </>
  );
}

export default {
  title: 'Panel/Episode alerts',
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ maxWidth: 520, paddingBottom: 220 }}><Story /></div>],
};

/** On: the next episode and Add to calendar show under the switch. */
export const On = { render: () => <Card /> };
/** Off for this show: only the switch. Turning it on shows the toast. */
export const Off = { render: () => <Card initialOn={false} /> };
/** The Add to calendar menu, as a Free account sees it (Subscribe is Premium). */
export const CalendarMenu = { render: () => <Card menu /> };
/** Nothing dated yet. */
export const NoNextEpisode = { render: () => <Card nextLine={null} /> };
