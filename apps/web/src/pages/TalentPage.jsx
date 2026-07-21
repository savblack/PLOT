import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { posterUrl, profileUrl, useApp } from '../App.jsx';
import { tmdb } from '../api/tmdb.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import './TalentPage.css';

function creditTitle(credit) {
  return credit.title || credit.name || 'Untitled';
}

function mediaType(credit) {
  return credit.media_type === 'tv' ? 'tv' : 'movie';
}

function creditMeta(credit, type) {
  const year = (credit.release_date || credit.first_air_date || '').slice(0, 4);
  return [year, type === 'tv' ? 'TV' : 'Movie'].filter(Boolean).join(' · ');
}

function creditDate(credit) {
  return credit.release_date || credit.first_air_date || '';
}

function shortBiography(biography) {
  if (!biography) return '';
  const cleanedBiography = biography.replace(
    /^([^\n(]{1,160})\s+\((?=[^)]*\b(?:born|née)\b)[^)]*\)\s*/i,
    '$1 ',
  ).trim();
  const sentences = cleanedBiography.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [];
  const preview = sentences.slice(0, 3).join('').trim();
  return preview || cleanedBiography;
}

function CreditsGrid({ credits, openPanel }) {
  if (!credits.length) return null;
  return (
    <div className="talent-credits-grid">
      {credits.map(credit => {
        const title = creditTitle(credit);
        const image = posterUrl(credit.poster_path, 'w185');
        const type = mediaType(credit);
        const role = credit.character || credit.roles?.[0]?.character;
        return (
          <button type="button" className="talent-credit" key={`${type}-${credit.id}`} onClick={() => openPanel(credit.id, type, 'talent_profile')}>
            <div className="talent-credit-poster">
              {image ? <img src={image} alt="" loading="lazy" /> : <span>{title}</span>}
            </div>
            <span className="talent-credit-title">{title}</span>
            {role && <span className="talent-credit-role">{role}</span>}
            <span className="talent-credit-meta">{creditMeta(credit, type)}</span>
          </button>
        );
      })}
    </div>
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

  const actingCredits = useMemo(() => {
    const seen = new Set();
    return (credits?.cast || [])
      .filter(credit => credit.id && (credit.media_type === 'movie' || credit.media_type === 'tv'))
      .sort((a, b) => creditDate(b).localeCompare(creditDate(a)) || (b.popularity || 0) - (a.popularity || 0))
      .filter(credit => {
        const key = `${credit.media_type}-${credit.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [credits]);

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
      <button type="button" className="talent-back" onClick={() => navigate(-1)}>Back</button>
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
