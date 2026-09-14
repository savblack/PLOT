// Watchdog: is anything actually queued for the days ahead?
//
// This exists because of a week of silence. The weekly batch scheduled for
// 2026-08-30 never ran — GitHub declined to start the job over a billing
// problem — so nothing was planned for the following week and /whats-on went
// stale from 28 August. marketing-weekly-batch.yml has an "Alert on failure"
// step, and it never fired: a failure handler inside the job it guards cannot
// report the job never starting.
//
// So the check lives here instead, in the daily reconcile job, which kept running
// throughout that outage. Different workflow, different schedule, different
// failure mode — which is the entire point. A watchdog sharing a single point of
// failure with the thing it watches is not a watchdog.
//
// Reports rather than throws: an empty queue is a content problem for a human,
// not a broken publish run, and failing here would fire the publish job's own
// alert with a misleading message.
//
// Usage:
//   node marketing/publish/queue-check.mjs [--days=3]
import { appendFileSync } from 'node:fs';
import { getSupabase } from '../lib/supabase.mjs';

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

// Counts as queued: still to be looked at, or cleared and waiting for its day.
// Anything else (published, vetoed, failed, skipped) says nothing about whether
// there is content coming.
const QUEUED_STATUSES = ['needs_review', 'approved'];

const main = async () => {
  const days = Math.max(1, Math.min(30, Number(arg('days', '3')) || 3));
  const supabase = getSupabase();

  const now = new Date();
  const until = new Date(now.getTime() + days * 86400_000);

  const { data, error } = await supabase
    .from('marketing_posts')
    .select('status, scheduled_for, post_type')
    .in('status', QUEUED_STATUSES)
    .gte('scheduled_for', now.toISOString())
    .lte('scheduled_for', until.toISOString())
    .order('scheduled_for', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data || [];
  const byStatus = rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});

  console.log(`Queue for the next ${days} day(s): ${rows.length} post(s).`);
  for (const [status, count] of Object.entries(byStatus)) console.log(`  ${status}: ${count}`);
  for (const r of rows) {
    console.log(`  ${String(r.scheduled_for).slice(0, 16)}  ${r.status.padEnd(13)} ${r.post_type}`);
  }

  // Approved-but-nothing-to-review is fine. Nothing at all is not.
  const empty = rows.length === 0;
  if (empty) {
    console.log('\nNothing is queued. Either the weekly batch did not run, or its posts were all rejected.');
  }
  // Approval now governs the WEBSITE ARTICLE only — the social posts are already
  // scheduled in Buffer and go out whether or not a card was ever touched. So
  // this is no longer "nothing will publish"; it is "/whats-on will stay empty
  // while the socials run", which is a different and much odder failure to be in.
  if (!empty && !byStatus.approved) {
    console.log('\nNothing is approved — the social posts will still go out from Buffer, but no article will appear on /whats-on.');
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `empty=${empty}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `days=${days}\n`);
  }
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
