# Feedback triage — agent contract

You are triaging ONE user-submitted bug report for the PLOT web app (React 19 + Vite, source under `src/`). The report is appended below. This is a **read-only** investigation — do not edit any files.

Investigate with Read/Grep/Glob (and Bash for read-only inspection) whether this is a real, reproducible, in-scope code bug you could fix in app code.

Output your answer as **exactly one line** at the very end, in this form:

`VERDICT: <verdict> — <one-sentence reason>`

where `<verdict>` is one of:
- `reproducible-bug` — a specific existing `src/` feature behaves wrong vs. clearly expected behavior, and a fix plausibly lives in app code.
- `feature-request` — asks for new capability that doesn't exist yet.
- `needs-info` — too vague/ambiguous to reproduce or locate.
- `user-error` — the described behavior is actually correct/expected.
- `out-of-scope` — touches auth, login/signup, password, account deletion, data export, payments, or third-party services. **Anything in these areas is always `out-of-scope`**, even if it looks like a real bug.

Be conservative: when unsure between `reproducible-bug` and anything else, do NOT pick `reproducible-bug`.
