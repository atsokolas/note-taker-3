# Noeis — Motion & Interaction Spec

**Status:** Source of truth for *how it moves*
**Owner:** Athan
**Last updated:** 2026-05-31
**Sits under:** `docs/noeis-design-language.md` (principles) — this doc is the physics layer.

> One-line aesthetic: **a warm instrument for thought — paper when you read, machine when you work, and you can feel it running.** Stripe = precision; Teenage Engineering = tactility & readouts; Paradigm.xyz = living-system feeling; warmth (cream, serif, noticing voice) = it's *yours*, not cold.

---

## 1. Motion physics (the three rules)

The difference between "alive" and "animated slop" is physics with intent.

1. **Spring, don't ease.** Magnetic elements arrive with weight — decelerate, slight overshoot, settle (spring curve, not linear/ease). Mass and momentum, not fades. A chip flying into the reference strip *lands*.
2. **One thing leads, others follow (stagger).** Cause and effect you can see propagate. Pull in a reference → chip lands (lead) → source's backlink counter ticks +1 (~80ms later) → agent rail acknowledges ("linked"). Never animate everything at once.
3. **Idle is never dead.** A faint product-wide pulse. The agent dot breathes ~6s at rest; quickens to ~2s when working; one sharp pulse then settle when it finds something. **Tempo encodes state** — you feel the system peripherally, like someone's breathing.

All motion is `prefers-reduced-motion` safe: resolves to instant state change, never loses information. Motion only ever signals state (working / connection / state-change). Decorative motion is forbidden (AI-slop).

## 2. The magnetic ticker (signature element)

A single fixed-width **monospace** line the agent writes into character-by-character, like a terminal/instrument log:

```
scanning library · 1,204 items
found 3 related
linking Munger → specialization
```

- Lines don't scroll away — they **collapse upward and dim** into a 1px history strip you can expand.
- Same component everywhere it appears: the wiki build moment (fixes the dead-until-reload bug), the Think agent rail, Home's metabolize action.
- This is the Paradigm "system is running" DNA. "Watching your partner think" should feel privileged, not like a loading state. Prefer the real reasoning trace over a spinner.

## 3. The pull-in gesture ("reference…") — the product's signature interaction

Linear-command-bar precision + a physical action. Should be the gesture people remember.

- **Invoke:** ⌘K or a persistent "⊕ reference" affordance.
- **Surface:** anchored to where you are (slides from the agent rail — the agent is who fetches), NOT a centered modal.
- **Results:** ranked by relevance to current work (agent context), typed by object — a highlight looks different from a wiki page from a concept (icon + register cue). The agent hands you candidates; you're not searching a DB.
- **Select:** the result physically flies from the command surface into the reference strip and **snaps** in; surface closes behind it. The motion *is* the confirmation — no toast.
- **Signature flourish:** as the chip lands, a hairline arc briefly draws between the chip and the canvas spot where the cursor was — the connection drawing itself, then fading. Sub-400ms. Makes "I connected two ideas" *felt*. (Paradigm draws live edges; we draw them at the moment of creation.)
- Writes **both** link directions at once (bidirectional by construction — see connective-tissue epic).

## 4. The Question dialectical canvas — counter/support docking

Principle: **the tension lives in the margins, not in a split.** No split-pane.

- Write freely in the center (Concept chassis). Mark a claim (for now: select + "challenge this"; agent auto-detect is deferred to the harness).
- A claim gets a faint **gold gutter notch** in the margin.
- The agent docks two cards in the **right margin beside that line**: one **counter** (strongest opposing evidence from your library), one **support**. They slide in from the agent rail and magnetize to the claim's vertical position.
- **Cards track their claims on scroll** — pinned to the sentence they argue with, like margin notes in a critical edition. Prose stays clean; debate lives alongside.
- Each card is sourced (real highlight/wiki page), pullable into your text. Dismiss → collapses to the gutter notch, recallable.
- **Instrument touch — the balance gauge:** per claim, a small readout of how much counter vs. support weight your library actually holds. Not a verdict, a gauge ("your sources lean 70% support"). TE: reasoning turned into a readout you can feel.

## 5. Dark mode as a real token system

Not invert-the-colors. Two complete palettes from **semantic tokens**.

- **Three surface layers, both themes:** `--canvas` (paper) / `--raised` (cards, rails) / `--sunken` (wells, inputs). Light = warm cream stack; dark = **warm near-black** (e.g. `#16140F`, never `#000`, never cold blue-black) so editorial warmth survives.
- **Gold is the invariant.** `--spark` is ~identical in both modes — the product's constant pulse. In dark it glows slightly hotter (higher luminance) so alive elements read as *emissive*, like an LED on TE hardware.
- **Reading register stays softer in dark** — body text warm off-white at ~85%, not 100%, to keep the calm. Working register may push more contrast and glow.
- **Theme flip is a designed moment:** ~250ms cross-fade of the token layer, gold holding constant through it. Like dimming a room, not slamming a switch.
- Every component ships both palettes; "looks intentional in dark" is part of done.

## 6. Register transitions (the thesis, animated)

- **Promotion as a witnessed state change:** when a concept graduates to a wiki page (raw → settled), it visibly *changes register* — instrumental chrome quiets, typography settles to editorial, gold cools. You watch a thought become knowledge. Done once beautifully, this single transition *is* the product thesis.
- Generally: the more settled the content, the calmer the surface. Moving an object along the raw→settled gravity should be visible.

---

## 7. Creative swings — candidates (parked; pick v1 vs later)

Bold ideas. Not committed; captured so they're not lost. Each tagged with a rough call.

- **Corpus telemetry strip (Home).** TE readout, literal + honest: `corpus: 1,204 sources · 38 concepts · 6 open threads · agent worked 3× overnight`. Monospace, quiet, true numbers. Makes it feel like a machine running on your knowledge. — *Lean v1 (cheap, high identity).*
- **One subliminal tick on connection.** A single tasteful sound on the pull-in snap. Off by default, toggleable. One perfect sound beats many. — *Lean v1.1 (small, signature; needs taste pass).*
- **Agent thinking as visible computation.** Reasoning trace rendered as a live system process (the ticker), not a spinner. — *Lean v1 (same component as ticker).*
- **Constellation on demand.** From any object, a key chord summons a momentary spatial map of *just this object's* connections, animates outward, dismisses. The graph as a glance, not a place you live (avoids graph-view noise). — *Lean v2 (needs graph model first).*
- **Density dial (calm ↔ instrument).** Global control: power users turn up telemetry/readouts/tickers; calm users turn toward pure editorial. The two registers become a user-tunable spectrum. Very TE (a knob), respects different thinkers. — *Lean v2 (after registers exist as tokens).*

---

## 8. Build dependencies

- Physics rules (§1), ticker (§2), dark tokens (§5) belong to the **Design System epic (AT-324)** — foundational primitives.
- Pull-in gesture (§3) + flourish belong to **Connective Tissue (AT-326)**; the hairline-arc flourish needs the graph model.
- Dialectical canvas (§4) belongs to **Think chassis (AT-328)**; balance gauge needs library-as-source (AT-331).
- Register/promotion transition (§6) spans **Think (AT-328)** + **Wiki (AT-330)**.
- Telemetry strip + visible-computation (§7) ride on **Home (AT-327)** + the ticker primitive.
