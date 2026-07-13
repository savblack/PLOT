import { getSupabase } from '../lib/supabase.mjs';
import { sundayLearningWindow } from './window.mjs';

const main = async () => {
  const supabase = getSupabase();
  const window = sundayLearningWindow(new Date());

  const { data, error } = await supabase
    .from('marketing_learning_runs')
    .select('week_start, week_end, status, prepared_at, applied_at, error')
    .eq('week_start', window.weekStart)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!data) {
    console.log(`No Sunday learning artifact found for ${window.weekStart} → ${window.weekEnd}; continuing with the current voice rules.`);
    return;
  }

  if (data.status !== 'applied') {
    // Soft-fail: a prepared-but-unapplied artifact means the local learning writer
    // (marketing/learning/apply.mjs) hasn't run yet. Rather than block the whole
    // weekly generation, warn and continue with the current voice rules — the same
    // conservative fallback used above when no artifact exists at all. Run apply.mjs
    // locally to fold this week's learning in before the next generation.
    console.warn(
      `⚠️  Sunday learning for ${data.week_start} → ${data.week_end} is ${data.status}, not applied. ` +
      'Continuing with the current voice rules. Run marketing/learning/apply.mjs locally to apply it.',
    );
    return;
  }

  console.log(`Sunday learning is applied for ${data.week_start} → ${data.week_end}.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
