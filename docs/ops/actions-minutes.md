# Actions minutes

CI keeps all lint, build, edge, mobile, unit and browser checks in one job.
Each runner job is rounded up to a full minute, so separate short jobs cost
more than their execution time suggests. Sharing checkout, Node and pnpm setup
also avoids installing the same workspace three times. Playwright runs directly
after the existing build instead of invoking another build through test:smoke.
The local test:smoke command still builds first.

## Measurement, 2026-09-16

The ten most recent successful CI runs sampled from the Actions API used an
estimated 43 rounded job-minutes in total. Adding the mobile validation and
browser steps to the existing check job projects 25 minutes for the same sample,
about 42% less. This is a projection from job and step timestamps, not an invoice
or a measured result of the revised workflow. Runner load and cold caches vary.
Sample run IDs: 35085278744, 35071162530, 35063957941, 35063721529, 35063148495, 35062954838, 35062672710, 35062534257, 35062447679, 35061288627.

GitHub billing reference:
https://docs.github.com/en/billing/reference/actions-runner-pricing

## Guardrails

- PRs, main pushes and manual dispatch still run the complete suite.
- The workflow name remains CI so the two workflow_run consumers still wait
  for all checks, including browser and mobile checks, before considering a merge.
- The Lint and build job now includes mobile and browser validation; their old
  standalone check contexts no longer exist. At inspection, the repository had
  no main branch protection and no rulesets requiring those contexts.
- PR supersession still cancels outdated runs. Main runs remain uncancelled.
- A 15-minute timeout bounds a stuck CI job.
- Backups, production deploy monitoring and database checks retain their cadence.
- Routine Actions minor/patch dependency upgrades share a Dependabot PR; major
  upgrades retain individual review.

After merging, compare rounded job durations across at least ten successful
runs before treating the savings estimate as achieved. CI now runs sequentially,
so the mobile result arrives later, but avoids a separate runner allocation.
