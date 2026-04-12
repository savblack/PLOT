import { Component } from 'react';
import posthog from 'posthog-js';

const POSTERS = [
  '/website-images/hero/challengers.webp',
  '/website-images/hero/past-lives.jpg',
  '/website-images/hero/saltburn.jpg',
  '/website-images/hero/gone-girl.jpg',
  '/website-images/hero/aftersun.jpg',
  '/website-images/hero/clueless.jpg',
  '/website-images/hero/the-summer-i-turned-pretty.jpg',
  '/website-images/hero/love-story.webp',
  '/website-images/hero/the-vampire-diaries.jpeg',
  '/website-images/hero/nosferatu.jpg',
  '/website-images/hero/scream.jpg',
  '/website-images/hero/the-white-lotus.jpg',
  '/website-images/hero/housemaid.jpg',
  '/website-images/hero/anniversary.jpg',
  '/website-images/hero/devil-wears-prada-two.jpg',
  '/website-images/hero/oppenheimer.webp',
  '/website-images/hero/squid-game-2.jpg',
  '/website-images/hero/the-bear.jpg',
  '/website-images/hero/the-wolf-of-wall-street.png',
  '/website-images/hero/parasite.jpg',
  '/website-images/hero/the-substance.avif',
];

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

  .plot-error-page {
    width: 100vw;
    height: 100vh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: #f5f4f0;
    font-family: 'DM Sans', sans-serif;
    overflow: hidden;
  }

  .plot-error-left {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 5rem 4rem 5rem 6rem;
    position: relative;
    z-index: 2;
  }

  .plot-error-logo {
    position: absolute;
    top: 2.5rem;
    left: 6rem;
    font-family: 'Poiret One', sans-serif;
    font-size: 1.4rem;
    color: #1a1a1a;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .plot-error-label {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.62rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #999;
    margin-bottom: 2rem;
  }

  .plot-error-number {
    font-family: 'Instrument Serif', serif;
    font-size: clamp(6rem, 12vw, 10rem);
    font-weight: 400;
    line-height: 0.9;
    color: #1a1a1a;
    letter-spacing: -0.04em;
    margin-bottom: 1.5rem;
  }

  .plot-error-title {
    font-family: 'Instrument Serif', serif;
    font-size: clamp(1.8rem, 3vw, 2.4rem);
    font-weight: 400;
    font-style: italic;
    color: #1a1a1a;
    line-height: 1.2;
    margin-bottom: 1rem;
  }

  .plot-error-divider {
    width: 40px;
    height: 1px;
    background: #ccc;
    margin: 1.5rem 0;
  }

  .plot-error-body {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.88rem;
    color: #888;
    line-height: 1.75;
    font-weight: 300;
    max-width: 320px;
    margin-bottom: 2.5rem;
  }

  .plot-error-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .plot-error-btn-primary {
    background: transparent;
    color: #1a1a1a;
    border: 1px solid #1a1a1a;
    padding: 0.75rem 2rem;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 100px;
    transition: background 0.2s, color 0.2s;
    white-space: nowrap;
  }
  .plot-error-btn-primary:hover { background: #1a1a1a; color: white; }

  .plot-error-btn-ghost {
    background: transparent;
    color: #999;
    border: 1px solid #d5d5d5;
    padding: 0.75rem 1.8rem;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    cursor: pointer;
    border-radius: 100px;
    transition: border-color 0.2s, color 0.2s;
    white-space: nowrap;
  }
  .plot-error-btn-ghost:hover { border-color: #aaa; color: #555; }

  .plot-error-right {
    position: relative;
    background: #0a0a0a;
    overflow: hidden;
    height: 100vh;
  }

  .plot-error-poster-track {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    animation: plotErrorScroll 40s linear infinite;
    will-change: transform;
  }

  @keyframes plotErrorScroll {
    from { transform: translateY(0); }
    to   { transform: translateY(-50%); }
  }

  .plot-error-poster-cell {
    aspect-ratio: 2 / 3;
    background-size: cover;
    background-position: center;
    background-color: #1a1a1a;
  }

  .plot-error-right-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, #0a0a0a 0%, transparent 20%, transparent 75%, #0a0a0a 100%);
    z-index: 1;
    pointer-events: none;
  }

  .plot-error-right-num {
    position: absolute;
    bottom: 2.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    font-family: 'Instrument Serif', serif;
    font-size: 9rem;
    font-weight: 400;
    color: rgba(255,255,255,0.05);
    line-height: 1;
    letter-spacing: -0.05em;
    pointer-events: none;
  }

  @media (max-width: 700px) {
    .plot-error-page { grid-template-columns: 1fr; }
    .plot-error-right { display: none; }
    .plot-error-left { padding: 4rem 2rem; }
    .plot-error-logo { left: 2rem; }
  }
`;

function ErrorScreen({ code, label, title, body, primaryLabel, primaryAction, ghostLabel, ghostAction }) {
  return (
    <>
      <style>{styles}</style>
      <div className="plot-error-page">
        <div className="plot-error-left">
          <div className="plot-error-logo">PLOT</div>
          <div className="plot-error-label">Error · {label || code}</div>
          <div className="plot-error-number">{code}</div>
          <h1 className="plot-error-title">{title}</h1>
          <div className="plot-error-divider" />
          <p className="plot-error-body">{body}</p>
          <div className="plot-error-actions">
            <button className="plot-error-btn-primary" onClick={primaryAction}>{primaryLabel}</button>
            {ghostLabel && (
              <button className="plot-error-btn-ghost" onClick={ghostAction}>{ghostLabel}</button>
            )}
          </div>
        </div>
        <div className="plot-error-right">
          <div className="plot-error-poster-track">
            {[...POSTERS, ...POSTERS].map((src, i) => (
              <div key={i} className="plot-error-poster-cell" style={{ backgroundImage: `url(${src})` }} />
            ))}
          </div>
          <div className="plot-error-right-overlay" />
          <div className="plot-error-right-num">{code}</div>
        </div>
      </div>
    </>
  );
}

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Plot error:', error, info);
    posthog.captureException(error, { extra: info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen
          code="404"
          label="Page not found"
          title="Looks like we hit a plot hole."
          body="Even the best productions have outtakes. This one may have been deleted — try refreshing to get this scene back on track. In the meantime, there's a whole library waiting to be discovered."
          primaryLabel="Go home"
          primaryAction={() => { window.location.href = '/'; }}
          ghostLabel="Search titles"
          ghostAction={() => { window.location.href = '/app/home'; }}
        />
      );
    }
    return this.props.children;
  }
}

export { ErrorScreen };
