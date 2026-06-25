# Spec — Design system + details polish (consolidated)

**For:** Codex
**Author:** Athan + Claude (founder design review + live verification, 2026-06-24)
**Supersedes:** `noeis-details-polish-spec-2026-06-23.md` (everything there is folded in below).
**Thesis:** the hand-built chrome is high-taste, but the **system isn't codified** — so the same object gets three creams, the same action gets three loading treatments, and a nav button means different things in different places. Most of this list collapses into **three token/system fixes + one nav cleanup.** Do those first; the rest are details.

**Verification rule:** reproduce live on `https://www.noeis.io`, paste before/after screenshots or computed values in the PR. Don't close from a unit test alone. `CI=true npm run build` + `npm run wiki:qa` before push.

---

## PART 1 — The leverage (do these first)

### 1A (P0) — Text-color token system + grayscale pass + purge the residual COOL-blue tokens
**Symptom (verified live 2026-06-24):** two problems, same root (color isn't tokenized).
1. **Title cream drifts:** the same role — a navigable title — renders as **three different creams** in dark mode: `rgb(239,230,212)` (wiki "Today's page" + wiki list), `rgb(241,234,220)` (Think left rail), `rgb(210,196,172)` ("Recently grown" + some Explore links). Hierarchy carried by micro-value shifts, not structure.
2. **Residual COOL-blue token family** (this is the old `#0d1422` dark-bg bug, never fully migrated): the warm system is contaminated by leftover cool blue-grays in structural/utility spots — e.g. the wiki machinery nav text is `rgb(158,176,207)`, and the wiki-list **card borders are `rgba(96,118,153,…)`**. These read cold against the warm cream/near-black palette.
**Fix:**
1. Define a **small fixed set of text tokens** in `note-taker-ui/src/styles/theme.css` (and the editorial overrides in `stitch-editorial.css`): `--text-primary`, `--text-secondary`, `--text-muted`, `--text-link`, `--text-on-accent` — each with a deliberate contrast step (not 1–2 shades apart), for **both** light and dark.
2. Map **every page/title/label** to one token by role: a page *title* is always `--text-primary` regardless of section (Today's page, Recently grown, Explore, wiki list, Library, Think in-motion); links use `--text-link`; eyebrows/meta use `--text-muted`. Kill the ad-hoc per-section cream values.
3. **Purge the residual cool-blue family.** Grep for cool blue-grays still in use — `rgb(158,176,207)`, `rgba(96,118,153,*)`, `#0d1422`, and similar — and replace with warm tokens (`--text-muted`, `--nt-divider`/border token, warm surface). These are the same migration the dark-bg fix started; finish it. Card borders and the machinery line are the visible offenders.
4. **Grayscale test (acceptance):** desaturate the UI; the hierarchy levels must still read. Lean on size/weight/whitespace, not value, for the primary hierarchy.

**Measured contrast/grayscale (dark mode, bg `rgb(20,17,13)`):** contrast is **strong, not the problem** — the issue is value *consistency*. Relative-luminance (= grayscale value) of the text tokens:
| token | contrast | grayscale lum |
|---|---|---|
| primary cream `239,230,212` | 15.2 | 0.797 |
| alt cream `241,234,220` | 15.7 | 0.827 ← redundant with primary |
| "recently grown" title `210,196,172` | 11.0 | **0.562** ← same role, very different gray |
| muted `148,139,125` | 5.6 | 0.262 |
| machinery cool `158,176,207` | 8.6 | 0.428 ← cool/off-palette |
| card border cool `96,118,153` | 4.1 | 0.177 ← cool/off-palette |

So the **title role spans grayscale 0.56–0.83** — it doesn't read as one level when desaturated, and `primary`/`alt cream` are redundant (collapse to one). Target: a title is ONE luminance; define ≥0.15 luminance steps between primary/secondary/muted. (Note: primary is ~0.8 lum / 15:1 — near-max and slightly stark for a *calm reading* register; consider softening primary a touch — taste call, flag don't force.)
**Confirm:** on `/wiki` + `/think` + `/library` (light + dark), all page titles compute to the **same** token; paste the values. Grayscale screenshot still shows clear, evenly-stepped hierarchy.

### 1B (P1) — Error/feedback states (the real gap — focus & motion are already strong)
**Corrected after a deep audit (2026-06-24).** The interaction layer is **better than a surface pass suggests** — do NOT rebuild it:
- **Focus is implemented:** 82 `:focus-visible` rules, 64 with a visible ring (`outline:none` + `box-shadow 0 0 0 2px var(--accent-soft)`). (An earlier "no focus ring" reading was a false alarm — `:focus-visible` only fires on keyboard nav, not programmatic `.focus()`.)
- **The "magnetic" row WORKS** — it's a warm cursor-following radial bloom (`::before = radial-gradient(180px at cursor, gold/0.14)`, position tracked by JS via `--row-bloom-x/y`, revealed `opacity 0→1` on hover/focus). It is **not dead** — do not remove it.
- **Reduced-motion is handled:** 20 `prefers-reduced-motion` media blocks (22 rules disabling animation/transition).
- **Motion system is rich:** 40 keyframes (breathing `brand-energy-pulse/drift`, `wikiParagraphRecentHalo`, `referenceReceiptLand/ChipSnap`, typing carets, shimmers). The aliveness is a genuine strength.

**The actual gap is ERROR / FEEDBACK legibility, not focus or motion:**
- Make failure visible: Notion connect gives no confirmation (see Notion spec); onboarding can land a raw **"failed draft stub"** banner on a user's first page; embed 429s fail **silently** (search quality rots invisibly).
- **Fix:** a consistent feedback pattern — success/fail toasts on connections, a reassuring recovery state instead of "failed stub," and a quiet surfaced status when a background job (embedding) fails. Audit each surface for `loading / empty / error`; empty states are decent, error states are the hole.
- **Light touch on focus:** don't add focus from scratch — just **spot-check coverage** (tab through Connections, the wiki list facets, the agent composer) and add `:focus-visible` only where an interactive element is genuinely missing one.
**Confirm:** trigger a real error on Connections / a borderline onboarding build / a failed embed and show a legible, on-brand feedback state (not silence, not "failed stub"). Paste screenshots.

### 1C (P1) — Top-nav cleanup
**Symptom (verified):** `Noeis` logo → `/think?tab=home` (should be Wiki — the intended landing); `REFERENCE…` is a button with an ellipsis that *also* navigates to Think (mismatched affordance + duplicate destination); `MORE` is a button styled unlike the adjacent links; a trailing `◉` button has empty aria and does nothing; the right side has 6 ungrouped top-level controls.
**Fix:**
1. **`Noeis` logo → `/wiki`** (the product's landing surface). Update the link + aria.
2. **`REFERENCE…`**: decide its job. If it's a destination, name it plainly and link it (not an ellipsis button to Think). If it's a menu, make it a real menu. Right now it's neither — most confusing element in the app. Likely: remove it from the top bar.
3. **Group the right side:** sections (`Library / Think / Wiki`) on the left with the brand; utilities (search, theme toggle, account) clustered right; `Connections / Settings / More` consolidated — `More` should be a single menu containing the secondary destinations, styled consistently (not a lone mismatched button).
4. **The trailing `◉` button:** give it a real purpose (account/profile menu) or remove it. No dead controls.
**Confirm:** clicking the logo lands on `/wiki`; no nav element silently no-ops; the bar reads as two clean groups. Screenshot.

---

## PART 2 — Screenshot-specific items

### 2A (P1) — Escalate the wiki "machinery" nav line
**Symptom (screenshot 4):** `workspace: knowledge map · all pages · needs review · review (8)` is core navigation buried as a tiny low-contrast mono footnote at the bottom of `/wiki`. "All pages", "needs review", "knowledge map" are primary destinations.
**Fix:** promote it to a real, legible secondary nav (clear affordances, adequate contrast/size) near the top or as persistent wiki sub-nav — not an 11px mono whisper. (`note-taker-ui/src/components/wiki/WikiFrontPage.jsx`.)
**Confirm:** the destinations are discoverable without squinting; screenshot.

### 2B (P1) — Simplify the Library top
**Symptom (screenshot 2):** three lead blocks stack before the list — **Worth reopening** + **Corpus maintenance** + **Search/list** — competing for attention in a "reading room." "MODE" eyebrow is meaningless.
**Fix:** one clear lead at the door. Keep "Worth reopening" as the single hero; move **Corpus maintenance** (filing stats + Review-filing action) to a quieter slot (a compact strip, or into the agent/Cabinet rail). Drop or rename the "MODE" eyebrow. (`note-taker-ui/src/pages/Library.jsx`, `components/library/LibraryReadingRoomLead.jsx`.)
**Confirm:** Library top reads as one calm lead + browse; screenshot before/after.

### 2C (P2) — Wiki list: card borders + rail consistency with Library
**Symptom (screenshot 3):** page-card borders stack/double where cards meet; the left facet rail ("Pages / Browse your wiki") doesn't match Library's Cabinet ("Cabinet / Your filing system") in label/treatment.
**Fix:** (1) use a single shared divider or one border per card so borders don't double up (`note-taker-ui/src/components/wiki/WikiList.jsx`, `.wiki-index__page-card`). (2) Align the wiki facet rail's header, spacing, and item styling to the Library `LibraryCabinet` exactly so they're visual siblings.
**Confirm:** side-by-side wiki-list vs Library — same rail grammar, no doubled borders.

---

## PART 3 — Carry-over details (from the 06-23 pass)

- **P1 — Morning-paper lead clamps mid-sentence** (intermittent): *"…QA Build Order"* with no terminal punctuation. Always render a complete sentence; sentence-boundary trim, not char-clamp. (`WikiFrontPage.jsx` + `server/services/wikiBriefingService.js`.)
- **P1 — Title casing "the Availability Heuristic"**: normalize built titles (capitalize, strip/cap leading article) at creation. (`WikiOnboarding.jsx inferConceptTitleFromText`, `normalizeTitle` in `wikiRoutes.js`.)
- **P2 — Cruft in hero**: QA test pages ("QA Build Order Verification…", "QA User Test Switching Costs…") in the lead + Explore. Quality-guard those surfaces; confirm owner delete path works.
- **P2 — Reading measure ~95ch**: cap the wiki article prose column to ~68ch / ~700px.
- **P3 — Front-page build composer placeholder clipped** ("Ask thought partner to b…"): widen input or shorten placeholder.
- **P3 — Date formats inconsistent** ("2d ago" / "Jun 20, 2026" / "Apr 11"): one shared formatter (relative < 7d, absolute beyond) applied everywhere.

---

## Priority
1A + 1B + 1C are the leverage — they resolve the title-color mismatch, the state inconsistencies, and the nav confusion at the system level (and stop them regressing). Then Part 2 (escalate nav, simplify Library, wiki-list consistency). Part 3 details last. Don't regress the register system or Think's calm index (the reference standard).
