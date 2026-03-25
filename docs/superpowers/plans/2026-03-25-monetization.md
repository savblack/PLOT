# Plot Monetization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three revenue streams to Plot — Ko-fi tip jar, affiliate streaming links, and Stripe Pro subscriptions — while keeping the core product free.

**Architecture:** Ko-fi is external (just links). Affiliate links wrap existing provider logos in MediaModal with JustWatch deep links. Pro subscriptions use Stripe Checkout → webhook → Supabase Edge Function → `profiles.is_pro` flag, with a `checkProStatus()` hook gating premium features client-side. New `tags` and `journal_tags` tables support the custom tags Pro feature.

**Tech Stack:** React 19, Vite 8, Supabase (auth, database, Edge Functions), Stripe, TMDB API, JustWatch affiliate

**Spec:** `docs/superpowers/specs/2026-03-25-monetization-design.md`

---

## Chunk 1: Ko-fi Tip Jar & Affiliate Links

### Task 1: Add "Support Plot" links

**Files:**
- Modify: `src/App.jsx:770` (profile dropdown, before Sign Out button)
- Modify: `src/pages/LandingPage.jsx:420` (footer links)
- Modify: `src/app.css` (new styles)

- [ ] **Step 1: Add "Support Plot" link to profile dropdown in App.jsx**

In `src/App.jsx`, find the Sign Out button (line 770):

```jsx
<button className="profile-dropdown-item danger" onClick={() => { logout(); setShowProfileMenu(false); }}>
  Sign Out
</button>
```

Add this immediately **before** that button:

```jsx
<a
  href="https://ko-fi.com/plotapp"
  target="_blank"
  rel="noopener noreferrer"
  className="profile-dropdown-item support-plot-link"
>
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  Support Plot
</a>
```

Note: Replace `https://ko-fi.com/plotapp` with the actual Ko-fi URL once the page is created.

- [ ] **Step 2: Add "Support" link to landing page footer**

In `src/pages/LandingPage.jsx`, find the footer links list (line 420):

```jsx
<ul className="footer-links">
  <li><a href="#">X</a></li>
  <li><a href="#">Instagram</a></li>
  <li><a href="#">Privacy</a></li>
  <li><a href="#">Terms</a></li>
</ul>
```

Add before the closing `</ul>`:

```jsx
<li><a href="https://ko-fi.com/plotapp" target="_blank" rel="noopener noreferrer">Support</a></li>
```

- [ ] **Step 3: Add CSS for the support link**

In `src/app.css`, add:

```css
.support-plot-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: inherit;
}

.support-plot-link svg {
  color: #e25555;
}
```

- [ ] **Step 4: Verify both links appear and open correctly**

```bash
npm run dev
```

Verify: Profile menu shows "Support Plot" with heart icon above "Sign Out". Landing page footer shows "Support" link. Both open Ko-fi in new tab.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/pages/LandingPage.jsx src/app.css
git commit -m "feat: add Support Plot links to profile menu and landing page footer"
```

### Task 2: Add affiliate links to streaming provider logos in MediaModal

**Files:**
- Modify: `src/components/MediaModal.jsx:150-161` (provider rendering)

- [ ] **Step 1: Update provider pill rendering to use anchor tags**

In `src/components/MediaModal.jsx`, find the provider rendering block (lines 150-161):

```jsx
<div className="input-group">
  <h3>Available Streaming</h3>
  <div className="provider-list">
    {providers?.flatrate?.map(p => (
      <div key={p.provider_id} className="provider-pill">
        <img src={`https://image.tmdb.org/t/p/original${p.logo_path}`} title={p.provider_name} />
        <span>{p.provider_name}</span>
      </div>
    ))}
    {(!providers || !providers.flatrate) && <p className="no-providers">No local streaming discovered yet.</p>}
  </div>
