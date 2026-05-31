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
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600&display=swap');

  .plot-error-page {
    width: 100vw;
    height: 100vh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: #f5f4f0;
    font-family: 'Manrope', system-ui, sans-serif;
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
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .plot-error-logo-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #E05578;
    flex-shrink: 0;
  }

  .plot-error-logo-text {
    font-family: 'Instrument Serif', serif;
    font-size: 1.1rem;
    letter-spacing: 0.04em;
    color: #1a1a1a;
  }

  .plot-error-label {
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #aaa;
    margin-bottom: 1.25rem;
  }

  .plot-error-number {
    font-family: 'Instrument Serif', serif;
    font-size: clamp(6rem, 12vw, 10rem);
    font-weight: 400;
    line-height: 0.9;
    color: #1a1a1a;
    letter-spacing: -0.04em;
    margin-bottom: 1.25rem;
  }

  .plot-error-title {
    font-family: 'Instrument Serif', serif;
    font-size: clamp(1.6rem, 2.8vw, 2.2rem);
    font-weight: 400;
    font-style: italic;
    color: #1a1a1a;
    line-height: 1.2;
    margin-bottom: 0.75rem;
  }

  .plot-error-divider {
    width: 32px;
    height: 1.5px;
    background: #E05578;
    margin: 1.25rem 0;
    border-radius: 2px;
  }

  .plot-error-body {
    font-size: 0.875rem;
    color: #888;
    line-height: 1.7;
    font-weight: 400;
    max-width: 300px;
    margin-bottom: 2rem;
  }

  .plot-error-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .plot-error-btn-primary {
    background: #E05578;
    color: #fff;
    border: none;
    padding: 0.7rem 1.75rem;
    font-family: 'Manrope', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border-radius: 100px;
    transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }
  .plot-error-btn-primary:hover {
    background: #ea6f8a;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(224,85,120,0.3);
  }

  .plot-error-btn-ghost {
    background: transparent;
    color: #999;
    border: 1px solid #d0d0d0;
    padding: 0.7rem 1.5rem;
    font-family: 'Manrope', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 100px;
    transition: border-color 0.2s, color 0.2s, transform 0.2s;
    white-space: nowrap;
  }
  .plot-error-btn-ghost:hover {
    border-color: #aaa;
    color: #555;
    transform: translateY(-1px);
  }

  .plot-error-right {
    position: relative;
    background: #0a0a0a;
    overflow: hidden;
    height: 100vh;
  }

  .plot-error-poster-track {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
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
    background: linear-gradient(to bottom, #0a0a0a 0%, transparent 18%, transparent 78%, #0a0a0a 100%),
                linear-gradient(to right, rgba(245,244,240,0.12) 0%, transparent 30%);
    z-index: 1;
    pointer-events: none;
  }

  .plot-error-right-num {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    font-family: 'Instrument Serif', serif;
    font-size: 9rem;
    font-weight: 400;
    color: rgba(255,255,255,0.06);
    line-height: 1;
    letter-spacing: -0.05em;
    pointer-events: none;
    white-space: nowrap;
  }

  @media (max-width: 700px) {
    .plot-error-page { grid-template-columns: 1fr; }
    .plot-error-right { display: none; }
    .plot-error-left { padding: 4rem 2rem 4rem 2rem; }
    .plot-error-logo { left: 2rem; }
  }
`;

function ErrorScreen({ code, label, title, body, primaryLabel, primaryAction, ghostLabel, ghostAction }) {
  return (
    <>
      <style>{styles}</style>
      <div className="plot-error-page">
        <div className="plot-error-left">
          <div className="plot-error-logo">
            <div className="plot-error-logo-dot" />
            <span className="plot-error-logo-text">Plot</span>
          </div>
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
          body="Luckily, there's a lot more worth watching."
          primaryLabel="Go home"
          primaryAction={() => { window.location.href = '/'; }}
          ghostLabel="Search titles"
          ghostAction={() => { window.location.href = '/search'; }}
        />
      );
    }
    return this.props.children;
  }
}

export { ErrorScreen };
