# Onboarding failure alerts

PostHog sends a real-time Slack message to `#posthog-alerts` for each matching
event:

| Failure | Event filter | PostHog destination |
| --- | --- | --- |
| Profile save | `action_failed`, `action = profile_update`, `fields` contains `onboarding_complete` | `01a14777-3dce-0000-afe6-8ff360c1cfe2` |
| Selected title save | `action_failed`, `action = watchlist_save`, `source = onboarding` | `01a1477e-66ba-0000-3654-f284aaf49877` |
| Streaming services load | `load_failed`, `resource = onboarding_services` | `01a14787-1f4b-0000-74e3-c4e4eb9620c9` |

All three destinations were verified enabled on October 17, 2026.

The write errors carry only the failure kind, safe error code, and context names.
They never include database error messages or profile values. The title-save
event labels its source in `useWatchlist`; both apps call the same core hook. The
services event fires on both apps if the region's providers return no results
payload or the request rejects.

The destinations were tested with PostHog's mocked invocation. That verifies
message rendering and the Slack request shape but does not deliver a real Slack
message or prove end-to-end ingestion. A real failure is needed to verify live
delivery. The project's test-account filter includes a behavioral bot cohort
that PostHog's real-time destination filter cannot evaluate, so these
destinations have `filter_test_accounts = false`. Treat a Slack alert as a lead
and inspect the underlying event before attributing it to a real user.