</div>
```

Replace with:

```jsx
<div className="input-group">
  <h3>Available Streaming</h3>
  <div className="provider-list">
    {providers?.flatrate?.map(p => (
      <a
        key={p.provider_id}
        className="provider-pill"
        href={providers.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => { if (!providers.link) e.preventDefault(); }}
      >
        <img src={`https://image.tmdb.org/t/p/original${p.logo_path}`} title={p.provider_name} />
        <span>{p.provider_name}</span>
      </a>
    ))}
    {(!providers || !providers.flatrate) && <p className="no-providers">No local streaming discovered yet.</p>}
  </div>
  {providers?.flatrate?.length > 0 && (
    <p className="affiliate-note">Links may earn Plot a small commission</p>
  )}
</div>
```

Note: `providers.link` comes from the TMDB `watch/providers` response — it's a JustWatch URL for the title in the user's region. When you later sign up for the JustWatch affiliate program, you'll append your affiliate tag to this URL. For now, the raw JustWatch link is a functional deep link.

- [ ] **Step 2: Add CSS for the affiliate note and clickable pills**

In the `<style>` block inside MediaModal.jsx, find `.provider-pill` (around line 400) and add after it:

```css
a.provider-pill {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: var(--transition);
}

a.provider-pill:hover {
  background: #eaeaea;
}

[data-theme="dark"] a.provider-pill:hover {
  background: #333;
}

.affiliate-note {
  font-size: 0.7rem;
  color: var(--text-secondary);
  opacity: 0.6;
  margin-top: 0.3rem;
}
```

- [ ] **Step 3: Verify provider logos are clickable**

```bash
npm run dev
```

Open a movie modal, go to Details tab. Click a streaming provider pill — should open JustWatch page for that title in a new tab. Affiliate disclosure note appears below providers.

- [ ] **Step 4: Commit**

```bash
git add src/components/MediaModal.jsx
git commit -m "feat: make streaming provider logos clickable with affiliate links"
```

---

## Chunk 2: Stripe Pro Subscription Infrastructure

### Task 3: Initialize Supabase CLI and Edge Functions project

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Initialize Supabase project locally**

```bash
npx supabase init
```

This creates the `supabase/` directory with `config.toml`.

- [ ] **Step 2: Create the Edge Function scaffold**

```bash
npx supabase functions new stripe-webhook
```

This creates `supabase/functions/stripe-webhook/index.ts`.

- [ ] **Step 3: Commit the scaffold**

```bash
git add supabase/
git commit -m "chore: initialize Supabase project and stripe-webhook Edge Function scaffold"
```

### Task 4: Add Stripe webhook Edge Function

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Write the Stripe webhook handler**

Replace the contents of `supabase/functions/stripe-webhook/index.ts` with:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Stripe signature verification using Web Crypto API (no npm dependency needed)
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Reject timestamps older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === signature;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await req.text();
  const sigHeader = req.headers.get('stripe-signature');

  if (!sigHeader) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const isValid = await verifyStripeSignature(body, sigHeader, STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(body);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id;
      if (!userId) break;

      // Activate Pro immediately. The invoice.paid event (which fires shortly after)
      // will set the accurate pro_expires_at from Stripe's billing period.
      // For now, set a conservative 35-day window as a buffer.
      const bufferEnd = new Date();
      bufferEnd.setDate(bufferEnd.getDate() + 35);

      const plan = session.metadata?.plan || 'monthly';

      await supabase.from('profiles').update({
        is_pro: true,
        pro_plan: plan,
        pro_expires_at: bufferEnd.toISOString(),
        stripe_customer_id: session.customer,
      }).eq('id', userId);

      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      // Calculate next period end from the subscription
      const periodEnd = new Date(invoice.lines.data[0]?.period?.end * 1000);

      await supabase.from('profiles').update({
        is_pro: true,
        pro_expires_at: periodEnd.toISOString(),
      }).eq('stripe_customer_id', customerId);

      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const interval = subscription.items.data[0]?.plan?.interval;
      const plan = interval === 'year' ? 'annual' : 'monthly';
      const periodEnd = new Date(subscription.current_period_end * 1000);

      await supabase.from('profiles').update({
        pro_plan: plan,
        pro_expires_at: periodEnd.toISOString(),
      }).eq('stripe_customer_id', customerId);

      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      await supabase.from('profiles').update({
        is_pro: false,
        pro_plan: null,
        pro_expires_at: null,
      }).eq('stripe_customer_id', customerId);

      break;
    }

    case 'invoice.payment_failed': {
      // Pro access continues during Stripe Smart Retries (~3 weeks).
      // Only deactivated when customer.subscription.deleted fires.
      console.log('Payment failed for customer:', event.data.object.customer);
      break;
    }

    default:
      console.log('Unhandled event type:', event.type);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat: implement Stripe webhook Edge Function for Pro subscription management"
```

