# Work note tools: implementation and QA

Base: merged redesign 5ad1b0ce3f9b7d85c98e8e5a133b5d87057de8c2 (PR620). Isolated branch codex/work-note-provenance in noeis-note-tools. These additional features are tested and independently reviewed. Athan subsequently authorized pushing, reviewing and merging them; exact-head CI and normal merge eligibility remain the release gates. Actual PR, merge and automatic-deployment evidence is reported in the delivery message.

## Behavior

Select words in a Work note and choose Make Open, or use Writing tools. The existing editable Open draft now offers a destination Work notebook. Adding creates one follow-up or open question in that notebook, preserving the original source words. Its receipt shows the source notebook and original meeting-section date, links to the source passage when a saved block identity exists, and keeps the original quotation in the item editor. It appears in the destination notebook’s Tasks & appointments tab, in Outstanding, and alongside its source note. Item title, destination, planning and status remain editable; its accepted origin remains fixed.

The server derives source title, notebook and date from the owner’s saved source, validates the selected words, and rejects foreign notes/destinations, agent tokens, stale passages and altered origin receipts. Repeated meeting wording is resolved against the selected actual meeting date. Bullets/quotes use the same identity as their saved blocks; saved HTML retains hard-break boundaries that flat legacy blocks cannot. Dirty source writing syncs before its child. Draft/request identities and existing retry/recovery behavior are reused. Offline receipts show known source metadata and withhold an incomplete link until it can resolve.

The note toolbar sticks beneath the global bar while scrolling (at the top of the quick-note dialog). Meeting dates is a native navigation dropdown; date entry and Add dated entry / Continue this entry retain the existing semantics. Body and Heading1/2/3 edit normal document structure. Contents reflects headings, jumps to sections, collapses individual sections or every heading at a chosen level, and expands all. Escape closes Contents and restores its summary focus. Hidden sections remain in the ProseMirror document, HTML, blocks, copy/undo and save path; keyboard/caret navigation reveals a hidden destination. Fold choices restore by stable heading ID. Untouched legacy headings without IDs open expanded on reload until a normal edit supplies stable IDs; opening/folding does not rewrite legacy content.

Date, contents and source jumps explicitly scroll the actual target into view beneath the sticky controls. If an original block was removed, the source note opens with an honest changed-passage message. HTML-only legacy notes link back to the note without fabricating a block anchor.

## Verification

Browser preview on Athan’s Mac: http://127.0.0.1:3104/work?note=n0&theme=light (Tokyo Midnight via theme=tokyo-midnight). The preview is fictional and isolated by an Axios adapter that blocks production requests; UI persistence is in its own local fixture storage. API persistence and ownership are separately tested against temporary MongoDB, not the preview adapter.

Visually verified at desktop1440, sidebar width1280 and mobile430: long-note sticky bar, date dropdown jump, Add date while scrolled, prose save/reload without losing earlier writing, Contents panel, folding/restoration, native keyboard Escape, editable destination, source receipt in the destination notebook, and source link selecting its original passage. Light and Tokyo Midnight use existing semantic tokens; no horizontal overflow. Browser screenshots in ignored output/playwright: follow-up-destination.png, sticky-date-mobile.png, contents-mobile.png, date-jump-mobile.png, note-tools-tokyo.png.

Tests cover creation/date rollover/continuation/reload/legacy behavior; heading styles, contents,80-section long-note folding, keyboard selections and undo; source identity for bullets/quotes/hard breaks and preceding heading boundaries; local draft reload, dirty parent sequencing and canonical receipts; ownership, foreign destinations, original-date hints, changed-source fallback and immutable provenance. Final local verification: 196 Work UI tests in19 suites pass (receipt1793831067209-a7ea84), all three selected server files pass (receipt1793831044741-bf8c9b), and the full production UI build compiles successfully. UI and API receipts match content tree18520d79b0321ff862562322f598e75fa8047d847522f27502344b56541a1d0a.

Independent read-only review and scoped corrections passed. Review identified rich-block identities, incomplete pending links and overly broad whitespace comparison; all corrected with regression tests. Visual QA additionally caught caret-only jumps and selected ranges beginning at a preceding heading boundary; corrected and verified in the actual browser.

## Code craft

WorkItemSource replaces ad hoc source receipts across the existing item surfaces. workNoteOutline provides one heading projection and one nonmutating ProseMirror fold plugin, extending the existing editor rather than creating another document/store. workProvenance centralizes server-owned source snapshots. Existing Open drafts, Work sessions, item metadata, revision/actions and notebook APIs are extended; no parallel submission path, migration or production data operation is introduced.

Local Node22.22.3 remains below the declared22.23.4 minimum; remote CI is required before any future merge. No credentials, permissions or deployment settings changed.

## Previously authorized release

PR619 dated meeting sections merged c0328bcfc51dcb7d6c4819b726e5d6d835410474 and was verified live. PR620 full Today/rail redesign merged5ad1b0ce3f9b7d85c98e8e5a133b5d87057de8c2 after all exact-head checks succeeded (run41921198570), Codex review found no findings, and normal eligibility was CLEAN. No PR approval was submitted. Automatic Vercel Production deployment7559127789 succeeded at2026-11-04T22:05:29Z for that exact commit. www.noeis.io served /static/js/9981.6806fa7b.chunk.js with Upcoming, From earlier and Priorities, plus colored-rail CSS. Public API /health returned HTTP200/statusok. No manual deployment was triggered; Render’s exact revision was not independently queried.
