<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Plot app (React Router v7, Vite). The existing PostHog initialisation, provider, error tracking, and 12 core events were already in place. This session extended coverage with 7 additional events across 4 files, covering social interactions, auth funnel, journal mutations, and user identification on login/signup.

**Changes made in this session:**
- Extended `src/components/PublicProfileView.jsx` — added `usePostHog`, capture `user_followed` and `user_unfollowed` in `handleFollow`
- Extended `src/pages/AuthPage.jsx` — added `password_reset_requested` capture in the forgot-password success path
- Extended `src/hooks/useJournalData.js` — added `posthog` param, capture `list_deleted`, `list_renamed`, `list_visibility_changed`, `media_deleted`
- Extended `src/App.jsx` — passes `posthog` instance to `useJournalData`
- Updated `.env` with correct `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` values

| Event | Description | File |
|-------|-------------|------|
| `user_signed_up` | User successfully created an account | `src/pages/AuthPage.jsx` |
| `user_logged_in` | User signed in (also triggers `identify`) | `src/pages/AuthPage.jsx` |
| `password_reset_requested` | User submitted a forgot-password request | `src/pages/AuthPage.jsx` |
| `user_logged_out` | User clicked Sign Out (also triggers `reset`) | `src/App.jsx` |
| `onboarding_completed` | User finished all onboarding steps | `src/pages/OnboardingFlow.jsx` |
| `media_logged` | User saved a film/TV show to their journal | `src/components/MediaModal.jsx` |
| `media_added_to_list` | User added a title to a custom list | `src/components/MediaModal.jsx` |
| `media_deleted` | User removed one or more entries from their journal | `src/hooks/useJournalData.js` |
| `list_created` | User created a new custom list | `src/components/MediaModal.jsx` |
| `list_deleted` | User deleted a custom list | `src/hooks/useJournalData.js` |
| `list_renamed` | User renamed a custom list | `src/hooks/useJournalData.js` |
| `list_visibility_changed` | User toggled a list between public and private | `src/hooks/useJournalData.js` |
| `search_performed` | User submitted a search query | `src/App.jsx` |
| `import_completed` | User imported history from Netflix/Letterboxd | `src/components/ImportModal.jsx` |
| `profile_visibility_changed` | User toggled their profile public/private | `src/App.jsx` |
| `profile_link_copied` | User copied their public profile or list link | `src/App.jsx` |
| `user_followed` | User followed another user's public profile | `src/components/PublicProfileView.jsx` |
| `user_unfollowed` | User unfollowed another user's public profile | `src/components/PublicProfileView.jsx` |
| `account_deleted` | User confirmed account deletion | `src/App.jsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://us.posthog.com/project/377701/dashboard/1455697
- **Sign-up to Activation Funnel:** https://us.posthog.com/project/377701/insights/ngsoZiXN
- **Daily Media Logging Activity:** https://us.posthog.com/project/377701/insights/ZhO084Du
- **Social Activity — Follows vs Unfollows:** https://us.posthog.com/project/377701/insights/mbieugdF
- **Churn Signals — Logouts & Account Deletions:** https://us.posthog.com/project/377701/insights/hULZ5wXA
- **Journal Engagement — Lists & Media:** https://us.posthog.com/project/377701/insights/wB2e7v2p

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-react-react-router-7-framework/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
