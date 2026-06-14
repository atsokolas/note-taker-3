# Deep-Dive QA Report — 2026-06-04 (logged in, current build)

Full functional + UI/UX sweep, every claim screenshot/DOM/network-backed. Build includes commits through `e836991`.

## Headline
The product is **structurally first-class and the data/backend layer is far more real than earlier passes showed** — graph model, ingest, maintenance, agent runs, cross-surface references all genuinely work and persist. The remaining failures cluster into ONE precise pattern: **write/result actions fire real backend work, but the result doesn't render back into the open surface** (and two buttons don't fire at all). Fix the "result → surface" binding and the write-path on two buttons, and this crosses into genuinely usable.

---

## ✅ WORKS (verified live this pass)

**Home universal command (AT-327)** — typed "What is the relationship between risk and return?" → agent **correctly routed it to a new Question workspace**, classified intent, opened Challenger posture, fired `/api/connections/search?scopeType=question`. Intent router genuinely works.

**Drop-source / metabolize (AT-332)** — pasted a Wikipedia URL → real **POST /api/wiki/ingest**, "DROPPING…" → completed. Live corpus telemetry: *7 wiki · 51 working thoughts · 9 library atoms · 182 live edges · 93 wiki bridges · 75 claim atoms · 142 graph objects.* The graph data model is real and populated.

**Wiki maintenance / morning-paper** — accurately reported *"The maintenance agent rebuilt the 'Opportunity Cost' wiki page"* (the page I'd just built) with live counters (1 page updated · 8 need review) and Activity "Wiki log" (MAINTENANCE COMPLETED / SOURCE EVENT PROCESSED / ASK ANSWERED). Maintenance backend is real and tracks true activity.

**Knowledge map** — force-directed constellation with type-color legend, Map/List/Export. Renders.

**Wiki build pipeline** — `/build` creates a real page; after reload, full sourced articles (e.g. "Opportunity Cost" 655 words, Sources 5 · Claims 14; "Mental Models" 1263; "Compound Interest"/"Opportunity Cost" 1093).

**Library** — Cabinet/shelves, 23 articles, source reading room (draft-first moves, marginalia), agent rail with provenance + cross-surface pullable references (showed my session's Question + wiki pages with OPEN). Clean.

**Cross-surface graph wiring** — references between Question / Wiki / Library objects show up across surfaces (read side).

**Dark mode (AT-324)** — first-class everywhere tested (Home, Library, reading room, wiki article): warm near-black `rgb(20,17,13)`, warm off-white body `rgb(185,176,160)`, gold accent, layouts intact, zero Inter.

**Reading measure** — wiki article body **848px** in the workspace (well above the ~700px target). Reading column healthy where it matters.

**Hygiene** — single h1 per view, no page horizontal scroll, no console errors on any surface.

---

## ❌ STILL BROKEN (re-confirmed with merged fixes live — NOT deploy lag)

1. **AT-355 — Pull-in PULL is a no-op.** Click PULL → counter stays 0 OUT · 0 IN, "No references yet," **zero network**. (Candidate *search* fires `/api/connections/search`; the PULL *write* does not POST.)
2. **AT-356 — Wiki build doesn't refresh in place.** Built "Opportunity Cost": 4 words held 30s+, **1093 words only after manual reload**. Reader never streams in.
3. **AT-357 — Promote-to-wiki is a no-op.** Click → zero network, no modal, no nav.
4. **AT-354 — Think concept agent rail clips its own content.** scrollWidth 561 > clientWidth 336; heading/readout/prompt-set clip off the right edge. (Note: this rail is fine on Library, reading room, and wiki — clip is specific to the Think concept/question layout.)

## ⚠️ NEW / PARTIAL findings

5. **Challenge agent move (AT-358) — fires a real run, no visible output.** Clicking Challenge in a Question kicks off a genuine agent run (8 calls: runs/proposed-changes/structure-proposals/write-boundary/harness-metrics/approvals; rail "Critic is active for Challenge"). But after ~40s **nothing surfaced** into the canvas — SUPPORT/COUNTER notches stayed empty, no proposed-change/approval UI. Same "result doesn't render" family as AT-356. (Silver lining: the old newsletter-noise dump did NOT recur on this path.)
6. **Drop-source ripple feedback is thin (AT-332).** Ingest works, but no "N pages updated / here's what rippled" confirmation surfaces — succeeds silently.

---

## The precise diagnosis (for Codex)
Three buckets, in priority order:
- **Result→surface rendering** (highest leverage, affects the most): wiki build (AT-356), Challenge output (AT-358 part 2), ingest ripple feedback (AT-332). Backend produces; UI doesn't re-render the open surface. Likely the same stream/refresh-nonce/subscription gap across all three.
- **Write-path buttons that don't fire at all**: PULL (AT-355), Promote (AT-357). onClick → mutation POST is missing/erroring before network.
- **One contained layout bug**: Think rail overflow (AT-354).

Everything else — the graph model, ingest, maintenance, routing, dark mode, editorial reading — is working and genuinely good.
