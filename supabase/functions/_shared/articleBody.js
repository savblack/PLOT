// What's On article blocks. page_body is an array of paragraphs, and the feed
// used to escape each one into a <p>. A comparison table then showed up as
// pipe characters, or as escaped <table> tags. This renders two shapes and
// leaves every other paragraph as escaped text:
//
//   1. A GitHub-style markdown table (header, a | --- | separator, body rows).
//   2. A single HTML <table> using a small set of tags.
//
// Anything else, including a table that fails the allowlist, is escaped.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ALLOWED_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'br', 'strong', 'em']);
const VOID_TAGS = new Set(['br']);
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'svg', 'math', 'img', 'form', 'input', 'button', 'textarea', 'video', 'audio', 'source']);
const UNWRAP_TAGS = new Set(['a', 'b', 'i', 'p', 'span', 'div']);
const CELL_ATTRS = new Set(['colspan', 'rowspan']);

export const ARTICLE_TABLE_CSS = `
  .post-body { min-width: 0; }
  .post-body .table-scroll { overflow-x: auto; max-width: 100%; margin: 0 0 28px; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; }
  .post-body table { width: 100%; min-width: 32rem; border-collapse: collapse; font-size: 0.92rem; line-height: 1.45; color: var(--ink); }
  .post-body th, .post-body td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--hair); overflow-wrap: break-word; }
  .post-body th { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--mut); }
  .post-body td.a-center, .post-body th.a-center { text-align: center; }
  .post-body td.a-right, .post-body th.a-right { text-align: right; }
  .post-body caption { caption-side: bottom; text-align: left; color: var(--mut); font-size: 0.82rem; padding-top: 8px; }
`;

const splitCells = (line) => {
  let s = String(line ?? '').trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
};

const isSeparatorLine = (line) => {
  if (!String(line).includes('-')) return false;
  const cells = splitCells(line);
  return cells.length >= 2 && cells.every((c) => /^:?-{3,}:?$/.test(c));
};

const isPipeLine = (line) => String(line).trim().includes('|');

const alignment = (cell) => {
  const t = String(cell).trim();
  const left = t.startsWith(':');
  const right = t.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return 'left';
};

const alignClass = (align) => (align === 'center' || align === 'right' ? ` class="a-${align}"` : '');

/**
 * True when a /copy paragraph must keep its line breaks. Prose still collapses
 * soft breaks into one line. A table cannot: the row breaks are the syntax.
 * @param {string} text
 */
/**
 * A page_body entry that should render as a table rather than a poster paragraph.
 * @param {string} text
 */
export const isArticleTable = (text) => {
  const raw = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!raw) return false;
  if (keepsParagraphBreaks(raw)) return true;
  return !raw.includes('\n') && recoverCollapsed(raw) != null;
};

export const keepsParagraphBreaks = (text) => {
  const raw = String(text ?? '');
  if (/<table[\s>]/i.test(raw) && /<\/table>/i.test(raw)) return true;
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (isPipeLine(lines[i]) && isSeparatorLine(lines[i + 1])) return true;
  }
  return false;
};

const segmentMarkdown = (raw) => {
  const lines = raw.split('\n');
  const parts = [];
  let prose = [];
  const pushProse = () => {
    const text = prose.join('\n').trim();
    prose = [];
    if (text) parts.push({ type: 'prose', text });
  };
  let i = 0;
  while (i < lines.length) {
    const next = lines[i + 1];
    if (isPipeLine(lines[i]) && next != null && isSeparatorLine(next)) {
      const start = i;
      const header = splitCells(lines[i]);
      const align = splitCells(next).map(alignment);
      const body = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && isPipeLine(lines[i]) && !isSeparatorLine(lines[i])) {
        body.push(splitCells(lines[i]));
        i++;
      }
      if (header.length >= 2 && body.length) {
        pushProse();
        parts.push({ type: 'table', header, align, body });
      } else {
        prose.push(...lines.slice(start, i));
      }
      continue;
    }
    prose.push(lines[i]);
    i++;
  }
  pushProse();
  return parts;
};

