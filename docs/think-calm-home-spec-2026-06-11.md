# Spec — Calm Think: home landing + unified motion stream + quiet shelf rail

**For:** Codex
**Decided with Athan:** 2026-06-11
**Tracks:** AT-396 (primary), relates AT-395, AT-397, AT-329 (epic), AT-398 (refactor)
**Source of truth:** `docs/noeis-design-language.md` §12–14, `docs/noeis-motion-interaction.md` §1–2, `docs/noeis-vision-architecture.md` §4, §8

---

## 1. Goal (one paragraph)

Make **Think home (`/think?tab=home`) the calm front door of the Think room**, using the same grammar that shipped on the wiki front page (AT-394) and the concepts index (AT-329, commits `ddce8a4`/`d80161d`): the agent's orientation lead, an **"In motion"** stream of the user's liveliest threads — **across concepts, questions, AND notebook pages** — an **"On the shelf"** index for the rest, and the command as the quiet act. The **left sidebar stays** — redesigned as a calm "shelf rail" (quick lateral access to the corpus), not deleted as it was on the concepts index. Apply the identical treatment to the **questions index** and **notebook index**, and **restore the calm left rail on the concepts index** to match.

The product principle (design language §10): *every room is calm at the door; instruments live inside the open thread.* The agent keeps the right seat everywhere.

## 2. What exists today (verified live 2026-06-11)

- **Think home** — unchanged old layout: "Workspace orientation / Think" hero, agent card ("I kept X warm" + Resume thread), command input, REFERENCE block, left rail (Thought partner hero + Sources/Highlights/Annotations nav + NOTEBOOK list + WORKING CONCEPTS counts), right ThoughtPartner rail. It's the room's real front door (nav "Think" → `tab=home`) and it's still a console.
- **Concepts index** (`tab=concepts`) — already calm-inverted: orientation lead h1, In motion (top 3, mono state notes), On the shelf serif index, hairline actions; **left rail currently REMOVED** (this spec restores a calm version), agent alone on the right.
- **Questions index** (`tab=questions`) — old shape: question list + editor panels, "QUESTION REFINEMENT" hero, agent moves cards.
- **Notebook index** (`tab=notebook`) — old shape: "Choose a page when you are ready to write," page cards, reuse-actions panels.

## 3. The shared grammar (build ONCE, reuse 4×)

Three zones, identical across Think home + the three per-type indexes:

```
LEFT: shelf rail (quiet)     CENTER: orientation + motion     RIGHT: agent
```

### 3.1 Center column (the door)
1. **Eyebrow** — `Think` (home) or `Think · Concepts` / `· Questions` / `· Notebook` (per-type).
2. **Orientation lead (h1, serif, write-in optional later)** — the agent's voice, composed honestly from data we have (pattern shipped in `conceptIndexOrientation`, ThinkMode.jsx). Home version spans all types: *"Your 'specialization' question has the strongest pull — 2 newer sources waiting. 'investing' moved yesterday; 21 threads on the desk."* Fallbacks: most-recent thread → quiet desk line. (Server-authored richer line = AT-395, do NOT block on it.)
3. **In motion** — top 3–5 threads ranked by life. On home: **mixed types**. On per-type indexes: that type only. Each row: serif title, **type/posture tag** (`Concept` / `Question · open` / `Note`), mono state note (existing `describeConceptMotionNote` pattern; per-type variants below), clamped 1–2 line description/last-line.
4. **On the shelf** — everything else as the serif dot-separated index (shipped pattern `tix-shelf`). Dormant recedes; nothing guilt-stacked.
5. **The act** — on home: the existing universal command ("Think, ask, or build…") kept, restyled to the quiet composer treatment (breathing presence per AT-289 pattern); on per-type indexes: the hairline actions row (shipped pattern `tix-actions`).
6. **Hairline** (optional, home only) — `more: sources · highlights · annotations` linking to what the old left-rail nav exposed, if those don't fit the shelf rail (see 3.2).

### 3.2 Left "shelf rail" (the user's explicit ask — keep the sidebar, make it calm)
A single shared component (e.g. `ThinkShelfRail`), replacing today's mixed rail (Thought-partner hero + nav + NOTEBOOK + WORKING CONCEPTS counts). It is **corpus access, not a console**:

