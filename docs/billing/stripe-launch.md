# PLOT Premium launch checklist

PLOT Premium is A$5 monthly or A$40 yearly. The web app uses Stripe Checkout
for purchase and the Stripe Customer Portal for cancellation, payment-method
updates, and switching between those two plans.

## Before going live

1. In Stripe **live mode**, create a PLOT Premium product with two recurring
   AUD prices: A$5/month and A$40/year. Record the two live price IDs.
2. Set the Stripe account's public business URL and support email. The Customer
   Portal should also show the PLOT terms and privacy URLs.
3. In the live-mode Customer Portal, enable cancellation, payment-method
   updates, invoice history, and price switching. Its catalogue must contain
   only the PLOT Premium product and both live prices. Schedule downgrades for
   the end of the current period; calculate proration for upgrades.
4. Create a live webhook at
   `https://mkegtssedjyqldysvzga.supabase.co/functions/v1/stripe-webhook`.
   Subscribe to `checkout.session.completed`, `customer.subscription.updated`,
   and `customer.subscription.deleted`.
5. Set these Supabase Edge Function secrets from the live Stripe dashboard:
   `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, and
   `STRIPE_WEBHOOK_SECRET`.
6. Deploy `stripe-billing` and `stripe-webhook`, then make one real low-value
   purchase and confirm checkout, portal cancellation, webhook processing, and
   loss of Premium access after the paid period ends.

Never put Stripe secret keys or price IDs in browser variables or tracked files.
