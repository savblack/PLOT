# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

PLOT is a **single-context** repo: one `CONTEXT.md` and one `docs/adr/` at the repo root,
shared by every workspace.

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-....md
│   └── 0002-....md
├── packages/core/     ← the shared domain lives here
├── packages/ui/
├── apps/web/
├── apps/mobile/
└── apps/website/
```

This is a deliberate choice, not an oversight: PLOT is multi-package but single-domain.
`packages/core` exists precisely so the web and mobile apps cannot develop separate
vocabularies for the same concepts, and `AGENTS.md` treats drift between them as the
project's main hazard. Splitting the domain doc per workspace would work against the rule
that keeps them aligned. If `marketing/` ever grows a genuinely distinct vocabulary, that is
the case for revisiting this and promoting the repo to multi-context with a root
`CONTEXT-MAP.md`.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** — read ADRs that touch the area you are about to work in.

If either does not exist, **proceed silently**. Do not flag their absence and do not suggest
creating them upfront. The `/domain-modeling` skill creates them lazily, when terms or
decisions actually get resolved.

Neither exists yet as of this file being written.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `CONTEXT.md`. Do not drift to synonyms the glossary
explicitly avoids.

If the concept you need is not in the glossary yet, that is a signal: either you are inventing
language the project does not use (reconsider), or there is a real gap (note it for
`/domain-modeling`).

Two vocabulary rules already enforced elsewhere in this repo, which any domain doc must respect:

- The brand is always written `PLOT`, all caps, in prose, copy and comments.
- User-facing strings belong in `packages/core/copy`, and `npm run copy:check` fails the build
  if an app file hardcodes one the catalog already owns. A glossary term and its user-facing
  wording are not the same thing; the catalog owns the latter.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently
overriding:

> _Contradicts ADR-0007 (…) — but worth reopening because…_
