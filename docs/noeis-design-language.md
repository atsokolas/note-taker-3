# Noeis — Design Language

**Status:** Source of truth for UI/UX
**Owner:** Athan
**Last updated:** 2026-05-31
**Sits under:** `docs/noeis-vision-architecture.md` (product shape) and informs `docs/prd-llm-native-wiki-reshape.md` (wiki specifics)

---

## 1. The feeling

Noeis should feel like **a precision instrument for thinking that is quietly alive.** Inspirations, and what we take from each:

- **Stripe** — engineered motion. Nothing moves by accident; every transition signals state; immaculate, intentional, deep.
- **Teenage Engineering** — tactile and instrumental. Hardware logic in software: monospace labels, functional readouts, color-pop on neutral, playful but never sloppy. Things look like controls you operate.
- **Paradigm.xyz** — technical aliveness. The sense that a system is *running*, thinking with you, not a document sitting still.

The synthesis is our own: **warm and editorial when you read, alive and instrumental when you work.**

## 2. The core principle: two registers, one family

Noeis has two registers, and they map onto the raw→settled gravity of the product:

- **Reading = calm.** Wiki articles, settled concepts. Warm cream, Newsreader serif, editorial stillness. No pulsing instrument panels while reading a 1,500-word synthesis. The reading column is sacred and quiet.
- **Working = alive.** Home, the Think chassis, the agent rail, the connective tissue. This is where the Stripe/TE/Paradigm energy lives: magnetic rails, live readouts, motion that signals the system is thinking with you.

The more settled the content, the calmer the surface. The more active the thinking, the more alive and instrumental. **The aesthetic register and the product architecture are the same idea.**

## 3. Motion has meaning (the discipline)

Like Stripe, **we never animate for decoration.** Every movement signals state. Decorative motion drifts toward AI-slop and is forbidden.

Permitted motion always means one of:
- **The system is working** — agent reading/linking/drafting (live ticker, breathing presence).
- **A connection is happening** — a reference flying into a strip, a backlink forming, a concept graduating to a wiki page.
- **State changed** — docking, collapsing, snapping, promoting.

Everything respects `prefers-reduced-motion` — when set, motion resolves to instant state changes, never lost information.

## 4. Concrete "alive" mechanics

- **Magnetic rails.** Rails don't just sit; they snap, dock, and respond. Pull a reference → it flies into the reference strip. Collapse the agent → it magnetizes to the edge as a living dot, not a hidden panel. (TE tactility + Stripe precision.)
- **Live actions / readouts.** The agent shows what it's doing as it does it: `reading 3 sources… linking to Munger… drafting Evidence`. A quiet monospace ticker, like an instrument telling you it's running. (This is also the fix for the dead build moment — AT-311: building a page becomes alive instead of dead-until-reload.)
- **Ambient presence.** The agent dot breathes, pulses subtly when it has something, settles when idle. The conic-gradient composer breath (AT-289) is the seed — extend that language everywhere.
- **Engineered transitions.** Pulling something in, promoting a concept, a backlink forming — each gets a small, precise transition so connections *feel* like they happen, not just appear.

## 5. Spatial grammar (identical on every surface)

This consistency is a primary reason the surfaces will feel like one product instead of five apps. The same three-zone layout everywhere:

- **Left = your corpus / navigation.** Library and the things you can pull *from*. Where your stuff is.
- **Center = what you're working on.** The article, the concept canvas, the question. The hero.
- **Right = the agent.** Always there, same home, same identity, across Library, Think, and Wiki. Where your partner is.

You always know where your stuff is, where your work is, and where your partner is — on every surface.

### Consequence: the reading column is sacred
Because the agent has a permanent right home, the center column is sized around **both rails present by default.** The article is never crushed by the agent appearing, because the agent was always there. Rails are magnetic (collapse to edge-dots for full-focus reading), but the default is the honest three-column state. (This structurally fixes the ~464px reading-measure crush — that bug was a symptom of the agent being an afterthought.)

## 6. Theming: light default, dark must be first-class

