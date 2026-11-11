import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SettingsSwitch } from '../components/SettingsPage.jsx';
import '../components/SettingsPage.css';

// A switch that saves the moment it is flipped shows a small "Saved" beside it
// once the change has landed (design audit pick 2.2 A). Each story stands in
// for one way a real setting behaves.
function Row({ outcome = 'saves', delay = 150, refetch = 250 }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const flip = () => {
    if (outcome === 'ignored') return; // e.g. the click opened an upgrade sheet
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (outcome === 'saves') setOn(v => !v);
      // Kids content, marketing emails and public profile: busy clears when
      // the save answers, and the switch only moves once the profile is
      // fetched again a moment later.
      if (outcome === 'savesThenRefetches') setTimeout(() => setOn(v => !v), refetch);
    }, delay);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: 360, padding: 16, background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 14 }}>
      <span>Kids content</span>
      <SettingsSwitch label="Kids content" checked={on} disabled={busy} onChange={flip} saves />
    </div>
  );
}

export default {
  title: 'Components/SettingsSwitch',
  tags: ['interaction-test'],
};

/** The save lands: the switch moves, and "Saved" shows beside it. */
export const SavesAndSaysSo = {
  render: () => <Row />,
  play: async ({ canvasElement }) => {
    const row = within(canvasElement);
    const control = row.getByRole('switch', { name: 'Kids content' });
    await expect(row.getByRole('status')).toHaveTextContent('');
    await userEvent.click(control);
    await waitFor(() => expect(row.getByRole('status')).toHaveTextContent('Saved'));
    await expect(control).toHaveAttribute('aria-checked', 'true');
  },
};

/**
 * The save lands, busy clears, and the switch only moves when the profile
 * comes back from a second fetch. "Saved" still shows.
 */
export const SavesThenRefetchesAndSaysSo = {
  render: () => <Row outcome="savesThenRefetches" />,
  play: async ({ canvasElement }) => {
    const row = within(canvasElement);
    const control = row.getByRole('switch', { name: 'Kids content' });
    await userEvent.click(control);
    await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(row.getByRole('status')).toHaveTextContent('Saved'));
  },
};

/** The save fails and the switch stays where it was: nothing claims "Saved". */
export const FailedSaveSaysNothing = {
  render: () => <Row outcome="fails" />,
  play: async ({ canvasElement }) => {
    const row = within(canvasElement);
    const control = row.getByRole('switch', { name: 'Kids content' });
    await userEvent.click(control);
    await waitFor(() => expect(control).toBeDisabled());
    await waitFor(() => expect(control).toBeEnabled());
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(row.getByRole('status')).toHaveTextContent('');
  },
};

/** A click that changes nothing (it opened an upgrade sheet): no "Saved". */
export const IgnoredClickSaysNothing = {
  render: () => <Row outcome="ignored" />,
  play: async ({ canvasElement }) => {
    const row = within(canvasElement);
    await userEvent.click(row.getByRole('switch', { name: 'Kids content' }));
    await new Promise(resolve => setTimeout(resolve, 400));
    await expect(row.getByRole('status')).toHaveTextContent('');
  },
};

/** A switch inside a form with its own Save takes no note at all. */
export const PlainSwitchHasNoNote = {
  render: () => <SettingsSwitch label="Hide watched" checked={false} onChange={() => {}} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('status')).toBeNull();
  },
};