### Task 5: Add Pro columns to profiles table

**Files:**
- Create: `supabase/migrations/001_add_pro_columns.sql`

- [ ] **Step 1: Check existing RLS policies on profiles**

Before creating the migration, inspect existing UPDATE policies on the profiles table. In the Supabase dashboard SQL editor, run:

```sql
SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'profiles';
```

Note the existing UPDATE policy name and its `WITH CHECK` expression. The migration below will need to modify (not duplicate) that existing policy.

- [ ] **Step 2: Create the migration file**

```bash
mkdir -p supabase/migrations
```

Write `supabase/migrations/001_add_pro_columns.sql`:

```sql
-- Add Pro subscription columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_plan text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_expires_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Drop the existing UPDATE policy and replace it with one that also
-- prevents clients from modifying Pro columns.
-- NOTE: Replace 'EXISTING_POLICY_NAME' with the actual policy name
-- found in Step 1.
DROP POLICY IF EXISTS "EXISTING_POLICY_NAME" ON profiles;

CREATE POLICY "Users can update own profile except pro columns"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Block client-side changes to pro fields by ensuring they match existing values
    AND is_pro IS NOT DISTINCT FROM (SELECT p.is_pro FROM profiles p WHERE p.id = auth.uid())
    AND pro_plan IS NOT DISTINCT FROM (SELECT p.pro_plan FROM profiles p WHERE p.id = auth.uid())
    AND pro_expires_at IS NOT DISTINCT FROM (SELECT p.pro_expires_at FROM profiles p WHERE p.id = auth.uid())
    AND stripe_customer_id IS NOT DISTINCT FROM (SELECT p.stripe_customer_id FROM profiles p WHERE p.id = auth.uid())
  );
```

- [ ] **Step 2: Run the migration against your Supabase project**

```bash
npx supabase db push
```

Or apply manually in the Supabase dashboard SQL editor if you prefer.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_add_pro_columns.sql
git commit -m "feat: add Pro subscription columns to profiles table"
```

### Task 6: Create tags and journal_tags tables

**Files:**
- Create: `supabase/migrations/002_create_tags_tables.sql`

- [ ] **Step 1: Write the migration**

Write `supabase/migrations/002_create_tags_tables.sql`:

```sql
-- Custom tags (Pro feature)
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, name)
);

