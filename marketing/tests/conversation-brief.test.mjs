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
});
