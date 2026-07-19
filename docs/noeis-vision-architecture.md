# Noeis — Vision & Architecture

**Status:** Source of truth (supersedes the surface-by-surface framing)
**Owner:** Athan
**Last updated:** 2026-07-19
**Related:** `docs/prd-llm-native-wiki-reshape.md`, `docs/noeis-research-publication-system-spec-2026-07-19.md`, `docs/noeis-research-operations-runbook-2026-07-19.md`

---

## Strategic hierarchy

**Mission**
Build the intelligence infrastructure for exceptional decision-making.

**Long-term vision**
Create the first AI-native institution that continuously compounds judgment and converts superior understanding into companies, investments, and enduring organizations.

**First product**
Noeis: the operating system for maintained judgment.

**First proving ground**
Research and invest in the transformation of physical industries through AI, electrification, and automation.

**Ultimate outcome**
A permanent institution that gets smarter every year.

The operating doctrine remains: real work -> observed friction -> bounded product change. The product experience described below serves this hierarchy.

## 1. What Noeis is (one line)

**A space to think.** Your reading and ideas live here cleanly, and an LLM agent works alongside you to develop, challenge, and maintain them.

Not a notes app. Not a chatbot. A second brain that an agent actively helps you build. The product test for every feature: *does this help me think, or does it make me manage an app?*

## 2. The core stance

- **You** read, save, explore, and decide what matters.
- **The agent** is present everywhere, holding the whole corpus in context, helping you build ideas, challenging your reasoning, and maintaining settled knowledge.
- **The corpus** is one connected graph of everything you've taken in and worked on.

This is the Karpathy LLM-native pattern generalized beyond the wiki: the human sources and questions; the LLM builds and maintains; the knowledge compounds.

## 3. The shape: a graph, not a pipeline

Thinking is associative, not linear. Noeis must be **connected but never constrained.**

- There is **no required entry point and no required flow.** A wiki page can spark a concept; a question can crack open a wiki page; a months-old highlight can become the key to a concept you're stuck on.
- **Whatever you're working on is the center of gravity.** Everything else you've ever saved or written becomes referenceable material you can pull toward it.
- **The unit of thought is not always a topic.** Sometimes it's a topic ("Munger"), sometimes a question ("specialization vs. multidisciplinary mindset"), sometimes a concept/argument you're developing, sometimes a single source you're chewing on. None of these reduce to each other. Munger can be the *star* of his own wiki page and a *supporting source* in a question about specialization — same object, different role depending on what you're centered on.

There is a soft gravity from raw → settled (intake tends to get metabolized into durable knowledge over time), but it is a *tendency, not a track*. Nobody is forced through stages.

## 4. The three surfaces

Collapsed from five. Each has a one-line identity a stranger would instantly understand.

### Library — what I've taken in
Intake. Articles, PDFs, highlights. Low friction, high volume. The compounding store everything else pulls from. **Keep as-is; it works and is loved.**

### Think — where I work
One workspace **chassis**, expressed in different **postures**. This replaces the separate Concept / Question / Notebook surfaces, which were really the same object (a thinking workspace) with different agent stances and structures.

The chassis is built from **Concept**, because that is the workspace that came out best. The others are deliberate variations on it, NOT separately-built apps (building the same thing three times is why Question/Notebook came out weaker).

Postures:
- **Concept (base / generative):** open, freeing. The agent helps you *build* an idea. No forced opposition. This is the proven chassis.
- **Question (dialectical):** the Concept chassis + a two-sided structure that keeps the tension visible + the agent posture flips to **challenger**: for claims you make, it surfaces the strongest counter-examples and the strongest support, with sources from your library. Question's value (forced counter-examples, structure for working a question) is preserved as an *additive layer on a good chassis*, not a weak standalone.
- **Notebook (passive):** the chassis with the agent turned down — you write, it stays out of the way. May fold into "Concept in quiet mode"; decide during build, don't force now.

The difference between postures is partly **agent behavior** (passive / builder / challenger) and partly **workspace shape** (open vs. two-sided). Both must be real — a posture is not just a system-prompt tone, it changes what the space *does*.

### Wiki — what I now know
Settled, agent-owned knowledge. Can be about anything. The agent maintains it and can prompt to create wikis; the user can also ask for a wiki on a topic. The durable synthesis/reference layer. (Detailed behavior: `docs/prd-llm-native-wiki-reshape.md`.)

## 5. The connective tissue (the actual product)

