# Spec — Design finish: the last inch of craft

**For:** Codex
**Author:** Athan + Claude (final design/style review, 2026-07-25, live on desktop light + prior dark-mode/mobile passes)
**Context:** The register — typography, palette, editorial voice, dark mode — is the product's superpower and is **A-grade; do not touch it.** Density is much improved (content-first dossiers, ASK-pill collapse, calm front page). What remains is the last inch: **component consistency, stock form controls, and state/feedback craft.** These are the details that separate "designed" from "finished" — Notion feels finished because its smallest controls are designed; Noeis's chrome is designed but its forms are stock HTML.

**Scope guard:** this is a *finish* pass, not a redesign. No layout changes, no new components beyond what's listed, no touching the reading register, motion system, or dark palette.

**Verification rule:** before/after screenshots for every item, light + dark, on `https://www.noeis.io`.

---

## D1 (P0) — One button grammar
**Symptom (one screen region, four grammars):** `BUILD PAGE` (gray uppercase box) · `CREATE REPO WIKI` (bare uppercase text) · `Watch feed` (rounded sentence-case pill) · `Disarm` (pill, repeated 8× down the Watching list). Plus the check-in verbs (below) in a fifth style.
**Fix:** define exactly **three button roles** in the design system and map every control to one:
1. **Primary** (one per surface max): the filled/boxed treatment — e.g. BUILD PAGE, Create dossier.
2. **Secondary**: quiet bordered/pill treatment — e.g. Watch feed, RUN AGAIN.
3. **Tertiary/inline**: underlined or plain text action in the editorial register — e.g. Disarm, Continue reading, Open claim.
Sweep the wiki front page, Watching list, dossier pages, composers, and Settings; re-map every button. The Watching list's 8 stacked `Disarm` pills become tertiary text actions (the row's receipt is the content; the action is quiet).
**Acceptance:** a single screenshot of the wiki front page (scrolled through paper → watching → composers) shows exactly three button treatments, consistently applied. Light + dark.

## D2 (P0) — The check-in verbs deserve the register
**Symptom:** Still hold / Revise / Retire — the most important new interaction in the product — render as generic gray system pills inside the editorial page. They belong to no design system.
**Fix:** style the check-in block as an editorial object: the claim in serif, the page attribution in mono (already right), and the three verbs in the product's own control language (tertiary text-buttons with generous hit areas, or quiet bordered pills per D1's secondary role — taste call, but *one* of the three roles, not a fourth). "Open claim" gets equal visual weight to the verbs (it's currently an undersized afterthought). After a tap, the mono acknowledgment (`reaffirmed · 4th time · held 212 days`) animates in with the existing motion vocabulary.
**Acceptance:** check-in block screenshot light + dark; the verbs visibly belong to the same family as the rest of the page.

## D3 (P0) — Kill stock form controls
**Symptom:** native unstyled `<select>`s (Calculation scale "USD millions", Think's Status/Scope dropdowns), raw `mm/dd/yyyy` native date input in the Expectations Clock, default-gray text inputs in the dossier/repo composers. Stock chrome inside a hand-built editorial page.
**Fix:** one styled form-control set in `theme.css` (input, textarea, select, date), matching the existing input-surface tokens: warm surface, hairline border, focus ring from `--focus-ring`, mono or small-caps labels (the "Ticker / Starting judgment" label pattern is already right — extend it). Apply to: dossier composer, repo composer, RSS watcher composer, Expectations Clock, Think thread filters, Settings (email card is close already).
**Acceptance:** no native-styled control visible on wiki front, dossier page, Think, or Settings. Screenshots light + dark.

## D4 (P0) — The status chip stops speaking in 3-letter stubs
**Symptom:** the topbar chip truncates its label to cryptic stubs: "NE…", "WIK…", "BUI…". The user must click to learn whether something failed.
**Fix:** give the chip a sane min/max width showing a real word ("Needs review", "Building…", "Wiki synced" — truncate at ~16 chars with ellipsis, not 3), or collapse to a state icon + dot with the full label in the popover and on hover. Failure tone (red dot) must always render the word "review" or "failed" visibly, not "NE…".
**Acceptance:** screenshots of working/receipt/failure chip states; all legible at a glance.

## D5 (P1) — Empty and null states in the product voice
**Symptoms:**
- Entity panel renders raw nulls: "Born: Unknown · Key claim: Unknown".
- The empty Expectations Clock shows a full form scaffold ("Awaiting explicit market inputs" + naked date/price/shares inputs) on pages that failed to build.
- (Copy-level failure states — "BUILD FAILED THE QUALITY GATE", raw `FMP_API_KEY` — are specced in `noeis-dossier-reliability-spec-2026-07-25.md` R3; don't duplicate, but the *visual* treatment of failure banners belongs here: the failed-build banner should use the same quiet-banner language as "Agent-owned page", not an all-caps shout.)
**Fix:** null fields hide or show an em-dash with muted styling, never "Unknown"; the empty Expectations Clock collapses to one quiet line ("Add a dated price to compute implied expectations →") that expands on demand; failure banners restyle to the quiet editorial banner with a tertiary action.
**Acceptance:** dossier page with no data shows no "Unknown" strings and no naked form scaffold. Screenshot.

## D6 (P1) — Constellation background never crosses text
**Symptom:** the knowledge-graph background's edges/nodes occasionally draw through the content column and composer areas (visible on the wiki front page screenshots), adding noise under text.
**Fix:** mask or fade the constellation within the content column's bounds (a soft gutter mask, or opacity → ~0 within the column). Keep it alive in the margins — it's good there.
**Acceptance:** front-page screenshot shows no graph lines under body text at 1440px and 1920px.

## D7 (P2) — Watching list rhythm
**Symptom:** 8 visually identical rows with repeated bold `EDGAR · TICKER` headers + pill buttons reads as monotony; the one broken row (transcript) is styled identically to healthy rows.
**Fix:** tighten row rhythm (type-column alignment: watcher type as a small mono badge, ticker as the strong element), healthy vs. attention states visually distinct (attention rows carry the warm accent), Disarm per D1 tertiary.
**Acceptance:** Watching list screenshot — scannable in one pass, broken rows visibly different.

---

## Do NOT touch (verified excellent, 2026-07-25)
- The reading register: serif display, drop caps, citation superscripts, measure, Newsreader/mono pairing.
- Dark mode (warm near-black) — best in category.
- The morning-paper editorial layout and voice; RETURN PATH card; machinery nav.
- The dossier content architecture (Current Judgment, Implied Expectations table, Entity rail).
- Motion system: hover bloom, reduced-motion handling, ASK-pill collapse.

## Priority
D1–D4 are the P0 finish (buttons, check-in verbs, forms, chip) — they touch every surface a proof user will see. D5–D6 next. D7 last.

## The line
Nothing in this spec adds a feature. It closes the distance between the product's best inch — the dossier prose — and its worst inch — a naked `mm/dd/yyyy` input sitting beneath it. When the smallest control on the page belongs to the same hand as the headline, the product reads as finished. That's the whole spec.
</content>
