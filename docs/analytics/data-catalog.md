# Data catalog

PostHog project 471234, [data catalog](https://us.posthog.com/project/471234/data-catalog). Created 2026-10-14 through the data catalog API. The catalog was empty before that.

Every metric is `proposed`. A result is canonical only when someone has approved that metric and `is_drifted` is false. Approval is a person in the catalog, not this file. Until then, treat a run as the definition below with a noncanonical label.

Weekly series default to the trailing 90 days, unique people or event totals as the unit column says, with internal and test accounts filtered out. `activated_people` and `retained_people` are HogQL. Their windows are fixed, and a date override on those two is rejected. The other metrics take `date_from`, `date_to`, and `interval` at run time.

A metric created from an insight stores a snapshot of that insight. Editing the insight sets `is_drifted`. The run still works. It stops being a candidate for approval until someone updates the snapshot or unlinks it.

Checked on 2026-10-14. The first eighteen ran, then six more the same day. `activated_people` returned 59, the same count as cohort 494035. `retained_people` returned 2, the same count as cohort 494036.

## Metrics

| Name | Unit | What it counts | Source |
|---|---|---|---|
| `signups` | people | Unique people who created an account, by week | Insight ixUaDFdp |
| `onboarding_completions` | people | Unique people who finished setup, by week | `onboarding_completed` |
| `auth_failures` | events | Signup, login, captcha, and OAuth callback failures, by week. Rage clicks and exceptions are separate | Four events, totals |
| `activations` | people | People whose first Tier 2 write falls in that week. A re-save of a title already on the list does not count. Onboarding seed picks do | Insight fgRzER1P, action 333110 |
| `explorers` | people | Unique people with any Tier 1 action that week. A page view alone does not count | Action 333111 |
| `committed_users` | people | Unique people with a Tier 2 write that week. Seed picks count | Action 333110 |
| `self_directed_users` | people | Unique people with a Tier 2 write that week, excluding onboarding seed picks | Action 342069 |
| `core_loop` | people | Ordered, inside 14 days: opened a title, saved it, logged a watch, rated it. A re-save of a title already on the list does not count | Same path as insight jaFm4Xmc, with the re-save filter added |
| `signup_to_activation` | people | Ordered, inside 7 days: `user_signed_up`, then `onboarding_completed`, then action 342069 | Insight GgKHTVem |
| `landing_to_signup` | people | Ordered, inside 14 days, real visitors only: human page view, signup button, form viewed, form started, account created | Insight 8czBSm3T, cohort 494034 |
| `marketing_sessions` | sessions | Sessions on theplot.tv from real visitors, by week. A page load from someone who left without engaging is excluded | Insight KDzlblTO, cohort 494034 |
| `acquisition_channels` | sessions | Those same marketing-site sessions, split by channel. The insight's interval is day | Insight 8xHWum2o, cohort 494034 |
| `activated_people` | people | People with a Tier 2 write in the last 365 days. Fixed window. Seed picks count | Same rule as cohort 494035 |
| `retained_people` | people | People with a self-directed Tier 2 write in 2 or more distinct weeks of the last 8. Fixed window. Weeks start on Monday | Same rule as cohort 494036 |
| `premium_conversions` | conversions | `premium_converted` payments, by week. One server event per confirmed Stripe subscription | Insight jAw5UVWZ |
| `premium_checkout_starts` | checkouts | `premium_checkout_started`, by week | Insight aZ2QO0rE |
| `premium_checkout_conversion` | people | Ordered, inside 14 days: checkout started, then `premium_converted` | Insight wrUVOkuf |
| `premium_revenue` | major currency units | Sum of `premium_converted.amount`, by week, split by `currency`. Currencies are not added together | Insight m2uKhUBN |
| `support_conversions` | conversions | `support_converted` payments, by week. Ko-fi and Stripe together | Event total |
| `premium_gate_hits` | events | `premium_gate_hit`, by week, real visitors only. One person can hit a gate more than once | Insight 5MCpkZ2J |
| `import_completions` | imports | `import_completed` where `count` is greater than 0, by week | Event total |
| `import_to_saved` | people | Ordered, inside 7 days: `import_started`, then `import_completed` that saved at least one title and has `entry` set | Insight jYRSGhIZ |
| `failed_writes` | events | `action_failed`, split by `action`. A failed page load is not in this metric | Insight PQD0fLeY |
| `failed_loads` | events | `load_failed`, split by `resource` | Insight jkiQEXNz |

`premium_activated` before 2026-08-07 is the old name of `premium_converted`. The conversion metrics do not include it. Union the two names for any history that crosses that date.

`import_completions` keeps completions from before the shared reporter, as long as they saved a title. `import_to_saved` requires `entry` to be set, which drops those earlier rows. From 2026-09-27 to 2026-10-12 a Trakt account import could fire `import_completed` twice.

`core_loop` is not a snapshot of insight jaFm4Xmc. That insight's save step counts a re-save of a title already on the list.

`activated_people` and `retained_people` do not reapply the test-account filters. The cohorts they restate do not either, and the counts matched on the day they were created. The weekly series do apply those filters.

`action_failed` had no events on 2026-10-14, so `failed_writes` ran empty. The definition is the breakdown to read once failures exist.
