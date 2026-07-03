const operatorSyncUrl = () => {
  if (process.env.OPERATOR_SYNC_URL) return process.env.OPERATOR_SYNC_URL;
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}/functions/v1/operator-sync` : '';
};

const operatorSyncSecret = () => process.env.OPERATOR_SYNC_SECRET || '';

export const syncMarketingPostToOperator = async (supabase, postId) => {
  const url = operatorSyncUrl();
  const secret = operatorSyncSecret();
  if (!url || !secret) return { skipped: true, reason: 'operator sync is not configured' };

  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(platform,status,permalink,error,published_at,platform_post_id,attempt_count)')
    .eq('id', postId)
    .single();
  if (error) throw new Error(`Operator sync load failed: ${error.message}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-operator-sync-secret': secret,
    },
    body: JSON.stringify({ post: data }),
  });
  if (!res.ok) {
    throw new Error(`Operator sync ${res.status}: ${await res.text()}`);
  }
  return res.json();
};
