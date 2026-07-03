const operatorPublishUrl = () => {
  if (process.env.OPERATOR_PUBLISH_URL) return process.env.OPERATOR_PUBLISH_URL;
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}/functions/v1/operator-publish` : '';
};

const operatorToken = () =>
  process.env.OPERATOR_PUBLISH_SECRET
  || process.env.OPERATOR_ADMIN_TOKEN
  || process.env.ADMIN_TOKEN
  || process.env.ADMIN_PASSWORD
  || '';

export const canUseOperatorPublisher = () =>
  !!operatorPublishUrl() && !!operatorToken();

export const publishViaOperator = async ({ dryRun = process.env.DRY_RUN === '1' } = {}) => {
  const url = operatorPublishUrl();
  const token = operatorToken();
  if (!url || !token) throw new Error('Operator publisher is not configured');

  const res = await fetch(`${url}?dryRun=${dryRun ? '1' : '0'}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ dryRun }),
  });
  if (!res.ok) throw new Error(`Operator publish ${res.status}: ${await res.text()}`);
  return res.json();
};
