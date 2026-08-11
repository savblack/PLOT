# Brevo free tier vs PLOT's planned marketing flow

Research for savblack/PLOT#484. All facts below were checked against Brevo's own
documentation, pricing page and API on **10 August 2026**. Brevo changes pricing and
plan limits without notice, so re-check before acting on this months from now.

## Verdict

**Yes at PLOT's current size, no once any single send exceeds 300 recipients.**

The free plan has no monthly send cap, no meaningful contact-storage cap, and it does
include multi-step automation journeys. None of those are the problem. What breaks
first is the **300 emails per day** hard cap on the free plan, and it breaks on the
relaunch announcement and the weekly newsletter, both of which are single-day blasts
to an entire list.

Ranked by what fails first:

1. **300 sends per day.** A relaunch announcement to more than 300 waitlist contacts
   cannot go out in one day. Brevo delivers the first 300 and you have to manually
   requeue the campaign each following day until everyone has it. Same problem for a
   weekly digest once marketing subscribers pass roughly 300.
2. **2,000 unique contacts entering automations, ever.** This is a cumulative lifetime
   count, not a monthly one. The waitlist welcome and the nurture sequence both run as
   automations, so they stop admitting new contacts once 2,000 people have entered.
   Irrelevant at a few hundred contacts, fatal at a few thousand.
3. **The "Sent with Brevo" sticker.** Permanently attached to every free-plan email
   and not removable at any price on free. It will appear on the relaunch
   announcement.

At the modelled scales:

- **A few hundred contacts: fits free, with one caveat.** Welcome emails and the
  nurture sequence are comfortably inside every limit. The relaunch announcement to
  around 400 people needs a two-day manual requeue. A weekly digest works cleanly up
  to roughly 250 subscribers, because the welcome and nurture emails going out the
  same day share the same 300.
- **A few thousand contacts: does not fit free, and does not fit the $9 plan either.**
  A 3,000 person announcement takes ten consecutive days of manual requeuing with
  nothing else sendable in that window. A weekly digest to 2,000 subscribers takes
  seven days per issue, so issue two starts before issue one finishes. The automation
  cap is also blown by the waitlist alone. Total monthly volume also exceeds what 300
  a day can physically deliver.

## Verified current state

Read from the Brevo API on 10 August 2026 using the key already in the repo `.env`:

- Account plan: `{"type": "free", "credits": 300, "creditsType": "sendLimit"}`
- Total contacts: **21**
- Lists: `PLOT App Users` (id 4, 21 subscribers), `PLOT Marketing Subscribers`
  (id 5, 1 subscriber), `PLOT Waitlist` (id 6, 1 subscriber), plus a leftover
  `Your first list` (id 2, empty)

This matches the state described in the ticket exactly. The account is genuinely on
free, the 300 daily cap is live, and nothing has been sent through it yet.

Codebase side, Brevo is used only for contact upserts and list membership, never for
sending. See `supabase/functions/_shared/brevo.ts` (POST to `/v3/contacts` with
`updateEnabled: true`, plus list-remove and delete helpers), consumed by
`supabase/functions/notify-signup/index.ts`,
`supabase/functions/profiles-changed/index.ts`,
`supabase/functions/newsletter-subscribe/index.ts` and
`supabase/functions/delete-account/index.ts`. Transactional and auth mail runs through
Resend, which is what keeps the Brevo daily allowance free for marketing.

## 1. Free-tier limits

| Limit | Free plan value |
| --- | --- |
| Daily send cap | 300 email sends per day, resets daily, no rollover |
| Monthly send cap | None stated. The daily cap gives an effective ceiling near 9,000 per month |
| Contact storage | 100,000 contacts |
| Contacts entering automations | 2,000 unique contacts, cumulative across all active automations |
| Stored email campaigns | 10,000 including drafts |
| Scheduled campaigns at once | 150 |
| Active automation workflows | 50 |
| User seats | 1, the account owner |
| Reporting | Basic statistics only |

