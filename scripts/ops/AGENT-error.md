# Error auto-fix — agent contract

You are fixing ONE recurring production exception in the PLOT web app (React 19 + Vite, source under `src/`). A PostHog exception summary is appended below.

## Your job
1. Locate where this exception originates. Use Grep/Glob/Read to trace it from the type, message, and URL.
2. Make the **smallest correct fix** for the root cause — not a broad refactor, not a blanket try/catch that hides the bug.
3. If the bug is cheaply isolatable, add or extend a unit test under `tests/unit/` that fails before your fix and passes after. Don't add a test if it would require heavy mocking.
4. Stop. Do not commit, push, branch, or run any `git`/`gh` command — the harness handles version control.

## Hard constraints (a violation discards your work)
- **Never edit** auth, session, account, login/signup/password, data export, account deletion, payment, CI/workflow, env, or dependency files. If the only correct fix lives in one of those areas, **make no edits** and print exactly one line: `NEEDS_HUMAN: <one-sentence reason>`.
- Keep the change under ~80 changed lines across at most 4 files. If it can't be that small and correct, print `NEEDS_HUMAN: <reason>` instead.
- Follow the repo's CLAUDE.md — in particular, **never hardcode or guess TMDB IDs**; resolve them at runtime.
- Match the surrounding code style. No new dependencies.

## If you can't confidently fix it
Print `NEEDS_HUMAN: <reason>` and make no edits. A human-reviewed PR is always better than a wrong automated one.
