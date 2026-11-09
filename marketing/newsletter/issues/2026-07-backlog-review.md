# July to September newsletter backlog

Eleven illustrated drafts cover July 6 through September 14, 2026. They are saved in the existing Notion newsletter database as Draft, with Substack preview text and separate SEO titles. Nothing was published, sent, or scheduled. Choose a GIF and review the copy before publication.

Four issues need historical charts: July 6, July 13, July 20, and September 7. Those dates have no usable weekly snapshot in the saved marketing archive. Their chart sections and Notion notes flag the gap. Other issues use the latest saved snapshot within seven days before Monday. Movement is omitted when there is no preceding weekly snapshot.

| Issue | Notion draft | Historical chart |
| --- | --- | --- |
| 2026-07-06 | [Open draft](https://app.notion.com/p/3fc4f244aec78159a8bcc452c931f53c?pvs=204) | Missing; publication blocked |
| 2026-07-13 | [Open draft](https://app.notion.com/p/3fc4f244aec7813dbf34ea946a9f92ea?pvs=204) | Missing; publication blocked |
| 2026-07-20 | [Open draft](https://app.notion.com/p/3fc4f244aec78153be32d2d133e1a9a0?pvs=204) | Missing; publication blocked |
| 2026-07-27 | [Open draft](https://app.notion.com/p/3fc4f244aec781ddb126d94e45be5ce7?pvs=204) | 2026-07-23 |
| 2026-08-03 | [Open draft](https://app.notion.com/p/3fc4f244aec781a29dc2dc4bad6e970b?pvs=204) | 2026-07-30 |
| 2026-08-10 | [Open draft](https://app.notion.com/p/3fc4f244aec781ee93d7c61ce754c586?pvs=204) | 2026-08-06 |
| 2026-08-17 | [Open draft](https://app.notion.com/p/3fc4f244aec7818d9b2bf1d1457b27ad?pvs=204) | 2026-08-13 |
| 2026-08-24 | [Open draft](https://app.notion.com/p/3fc4f244aec781e88a08d61e046a1406?pvs=204) | 2026-08-20 |
| 2026-08-31 | [Open draft](https://app.notion.com/p/3fc4f244aec781c9a04ff6bbff51de7b?pvs=204) | 2026-08-27 |
| 2026-09-07 | [Open draft](https://app.notion.com/p/3fc4f244aec7813c9128d222cfe8525f?pvs=204) | Missing; publication blocked |
| 2026-09-14 | [Open draft](https://app.notion.com/p/3fc4f244aec78114a24ded8cdc1c2a67?pvs=204) | 2026-09-10 |

Each date has the Markdown source, a Substack copy, email HTML, illustrated review HTML, preview text, and GIF notes. Its assets folder holds the cover, original backdrop, chart snapshot evidence, and a source-check record with verified trailer channels and Notion readback.

## Verification

- `node --test marketing/tests/the-week.test.mjs`: 30 passed.
- `pnpm run check`: passed on Node 22, with existing mobile lint warnings.
- Newsletter rule checker: seven issues pass; four fail only the required historical chart check. No rule was weakened.
- All 33 official Coming up trailer URLs returned valid YouTube metadata.
- All 22 phone/desktop preview checks passed: no broken images, horizontal overflow, or page errors. Each has three trailer embeds.
- All 11 Notion drafts read back with the correct date, Draft status, SEO title, preview text, uploaded cover, additional images, trailers, and small attribution embed.

## Workspace

The repository moved during this task. This active registered checkout is `/Users/savannahblack/Developer/PLOT-worktrees/2026-10-17-newsletter-completion-dev`. The similarly named checkout without `-dev` has stale Git/environment links and must not be used for continued work.