Brevo's wording on the daily limit: "The Free plan includes 300 email sends per day.
The daily limit resets every day, and unused emails do not roll over to the next day."
Source: <https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan> (checked 10 Aug 2026).

On contact storage, the same page states the free plan allows storage of up to 100,000
contacts. PLOT will not come close, so contact storage is not a constraint on free.
It becomes one on paid plans, which is covered in section 7.

The campaign, automation and contact quota tables are at
<https://help.brevo.com/hc/en-us/articles/9168632514066-What-are-the-different-quotas-applied-in-Brevo>
and the 50 active workflow figure at
<https://developers.brevo.com/docs/platform-quotas> (both checked 10 Aug 2026).

## 2. Automation gating, the crux

**Multi-step journeys are available on free.** This is the single most commonly
misreported fact about Brevo, because the marketing pricing page lists "Marketing
automation, create an unlimited number of automated, multi-step workflows" as a
Standard plan bullet, which reads as though free gets nothing. The help documentation
is explicit that it does. Brevo's own plan article lists "Multi-channel marketing
automation (up to 2,000 contacts)" among the features included in the free plan.
Source: <https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans> (checked 10 Aug 2026).

The Standard bullet is really about the contact cap, not the step count. The quota
table spells this out: contacts in automations is 2,000 unique contacts on Free and
Starter, unlimited on Standard and above.

The building blocks a nurture sequence needs are all ungated. Brevo's reference page
for automation steps marks plan restrictions inline, and the restrictions are all on
sales and messaging features PLOT does not need: Conversations, Deals, Meetings, Phone
and Loyalty triggers need a Sales package or Enterprise, push and web push triggers
need Professional or Enterprise, Wallet needs Enterprise. The messaging action "Send an
email" carries no plan note. The rules "Time delay", "Conditional split", "Percentage
split" and "Wait until an event happens" carry no plan note either. Source:
<https://help.brevo.com/hc/en-us/articles/15445989568402-Available-triggers-actions-and-rules-in-an-automation> (checked 10 Aug 2026).

So a five-email nurture sequence spread over six weeks, triggered by joining the
waitlist list, with time delays between each step, is buildable on free. What the free
plan denies is scale: once 2,000 unique contacts have entered active automations, no
further contacts enter. Brevo's stated behaviour is that automations stay active and
contacts already inside keep moving through, but new ones are refused. Brevo emails a
warning at 80 percent and again at 100 percent of the limit.

Free does not get A/B testing, so the "percentage split" rule is usable but the
campaign-level A/B test feature is not.

## 3. Do marketing and transactional share the allowance?

**Yes.** Brevo's FAQ answers it directly: "Yes, you can use your email credits to send
both marketing and transactional emails." Source:
<https://help.brevo.com/hc/en-us/articles/8292912279954-Add-or-remove-emails-from-your-plan> (checked 10 Aug 2026).

For PLOT this is good news rather than bad. Because transactional and auth mail lives
on Resend and is staying there, none of it touches the Brevo 300. The entire daily
allowance is available for marketing. If transactional ever moved to Brevo, password
resets and signup confirmations would start competing with the newsletter for the same
300, which would be a bad trade.

Note also that Brevo removed the separate transactional hourly quota on 10 March 2023,
so there is no second throttle hiding behind the daily one. Source:
<https://help.brevo.com/hc/en-us/articles/360021917460-Why-are-emails-added-to-a-queue> (checked 10 Aug 2026).

## 4. What happens on overage

Not a forced upgrade, and not a silent throttle either. It is a small queue followed by
a hard drop.

Brevo's wording: "Once you reach your daily limit, up to 1,000 additional emails are
held in a retry queue. Emails beyond this queue are not delivered." And for campaigns:
"If you send a campaign for more than 300 recipients, only 300 contacts will receive it
on the scheduled day. To reach the remaining contacts, you need to manually resend the
campaign (up to 300 email sends per day) with the Requeue option until all contacts
receive it." Source:
<https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan> (checked 10 Aug 2026).

