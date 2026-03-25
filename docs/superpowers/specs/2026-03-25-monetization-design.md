# Plot Monetization Design Spec

**Date:** 2026-03-25
**Goal:** Cover infrastructure costs and compensate developer time through three complementary revenue streams while keeping the core product free.

---

## Revenue Streams Overview

| Stream | Effort | Revenue potential | Scales with |
|--------|--------|-------------------|-------------|
| Pro subscriptions ($3/mo or $29/yr) | Medium | Primary | Engaged users |
| Affiliate links in MediaModal | Low | Supplementary, passive | All users |
| Ko-fi tip jar (external) | Minimal | Bonus, unpredictable | Goodwill |

**Implementation order:** Ko-fi (zero code) → Affiliate links (small change) → Pro subscription (biggest chunk).

---

## 1. Free vs. Pro Feature Split

### Free (forever)

- Log, rate, mood, and notes on movies & TV shows
- Unlimited lists
- Timeline (linear + grid views)
- Public profile & shareable list links
- Feed (For You + Trending)
- New Releases & Upcoming browse
- Search
- Light/dark mode
- Region-based streaming provider info

### Plot Pro ($3/mo or $29/yr)

- **Stats dashboard** — total watched, hours logged, genre breakdown, director/actor stats, monthly activity chart
- **Year in Review** — annual wrapped-style summary generated at year end
- **Custom tags** — user-created labels on journal entries (e.g., "date night", "comfort rewatch")
- **Journal export** — CSV and JSON download of full watch history
- **Custom profile themes** — accent color, background style, font pairing for public profile
- **App themes** — curated color themes beyond light/dark (e.g., "Noir", "Matinee", "Midnight")
- **Profile badges** — streak badges (7-day, 30-day), milestone badges (100 films logged), genre collector badges
- **Early access** — priority access to new features

---

## 2. Affiliate Revenue

### How it works

The MediaModal already displays streaming provider logos via TMDB data. Make those logos clickable with affiliate-tagged URLs so clicks that lead to signups or purchases earn commission.

### Affiliate programs (priority order)

1. **JustWatch affiliate** — single integration covering most streaming services with deep links. Start here for simplicity.
2. **Apple TV affiliate (Apple Services Performance Partners)** — best payout, covers iTunes rentals/purchases + Apple TV+ subscriptions. Layer in after launch.
3. **Amazon Associates** — covers Prime Video rentals/purchases. Layer in after launch.

### Implementation

- Provider logos in MediaModal are currently static `<div>`/`<img>` elements with no links — wrap each in an `<a>` tag with affiliate-tagged URLs
- Use JustWatch deep-link API with the TMDB content ID to resolve per-provider affiliate URLs
- Add a small "affiliate link" disclosure note in the modal footer for compliance

### Revenue expectation

$10-50/mo at low-to-mid traffic. Passive and scales with all users (free and Pro).

---

## 3. Tip Jar / Support Plot

### Approach

Link to an external Ko-fi page rather than building custom tip payment UI.

- Ko-fi takes 0% platform fee on donations
- Supports custom donation amounts (donor types whatever they want)
- Supports one-time and recurring monthly tips
- Page can be branded to match Plot's aesthetic

### Placement

1. **Profile/settings menu** in the app — heart icon with "Support Plot" label
2. **Landing page footer** — alongside other links

### Why external

Building a custom tip flow would mean a separate Stripe integration, more UI, more edge cases. Ko-fi does exactly this for free. Keep in-app Stripe integration focused on Pro subscriptions only.

---

## 4. Payment Infrastructure — Stripe

### Why Stripe

- Industry standard subscription management
- Well-documented Supabase integration patterns
- Full control over checkout experience
- 2.9% + $0.30 per transaction
- Handles monthly + annual billing, cancellation, renewals, failed payments

### Subscription flow