-- Join table for journal entries and tags
CREATE TABLE journal_tags (
  journal_id uuid REFERENCES journal(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (journal_id, tag_id)
);

-- RLS for tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own tags"
  ON tags FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS for journal_tags (ownership via join to tags)
ALTER TABLE journal_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own journal_tags"
  ON journal_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tags
      WHERE tags.id = journal_tags.tag_id
      AND tags.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tags
      WHERE tags.id = journal_tags.tag_id
      AND tags.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Run the migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_create_tags_tables.sql
git commit -m "feat: create tags and journal_tags tables with RLS"
```

### Task 7: Update .env.example with Stripe keys

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add Stripe environment variables**

Add to `.env.example`:

```
VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key_here
```

Note: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set as Supabase Edge Function secrets (not in the client `.env`):

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add Stripe env vars to .env.example"
```

---

## Chunk 3: Client-Side Pro Gating

### Task 8: Create checkProStatus hook

**Files:**
- Create: `src/hooks/checkProStatus.js`

- [ ] **Step 1: Create the hooks directory and checkProStatus hook**

```bash
mkdir -p src/hooks
```

Write `src/hooks/checkProStatus.js`:

```jsx
/**
 * Returns true if the current user has an active Pro subscription.
 * Checks both the is_pro flag and the expiration date as a safety net
 * in case the Stripe webhook is delayed.
 */
export function checkProStatus(profile) {
  if (!profile) return false;
  if (!profile.is_pro) return false;
  if (!profile.pro_expires_at) return false;
  return new Date(profile.pro_expires_at) > new Date();
}
```

Note: This is a simple function (not a React hook), since `profile` is already reactive state managed in App.jsx. Named `checkProStatus` rather than `usePro` to avoid triggering React's hooks linting rules.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/checkProStatus.js
git commit -m "feat: add checkProStatus helper for Pro subscription gating"
```

### Task 9: Create ProUpgradePrompt component

**Files:**
- Create: `src/components/ProUpgradePrompt.jsx`
- Modify: `src/app.css`

- [ ] **Step 1: Create the ProUpgradePrompt component**

Write `src/components/ProUpgradePrompt.jsx`:

```jsx
export default function ProUpgradePrompt({ feature }) {
  const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

  const handleUpgrade = () => {
    // TODO: Replace with actual Stripe Checkout redirect once Stripe products are created
    // For now, this is a placeholder that will be wired up in Task 12
    console.log('Upgrade to Pro clicked');
  };

  const descriptions = {
    Stats: 'See your watching habits, genre breakdowns, and activity trends.',
    Tags: 'Create custom labels like "date night" or "comfort rewatch" for your journal entries.',
    Export: 'Download your full watch history as CSV or JSON.',
    Themes: 'Unlock curated color themes beyond light and dark mode.',
    'Profile Themes': 'Customize your public profile with accent colors and font pairings.',
    Badges: 'Earn streak, milestone, and genre collector badges on your profile.',
  };

  return (
    <div className="pro-upgrade-prompt">
      <div className="pro-upgrade-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>
      <h3 className="pro-upgrade-title">{feature}</h3>
      <p className="pro-upgrade-desc">
        {descriptions[feature] || `Unlock ${feature} with Plot Pro.`}
      </p>
      <p className="pro-upgrade-price">$3/mo or $29/yr</p>
      <button className="pro-upgrade-btn" onClick={handleUpgrade}>
        Upgrade to Pro
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for the upgrade prompt**

Add to `src/app.css`:

```css
.pro-upgrade-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 4rem 2rem;
  max-width: 360px;
  margin: 0 auto;
}

.pro-upgrade-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 50%;
  margin-bottom: 1.2rem;
  color: #333;
}

.pro-upgrade-title {
  font-family: var(--font-serif);
  font-size: 1.4rem;
  margin-bottom: 0.5rem;
}

.pro-upgrade-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 1rem;
}

.pro-upgrade-price {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1.2rem;
}

.pro-upgrade-btn {
  padding: 0.6rem 2rem;
  background: #111;
  color: white;
  border: none;
  border-radius: var(--radius-pill);
  font-family: var(--font-sans);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.pro-upgrade-btn:hover {
  background: #333;
}

[data-theme="dark"] .pro-upgrade-icon {
  background: #2a2a2a;
  color: #f0f0f0;
}

[data-theme="dark"] .pro-upgrade-btn {
  background: #f0f0f0;
  color: #111;
}

[data-theme="dark"] .pro-upgrade-btn:hover {
  background: #ccc;
}
```

- [ ] **Step 3: Verify the component renders correctly**

You can temporarily render it in App.jsx to test:

```jsx
import ProUpgradePrompt from './components/ProUpgradePrompt.jsx';
// In the JSX, temporarily add:
<ProUpgradePrompt feature="Stats" />
```

Verify it shows the star icon, title, description, price, and button. Check light and dark mode. Then remove the temporary render.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProUpgradePrompt.jsx src/app.css
git commit -m "feat: add ProUpgradePrompt component for Pro feature gating"
```

### Task 10: Add "Upgrade to Pro" option to profile dropdown

**Files:**
- Modify: `src/App.jsx` (profile dropdown section and imports)

- [ ] **Step 1: Import checkProStatus in App.jsx**

At the top of `src/App.jsx`, add:

```jsx
import { checkProStatus } from './hooks/checkProStatus.js';
```

- [ ] **Step 2: Call checkProStatus in the component body**

Near the top of the `App` component function (after `profile` state is defined):

```jsx
const isPro = checkProStatus(profile);
```

- [ ] **Step 3: Add "Upgrade to Pro" / "Pro" indicator in profile dropdown**

In the profile dropdown, find the "Support Plot" link you added in Task 1. Add this **before** it:

```jsx
{!isPro ? (
  <button
    className="profile-dropdown-item upgrade-pro-item"
    onClick={() => {
      // TODO: Wire up Stripe Checkout in Task 12
      console.log('Upgrade to Pro clicked');
      setShowProfileMenu(false);
    }}
  >
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
    Upgrade to Pro
  </button>
) : (
  <div className="profile-dropdown-item pro-status-item">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
    Plot Pro
  </div>
)}
```

- [ ] **Step 4: Add CSS for upgrade/pro items**

Add to `src/app.css`:

```css
.upgrade-pro-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #111;
  font-weight: 500;
}

.upgrade-pro-item svg {
  color: #d4a843;
}

.pro-status-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #d4a843;
  font-weight: 500;
  cursor: default;
}

[data-theme="dark"] .upgrade-pro-item {
  color: #f0f0f0;
}
```

- [ ] **Step 5: Verify the dropdown shows the correct state**

```bash
npm run dev
```

Since `is_pro` defaults to false, you should see "Upgrade to Pro" with a gold star. Once the Stripe flow is wired up, Pro users will see "Plot Pro" instead.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/app.css src/hooks/checkProStatus.js
git commit -m "feat: add Upgrade to Pro / Pro status to profile dropdown"
```

---

## Chunk 4: Stripe Checkout Integration

### Task 11: Create checkout Edge Function and client helper

No client-side Stripe library needed — the checkout is server-side via a Supabase Edge Function that returns a Stripe Checkout URL.

**Files:**
- Create: `supabase/functions/create-checkout/index.ts`
- Create: `src/api/stripe.js`
- Modify: `src/components/ProUpgradePrompt.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create server-side Checkout Session Edge Function**

We use a server-side Edge Function instead of the deprecated client-only `stripe.redirectToCheckout()`. This gives us full control over metadata and session configuration.

Create `supabase/functions/create-checkout/index.ts`:

```typescript
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
});

