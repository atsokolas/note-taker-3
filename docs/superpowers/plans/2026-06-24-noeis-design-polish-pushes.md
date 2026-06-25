# Noeis Design Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify Noeis' visual system so dark-mode color, navigation, motion, feedback states, and key Library/Wiki layouts feel intentional rather than individually hand-tuned.

**Architecture:** Split the work into four independently shippable pushes. Cursor/Grok can safely own token and layout CSS slices; Codex should own nav semantics, feedback-state plumbing, production QA, and final integration because those cross component behavior, routing, and backend state.

**Tech Stack:** React, React Router, CSS tokens in `note-taker-ui/src/styles/theme.css`, editorial CSS in `note-taker-ui/src/styles/stitch-editorial.css`, focused Jest/RTL tests, Vercel production browser verification.

---

## Push 1: Design Tokens + Warm Palette Cleanup

**Owner recommendation:** Cursor.

**Files:**
- Modify: `note-taker-ui/src/styles/theme.css`
- Modify: `note-taker-ui/src/styles/stitch-editorial.css`
- Modify: `note-taker-ui/src/styles/dashboard-refresh.css`
- Modify: `note-taker-ui/src/styles/wiki-critical.css`
- Modify: `note-taker-ui/src/styles/wiki-front-page.css`
- Modify/Test: `note-taker-ui/src/styles/themeCss.test.js`
- Modify/Test: `note-taker-ui/src/styles/stitchEditorialCss.test.js`

**Intent:** Define one role-based text ladder and eliminate old cool blue-gray remnants from editorial surfaces.

- [ ] Add/confirm canonical role tokens:
  - `--text-primary`
  - `--text-secondary`
  - `--text-muted`
  - `--text-link`
  - `--text-on-accent`
  - `--surface-border` or `--nt-divider` for warm borders
- [ ] Map editorial aliases to canonical roles:
  - `--vellum-ink: var(--text-primary)`
  - `--vellum-muted: var(--text-secondary)`
  - `--vellum-subtle: var(--text-muted)`
  - `--vellum-line: var(--nt-divider)` or a warm border token
- [ ] Replace visible cool tokens:
  - `#0d1422`
  - `#9eb0cf`
  - `rgb(158, 176, 207)`
  - `rgba(96, 118, 153, ...)`
  - `--border-subtle: rgba(96, 118, 153, 0.42)`
- [ ] Normalize title-role color in dark mode:
  - Wiki front page titles
  - Wiki list row titles
  - Library row titles
  - Think motion/shelf titles
  - Recently grown / Explore links
- [ ] Add a token regression test that rejects known cool palette literals in editorial styles, except if explicitly whitelisted for legacy non-editorial surfaces.
- [ ] Verify with computed styles on production:
  - `/wiki`
  - `/wiki/workspace?view=list`
  - `/library?scope=all`
  - `/think?tab=home`

**Acceptance:**
- Same semantic role computes to the same color token across Wiki, Library, Think.
- No cool blue border/text remnants on the visible editorial surfaces.
- Dark body remains warm near-black: `rgb(20, 17, 13)`.
- `CI=1 npm test -- --watchAll=false --runInBand src/styles/themeCss.test.js src/styles/stitchEditorialCss.test.js`
- `CI=1 npm run build`

---

## Push 2: Navigation Semantics + Topbar Cleanup

**Owner recommendation:** Codex.

**Files:**
- Modify: `note-taker-ui/src/layout/TopBar.jsx`
- Modify: `note-taker-ui/src/layout/TopBar.test.jsx`
- Modify: `note-taker-ui/src/App.js` only if nav config lives there
- Modify: `note-taker-ui/src/styles/stitch-editorial.css`

**Intent:** Remove confusing chrome and make the topbar read as brand/rooms/search/utilities.

- [ ] Change Noeis brand link from `/think?tab=home` to `/wiki`.
- [ ] Update brand aria-label to `Noeis home`.
- [ ] Remove `REFERENCE…` from the topbar unless a real menu is implemented in this same push.
- [ ] Keep primary rooms left: `Library`, `Think`, `Wiki`.
- [ ] Keep utility/account controls right:
  - Search
  - Theme
  - More menu
  - Account/profile if it has working menu items
- [ ] Move secondary destinations into `More`:
  - `Connections`
  - `Settings`
  - any debug/help/tour action that is not a primary room
- [ ] Remove any trailing empty/no-op icon button or give it an actual account menu with non-empty aria.
- [ ] Update mobile topbar tests so utility grouping still keeps mobile topbar compact.

**Acceptance:**
- Clicking logo lands on `/wiki`.
- No topbar element silently no-ops.
- No ambiguous `REFERENCE…` button.
- `More` opens a real menu and closes on selection/outside click.
- Mobile 430px topbar remains ~63px, no horizontal overflow.

---

## Push 3: Feedback + Alive Motion System

**Owner recommendation:** Codex primary; Cursor can support CSS-only state polish after component contracts are in place.

**Files:**
- Create: `note-taker-ui/src/components/feedback/SurfaceNotice.jsx`
- Create: `note-taker-ui/src/components/feedback/SurfaceNotice.test.jsx`
- Modify: `note-taker-ui/src/pages/DataIntegrations.jsx`
- Modify: `note-taker-ui/src/pages/WikiOnboarding.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiWorkspace.jsx`
- Modify: `note-taker-ui/src/components/library/LibraryArticleList.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiList.jsx`
- Modify: `note-taker-ui/src/styles/stitch-editorial.css`
- Modify: `note-taker-ui/src/styles/calm-ui-system.css`

