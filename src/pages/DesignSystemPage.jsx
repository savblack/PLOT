import './DesignSystemPage.css';
import PlotLoader from '../components/PlotLoader.jsx';
import PlotLogo from '../components/PlotLogo.jsx';

const colorTokens = [
  ['--bg', 'App background', 'The quiet canvas behind every primary view.'],
  ['--surface', 'Base surface', 'Headers, bars, cards, drawers, and app panels.'],
  ['--surface-raised', 'Raised surface', 'Controls, subtle cards, selected rows, and inputs.'],
  ['--surface-sunken', 'Sunken surface', 'Hover feedback and pressed secondary controls.'],
  ['--text-primary', 'Primary text', 'Titles, important labels, and high-confidence values.'],
  ['--text-secondary', 'Secondary text', 'Descriptions, row supporting copy, and inactive nav.'],
  ['--text-muted', 'Muted text', 'Metadata, hints, timestamps, and quiet counters.'],
  ['--border', 'Standard border', 'Separates structural surfaces without heavy outlines.'],
  ['--accent', 'Accent', 'Active state, selected tabs, saves, and focused attention.'],
];

const guideTokens = [
  ['--chip-cinema', 'Cinema', 'Theatrical release and cinema calendar context.'],
  ['--chip-streaming', 'Movie', 'Streaming movie availability and guide release context.'],
  ['--chip-episode', 'TV', 'Television, episode, season, and watching context.'],
  ['--epg-bar-broadcast', 'Broadcast bar', 'Left edge marker for live TV guide channels.'],
  ['--epg-bar-stream', 'Streaming bar', 'Left edge marker for streaming guide channels.'],
];

const radiusTokens = [
  ['--radius-md', 'Default card radius', 'Poster masks, inputs, cards, rows, swatches, and ordinary controls.'],
  ['--radius-lg', 'Large panel radius', 'Sheets, watching cards, and elevated containers.'],
  ['--radius-badge', 'Badge radius', 'Small status chips and media-type badges with flatter sides than pill controls.'],
  ['--radius-pill', 'Pill radius', 'Large pill buttons, filter chips, and segmented actions.'],
];

const layoutRules = [
  ['Fixed app frame', 'Header and bottom tabs stay fixed; content scrolls inside the app surface.'],
  ['Side reading panel', 'Media details open in a right-side sheet capped by the panel width token.'],
  ['Focused content width', 'Legal, settings, and onboarding flows use the content max width for readable forms.'],
  ['Full-width bands', 'Bars and section headers run edge to edge inside their section; cards hold the rounded surfaces.'],
];

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconBookmark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TokenCard({ token, label, purpose }) {
  return (
    <div className="ds-token-card">
      <span className="ds-swatch" style={{ background: `var(${token})` }} />
      <div>
        <strong>{label}</strong>
        <code>{token}</code>
        <p>{purpose}</p>
      </div>
    </div>
  );
}

function SpecRow({ token, label, purpose }) {
  return (
    <div className={`ds-spec-row ds-spec-row--${token.replace('--radius-', '')}`} style={{ '--ds-spec-radius': `var(${token})` }}>
      <div>
        <strong>{label}</strong>
        <p>{purpose}</p>
      </div>
      <div className="ds-spec-side">
        <span className="ds-radius-preview" aria-hidden="true" />
        <code>{token}</code>
      </div>
    </div>
  );
}

