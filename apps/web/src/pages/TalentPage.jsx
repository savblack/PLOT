import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { profileUrl } from '../utils/images.js';
import { tmdb } from '../api/tmdb.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import CreditsGrid from '../components/TalentCredits.jsx';
import { dedupedActingCredits, shortBiography } from '../utils/talentCredits.js';
import './TalentPage.css';

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

export default function TalentPage() {
  const { personId } = useParams();
  return <TalentPageContent key={personId} personId={personId} />;
}

function TalentPageContent({ personId }) {
  const navigate = useNavigate();
  const { openPanel } = useApp();
  const [person, setPerson] = useState(null);
  const [credits, setCredits] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([tmdb.getPersonDetails(personId), tmdb.getPersonCredits(personId)]).then(([details, work]) => {
      if (cancelled) return;
      if (!details || !work) { setError(true); return; }
      setPerson(details);
      setCredits(work);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [personId]);

  const actingCredits = useMemo(() => dedupedActingCredits(credits?.cast), [credits]);

  if (!person && !error) return <div className="talent-page talent-page--loading"><LoadingSpinner /></div>;
  if (error) return (
    <div className="talent-page talent-page--empty">
      <h1>Couldn’t load talent</h1>
      <p>Check your connection and try again.</p>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate(-1)}>Go back</button>
    </div>
  );

  const image = profileUrl(person.profile_path, 'h632');
  const knownFor = person.known_for_department || 'Talent';
  const biographyPreview = shortBiography(person.biography);
  return (
    <main className="talent-page">
      <button type="button" className="talent-back" onClick={() => navigate(-1)} aria-label="Back">
        <BackIcon />
      </button>
      <header className="talent-header">
        <div className="talent-portrait">
          {image ? <img src={image} alt={person.name} /> : <span aria-hidden="true">{person.name?.charAt(0)}</span>}
        </div>
        <div>
          <div className="talent-kicker">{knownFor}</div>
          <h1>{person.name}</h1>
          {person.birthday && <p className="talent-birthday">Born {new Date(person.birthday).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
        </div>
      </header>
      {person.biography && (
        <p className="talent-biography">{biographyPreview}</p>
      )}
      <section className="talent-section">
        <CreditsGrid credits={actingCredits} openPanel={openPanel} />
        {!actingCredits.length && <p className="talent-muted">No screen credits available.</p>}
      </section>
    </main>
  );
}