Two consequences worth planning around. First, the requeue is manual, so a large
announcement needs someone to press a button every day until it finishes. Second, once
the daily limit is reached you cannot even schedule a campaign in advance for the next
day. You have to wait for the quota to reset. Queued mail is not held indefinitely
either. Brevo's transactional queue article states emails still in the queue start
getting discarded after 36 hours.

Nothing about this auto-charges the account. There is no overage billing on free, which
means the zero-cost requirement cannot be violated by accident. The failure mode is
undelivered email, not a surprise invoice.

## 5. Forced Brevo branding

**Yes, and it cannot be removed on free at any price.** Brevo's answer: "No. Emails
sent from the Free plan always include the Sent with Brevo sticker." The removal path
is Starter plus the Remove Brevo logo add-on at 9 USD per month, or Standard and above
where it is included. There is an explicit FAQ confirming there is no way to remove it
on free. Sources:
<https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan>
and <https://help.brevo.com/hc/en-us/articles/4409354969746-Customize-your-plan-with-add-ons> (checked 10 Aug 2026).

Whether this matters is a judgement call rather than a technical one. It is a small
footer line on the welcome and nurture emails, which is unremarkable. On the relaunch
announcement, which is the one email the whole waitlist opens and which is meant to
present PLOT as a finished product, a third-party sending sticker undercuts the tone
slightly. It is not a blocker. It is the kind of thing worth 9 dollars for one month
and not worth a permanent subscription.

## 6. Deliverability and authentication requirements

No dedicated IP is needed, and buying one would actively hurt. Brevo recommends a
dedicated IP only if "You send at least three email campaigns per week to 3,000 or more
contacts, or You send over 100,000 emails per month, with no gaps longer than a week
between sends." PLOT meets neither condition at any modelled scale. A dedicated IP with
low volume has no warm reputation behind it and lands worse than Brevo's shared pool.
For reference the cost is 251 USD per year, and it is a Professional plan add-on
anyway. Source:
<https://help.brevo.com/hc/en-us/articles/4409354969746-Customize-your-plan-with-add-ons> (checked 10 Aug 2026).

Domain authentication is effectively mandatory, and it is real setup work rather than a
cost. Brevo's compliance guidance requires sending from a custom domain, authenticating
with DKIM and DMARC, and staying under a 0.3 percent spam complaint rate, following the
Gmail and Yahoo sender requirements from February 2024 and Microsoft's from May 2025.
The article is blunt about the consequence: if the domain is not authenticated with
DMARC, mail to Outlook, Hotmail and Live addresses will be marked as spam or rejected.
Source:
<https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders> (checked 10 Aug 2026).

The practical task for PLOT: theplot.tv is already verified and authenticated on Resend
for transactional mail, but Brevo needs its own Brevo code and DKIM records added to the
same domain before campaigns go out. Two providers on one domain is normal and works,
since each uses its own DKIM selector, but the SPF record and the DMARC policy need to
be checked so they cover both senders. This should be done and verified before the
relaunch announcement, not on the day.

The domain alignment requirement for bulk senders, meaning more than 5,000 emails per
day, does not apply to PLOT, since the free plan caps at 300.

## 7. Cheapest paid tier, if it comes to that

Prices below are the USD figures from Brevo's plan documentation. The public pricing
page is geolocated, and from this machine it renders in AUD at A$12 per month for
Starter billed monthly and A$25 for Standard, so confirm the number in the account
before buying.

| Plan | From | What it fixes | What it does not fix |
| --- | --- | --- | --- |
| Starter | 9 USD per month | Removes the daily cap. 5,000 emails per month, up to 500 contacts | Still capped at 2,000 contacts in automations. Brevo logo still shown unless you add the 9 USD per month removal add-on |
| Standard | 18 USD per month | Unlimited contacts in automations, no Brevo logo, A/B testing, advanced reporting | Entry tier still only stores 500 contacts |
| Professional | 499 USD per month | Not remotely relevant | |

Source: <https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans> (checked 10 Aug 2026).

Two traps in the paid tiers worth knowing before anyone signs up.