**Intent:** Make state legible and make motion feel like feedback, not decoration.

- [ ] Build a shared `SurfaceNotice` component with variants:
  - `success`
  - `working`
  - `recovering`
  - `warning`
  - `error`
- [ ] Visual language:
  - quiet warm border
  - subtle left rule
  - small status dot
  - optional action button
  - reduced-motion safe pulse only for `working`/`recovering`
- [ ] Connections:
  - show success after OAuth return (`Notion connected`, `Readwise connected`)
  - show last sync state on the relevant card
  - show failed sync as a recoverable notice, not silent failure
- [ ] Wiki build/onboarding:
  - replace alarming failed draft language with `First pass needed another try`
  - show recovery state while rebuild happens
  - if recovery ultimately fails, explain next action without exposing raw stub language
- [ ] Embedding/background job visibility:
  - if existing API exposes failed embedding queue status, surface a quiet warning in Settings/Connections or wiki maintenance rail
  - if API does not expose it, scope backend endpoint separately rather than faking UI
- [ ] Upgrade row magnetism:
  - keep current radial bloom
  - increase transform modestly on fine pointer only: target `translate3d(4px, -2px, 0)` or similar after visual check
  - add border/accent line response so hover/focus reads in grayscale
  - on click/selection, add a brief `receipt` state for row actions such as opening, moving, connecting, importing
  - keep `prefers-reduced-motion` at no transform and no pulse
- [ ] Add tests for notice rendering and reduced-motion CSS guards.

**Acceptance:**
- A successful connection produces visible confirmation without going to Library to infer it.
- A failed/recovering wiki build is reassuring and specific.
- Magnetic rows have visible feedback in browser, not just CSS existence.
- Keyboard focus and hover have related but distinct states.

---

## Push 4: Library/Wiki Layout Polish

**Owner recommendation:** Cursor for Library/Wiki CSS and small component reshaping; Codex final review.

**Files:**
- Modify: `note-taker-ui/src/components/wiki/WikiFrontPage.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiFrontPage.test.jsx`
- Modify: `note-taker-ui/src/components/library/LibraryReadingRoomLead.jsx`
- Modify: `note-taker-ui/src/components/library/LibraryReadingRoomLead.test.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiFacetRail.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiFacetRail.test.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiList.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiList.test.jsx`
- Modify: `note-taker-ui/src/styles/stitch-editorial.css`
- Modify: `note-taker-ui/src/styles/think-home-polish.css`
- Modify: `note-taker-ui/src/styles/wiki-front-page.css`

**Intent:** Remove hierarchy clutter and align sibling surfaces.

- [ ] Promote Wiki machinery nav:
  - `knowledge map`
  - `all pages`
  - `needs review`
  - `review (...)`
  from tiny bottom whisper into a real secondary nav near the top of `/wiki`.
- [ ] Library top simplification:
  - keep `Worth reopening` as the single lead
  - demote `Corpus maintenance` into a compact strip or right/cabinet rail slot
  - remove or rename meaningless `MODE`
- [ ] Wiki list rail:
  - align `Pages / Browse your wiki` grammar to Library `Cabinet / Your filing system`
  - same spacing, count styling, active/focus treatment
- [ ] Wiki list rows:
  - remove double border stacking
  - align row spacing/title/meta rules with Library row treatment
- [ ] Verify desktop, tablet 1280-1400, mobile 430.

**Acceptance:**
- Wiki front destinations are discoverable without squinting.
- Library top reads as one calm invitation before browse.
- Wiki list and Library list feel like siblings.
- No doubled borders between list rows.

---

## Push 5: Carry-Over Text Details

**Owner recommendation:** Codex, because several items are server/data presentation guards.

**Files:**
- Modify: `server/services/wikiBriefingService.js`
- Modify: `server/services/wikiPresentationGuard.js`
- Modify: `server/routes/wikiRoutes.js`
- Modify: `note-taker-ui/src/components/wiki/WikiFrontPage.jsx`
- Modify: `note-taker-ui/src/pages/WikiOnboarding.jsx`
- Modify: shared date formatter if one exists; otherwise create `note-taker-ui/src/utils/dateDisplay.js`

**Intent:** Treat agent-generated text as first-class UI copy.

- [ ] Confirm morning-paper lead uses sentence-boundary trim only.
- [ ] Normalize built titles at creation and display.
- [ ] Keep QA/generated pages out of hero/Explore.
- [ ] Confirm wiki article measure remains ~68ch.
- [ ] Confirm build composer placeholder is unclipped at 1280/1440.
- [ ] Introduce shared date display:
  - relative for `< 7d`
  - absolute beyond that
  - apply to visible Wiki/Library/Think date surfaces where practical.

**Acceptance:**
- No mid-sentence lead clamps.
- No lower-case-leading article title like `the Availability Heuristic`.
- No QA pages in public-facing hero/Explore.
- Dates stop mixing arbitrary formats on the same surface.

---

## Final Verification Matrix

Run after each push:

```bash
CI=1 npm run build
npm run wiki:qa
```

Production browser verification after deploy:

- `/wiki`
- `/wiki/workspace?view=list`
- `/library?scope=all`
- `/think?tab=home`
- `/connections`

Viewports:

- desktop
- 1280-1400px Safari/sidebar band
- mobile `430px`

Live evidence to paste in the PR/final report:

- computed colors for title roles
- topbar screenshot and route-click proof
- feedback-state screenshots
- row hover/focus screenshot or computed transition/transform evidence
- Library/Wiki before/after screenshots
- console error check
- horizontal overflow check
