import { GENRES } from '../../constants';

export default function StepGenres({ selectedGenres, onToggleGenre }) {
  return (
    <div>
      <h1 className="onboarding-step-heading">What floats your boat?</h1>
      <p className="onboarding-step-sub">
        Tell us what you're into and we'll find something worth watching.
      </p>
      {selectedGenres.length > 0 && (
        <p className={`onboarding-hint${selectedGenres.length >= 3 ? ' met' : ''}`}>
          {selectedGenres.length >= 3 ? 'Nice taste! Select more or continue.' : 'Pick at least 3. The more the better.'}
        </p>
      )}
      <div className="onboarding-genre-grid">
        {GENRES.map(g => (
          <button
            key={g.key}
            className={`onboarding-toggle-card${selectedGenres.includes(g.key) ? ' selected' : ''}`}
            onClick={() => onToggleGenre(g.key)}
          >
            <span className="onboarding-card-label">{g.label}</span>
            <span className="onboarding-card-desc">{g.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
