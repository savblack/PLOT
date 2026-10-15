// Private feedback and moderation intake. No network call is made until the
// caller supplies a token and a database id from server-side secrets.
import { notionRequest } from './notionApi.js';
import { notionId } from './notionReview.js';

const richText = (value) => {
  const text = String(value ?? '');
  const parts = [];
  for (let i = 0; i < text.length; i += 1900) {
    parts.push({ type: 'text', text: { content: text.slice(i, i + 1900) } });
  }
  return parts.length ? parts : [{ type: 'text', text: { content: '' } }];
};

const paragraph = (text) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: richText(text) } });
const heading = (text) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: richText(text) } });

export const intakePageBody = ({ databaseId, recordId, title, submittedAt, fields, detail, links = [] }) => ({
  parent: { database_id: notionId(databaseId) },
  properties: {
    Name: { title: richText(title.slice(0, 200)) },
    'Record ID': { rich_text: richText(recordId) },
    Submitted: { date: { start: submittedAt } },
    Status: { select: { name: 'New' } },
  },
  children: [
    heading('Intake'),
    ...fields.map(([name, value]) => paragraph(`${name}: ${value}`)),
    heading('Details'),
    ...String(detail || '(none)').match(/.{1,1900}/gs).map(paragraph),
    ...links.map((url, index) => ({
      object: 'block', type: 'paragraph', paragraph: {
        rich_text: [{ type: 'text', text: { content: `Attachment ${index + 1}`, link: { url } } }],
      },
    })),
  ],
});

// Query by the source record before creating. This also recovers a page that
// Notion created when the following Supabase update failed or timed out.
export const findIntakePage = async (token, databaseId, recordId) => {
  const result = await notionRequest(token, `/databases/${notionId(databaseId)}/query`, {
    method: 'POST',
    body: {
      filter: { property: 'Record ID', rich_text: { equals: recordId } },
      page_size: 2,
    },
  });
  if ((result.results ?? []).length > 1) throw new Error('Duplicate Notion intake pages for one record');
  return result.results?.[0] ?? null;
};

export const createIntakePage = async (token, params) => {
  const existing = await findIntakePage(token, params.databaseId, params.recordId);
  if (existing) return { id: existing.id, url: existing.url };
  const page = await notionRequest(token, '/pages', {
    method: 'POST',
    body: intakePageBody(params),
  });
  if (!page.id || !page.url) throw new Error('Notion returned no page id or URL');
  return { id: page.id, url: page.url };
};
