const STORAGE_KEY = 'plot_premium_checkout_plan';
const VALID_PLANS = new Set(['monthly', 'yearly']);

/** Preserve a chosen Premium plan while a visitor creates or signs into an account. */
export function rememberPremiumCheckoutIntent(search) {
  const params = new URLSearchParams(search);
  if (params.get('intent') !== 'premium') return null;

  const plan = params.get('plan');
  if (!VALID_PLANS.has(plan)) return null;

  try { window.sessionStorage.setItem(STORAGE_KEY, plan); } catch { /* storage unavailable */ }
  return plan;
}

export function takePremiumCheckoutIntent() {
  try {
    const plan = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return VALID_PLANS.has(plan) ? plan : null;
  } catch {
    return null;
  }
}

export function getPremiumCheckoutIntent() {
  try {
    const plan = window.sessionStorage.getItem(STORAGE_KEY);
    return VALID_PLANS.has(plan) ? plan : null;
  } catch {
    return null;
  }
}
