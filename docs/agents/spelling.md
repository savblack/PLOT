# Spelling and locale for user-facing copy

Moved out of `AGENTS.md`. Read this before writing or editing any user-facing copy.

Plot's primary market is the United States. User-facing copy is American English:
color, favorite, theater, organize, program, and the other -ize forms. That covers
the apps, the marketing site, social posts, What's On, card text, alt text, and email.

Marketing copy is for a US reader. Use US release dates, US streaming services,
US references, and US date order (June 19, Friday, June 19) when a date is written
out. Do not localize marketing for Australia or the UK.

Legal pages stay as they are. Terms of Service, Privacy Policy, Community Standards,
and any other legal page keep their current wording, including British spelling
where the text already uses it. Do not "correct" them to American spelling.

`packages/core/spelling.js` still switches a few already-shipped words (favorite,
color, and the rest of that dictionary) from the viewer's `profile.region`.
(`apps/web/src/utils/spelling.js` and `apps/mobile/lib/spelling.ts` are re-export
shims.) Leave those call sites alone unless a ticket asks for the sweep. Do not
add new words to the dictionary, and do not add new `regionalWords()` call sites.
A new string is American spelling, written out.

If you do touch an existing call site, region still comes from the viewer's own
profile (`useApp()` on web, `useAppData()` on mobile), not the profile being
looked at. On someone else's public profile, pass `undefined` (US) rather than
that profile owner's region.