- **Light is default:** warm cream canvas (`#FFFCF7` family), near-black warm ink for body, gold accent.
- **Dark mode is enabled and must work** when the user selects it — not an afterthought, a second skin over the same skeleton.

Rules that make this hold:
- **All "alive" mechanics are theme-agnostic behaviors** built from tokens, never hardcoded colors. Magnetism, live readouts, breathing, motion read correctly in both modes.
- **Only the palette swaps:** cream→ink background, warm-gray→light-gray text. The **gold accent is the constant spark in both modes.**
- Every new component ships with both light and dark tokens; "looks intentional in dark" is part of done, not a follow-up.
- Reading-register surfaces in dark go warm-dark (not cold black) to preserve the editorial calm.

## 7. Typography

- **Reading / editorial:** Newsreader (free, Google) for titles and body of settled content; serif body (Georgia stack) for article prose. Italic accent on display titles.
- **Instrumental / UI chrome & readouts:** `system-ui` stack for UI; a **monospace** for live readouts, labels, and "control" affordances (the TE register).
- **Hard constraint:** free/standard fonts only. No licensed faces. No Inter.

## 8. The agent's identity

One consistent presence — same name, same dot, same right-rail home, same voice — across Library, Think, and Wiki. It must read as **one partner moving with you**, not three assistants. (Today it's "Wiki agent" / "The Partner" / different per surface — unify this.) Established on the Home screen, then travels everywhere.

## 9. Per-surface register summary

| Surface | Register | Notes |
|---|---|---|
| **Home** | Alive | Sets the tone on login; agent greets with awareness; living pulse of the corpus; one magic input. |
| **Library** | Calm-ish intake | Calm as a destination; its contents must be fast to *summon* from anywhere (highlights = pullable atoms). |
| **Think — Concept** | Alive (generative) | Open calm canvas + companion agent that offers, not nags. Reference strip as light chips. |
| **Think — Question** | Alive (dialectical) | Same chassis; agent flips to challenger; claims get strongest counter + support docked beside them as magnetic, sourced cards (soft, in-place — NOT a rigid split-pane). |
| **Think — Notebook** | Calm (passive) | Chassis with agent turned down; may fold into "Concept quiet mode." |
| **Wiki article** | Calm (reading) | Editorial stillness; sacred reading column; alive only at the build/maintain moment (live ticker). |

## 10. Decisions locked

- Two registers (calm reading / alive working): **yes.**
- Theme: **light default, dark mode first-class and required to work.**
- Agent home: **right rail, always there, consistent across surfaces.**
- Left rail: **library / corpus / nav.**
- Question shape: **soft, challenged-in-place** with magnetic counter/support cards (not a split-pane).
- Motion: **meaningful only**, reduced-motion safe.

## 11. Home (designed)

**Register:** alive. Sets the tone on login and establishes the agent's permanent identity. The agent is at full presence here — Home is the agent's room. Spatial grammar holds: left = corpus nav, center = pulse + command, right = agent.

**The universal command (hero).** One input, center-high, generous, editorial placeholder (*"Think, ask, or build…"*). It routes intent — start a concept, ask a question, build a wiki, pull something up — and the agent says where it's sending you. Teaches "ask anything from anywhere" in the first three seconds. The input carries the gold conic-breath (AT-289) as its resting state — the partner is awake; on focus it brightens and steadies.

**The greeting (continuity, lands first).** The agent greets with genuine awareness — warm, specific, first-person, *noticing*. One click resumes the open thread. Example: *"While you were out I kept pulling on your specialization question — two things you saved yesterday actually sharpen it. Want to pick it back up?"*

**The corpus pulse (blended living feed, not a card grid).** A quiet vertical activity stream (monospace-tinged timestamps, warm Paradigm "system is running" feel), weaving three strands chronologically: (a) what the agent did while away ("Linked 3 highlights into your Munger page · 2h ago"), (b) fresh intake waiting to metabolize ("4 new saves · not yet woven in" + one-tap *metabolize these →* that runs live with the ticker), (c) open threads with momentum. Rows are live actions, not static tiles; in-progress items show the inline ticker; the feed moves subtly as things complete.

**The right rail.** Establishes the always-there agent's permanent identity (name, dot, voice, position, breathing presence, live readout) — then travels into every other surface, resized for context.

**What Home is NOT:** not a dashboard of feature tiles, not a recent-files grid, not five nav cards. Its only two jobs: **resume a thread, and start a new one.** Everything else is the agent showing it's been working.

### Voice: warmer / companion
The agent speaks like a sharp colleague who was thinking about your work while you were gone — first-person and noticing, not status-reporting. **Warmth comes from specificity and noticing, never from filler, emoji, or cheerleading.** "I noticed X about *your actual thing*" is warm; "Great to see you!" is noise. Cool-instrumental *visual* register, warm *voice* — cool surface, warm mind.

### First-run: guide me
The agent is never silent, including at the blank start. With no corpus, Home leans in and proposes first moves rather than floating a command in a void: *"Nothing here yet — let's start your space. Save something you're reading and I'll turn it into your first page, or just tell me what you're thinking about."* Two-three live magnetic starter actions: **save your first source**, **build your first wiki page**, **start a thought**. As soon as anything exists, Home transitions to the living-pulse state (the first item flying into the feed). First-run is not a separate screen — it's Home with the pulse unpopulated and the agent filling it.

## 12. Think chassis (designed)

**Register:** alive (generative). The Concept workspace is the **chassis**; Question and Notebook are postures of it, not separate apps. Spatial grammar: left = corpus, center = canvas, right = visible active agent.

**The canvas (center, hero).** Open, generous, editorial (same Newsreader/serif family as the wiki, so writing in Think and reading in Wiki feel like one mind). Calm typography, alive surroundings. No template, no forced structure — this is what makes Concept the freeing base. A **reference strip** holds pulled-in material (highlights, wiki pages, other concepts) as light magnetic chips; pulling something in flies it into the strip; each chip is a two-way link.

**The visible companion (right rail).** The agent is present and visibly thinking alongside you. Governing rule: **it offers, it never interrupts** — never grabs the cursor, never modal-pops, never reflows the canvas.
- Live **noticing** as magnetic suggestion cards that slide into the rail ("this connects to your 'circle of competence' concept"; "Munger made the opposite case here — want it?").
- A **running ticker** so "visible" means *visible thinking* (`scanning your library… found 2 related…`), not just buttons.
- Suggestions are **dismissible and ignorable by design** — they accrue, never block. Write for ten minutes ignoring them, then harvest the good ones.
- One tap **pulls a suggestion into the canvas or reference strip**, as a satisfying magnetic motion (the connection physically happening).
- Feel: a brilliant colleague to your right, visibly working your problem, sliding notes onto the desk that you read when you want. Present, alive, never in the way.

### Posture (the unifier) — manual switch
The always-visible agent has a **posture**, shown as a small tactile switch in the rail (TE register). Switching it visibly changes what the rail *does*:
- **Concept / generative (default):** builds with you — develops the idea, finds related material.
- **Question / dialectical:** same chassis; every claim you write gets the agent docking its **strongest counter + strongest support as sourced magnetic cards beside the claim** (soft, in-place — NOT a rigid split-pane). Canvas gains soft two-sided visibility; agent's job flips from build to challenge.
- **Notebook / passive:** agent recedes to ambient (breathing dot, no active suggestions) for solo freewriting. This is how Notebook folds in — chassis with posture = quiet.

You can flip posture mid-session (mirrors real thinking changing gears). **Posture is user-controlled for now.**

### Deferred (needs a harness): agent-suggested posture
Agent proposing a posture shift ("you're asserting a lot of claims — want me to start pushing back?") is explicitly **v2**, gated on a signal-detection harness we have not built/validated. Do not ship until that harness exists and is testable. Manual flip is the shippable primitive.

## 13. Connective tissue (designed) — the actual product

Two mechanics that must look and behave **identically on every surface** (wiki, concept, question, library). The moment they're bespoke per surface, the product fragments back into apps. They are one shared component pair, not surface features.

### Pull-in — universal "reference…" gesture
One gesture, one look, everywhere. A ⌘K-style command (plus a visible affordance for discoverability) labeled **"reference…"** that searches the *entire* corpus (highlights, wiki pages, concepts, questions, sources), ranked by relevance to what you're currently working on (agent holds that context). Pick → the object **flies into the reference strip** as a magnetic chip. The agent's suggestion cards are pre-staged pull-ins you accept with one tap — manual pull and agent-suggested pull converge on the same mechanic. **Pulling in writes both directions of the link at once** — bidirectional by construction, no separate "link back" step.

### Backlinks — "referenced by"
The same component everywhere: every object shows what it pulls in AND what pulls it ("Used as evidence in / Mentioned in"). Calm footer in reading register (wiki), live rail item in working register (Think). Makes the graph visible without being a chore — you never "file" anything; connections accrue and surface. This is the second-brain feeling made literal.

### Why this pair is the whole game
The unit of thought isn't the topic — it's whatever you're centered on, pulling everything else toward it. Pull-in is "pull toward"; backlinks are "everything else knows." Get this right and the topical thinker, the question thinker, and the source-grinder all get a product that fits their shape. **Highest-leverage thing in the product.**

### Honest build note
Requires a real **graph data model** underneath: objects with typed, bidirectional, live edges (references / referenced-by) that propagate updates. Today's links are partial and one-directional (wiki autolink service, citation refs). The connective-tissue UI is only as real as that model — this is a data/backend commitment, not a CSS layer. Scope it honestly.

## 14. Top-level nav + Think index (designed)

**Nav: 5 → 3.** Library, Think, Wiki. Notebook/Concepts/Questions are **postures within Think**, not nav destinations. **Home** is the logged-in landing (breathing command + pulse); the logo/home affordance returns you there.

**Entering Think lands on the Think index** ("your thinking, in motion") — Think gets its own home, consistent with Library and Wiki having one. Alive register.
- **Sorted by life, not name.** Most recently *moved* first (touched, agent-advanced, open tension); dormant threads sink. Shows what's alive, not an alphabetized archive.
- **Each row shows state instrumentally** (TE readouts): posture (generative/dialectical), references pulled in, unharvested agent suggestions, last movement. Read a thought's shape/health at a glance.
- **Posture is visible from the index** — a dialectical question looks different from a generative concept before you open it.
- **Agent present at index level** — cross-thread noticing ("your specialization question and circle-of-competence concept circle the same idea — link them?"). The partner thinks with you about your *portfolio* of ideas.
- **One way in:** universal command starts a new thought (fresh canvas, posture is an inside dial — no "New > choose type" friction); existing threads one tap.
- **NOT** a database table (no created/modified/type columns + sort arrows, no bulk-management chrome). If it looks like a table, we failed.
- **Dormant threads recede, don't accumulate as guilt.** Findable via search/pull-in, not stacked in your face. Living edge of thinking, not an inbox.

## 15. Full product shape (summary)

- **Home** — breathing universal command, warm-noticing greeting, blended living pulse, guiding first-run; establishes agent identity.
- **Library** — calm intake destination + summonable source (highlights as first-class pullable atoms).
- **Think** — index ("your thinking in motion") → Concept chassis, always-visible agent, manual posture (Concept generative / Question dialectical / Notebook passive).
- **Wiki** — editorial reading, agent-maintained, sacred reading column, alive at the build moment.
- **Connective tissue** — one universal pull-in + one universal backlink component, bidirectional, on a real graph model.
- **Nav** — Library / Think / Wiki + Home.

## 16. Open / to design or build next

- **Library** as a *summonable source* (highlights as first-class pullable atoms) — detail the summon UX beyond the calm destination view.
- First concrete code expressions of this language: build-alive ticker (AT-311), body-contrast token review (AT-317), unify agent identity across surfaces.
- Graph data model for the connective tissue (the backend prerequisite).
- Dark-mode token pass so "alive" mechanics read in both themes.
