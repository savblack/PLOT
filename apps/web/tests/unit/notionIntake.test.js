import assert from 'node:assert/strict';
import test from 'node:test';
import { createIntakePage, intakePageBody } from '../../../../supabase/functions/_shared/notionIntake.js';

const params = {
  databaseId: '11111111-1111-1111-1111-111111111111',
  recordId: 'feedback-123',
  title: 'Bug report',
  submittedAt: '2026-10-15T00:00:00Z',
  fields: [['Reporter', 'Signed-in Plot user']],
  detail: 'Private message',
  links: ['https://example.com/attachment.png'],
};

test('private intake page uses the exact database schema and chunks long text', () => {
  const body = intakePageBody({ ...params, detail: 'x'.repeat(4300) });
  assert.deepEqual(Object.keys(body.properties), ['Name', 'Record ID', 'Submitted', 'Status']);
  assert.equal(body.parent.database_id, params.databaseId);
  assert.equal(body.properties.Status.select.name, 'New');
  assert.equal(body.children.filter((block) => block.type === 'paragraph').length, 5);
  assert.equal(body.children[3].paragraph.rich_text[0].text.content.length, 1900);
});

test('retry finds an existing Notion page without creating a duplicate', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ results: [{ id: 'page-1', url: 'https://notion.so/page-1' }] });
  };
  try {
    assert.deepEqual(await createIntakePage('secret', params), { id: 'page-1', url: 'https://notion.so/page-1' });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/databases\/.*\/query$/);
    assert.deepEqual(JSON.parse(calls[0].options.body).filter,
      { property: 'Record ID', rich_text: { equals: 'feedback-123' } });
  } finally { globalThis.fetch = original; }
});

test('new intake record creates one page in the selected private database', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? Response.json({ results: [] })
      : Response.json({ id: 'page-2', url: 'https://notion.so/page-2' });
  };
  try {
    assert.deepEqual(await createIntakePage('secret', params), { id: 'page-2', url: 'https://notion.so/page-2' });
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /\/pages$/);
    const body = JSON.parse(calls[1].options.body);
    assert.equal(body.parent.database_id, params.databaseId);
    assert.equal(body.children[3].paragraph.rich_text[0].text.content, 'Private message');
  } finally { globalThis.fetch = original; }
});
