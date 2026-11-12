# Kill switches

A kill switch hides one feature of the web app without shipping a new version.
Use one when a feature is broken in production and the fix will take longer
than a few minutes.

## Turn one on

1. PostHog, project Plot, Feature flags.
2. Open the flag for the feature and switch it **on** (Enable). The flag's
   release conditions stay at 100%; do not target people, because the app
   reads every switch with one fixed id (`plot-kill-switches`), not the
   visitor's.
3. Within five minutes of their next look at the tab, every open copy of the
   app has the new answer, and the person's next click in the app is a full
   page load without the feature. Anyone opening the app afterwards never sees
   it.

Turn it **off** again once the fix is live. The feature comes back on each
person's next page load.

| Flag | Hides |
|---|---|
| `kill-watch-together` | Watch together, shared lists and their alerts, the Together nav item |
| `kill-pricing-page` | `/pricing` and `/plans` (both send people to `/app`) |
| `kill-apple-login` | The "Continue with Apple" button. Email sign-in stays. |
| `kill-google-login` | The "Continue with Google" button (only shown once Google login is launched) |

A switch can only take a feature away. It never turns on a feature the app's
launch settings (`apps/web/src/launchFeatures.js`) leave off.

## When the fix agent turns one on

Decided by Savannah on 2026-11-13: the incident fixer may hide a broken
feature by itself, under these rules.

- Only when an **open** GitHub issue labelled `incident` clearly ties the
  outage to that feature (an error, failing check or report naming it).
- Only **on**. Neither the agent nor any automation turns a switch off. A
  person does that in PostHog once the fix is live.
- Every flip comments on the incident issue, emails Savannah
  (`MARKETING_ADMIN_EMAIL`), and leaves a `KILL-SWITCH-LOG` line in the
  workflow run. PostHog's own flag history records it too.

How: the agent never holds the PostHog key. It asks the
`.github/workflows/kill-switch.yml` workflow, which holds
`POSTHOG_KILL_SWITCH_KEY` (a PostHog personal key scoped to
`feature_flag:write` on project 471234 only). Two ways in, same checks:

- `gh api repos/savblack/PLOT/actions/workflows/kill-switch.yml/dispatches -f ref=main -f inputs[switch]=kill-pricing-page -f inputs[issue]=123`
- or add the label `kill-switch:kill-pricing-page` to the incident issue.

The workflow refuses any flag not in its fixed list, any issue that is not
open and labelled `incident`, and has no "off" path. Agent PRs can never
auto-merge a change to the workflow or its script (`autoMergePolicy.mjs`).

`kill-switch-drill` (flag id 1071543) is a practice switch the app never
reads. It needs no incident issue. Use it to test the workflow, then turn it
off again in PostHog.

## Limits

- Web only for now. The mobile app keeps its build settings until
  savblack/PLOT#1631 lands.
- Production hosts only. Previews and localhost ignore the switches.
- If PostHog is unreachable, the app uses the last answer it saw, and with
  none, the launch settings. A switch failing never hides a feature.
- Checkout has its own server switch (`STRIPE_CHECKOUT_ENABLED` on the
  billing functions), which also stops the server side. A kill switch only
  hides the screen.

## Add one

Add the feature to `KILL_SWITCHES` in `packages/core/killSwitches.js`, apply
`featureOn()` to its launch setting in `apps/web/src/launchFeatures.js` (and
add it to `LAUNCH_DEFAULTS`), and create the `kill-<feature>` flag in PostHog,
inactive, rollout 100%.
