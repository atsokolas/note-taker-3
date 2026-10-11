# Sharing theme and layout acceptance — October 4, 2026

## Outcome

Editions sharing used the obsolete `--bg-primary` token with a white fallback, while inheriting dark-theme text. The panel now uses the current elevated surface and text tokens. It fits the available viewport space beneath the Share button; the public preview shrinks and scrolls while link actions remain visible. Mobile retains its existing bounded panel. Escape closes and returns focus.

Copy link, Email and X are available for existing public links in Editions, notebook notes/volumes, concepts/questions and ready public Wiki pages. One small ShareDestinations component centralizes the two destination links instead of duplicating URL encoding and styles across six owner interfaces. Existing clipboard controls, publication, frozen snapshots, preview/update/revoke behavior and privacy gates remain intact. Email opens a draft with a public title (or generic description) and public URL; X opens a composer with only the URL. Nothing sends or posts automatically. No embedded excerpts, private reading activity or draft text are sent to these links.

The related sweep replaced obsolete notebook/public-column background references, made the concept/question URL row wrap at narrow widths, and replaced its hard-coded destructive ink with the semantic danger token. Intentional white print styling remains. No backend changes or storage cleanup.

## Evidence

Baseline origin/main `09b3241a`; isolated branch `codex/sharing-theme-polish` at `/Users/athantsokolas/.codex/worktrees/noeis-sharing-theme-polish/note-taker-3-1`. Canonical dirty checkout and concurrent worktrees preserved.

- Focused initial regression: 101 tests / 11 suites, including Editions pages and sharing controls.
- Final regression: 106 tests / 12 suites, including owner share controls, public Concept/Question/Wiki pages, CSS contracts and URL encoding/privacy gates.
- Optimized CI production build and `git diff --check` pass.
- Real sharing components rendered with invented, mocked API snapshots in Chromium and WebKit: light, dark and Tokyo Midnight × widths1440/1320/900/430 × five kinds (Editions, notes, volumes, concepts, questions) =120 cases. No page errors, horizontal overflow, panel side clipping or controls beyond viewport width. Raw receipt: output/sharing-theme/render-receipt.json. This matrix preceded the final flex refinement that keeps Edition controls visible.
- Final Edition flex/viewport refinement verified in the in-app browser at1440/1320/900/430; controls and panel fit the viewport, long preview scrolls independently, Escape returns focus to Share. Final screenshots: output/sharing-theme/edition-final-desktop.png and edition-final-mobile.png. Earlier WebKit screenshots cover all five panel types.
- Wiki owner destination gate reviewed in source; full Wiki owner view was not rendered in the isolated five-panel fixture. Public Wiki regression tests passed.

The fixture proves rendered component behavior, not production publication/database persistence. No private notebook screenshots, user credentials, or real share URLs used in evidence. No emails sent or posts published. Physical-device keyboard acceptance and a fresh authenticated production check remain separate. This is a sharing-surface sweep, not proof that every unrelated Noeis UI is defect-free.

## User test

1. Select Tokyo Midnight, open an Edition, and choose Share. Text and the URL should be readable against a dark panel; scroll a long preview and confirm Copy link, Email and X remain available.
2. Copy link, then verify Email opens a draft with the public URL and X opens its composer with that same URL. Send/post only if you choose.
3. Update or stop sharing using the existing actions. An unshared Edition should offer Create share link, with no external destination actions yet.
4. Repeat at Safari-sidebar/tablet and phone widths, then switch to light and dark themes. Press Escape and confirm focus returns to Share.
5. Spot-check notes, volumes, concepts, questions and a ready public Wiki page for the same destinations.

## Remaining

Implementation and local checks complete. PR review, merge/deploy and authenticated production acceptance remain. The broader Think/cross-room roadmap and separate Wiki storage issue were not changed by this slice.
