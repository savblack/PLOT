// The design system, rendered from the live tokens. Read-only: values come from
// apps/web/src/styles/tokens.css, which is generated from @plot/core/tokens.js.
import '../styles/tokens.css';
import '../styles/app.css';
import PlotLogo from '../components/PlotLogo.jsx';

export default {
  title: 'Foundations/Design system',
  parameters: { layout: 'padded' },
};

const Swatch = ({ name, token, text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 150 }}>
    <div style={{ height: 72, borderRadius: 14, background: `var(${token})`, border: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', padding: 10, color: text || 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}>{text ? 'Aa' : ''}</div>
    <div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div>
    <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{token}</code>
  </div>
);

const Row = ({ children }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>{children}</div>;
const H = ({ children }) => <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: 'var(--font-display-tracking)', fontSize: 20, margin: '0 0 16px' }}>{children}</h3>;

export const Palette = () => (
  <div style={{ background: 'var(--bg)', padding: 24, color: 'var(--text-primary)' }}>
    <H>Ground and surfaces</H>
    <Row>
      <Swatch name="Ground" token="--bg" />
      <Swatch name="Surface" token="--surface" />
      <Swatch name="Raised" token="--surface-raised" />
      <Swatch name="Sunken (cards)" token="--surface-sunken" />
    </Row>
    <H>Ink</H>
    <Row>
      <Swatch name="Primary" token="--text-primary" text="#fff" />
      <Swatch name="Secondary" token="--text-secondary" text="#fff" />
      <Swatch name="Muted" token="--text-muted" text="#fff" />
    </Row>
    <H>Accent and fill</H>
    <Row>
      <Swatch name="Accent (type, line)" token="--accent" text="#fff" />
      <Swatch name="Accent text" token="--accent-text" text="#fff" />
      <Swatch name="Fill (surfaces)" token="--accent-fill" text="var(--on-accent-fill)" />
      <Swatch name="Fill hover" token="--accent-fill-hover" text="var(--on-accent-fill)" />
    </Row>
    <p style={{ maxWidth: 560, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>
      The pink fill only ever sits behind charcoal text. The green accent colours small text, icons and rings, and never fills a surface larger than a dot.
    </p>
  </div>
);

export const Type = () => (
  <div style={{ background: 'var(--bg)', padding: 24, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: 28 }}>
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Display · Gabarito 700 · --font-display</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: 'var(--font-display-tracking)', fontSize: 44, lineHeight: 0.98 }}>Everything you've watched.<br />Everything you want to watch.</div>
    </div>
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Body · DM Sans · --font-sans</div>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: 1.55, color: 'var(--text-secondary)', maxWidth: 520, margin: 0 }}>Track what you've seen, save what's coming, and keep the notes that make it yours.</p>
    </div>
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Editorial · Gabarito italic · --font-serif</div>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 }}>"Quietly devastating."</p>
    </div>
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Wordmark · PlotLogo</div>
      <PlotLogo style={{ fontSize: '2.4rem' }} />
    </div>
  </div>
);

export const Buttons = () => (
  <div style={{ background: 'var(--bg)', padding: 24, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <button className="btn btn-primary">Start your plot</button>
    <button className="btn btn-secondary">See what's on</button>
    <button className="btn btn-accent">Save</button>
    <button className="btn btn-ghost">Cancel</button>
    <button className="btn btn-primary btn-sm">Small</button>
    <button className="btn btn-secondary btn-xs">Tiny</button>
  </div>
);

export const Card = () => (
  <div style={{ background: 'var(--bg)', padding: 24 }}>
    <div style={{ background: 'var(--surface-sunken)', borderRadius: 20, padding: '24px 28px', maxWidth: 480 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: 'var(--font-display-tracking)', fontSize: 22 }}>Trending now</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>This week</span>
      </div>
      {[['1', 'The End of Oak Street', 'Trending #1', true], ['2', 'Moana', 'Film', false], ['3', 'Mayday', 'Film', false]].map(([n, t, c, pink]) => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, width: 24, color: 'var(--accent)' }}>{n}</span>
          <span style={{ width: 36, height: 54, borderRadius: 6, background: 'var(--surface)' }} />
          <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, letterSpacing: '-0.02em' }}>{t}</span>
          <span style={{ padding: '4px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 500, background: pink ? 'var(--accent-fill)' : 'var(--surface)', color: 'var(--on-accent-fill)' }}>{c}</span>
        </div>
      ))}
    </div>
  </div>
);