- **Sections:** `Concepts`, `Questions`, `Notebook` — each a quiet list of names (serif, small), ordered by recency, **no count badges shouting** (counts may render as faint mono suffix, e.g. `investing · 6`, but muted; zero-count items just the name).
- **Collapse behavior:** sections collapsed to ~5 visible items with a quiet "all →" expanding inline (dormant recedes; everything findable).
- **Search** — one small input at top filtering all three sections (reuse existing `search` state; restore the search affordance lost when the concepts-index rail was removed).
- **On per-type indexes**, the rail shows the same three sections (lateral movement between types stays one click — this is the vision's "connected, never constrained").
- **What moves OUT of the rail:** the Thought-partner hero/CTA (the agent lives on the right, one identity — design language §8); Sources/Highlights/Annotations nav (→ home hairline or MORE); "New inquiry" button (→ the command / actions row).
- Sticky like today's rails; both themes via tokens; fits its column (no AT-354-style fixed-width children — see §7).

### 3.3 Right rail
Unchanged: ThoughtPartnerPanel with posture tabs, per surface, exactly as now. **Do not unmount it** on any of these views — the queued-prompt tests assert the last-mounted panel receives prompts (`ThinkMode.templates.test.jsx`, "queues a structure cleanup prompt from …").

## 4. Per-type state notes (mono, instrument register — only real data)

- **Concept:** shipped — `reviewed <date> · <n> highlights · <statusLabel> waiting` (`describeConceptMotionNote`).
- **Question:** `open <since> · <n> linked highlights · <n> evidence` (or `answered <date>` for shelf); use fields available on the question objects (`status`, `linkedTagName`, timestamps). Never fabricate.
- **Notebook page:** `edited <date> · <n> blocks` (or just `edited <date>` if block counts aren't cheap).
- Cross-type ranking on home: stale/waiting-material first (strongest pull), then most-recently-touched across types. Reuse `compareReviewDates`-style comparison on the freshest timestamp each type has.

## 5. Choreography & registers

Same as shipped: staggered entrance (`tix-anim` pattern: eyebrow/lead → In motion → Shelf → actions, ≤ ~1.2s), then stillness; `prefers-reduced-motion` = instant. Reading-calm typography (serif leads/titles), instrument mono only in state notes. Both themes via tokens (`--text-primary/secondary/muted`, `--nt-divider`, `--surface`, `--accent-primary`). Single h1 per view (the orientation lead). No page h-scroll.

## 6. What does NOT change

- The open-thread chassis (concept workbench, question editor, notebook editor) — untouched.
- Posture switch (Concept/Question/Notebook tabs) — untouched.
- Universal command routing (home) — keep behavior identical; restyle only.
- The agent's right rail content/behavior.
- Wiki, Library — untouched.

## 7. Engineering notes (read before cutting)

- **`ThinkMode.jsx` is a ~6.6k-line monolith** (AT-398 has the refactor investigation). Strongly consider extracting `ThinkShelfRail` and a shared `CalmIndex` (orientation + motion + shelf renderer, parameterized by type) as the *first* AT-398 extractions rather than adding 4 more inline variants.
- **Vercel builds with `CI=true`** (warnings = errors). The local `wiki:qa` gate's build is NOT CI-strict. Any deletion in ThinkMode tends to orphan panel variables/state (`conceptIndexLeftPanel` incident, commit `d80161d`, −178 dead lines). **Run `CI=true npm run build` locally before every push.**
- Two layout paths exist per view: the editorial shells (`conceptIndexEditorialLayout` etc., the ones that actually render under `body.noeis-editorial`) and the generic `leftPanel`/`rightPanel` chain. Change BOTH or confirm which is live for each view.
- The concepts index currently uses `concept-index-editorial-shell--calm` (2-col, no left aside). Restoring the shelf rail returns it to 3-col — reuse the original `250px minmax(0,1fr) 300px` track or define a calm variant; kill the `--calm` 2-col override or repoint it.
- **AT-354 caution:** the workbench right rail still clips (fixed ~561px descendant — see AT-354 diagnostic). Don't introduce fixed-width children in the new rail; verify `el.scrollWidth <= el.clientWidth` on the shelf rail at 1280/1440.
- Tests: update `ThinkMode.templates.test.jsx` assertions for home/questions/notebook the same way the concepts-index assertions were updated (orientation heading + "In motion" + state-note regex; keep create-flow testids). Keep all 19 green, add coverage for the home mixed-type stream (a concept + a question + a note in mock data; assert ordering puts the stale item first).

## 8. Acceptance criteria

1. Nav "Think" lands on a calm home: orientation lead (h1) + mixed-type **In motion** + **On the shelf** + quiet command + shelf rail left + agent right. No "Workspace orientation" console hero.
2. Concepts, Questions, Notebook indexes share the identical grammar (per-type In motion/Shelf), each with the shelf rail restored/present.
3. Shelf rail: three sections, recency-ordered, muted counts, inline expand, search filters all sections, no clipping (`scrollWidth <= clientWidth`), both themes.
4. In-motion rows show honest per-type state notes; stale/waiting items rank first; clicking any row opens that thread as today.
5. Queued ThoughtPartner prompts still route (existing tests pass); 19/19+ ThinkMode tests green; `CI=true npm run build` passes locally; full `npm run wiki:qa` exit 0.
6. Entrance choreography ≤ ~1.2s then stillness; reduced-motion instant; single h1; no h-scroll at 1280/1440.
7. Verify live post-deploy (Vercel deploy state READY + browser check on all four views, both themes) before closing.

## 9. Out of scope (already ticketed)

- Server-authored orientation line + cross-thread noticing — **AT-395**.
- Unharvested-suggestion counts in state notes — **AT-397**.
- Full ThinkMode decomposition — **AT-398** (but the two extractions in §7 are encouraged here).
- Wiki front page, Library — done/untouched.
