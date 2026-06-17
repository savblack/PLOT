// Shared serializer/parser for the one-file-per-day manual copy doc.
// build.mjs writes it (copy fields = TODO); a human/agent fills the <copy>
// blocks; publish.mjs parses it back. Keeping both sides here stops drift.

const RULE = '─'.repeat(60);

// [key in copy object, human label in the doc]. page_body is multi-paragraph.
export const FIELDS = [
  ['x', 'X'],
  ['instagram', 'Instagram'],
  ['threads', 'Threads'],
  ['alt_text', 'Alt text'],
  ['page_title', "What's On — title"],
  ['page_body', "What's On — body"],
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// posts: [{ title, facts: string[], meta: object, copy?: {...} }]
export const serialize = (date, posts) => {
  const out = [
    `# PLOT — What's On — ${date}`,
    '',
    '<!-- Built by marketing/manual/build.mjs. Images sit beside this file.',
    '     Replace every TODO inside the <copy> blocks (voice guide: marketing/VOICE.md),',
    `     then publish to theplot.tv/whats-on with:  npm run mkt:manual:publish ${date}`,
    '     Delete any post section you do not want before publishing. -->',
    '',
  ];
  for (const p of posts) {
    out.push(RULE, `## ${p.meta.post_type} — ${p.title}`, '');
    out.push('```meta', JSON.stringify(p.meta, null, 2), '```', '');
    for (const f of p.facts || []) out.push(`- ${f}`);
    out.push('', `Suggested CTA: ${p.meta.cta_variant || 'none'}`, '');
    for (const [key, label] of FIELDS) {
      const v = p.copy?.[key];
      const body = key === 'page_body'
        ? (Array.isArray(v) && v.length ? v.join('\n\n') : 'TODO')
        : (v || 'TODO');
      out.push(`### ${label}`, '<copy>', body, '</copy>', '');
    }
  }
  return out.join('\n');
};

// Returns [{ meta, copy }]. Throws if a meta block is malformed.
export const parse = (md) => {
  const sections = md.split(new RegExp(`^${RULE}$`, 'm')).slice(1);
  const posts = [];
  for (const sec of sections) {
    const metaMatch = sec.match(/```meta\n([\s\S]*?)\n```/);
    if (!metaMatch) continue;
    const meta = JSON.parse(metaMatch[1]);
    const copy = { cta_variant: meta.cta_variant };
    for (const [key, label] of FIELDS) {
      const m = sec.match(new RegExp(`### ${escapeRe(label)}\\s*\\n<copy>\\n([\\s\\S]*?)\\n</copy>`));
      const raw = m ? m[1].trim() : '';
      if (key === 'page_body') {
        copy.page_body = raw && raw !== 'TODO'
          ? raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
          : [];
      } else {
        copy[key] = raw === 'TODO' ? '' : raw;
      }
    }
    posts.push({ meta, copy });
  }
  return posts;
};