Because it's a graph, the most important capability is **not any single surface — it's the connections between objects.** Get this right and the topical thinker, the question thinker, and the source-grinder all get a product that fits their shape.

Two non-negotiables:

1. **Frictionless lateral movement / pull-in.** From anywhere, reference, pull in, or spin off into any other object without losing your place. "Pull this wiki page in as a source." "Attach this highlight as evidence." "Promote this question to a wiki page." "This wiki sparked an idea → open a concept that references it." These cross-object actions *are* the product.

2. **Bidirectional, always-live links.** If a Concept references a Wiki page, the Wiki page knows it's referenced by that Concept. If you cite a highlight, the highlight knows where it's been used. When the wiki updates, dependents see it. Every pull leaves a two-way trace. This is what makes it feel like one connected mind instead of copies scattered across tabs.

The **agent is the through-line** that makes the graph navigable: the same partner in every surface, holding the whole web in context, so while you read an unrelated wiki page it can say "you drew on this in your specialization question." That ambient cross-surface awareness is the magic.

## 6. The flywheel

Intake → metabolize → compound, spinning in **any** direction the thinker pushes it:

- **Intake:** Library captures raw material.
- **Metabolize:** the agent (in Think and Wiki) turns raw material into developed ideas and settled, sourced knowledge — and re-metabolizes when new material arrives ("drop one source → many pages update").
- **Compound:** questions and concepts graduate into durable wiki pages; the corpus gets denser and smarter every time you use it; better corpus → better intake decisions.

## 7. Provenance is the trust backbone

A thinking partner you can't trust the sourcing on is not a partner, it's a confident stranger. Every settled claim should be traceable back through the objects that produced it to the original Library highlight/source. Bidirectional links carry this provenance. New intake should ripple forward into everything it affects.

## 8. The design tension to manage

Freedom has a cost: if everything connects to everything and you can enter anywhere, the product can feel **shapeless** (no obvious start, no sense of progress). Resolve it with:

- Surfaces that stay **visually/behaviorally distinct** (a Question *looks* two-sided/dialectical, a Wiki page *looks* like an encyclopedia, Library *looks* like intake) so you always know what mode you're in even though you move freely.
- The **agent providing orientation** ("where am I / what's relevant") so structure isn't needed to feel grounded.
- Links **suggested, not mandatory** — the system surfaces "this relates to X" but never forces filing.

## 9. North star (the agreed statement)

> **A space to think. One workspace chassis (built from Concept), expressed in postures — open/generative, or dialectical/challenging. Library feeds it, Wiki is the settled output, the agent is present throughout, and everything is bidirectionally linked and referenceable. Connected, never constrained — you start anywhere and pull anything toward whatever you're working on.**

## 10. Implications for what we build (not a committed roadmap — direction)

Three horizons, each making the loop more real. They are **connective-tissue work**, not isolated features:

- **H1 — Make the existing loop flawless and grounded.** Fix the live-build experience (wiki page fills in place as the agent writes — AT-311). Make wiki links actually render between pages so it feels like a web. **Keystone: wire Think + Wiki to the real Library** so pages/ideas are grounded in your actual highlights and sources, with citations that point back.
- **H2 — Close the intake→metabolize bridge.** Karpathy's "drop a source": one affordance to drop a URL or pick a library item → agent decides which objects to update → you watch it ripple.
- **H3 — Compounding + the map.** "Promote this answer/question/concept to a page." A graph dense enough to show you the shape of your own thinking.

**Build-order principle:** build the *one* Think chassis well, express Question/Notebook as variations of it, and invest disproportionately in the connective tissue (pull-in + bidirectional links + ambient agent), because that is the product.

**Seeding note:** the vision is not legible at ~4 wiki pages and sparse links. An early high-leverage move is to seed the corpus from the real Library (batch-metabolize existing saved material) so we judge the experience on a living knowledge base and surface whether provenance/linking hold at scale.

---

## Appendix — what changed from the earlier framing

- **Five surfaces → three** (Library, Think, Wiki). Concept/Question/Notebook unified into one **Think** chassis with postures.
- **Pipeline → graph.** No required entry point or flow; whatever you're working on is the center, everything else is referenceable.
- **Topic is not the universal atom.** Questions/concepts/sources are first-class centers of gravity too.
- **Concept is the chassis** (it came out best); Question = chassis + two-sided structure + challenger agent; Notebook = chassis + passive agent (may fold in).
