import { useState, useEffect } from 'react';
import './DesignSystemPage.css';
import PlotLoader from '../components/PlotLoader.jsx';

const colorTokens = [
  ['--bg', 'App background', 'The quiet canvas behind every primary view.'],
  ['--surface', 'Base surface', 'Headers, bars, cards, drawers, and app panels.'],
  ['--surface-raised', 'Raised surface', 'Controls, subtle cards, selected rows, and inputs.'],
  ['--surface-sunken', 'Sunken surface', 'Hover feedback and pressed secondary controls.'],
  ['--text-primary', 'Primary text', 'Titles, important labels, and high-confidence values.'],
  ['--text-secondary', 'Secondary text', 'Descriptions, row supporting copy, and inactive nav.'],
  ['--text-muted', 'Muted text', 'Metadata, hints, timestamps, and quiet counters.'],
  ['--border', 'Standard border', 'Separates structural surfaces without heavy outlines.'],
  ['--border-strong', 'Strong border', 'Higher-contrast separator for overlays, focused inputs, and modals.'],
  ['--accent', 'Accent', 'Active state, selected tabs, saves, and focused attention.'],
  ['--accent-dim', 'Accent dim', 'Tinted accent fill for save confirmations and selected state backgrounds.'],
  ['--danger', 'Danger', 'Destructive actions, error states, and delete confirmations.'],
  ['--danger-dim', 'Danger dim', 'Danger background tint for warning banners and error input fills.'],
  ['--danger-border', 'Danger border', 'Error input outlines and alert borders.'],
  ['--glass-bg', 'Glass background', 'Frosted-glass overlay background for panel overlays and headers when scrolled.'],
  ['--glass-border', 'Glass border', 'Edge line for frosted glass surfaces.'],
];

const guideTokens = [
  ['--chip-cinema', 'Cinema', 'Theatrical release and cinema calendar context.'],
  ['--chip-streaming', 'Movie', 'Streaming movie availability and guide release context.'],
  ['--chip-episode', 'TV', 'Television, episode, season, and watching context.'],
  ['--chip-now', 'Now', 'Airing right now — immediate real-time context.'],
  ['--chip-today', 'Today', 'Airs or releases today.'],
  ['--chip-tomorrow', 'Tomorrow', 'Airs or releases tomorrow.'],
  ['--chip-soon', 'Soon', 'Coming in the next few days.'],
  ['--epg-bar-broadcast', 'Broadcast bar', 'Left edge marker for live TV guide channels.'],
  ['--epg-bar-stream', 'Streaming bar', 'Left edge marker for streaming guide channels.'],
];

const radiusTokens = [
  ['--radius-md', 'Default card radius', 'Poster masks, inputs, cards, rows, swatches, and ordinary controls.'],
  ['--radius-lg', 'Large panel radius', 'Sheets, watching cards, and elevated containers.'],
  ['--radius-badge', 'Badge radius', 'Small status chips and media-type badges with flatter sides than pill controls.'],
  ['--radius-pill', 'Pill radius', 'Large pill buttons, filter chips, and segmented actions.'],
];

const spacingScale = [
  ['4px', 'Hairline gaps inside chips, icon rows, and tight metadata pairs.'],
  ['8px', 'Default internal breathing room between labels, helper copy, and card atoms.'],
  ['12px', 'Dense stacked controls, compact cards, and small toolbars.'],
  ['16px', 'Default card padding, form rhythm, and section spacing.'],
  ['24px', 'Large panel padding, grouped sections, and major content breaks.'],
  ['32px+', 'Hero spacing, wide gutters, and high-emphasis layout moments.'],
];

const shadowTokens = [
  ['--shadow-xs', 'Default lift', 'Ordinary cards and bounded content sections.'],
  ['--shadow-sm', 'Hover lift', 'Raised controls and floating surfaces that need a subtle step up.'],
  ['--shadow-md', 'Panel depth', 'Drawers, sheets, and high-priority overlays.'],
  ['--shadow-lg', 'Hero depth', 'Rare emphasis for bold spotlights or dramatic art framing.'],
];

const motionRules = [
  ['Keep motion structural', 'Transitions should explain state changes, not decorate them.'],
  ['Use fast feedback first', 'Buttons, chips, and tabs should resolve within the fast transition token.'],
  ['Reserve bounce for delight', '--ease-bounce (cubic-bezier 0.34, 1.56, 0.64, 1) is for special arrivals like sheets and modals — never routine navigation.'],
  ['Fade loaders sequentially', 'The PLOT loader should stay centered and animate letter-by-letter in order.'],
];

const motionTokens = [
  ['--ease', 'cubic-bezier(0.23, 1, 0.32, 1)', 'Standard ease-out for structural transitions.'],
  ['--ease-bounce', 'cubic-bezier(0.34, 1.56, 0.64, 1)', 'Overshoot curve reserved for sheet and modal arrivals.'],
  ['--transition', 'all 0.3s var(--ease)', 'Default transition for panels and surfaces.'],
  ['--transition-fast', 'all 0.15s ease', 'Quick feedback for buttons, chips, and tabs.'],
];

