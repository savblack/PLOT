// Creates the Substack articles database, or updates its properties if it
// already exists. The live board is "Newsletters"
// (3f84f244aec78139b4e1d6741b1f6989); pass that as
// NOTION_SUBSTACK_DATABASE_ID to update it rather than create a second one. Same shape as the What's On review board
// (marketing/setup/notion-review-db.mjs): one row per weekly issue, a Status
// select to move across a board, a date, and a link. Nothing syncs to or from
// this database. It is the operator's checklist for the Monday paste.
//
// The parent page comes from NOTION_PARENT_PAGE_ID. There is no default.
// Savannah's Growth page under 01 · Plot is the same parent the review board
// uses (see docs/ops/gtm-automations.md).
//
//   DRY_RUN=1 node --env-file=.env marketing/setup/notion-substack-db.mjs
//   node --env-file=.env marketing/setup/notion-substack-db.mjs
//
// Required: NOTION_TOKEN_PLOT_SUBSTACK, a separate integration from the one
// the review board uses (that token lives only in Supabase secrets and cannot
// be read back). NOTION_TOKEN or NOTION_API_KEY also work.
// Create: NOTION_PARENT_PAGE_ID.
// Update: NOTION_SUBSTACK_DATABASE_ID (skips the parent).
//
// A new integration sees nothing until a page is shared with it: on the
// parent page, "..." then "Connections", add the integration.
//
// The API creates the database as a table. Add the board view by hand:
// open the database, "+ Add view", Board, group by Status.
import { notionRequest } from '../../supabase/functions/_shared/notionApi.js';

const token = process.env.NOTION_TOKEN_PLOT_SUBSTACK || process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || '';
const parentId = process.env.NOTION_PARENT_PAGE_ID || '';
const databaseId = process.env.NOTION_SUBSTACK_DATABASE_ID || '';
const dryRun = process.env.DRY_RUN === '1';

export const PROPS = {
  title: 'Name',
  status: 'Status',
  sendDate: 'Send date',
  substackUrl: 'Substack URL',
  seoTitle: 'SEO title',
  substackPreview: 'Substack preview',
  notes: 'Notes',
};

// Draft: the digest is generated but not yet pasted. Ready: pasted into
// Substack as a draft and checked. Sent: the Substack post went out.
// Skipped: no issue that week.
export const STATUS = {
  draft: 'Draft',
  ready: 'Ready to send',
  sent: 'Sent',
  skipped: 'Skipped',
};

export const databaseProperties = () => ({
  [PROPS.title]: { title: {} },
  [PROPS.status]: {
    select: {
      options: [
        { name: STATUS.draft, color: 'yellow' },
        { name: STATUS.ready, color: 'blue' },
        { name: STATUS.sent, color: 'green' },
        { name: STATUS.skipped, color: 'gray' },
      ],
    },
  },
  [PROPS.sendDate]: { date: {} },
  [PROPS.substackUrl]: { url: {} },
  [PROPS.seoTitle]: { rich_text: {} },
  [PROPS.substackPreview]: { rich_text: {} },
  [PROPS.notes]: { rich_text: {} },
});

export const databaseCreateBody = (parent) => {
  if (!parent) throw new Error('NOTION_PARENT_PAGE_ID is required');
  return {
    parent: { type: 'page_id', page_id: parent },
    title: [{ type: 'text', text: { content: 'Substack articles' } }],
    properties: databaseProperties(),
  };
};

if (!token) {
  console.error('Set NOTION_TOKEN_PLOT_SUBSTACK (a Notion internal integration token).');
  process.exit(1);
}

if (!databaseId && !parentId) {
  console.error('Set NOTION_PARENT_PAGE_ID to the page the database should live under, or NOTION_SUBSTACK_DATABASE_ID to update an existing one.');
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
  console.error('Share the parent page with the integration if the create was refused. Then add a Board view grouped by Status.');
}