**Starter does not lift the automation cap.** The quota table lists "Free and Starter:
2,000 unique contacts" for contacts in automations, with Standard as the first plan
offering unlimited. So paying 9 dollars fixes the daily send cap but leaves the nurture
sequence capped. And since Starter needs the 9 dollar logo add-on to drop the branding,
Starter plus that add-on costs the same 18 dollars as Standard while delivering less.
If a paid plan is ever needed, Standard is the only sensible choice.

**Contact storage is tied to the email volume tier on paid plans.** The 18 dollar
Standard entry price covers 5,000 emails per month and only 500 contacts. The tiers run
5,000 emails to 500 contacts, 10,000 to 1,500, 15,000 to 2,500, and 20,000 upward to
500,000. So "Standard is 18 dollars" is only true at the smallest size. At a few
thousand contacts the real bill is the 15,000 or 20,000 email tier, which is materially
more. Brevo also notes you cannot downgrade to a tier whose contact limit is below your
current contact count without deleting contacts first.

**The one genuinely zero-per-month escape hatch.** Prepaid email credits are a one-time
purchase with no recurring fee, and on a free account they replace the 300 daily free
emails and unlock all Starter plan features plus the Remove Brevo logo add-on. Credits
never expire. The 2,000 contacts in automations limit still applies. Packs run from
5,000 to 1 million emails. Source:
<https://help.brevo.com/hc/en-us/articles/4409354969746-Customize-your-plan-with-add-ons> (checked 10 Aug 2026).

This is worth flagging specifically because the standing constraint is zero dollars per
month rather than zero dollars ever. A one-off credit pack bought for the relaunch week
would clear the daily cap for the announcement and remove the Brevo sticker from it,
then leave the account back on free with no subscription running. It still needs
explicit sign-off since it is a real cost, but it is structurally different from
committing to a monthly bill.

## Recommendation

Stay on free. Nothing about the current plan requires paying, provided the flow is
designed around one rule: **no single send goes to more than 300 recipients on a day
when anything else is sending.**

Concretely:

- Build the waitlist welcome and the 5 to 7 week nurture sequence as Brevo automations
  now. They work on free, they need no paid feature, and at PLOT's current 21 contacts
  the 2,000 entry cap is years away.
- Keep transactional and auth mail on Resend. Moving it to Brevo would eat the same 300
  a day the marketing needs.
- Add Brevo's DKIM and DMARC records for theplot.tv and verify them well before the
  announcement, checking they coexist with the existing Resend setup.
- Watch the waitlist count as the single trigger for revisiting this. Below roughly 250
  it is a non-issue. Between 250 and about 600 the announcement just needs splitting
  across two or three days with the manual requeue, which is free but has to be
  remembered. Above that, either accept a staggered announcement or buy a one-off
  prepaid credit pack for launch week.
- If the waitlist ever passes 2,000, the nurture automation stops accepting new
  contacts and Standard becomes unavoidable. Brevo warns by email at 80 percent, so
  there is advance notice rather than a silent failure.

## Sources

All checked 10 August 2026.

- <https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan>
- <https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans>
- <https://help.brevo.com/hc/en-us/articles/9168632514066-What-are-the-different-quotas-applied-in-Brevo>
- <https://help.brevo.com/hc/en-us/articles/8292912279954-Add-or-remove-emails-from-your-plan>
- <https://help.brevo.com/hc/en-us/articles/4409354969746-Customize-your-plan-with-add-ons>
- <https://help.brevo.com/hc/en-us/articles/15445989568402-Available-triggers-actions-and-rules-in-an-automation>
- <https://help.brevo.com/hc/en-us/articles/14611647354002-Getting-started-with-Automations>
- <https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders>
- <https://help.brevo.com/hc/en-us/articles/360021917460-Why-are-emails-added-to-a-queue>
- <https://developers.brevo.com/docs/platform-quotas>
- <https://www.brevo.com/pricing/>
- Brevo API `/v3/account`, `/v3/contacts` and `/v3/contacts/lists` against PLOT's own account
