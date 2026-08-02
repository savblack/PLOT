import { useMemo, useState } from 'react';
import { APP_SHELL } from '../copy/appShell.js';
import { AUTH_CALLBACK_PAGE } from '../copy/authCallbackPage.js';
import { AUTH_PAGE } from '../copy/authPage.js';
import { CALENDAR_VIEW } from '../copy/calendarView.js';
import { COMMON } from '../copy/common.js';
import { CONFIRM_MODAL } from '../copy/confirmModal.js';
import { EPG_VIEW } from '../copy/epgView.js';
import { IMPORT_VIEW } from '../copy/importView.js';
import { MEDIA } from '../copy/media.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { ONBOARDING_FLOW } from '../copy/onboardingFlow.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { PUBLIC_PROFILE_PAGE } from '../copy/publicProfilePage.js';
import { RESET_PASSWORD_PAGE } from '../copy/resetPasswordPage.js';
import { SAVE_PAGE } from '../copy/savePage.js';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { TRAKT_CALLBACK_PAGE } from '../copy/traktCallbackPage.js';
import { WATCHLIST_VIEW } from '../copy/watchlistView.js';

// Every copy module in src/copy/, in one place — this file is the entire
// point of the catalog: if a module isn't listed here, it isn't browsable.
const MODULES = {
  common: COMMON,
  media: MEDIA,
  appShell: APP_SHELL,
  authPage: AUTH_PAGE,
  authCallbackPage: AUTH_CALLBACK_PAGE,
  calendarView: CALENDAR_VIEW,
  confirmModal: CONFIRM_MODAL,
  epgView: EPG_VIEW,
  importView: IMPORT_VIEW,
  mediaPanel: MEDIA_PANEL,
  onboardingFlow: ONBOARDING_FLOW,
  plansPage: PLANS_PAGE,
  publicProfilePage: PUBLIC_PROFILE_PAGE,
  resetPasswordPage: RESET_PASSWORD_PAGE,
  savePage: SAVE_PAGE,
  settingsView: SETTINGS_VIEW,
  traktCallbackPage: TRAKT_CALLBACK_PAGE,
  watchlistView: WATCHLIST_VIEW,
};

// Recursively walks a copy module (plain strings, nested objects, and arrays)
// into flat {path, value} rows. Functions are shown as their source — most
// are one-line templates like `count => \`${count} selected\`` and reading
// the source is more useful here than trying to guess placeholder args.
function flatten(node, path, out) {
  if (typeof node === 'string') {
    out.push({ path, value: node, kind: 'string' });
  } else if (typeof node === 'function') {
    out.push({ path, value: node.toString(), kind: 'function' });
  } else if (Array.isArray(node)) {
    node.forEach((item, i) => flatten(item, `${path}[${i}]`, out));
  } else if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) flatten(node[key], path ? `${path}.${key}` : key, out);
  } else {
    out.push({ path, value: String(node), kind: 'other' });
  }
}

function allRows() {
  const rows = [];
  for (const moduleName of Object.keys(MODULES)) {
    const moduleRows = [];
    flatten(MODULES[moduleName], '', moduleRows);
    for (const row of moduleRows) rows.push({ module: moduleName, ...row });
  }
  return rows;
}

function ContentCatalog() {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => allRows(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.module.toLowerCase().includes(q) || r.path.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div style={{ fontFamily: 'var(--font-sans, sans-serif)', maxWidth: 960 }}>
      <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Every string in <code>src/copy/</code> — {rows.length} entries across {Object.keys(MODULES).length} modules.
        This is the live source of truth; components import directly from these files.
      </p>
      <input
        type="text"
        placeholder="Filter by module, key, or text…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem', marginBottom: '1rem',
          border: '1px solid var(--border, #ccc)', borderRadius: 6, fontSize: '0.9rem',
        }}
      />
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)', marginBottom: '0.5rem' }}>
        {filtered.length} of {rows.length} shown
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border, #ccc)' }}>
            <th style={{ padding: '0.4rem 0.5rem', width: '14%' }}>Module</th>
            <th style={{ padding: '0.4rem 0.5rem', width: '26%' }}>Key</th>
            <th style={{ padding: '0.4rem 0.5rem' }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => (
            <tr key={`${r.module}.${r.path}.${i}`} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
              <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted, #888)', verticalAlign: 'top' }}>{r.module}</td>
              <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', verticalAlign: 'top' }}>{r.path}</td>
              <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
                {r.kind === 'function'
                  ? <code style={{ fontSize: '0.78rem', color: 'var(--accent, #e0557a)' }}>{r.value}</code>
                  : r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default {
  title: 'Content/Catalog',
};

export const AllCopy = () => <ContentCatalog />;
