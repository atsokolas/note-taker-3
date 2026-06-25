# Spec — Details polish pass (craft layer: feel, motion, typography, alignment)

**For:** Codex
**Author:** Athan + Claude (live details run-through, 2026-06-23)
**Frame:** The product's taste is already high — the serif/mono/uppercase register system and Think's calm index prove it. The flaws cluster in **one place: agent-generated text isn't held to the same typographic discipline as the hand-built chrome.** Fix that and the craft reads as uniformly considered.

**Verification rule:** reproduce live on `https://www.noeis.io`; paste before/after screenshots or computed values in the PR. Don't close from a unit test alone. Ranked P1 → P3.

---

## P1a — The morning-paper lead clamps mid-sentence (most visible flaw)
**Symptom (live):** the wiki front-page agent lead — the largest text on the landing page — rests on a broken fragment: *"…First Principles Thinking, QA Build Order"* (no period, mid-list). Also seen: *"…affecting"*, *"…was."* It clamps to ~3 lines and stops with no terminal punctuation and no ellipsis. (Contrast: Think's orientation lead is always a complete sentence — that's the bar.)
**Root cause to find:** two candidates, fix whichever applies — (1) a CSS line-clamp on the lead in `note-taker-ui/src/components/wiki/WikiFrontPage.jsx` / `note-taker-ui/src/styles/wiki-front-page.css` cutting mid-sentence; and/or (2) the composed `briefing.summary` from the server (`server/services/wikiBriefingService.js`) is itself too long / not a self-contained sentence.
**Fix:** the lead must always render a **complete sentence**. Prefer composing/trimming the briefing summary to a full sentence that fits ~2–3 lines (sentence-boundary trim, not character clamp). If a visual clamp stays, clamp at a sentence/clause boundary and end cleanly — never on a dangling word or comma-list. The write-in animation must also settle on the complete sentence, not a mid-stream cut.
**Confirm:** reload `/wiki` several times; the lead always ends on terminal punctuation and reads as a finished sentence. Paste 2–3 examples.

## P1b — Title-casing bug: "the Availability Heuristic"
**Symptom (live):** a built page titled **"the Availability Heuristic"** — leading lowercase article leaked into the title. Visible on the page, in Library, and in the wiki list.
**Root cause to find:** the concept-title inference from pasted text (`note-taker-ui/src/pages/WikiOnboarding.jsx` `inferConceptTitleFromText`, added 2026-06-21) and/or the server title normalizer (`normalizeTitle` in `server/routes/wikiRoutes.js`). The inference takes the first words but doesn't title-case / strip a leading article.
**Fix:** normalize built titles — capitalize the first letter, and either drop or capitalize a leading article ("the/a/an"). "the availability heuristic" → "Availability Heuristic" (preferred) or "The Availability Heuristic". Apply at the point of creation so it's correct everywhere downstream.
**Confirm:** paste text whose first word is "the/a/an"; the resulting page title is clean. Paste the title.

## P2a — Reading measure is too wide (~95 characters/line)
**Symptom (live):** the wiki article reading column is 848px wide; body is 17.92px → ~95 chars/line, past the comfortable 66–75ch range. Tiring to track on the surface that's all about calm reading.
**Fix:** cap the reading measure to ~`68ch` / ~680–700px on the article body (the wiki workspace reading view — `stitch-editorial.css` / the wiki read container). Keep the rails where they are; just constrain the prose column. Don't change the body size (17.92/1.6 is good).
**Confirm:** measure chars/line on a real article ≈ 66–75. Paste the computed width.

## P2b — "Magnetic" row interaction is inert
**Symptom (live):** Library rows carry `is-magnetic` (`note-taker-ui/src/components/library/LibraryArticleList.jsx`, `LibraryArticleRow` with `onPointerMove`/`handlePointerMove`), but pointer-move fires no transform — only the `border/bg/shadow 0.18s` hover is wired. A named-but-dead motion is a detail smell.
**Fix:** decide and make it true — either (a) wire the intended subtle cursor-follow/tilt transform (keep it *calm*: a few px, eased, `prefers-reduced-motion` off), or (b) remove the `is-magnetic` class and the dead handler. Don't ship an interaction that's named but does nothing.
**Confirm:** state which you did; if (a), show the transform responding to pointer position (and disabled under reduced-motion).

## P2c — Cruft reaches the hero (test pages in the lead + Explore)
**Symptom (live):** QA test pages ("QA Build Order Verification 2026-06-19", "QA User Test Switching Costs 2026-06-19") appear in the morning-paper lead AND the `/wiki` Explore index — the most visible copy.
**Fix:** two parts — (1) **guard:** exclude low-quality / needs-review / obviously-malformed pages from the briefing lead and the Explore index (reuse the quality signal already used to flag "needs review"). (2) **data:** these specific QA pages should be deletable by the owner (they're real pages in the account) — confirm the delete path works; don't auto-delete user data.
**Confirm:** Explore + lead show only legitimate pages. Paste the Explore list.

## P3a — Front-page build composer placeholder is truncated
**Symptom (live):** the `/wiki` build composer shows "Ask thought partner to b…" — the input is narrower than its own placeholder.
**Fix:** widen the composer input (or shorten the placeholder) so the placeholder isn't clipped at rest. (`WikiFrontPage.jsx` composer / `wiki-front-page.css`.)
**Confirm:** placeholder fully visible at 1280 and 1440.

## P3b — Date formats are inconsistent
**Symptom (live):** "2d ago" (front page) vs "Jun 20, 2026" (infobox) vs "Apr 11" (Think).
**Fix:** one convention via a shared formatter — e.g. relative for < 7 days ("2d ago"), absolute for older ("Jun 20, 2026") — applied across wiki/library/think readouts.
**Confirm:** the same page's date reads consistently across surfaces.

---

## The meta-fix (call it out in the PR)
P1a, P1b, and P2c are the same root issue: **agent-generated text (leads, titles, page sets) leaks past the typographic bar the hand-built UI holds.** Treat agent output as first-class typography — complete sentences, clean title-case, quality-gated before it reaches visible surfaces. Where practical, add a small shared "presentation" guard so this doesn't regress per-feature.

## Priority
P1a + P1b first (most visible, cheap). P2s next. P3s are quick wins to batch in. Keep everything calm/reduced-motion-safe; don't regress the register system or Think's index (the reference standard).
