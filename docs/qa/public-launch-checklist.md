# PLOT Public Launch Checklist

Last reviewed: 2026-06-13

Use this checklist for the signed-in launch pass. Run it on desktop and at a mobile width around `390x844`.

## Setup

- Install browsers for smoke tests on a fresh machine:
  - `npx playwright install chromium`
- Use one clean account for first-run onboarding.
- Use one seeded account with:
  - watch history
  - active watching progress
  - saved watchlist items
  - at least one custom list
  - at least one reminder
- Confirm production-like env values are present before the run.

## Auth

- Sign up from `/signup`.
- Confirm email and reach the app without a broken callback.
- Sign out and sign back in from `/login`.
- Trigger password reset and confirm the reset email and reset route work.
- Confirm legal links on auth screens open correctly.

## Onboarding

- Complete onboarding on a fresh account.
- Confirm profile fields save.
- Confirm starter list creation succeeds.
- Confirm the user lands in the app without a blank or looping state.

## Discover, Search, and Media

- Search by title and open results.
- Search by a person/director name and confirm the title-guidance empty state appears instead of a broken generic no-results state.
- Open media panels from Discover, Search, Watchlist, History, and My Lists.
- Confirm episode guide state matches current progress.
- Confirm guide/provider artwork loads without one request per visible card burst.

## Lists and Watching

- Save a title to the watchlist.
- Start watching a show from the watchlist.
- Update episode progress.
- Mark a title watched and confirm it appears in History correctly.
- Create a custom list, add a title once, and confirm double taps do not create duplicates.
- Remove an item from a custom list and from favourites if present.

## History and Calendar

- Open History and move across months with and without entries.
- Confirm same-day direct-to-streaming titles do not duplicate.
- Leave the app open across a local date change if feasible, or simulate the date boundary, and confirm relative labels refresh.
- Generate a calendar link.
- Revoke the calendar link.
- Download the `.ics` snapshot export.

## Settings and Support

- Open streaming platforms, channels, region, and timezone pickers and save each successfully.
- Confirm provider picker closes immediately after save.
- Submit feedback with no screenshot.
- Submit feedback with screenshots.
- Force an attachment failure if possible and confirm the new attachment-specific error message appears.
- Trigger account deletion only in a disposable test account and confirm the flow reaches a success state.

## Accessibility and Mobile

- Tab through clickable settings rows, media rows, and list rows.
- Confirm Enter and Space activate button-like surfaces.
- Confirm Escape closes dialogs and panels where expected.
- Check header, drawer, filters, lists, and media panels at mobile width for overflow or clipped controls.

## External dependencies to watch during QA

- Supabase Auth
- Supabase Storage
- Supabase Edge Functions
- TMDB proxy
- TVMaze air-time lookup
- PostHog
- Resend / feedback delivery
- Plex sync
- Trakt sync

## Exit criteria

- No broken auth flows
- No broken media panel flows
- No broken feedback submissions
- No missing production functions
- No release-blocking console/runtime errors
