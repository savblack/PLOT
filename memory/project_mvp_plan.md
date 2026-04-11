---
name: Plot MVP Plan
description: Location and summary of the Plot MVP implementation plan
type: project
---

Plan file: /Users/savannahblack/Programming/Plot/docs/superpowers/plans/2026-03-25-plot-mvp.md

## Chunks

| Chunk | Tasks | Goal |
|-------|-------|------|
| 1: Foundation | 1-3 | react-router-dom, LandingPage component, clean /u/:username URLs |
| 2: Monolith breakup | 4-10 | App.jsx 3190→~700 lines, extract CSS + view components + constants |
| 3: UX polish | 11-14 | Loading spinners, error boundary, empty states, SEO meta tags |
| 4: Production | 15-18 | Vite config, .env.example, cleanup prototype files, e2e test |

## End state
- `/` → LandingPage (marketing)
- `/app` → React app
- `/u/:username` → public profile (clean URLs)
