import { Link, useParams } from 'react-router-dom';
import { HERO_POSTERS } from '../constants/heroPosters.js';

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap');

  .public-profile-page {
    display: flex;
    min-height: 100dvh;
    background: #ffffff;
    font-family: 'Manrope', system-ui, sans-serif;
    color: #1a1a1a;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  .public-profile-visual {
    position: relative;
    width: 45%;
    min-height: 100dvh;
    overflow: hidden;
    background: #0a0a0a;
    flex-shrink: 0;
  }

  .public-profile-poster-track {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    animation: publicProfileScroll 40s linear infinite;
    will-change: transform;
  }

  @keyframes publicProfileScroll {
    from { transform: translateY(0); }
    to   { transform: translateY(-50%); }
  }

  .public-profile-poster-cell {
    aspect-ratio: 2 / 3;
    background-size: cover;
    background-position: center;
    background-color: #1a1a1a;
  }

  .public-profile-visual-gradient {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to bottom, #0a0a0a 0%, transparent 20%, transparent 75%, #0a0a0a 100%);
    pointer-events: none;
  }

  .public-profile-visual-brand {
    position: absolute;
    bottom: 2.5rem;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    pointer-events: none;
  }

  .public-profile-logo-text {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 2rem;
    letter-spacing: -0.04em;
    color: #ffffff;
  }

  .public-profile-visual-tagline {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.45);
  }

  .public-profile-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background: #ffffff;
  }

  .public-profile-panel-logo {
    display: block;
    padding: clamp(1.25rem, 2.5vh, 2rem) 2.5rem;
    text-decoration: none;
    flex-shrink: 0;
  }

  .public-profile-panel-logo .public-profile-logo-text {
    color: #1a1a1a;
  }

  .public-profile-panel-logo:hover {
    opacity: 0.6;
  }

  .public-profile-panel-body {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2.5rem;
  }

  .public-profile-copy {
    width: 100%;
    max-width: 430px;
  }

  .public-profile-label {
    margin: 0 0 0.85rem;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7c7c7c;
  }

  .public-profile-title {
    margin: 0;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: clamp(2.4rem, 4.2vw, 3.25rem);
    font-weight: 500;
    letter-spacing: -0.04em;
    line-height: 0.96;
    color: #1a1a1a;
  }

  .public-profile-title em {
    font-style: italic;
    font-weight: 500;
  }

  .public-profile-body {
    margin: 0.85rem 0 0;
    font-size: 0.95rem;
    line-height: 1.7;
    color: #7b7b7b;
  }

  .public-profile-status-card {
    margin-top: 1.5rem;
    padding: 1rem 1rem 1.05rem;
    border: 1px solid #ece7e1;
    border-radius: 16px;
    background: #faf8f4;
  }

  .public-profile-status-kicker {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #9a7c56;
  }

  .public-profile-status-handle {
    margin: 0.45rem 0 0;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.6rem;
    font-weight: 500;
    letter-spacing: -0.03em;
    color: #1a1a1a;
    word-break: break-word;
  }

  .public-profile-status-copy {
    margin: 0.55rem 0 0;
    font-size: 0.88rem;
    line-height: 1.65;
    color: #6f655c;
  }

  .public-profile-actions {
    display: flex;
    gap: 0.8rem;
    flex-wrap: wrap;
    margin-top: 1.6rem;
  }

  .public-profile-button,
  .public-profile-button-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    padding: 0.85rem 1.4rem;
    border-radius: 999px;
    text-decoration: none;
    font-size: 0.94rem;
    font-weight: 600;
    transition: opacity 0.2s ease, transform 0.15s ease;
  }

  .public-profile-button {
    background: #1a1a1a;
    color: #ffffff;
    border: none;
  }

  .public-profile-button-secondary {
    background: transparent;
    color: #1a1a1a;
    border: 0.75px solid #1a1a1a;
  }

  .public-profile-button:hover,
  .public-profile-button-secondary:hover {
    opacity: 0.85;
    transform: scale(0.99);
  }

  .public-profile-note {
    margin-top: 1.25rem;
    font-size: 0.82rem;
    line-height: 1.65;
    color: #9a9a9a;
  }

  .public-profile-panel-footer {
    flex-shrink: 0;
    padding: clamp(1rem, 2vh, 1.5rem) 2rem;
    text-align: center;
    font-size: 0.75rem;
    color: #bbb;
  }

  .public-profile-panel-footer a {
    color: #999;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  @media (max-width: 768px) {
    .public-profile-visual { display: none; }
    .public-profile-panel-logo { padding: 1.75rem; }
    .public-profile-panel-body { padding: 0 1.75rem; }
    .public-profile-title { font-size: 2.35rem; }
  }

  @media (max-width: 480px) {
    .public-profile-panel-logo { padding: 1.5rem 1.25rem; }
    .public-profile-panel-body { padding: 0 1.25rem; }
    .public-profile-title { font-size: 2rem; }
    .public-profile-actions > * {
      width: 100%;
    }
  }
`;

export default function PublicProfilePage() {
  const { username = 'plot-user' } = useParams();
  const handle = username.startsWith('@') ? username : `@${username}`;
  const posters = [...HERO_POSTERS, ...HERO_POSTERS];

  return (
    <>
      <style>{styles}</style>
      <main className="public-profile-page">
        <div className="public-profile-visual" aria-hidden="true">
          <div className="public-profile-poster-track">
            {posters.map((src, i) => (
              <div key={i} className="public-profile-poster-cell" style={{ backgroundImage: `url('${src}')` }} />
            ))}
          </div>
          <div className="public-profile-visual-gradient" />
          <div className="public-profile-visual-brand">
            <span className="public-profile-logo-text">PLOT</span>
            <span className="public-profile-visual-tagline">Your film &amp; TV journal</span>
          </div>
        </div>

        <section className="public-profile-panel" aria-labelledby="public-profile-title">
          <Link to="/" className="public-profile-panel-logo">
            <span className="public-profile-logo-text">PLOT</span>
          </Link>

          <div className="public-profile-panel-body">
          <div className="public-profile-copy">
            <p className="public-profile-label">Profile route placeholder</p>
            <h1 id="public-profile-title" className="public-profile-title">
              PLOT <em>doesn&apos;t have profiles</em> yet.
            </h1>
            <p className="public-profile-body">
              There are no in-app user profiles or public profile pages in the product right now.
              This URL exists only so profile links resolve to a clear placeholder instead of a broken page.
            </p>
            <div className="public-profile-actions">
              <Link to="/signup" className="public-profile-button">Create an account</Link>
              <Link to="/login" className="public-profile-button-secondary">Sign in</Link>
            </div>
            <div className="public-profile-status-card" aria-label="Profile launch note">
              <p className="public-profile-status-kicker">Not in product</p>
              <p className="public-profile-status-handle">{handle}</p>
              <p className="public-profile-status-copy">
                This is a route-level placeholder, not a hidden profile. PLOT will need actual profile
                features before this URL can show anything user-specific.
              </p>
            </div>
            <p className="public-profile-note">
              If someone opens <strong>{handle}</strong>, they should land on this holding page until
              profiles are actually designed and built into the app.
            </p>
          </div>
          </div>

          <p className="public-profile-panel-footer">
            By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </section>
      </main>
    </>
  );
}
