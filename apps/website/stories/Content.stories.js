// Browses every string in apps/website/copy/ — the reference-only catalog
// documenting copy that's actually live on the static site. Unlike apps/web's
// equivalent story, these modules are NOT imported by the HTML (this site has
// no bundler), so this page can drift from the live site if copy/ isn't kept
// in sync by hand when the HTML changes. See copy/common.js for details.

import { NAV, FOOTER, EMAIL_FORM } from '../copy/common.js';
import {
  META, HERO, MANIFESTO, GUIDE_DEMO, TIMELINE, CALENDAR_DEMO, LISTS_DEMO, APP_SOON, TICKER, WHATS_ON_CTA,
} from '../copy/index.js';
import { ABOUT_PAGE } from '../copy/about.js';
import { PLANS_PAGE } from '../copy/plans.js';
import { NOT_FOUND_PAGE } from '../copy/404.js';
import { FOOTER_PARTIAL } from '../copy/footer.js';

export default {
  title: 'Content/Catalog',
  parameters: { layout: 'padded' },
};

const MODULES = {
  'common.nav': NAV,
  'common.footer': FOOTER,
  'common.emailForm': EMAIL_FORM,
  'index.meta': META,
  'index.hero': HERO,
  'index.manifesto': MANIFESTO,
  'index.guideDemo': GUIDE_DEMO,
  'index.timeline': TIMELINE,
  'index.calendarDemo': CALENDAR_DEMO,
  'index.listsDemo': LISTS_DEMO,
  'index.appSoon': APP_SOON,
  'index.ticker': TICKER,
  'index.whatsOnCta': WHATS_ON_CTA,
  about: ABOUT_PAGE,
  plans: PLANS_PAGE,
  '404': NOT_FOUND_PAGE,
  footerPartial: FOOTER_PARTIAL,
};

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

export const AllCopy = () => {
  const rows = allRows();

  const wrap = document.createElement('div');
  wrap.style.fontFamily = 'sans-serif';
  wrap.style.maxWidth = '960px';

  const note = document.createElement('p');
  note.style.color = '#666';
  note.style.fontSize = '0.85rem';
  note.style.marginBottom = '1rem';
  note.textContent =
    `Every string in copy/ — ${rows.length} entries across ${Object.keys(MODULES).length} modules. ` +
    'Reference-only: this site has no bundler, so these files document what\'s live on the HTML pages but are not imported by them.';
  wrap.appendChild(note);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Filter by module, key, or text…';
  input.style.cssText = 'width:100%;box-sizing:border-box;padding:0.5rem 0.75rem;margin-bottom:1rem;border:1px solid #ccc;border-radius:6px;font-size:0.9rem;';
  wrap.appendChild(input);

  const countLine = document.createElement('div');
  countLine.style.cssText = 'font-size:0.75rem;color:#888;margin-bottom:0.5rem;';
  wrap.appendChild(countLine);

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.82rem;';
  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr style="text-align:left;border-bottom:2px solid #ccc;">' +
    '<th style="padding:0.4rem 0.5rem;width:14%;">Module</th>' +
    '<th style="padding:0.4rem 0.5rem;width:26%;">Key</th>' +
    '<th style="padding:0.4rem 0.5rem;">Value</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  wrap.appendChild(table);

  function render(query) {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.module.toLowerCase().includes(q) || r.path.toLowerCase().includes(q) || r.value.toLowerCase().includes(q))
      : rows;

    countLine.textContent = `${filtered.length} of ${rows.length} shown`;
    tbody.innerHTML = '';
    for (const r of filtered) {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #eee';

      const moduleTd = document.createElement('td');
      moduleTd.style.cssText = 'padding:0.4rem 0.5rem;color:#888;vertical-align:top;';
      moduleTd.textContent = r.module;

      const keyTd = document.createElement('td');
      keyTd.style.cssText = 'padding:0.4rem 0.5rem;font-family:monospace;vertical-align:top;';
      keyTd.textContent = r.path;

      const valueTd = document.createElement('td');
      valueTd.style.cssText = 'padding:0.4rem 0.5rem;vertical-align:top;';
      if (r.kind === 'function') {
        const code = document.createElement('code');
        code.style.cssText = 'font-size:0.78rem;color:#e0557a;';
        code.textContent = r.value;
        valueTd.appendChild(code);
      } else {
        valueTd.textContent = r.value;
      }

      tr.append(moduleTd, keyTd, valueTd);
      tbody.appendChild(tr);
    }
  }

  input.addEventListener('input', () => render(input.value));
  render('');

  return wrap;
};
