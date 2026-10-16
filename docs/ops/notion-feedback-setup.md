# Private Notion intake setup

This change has no live setup side effects. A human must complete the following before the new edge functions can file feedback or reports. Do not use the What's On marketing database: it has a different audience and schema.

## Private databases

Create two separate databases in a private Notion page that only the owner and the integration can access:

| Database | Edge secret | Content |
| --- | --- | --- |
| Plot feedback | `NOTION_FEEDBACK_DATABASE_ID` | In-app feedback text, source record ID, and archived attachment links |
| Plot reports | `NOTION_REPORTS_DATABASE_ID` | Abuse report details and both account IDs |

Give **each** database these exact property names and types. The type and capitalization are part of the API contract:

| Property | Notion type | Required configuration |
| --- | --- | --- |
| `Name` | Title | Database title property |
| `Record ID` | Text | Plain rich text, used for duplicate detection and recovery |
| `Submitted` | Date | Submission timestamp |
| `Status` | Select | Add a `New` option; other triage options are up to the owner |

Keep both databases private. Do not publish their parent page, database, or individual pages to the web. Share each database with the existing Plot Notion internal integration so its token can read and create pages. Grant the integration only the needed Notion capabilities: read content, insert content, and update content. The intake functions use the Notion connection token stored as the Supabase secret `NOTION_CONNECTION`. Token resolution order is `NOTION_CONNECTION`, then `NOTION_TOKEN`, then `NOTION_API_KEY`. The existing `NOTION_TOKEN` is used by marketing and must be left unchanged. Never put the token or database IDs in browser variables or tracked files.

## Created databases

These are database IDs (not secrets), for `NOTION_FEEDBACK_DATABASE_ID` and `NOTION_REPORTS_DATABASE_ID`:

| Database | Secret | Database ID |
| --- | --- | --- |
| Plot feedback | `NOTION_FEEDBACK_DATABASE_ID` | `c13daf44-0ba5-4d8f-a410-cd8c8c4480c3` |
| Plot reports | `NOTION_REPORTS_DATABASE_ID` | `7af64554-3a44-45ab-a5be-05c9d15c2f2e` |

## Supabase setup by the owner

1. Create and share the two private databases, then set their IDs as Supabase Edge Function secrets `NOTION_FEEDBACK_DATABASE_ID` and `NOTION_REPORTS_DATABASE_ID`. Keep `NOTION_CONNECTION` (fallbacks `NOTION_TOKEN`, `NOTION_API_KEY`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY` available to both functions. The Notion IDs must be database IDs, not page URLs or the marketing database ID.
2. Review and apply `20261015140000_private_notion_intake_and_retire_linear.sql` through the normal migration release. It adds Notion sync state and unschedules the old marketing mirror. It preserves historical issue links and existing feedback/report rows.
3. Deploy `notify-feedback` and `notify-report`. Confirm their database webhooks still invoke them with the service-role bearer. Deploy `marketing-notion-mirror` and `marketing-notion-sync` if they are not already active. Remove the obsolete Linear webhook in the Linear workspace and retire the two old Linear edge functions in Supabase after verifying Notion review. These are manual live actions, not performed by this branch.
4. Submit one controlled feedback and one controlled report, then verify one page appears in the correct private database, the source row has `notion_page_id`, and the operator email arrives. Test redelivery and a bounded backfill only with the owner's explicit approval because they process live user data.

`LINEAR_API_KEY` is retained as a secret. Do not revoke, modify, or delete it as part of this change. Historical `linear_*` columns remain for audit and duplicate avoidance. Feedback previously filed in GitHub or Linear is deliberately not copied to Notion automatically. The old `linear-archive/` storage prefix is kept so existing archived attachment links do not break; those storage URLs are public if someone has the URL, even though the Notion database is private.

## PR #1305

This branch supersedes the proposed GitHub feedback issue and project flow in #1305. It retains independent operator email, failure visibility, bounded retry, and duplicate avoidance. It files new feedback only in the private Notion database. Once a replacement PR exists, the owner can close #1305 with: “Superseded by the private Notion intake PR. Feedback can contain user PII, so it will not be filed as a GitHub issue.” Do not paste any feedback or report content into that comment.
