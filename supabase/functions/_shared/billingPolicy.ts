/** Server-side checkout policy. UI flags are not an authorization boundary. */
export function checkoutPlan(body: unknown): 'monthly' | 'yearly' | null {
  const plan = (body as { plan?: unknown } | null)?.plan;
  return plan === 'monthly' || plan === 'yearly' ? plan : null;
}

export function matchesPremiumPrice(price: {
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: { interval: string; interval_count: number } | null;
}, plan: 'monthly' | 'yearly') {
  return price.active && price.currency === 'aud'
    && price.unit_amount === (plan === 'monthly' ? 500 : 4000)
    && price.recurring?.interval === (plan === 'monthly' ? 'month' : 'year')
    && price.recurring.interval_count === 1;
}