```
User clicks "Upgrade to Pro"
        │
        ▼
Stripe Checkout (hosted page)
        │
        ▼
Stripe processes payment
        │
        ▼
Stripe sends webhook to Supabase Edge Function
        │
        ▼
Edge Function updates profiles table:
  - is_pro = true
  - pro_plan = 'monthly' | 'annual'
  - pro_expires_at = billing period end
  - stripe_customer_id = Stripe customer ID
        │
        ▼
App reads profile.is_pro to gate Pro features
```

### Stripe products to create

- **Plot Pro Monthly** — $3.00/mo recurring
- **Plot Pro Annual** — $29.00/yr recurring (~20% discount)

### Webhook Edge Function

- **Name:** `stripe-webhook` (Supabase Edge Function)
- **Security:** Must verify the `stripe-signature` header using the webhook signing secret before processing any event. Reject unverified requests.
- **Idempotency:** Check `event.id` to avoid processing duplicate/replayed events (store processed event IDs or rely on database constraints).

### Environment variables

- `VITE_STRIPE_PUBLISHABLE_KEY` — client-side, used for Stripe Checkout redirect
- `STRIPE_SECRET_KEY` — Edge Function only, never exposed to client
- `STRIPE_WEBHOOK_SECRET` — Edge Function only, for signature verification
- Use separate test-mode and live-mode keys for development vs. production

### Webhook events to handle

- `checkout.session.completed` — activate Pro
- `invoice.paid` — renew Pro (update `pro_expires_at`)
- `customer.subscription.updated` — update `pro_plan` and `pro_expires_at` (fires when user switches monthly ↔ annual via Customer Portal)
- `customer.subscription.deleted` — deactivate Pro
- `invoice.payment_failed` — Pro access remains active during Stripe's Smart Retries (~3 weeks). Pro is only deactivated when `customer.subscription.deleted` fires after all retries are exhausted.

### Cancellation

- User can cancel from a "Manage Subscription" link that opens Stripe Customer Portal
- Stripe Customer Portal handles cancellation, plan changes, payment method updates
- On cancellation, Pro access continues until `pro_expires_at`, then `is_pro` flips to false

---

## 5. Database Schema Changes

### `profiles` table — add columns

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `is_pro` | boolean | false | Main gate for Pro features |
| `pro_plan` | text (nullable) | null | `'monthly'` or `'annual'` |
| `pro_expires_at` | timestamptz (nullable) | null | Current billing period end |
| `stripe_customer_id` | text (nullable) | null | Links Supabase user to Stripe |

### `tags` table — new

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Primary key |
| `user_id` | uuid (FK → profiles) | Owner |
| `name` | text | Tag label, e.g., "date night" |
| `color` | text (nullable) | Hex color for tag pill UI |
| `created_at` | timestamptz | Default `now()`, for ordering |

**Constraints:** Unique on `(user_id, name)` to prevent duplicate tag labels per user.

### `journal_tags` table — new (join table)

| Column | Type | Description |
|--------|------|-------------|
| `journal_id` | uuid (FK → journal) | Journal entry |
| `tag_id` | uuid (FK → tags) | Tag |

Primary key: composite `(journal_id, tag_id)`.

### Row Level Security

- `tags`: users can only read/write their own rows (`auth.uid() = user_id`)
- `journal_tags`: ownership resolved via join — policy uses `EXISTS (SELECT 1 FROM tags WHERE tags.id = journal_tags.tag_id AND tags.user_id = auth.uid())`
- `is_pro`, `pro_plan`, `pro_expires_at`, `stripe_customer_id` on `profiles`: writable only by the Supabase Edge Function using the service role key, never from the client
- Client-side RLS policy for profiles should exclude these columns from update

---

## 6. Client-Side Feature Gating

### `usePro` hook

```jsx
function usePro() {
  const { profile } = useAuth(); // or however profile is accessed
  return profile?.is_pro === true && new Date(profile.pro_expires_at) > new Date();
}
```

The `pro_expires_at` check is a client-side safety net — if the webhook that flips `is_pro` to false is delayed, the client won't grant access beyond the paid period.

