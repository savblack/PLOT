/** Server-side checkout policy. UI flags are not an authorization boundary. */
export function checkoutPlan(body: unknown): 'monthly' | 'yearly' | null {
  const plan = (body as { plan?: unknown } | null)?.plan;
  return plan === 'monthly' || plan === 'yearly' ? plan : null;
}

/** A Premium entitlement without a Stripe subscription has no customer portal. */
export function hasStripeSubscription(billing: { stripe_customer_id: string; stripe_subscription_id: string | null } | null): billing is { stripe_customer_id: string; stripe_subscription_id: string } {
  return Boolean(billing?.stripe_customer_id?.startsWith('cus_') && billing.stripe_subscription_id);
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

/**
 * The public launch switch. Only the exact value `true` (ignoring surrounding spaces) opens
 * checkout to everyone; unset, empty, `TRUE`, `1`, `yes` and typos all leave it closed.
 */
export function publicCheckoutOpen(enabled?: string): boolean {
  return enabled?.trim() === 'true';
}

/** True when nobody can start checkout, so the request is refused before it is authenticated. */
export function checkoutClosedToAll(enabled?: string, configuredIds?: string): boolean {
  return !publicCheckoutOpen(enabled) && !configuredIds?.trim();
}

/** Once the switch is on everyone may check out; until then only the private pilot can. */
export function mayStartCheckout(userId: string | undefined, enabled?: string, configuredIds?: string): boolean {
  return publicCheckoutOpen(enabled) || isCheckoutPilot(userId, configuredIds);
}

/** Private launch pilot: compare only the server-verified Auth user ID. */
export function isCheckoutPilot(userId: string | undefined, configuredIds?: string): boolean {
  return Boolean(userId && checkoutPilotIds(configuredIds).includes(userId));
}

function checkoutPilotIds(configuredIds?: string): string[] {
  if (!configuredIds) return [];
  return configuredIds.split(',').map(id => id.trim()).filter(Boolean);
}

/** How many accounts are on the pilot list. Never returns the ids themselves. */
export function checkoutPilotCount(configuredIds?: string): number {
  return checkoutPilotIds(configuredIds).length;
}

/**
 * What an operator can safely read back. `checkoutEnabled` is the public switch.
 * `pilotCount` is a count, not the allowlist.
 */
export function checkoutConfigStatus(enabled?: string, configuredIds?: string) {
  return {
    checkoutEnabled: publicCheckoutOpen(enabled),
    pilotCount: checkoutPilotCount(configuredIds),
  };
}

/** One log line for the function logs. Must not include secrets, price ids, or user ids. */
export function checkoutConfigLog(enabled?: string, configuredIds?: string): string {
  const status = checkoutConfigStatus(enabled, configuredIds);
  return `checkout enabled=${status.checkoutEnabled ? 'yes' : 'no'} pilotCount=${status.pilotCount}`;
}