function Section({ eyebrow, title, children }) {
  return (
    <section className="ds-section">
      <div className="ds-section-head">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="design-system-page">
      <header className="ds-hero">
        <div>
          <span className="ds-kicker">Visual Design System</span>
          <h1>PLOT</h1>
          <p>A living inventory of the app's fonts, colors, borders, bars, buttons, chips, and layout rules.</p>
        </div>
      </header>

      <Section eyebrow="01" title="Typography">
        <div className="ds-type-grid">
          <div className="ds-type-card ds-type-card--serif">
            <span>Brand and editorial</span>
            <strong>Instrument Serif</strong>
            <p>Use for the PLOT mark, page identity, feature headings, and expressive title moments.</p>
          </div>
          <div className="ds-type-card ds-type-card--sans">
            <span>Interface and data</span>
            <strong>Manrope</strong>
            <p>Use for buttons, dense rows, metadata, settings, navigation, forms, and repeated controls.</p>
          </div>
        </div>
        <div className="ds-type-scale">
          <div>
            <span>Page title</span>
            <h3>Calendar</h3>
          </div>
          <div>
            <span>Rail label</span>
            <strong className="ds-rail-sample">Upcoming releases</strong>
          </div>
          <div>
            <span>Body copy</span>
            <p>Track what is streaming, airing, saved, watched, and coming soon.</p>
          </div>
          <div>
            <span>Metadata</span>
            <small>Season 2 · 8 episodes · Streaming</small>
          </div>
        </div>
      </Section>

      <Section eyebrow="02" title="Color Tokens">
        <div className="ds-token-grid">
          {colorTokens.map(([token, label, purpose]) => (
            <TokenCard key={token} token={token} label={label} purpose={purpose} />
          ))}
        </div>
      </Section>

      <Section eyebrow="03" title="Status and Guide Color">
        <div className="ds-token-grid ds-token-grid--two">
          {guideTokens.map(([token, label, purpose]) => (
            <TokenCard key={token} token={token} label={label} purpose={purpose} />
          ))}
        </div>
        <div className="ds-chip-row">
          <span className="chip chip-cinema">Cinema</span>
          <span className="chip chip-streaming">Movie</span>
          <span className="chip chip-episode">TV</span>
          <span className="chip chip-muted">Saved</span>
        </div>
      </Section>

      <Section eyebrow="04" title="Borders and Radius">
        <div className="ds-spec-grid">
          {radiusTokens.map(([token, label, purpose]) => (
            <SpecRow key={token} token={token} label={label} purpose={purpose} />
          ))}
        </div>
      </Section>

      <Section eyebrow="05" title="Bars and Navigation">
        <div className="ds-bar-catalog">
          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>App header</strong><p>Fixed top identity and global menu access.</p></div>
            <div className="ds-fake-header">
              <span className="app-page-title">PLOT</span>
              <button className="icon-btn" aria-label="Sample menu"><IconMenu /></button>
            </div>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>Primary tab bar</strong><p>Bottom navigation for the main destinations.</p></div>
            <div className="ds-fake-tabbar">
              <button className="tab-btn active">Home</button>
              <button className="tab-btn">Calendar</button>
              <button className="tab-btn">My Lists</button>
              <button className="tab-btn">History</button>
            </div>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>Sub-tab toolbar</strong><p>In-view navigation for modes inside one destination.</p></div>
            <div className="sub-tabs ds-fake-subtabs">
              <button className="sub-tab-btn active">Discover</button>
              <button className="sub-tab-btn">Releases</button>
              <button className="sub-tab-btn">Guide</button>
            </div>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>Filter toolbar</strong><p>Date context, tabs, and right-pinned filter controls.</p></div>
            <div className="sub-tabs-bar ds-fake-filterbar">
              <div className="sub-tabs-left">
                <span className="sub-tabs-date">Thu, May 28</span>
                <button className="sub-tab-btn active">All</button>
                <button className="sub-tab-btn">Movies</button>
                <button className="sub-tab-btn">TV</button>
              </div>
              <div className="sub-tabs-right">
                <button className="multi-select-btn">Type</button>
                <button className="multi-select-btn">Genre</button>
              </div>
            </div>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>Rail header</strong><p>Use for simple uppercase section labels above horizontal media rails.</p></div>
            <div className="rail-header ds-fake-rail-header">
              <span className="rail-title">Hot right now</span>
            </div>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>Date group header</strong><p>Collapsible strip for saved, watching, today, and release groups.</p></div>
            <button className="date-group-header date-group-collapsible ds-fake-date-group">
              <span className="date-group-label">Today</span>
              <span className="chip chip-streaming">Movie</span>
            </button>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>EPG day selector</strong><p>Compact broadcast-guide day navigation.</p></div>
            <div className="epg-days ds-fake-epg-days">
              <button className="epg-day-btn active"><span className="epg-day-name">Thu</span><span className="epg-day-num">28</span></button>
              <button className="epg-day-btn"><span className="epg-day-name">Fri</span><span className="epg-day-num">29</span></button>
              <button className="epg-day-btn"><span className="epg-day-name">Sat</span><span className="epg-day-num">30</span></button>
            </div>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>EPG channel bars</strong><p>Left-edge bars separate broadcast from streaming rows.</p></div>
            <div className="ds-epg-demo">
              <div className="ds-epg-row ds-epg-row--broadcast"><strong>Broadcast guide row</strong><span>Blue edge for live TV channels.</span></div>
              <div className="ds-epg-row ds-epg-row--streaming"><strong>Streaming guide row</strong><span>Rose edge for streaming channels.</span></div>
            </div>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>Progress bar</strong><p>Linear completion indicator for watching progress.</p></div>
            <div className="progress-row ds-fake-progress">
              <div className="progress-bar"><div className="progress-fill" style={{ width: '62%' }} /></div>
              <span className="progress-label">5 / 8</span>
            </div>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>Calendar header row</strong><p>Month label plus directional controls.</p></div>
            <div className="calendar-nav ds-fake-calendar-nav">
              <span className="calendar-month-label">May 2026</span>
              <div className="calendar-nav-btns">
                <button className="cal-nav-btn" aria-label="Previous month">‹</button>
                <button className="cal-nav-btn" aria-label="Next month">›</button>
              </div>
            </div>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>Platform header</strong><p>Collapsible provider row for platform shelves.</p></div>
            <button className="discover-plat-header ds-fake-platform-header">
              <span className="discover-plat-header-left">
                <span className="discover-plat-logo discover-plat-logo-fallback">N</span>
                <span className="discover-plat-name">Netflix</span>
              </span>
            </button>
          </div>

          <div className="ds-bar-item">
            <div className="ds-bar-copy"><strong>Media-type mini header</strong><p>Nested label that splits Movies from TV Shows.</p></div>
            <div className="ds-mini-header-stack">
              <div className="discover-plat-type-label">Movies</div>
              <div className="discover-plat-type-label">TV Shows</div>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="06" title="Buttons and Controls">
        <div className="ds-control-grid">
          <div className="ds-control-card">
            <strong>Action buttons</strong>
            <p>Primary confirms the main action. Accent is for app-specific positive emphasis. Ghost stays quiet.</p>
            <div className="ds-button-row">
              <button className="btn btn-primary">Primary</button>
              <button className="btn btn-accent">Accent</button>
              <button className="btn btn-secondary">Secondary</button>
              <button className="btn btn-ghost">Ghost</button>
            </div>
          </div>
          <div className="ds-control-card">
            <strong>Icon buttons</strong>
            <div className="ds-icon-row">
              <button className="icon-btn" aria-label="Menu sample"><IconMenu /></button>
              <button className="card-save-btn saved ds-save-sample" aria-label="Saved sample"><IconBookmark /></button>
              <button className="season-nav-btn" aria-label="Previous sample">‹</button>
              <button className="season-nav-btn" aria-label="Next sample">›</button>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="07" title="Cards, Forms, and States">
        <p className="ds-section-note">
          Card styles in the app should map to one of these patterns before a new surface is introduced.
        </p>
        <div className="ds-pattern-grid">
          <div className="ds-card-example ds-card-example--poster">
            <span className="ds-example-label">Poster card</span>
            <div className="media-card ds-media-sample">
              <div className="media-card-img">
                <div className="ds-poster-art"><span>PLOT</span></div>
                <div className="card-chip-overlay"><span className="chip chip-streaming">Movie</span></div>
                <button className="card-save-btn saved" aria-label="Saved sample"><IconBookmark /></button>
              </div>
              <div className="media-card-title">Sample poster card</div>
              <div className="media-card-meta">Poster card · metadata</div>
            </div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Watching card</span>
            <div className="watching-card ds-watching-sample">
              <div className="watching-backdrop-wrap">
                <div className="ds-backdrop-art" />
                <div className="watching-backdrop-gradient" />
                <div className="watching-backdrop-title">Severance</div>
              </div>
              <div className="watching-body">
                <div className="progress-row">
                  <div className="progress-bar"><div className="progress-fill" style={{ width: '62%' }} /></div>
                  <span className="progress-label">5 / 8</span>
                </div>
                <div className="watching-next"><strong>Next:</strong> Episode 6</div>
              </div>
            </div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Hero media card</span>
            <div className="discover-hero ds-hero-card-sample">
              <div className="discover-hero-backdrop discover-hero-backdrop-fallback" />
              <div className="discover-hero-overlay">
                <span className="discover-hero-badge">Trending #1</span>
                <h2 className="discover-hero-title">Sample feature</h2>
                <p className="discover-hero-meta">2026 · Movie</p>
                <div className="discover-hero-actions">
                  <button className="discover-hero-save">Save</button>
                  <button className="discover-hero-info">Details</button>
                </div>
              </div>
            </div>
          </div>

          <div className="ds-form-card">
            <span className="ds-example-label">Form card</span>
            <label>Search field<input type="text" value="Severance" readOnly /></label>
            <label>Select field<select value="streaming" readOnly><option value="streaming">Streaming</option></select></label>
            <div className="ds-form-note">Forms should feel calm, clear, and compact.</div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">List row</span>
            <div className="list-row ds-list-row-sample">
              <div className="list-row-poster"><div className="ds-mini-poster" /></div>
              <div className="list-row-info">
                <div className="list-row-title">The Studio</div>
                <div className="list-row-meta"><span className="list-type-badge">Series</span><span>Season 1 · Episode 6</span></div>
              </div>
            </div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Ranked chart row</span>
            <div className="discover-chart-row ds-chart-row-sample">
              <span className="discover-chart-rank glow">1</span>
              <div className="discover-chart-poster"><div className="ds-mini-poster" /></div>
              <div className="discover-chart-info">
                <div className="discover-chart-title">Top title</div>
                <div className="discover-chart-meta">2026 · TV</div>
              </div>
              <div className="discover-chart-right">
                <button className="card-save-btn saved" aria-label="Saved sample"><IconBookmark /></button>
              </div>
            </div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Calendar day panel</span>
            <div className="cal-day-panel ds-calendar-sample">
              <div className="cal-day-panel-header">Today</div>
              <div className="cal-event-row">
                <div className="cal-event-poster"><div className="ds-mini-poster" /></div>
                <div className="cal-event-info">
                  <div className="cal-event-title">Dune: Part Three</div>
                  <div className="cal-event-meta">Cinema release</div>
                </div>
                <span className="chip chip-cinema">Cinema</span>
              </div>
            </div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Detail panel</span>
            <div className="ds-panel-sample">
              <div className="ds-panel-art" />
              <div className="panel-body">
                <h3 className="panel-title">Sample title</h3>
                <div className="panel-meta-row"><span>2026</span><span className="chip chip-streaming">Movie</span></div>
                <p className="panel-overview">Use for overview, save actions, providers, notes, and episode lists.</p>
                <div className="providers-grid">
                  <span className="provider-chip"><span className="ds-provider-mark">N</span>Netflix</span>
                  <span className="provider-chip"><span className="ds-provider-mark">P</span>Prime</span>
                </div>
              </div>
            </div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Provider select card</span>
            <button className="provider-select-card selected ds-provider-select-sample">
              <span className="discover-plat-logo discover-plat-logo-fallback">N</span>
              <span>Netflix</span>
            </button>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Settings row</span>
            <div className="settings-row ds-settings-sample">
              <div className="settings-row-left">
                <span className="settings-row-icon"><IconBookmark /></span>
                <span className="settings-row-label">Saved titles</span>
              </div>
              <span className="settings-row-value">Synced</span>
            </div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Navigation drawer</span>
            <div className="ds-drawer-sample">
              <div className="nav-drawer-header">
                <PlotLogo className="nav-drawer-logo-image" />
              </div>
              <div className="nav-drawer-nav">
                <button className="nav-drawer-item active"><span className="nav-drawer-label">Home</span></button>
                <button className="nav-drawer-item"><span className="nav-drawer-label">Settings</span></button>
              </div>
            </div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Episode row</span>
            <div className="episode-list ds-episode-sample">
              <div className="ep-row ep-current">
                <span className="ep-num">E06</span>
                <div className="ep-info">
                  <div className="ep-title">The Attic</div>
                  <div className="ep-air">Airs tonight</div>
                </div>
              </div>
              <div className="ep-row watched">
                <span className="ep-num">E05</span>
                <div className="ep-info">
                  <div className="ep-title">Cold Harbor</div>
                  <div className="ep-air">Watched</div>
                </div>
              </div>
            </div>
          </div>

          <div className="ds-state-card">
            <span className="ds-example-label">State card</span>
            <strong>Empty and loading states</strong>
            <p>Keep the message short. Offer one next action when the user can recover immediately.</p>
            <div className="empty-state ds-empty-sample">
              <div className="empty-title">Nothing saved</div>
              <div className="empty-body">Saved titles will appear here.</div>
            </div>
            <div className="ds-loader-sample" style={{ gap: '1rem' }}>
              <PlotLoader />
              <div style={{ background: '#141418', borderRadius: '1.25rem', padding: '1.1rem 1.35rem', display: 'grid', placeItems: 'center' }}>
                <PlotLoader tone="dark" />
              </div>
            </div>
            <button className="btn btn-ghost btn-sm">Refresh</button>
          </div>
        </div>
      </Section>

      <Section eyebrow="08" title="Layout Rules">
        <p className="ds-section-note">
          These are not visual components by themselves. They are guardrails for where components live.
        </p>
        <div className="ds-layout-grid">
          {layoutRules.map(([label, purpose]) => (
            <div key={label} className="ds-layout-rule">
              <div className="ds-layout-rule-art">
                <span />
                <strong />
                <em />
              </div>
              <strong>{label}</strong>
              <p>{purpose}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
