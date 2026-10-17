# Saturday copy comparison plan (week of October 17, 2026)

Use this when the coding Grok agent's copy comes back. It is a judging sheet for this week's posts. It is not a second booking.

Claude's JSON is in the Actions artifact. Do not edit those files. Grok writes a separate folder. Savannah decides whether any of it is good enough to change who writes Saturday's copy.

## 1. Already booked. Do not rerun.

[Marketing weekly batch run 39005801094](https://github.com/savblack/PLOT/actions/runs/39005801094) (`workflow_dispatch`, head `74a6e7c7`) planned October 17 through October 23, Eastern Time. The generate step exited 1 because two posts failed validation. Render and Buffer still ran for the twelve that saved.

Artifact `weekly-copy-jobs`, id `12091291542`, uploaded on the "Keep this week's briefs" step. It has `manifest.json`, 14 briefs, and 14 `<post_id>.copy.json` files. Retention is 14 days.

What that run already did:

- Inserted this week's rows. A second `pnpm run weekly`, `node marketing/scripts/automation.mjs weekly`, or a second dispatch of `.github/workflows/marketing-weekly-batch.yml` would plan the same days again.
- Saved 12 copy files, rendered them, and moved those rows to `needs_review`.
- Left 2 rows at `planned` with `copy` still null. The run log says they stay planned until the next run. That line is the workflow's retry hint. This comparison is the retry. Do not rerun the batch to clear the red X.
- Scheduled 23 Buffer publications. `BUFFER_PUSH_AS_DRAFT` was `0` on that run, so those are scheduled posts, not drafts.
- Left 10 publications out because the Buffer queue is capped at 10 per channel. They stay queued for the daily top-up. Do not run `marketing/publish/schedule.mjs` to push them now.
- Did not send the review email. Resend returned 401, invalid API key. Do not wait on that message.

Do not run `marketing/copy/save.mjs`. Do not create Buffer posts. Do not post. Do not turn the Saturday cron off. Do not approve articles from this plan.

On `main` today, `notifyReview` in `marketing/generate/generate.mjs` still links [Linear Content Automation](https://linear.app/savblack/project/content-automation-2ce2d56ced11) and [Buffer](https://publish.buffer.com). Articles for this week also land on the Notion board [What's On Articles](https://app.notion.com/p/3f04f244aec781baaffbc1523b57ecb4). Captions are judged in Buffer. Approving an article does not change the caption.

## 2. The 14 posts

Titles are from each brief's social-facts block, or the question subject line. Scheduled day is `marketing_posts.scheduled_for`, read only, shown as 9:00 a.m. Eastern. This table does not repeat TMDB ids.

Claude outcome is the validate-and-save log, confirmed against production status.

| Post id | Type | Title or topic | Scheduled day | Claude outcome |
| --- | --- | --- | --- | --- |
| `559effca-f9f8-4a11-911c-7c7fa34e84a7` | hidden_gem | The Secret in Their Eyes (2010, Hulu) | Saturday, October 17 | Saved, `needs_review`. Buffer: X 11:48 a.m., Threads 12:56 p.m., Instagram Sun Oct 18, 12:09 a.m. |
| `e42fa2a5-9b54-455a-b71b-4ca6e333ca83` | trailer | Clayface. Trailer. In theaters Friday, October 23. | Saturday, October 17 | Saved, `needs_review`. Buffer: X 10:04 a.m., Threads 12:11 p.m., Instagram 11:24 p.m. |
| `02b7c4b4-380b-4f42-8b0b-79e234afc4ed` | hidden_gem | Unforgiven (1992). Brief US list: fuboTV, MGM+ Amazon Channel. | Saturday, October 17 | Rejected. Still `planned`. Not sent to Buffer. See section 5. |
| `ac1a234c-dc04-40f8-a847-ed6870832c49` | question | Matchbox the Movie. Out October 5. | Sunday, October 18 | Saved, `needs_review`. Buffer: X 9:02 a.m., Threads 1:16 p.m. No Instagram. |
| `83a20ab4-e126-47d0-8573-b6d446413549` | on_this_day | Sleepers turns 30 | Sunday, October 18 | Saved, `needs_review`. Buffer: X 10:15 a.m., Threads 2:01 p.m., Instagram 10:09 p.m. |
| `1496e043-37e0-4370-8967-3d67a9e4ef01` | trending | Week of October 19 chart. Number 1 is Crystal Lake (new). | Monday, October 19 | Saved, `needs_review`. Buffer: X 8:56 a.m., Threads 9:02 a.m., Instagram 7:06 p.m. |
| `be02dc3f-e67e-405e-99ad-97edd275e94d` | question | By Any Means. Brief says it is out today (Tuesday). | Tuesday, October 20 | Saved, `needs_review`. Buffer: X 9:43 a.m., Threads 10:45 a.m. No Instagram. |
| `bca273e4-58cd-4db1-b1d3-ae9c35c77301` | on_this_day | Return to Halloweentown turns 20 | Tuesday, October 20 | Saved, `needs_review`. Buffer: X 8:27 a.m., Threads 9:31 a.m., Instagram 5:05 p.m. |
| `817c4f38-a796-4c4e-8dc0-0e37b9f5209c` | on_this_day | Moonlight turns 10 | Wednesday, October 21 | Saved, `needs_review`. Instagram Wed 1:37 p.m. is in Buffer. X and Threads hit the cap. |
| `fb5f6838-4d45-49f6-a5ac-974ff027297e` | watch_tonight | One Piece (Netflix, Hulu) | Wednesday, October 21 | Saved, `needs_review`. Instagram Wed 6:34 p.m. is in Buffer. X and Threads hit the cap. |
| `a9363dc0-b60b-4a36-9e3b-40f5a12414e2` | question | VisionQuest. Airing now. | Thursday, October 22 | Saved, `needs_review`. X and Threads both hit the cap, and a question has no Instagram, so nothing from this post is in Buffer yet. |
| `064b6fde-05e4-461d-9f94-02763940e462` | countdown | The Mongoose. T-7. In theaters Friday, October 30. | Friday, October 23 | Rejected. Still `planned`. Not sent to Buffer. See section 5. |
| `8619a39f-4a38-4c88-8852-b9efcafe6255` | on_this_day | Weekend turns 15 | Friday, October 23 | Saved, `needs_review`. Instagram Fri 6:17 a.m. is in Buffer. X and Threads hit the cap. |
| `f7f07e46-1680-413e-960a-35acd6f8aeb2` | countdown | The Cat in the Hat. T-14. In theaters Friday, November 6. | Friday, October 23 | Saved, `needs_review`. Instagram Fri 8:24 p.m. is in Buffer. X and Threads hit the cap. |

Buffer clock times are the strings the run logged (`Sat, Oct 17, 11:48 AM` and the rest). They are queue slots, not the 9:00 a.m. article time.

The ten capped publications, in log order: Moonlight Threads and X, One Piece Threads and X, VisionQuest Threads and X, Weekend Threads and X, The Cat in the Hat Threads and X.

Unforgiven was not created by this run. The row was inserted 2026-10-11. `topic_key` is `hidden_gem:2026-10-16`. `scheduled_for` is Saturday, October 17, 9:00 a.m. Eastern, same clock as The Secret in Their Eyes (`hidden_gem:2026-10-17`), which this run did insert. Pull included Unforgiven because it was still `planned`, `copy` was null, and the day falls inside the 8-day window. This run's new hidden gem is The Secret in Their Eyes.

Every brief title resolved. The trending row has no single `payload.title`. Its topic is the chart in the brief.

## 3. How to judge Grok's folder

Wait until this exits 0:

```bash
node marketing/copy/check.mjs /path/to/grok/folder
```

The folder needs `manifest.json` copied from the artifact, plus one `<post_id>.copy.json` per brief. `check.mjs` reads `post_type`, `days_until`, and `when_label` from that manifest. Without it, the hidden-gem platform check and the countdown date check do not run, and a green exit is meaningless.

A green exit means the JSON matches `marketing/copy/AGENT.md` and `supabase/functions/_shared/copySchema.js`. It does not mean the sentences are true, spoiler-free, or better than Claude. It is not permission to switch the Saturday writer.

Then, post by post, open Grok's file next to the artifact's `<post_id>.copy.json`. For each id, write two lines:

1. Ship Grok, keep Claude, or ship neither.
2. Any sentence you do not trust, quoted, with why.

Do that before changing a workflow file. The twelve saved posts are already in Buffer or waiting on the daily top-up. Shipping Grok for one of those means a later, separate edit. This plan does not perform it.

Question posts are one `question` string, used as X and Threads. There is no article. The other eleven posts have `x`, `instagram`, `threads`, `hashtags`, `alt_text`, `page_title`, `page_body`, `sources`, and `cta_variant`.

Sentences to distrust even where Claude saved:

- Matchbox: "critics and audiences are nowhere near agreement on it."
- By Any Means: "critics and audiences are nowhere close to agreeing on it." The same question names Yahya Abdul-Mateen II. That name is not in the brief file. A question has no `sources` array, so there is nowhere on the JSON to check the name. Do not trust it.
- VisionQuest: "critics are calling it one of Marvel's best shows in years, with Paul Bettany doing some of his best work yet." That is reception narration. The question validator does not use the article rule that rejected "reviews have", so this saved anyway. Paul Bettany is not in the brief file, and a question has no `sources` array. Do not trust the name or the "best in years" claim.
- Clayface page title, "leans all the way into body horror." The research pack does call the film body horror, so the label is in the brief. Still reject a sentence that describes a scene the pack does not describe. Social captions may only use the social-facts block.
- Sleepers captions. X, Instagram, and Threads all say Carcaterra's memoir is disputed. That claim is not in the social-facts block. Social copy may only use that block. The article may use the research pack plus listed sources. Claude's `sources` include a Baltimore Sun URL and a SlashFilm URL. The pack itself only says the film is based on the 1995 book. Spot-check the captions before trusting them, and do not let Grok repeat the dispute on X, Instagram, or Threads unless it is in the social facts. The overview in the social facts is already a plot spoiler. The post instructions still say no spoilers.
- Any relative day ("this Friday", "next week", "out today") on The Mongoose (7 days, Friday, October 30) or The Cat in the Hat (14 days, Friday, November 6). The publish day is Friday, October 23, so "this Friday" is the wrong Friday.
- A UK or Australian service. Unforgiven's brief lists BINGE, Foxtel, and HBO Max on the UK and AU side. The US list is fuboTV and the MGM+ Amazon Channel.
- A rental called "streaming", or a rental app called a store. None of these 14 manifest entries set `home_kind`. Do not invent one.

Three things the validator will not catch, from `AGENT.md`: spoilers, more than three names in one sentence, and a time-bound claim that is false on the publish day.

## 4. Decision gate

The GitHub macOS weekly batch stays on Claude until Savannah says this comparison is good enough.

That is the rule in `docs/ops/agent-worktrees.md` under "Not in this change", and in `docs/ops/actions-minutes.md`. The assignment for the second writer is `marketing/copy/GROK-HANDOFF.md`. Alix does not write the comparison. The second writer does not run the weekly command.

The one file that would change later is `.github/workflows/marketing-weekly-batch.yml`. The step "Generate the week with Claude Code" runs:

```bash
node marketing/scripts/automation.mjs weekly --copy-runner=claude
```

Changing `--copy-runner` is a separate decision after she has marked posts ship or not. It is not part of this plan.

## 5. Highest-value pair

Compare these two first. They are the only files the validator rejected, and they are the only posts with no caption in Buffer.

### Unforgiven (`02b7c4b4-380b-4f42-8b0b-79e234afc4ed`)

Log: `page_body never says where to watch; a hidden_gem post must name the platform, or say it is available to rent or buy`.

The body does say where, in the last paragraph: "Unforgiven is streaming now on fuboTV and the MGM+ Amazon Channel." X, Instagram, and Threads say the same. The check only scans `page_body`. `NAMES_A_PLATFORM` in `supabase/functions/_shared/copySchema.js` does not include fuboTV or MGM+. The sentence is in the file. The regex does not see it. Netflix, Hulu, and the other names on that list pass. The words "rent or buy" pass too.

A Grok file that names fuboTV and the MGM+ Amazon Channel, and nothing on that list, fails the same way. A file that passes by saying "rent or buy", or by naming a platform that is not on the brief's US list, is a worse article. For this post, trust the brief's US list over a green check.

The research pack does contain the 96% Rotten Tomatoes score, Clint Eastwood, David Webb Peoples, and the Wikipedia cast line (Gene Hackman, Morgan Freeman, Richard Harris). One score, not in the closing paragraph, is allowed. The pack does not contain the drawer, the dedication to Sergio Leone and Don Siegel, "four Academy Awards", or "Eastwood never directed another western after this one." Those sentences have to be in a source Claude listed, or they are not trustworthy. Claude's `sources` name Wikipedia, IMDb, TMDB, and a ScreenRant URL. Spot-check those before calling Grok's version better.

### The Mongoose (`064b6fde-05e4-461d-9f94-02763940e462`)

Log: `page_body[3] narrates research or reception ("reviews have"); state Plot's own view directly`.

Paragraph 4 of Claude's body (index 3): "Early reviews have leaned positive, with more than one critic singling out Neeson's weariness, rather than the action choreography, as the film's real anchor."

That sentence is the whole rejection. Grok should not sneak the same idea in with "critics have", "according to", or "reportedly". Plot's own view, or no reception sentence.

The date in Claude's captions and closer is "Friday, October 30", which matches `when_label`. Keep that. Do not accept "this Friday" or "next week".

The research pack does name Liam Neeson, Mark Vanselow, Marisa Tomei, Ving Rhames, and Michael Chiklis. "Feature debut", "stunt coordinator", and the shoot "around Melbourne and regional Victoria" are not in the brief at all. Do not trust those sentences unless a source on Grok's list, or on Claude's list, actually says them. Claude's sources are a Wikipedia film URL, IMDb, TMDB, and a Yahoo Entertainment URL. The social overview is in the brief: a falsely accused war hero, a Special Forces battalion, and a televised cross-country chase.

## 6. Not in this pull request

- No change to `--copy-runner`. The Saturday job stays Claude.
- No second weekly run, no `save.mjs`, no `schedule.mjs`, no new Buffer posts, no public post.
- No edit to the validator, the platform name list, or `GROK-HANDOFF.md`.
- No article approval, on Linear or on Notion.
- No cron change.
