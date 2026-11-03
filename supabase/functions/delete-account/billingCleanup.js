// Stop checkout and recurring charges before deleting the Stripe mapping row.
// The caller has already authenticated the user; every lookup is scoped to that ID.
export async function stopAccountBilling(admin, getStripe, userId) {
  const { data: billing, error: billingError } = await admin.from('billing_customers')
    .select('stripe_customer_id, stripe_subscription_id').eq('user_id', userId).maybeSingle();
  if (billingError) throw billingError;

  const { data: attempt, error: attemptError } = await admin.from('billing_checkout_attempts')
    .select('session_id').eq('user_id', userId).maybeSingle();
  if (attemptError) throw attemptError;

  if (!attempt?.session_id && !billing?.stripe_customer_id?.startsWith('cus_') && !billing?.stripe_subscription_id) return;
  const stripe = getStripe();
  let customerId = billing?.stripe_customer_id;

  if (attempt?.session_id) {
    const session = await stripe.checkout.sessions.retrieve(attempt.session_id);
    if (session.client_reference_id !== userId) throw new Error('Checkout session belongs to another account');
    const sessionCustomer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (customerId && sessionCustomer && customerId !== sessionCustomer) throw new Error('Checkout customer mismatch');
    customerId ??= sessionCustomer;
    if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
  }

  if (billing?.stripe_subscription_id && !customerId?.startsWith('cus_')) {
    throw new Error('Subscription has no valid customer mapping');
  }
  if (!customerId?.startsWith('cus_')) return;

  // List by the account's customer instead of trusting a possibly stale single
  // subscription ID. This also catches a completed Checkout whose webhook has
  // not yet updated billing_customers.
  for await (const subscription of stripe.subscriptions.list({
    customer: customerId, status: 'all', limit: 100,
  })) {
    if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') continue;
    await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
  }
}