// A /copy edit used to join every line of a paragraph with spaces, which left
// `| Stay | Export | | --- | --- | | Keep | Move |` in the database. Recover
// that shape when the column counts still agree. A blank cell (`| |`) uses the
// same join, so a flattened table with an empty cell is left as text.
const recoverCollapsed = (text) => {
  if (/[\r\n]/.test(text) || !text.includes('|') || !/-{3,}/.test(text)) return null;
  const parts = text.split(/\|\s+\|/);
  if (parts.length < 3) return null;
  const lines = parts.map((part) => {
    let row = part.trim();
    if (!row.startsWith('|')) row = `| ${row}`;
    if (!row.endsWith('|')) row = `${row} |`;
    return row;
  });
  const sepAt = lines.findIndex(isSeparatorLine);
  if (sepAt !== 1) return null;
  const header = splitCells(lines[0]);
  const align = splitCells(lines[sepAt]).map(alignment);
  if (header.length < 2 || header.length !== align.length) return null;
  const body = [];
  for (const line of lines.slice(sepAt + 1)) {
    if (!isPipeLine(line) || isSeparatorLine(line)) return null;
    const cells = splitCells(line);
    if (cells.length !== header.length) return null;
    body.push(cells);
  }
  if (!body.length) return null;
  return { type: 'table', header, align, body };
};

const renderMdTable = ({ header, align, body }) => {
  const th = header.map((cell, i) => `<th${alignClass(align[i])}>${esc(cell)}</th>`).join('');
  const rows = body.map((row) => {
    const cols = header.length;
    const cells = Array.from({ length: cols }, (_, i) => row[i] ?? '');
    return `<tr>${cells.map((cell, i) => `<td${alignClass(align[i])}>${esc(cell)}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="table-scroll"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
};

const decodeBasic = (s) => s
  .replace(/&nbsp;/gi, ' ')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&amp;/gi, '&');

const safeAttrs = (tag, raw) => {
  if (tag !== 'th' && tag !== 'td') return '';
  const allowed = tag === 'th' ? new Set([...CELL_ATTRS, 'scope']) : CELL_ATTRS;
  const out = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = attrRe.exec(raw))) {
    const name = m[1].toLowerCase();
    if (!allowed.has(name)) continue;
    const value = decodeBasic(m[2] ?? m[3] ?? m[4] ?? '');
    if (name === 'colspan' || name === 'rowspan') {
      if (!/^[1-9]\d{0,2}$/.test(value)) continue;
    } else if (name === 'scope' && !/^(col|row|colgroup|rowgroup)$/i.test(value)) {
      continue;
    }
    out.push(`${name}="${esc(value)}"`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
};

/**
 * @param {string} input
 * @returns {string | null} a scroll wrapper, or null when the markup is not a table
 */
const sanitizeTableHtml = (input) => {
  const src = String(input);
  let i = 0;
  const out = [];
  const stack = [];

  while (i < src.length) {
    // Skip a comment in the scanner. A replace of `<!--...-->` is not enough:
    // `<!<!---->` still contains `<!--` after one pass, which is the injection
    // CodeQL flags. An unclosed comment fails the whole table.
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end === -1) return null;
      i = end + 3;
      continue;
    }
    if (src[i] !== '<') {
      const next = src.indexOf('<', i);
      const text = next === -1 ? src.slice(i) : src.slice(i, next);
      out.push(esc(decodeBasic(text)));
      i = next === -1 ? src.length : next;
      continue;
    }
    const close = src.indexOf('>', i);
    if (close === -1) return null;
    const raw = src.slice(i + 1, close).trim();
    i = close + 1;
    if (raw.startsWith('!') || raw.startsWith('?')) return null;
    const closing = raw.startsWith('/');
    const selfClosing = /\/$/.test(raw);
    const body = raw.replace(/^\//, '').replace(/\/$/, '').trim();
    const space = body.search(/\s/);
    const name = (space === -1 ? body : body.slice(0, space)).toLowerCase();
    const attrSrc = space === -1 ? '' : body.slice(space);
    if (!name || !/^[a-z][a-z0-9]*$/.test(name)) return null;

    if (DROP_TAGS.has(name)) {
      if (!closing && !selfClosing && name !== 'img' && name !== 'input' && name !== 'br' && name !== 'source') {
        const end = src.toLowerCase().indexOf(`</${name}>`, i);
        if (end === -1) return null;
        i = end + name.length + 3;
      }
      continue;
    }
    if (UNWRAP_TAGS.has(name)) continue;
    if (!ALLOWED_TAGS.has(name)) return null;

    if (closing) {
      if (VOID_TAGS.has(name)) continue;
      if (stack.pop() !== name) return null;
      out.push(`</${name}>`);
      continue;
    }
    if (name === 'br') {
      out.push('<br>');
      continue;
    }
    const attrs = safeAttrs(name, attrSrc);
    out.push(attrs ? `<${name}${attrs}>` : `<${name}>`);
    if (!selfClosing && !VOID_TAGS.has(name)) stack.push(name);
  }
  if (stack.length) return null;
  const html = out.join('').trim();
  if (!/^<table>[\s\S]*<\/table>$/i.test(html) && !/^<table [\s\S]*>[\s\S]*<\/table>$/i.test(html)) return null;
  if ((html.match(/<table\b/gi) || []).length !== 1) return null;
  return `<div class="table-scroll">${html}</div>`;
};

