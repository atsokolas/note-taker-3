# Work priority theme accent

The Add priority control and priority ordinal used the decorative thread token,
not the selected theme's action accent. Omarchy's yellow `color3` is a thread;
its imported accent is independent. These two controls now consume the existing
`--noeis-action`. Theme definitions and user preferences are unchanged.

## Regression check

Build the UI, then run `node scripts/smoke_work_theme_accent.cjs`.
The check loads compiled UI CSS in isolated Chromium, enumerates the real theme
catalog, and compares both controls' computed colors with the action token.
It also changes an isolated custom Omarchy accent and checks both controls follow.
No service, account, or persisted preference is involved.

Verified all 14 themes: Light, Dark, Tokyo Midnight, Tokyo Night, Catppuccin,
Dracula, Nord, Gruvbox Dark, Rosé Pine, Everforest, Monokai, Solarized Dark,
Solarized Light and Omarchy, plus a custom Omarchy accent. The check fails on the
previous compiled CSS and passes after this fix. Warm themes remain warm by design.

Also verified: production UI build and 32 tests in WorkWeekly.test.jsx and
styles/themeCss.test.js. This is a token-only fix, not the proposed right-rail or
project-menu redesign.
