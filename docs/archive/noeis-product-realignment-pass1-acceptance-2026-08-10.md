# Noeis product realignment — Pass 1 acceptance

**Date:** 2026-08-10
**Pass:** Shared shell and contextual agent presence
**Verdict:** PASS locally
**Baseline commit:** `e583c18d42f97f73acfa2087992bd417e6f4fff8`
**Baseline tree:** `af362c4f082142ef6998338829b2e99cd20233c3`
**Worktree:** `/Users/athantsokolas/.codex/worktrees/noeis-consequence-loop-release-2026-08-10`

## Standout delivered

Library, Think, the Wiki front page, and Wiki articles now share one contextual agent frame. The center source, thought, or accepted article stays dominant. The rail is open on desktop and becomes a closed, explicit sheet on mobile.

The shell is presentation-only. Existing surface components still own retrieval, prompting, and mutations. Accepted knowledge is not changed by mounting or opening the shell.

## Acceptance evidence

### Local automated

- Focused frontend suite: 8 suites, 149 tests passed.
- Production frontend build: passed.
- `git diff --check`: passed.
- The responsive CSS includes an explicit `prefers-reduced-motion: reduce` contract.

### Rendered authenticated browser

- Think: open desktop rail at 1440 and 1320; explicit closed mobile sheet at 430.
- Library: open desktop provenance/agent rail at 1440; explicit closed mobile sheet at 430.
- Wiki front page: open desktop continuation rail; explicit closed mobile sheet at 430.
- Wiki article: accepted article remains the dominant 920px column with a usable 240px context rail at 1440 and 1320; explicit closed mobile sheet at 430.
- No horizontal overflow was observed at 1440, 1320, or 430.
- Mobile sheet opens as a modal dialog. Escape closes it and returns focus to the trigger.
- A separate authenticated 430px Chromium run with reduced motion enabled confirmed the media query matched, the sheet/backdrop had no animation and zero-duration transitions, and the final drawer state remained usable.

### Proof boundary

This is local automated and rendered browser evidence from the active release worktree. It is not an exact-tree acceptance, clean release candidate, merge, deploy, or production proof.

## Pass 1 file fence

- `note-taker-ui/src/components/agent/AgentContextShell.jsx`
- `note-taker-ui/src/components/agent/AgentContextShell.test.jsx`
- `note-taker-ui/src/layout/RightDrawer.jsx`
- `note-taker-ui/src/layout/RightDrawer.test.jsx`
- `note-taker-ui/src/layout/ThreePaneLayout.test.jsx`
- `note-taker-ui/src/pages/Library.jsx`
- `note-taker-ui/src/pages/ThinkMode.jsx`
- `note-taker-ui/src/components/wiki/WikiFrontPage.jsx`
- `note-taker-ui/src/components/wiki/WikiFrontPage.test.jsx`
- `note-taker-ui/src/components/wiki/WikiPageReadView.jsx`
- `note-taker-ui/src/components/wiki/WikiPageReadView.test.jsx`
- `note-taker-ui/src/styles/stitch-editorial.css`
- `note-taker-ui/src/styles/stitchEditorialCss.test.js`
- `note-taker-ui/src/styles/wiki-front-page.css`

## Remaining release seams

- Reconcile the Pass 1 fence with the broader dirty overlay before creating a clean candidate.
- Run exact-tree and cumulative acceptance in Pass 7.
- Merge, deployment, and production remain Pass 8 work.
