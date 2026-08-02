# @plot/ui

Shared visual components for `apps/web` and `apps/mobile`. Unlike `@plot/core` (platform-agnostic logic), these components render differently per platform — web is CSS/DOM, mobile is React Native — but live in one place so there's a single owned source of truth and a single Storybook entry per component.

## Adding a component

1. Web variant: `ComponentName.jsx` (+ co-located `.css` if needed), imported by `apps/web` as `@plot/ui/ComponentName.jsx` (explicit extension — Vite doesn't do platform-suffix resolution).
2. Native variant: `ComponentName.native.tsx`, imported by `apps/mobile` as `@plot/ui/ComponentName` (no extension). This requires an explicit entry in `package.json`'s `exports` map — `"./ComponentName": "./ComponentName.native.tsx"` — because `tsc`/Metro don't strip a `.native` suffix through a wildcard export the way relative imports do.
3. Keep components decoupled from app-specific context (no importing an app's `ThemeContext`, router, etc.) — accept colors/callbacks as props instead, so the component doesn't create a dependency from this package back into either app.

## Components

- `PlotLoader` — wordmark loader. Web: inline `<span>` (CSS-animated), used inline within existing layout. Mobile: full-screen `<View>` (Animated-API), used as a screen's entire return value while loading. The two intentionally keep their existing distinct APIs (`size`/`tone` on web, `backgroundColor`/`color` on mobile) rather than being forced into one shape — the visual/behavioral contract differs enough on each platform that unifying it would add indirection without real benefit today.
