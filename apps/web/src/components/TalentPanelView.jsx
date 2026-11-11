// A person (cast or crew) as shown inside the panel. Used by the title panel
// when you tap a cast member, and by PersonPanel when a person is opened from
// anywhere else. Moved out of MediaPanel.jsx unchanged so both can draw it.
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { profileUrl } from '../utils/images.js';
import { dedupedActingCredits, shortBiography } from '../utils/talentCredits.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import CustomizeArtwork from './ArtworkSheet.jsx';
import { TalentWork } from './TalentCredits.jsx';
import { PersonFollow } from './PeopleFollow.jsx';

/* ── Talent (cast member) mini-profile shown inline within the panel ──
   Presentational only: the panel owns the fetch. Uses a portrait
   thumbnail rather than a full-bleed header image — a portrait crop
   stretched across a 16:9 backdrop zooms in on the face awkwardly. ── */
export default function TalentPanelView({ person, credits, error, onOpenTitle }) {
  const art = useUserArtwork();
  if (!person && !error) {
    return <div style={{ padding: '2rem 0', textAlign: 'center' }}><LoadingSpinner /></div>;
  }
  if (error) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '1rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Couldn't load this profile.</div>
      </div>
    );
  }

  const actingCredits = dedupedActingCredits(credits?.cast).slice(0, 12);
  const image = profileUrl(art.path('person', person.id, 'profile') || person.profile_path, 'h632');
  const knownFor = person.known_for_department || MEDIA_PANEL.talentFallback;
  const biographyPreview = shortBiography(person.biography);

  return (
    <div className="panel-talent-view">
      <header className="talent-header">
        <div className="talent-portrait">
          {image ? <img src={image} alt={person.name} /> : <span aria-hidden="true">{person.name?.charAt(0)}</span>}
        </div>
        <div>
          <div className="talent-kicker">{knownFor}</div>
          <h1>{person.name}</h1>
          {person.birthday && <p className="talent-birthday">Born {new Date(person.birthday).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
          <PersonFollow person={person} />
          <CustomizeArtwork mediaType="person" tmdbId={person.id} defaults={{ profile: person.profile_path }} />
        </div>
      </header>
      {person.biography && <p className="talent-biography">{biographyPreview}</p>}
      <TalentWork credits={credits} actingCredits={actingCredits} openPanel={onOpenTitle} emptyText="No screen credits available." />
    </div>
  );
}
