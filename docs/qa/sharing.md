# Sharing: web and mobile

Sharing uses `packages/core/sharing.js` for public links and
`packages/core/copy/sharing.js` for messages. Native delivery remains in
`apps/mobile/lib/share.ts`; browser delivery stays in `apps/web/src/utils/share.js`.

## Surfaces

- Titles: the detail panel shares a `/save` preview. Logged-out recipients see
  the title before signup; the existing pending-save flow retains their choice.
- Public custom lists: a visible Share action and the existing options-menu action.
  Private lists have no Share action and the handler refuses to build their link.
- Profiles: one Share profile action on both platforms and in Settings.
  Its link includes `ref` so the same action invites friends.
- Calendar subscription: native delivery uses the same cancellation/error handling.
  Calendar feed URLs remain private subscription tokens, never growth/referral links.
- Public list recipients: posters open the title save preview; signup and sign-in
  actions are available. Existing public-list access checks and OG metadata remain.

All generated links default to the public app host, so local and preview hostnames
are not accidentally sent to friends. Tests can explicitly supply a local origin.

## Behaviour to verify before release

1. Share a title on iOS and Android. Check title, message and URL. Cancel once;
   cancellation must not emit a successful share on iOS. Android's native API
   reports handing off the share sheet, not confirmed message delivery.
2. Share and copy a public list; make a test list private and confirm Share is hidden.
   Do this with a disposable staging account, never an end user's data.
3. Share a profile. Its URL should contain `ref`, with no separate invitation action.
4. In a signed-out browser, open a title link and follow its signup CTA. Verify the
   title preview and source parameter, then use staging to finish signup and verify
   the existing pending-save and invitation-follow flows.
5. Disable browser native sharing and clipboard access: the fallback must show the
   selectable link. Cancelling the native sheet must not open that fallback.
6. Open a public list and select a poster. Verify the `/save` URL and `src=list_page`.
7. Check messages/WhatsApp/iMessage link previews against the deployed Pages Functions
   and OG Worker. Vite alone does not run those Pages Functions.

## Verification on 2026-09-16

Unit tests cover native-browser cancellation, clipboard fallback, URL validation,
invitation attribution, public-list signup links, title links and unavailable lists.
The web preview was driven through a real TMDB-resolved Severance share link to
signup without creating an account. Build/lint, mobile typecheck and the five existing
browser smoke tests were run. The simulator opened its installed PLOT build, but
loading this worktree's bundle was not confirmed: new native share sheets still need
runtime verification before release.

Native universal-link routing remains a separate existing gap: the checked-in Apple
association file contains a team-ID placeholder and mobile has no `/save` or `/list`
route. This change uses the existing browser recipient flow and does not enable or
change production app-link association. Complete native inbound routing and verify
cold starts before enabling those associated paths for an App Store build.
