// Validate copy JSON the way save.mjs does, without writing the database.
// The Saturday comparison uses this so a second model can be checked against
// the same briefs without booking the week or replacing Claude's saved copy.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCopy, validateConversation, validateGuide } from './schema.mjs';

export const checkDir = async (dir) => {
  let names = [];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.copy.json'));
  } catch {
    return { ok: false, results: [{ file: dir, ok: false, errors: ['folder not found'] }] };
  }
  if (!names.length) {
    return { ok: false, results: [{ file: dir, ok: false, errors: ['no .copy.json files'] }] };
  }

  let manifest = new Map();
  try {
    const raw = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    manifest = new Map(raw.map((entry) => [entry.post_id, entry]));
  } catch {
    manifest = new Map();
  }

  const results = [];
  for (const name of names.sort()) {
    const postId = name.replace(/\.copy\.json$/, '');
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
    } catch (error) {
      results.push({ file: name, ok: false, errors: [`invalid JSON: ${error.message}`] });
      continue;
    }
    const entry = manifest.get(postId);
    const postType = entry?.post_type;
    const checked = postType === 'question'
      ? validateConversation(parsed)
      : postType === 'guide'
        ? validateGuide(parsed, entry?.n_titles)
        : validateCopy(parsed, {
          days_until: entry?.days_until,
          when_label: entry?.when_label,
          post_type: postType,
          home_kind: entry?.home_kind,
        });
    results.push({ file: name, ok: checked.valid, errors: checked.errors });
  }
  return { ok: results.every((result) => result.ok), results };
};

const main = async () => {
  const dir = process.argv[2] || new URL('./jobs/', import.meta.url).pathname;
  const { ok, results } = await checkDir(dir);
  for (const result of results) {
    if (result.ok) console.log(`ok ${result.file}`);
    else console.error(`no ${result.file}: ${result.errors.join('; ')}`);
  }
  if (!ok) process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