### Gating pattern

Pro features check the hook and show an upgrade prompt when `is_pro` is false:

```jsx
function StatsView({ ... }) {
  const isPro = usePro();
  if (!isPro) return <ProUpgradePrompt feature="Stats" />;
  return <StatsContent />;
}
```

### `ProUpgradePrompt` component

A reusable component shown in place of locked features. Shows:
- Feature name and brief description of what it unlocks
- "$3/mo or $29/yr" pricing
- "Upgrade to Pro" button → Stripe Checkout
- Dismissible, non-intrusive

### Where Pro gates appear

- Stats tab in navigation (new tab, Pro-only)
- Custom tags UI in journal entry editing
- Export button in journal/settings
- Theme picker (shows free themes + locked Pro themes)
- Profile theme customization on public profile settings
- Badge display section in profile

---

## 7. New UI Components

### Pro subscription

- **"Upgrade to Pro" banner** — subtle, dismissible banner in the app (not aggressive)
- **Pro badge** — small visual indicator on Pro users' profiles
- **Manage Subscription page** — link to Stripe Customer Portal + current plan info
- **Stats dashboard** — new view/tab for Pro users
- **ProUpgradePrompt** — reusable gate component (see above)

### Affiliate

- **Clickable provider logos** in MediaModal with affiliate URLs
- **"Affiliate link" footer note** in MediaModal

### Tip jar

- **"Support Plot" link** with heart icon in settings menu
- **"Support Plot" link** in landing page footer

---

## 8. Cost Projections

| Growth stage | Users | Infra cost/mo | Break-even Pro subscribers |
|-------------|-------|---------------|---------------------------|
| Launch | 0-1K | ~$5 | 2 |
| Growing | 1K-10K | ~$50-75 | 17-25 |
| Established | 10K+ | ~$100-200 | 34-67 |

These are Pro subscribers needed to cover infra only. Time compensation is additive — every subscriber beyond break-even compensates your time.

At a 5% conversion rate (typical for freemium), 1K users → ~50 Pro subscribers → ~$150/mo. At 10K users → ~500 Pro subscribers → ~$1,500/mo.

---

## 9. TMDB Commercial Use

TMDB's API is free for non-commercial use. Once Plot monetizes, you need to apply for commercial approval. This is typically granted (TMDB is generous with indie apps) but requires:
- Attributing TMDB as the data source (you likely already do this)
- Applying via their website for commercial use approval
- No storing/redistributing their image assets beyond caching

**Action required before launch:** Submit TMDB commercial use application.

---

## 10. Implementation Phases

### Phase 1: Zero-code monetization (day 1)
- Create Ko-fi page with Plot branding
- Add "Support Plot" links to app settings menu and landing page footer
- Submit TMDB commercial use application

### Phase 2: Affiliate links (small code change)
- Sign up for JustWatch affiliate program
- Update MediaModal to use affiliate-tagged provider URLs
- Add affiliate disclosure note

### Phase 3: Pro subscription infrastructure
- Create Stripe account and products (monthly + annual)
- Add columns to `profiles` table
- Create `tags` and `journal_tags` tables with RLS
- Build Supabase Edge Function for Stripe webhooks
- Implement `usePro` hook and `ProUpgradePrompt` component

### Phase 4: Pro features
- Stats dashboard
- Custom tags UI in journal entry editing
- Journal export (CSV/JSON)
- Additional app themes
- Custom profile themes
- Profile badges
- Year in Review (deferred — build in Q4 so it's ready for first January; auto-generates from previous year's journal data, displayed as a shareable page)

### Prerequisites
- Public profile routes (`/u/:username`) must be accessible without authentication — currently behind `ProtectedRoute`. Fix before Phase 2 so affiliate links on public profiles reach all visitors.

### Phase 5: Upgrade UX
- "Upgrade to Pro" banner and flows
- Manage Subscription page (Stripe Customer Portal link)
- Pro badge on profiles
- Pricing section on landing page
