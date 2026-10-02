import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { CastFollowCard, CrewFollowRow, FollowToastView, FollowPill } from '../components/PeopleFollow.jsx';
import { PEOPLE } from '@plot/core/copy/people.js';

// Fictional people with no headshots, so the placeholder circles render.
// Ids are negative on purpose: they are not TMDB ids (AGENTS.md: never guess one).
const cast = [
  { id: -1, name: 'Ada Quill', character: 'Mara Vell', profile_path: null },
  { id: -2, name: 'Ben Arlo', character: 'Tom Reyes', profile_path: null },
  { id: -3, name: 'Cy Moss', character: 'The Keeper', profile_path: null },
  { id: -4, name: 'Dot Hale', character: 'Iris', profile_path: null },
  { id: -5, name: 'Eli Park', character: 'Sam', profile_path: null },
];

function CastStrip({ initiallyFollowing = [-4] }) {
  const [following, setFollowing] = useState(new Set(initiallyFollowing));
  const toggle = (id) => setFollowing(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <div style={{ maxWidth: 560, padding: '1rem 1.25rem', background: 'var(--surface)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
      <section className="panel-cast-section">
        <div className="panel-section-title">Cast</div>
        <div className="panel-cast-rail">
          {cast.map(p => (
            <CastFollowCard key={p.id} person={p} following={following.has(p.id)} onOpen={() => {}} onToggle={() => toggle(p.id)} />
          ))}
        </div>
      </section>
      <section className="panel-cast-section">
        <div className="panel-section-title">{PEOPLE.directedBy}</div>
        <div className="crew-follow-list">
          <CrewFollowRow person={{ id: -9, name: 'Dee Vale', profile_path: null }} roleLabel={PEOPLE.director}
            following={following.has(-9)} onOpen={() => {}} onToggle={() => toggle(-9)} />
        </div>
      </section>
    </div>
  );
}

export default {
  title: 'People/Follow',
  parameters: { layout: 'padded' },
};

/** The title panel's Cast strip with the + badge (hover a face on desktop; always shown on phones) and the Directed by row. Dot Hale is followed. */
export const CastAndDirector = { render: () => <CastStrip /> };

/** Everyone followed: the accent tick is the one status cue on the strip. */
export const AllFollowed = { render: () => <CastStrip initiallyFollowing={[-1, -2, -3, -4, -5, -9]} /> };

/** Follow and Following, as on a person's page. */
export const FollowButtons = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <FollowPill following={false} name="Ada Quill" onClick={() => {}} />
      <FollowPill following name="Ada Quill" onClick={() => {}} />
      <span className="person-follow-note">{PEOPLE.explainer}</span>
    </div>
  ),
};

const toastArgs = { name: 'Ada Quill', profilePath: null, upcoming: 3, onView: () => {}, onDismiss: () => {} };
const toastFrame = (Story) => <div style={{ position: 'relative', minHeight: 140, transform: 'translateZ(0)' }}><Story /></div>;

/** Shipped: the follow toast in the same surface, shape and place as the undo and streak toasts. */
export const FollowToast = { render: () => <FollowToastView {...toastArgs} />, decorators: [toastFrame] };

/** For comparison only: the canvas's dark pill with the accent link. Not used in the app. */
export const FollowToastDarkAlternative = { render: () => <FollowToastView {...toastArgs} variant="dark" />, decorators: [toastFrame] };

/** The badge is its own button: following from it flips to the tick without opening the person. */
export const FollowFromBadge = {
  tags: ['interaction-test'],
  render: () => <CastStrip initiallyFollowing={[]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const badge = canvas.getByRole('button', { name: 'Follow Ada Quill' });
    await expect(badge).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(badge);
    await expect(canvas.getByRole('button', { name: 'Following Ada Quill. Unfollow' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'View Ada Quill' })).toBeInTheDocument();
  },
};