// Replace with actual price IDs from your Stripe dashboard
const PRICE_IDS: Record<string, string> = {
  monthly: 'price_REPLACE_WITH_MONTHLY_PRICE_ID',
  annual: 'price_REPLACE_WITH_ANNUAL_PRICE_ID',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { plan, userId, returnUrl } = await req.json();

  if (!plan || !userId || !PRICE_IDS[plan]) {
    return new Response(JSON.stringify({ error: 'Invalid plan or userId' }), { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
    mode: 'subscription',
    success_url: `${returnUrl}?upgrade=success`,
    cancel_url: `${returnUrl}?upgrade=cancelled`,
    client_reference_id: userId,
    metadata: { plan, supabase_user_id: userId },
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
```

**Important:** After creating Stripe products in the dashboard, replace `price_REPLACE_WITH_MONTHLY_PRICE_ID` and `price_REPLACE_WITH_ANNUAL_PRICE_ID` with the actual price IDs.

- [ ] **Step 2: Create the client-side checkout helper**

Write `src/api/stripe.js`:

```jsx
import { supabase } from './supabase.js';

/**
 * Creates a Stripe Checkout Session via Edge Function and redirects.
 * @param {'monthly' | 'annual'} plan
 * @param {string} userId - Supabase user ID
 */
export async function redirectToCheckout(plan, userId) {
  const { data: { session: authSession } } = await supabase.auth.getSession();

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authSession?.access_token}`,
      },
      body: JSON.stringify({
        plan,
        userId,
        returnUrl: `${window.location.origin}/app`,
      }),
    }
  );

  const { url, error } = await response.json();

  if (error) {
    console.error('Checkout error:', error);
    return;
  }

  window.location.href = url;
}
```

This approach avoids the deprecated client-only `redirectToCheckout` API and gives full control over session metadata.

- [ ] **Step 2: Update ProUpgradePrompt to use real checkout**

In `src/components/ProUpgradePrompt.jsx`, update:

```jsx
import { useState } from 'react';
import { redirectToCheckout } from '../api/stripe.js';

export default function ProUpgradePrompt({ feature, userId }) {
  const [selectedPlan, setSelectedPlan] = useState('monthly');

  const handleUpgrade = () => {
    if (userId) {
      redirectToCheckout(selectedPlan, userId);
    }
  };

  const descriptions = {
    Stats: 'See your watching habits, genre breakdowns, and activity trends.',
    Tags: 'Create custom labels like "date night" or "comfort rewatch" for your journal entries.',
    Export: 'Download your full watch history as CSV or JSON.',
    Themes: 'Unlock curated color themes beyond light and dark mode.',
    'Profile Themes': 'Customize your public profile with accent colors and font pairings.',
    Badges: 'Earn streak, milestone, and genre collector badges on your profile.',
  };

  return (
    <div className="pro-upgrade-prompt">
      <div className="pro-upgrade-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>
      <h3 className="pro-upgrade-title">{feature}</h3>
      <p className="pro-upgrade-desc">
        {descriptions[feature] || `Unlock ${feature} with Plot Pro.`}
      </p>
      <div className="pro-plan-toggle">
        <button
          className={`pro-plan-btn ${selectedPlan === 'monthly' ? 'active' : ''}`}
          onClick={() => setSelectedPlan('monthly')}
        >
          $3/mo
        </button>
        <button
          className={`pro-plan-btn ${selectedPlan === 'annual' ? 'active' : ''}`}
          onClick={() => setSelectedPlan('annual')}
        >
          $29/yr <span className="pro-plan-save">Save 20%</span>
        </button>
      </div>
      <button className="pro-upgrade-btn" onClick={handleUpgrade}>
        Upgrade to Pro
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add CSS for plan toggle**

Add to `src/app.css`:

```css
.pro-plan-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.2rem;
}

.pro-plan-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: var(--radius-pill);
  background: transparent;
  font-family: var(--font-sans);
  font-size: 0.8rem;
  cursor: pointer;
  transition: var(--transition);
  color: var(--text-secondary);
}

.pro-plan-btn.active {
  border-color: #333;
  color: var(--text-primary);
  font-weight: 600;
}

.pro-plan-save {
  font-size: 0.7rem;
  color: #4CAF50;
  font-weight: 600;
}

[data-theme="dark"] .pro-plan-btn {
  border-color: #444;
}

[data-theme="dark"] .pro-plan-btn.active {
  border-color: #ccc;
  color: #f0f0f0;
}
```

- [ ] **Step 4: Update App.jsx upgrade button to use checkout**

In `src/App.jsx`, import the checkout helper:

```jsx
import { redirectToCheckout } from './api/stripe.js';
```

Find the "Upgrade to Pro" button in the profile dropdown (from Task 10) and update its onClick:

```jsx
onClick={() => {
  redirectToCheckout('monthly', user.id);
  setShowProfileMenu(false);
}}
```

- [ ] **Step 5: Verify the flow (test mode)**

```bash
npm run dev
```

Set `VITE_STRIPE_PUBLISHABLE_KEY` to your Stripe test mode publishable key in `.env`. Click "Upgrade to Pro" — should redirect to Stripe Checkout in test mode. Use Stripe test card `4242 4242 4242 4242` to complete payment.

After payment, verify:
- Stripe sends webhook to your Edge Function
- `profiles` table is updated with `is_pro = true`
- App reflects Pro status in profile dropdown

- [ ] **Step 6: Commit**

```bash
git add src/api/stripe.js src/components/ProUpgradePrompt.jsx src/App.jsx src/app.css supabase/functions/stripe-webhook/index.ts
git commit -m "feat: wire up Stripe Checkout for Pro subscription upgrade flow"
```

### Task 12: Add Manage Subscription link for Pro users

**Files:**
- Modify: `src/App.jsx` (profile dropdown)

- [ ] **Step 1: Add Stripe Customer Portal link for Pro users**

In the profile dropdown, find the Pro status item (from Task 10). Replace the static "Plot Pro" div with a link to Stripe Customer Portal:

```jsx
) : (
  <a
    href="https://billing.stripe.com/p/login/REPLACE_WITH_PORTAL_LINK"
    target="_blank"
    rel="noopener noreferrer"
    className="profile-dropdown-item pro-status-item"
  >
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
    Manage Pro
  </a>
)}
```

Note: Replace the `href` with your Stripe Customer Portal link. You configure this in Stripe Dashboard → Settings → Customer Portal. Stripe generates a portal URL. Alternatively, create a Supabase Edge Function that generates a portal session URL on demand — but the static portal link works for launch.

- [ ] **Step 2: Add CSS for the clickable manage link**

Add to `src/app.css`:

```css
a.pro-status-item {
  text-decoration: none;
  cursor: pointer;
}

