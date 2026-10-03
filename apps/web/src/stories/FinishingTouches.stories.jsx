import { useState } from 'react';
import FinishingTouchesCard from '../components/FinishingTouchesCard.jsx';
import { FINISHING_TOUCHES as T } from '@plot/core/copy/finishingTouches.js';
import { favoriteWords } from '@plot/core/spelling.js';

const fav = favoriteWords('GB');
const tiles = (done = { watchlist: true }) => [
  { id: 'watchlist', done: !!done.watchlist, title: T.steps.watchlist.title, sub: T.steps.watchlist.sub(3) },
  { id: 'friends', done: !!done.friends, title: T.steps.friends.title, sub: done.friends ? T.steps.friends.doneSub(2) : T.steps.friends.sub, cta: T.steps.friends.cta },
  { id: 'import', done: !!done.import, title: T.steps.import.title, sub: done.import ? T.steps.import.doneSub : T.steps.import.sub, cta: T.steps.import.cta },
  { id: 'people', done: !!done.people, title: T.steps.people.title(fav.pluralLower), sub: done.people ? T.steps.people.doneSub('Ada Quill', 0) : T.steps.people.sub, cta: T.steps.people.cta },
];

function Card({ done, open = true }) {
  const [expanded, setExpanded] = useState(open);
  const list = tiles(done);
  const doneCount = list.filter(t => t.done).length;
  return (
    <FinishingTouchesCard
      tiles={list}
      doneCount={doneCount}
      total={list.length}
      allDone={doneCount === list.length}
      expanded={expanded}
      onToggle={() => setExpanded(e => !e)}
      onHide={() => {}}
      onClose={() => {}}
      onAction={() => {}}
    />
  );
}

export default {
  title: 'Home/Finishing touches',
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="home-page" style={{ background: 'var(--bg)', padding: '1rem 0', maxWidth: 1020 }}><Story /></div>],
};

/** Straight after onboarding: the watchlist step is already done (1 of 4). */
export const Open = { render: () => <Card /> };
/** Collapsed to one line (the default on phones). */
export const Collapsed = { render: () => <Card open={false} /> };
/** Three of four done: following people and an import that finished. */
export const HalfDone = { render: () => <Card done={{ watchlist: true, friends: true, import: true }} /> };
/** Everything done: the one-off "Your Plot is ready" moment. */
export const AllDone = { render: () => <Card done={{ watchlist: true, friends: true, import: true, people: true }} /> };
