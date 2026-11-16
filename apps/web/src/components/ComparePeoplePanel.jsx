// The left column of Compare: search, then the people you can compare with,
// on the same card the other side columns use (.hist-card). It sits beside the
// sample comparison on /compare and beside the real one on
// /u/:username/compare, so changing person never leaves the page.
//
// Web only: a phone has no room for two columns, so mobile keeps the picker
// and the comparison as two screens (apps/mobile/app/(app)/compare.tsx). The
// people, the rules and the words all come from @plot/core.
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { useCompareCandidates } from '@plot/core/useTasteOverlap.js';
import { canCompare } from '@plot/core/tasteOverlap.js';
import { TASTE_OVERLAP as T } from '../copy/tasteOverlap.js';
import Avatar from './Avatar.jsx';
import EmptyState from './EmptyState.jsx';
import SearchField from './SearchField.jsx';

function PersonRow({ person, selected }) {
  const name = person.display_name || person.username;
  const comparable = canCompare(person);
  const pending = !comparable && person.follow_status === 'pending';
  const body = (
    <>
      <Avatar src={person.avatar_url} name={name} size={40} />
      <span className="to-pick-text">
        <span className="to-pick-name">{name}</span>
        <span className="to-pick-detail">@{person.username}</span>
      </span>
      {pending && <span className="to-pill">{T.requestPending}</span>}
      {!comparable && !pending && <span className="to-pill">{T.privateProfile}</span>}
      {selected && <span className="to-pick-dot" aria-hidden="true" />}
    </>
  );
  // A pending request has nowhere useful to go. A private profile you have
  // not asked to follow opens that profile, where the Request button is.
  if (pending) return <li><div className="to-pick-row">{body}</div></li>;
  return (
    <li>
      <Link
        className={`to-pick-row${selected ? ' is-selected' : ''}`}
        to={comparable ? `/u/${person.username}/compare` : `/u/${person.username}`}
        aria-current={selected ? 'true' : undefined}
        aria-label={comparable ? `${T.compare}: ${name}` : undefined}
      >
        {body}
      </Link>
    </li>
  );
}

const PeopleIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
    <circle cx="17.5" cy="9" r="2.5" /><path d="M17 14.6c2.4.2 4 1.8 4.5 4.4" />
  </svg>
);

/**
 * The card itself, from already-loaded people. Split from the panel so
 * Storybook can draw every state without a session.
 *
 * @param {object} props
 * @param {string} props.query
 * @param {(value: string) => void} props.onQuery
 * @param {any[]} props.people  the list to show: search results while searching, else who you follow
 * @param {boolean} props.busy
 * @param {boolean} props.isSearching
 * @param {string} [props.selectedUsername]  the person being compared with
 * @param {string} [props.className]  layout only
 */
export function ComparePeopleCard({ query, onQuery, people, busy, isSearching, selectedUsername, className = '' }) {
  const inputRef = useRef(null);
  return (
    <aside className={`to-side${className ? ` ${className}` : ''}`}>
      <div className="hist-card to-side-card">
        <SearchField inputRef={inputRef} placeholder={T.searchPlaceholder} ariaLabel={T.searchLabel} value={query} onChange={onQuery} />
        <h2 className="to-group-label">{isSearching ? T.searchResults : T.peopleYouFollow}</h2>
        {busy ? (
          <div className="to-loading"><PlotLoader /></div>
        ) : people.length === 0 ? (
          isSearching ? <EmptyState body={T.noResults} role="status" /> : (
            <EmptyState
              icon={PeopleIcon}
              title={T.followNobodyTitle}
              body={T.followNobody}
              action={<button type="button" className="btn btn-sm btn-secondary" onClick={() => inputRef.current?.focus()}>{T.searchLabel}</button>}
            />
          )
        ) : (
          <ul className="to-picks">
            {people.map(p => <PersonRow key={p.id} person={p} selected={!!selectedUsername && p.username === selectedUsername} />)}
          </ul>
        )}
        <p className="to-privacy">{T.privacyNote}</p>
      </div>
    </aside>
  );
}

/**
 * @param {object} props
 * @param {string | null | undefined} props.viewerId
 * @param {string} [props.selectedUsername]
 * @param {string} [props.className]
 */
export default function ComparePeoplePanel({ viewerId, selectedUsername, className }) {
  const [query, setQuery] = useState('');
  const { following, results, loadingFollowing, searching, isSearching } = useCompareCandidates(viewerId, query);
  return (
    <ComparePeopleCard
      query={query}
      onQuery={setQuery}
      people={isSearching ? results : following}
      busy={isSearching ? searching : loadingFollowing}
      isSearching={isSearching}
      selectedUsername={selectedUsername}
      className={className}
    />
  );
}