a.pro-status-item:hover {
  background: #f5f5f5;
}

[data-theme="dark"] a.pro-status-item:hover {
  background: #2a2a2a;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx src/app.css
git commit -m "feat: add Manage Pro link to profile dropdown for Pro subscribers"
```

---

## Chunk 5: Pro Features — Stats Dashboard & Export

### Task 13: Add Stats tab to navigation

**Files:**
- Modify: `src/App.jsx` (navigation tabs)

- [ ] **Step 1: Find the navigation tabs in App.jsx**

Search for the tab bar rendering. Find where the tab buttons are defined (Feed, New, Upcoming, Journal). There are two nav bars — desktop (around line 601) and mobile bottom tab bar (around line 895). Add a Stats tab to **both**, after Journal. Use the same className pattern as existing tabs:

```jsx
<button className={`nav-tab ${view === 'stats' ? 'active' : ''}`} onClick={() => setView('stats')}>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
  <span>Stats</span>
</button>
```

- [ ] **Step 2: Add Stats view routing in the main content area**

In the view rendering section of App.jsx (where `{view === 'home' && ...}` etc. are), add:

```jsx
{view === 'stats' && (
  isPro ? (
    <div className="stats-coming-soon">
      <h2>Stats</h2>
      <p>Your watching stats will appear here. Coming soon.</p>
    </div>
  ) : (
    <ProUpgradePrompt feature="Stats" userId={user?.id} />
  )
)}
```

Import ProUpgradePrompt at the top of App.jsx if not already imported:

```jsx
import ProUpgradePrompt from './components/ProUpgradePrompt.jsx';
```

- [ ] **Step 3: Add placeholder CSS for stats**

Add to `src/app.css`:

```css
.stats-coming-soon {
  text-align: center;
  padding: 4rem 2rem;
}

.stats-coming-soon h2 {
  font-family: var(--font-serif);
  margin-bottom: 0.5rem;
}

.stats-coming-soon p {
  color: var(--text-secondary);
  font-size: 0.9rem;
}
```

- [ ] **Step 4: Verify Stats tab appears and shows correct content**

```bash
npm run dev
```

Click Stats tab. Free users see ProUpgradePrompt. Pro users see the coming-soon placeholder.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/app.css
git commit -m "feat: add Stats tab with Pro gating"
```

### Task 14: Add journal export for Pro users

**Files:**
- Create: `src/utils/exportJournal.js`
- Modify: `src/App.jsx` (profile dropdown)

- [ ] **Step 1: Create the export utility**

```bash
mkdir -p src/utils
```

Write `src/utils/exportJournal.js`:

```jsx
/**
 * Exports journal entries as a downloadable file.
 * @param {Array} watched - Array of journal entry objects
 * @param {'csv' | 'json'} format
 */
export function exportJournal(watched, format) {
  if (!watched || watched.length === 0) return;

  let content, filename, mimeType;

  if (format === 'json') {
    content = JSON.stringify(watched, null, 2);
    filename = `plot-journal-${new Date().toISOString().split('T')[0]}.json`;
    mimeType = 'application/json';
  } else {
    const headers = ['Title', 'Type', 'Rating', 'Mood', 'Status', 'Note', 'Watched At'];
    const rows = watched.map(entry => [
      entry.title || entry.name || '',
      entry.media_type || '',
      entry.rating || '',
      entry.mood || '',
      entry.watchStatus || '',
      (entry.note || '').replace(/"/g, '""'),
      entry.watched_at || '',
    ].map(v => `"${v}"`).join(','));

    content = [headers.join(','), ...rows].join('\n');
    filename = `plot-journal-${new Date().toISOString().split('T')[0]}.csv`;
    mimeType = 'text/csv';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add export buttons to profile dropdown**

In `src/App.jsx`, import the export utility:

```jsx
import { exportJournal } from './utils/exportJournal.js';
```

In the profile dropdown, add export buttons after the Taste section (before the "Support Plot" link). Only show for Pro users:

```jsx
{isPro && watched.length > 0 && (
  <div className="profile-dropdown-export">
    <span className="settings-label">Export Journal</span>
    <div className="export-btns">
      <button className="export-btn" onClick={() => { exportJournal(watched, 'csv'); setShowProfileMenu(false); }}>CSV</button>
      <button className="export-btn" onClick={() => { exportJournal(watched, 'json'); setShowProfileMenu(false); }}>JSON</button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add CSS for export buttons**

Add to `src/app.css`:

```css
.profile-dropdown-export {
  padding: 0.6rem 1rem;
}

.export-btns {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

.export-btn {
  padding: 0.3rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: var(--radius-pill);
  background: transparent;
  font-family: var(--font-sans);
  font-size: 0.75rem;
  cursor: pointer;
  transition: var(--transition);
  color: var(--text-secondary);
}

.export-btn:hover {
  border-color: #999;
  color: var(--text-primary);
}

[data-theme="dark"] .export-btn {
  border-color: #444;
}

[data-theme="dark"] .export-btn:hover {
  border-color: #888;
  color: #f0f0f0;
}
```

- [ ] **Step 4: Verify export works for Pro users**

To test, temporarily set `is_pro = true` for your user in the Supabase dashboard. Then open profile dropdown, click CSV or JSON. A file should download with your journal data. Set `is_pro` back to false and verify export buttons don't appear.

- [ ] **Step 5: Commit**

```bash
git add src/utils/exportJournal.js src/App.jsx src/app.css
git commit -m "feat: add journal export (CSV/JSON) as Pro feature"
```

---

## Summary

| Chunk | Tasks | What it achieves |
|-------|-------|-----------------|
| 1: Ko-fi & Affiliate | 1-2 | Support links + clickable streaming providers with affiliate disclosure |
| 2: Stripe Infrastructure | 3-7 | Edge Functions, DB migrations, env setup |
| 3: Client-Side Gating | 8-10 | checkProStatus helper, ProUpgradePrompt, dropdown upgrade/manage |
| 4: Stripe Checkout | 11-12 | Checkout Edge Function, client helper, Manage Pro link |
| 5: Pro Features | 13-14 | Stats tab (placeholder), journal export |

**After these 5 chunks, Plot has:**
- A Ko-fi tip jar link in the app and landing page
- Affiliate-linked streaming provider logos
- A working Stripe Pro subscription flow ($3/mo or $29/yr)
- Pro feature gating with upgrade prompts
- Stats tab (placeholder for future buildout)
- Journal export for Pro users

**Deferred to future plans:**
- Stats dashboard implementation (charts, genre breakdown, etc.)
- Custom tags UI
- Additional app themes and profile themes
- Profile badges
- Year in Review (Q4 build)
- Early access program for Pro users
- Pricing section on landing page
