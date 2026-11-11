import { useState } from 'react';
import { expect, within } from 'storybook/test';
import FinishingTouchesCard from '../components/FinishingTouchesCard.jsx';
import { derivePremiumFirstWeek } from '@plot/core/premiumFirstWeek.js';
import { PREMIUM_FIRST_WEEK as T } from '@plot/core/copy/premiumFirstWeek.js';

// The card a new Premium member sees on Home for their first week. Render
// only: PremiumFirstWeek.jsx owns the data. Each story passes the facts the
// real card derives from the account.
function Card({ facts = {}, open = true }) {
  const [expanded, setExpanded] = useState(open);
  const { steps, doneCount, total, allDone } = derivePremiumFirstWeek({
    themeChosen: false, peopleCount: 0, togetherCount: 0, calendarOn: false, smartListCount: 0, ...facts,
  });
  const tiles = steps.map(step => {
    const copy = T.steps[step.id];
    const doneSub = typeof copy.doneSub === 'function' ? copy.doneSub(step.id === 'people' ? facts.peopleCount : facts.smartListCount) : copy.doneSub;
    return { id: step.id, done: step.done, title: copy.title, sub: step.done ? doneSub : copy.sub, cta: copy.cta };
  });
  return (
    <FinishingTouchesCard
      labels={T}
      tiles={tiles}
      doneCount={doneCount}
      total={total}
      allDone={allDone}
      expanded={expanded}
      onToggle={() => setExpanded(e => !e)}
      onHide={() => {}}
      onClose={() => {}}
      onAction={() => {}}
    />
  );
}

export default {
  title: 'Home/Your first week of Premium',
  parameters: { layout: 'fullscreen' },
  tags: ['interaction-test'],
  decorators: [(Story) => <div className="home-page" style={{ background: 'var(--bg)', padding: '1rem 0', maxWidth: 1020 }}><Story /></div>],
};

/** Straight after upgrading: nothing tried yet. */
export const JustUpgraded = {
  render: () => <Card />,
  play: async ({ canvasElement }) => {
    const card = within(canvasElement);
    await expect(card.getByRole('heading', { name: T.title })).toBeVisible();
    await expect(card.getByText('0 of 5')).toBeVisible();
    await expect(card.getAllByRole('button', { name: /Pick a theme|Find people|Invite|Subscribe|Make a list/ })).toHaveLength(5);
  },
};

/** A theme picked and two people followed: those two tick and lose their buttons. */
export const TwoDone = {
  render: () => <Card facts={{ themeChosen: true, peopleCount: 2 }} />,
  play: async ({ canvasElement }) => {
    const card = within(canvasElement);
    await expect(card.getByText('2 of 5')).toBeVisible();
    await expect(card.getByText('Following 2 people')).toBeVisible();
    await expect(card.queryByRole('button', { name: 'Pick a theme' })).toBeNull();
  },
};

export const Collapsed = { render: () => <Card open={false} /> };

/** Everything tried: the card becomes one line, closed for good with "Nice". */
export const AllDone = {
  render: () => <Card facts={{ themeChosen: true, peopleCount: 1, togetherCount: 1, calendarOn: true, smartListCount: 1 }} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { name: T.ready })).toBeVisible();
  },
};
