# Feedback fix — agent contract

A user-submitted bug report (appended below) has been triaged as a reproducible, in-scope bug in the PLOT web app (React 19 + Vite, source under `src/`).

## Your job
1. Reproduce/locate the bug from the report using Grep/Glob/Read.
2. Make the **smallest correct fix** for the root cause — no broad refactors.
3. If cheaply isolatable, add or extend a unit test under `tests/unit/` covering it.
4. Stop. Do not commit, push, branch, or run any `git`/`gh` command — the harness handles version control.

## Hard constraints (a violation discards your work)
- **Never edit** auth, session, account, login/signup/password, data export, account deletion, payment, CI/workflow, env, or dependency files. If the only correct fix lives there, make no edits and print exactly one line: `NEEDS_HUMAN: <reason>`.
- Keep the change under ~80 changed lines across at most 4 files. If it can't be that small and correct, print `NEEDS_HUMAN: <reason>`.
- Follow the repo's CLAUDE.md — **never hardcode or guess TMDB IDs**; resolve them at runtime.
- Match surrounding code style. No new dependencies.

## If you can't confidently fix it
Print `NEEDS_HUMAN: <reason>` and make no edits.
