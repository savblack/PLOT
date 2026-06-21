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
    throw new Error(
      `Sunday learning for ${data.week_start} → ${data.week_end} is ${data.status}. ` +
      'Weekly generation must wait for the local learning writer or skip rule application explicitly.',
    );
  }

  console.log(`Sunday learning is applied for ${data.week_start} → ${data.week_end}.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
