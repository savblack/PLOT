import './TasteOverlapPage.css';
import { useId, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useCompareCandidates } from '@plot/core/useTasteOverlap.js';
import { canCompare } from '@plot/core/tasteOverlap.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { TASTE_OVERLAP as T } from '../copy/tasteOverlap.js';

function detailFor(person) {
  if (person.is_public) return T.publicProfile;
  if (person.follow_status === 'accepted') return T.privateApproved;
  return T.privateProfile;
}

function PersonRow({ person }) {
  const name = person.display_name || person.username;
  return (
    <li className="to-pick-row">
      {person.avatar_url
        ? <img className="to-avatar to-avatar--lg" src={person.avatar_url} alt="" />
        : <span className="to-avatar to-avatar--lg" aria-hidden="true">{(name || '?').charAt(0).toUpperCase()}</span>}
      <span className="to-pick-text">
        <span className="to-pick-name">{name}</span>
        <span className="to-pick-detail">{detailFor(person)}</span>
      </span>
      {canCompare(person) ? (
        <Link className="btn btn-sm btn-primary" to={`/u/${person.username}/compare`} aria-label={`${T.compare}: ${name}`}>{T.compare}</Link>
      ) : person.follow_status === 'pending' ? (
        <span className="to-pill">{T.requestPending}</span>
      ) : (
        <Link className="btn btn-sm btn-secondary" to={`/u/${person.username}`}>{name}</Link>
      )}
    </li>
  );
}

export default function ComparePickerPage() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const searchId = useId();
  const { following, results, loadingFollowing, searching, isSearching } = useCompareCandidates(user?.id, query);

  if (!user) return <Navigate to="/login" replace />;

  const list = isSearching ? results : following;
  const busy = isSearching ? searching : loadingFollowing;

  return (
    <div className="to-view">
      <div className="to-top">
        <button type="button" className="to-icon-btn" aria-label={T.back} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/history'))}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      </div>

      <header className="to-header">
        <h1 className="to-h1">{T.pickerTitle}</h1>
        <p className="to-intro">{T.pickerIntro}</p>
      </header>

      <label htmlFor={searchId} className="to-visually-hidden">{T.searchLabel}</label>
      <div className="to-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input id={searchId} type="search" autoComplete="off" placeholder={T.searchPlaceholder} value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      <h2 className="to-group-label">{isSearching ? T.searchResults : T.peopleYouFollow}</h2>
      {busy ? (
        <div className="to-loading"><PlotLoader /></div>
      ) : list.length === 0 ? (
        <p className="to-empty">{isSearching ? T.noResults : T.followNobody}</p>
      ) : (
        <ul className="to-picks">
          {list.map(p => <PersonRow key={p.id} person={p} />)}
        </ul>
      )}

      <p className="to-privacy">{T.privacyNote}</p>
    </div>
  );
}
