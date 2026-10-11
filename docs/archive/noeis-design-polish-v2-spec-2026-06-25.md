# Spec — Design polish v2 (founder feedback + validated findings)

**For:** Codex
**Author:** Athan (feedback) + Claude (live validation, 2026-06-25)
**Context:** Follows `noeis-design-polish-spec-2026-06-24.md` (most of which landed — color tokens unified, cool tokens purged, card borders fixed, machinery nav escalated, cruft removed, logo→/wiki). This v2 captures Athan's new feedback (all validated live) + the carry-overs still open. **The nav regression (P0) is first — it broke reaching Settings/Connections.**

**Verification rule:** reproduce live on `https://www.noeis.io`; paste before/after screenshots in the PR. Don't close from a unit test alone.

---

## P0 — Nav: restore Settings/Connections, fix MORE, remove the dead buttons
**Validated (Athan + Claude):** the v1 cleanup over-consolidated. **MORE does nothing** — clicking it (and the Account `◉`) flips `aria-expanded` to `true` but **no menu panel renders** (confirmed 3×, no positioned panel appears). Because Connections/Settings/Reference were moved *under* MORE, they're now **unreachable from the nav** — you can only reach them by typing the URL. Athan: *"Removing the settings and other items really limits the product. We still need those, just not useless buttons. Right now More does nothing."*
**Fix:**
1. **Restore `Settings` and `Connections` as reachable** — either back as visible top-bar items (preferred — they're primary) or inside a MORE menu **that actually opens**. Do not hide essential destinations behind a broken control.
2. **Fix MORE** so its menu visibly renders on click + keyboard (debug why the panel doesn't paint — likely a portal/positioning/opacity/z-index bug in the menu component). Or drop MORE entirely and surface the items directly.
3. **Remove the genuinely useless controls:** the `◉` Account button (currently a dead no-op — restore a real account/sign-out menu **or** remove it); and `REFERENCE…` (an ellipsis button whose destination is unclear — it opens `/wiki/workspace?pane=chat`; either name it plainly or remove from the global bar).
4. Net target: a clean bar where every control does something, and Settings + Connections are one click away.
**Confirm:** click MORE → menu opens with Settings/Connections; reach Settings in one action; no control no-ops. Screenshot the open menu.

---

## P1 — Unify Library + Wiki-list + Concept into ONE list presentation
**Validated:** Athan — *"Can we have the library and wiki list of articles and wiki match what we show in concept. Right now there is lots of conflicting views."* Confirmed: three different list grammars today — Library article **rows**, wiki-list **cards (left-accent rule + faint boxes)**, Think **concept/in-motion rows**. They don't read as the same product.
**Target = the Think concept/in-motion row style** (the cleanest): `uppercase type/status eyebrow · serif title · mono state readout · clamped description`, **borderless**, separated by whitespace/hairline — no card boxes, no per-item outlines.
**Fix:** make the **Library list** and the **wiki "all pages" list** adopt the Think concept-row presentation. One shared row component/style across all three surfaces. Remove the wiki-list card boxes and the stray outline around the date/thumbnail cell (see the empty rounded outline left of each wiki row — screenshot). Keep each surface's facet rail; only the item rows unify.
**Confirm:** Library, wiki list, and Think concepts render visually identical row grammar side-by-side. Screenshots of all three.

---

## P1 — Remove the stray outline in the Think workspace (+ fix the raw block content)
**Validated (Athan screenshot):** in the Think notebook/workspace editor there's an **outlined box** around the "DRAFT BLOCKS" area, and the content inside is a raw source dump: *"Name: Playing to Win… URL: https://… Thought and Opinion **( attr(href) )** |Reading Time: 4 minutes."* Two problems: (1) the **outline/box** doesn't belong in the calm editor; (2) **`( attr(href) )` is a CSS/template artifact leaking into rendered text**, and the whole block reads as raw metadata, not authored content.
**Fix:** (1) remove the outline/box treatment in the Think workspace editor (match the calm borderless register). (2) Find where the draft/source block renders `attr(href)` literally and the `Name:/URL:/Reading Time:` dump — render it as clean prose/metadata, not a raw template string.
**Confirm:** open a Think notebook page → no stray outline; no `( attr(href) )` literal; block reads as clean content. Screenshot.

---

## P1 — Morning-paper lead still clamps mid-sentence (carry-over, NOT fixed)
**Validated live (2026-06-25):** the lead still truncates — *"Eight drift signals arrived, affecting five wiki pages: Circle of Competence, Opportunity Cost, First Principles Thinking, Margin of Safety in"* (cut at "in", no period). Intermittent but recurring.
**Fix:** the lead must always render a **complete sentence** — sentence-boundary trim in the briefing summary (`server/services/wikiBriefingService.js`) and/or remove the char-clamp in `WikiFrontPage.jsx`. Never rest on a dangling word/list.
**Confirm:** reload `/wiki` several times; lead always ends on terminal punctuation. Paste 3 examples.

---

## P2 — Replace the rotating background blob with a knowledge-graph motif
**Validated:** Athan — *"What is the rotating thing in the background of the wiki page and can we make it something better and more resembling of a wiki or knowledge graph."* Confirmed: it's **`.brand-gradient::before/::after`** — a slow drifting gradient (`brand-energy-drift` 90s linear + `brand-energy-pulse` 118s) using **off-palette purple/pink** (`--brand-energy-a/b` = `#9782ff`, `#fa8cbe`). Generic SaaS "brand energy," not wiki-specific, and the wrong color family.
**Fix:** on the wiki surface, replace the `.brand-gradient` drift with a **subtle knowledge-graph motif** — faint nodes + edges / a quiet constellation / a sparse network — in the **warm palette** (cream/gold, low opacity), reduced-motion-safe. It should read "this is a knowledge graph," not "gradient blob." (Keep the breathing brand-energy on the *composer* if you like it there; this is specifically the page background.)
**Confirm:** `/wiki` background reads as a graph/network in warm tones, no purple/pink drift. Screenshot light + dark.

---

## P2 — Backfill the "the Availability Heuristic" title casing (forward-fix isn't enough)
**Validated live:** the page still shows lowercase **"the Availability Heuristic"** in Library + wiki. The v1 title-casing fix appears to normalize only *new* titles; existing pages keep the bad casing.
**Fix:** add a one-time backfill/normalization for existing page titles (capitalize first letter, strip/cap leading article), or re-title the offending page. Going forward, normalize at creation (already done).
**Confirm:** no page title starts with a lowercase article anywhere. Paste the title.

---

## Still confirmed-good (do NOT regress)
Title color is unified, cool tokens purged, wiki-list doubled borders fixed, machinery nav escalated, QA cruft gone, logo→/wiki, "MODE" eyebrow removed, Library maintenance compacted. And the interaction layer is strong — focus-visible rings (64 rules), reduced-motion (20 blocks), the cursor-following warm "bloom" on rows, 40 on-brand keyframes. Don't touch those.

## Priority
P0 nav first (it broke navigation). Then the list unification + Think-outline + lead-clamp (P1). Then the graph-motif background + title backfill (P2).
