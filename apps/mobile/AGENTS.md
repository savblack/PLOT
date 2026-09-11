# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
(`package.json` pins `expo ~57.0.19` and `react-native 0.87.1`. This pointer said
v56 until 2026-09-11, one minor behind what is installed.)

## Parity with web

`docs/agents/web-mobile-parity.md` — what has been brought across from web,
what is left, and the environment traps (worktree Metro resolution; simulator
taps are in device points). Read it before starting mobile work.

## Running it on a device

`tsc --noEmit` plus ESLint is the whole safety net here, so a green check means
"it compiles", never "it works". The app's first ever run (2026-09-11) found a
dependency set that could not build at all and a visibly broken EPG layout,
neither of which any static check could see. Run it.

- [docs/ops/mobile-builds.md](../../docs/ops/mobile-builds.md) — how to get it
  running, which paths need an Apple account and which do not.
- [docs/qa/mobile-device-smoke.md](../../docs/qa/mobile-device-smoke.md) — what
  to drive once it does, ordered so the RN 0.87 regression surface comes early.
