import { Link, useParams } from 'react-router-dom';

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700&display=swap');

  .public-profile-page {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 2rem;
    background:
      radial-gradient(circle at top left, rgba(224, 85, 120, 0.14), transparent 28rem),
      radial-gradient(circle at bottom right, rgba(22, 25, 34, 0.12), transparent 24rem),
      linear-gradient(180deg, #f7f3ec 0%, #f1ece3 100%);
    font-family: 'Manrope', system-ui, sans-serif;
    color: #181512;
  }

  .public-profile-shell {
    width: min(100%, 66rem);
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(16rem, 0.72fr);
    border: 1px solid rgba(24, 21, 18, 0.08);
    border-radius: 2rem;
    overflow: hidden;
    background: rgba(255, 251, 245, 0.82);
    box-shadow: 0 24px 80px rgba(24, 21, 18, 0.09);
    backdrop-filter: blur(18px);
  }

  .public-profile-copy {
    padding: clamp(2rem, 5vw, 4.5rem);
  }

  .public-profile-label {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    margin: 0 0 1.4rem;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7a6b60;
  }

  .public-profile-label::before {
    content: '';
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    background: #e05578;
  }

  .public-profile-title {
    margin: 0;
    font-family: 'Instrument Serif', serif;
    font-size: clamp(2.4rem, 6vw, 4.5rem);
    font-weight: 400;
    line-height: 0.94;
    letter-spacing: -0.04em;
  }

  .public-profile-title em {
    font-style: italic;
  }

  .public-profile-body {
    max-width: 32rem;
    margin: 1.4rem 0 0;
    font-size: 1rem;
    line-height: 1.75;
    color: #5d534b;
  }

  .public-profile-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    margin-top: 2rem;
  }

  .public-profile-button,
  .public-profile-button-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.9rem;
    padding: 0.8rem 1.25rem;
    border-radius: 999px;
    text-decoration: none;
    font-size: 0.92rem;
    font-weight: 700;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }

  .public-profile-button {
    background: #181512;
    color: #fff9f2;
    box-shadow: 0 14px 30px rgba(24, 21, 18, 0.14);
  }

  .public-profile-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 18px 34px rgba(24, 21, 18, 0.18);
  }

  .public-profile-button-secondary {
    border: 1px solid rgba(24, 21, 18, 0.12);
    color: #3b312a;
    background: rgba(255, 255, 255, 0.66);
  }

  .public-profile-button-secondary:hover {
    transform: translateY(-1px);
    border-color: rgba(24, 21, 18, 0.24);
  }

  .public-profile-note {
    margin-top: 2rem;
    font-size: 0.84rem;
    line-height: 1.7;
    color: #786c63;
  }

  .public-profile-card {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-height: 100%;
    padding: clamp(1.6rem, 4vw, 2.6rem);
    background:
      linear-gradient(180deg, rgba(24, 21, 18, 0.1) 0%, rgba(24, 21, 18, 0.8) 100%),
      linear-gradient(140deg, #e8856a 0%, #df5f7f 46%, #2e3144 100%);
    color: #fff7ef;
  }

  .public-profile-badge {
    width: fit-content;
    padding: 0.55rem 0.85rem;
    border: 1px solid rgba(255, 247, 239, 0.2);
    border-radius: 999px;
    background: rgba(255, 247, 239, 0.08);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .public-profile-handle {
    margin: 1rem 0 0;
    font-family: 'Instrument Serif', serif;
    font-size: clamp(2rem, 5vw, 3.2rem);
    font-weight: 400;
    line-height: 1;
    letter-spacing: -0.04em;
    word-break: break-word;
  }

  .public-profile-card-copy {
    max-width: 17rem;
    margin: 0.9rem 0 0;
    font-size: 0.92rem;
    line-height: 1.7;
    color: rgba(255, 247, 239, 0.82);
  }

  @media (max-width: 760px) {
    .public-profile-page {
      padding: 1rem;
    }

    .public-profile-shell {
      grid-template-columns: 1fr;
      border-radius: 1.5rem;
    }

    .public-profile-card {
      min-height: 15rem;
    }
  }
`;

export default function PublicProfilePage() {
  const { username = 'plot-user' } = useParams();
  const handle = username.startsWith('@') ? username : `@${username}`;

  return (
    <>
      <style>{styles}</style>
      <main className="public-profile-page">
        <section className="public-profile-shell" aria-labelledby="public-profile-title">
          <div className="public-profile-copy">
            <p className="public-profile-label">Public profile status</p>
            <h1 id="public-profile-title" className="public-profile-title">
              Public profiles <em>aren&apos;t live</em> yet.
            </h1>
            <p className="public-profile-body">
              PLOT&apos;s first public release keeps accounts private while we finish the visibility,
              moderation, and sharing controls needed for a real profile launch.
            </p>
            <div className="public-profile-actions">
              <Link to="/signup" className="public-profile-button">Create an account</Link>
              <Link to="/login" className="public-profile-button-secondary">Sign in</Link>
            </div>
            <p className="public-profile-note">
              The handle <strong>{handle}</strong> is reserved for a future public profile experience.
              Until that ships, shared profile links intentionally land on this holding page instead of a
              broken or misleading route.
            </p>
          </div>
          <aside className="public-profile-card" aria-label="Profile launch note">
            <div className="public-profile-badge">Coming later</div>
            <p className="public-profile-handle">{handle}</p>
            <p className="public-profile-card-copy">
              When sharing launches, this page will be replaced with a real public profile that respects
              account privacy and content visibility rules.
            </p>
          </aside>
        </section>
      </main>
    </>
  );
}
