import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkDir } from '../copy/check.mjs';

test('checkDir rejects a caption with an em dash and does not need the database', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'plot-copy-check-'));
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify([
    { post_id: 'post-1', post_type: 'hidden_gem' },
  ]));
  await writeFile(path.join(dir, 'post-1.copy.json'), JSON.stringify({
    x: 'A quiet film — and a loud one.',
    instagram: 'A quiet film.',
    threads: 'A quiet film.',
    hashtags: ['movies', 'tv', 'plot'],
    alt_text: 'A poster.',
    cta_variant: 'track_it',
    page_title: 'A quiet film',
    page_body: 'One sentence.',
    sources: [],
  }));

  const { ok, results } = await checkDir(dir);
  assert.equal(ok, false);
  assert.match(results[0].errors.join(' '), /dash|em dash|—/i);
});
