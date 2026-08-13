-- Remove the Sunday learning loop's run table.
--
-- The loop itself is gone: marketing/learning/*, the marketing-learning-prep
-- workflow, the three learn:* commands, and the launchd template that was meant
-- to run the local apply step. Nothing reads or writes this table any more.
--
-- Production held 7 rows, every one of them status 'prepared' with a null
-- summary_markdown — the local apply step never once ran, so seven weeks of
-- artifacts were prepared and never consumed, and no learning was ever folded
-- back into VOICE.md. Those rows are archived outside the repo (they carry full
-- copy snapshots, too big and too uninteresting to keep in migrations) at
-- ~/Documents/Obsidian/Projects/PLOT/Marketing Automation/.
--
-- Deliberately left in place: marketing_posts.generated_copy and
-- marketing_post_publications.sent_text / sent_payload, all added alongside this
-- table in 20260629002000. The loop was their only reader, so they are write-only
-- now, but they stay a cheap record of what was generated and what actually went
-- out. marketing_newsletter_issues, created in that same migration, is still live.

SET search_path TO public, extensions;

-- marketing_learning_runs_status_idx and the table's RLS setting go with it.
DROP TABLE IF EXISTS public.marketing_learning_runs;
