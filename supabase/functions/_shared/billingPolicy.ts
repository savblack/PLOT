/** Server-side checkout policy. UI flags are not an authorization boundary. */
export function checkoutPlan(body: unknown): 'monthly' | 'yearly' | null {
  const plan = (body as { plan?: unknown } | null)?.plan;
  return plan === 'monthly' || plan === 'yearly' ? plan : null;
}

/** The free trial lives here, not on the Stripe Price: a Price made without trial days would otherwise charge at once. */
export const PREMIUM_TRIAL_DAYS = 7;

/**
 * Subscription settings for a new Checkout session. First-time subscribers get the trial;
 * anyone who has already had a subscription pays from the start. Throws if a first-time
 * session would be built without the trial, so checkout fails closed instead of charging early.
 */
export function checkoutSubscriptionData(userId: string, hadSubscription: boolean) {
  const data = {
    metadata: { supabase_user_id: userId },
    ...(hadSubscription ? {} : { trial_period_days: PREMIUM_TRIAL_DAYS }),
  };
  if (!hadSubscription && data.trial_period_days !== PREMIUM_TRIAL_DAYS) throw new Error('First checkout must include the trial');
  return data;
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

/** Private launch pilot: compare only the server-verified Auth user ID. */
export function isCheckoutPilot(userId: string | undefined, configuredIds?: string): boolean {
  return Boolean(userId && configuredIds?.split(',').map(id => id.trim()).filter(Boolean).includes(userId));
}