const layoutTokens = [
  ['--content-max', '680px', 'Focused reading width for legal, settings, and forms.'],
  ['--panel-w', '460px', 'Fixed width of the right-side media reading panel.'],
  ['--header-h', '56px', 'Height of the fixed app header.'],
  ['--tabbar-h', '58px', 'Height of the fixed bottom tab bar.'],
];

const surfaceOwnership = [
  ['Always shared', 'Logo assets, typography, color roles, spacing rhythm, radius, borders, loader behavior, buttons, form controls, and legal/support page tone.'],
  ['Shared with art direction freedom', 'Poster walls, hero cards, empty states, and editorial copy can vary as long as they still sit on the shared token system.'],
  ['App-specific', 'Fixed app shell, drawer, tab bars, guide rails, calendar controls, and media-status chips.'],
  ['Marketing-specific', 'Campaign storytelling, large hero layouts, and conversion-focused sections can differ in composition, but should still inherit the same logo, typography, and color roles.'],
];

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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

function TokenCard({ token, label, purpose, glassy }) {
  return (
    <div className="ds-token-card">
      <span
        className={`ds-swatch${glassy ? ' ds-swatch--glassy' : ''}`}
        style={{ background: `var(${token})` }}
      />
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

function RuleCard({ label, children }) {
  return (
    <div className="ds-rule-card">
      <strong>{label}</strong>
      <div>{children}</div>
    </div>
  );
}

export default function DesignSystemPage() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const page = document.querySelector('.design-system-page');
    if (page) page.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="design-system-page">
      <header className="ds-hero">
        <div>
          <span className="ds-kicker">Visual Design System</span>
          <h1>PLOT</h1>
          <p>A living inventory of the app's fonts, colors, borders, bars, buttons, chips, and layout rules.</p>
        </div>
        <button
          className="ds-theme-toggle"
          onClick={() => setDark(d => !d)}
          aria-label="Toggle light/dark theme"
        >
          {dark ? '☀ Light' : '☽ Dark'}
        </button>
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
            <strong>DM Sans</strong>
            <p>Use for buttons, dense rows, metadata, settings, navigation, forms, and repeated controls.</p>
          </div>
        </div>
        <div className="ds-type-scale">
          <div>
            <span>Page title · Instrument Serif · 1.6rem / 400 / 1.1 lh / −0.02em ls</span>
            <h3>Calendar</h3>
          </div>
          <div>
            <span>Rail label · DM Sans · 0.75rem / 700 / 1.2 lh / 0.08em ls / uppercase</span>
            <strong className="ds-rail-sample">Upcoming releases</strong>
          </div>
          <div>
            <span>Body copy · DM Sans · 0.875rem / 400 / 1.6 lh</span>
            <p>Track what is streaming, airing, saved, watched, and coming soon.</p>
          </div>
          <div>
            <span>Metadata · DM Sans · 0.75rem / 400 / 1.4 lh · --text-muted</span>
            <small>Season 2 · 8 episodes · Streaming</small>
          </div>
        </div>

        <h3 className="ds-subsection-title">Editorial display · marketing surface</h3>
        <p className="ds-section-note" style={{ marginTop: '0.25rem' }}>
          Marketing hero and manifesto headlines push Instrument Serif large and tight — weight 400, <code>−0.05em</code> tracking, a <code>0.997</code> horizontal condense, at a fluid <code>clamp(2.8rem, 6.5vw, 5rem)</code>. Same font as the app; editorial scale.
        </p>
        <div className="ds-editorial-display">
          <span>Your film &amp; TV companion</span>
        </div>
      </Section>

      <Section eyebrow="02" title="Color Tokens">
        <div className="ds-token-grid">
          {colorTokens.map(([token, label, purpose]) => (
            <TokenCard
              key={token}
              token={token}
              label={label}
              purpose={purpose}
              glassy={token === '--glass-bg' || token === '--glass-border'}
            />
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
          <span className="chip chip-now">Now</span>
          <span className="chip chip-today">Today</span>
          <span className="chip chip-tomorrow">Tomorrow</span>
          <span className="chip chip-soon">Soon</span>
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
            <p>Primary confirms the main action. Accent is for positive app emphasis. Ghost stays quiet. Danger is for destructive confirms only.</p>
            <div className="ds-button-row">
              <button className="btn btn-primary">Primary</button>
              <button className="btn btn-accent">Accent</button>
              <button className="btn btn-secondary">Secondary</button>
              <button className="btn btn-ghost">Ghost</button>
              <button className="btn ds-btn-danger">Danger</button>
            </div>
          </div>
          <div className="ds-control-card">
            <strong>Size variants</strong>
            <p>Default for standalone actions. sm for compact toolbars and inline confirmations. xs for dense list rows and tight badges.</p>
            <div className="ds-button-row">
              <button className="btn btn-secondary">Default</button>
              <button className="btn btn-secondary btn-sm">Small</button>
              <button className="btn btn-secondary btn-xs">X-Small</button>
            </div>
          </div>
          <div className="ds-control-card">
            <strong>Accent outline (.btn-start-watching)</strong>
            <p>Transparent background with accent border. Used for "Start watching" in list rows. Fills on hover.</p>
            <div className="ds-button-row">
              <button className="btn-start-watching">Start watching</button>
            </div>
          </div>
          <div className="ds-control-card">
            <strong>Icon buttons</strong>
            <p>Monochrome, stroke-based. Secondary colour until hover/active. Each button has an aria-label — no visible text.</p>
            <div className="ds-icon-labeled-grid">
              <div className="ds-icon-cell">
                <button className="icon-btn" aria-label="Open menu"><IconMenu /></button>
                <span>Menu</span>
              </div>
              <div className="ds-icon-cell">
                <button className="icon-btn" aria-label="Open search"><IconSearch /></button>
                <span>Search</span>
              </div>
              <div className="ds-icon-cell">
                <button className="icon-btn" aria-label="Close"><IconClose /></button>
                <span>Close</span>
              </div>
              <div className="ds-icon-cell">
                <button className="icon-btn ds-icon-bookmark" aria-label="Save"><IconBookmark /></button>
                <span>Save</span>
              </div>
              <div className="ds-icon-cell">
                <button className="season-nav-btn" aria-label="Previous">‹</button>
                <span>Prev</span>
              </div>
              <div className="ds-icon-cell">
                <button className="season-nav-btn" aria-label="Next">›</button>
                <span>Next</span>
              </div>
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
                  <span className="provider-chip">
                    <img src="https://image.tmdb.org/t/p/w92/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg" alt="Netflix" className="ds-provider-logo" />
                    Netflix
                  </span>
                  <span className="provider-chip">
                    <img src="https://image.tmdb.org/t/p/w92/emthp39XA2YScoYL1p0sdbAH2WA.jpg" alt="Prime Video" className="ds-provider-logo" />
                    Prime
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="ds-card-example">
            <span className="ds-example-label">Provider select card</span>
            <button className="provider-select-card selected ds-provider-select-sample">
              <img src="https://image.tmdb.org/t/p/w92/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg" alt="Netflix" />
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
                <span className="nav-drawer-logo-text">PLOT</span>
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
              <div style={{ background: '#0c0c0c', borderRadius: '1.25rem', padding: '1.1rem 1.35rem', display: 'grid', placeItems: 'center' }}>
                <PlotLoader tone="dark" />
              </div>
            </div>
            <button className="btn btn-ghost btn-sm">Refresh</button>
          </div>
        </div>
      </Section>

      <Section eyebrow="08" title="Interactive States">
        <p className="ds-section-note">
          These behaviors apply across all tappable surfaces. Hover a card or press Tab to see the states live.
        </p>
        <div className="ds-bar-catalog">
          <div className="ds-bar-item">
            <div className="ds-bar-copy">
              <strong>Card press (.interactive-surface)</strong>
              <p>All tappable cards scale to 0.97 on hover and 0.93 on active. Applied via the .interactive-surface class on media cards, list rows, and settings rows.</p>
            </div>
            <div className="ds-interactive-demo">
              <div className="media-card interactive-surface ds-interactive-card">
                <div className="media-card-img">
                  <div className="ds-poster-art"><span>PLOT</span></div>
                </div>
                <div className="media-card-title">Hover me</div>
                <div className="media-card-meta">Card press demo</div>
              </div>
            </div>
          </div>
          <div className="ds-bar-item">
            <div className="ds-bar-copy">
              <strong>Focus-visible ring</strong>
              <p>Keyboard navigation shows a 2px accent outline on all interactive elements. Rows get --surface-raised background; cards get a glow shadow instead.</p>
            </div>
            <div className="ds-focus-demo">
              <button className="btn btn-secondary">Tab to me</button>
              <div className="list-row interactive-surface ds-list-row-sample" tabIndex={0}>
                <div className="list-row-poster"><div className="ds-mini-poster" /></div>
                <div className="list-row-info">
                  <div className="list-row-title">Tab to this row</div>
                  <div className="list-row-meta"><span>Focus ring demo</span></div>
                </div>
              </div>
            </div>
          </div>
          <div className="ds-bar-item">
            <div className="ds-bar-copy">
              <strong>Filter button open state</strong>
              <p>Filter and multi-select trigger buttons pick up an accent border when open. The caret rotates 180° to indicate the menu is expanded.</p>
            </div>
            <div className="ds-focus-demo">
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="multi-select-btn">Closed</button>
                <button className="multi-select-btn open">
                  Open
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m6 9 6 6 6-6"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="09" title="Overlays, Glass, and Menus">
        <div className="ds-bar-catalog">
          <div className="ds-bar-item">
            <div className="ds-bar-copy">
              <strong>Confirm modal</strong>
              <p>Shared destructive-action confirmation. Normal variant uses --accent; danger variant uses --danger. Scrim uses backdrop-filter blur. Dismisses on Esc or overlay tap.</p>
            </div>
            <div className="ds-modal-demos">
              <div className="ds-modal-card">
                <p className="ds-modal-title">Save to My List?</p>
                <p className="ds-modal-message">This title will appear in your saved list.</p>
                <div className="ds-modal-actions">
                  <button className="btn btn-secondary ds-modal-btn">Cancel</button>
                  <button className="btn btn-accent ds-modal-btn">Save</button>
                </div>
              </div>
              <div className="ds-modal-card">
                <p className="ds-modal-title">Remove from list?</p>
                <p className="ds-modal-message">This title will be removed from your saved list.</p>
                <div className="ds-modal-actions">
                  <button className="btn btn-secondary ds-modal-btn">Cancel</button>
                  <button className="btn ds-modal-btn ds-btn-danger">Remove</button>
                </div>
              </div>
            </div>
          </div>
          <div className="ds-bar-item">
            <div className="ds-bar-copy">
              <strong>Filter dropdown</strong>
              <p>Floating menu triggered by a filter button. Used in the guide and calendar toolbar for type and genre selection. Position absolute, z-index 300.</p>
            </div>
            <div className="ds-filter-demo">
              <div className="multi-select ds-filter-wrap">
                <button className="multi-select-btn open">
                  Genre
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <div className="multi-select-menu ds-menu-static">
                  <label className="multi-select-option"><input type="checkbox" defaultChecked readOnly /> Drama</label>
                  <label className="multi-select-option"><input type="checkbox" readOnly /> Comedy</label>
                  <label className="multi-select-option"><input type="checkbox" readOnly /> Thriller</label>
                </div>
              </div>
            </div>
          </div>
          <div className="ds-bar-item">
            <div className="ds-bar-copy">
              <strong>Glass surface</strong>
              <p>--glass-bg + backdrop-filter: blur(12px) used on panel overlays and app headers when content scrolls beneath them. --glass-border defines the edge.</p>
            </div>
            <div className="ds-glass-demo">
              <div className="ds-glass-art" />
              <div className="ds-glass-panel">
                <span className="ds-glass-label">Glass surface</span>
                <code>--glass-bg · backdrop-filter: blur(12px)</code>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="10" title="Forms and Validation">
        <p className="ds-section-note">
          Input states follow a consistent pattern across onboarding, search, and settings. Only one state applies per field at a time.
        </p>
        <div className="ds-pattern-grid">
          <div className="ds-form-card">
            <span className="ds-example-label">Input states</span>
            <label>Default<input type="text" defaultValue="Severance" readOnly /></label>
            <label>Error
              <div className="ds-state-wrap">
                <input type="text" defaultValue="bad@email" readOnly className="ds-input-error" />
                <span className="ds-error-msg">Enter a valid email address</span>
              </div>
            </label>
            <label>Valid
              <div className="ds-state-wrap">
                <input type="text" defaultValue="savannah@theplot.tv" readOnly className="ds-input-valid" />
                <span className="ds-valid-mark">✓</span>
              </div>
            </label>
          </div>
          <div className="ds-form-card">
            <span className="ds-example-label">Password field</span>
            <label>Password
              <div className="ds-state-wrap">
                <input type="password" defaultValue="mysecret" readOnly />
                <button className="ds-pw-toggle" aria-label="Show password">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </label>
            <div className="ds-form-note">Show/hide toggle sits on the trailing edge inside the input.</div>
          </div>
          <div className="ds-form-card">
            <span className="ds-example-label">Search input</span>
            <div className="search-input-inner ds-search-wrap">
              <span className="search-input-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </span>
              <input type="search" className="search-input ds-search-input" placeholder="Search titles…" readOnly />
            </div>
            <div className="ds-form-note">Full-width, icon-leading. Font size ≥16px prevents iOS auto-zoom on focus.</div>
          </div>
          <div className="ds-form-card">
            <span className="ds-example-label">Review — stars + textarea</span>
            <div className="ds-star-row">
              {[1,2,3,4,5].map(i => (
                <button key={i} className="review-star-btn" aria-label={`${i} star`}>
                  <svg viewBox="0 0 24 24" width="22" height="22"
                    fill={i <= 3 ? 'var(--accent)' : 'none'}
                    stroke="var(--accent)" strokeWidth="1.5">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
              ))}
            </div>
            <textarea className="review-textarea review-textarea--active" rows={3} defaultValue="Gripping from start to finish." readOnly />
            <div className="ds-form-note">Stars use --accent fill. Textarea gets an accent border on active state.</div>
          </div>
        </div>
      </Section>

      <Section eyebrow="11" title="Spacing, Shadows, and Motion">
        <div className="ds-utility-grid">
          <RuleCard label="Spacing scale">
            <div className="ds-scale-list">
              {spacingScale.map(([value, purpose]) => (
                <div key={value} className="ds-scale-row">
                  <span className="ds-scale-pill">{value}</span>
                  <p>{purpose}</p>
                </div>
              ))}
            </div>
          </RuleCard>

          <RuleCard label="Shadow tokens">
            <div className="ds-note-list">
              {shadowTokens.map(([token, label, purpose]) => (
                <div key={token} className="ds-note-row">
                  <code>{token}</code>
                  <p><strong>{label}</strong> {purpose}</p>
                </div>
              ))}
            </div>
          </RuleCard>

          <RuleCard label="Motion principles">
            <div className="ds-note-list">
              {motionRules.map(([label, purpose]) => (
                <div key={label} className="ds-note-row">
                  <strong>{label}</strong>
                  <p>{purpose}</p>
                </div>
              ))}
            </div>
          </RuleCard>

          <RuleCard label="Motion tokens">
            <div className="ds-note-list">
              {motionTokens.map(([token, value, purpose]) => (
                <div key={token} className="ds-note-row">
                  <code>{token}</code>
                  <p><span className="ds-token-value">{value}</span> {purpose}</p>
                </div>
              ))}
            </div>
          </RuleCard>

          <RuleCard label="Icon and mark usage">
            <div className="ds-note-list">
              <div className="ds-note-row">
                <strong>Wordmark</strong>
                <p>Render the PLOT wordmark as Instrument Serif text through <code>PlotLogo</code> (<code>var(--font-serif)</code>, weight 400, <code>-0.05em</code> tracking). Never use raster or letter-image logos; size it with <code>fontSize</code>.</p>
              </div>
              <div className="ds-note-row">
                <strong>Navigation icons</strong>
                <p>Stroke-based UI icons stay light, monochrome, and secondary until hover, focus, or active state.</p>
              </div>
              <div className="ds-note-row">
                <strong>Status color</strong>
                <p>Accent and chip colors communicate selection and media context, not arbitrary decoration.</p>
              </div>
            </div>
          </RuleCard>
        </div>
      </Section>

      <Section eyebrow="12" title="Shared vs Surface-Specific">
        <div className="ds-utility-grid">
          {surfaceOwnership.map(([label, copy]) => (
            <RuleCard key={label} label={label}>
              <p>{copy}</p>
            </RuleCard>
          ))}
        </div>
      </Section>

      <Section eyebrow="13" title="Layout Rules">
        <p className="ds-section-note">
          These are not visual components by themselves. They are guardrails for where components live.
        </p>
        <div className="ds-layout-grid">
          <div className="ds-layout-rule">
            <div className="ds-layout-rule-art">
              <img src="/ds/layout-fixed-frame.jpg" alt="Fixed app frame" />
            </div>
            <strong>Fixed app frame</strong>
            <p>Header and bottom tabs stay fixed; content scrolls inside the app surface.</p>
          </div>
          <div className="ds-layout-rule">
            <div className="ds-layout-rule-art">
              <img src="/ds/layout-panel.jpg" alt="Side reading panel" />
            </div>
            <strong>Side reading panel</strong>
            <p>Media details open in a right-side sheet capped by the panel width token.</p>
          </div>
          <div className="ds-layout-rule">
            <div className="ds-layout-rule-art">
              <img src="/ds/layout-focused.jpg" alt="Focused content width" />
            </div>
            <strong>Focused content width</strong>
            <p>Legal, settings, and onboarding flows use the content max width for readable forms.</p>
          </div>
          <div className="ds-layout-rule">
            <div className="ds-layout-rule-art">
              <img src="/ds/layout-bands.jpg" alt="Full-width bands" />
            </div>
            <strong>Full-width bands</strong>
            <p>Bars and section headers run edge to edge inside their section; cards hold the rounded surfaces.</p>
          </div>
        </div>

        <h3 className="ds-subsection-title">Layout dimension tokens</h3>
        <p className="ds-section-note" style={{ marginTop: '0.25rem' }}>
          The fixed dimensions these rules lean on, defined once in <code>tokens.css</code>.
        </p>
        <div className="ds-layout-token-grid">
          {layoutTokens.map(([token, value, purpose]) => (
            <div key={token} className="ds-layout-token">
              <span className="ds-layout-token-value">{value}</span>
              <code>{token}</code>
              <p>{purpose}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="14" title="Error, Empty, and Loading States">
        <p className="ds-section-note">
          All full-page error screens share one dark centered design — including the marketing site's 404, which shares this exact layout and copy. In-app empty states use a minimal inline pattern, and loading falls back to the animated PLOT mark.
        </p>

        {/* Full-page error screens */}
        <div className="ds-error-screens">
          {/* Crash screen */}
          <div className="ds-error-screen-demo">
            <div className="ds-error-preview ds-error-preview--crash">
              <div className="ds-ep-logo">
                <svg viewBox="0 0 100 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 48, height: 12 }}>
                  <text x="0" y="20" fontFamily="'Instrument Serif', Georgia, serif" fontSize="22" fill="#f0efe8" letterSpacing="-1">PLOT</text>
                </svg>
              </div>
              <div className="ds-ep-code">Oops</div>
              <div className="ds-ep-title">That scene didn't quite load.</div>
              <div className="ds-ep-body">An unexpected error interrupted things. A quick reload usually gets you back on track.</div>
              <div className="ds-ep-actions">
                <span className="ds-ep-btn-primary">Reload</span>
                <span className="ds-ep-btn-ghost">Go home</span>
              </div>
            </div>
            <div className="ds-error-screen-meta">
              <strong>Crash screen</strong>
              <p>Shown by <code>ErrorBoundary</code> when a JS runtime error interrupts rendering. Background <code>#0c0c0c</code>, code rendered in Instrument Serif at fluid 4–8rem, body in DM Sans 300.</p>
              <div className="ds-error-tokens">
                <span className="ds-chip ds-chip--meta">ErrorBoundary → CrashScreen</span>
              </div>
            </div>
          </div>

          {/* 404 screen */}
          <div className="ds-error-screen-demo">
            <div className="ds-error-preview ds-error-preview--crash">
              <div className="ds-ep-logo">
                <svg viewBox="0 0 100 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 48, height: 12 }}>
                  <text x="0" y="20" fontFamily="'Instrument Serif', Georgia, serif" fontSize="22" fill="#f0efe8" letterSpacing="-1">PLOT</text>
                </svg>
              </div>
              <div className="ds-ep-code">404</div>
              <div className="ds-ep-title">Looks like we've hit a plot hole.</div>
              <div className="ds-ep-body">Let's get you back to something worth watching.</div>
              <div className="ds-ep-actions">
                <span className="ds-ep-btn-primary">Go home</span>
                <span className="ds-ep-btn-ghost">Search titles</span>
              </div>
            </div>
            <div className="ds-error-screen-meta">
              <strong>404 — Not found</strong>
              <p>Rendered by <code>NotFoundPage</code> via the shared <code>ErrorScreen</code> component — the exact same dark centered layout as the crash screen, only the code and copy differ.</p>
              <div className="ds-error-tokens">
                <span className="ds-chip ds-chip--meta">router * → NotFoundPage</span>
                <span className="ds-chip ds-chip--meta">ErrorScreen component</span>
              </div>
            </div>
          </div>
        </div>

        {/* In-app empty states */}
        <h3 className="ds-subsection-title">In-app empty states</h3>
        <p className="ds-section-note" style={{ marginTop: '0.25rem' }}>
          Used inside views when a list is empty. Icon + title + body stack, centered, muted.
        </p>
        <div className="ds-empty-states-grid">
          <div className="ds-empty-state-card">
            <div className="ds-empty-state-demo">
              <div className="empty-state">
                <div className="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 36, height: 36, opacity: 0.35 }}>
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="empty-title">Nothing saved yet</div>
                <div className="empty-body">Browse the Guide or search for titles and tap the bookmark to save them here.</div>
              </div>
            </div>
            <div className="ds-empty-state-label">Watchlist · <code>.empty-state</code></div>
          </div>
          <div className="ds-empty-state-card">
            <div className="ds-empty-state-demo">
              <div className="empty-state">
                <div className="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 36, height: 36, opacity: 0.35 }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>
                <div className="empty-title">No results</div>
                <div className="empty-body">Try searching by title, cast, or genre.</div>
              </div>
            </div>
            <div className="ds-empty-state-label">Search · <code>.empty-state</code></div>
          </div>
          <div className="ds-empty-state-card">
            <div className="ds-empty-state-demo">
              <div className="empty-state">
                <div className="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 36, height: 36, opacity: 0.35 }}>
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div className="empty-title">Nothing in progress</div>
                <div className="empty-body">Start watching a series and it'll appear here.</div>
              </div>
            </div>
            <div className="ds-empty-state-label">Watching · <code>.empty-state</code></div>
          </div>
          <div className="ds-empty-state-card">
            <div className="ds-empty-state-demo">
              <div className="empty-state">
                <div className="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 36, height: 36, opacity: 0.35 }}>
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <div className="empty-title">Nothing watched yet</div>
                <div className="empty-body">Mark titles as watched from your Saved list or from Search.</div>
              </div>
            </div>
            <div className="ds-empty-state-label">History · <code>.empty-state</code></div>
          </div>
        </div>
        <div className="ds-code-note">
          <code>{`<div className="empty-state">\n  <div className="empty-icon">…</div>\n  <div className="empty-title">Nothing saved yet</div>\n  <div className="empty-body">Browse the Guide or search for titles.</div>\n</div>`}</code>
        </div>

        {/* Loading state */}
        <h3 className="ds-subsection-title">Loading state</h3>
        <p className="ds-section-note" style={{ marginTop: '0.25rem' }}>
          While a route or panel resolves, the app shows the PLOT wordmark with its letters pulsing in sequence — centered on the surface, never a spinner.
        </p>
        <div className="ds-loader-grid">
          <div className="ds-loader-card">
            <div className="ds-loader-demo">
              <PlotLoader size="lg" tone={dark ? 'dark' : 'light'} />
            </div>
            <div className="ds-loader-label">Route fallback · <code>&lt;LoadingSpinner /&gt;</code> → <code>PlotLoader</code></div>
          </div>
          <div className="ds-loader-card">
            <div className="ds-loader-demo">
              <PlotLoader size="sm" tone={dark ? 'dark' : 'light'} />
            </div>
            <div className="ds-loader-label">Inline / button scale · <code>size="sm"</code></div>
          </div>
        </div>
      </Section>

      <Section eyebrow="15" title="Cross-Surface & Token Architecture">
        <p className="ds-section-note">
          One brand, three surfaces — the app, the marketing site (theplot.tv), and transactional email. They stay consistent because they all resolve to a single source of truth.
        </p>
        <div className="ds-utility-grid">
          <RuleCard label="Source of truth">
            <div className="ds-note-list">
              <div className="ds-note-row">
                <strong>core/tokens.js</strong>
                <p>Canonical colors + radii for every surface. The app CSS (<code>tokens.css</code>) and the marketing site (<code>website/theme.css</code>) both derive from it; email generators import it at build time.</p>
              </div>
              <div className="ds-note-row">
                <strong>Enforced in CI</strong>
                <p><code>tokens:check</code> guards the app CSS, <code>tokens:marketing</code> guards the website + social cards + collateral, and <code>emails:check</code> guards the auth templates. Drift fails the build, not review.</p>
              </div>
              <div className="ds-note-row">
                <strong>One dark palette</strong>
                <p>The app dark theme, marketing dark sections, and every error screen share <code>#0c0c0c</code> / <code>#f0efe8</code>. There is no separate "error dark".</p>
              </div>
            </div>
          </RuleCard>
          <RuleCard label="Marketing-surface tokens">
            <div className="ds-note-list">
              <div className="ds-note-row ds-cross-swatch-row">
                <span className="ds-swatch" style={{ background: 'var(--accent)' }} />
                <p><strong>--accent</strong> — brand pink, identical value on the app and the site (name and semantics now match).</p>
              </div>
              <div className="ds-note-row ds-cross-swatch-row">
                <span className="ds-swatch" style={{ background: '#000000' }} />
                <p><strong>--ink</strong> — near-black CTA fill, marketing-only. The app's primary button uses <code>--text-primary</code> instead.</p>
              </div>
              <div className="ds-note-row ds-cross-swatch-row">
                <span className="ds-swatch" style={{ background: '#059669' }} />
                <p><strong>--success</strong> — "saved / added" confirmation; the same green as the app's <code>--chip-now</code>.</p>
              </div>
            </div>
          </RuleCard>
        </div>

        <h3 className="ds-subsection-title">Marketing-only patterns</h3>
        <p className="ds-section-note" style={{ marginTop: '0.25rem' }}>
          These live only on the marketing site by design. They inherit the shared tokens, fonts, and wordmark — but their composition is editorial, not product UI.
        </p>
        <div className="ds-utility-grid">
          <RuleCard label="Editorial display headlines">
            <p>Oversized, condensed Instrument Serif (see §01) for hero and manifesto moments. The app never sets type this large.</p>
          </RuleCard>
          <RuleCard label="Black CTA button">
            <p>The marketing primary button fills with <code>--ink</code>; the app keeps its quieter <code>--text-primary</code> button.</p>
          </RuleCard>
          <RuleCard label="Grain + poster wall">
            <p>A fixed film-grain overlay and a rotating editorial poster wall set the marketing tone; the app surface stays clean.</p>
          </RuleCard>
          <RuleCard label="Live ticker">
            <p>The scrolling "what's on" ticker is a marketing-home device, not part of the fixed app shell.</p>
          </RuleCard>
        </div>
      </Section>

      <Section eyebrow="16" title="Share & Social Cards">
        <p className="ds-section-note">
          When a PLOT link is shared — a title texted to a friend, a profile or list posted — it unfurls as a 1200×630 card generated on the fly by <code>/api/og</code>. All three variants share the brand dark, Instrument Serif titles, DM Sans meta, the accent eyebrow, and the PLOT wordmark. (Samples below are the real rendered output.)
        </p>

        <div className="ds-share-grid">
          <figure className="ds-share-card">
            <img src="/ds/share-title.jpg" alt="Title share card — Dune: Part Two" />
            <figcaption>
              <strong>Title card</strong>
              <p>Sent when someone shares a movie or show. Backdrop + poster, "Found on PLOT" eyebrow, year · type · rating. <code>/api/og?type=movie&amp;id=…</code></p>
            </figcaption>
          </figure>
          <figure className="ds-share-card">
            <img src="/ds/share-profile.jpg" alt="Profile share card" />
            <figcaption>
              <strong>Profile card</strong>
              <p>Avatar, name, supporter seal, and watch stats over a backdrop from a recent watch. <code>/api/og?u=…</code></p>
            </figcaption>
          </figure>
          <figure className="ds-share-card">
            <img src="/ds/share-list.jpg" alt="List share card" />
            <figcaption>
              <strong>List card</strong>
              <p>List name, owner, and up to five posters. "PLOT LISTS" eyebrow. <code>/api/og?list=…</code></p>
            </figcaption>
          </figure>
        </div>

        <div className="ds-utility-grid">
          <RuleCard label="How a link becomes a card">
            <div className="ds-note-list">
              <div className="ds-note-row"><strong>Title</strong><p>An in-app Share button builds a <code>/save</code> link; <code>api/save.js</code> rewrites the page head so <code>og:image</code> points at <code>/api/og?type=&amp;id=</code>.</p></div>
              <div className="ds-note-row"><strong>Profile</strong><p><code>/u/&lt;username&gt;</code> → <code>api/profile.js</code> → <code>og:image = /api/og?u=</code>.</p></div>
              <div className="ds-note-row"><strong>List</strong><p><code>/list/&lt;id&gt;</code> → <code>api/list.js</code> → <code>og:image = /api/og?list=</code>.</p></div>
              <div className="ds-note-row"><strong>Fallback</strong><p>Bare-domain links use the static 1200×630 <code>og-image</code>. Each card also has a branded no-data fallback (wordmark + tagline).</p></div>
            </div>
          </RuleCard>
          <RuleCard label="Shared spec">
            <div className="ds-note-list">
              <div className="ds-note-row"><strong>Canvas</strong><p>1200×630, brand dark, PLOT wordmark, accent eyebrow — <code>--accent</code> sourced from <code>core/tokens.js</code>.</p></div>
              <div className="ds-note-row"><strong>Type</strong><p>Instrument Serif titles (fluid 58–106px by length), DM Sans meta + labels. The same two families as every other surface.</p></div>
              <div className="ds-note-row"><strong>Source</strong><p>Rendered by <code>api/og.js</code> via @vercel/og. These samples come from the real builders via <code>scripts/gen-share-samples.mjs</code>.</p></div>
            </div>
          </RuleCard>
        </div>

        <h3 className="ds-subsection-title">One card, every surface</h3>
        <p className="ds-section-note" style={{ marginTop: '0.25rem' }}>
          A title now unfurls identically wherever its link is shared: the app's <code>/save</code> link and the marketing <code>theplot.tv/movie/:slug</code> page (<code>supabase/functions/title-page</code>) both point <code>og:image</code> at the same branded <code>/api/og</code> card. <code>/whats-on</code> articles use their branded per-post render, and the <code>/whats-on</code> index + chart carry the branded fallback image. The real poster still backs the JSON-LD for SEO rich results.
        </p>
      </Section>

      <Section eyebrow="17" title="Marketing Collateral">
        <p className="ds-section-note">
          Outbound assets we publish — social posts, channel art, avatars. Unlike the share cards in §16, these aren't link previews; they're posted to Instagram, X, and Threads. They still inherit the same wordmark, Instrument Serif display, DM Sans labels, accent, and dark palette.
        </p>

        <h3 className="ds-subsection-title">Social post templates</h3>
        <p className="ds-section-note" style={{ marginTop: '0.25rem' }}>
          Nine per-post templates (now-streaming, watch-tonight, trending chart, countdown, feature, hidden-gem, on-this-day, trailer-drop, weekly-slate) rendered from live title art by the weekly pipeline — portrait 1080×1350 for Instagram, landscape 1600×900 for X / Threads.
        </p>
        <div className="ds-collateral-row">
          <figure className="ds-collateral-item ds-ci--portrait">
            <img src="/ds/collateral-post-streaming.jpg" alt="Now streaming social post" />
            <figcaption><strong>Now streaming · portrait</strong>Instagram 1080×1350</figcaption>
          </figure>
          <figure className="ds-collateral-item ds-ci--landscape">
            <img src="/ds/collateral-post-tonight.jpg" alt="Watch tonight social post" />
            <figcaption><strong>Watch tonight · landscape</strong>X / Threads 1600×900</figcaption>
          </figure>
          <figure className="ds-collateral-item ds-ci--landscape">
            <img src="/ds/collateral-post-chart.jpg" alt="Trending chart social post" />
            <figcaption><strong>Trending chart · landscape</strong>The weekly top-10 ranking</figcaption>
          </figure>
        </div>

        <h3 className="ds-subsection-title">Channel &amp; profile art</h3>
        <p className="ds-section-note" style={{ marginTop: '0.25rem' }}>
          Hand-made brand collateral — account headers, decorative covers, and avatars. Static, rendered once from <code>marketing/assets/</code>.
        </p>
        <div className="ds-collateral-row">
          <figure className="ds-collateral-item ds-ci--wide">
            <img src="/ds/collateral-x-header.jpg" alt="X header and brand cover — centered PLOT wordmark on cream" />
            <figcaption><strong>X / Twitter header &amp; brand cover</strong>Centered Instrument Serif wordmark, ink on cream · 1500×500 · used for both</figcaption>
          </figure>
          <figure className="ds-collateral-item ds-ci--landscape">
            <img src="/ds/collateral-cover-billing.jpg" alt="Brand cover, billing block" />
            <figcaption><strong>Brand cover · billing</strong>Poster-style promo variant</figcaption>
          </figure>
          <figure className="ds-collateral-item ds-ci--square">
            <img src="/ds/collateral-ig-wordmark.jpg" alt="Instagram avatar, wordmark" />
            <figcaption><strong>Avatar · wordmark</strong>1080²</figcaption>
          </figure>
          <figure className="ds-collateral-item ds-ci--square">
            <img src="/ds/collateral-ig-monogram.jpg" alt="Instagram avatar, monogram" />
            <figcaption><strong>Avatar · monogram</strong>Tiny sizes</figcaption>
          </figure>
        </div>
      </Section>
    </div>
  );
}
