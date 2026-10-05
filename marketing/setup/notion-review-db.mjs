// Creates the What's On review database, or updates its properties if it
// already exists. Does not create pages and does not read marketing_posts.
//
// The parent page comes from NOTION_PARENT_PAGE_ID. There is no default.
//
//   DRY_RUN=1 node --env-file=.env marketing/setup/notion-review-db.mjs
//   node --env-file=.env marketing/setup/notion-review-db.mjs
//
// Required: NOTION_TOKEN (or NOTION_API_KEY).
// Create: NOTION_PARENT_PAGE_ID.
// Update: NOTION_MARKETING_DATABASE_ID (skips the parent).
//
// Prints the database id. Put that value in the Supabase secret
// NOTION_MARKETING_DATABASE_ID. The token stays server-side too.
import { databaseCreateBody, databaseProperties } from '../../supabase/functions/_shared/notionReview.js';
import { notionRequest } from '../../supabase/functions/_shared/notionApi.js';

const token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || '';
const parentId = process.env.NOTION_PARENT_PAGE_ID || '';
const databaseId = process.env.NOTION_MARKETING_DATABASE_ID || '';
const dryRun = process.env.DRY_RUN === '1';

if (!token) {
  console.error('Set NOTION_TOKEN (a Notion internal integration token).');
  process.exit(1);
}

if (!databaseId && !parentId) {
  console.error('Set NOTION_PARENT_PAGE_ID to the page the database should live under, or NOTION_MARKETING_DATABASE_ID to update an existing one.');
  process.exit(1);
}

if (dryRun) {
  const body = databaseId
    ? { properties: databaseProperties() }
    : databaseCreateBody(parentId);
  console.log(JSON.stringify({ dry_run: true, database_id: databaseId || null, body }, null, 2));
  process.exit(0);
}

if (databaseId) {
  await notionRequest(token, `/databases/${databaseId}`, {
    method: 'PATCH',
    body: { properties: databaseProperties() },
  });
  console.log(databaseId);
} else {
  const created = await notionRequest(token, '/databases', {
    method: 'POST',
    body: databaseCreateBody(parentId),
  });
  console.log(created.id);
  console.error('Set this as the Supabase secret NOTION_MARKETING_DATABASE_ID. Share the parent page with the integration if the create was refused.');
}