const splitHtmlTables = (raw) => {
  const re = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
  const parts = [];
  let last = 0;
  let m;
  while ((m = re.exec(raw))) {
    if (m.index > last) parts.push({ type: 'prose', text: raw.slice(last, m.index) });
    parts.push({ type: 'html', html: m[0] });
    last = m.index + m[0].length;
  }
  if (last < raw.length) parts.push({ type: 'prose', text: raw.slice(last) });
  return parts.length ? parts : [{ type: 'prose', text: raw }];
};

const renderParts = (parts, lede) => parts.map((part, idx) => {
  if (part.type === 'table') return renderMdTable(part);
  if (part.type === 'html') return sanitizeTableHtml(part.html) || `<p>${esc(part.html)}</p>`;
  const text = part.text.replace(/\s*\n\s*/g, ' ').trim();
  if (!text) return '';
  const cls = lede && idx === 0 ? ' class="lede"' : '';
  return `<p${cls}>${esc(text)}</p>`;
}).join('');

/**
 * Render one page_body entry.
 * @param {string} text
 * @param {{ lede?: boolean }} [opts]  the opening paragraph of an article
 */
export const renderArticleBlock = (text, { lede = false } = {}) => {
  const raw = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';
  if (/<table[\s>]/i.test(raw)) return renderParts(splitHtmlTables(raw), lede);
  if (!raw.includes('\n')) {
    const recovered = recoverCollapsed(raw);
    if (recovered) return renderMdTable(recovered);
  }
  return renderParts(segmentMarkdown(raw), lede);
};

const firstProse = (raw) => {
  const text = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  const parts = /<table[\s>]/i.test(text)
    ? splitHtmlTables(text)
    : (!text.includes('\n') && recoverCollapsed(text) ? [] : segmentMarkdown(text));
  for (const part of parts) {
    if (part.type !== 'prose') continue;
    const prose = part.text.replace(/<[^>]+>/g, ' ').replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (prose) return prose;
  }
  return '';
};

/**
 * First prose in a page_body, skipping a table. Used for the card dek and the
 * meta description so a comparison table is not the preview sentence.
 * @param {string[]} blocks
 * @param {number} [limit]  0 means the whole paragraph
 */
export const articleExcerpt = (blocks, limit = 0) => {
  const list = Array.isArray(blocks) ? blocks : [];
  for (const block of list) {
    const prose = firstProse(block);
    if (!prose) continue;
    return limit > 0 ? prose.slice(0, limit) : prose;
  }
  return '';
};
