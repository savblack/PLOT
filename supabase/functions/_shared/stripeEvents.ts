/**
 * Which Stripe events move Plot Premium billing state.
 * stripe-webhook/index.ts switches on webhookAction() so this list is the
 * one the handler and the tests share.
 */

export type WebhookAction =
  | 'checkout_completed'
  | 'async_payment'
  | 'checkout_expired'
  | 'checkout_payment_failed'
  | 'sync_subscription'
  | 'sync_invoice'
  | 'trial_ending'
  | 'ignore';

export function webhookAction(type: string): WebhookAction {
  switch (type) {
    case 'checkout.session.completed':
      return 'checkout_completed';
    case 'checkout.session.async_payment_succeeded':
      return 'async_payment';
    case 'checkout.session.async_payment_failed':
      return 'checkout_payment_failed';
    case 'checkout.session.expired':
      return 'checkout_expired';
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return 'sync_subscription';
    case 'invoice.payment_failed':
    case 'invoice.payment_succeeded':
    case 'invoice.paid':
      return 'sync_invoice';
    case 'customer.subscription.trial_will_end':
      return 'trial_ending';
    default:
      return 'ignore';
  }
}

type InvoiceRef = {
  subscription?: string | { id?: string | null } | null;
  parent?: {
    subscription_details?: {
      subscription?: string | { id?: string | null } | null;
    } | null;
  } | null;
};

function idOf(value: string | { id?: string | null } | null | undefined): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && value.id) return value.id;
  return null;
}

/**
 * Subscription id on an invoice. Stripe API versions before 2025-03-31 put it
 * on `invoice.subscription`. Current versions put it on
 * `invoice.parent.subscription_details.subscription`. Read both.
 */
export function subscriptionIdFromInvoice(invoice: InvoiceRef | null | undefined): string | null {
  if (!invoice) return null;
  return idOf(invoice.subscription) ?? idOf(invoice.parent?.subscription_details?.subscription);
}
