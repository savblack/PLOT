import { Component } from 'react';
import posthog from 'posthog-js';

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

  .plot-error-page {
    width: 100vw;
    min-height: 100vh;
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
    font-family: 'Instrument Serif', serif;
    font-size: 1.4rem;
    color: #1a1a1a;
    letter-spacing: -0.04em;
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
    background: #1a1a1a;
    color: white;
    border: none;
    padding: 0.75rem 2rem;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 100px;
    transition: opacity 0.2s;
    white-space: nowrap;
  }
  .plot-error-btn-primary:hover { opacity: 0.75; }

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
    background: #1a1a1a;
    overflow: hidden;
  }

  .plot-error-poster-grid {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 3px;
    opacity: 0.5;
  }

  .plot-error-poster-cell:nth-child(odd)  { background: #222; }
  .plot-error-poster-cell:nth-child(even) { background: #2a2a2a; }

  .plot-error-right-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to right, #1a1a1a 0%, transparent 60%);
    z-index: 1;
  }

  .plot-error-right-num {
    position: absolute;
    bottom: 2.5rem;
    left: 1.5rem;
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

function ErrorScreen({ code, title, body, primaryLabel, primaryAction, ghostLabel, ghostAction }) {
  return (
    <>
      <style>{styles}</style>
      <div className="plot-error-page">
        <div className="plot-error-left">
          <div className="plot-error-logo">Plot</div>
          <div className="plot-error-label">Error · {code}</div>
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
          <div className="plot-error-poster-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="plot-error-poster-cell" />
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
          title="Something went wrong."
          body="An unexpected error occurred. Try refreshing the page — if it keeps happening, something's broken on our end."
          primaryLabel="Refresh page"
          primaryAction={() => window.location.reload()}
          ghostLabel="Go home"
          ghostAction={() => { window.location.href = '/'; }}
        />
      );
    }
    return this.props.children;
  }
}

export { ErrorScreen };
