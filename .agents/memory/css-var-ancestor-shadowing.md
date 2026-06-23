---
name: CSS custom-property ancestor shadowing
description: Why a JS-driven --sidebar-width (set on documentElement) silently failed to move main content.
---

When a CSS custom property is updated at runtime via
`document.documentElement.style.setProperty('--x', …)`, any descendant element
that *also* declares `--x` in a CSS rule shadows the root value for its own
subtree. The chg-rehab sidebar set `--sidebar-width` on `documentElement` but
`.app-shell` (an ancestor of `.main-col`) also declared `--sidebar-width: 240px`,
so `.main-col`'s `margin-left: calc(var(--sidebar-width)+24px)` resolved the
frozen `.app-shell` value and never tracked the live width.

**Why:** custom properties cascade/inherit; the nearest declaring ancestor wins
over the root's inline override.

**How to apply:** put the *default* for any JS-overridden CSS var on `:root`
only (it's the same element as `documentElement`, so the inline override wins),
never on an intermediate wrapper that sits between `:root` and the consumer.
