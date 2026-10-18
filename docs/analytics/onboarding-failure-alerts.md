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

Live delivery was verified on October 18, 2026 with three approved synthetic
failures sent through event ingestion. Each destination completed successfully,
and all three `TEST_ONLY_20261018` messages were visible in `#posthog-alerts`:
[profile save](https://savannahblack.slack.com/archives/C0C0Q0VV32L/p1792282059286929),
[title save](https://savannahblack.slack.com/archives/C0C0Q0VV32L/p1792282060378589), and
[services load](https://savannahblack.slack.com/archives/C0C0Q0VV32L/p1792282060483919).
The events use a synthetic distinct ID and `$host = localhost`; a fresh dashboard
query confirmed that its internal/test filters excluded them. The project's test-account filter includes a behavioral bot cohort
that PostHog's real-time destination filter cannot evaluate, so these
destinations have `filter_test_accounts = false`. Treat a Slack alert as a lead
and inspect the underlying event before attributing it to a real user.

## Profile failure recovery

`upsertProfile` returns an error for a rejected request or a final response with
no saved row. Both apps already use that error to stop saving and show the retry
message. These paths report `action_failed` with `action = profile_update` and
`fields` containing `onboarding_complete`, so they match the profile alert above.
A later successful retry does not emit another failure.

The profile-write tests reproduce both cases without live user data. Web browser
smoke tests also verify the error message, enabled retry, successful Home
transition and reload, plus completion when streaming-service loading fails.
Those browser tests use a mocked backend. Native-device recovery remains untested.
