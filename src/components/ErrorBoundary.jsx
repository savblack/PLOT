import { Component } from 'react';
import { captureException } from '../lib/analytics.js';
import { isChunkError, RELOAD_KEY } from '../utils/chunkError.js';
import PlotLogo from './PlotLogo.jsx';

// Dark, centered, minimal error design — matches the marketing site's
// website/404.html so the app and theplot.tv share one error aesthetic.
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Instrument+Serif:ital@0;1&display=swap');

  .plot-error-page {
    min-height: 100vh;
    min-height: 100dvh;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 1.5rem;
    padding: 2rem;
    background: #0c0c0c;
    color: #f0efe8;
    font-family: 'DM Sans', system-ui, sans-serif;
  }

  .plot-error-logo-image {
    font-size: 2.4rem;
    display: block;
  }

  .plot-error-number {
    font-family: 'Instrument Serif', Georgia, serif;
    font-size: clamp(4rem, 18vw, 8rem);
    font-weight: 400;
    line-height: 0.9;
    letter-spacing: -0.04em;
  }

  .plot-error-title {
    font-size: 1.35rem;
    font-weight: 300;
    line-height: 1.3;
    margin: 0;
  }

  .plot-error-body {
    font-size: 0.95rem;
    font-weight: 300;
    color: rgba(240, 239, 232, 0.55);
    max-width: 26rem;
    line-height: 1.5;
    margin: 0;
  }

  .plot-error-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .plot-error-btn-primary {
    background: #f0efe8;
    color: #0c0c0c;
    border: none;
    padding: 0.7rem 1.5rem;
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 9999px;
    transition: opacity 0.2s, transform 0.2s;
    white-space: nowrap;
  }
  .plot-error-btn-primary:hover {
    opacity: 0.85;
    transform: translateY(-1px);
  }

  .plot-error-btn-ghost {
    background: transparent;
    color: #f0efe8;
    border: 1px solid rgba(240, 239, 232, 0.25);
    padding: 0.7rem 1.5rem;
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 400;
    cursor: pointer;
    border-radius: 9999px;
    transition: border-color 0.2s, transform 0.2s;
    white-space: nowrap;
  }
  .plot-error-btn-ghost:hover {
    border-color: rgba(240, 239, 232, 0.5);
    transform: translateY(-1px);
  }
`;

function ErrorScreen({ code, title, body, primaryLabel, primaryAction, ghostLabel, ghostAction }) {
  return (
    <>
      <style>{styles}</style>
      <div className="plot-error-page">
        <PlotLogo className="plot-error-logo-image" white />
        <div className="plot-error-number">{code}</div>
        <h1 className="plot-error-title">{title}</h1>
        <p className="plot-error-body">{body}</p>
        <div className="plot-error-actions">
          <button className="plot-error-btn-primary" onClick={primaryAction}>{primaryLabel}</button>
          {ghostLabel && (
            <button className="plot-error-btn-ghost" onClick={ghostAction}>{ghostLabel}</button>
          )}
        </div>
      </div>
    </>
  );
}

// Generic "something went wrong" screen for unexpected runtime crashes.
// A render crash is NOT a 404 — give it its own honest messaging + a reload.
function CrashScreen() {
  return (
    <ErrorScreen
      code="Oops"
      title="That scene didn't quite load."
      body="An unexpected error interrupted things. A quick reload usually gets you back on track."
      primaryLabel="Reload"
      primaryAction={() => { window.location.reload(); }}
      ghostLabel="Go home"
      ghostAction={() => { window.location.href = '/'; }}
    />
  );
}

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    if (isChunkError(error)) {
      // Only auto-reload once per session to avoid infinite reload loops
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
        return null; // stay mounted while reloading
      }
    }
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (isChunkError(error)) return; // already handled above
    console.error('Plot error:', error, info);
    captureException(error, { extra: info });
  }

  render() {
    if (this.state.hasError) {
      return <CrashScreen />;
    }
    return this.props.children;
  }
}

export { ErrorScreen, CrashScreen };
