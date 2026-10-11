# Test Plan — "A Space to Think" build (2026-06-03)

**Scope:** all 10 epics in the Noeis — A Space to Think project, all In Review.
**Method:** live Chrome on noeis.io, JS-selector driven, screenshot/DOM evidence per claim. Stop on first error; report failures honestly; never claim unverified results.
**Source of truth:** `noeis-vision-architecture.md`, `noeis-design-language.md`, `noeis-motion-interaction.md`.

## Discipline rules (after this session's failures)
- Use stable selectors (aria-label / text) + JS reads, not stale element refs.
- Confirm the tab id from `tabs_context_mcp` before every interaction sequence.
- Every pass/fail must cite a screenshot or a DOM/network read. If a tool errored, the test is UNVERIFIED — say so, never invent a trace.

---

## AT-329 — Nav collapse 5→3 + Think index
- [ ] Top nav shows **Library / Think / Wiki** (not Concept/Question/Notebook as separate items). Home reachable via logo.
- [ ] `/think` (or Think nav) lands on an **index** ("your thinking in motion"), sorted by recency-of-movement, not a database table.
- [ ] Index rows show instrumental state (posture, references, last movement).
- [ ] No horizontal scroll; single h1.

## AT-327 — Home
- [ ] Logged-in landing has the **universal command** input ("Think, ask, or build…" style).
- [ ] Command **routes intent** (typing + submit sends you somewhere sensible).
- [ ] **Greeting** with specific awareness (not a generic banner).
- [ ] **Living pulse** feed (activity stream, not a static card grid).
- [ ] First-run/guide state exists when corpus empty (can't fully test with populated corpus — note).

## AT-325 — One agent identity
- [ ] Agent presence is **consistent** across Library / Think / Wiki (same name, same right-rail home, same dot).
- [ ] No more divergent "Wiki agent" vs "The Partner" framing.
- [ ] Breathing/ambient presence visible.

## AT-324 — Design system (registers, motion, dark, grammar)
- [ ] **Spatial grammar**: left = corpus/nav, center = work, right = agent — consistent across surfaces.
- [ ] **Two registers**: reading surfaces calm/editorial; working surfaces alive/instrumental.
- [ ] **Dark mode** toggles and is first-class (warm near-black, gold accent survives, text readable). Test both themes.
- [ ] Typography: Newsreader reading / system-ui chrome / monospace readouts. No Inter.
- [ ] Reduced-motion respected (spot check).

## AT-326 — Connective tissue (pull-in + backlinks)
- [ ] A **universal "reference…" / pull-in** gesture exists (⌘K or ⊕ affordance).
- [ ] Pulling in an object creates a **visible reference** (chip / strip).
- [ ] **Backlinks** ("referenced by / used as evidence in") show on the target object.
- [ ] Links are **bidirectional** (A references B → B shows A).

## AT-328 — Think chassis + postures
- [ ] Concept workspace is the chassis: open editorial canvas + visible right-rail agent.
- [ ] **Posture switch** present (Concept generative / Question dialectical / Notebook passive).
- [ ] Question posture: claims get **counter + support** docked beside them (margin, not split-pane).
- [ ] Agent offers, never interrupts (no modal/cursor-grab).

## AT-330 — Wiki to vision
- [ ] Build a page → **alive build moment** with live ticker; body fills **in place** (no manual reload) — this is the AT-311 reopen, the key regression.
- [ ] Reading column not crushed (~700px+) with agent open.
- [ ] Body contrast raised (AT-317) — readable, still warm.
- [ ] Inline wikilinks render between pages (needs denser corpus).

## AT-332 — Intake → metabolize (drop a source)
- [ ] An affordance to **drop a URL / pick a library item** exists.
- [ ] Submitting shows the agent **deciding what to update** + a ripple (ticker/activity).

## AT-331 — Library as summonable source
- [ ] Library calm destination intact.
- [ ] Highlights are **pullable atoms** — appear as candidates in the pull-in from Think/Wiki.

## AT-333 — Compounding map
- [ ] **Promote** a question/concept/answer → wiki page exists.
- [ ] A **map / constellation** of corpus connections is reachable.

---

## Cross-cutting
- [ ] No naked "Loading…" first paint; wiki-native loaders only.
- [ ] No horizontal scroll at desktop (1440) and mobile (390).
- [ ] No console errors on each surface.
- [ ] Backend cold-start handled gracefully.
