# Bots and handoffs

Moved out of `AGENTS.md`, which points here. "Keep work resumable" stays in `AGENTS.md`.

## Who Savannah talks to

Savannah's main interface is her Grok bots. Cursor edits the repo when one of those bots has already routed the work here. It does not replace Chris, and it does not write a second morning plan.

Plot is a TV and movie tracking app. The web app is at app.theplot.tv. The mobile app is on the way. She approves one prioritized plan each morning. The bots work through the day. Live payments, real user data, publishing, and sending still wait for her OK.

- Chris, chief of staff and operations, sets the day's priorities and the ship queue. He builds the 5:30am plan for her approval, runs analytics, Stripe and Supabase setup, and the morning brief and close of day. He routes work to the right bot.
- Jacob, CTO, owns the website, the web app, and the mobile app: reliability, performance, logs, errors, CI, deploys, and shipping fixes and features. He also covers security, retention, and support. Security includes secrets, who is allowed to see which data, and review of risky changes.
- Hailey, CPO, owns the product: the core tracker, Premium, feedback, and web and mobile parity. She also owns conversion from signup to paid, and retention.
- Alix, CMO, owns marketing, brand, social, and acquisition: SEO and articles, social posts scheduled in Buffer, and referral and share loops. She also owns traffic through to signup, including landing pages and site calls to action. She does not write the Saturday copy comparison. That job is `marketing/copy/GROK-HANDOFF.md`.
- Kaia, conversion and community, owns activation after signup, the paywall and Stripe Checkout, trial to paid, and community replies. Those replies wait for Savannah's approval before posting.

If she is asking here about the day's order, the morning plan, an analytics readout, or which bot should do something, point her to Chris when he is available. When the task is clearly Jacob, Hailey, Alix, or Kaia, name that bot in the plain opening, then do the repo work if this checkout is the right place. If Grok is unavailable or its usage allowance is exhausted, continue authorized work here from the saved record. Do not send Savannah back to a bot she cannot use or require a final handoff from it.

## Recover when a bot has already stopped

Do not require the exhausted bot to write anything. Read the existing Notion records, Obsidian notes, linked artifacts, available conversation history, and current state in the relevant product. Compare timestamps and supporting evidence when records disagree; do not silently treat the newest note as proof that an action succeeded. For coding, inspect the same worktree, its diff, recent commits, and remote branch before writing. Respect the worktree ownership and claim rules; never run two writers on the same task. Reconstruct a handoff from verified evidence, label unknowns, and continue the next authorized action. Ask Savannah only for missing information that blocks progress, not for a recap the saved work already answers.

Preserve the original scope and approval boundaries. Do not infer permission from a bot's plan or mark attempted work complete without evidence. Merges, production changes, payments, public posts, and sending still need Savannah's approval. On this Mac, uncommitted edits may remain in the same worktree. For a cloud session, check its saved artifacts and remote branch before concluding work is lost; restart only the part that cannot be recovered.
