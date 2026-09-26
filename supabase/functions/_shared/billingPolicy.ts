/** Server-side checkout policy. UI flags are not an authorization boundary. */
export function checkoutPlan(body: unknown): 'monthly' | 'yearly' | null {
  const plan = (body as { plan?: unknown } | null)?.plan;
  return plan === 'monthly' || plan === 'yearly' ? plan : null;
}

export function matchesPremiumPrice(price: {
  active: boolean;
  tax_behavior?: string | null;
  currency: string;
  unit_amount: number | null;
  recurring: { interval: string; interval_count: number } | null;
}, plan: 'monthly' | 'yearly') {
  return price.active && price.tax_behavior === 'inclusive' && price.currency === 'usd'
    && price.unit_amount === (plan === 'monthly' ? 300 : 2400)
    && price.recurring?.interval === (plan === 'monthly' ? 'month' : 'year')
    && price.recurring.interval_count === 1;
}

// The portal can set cancel_at to the period end while leaving Stripe's
// cancel_at_period_end false. Preserve the meaning of our stored period-end flag.
export function cancelsAtPeriodEnd(sub: {
  status: string;
  cancel_at_period_end: boolean;
  cancel_at?: number | null;
}, end: string | null): boolean {
  if (sub.status === 'canceled') return false;
  return sub.cancel_at_period_end || (
    typeof sub.cancel_at === 'number' && end !== null
    && sub.cancel_at * 1000 === new Date(end).getTime()
  );
}

/** Operator-configured return URL; never accept it from a checkout request. */
export function billingSettingsUrl(value?: string): string {
  const url = new URL(value || 'https://app.theplot.tv/settings');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('Invalid billing return URL');
  }
  return url.href;
}
