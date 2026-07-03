import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationBrief } from '../copy/brief.mjs';

test('generic conversation brief forbids title-specific prompts', async () => {
  const brief = await buildConversationBrief({
    id: 'generic-post',
    payload: { topic: { mode: 'generic' } },
  });

  assert.match(brief, /GENERIC question/i);
  assert.match(brief, /No title names at all/i);
  assert.match(brief, /literal watches/i);
  assert.match(brief, /movie, film, show, series, or TV/i);
  assert.match(brief, /Do not force tidy lists of three/i);
  assert.match(brief, /Avoid the "it's not X, it's Y" setup/i);
});
