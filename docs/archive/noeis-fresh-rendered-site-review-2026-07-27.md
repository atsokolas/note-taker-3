# Noeis fresh rendered-site review

**Date:** July 27, 2026  
**Scope:** The live rendered site only. No source inspection, implementation analysis, prior QA, or existing review artifacts were used as evidence.  
**Surfaces reviewed:** `/wiki`, `/library`, `/think?tab=home`, `/proof`, and `/examples`  
**Viewports:** 1440 × 1000 desktop and 430 × 932 mobile  
**Confidence:** High on the visual and interaction findings below; unknown on the truly logged-out root experience because both available browser sessions redirected `/` to the authenticated `/wiki` route.

## Verdict

The comment is fair.

Noeis does not look like the usual low-effort AI template everywhere. `/proof`, in particular, has a distinctive editorial point of view. But the site does look **vibe coded as a product**: individual screens contain appealing ideas that have not been reconciled into one visual system, one interaction grammar, or one clear hierarchy of user jobs.

The strongest evidence is visible without looking at the code:

1. Public pages look like different products.
2. Authenticated pages try to communicate too many product ideas simultaneously.
3. Loading, empty, failure, and ready states contradict one another.
4. Mobile layouts often stack desktop concepts instead of being deliberately recomposed.
5. Internal system language and implementation-shaped data escape into the user experience.

That is what the reviewer probably meant. The site feels generated and accumulated screen by screen, then aesthetically polished, rather than edited down under a coherent product-design system.

## What “vibe coded” means here

In this case, it does **not** primarily mean “ugly,” “purple,” or “obviously built from a component kit.” It means:

- Each page has plausible local styling, but the pages do not feel governed by the same rules.
- The interface presents every interesting concept instead of making hard prioritization decisions.
- Copy often names system behavior rather than helping the user decide what to do.
- Empty and failure states appear to have been designed independently and then rendered together.
- Desktop composition is visually ambitious, but mobile behavior exposes unresolved layout assumptions.
- Some surfaces optimize for a demo screenshot rather than a durable, legible workflow.

The result has the characteristic shape of AI-assisted product development: many individually defensible ideas, insufficient convergence.

## Findings

### 1. `/proof` and `/examples` do not look like the same company

**Severity:** High  
**Confidence:** High

`/proof` is a warm, editorial publication: ivory canvas, large Newsreader-style display type, fine rules, restrained buttons, and document-like hierarchy.

`/examples` abruptly switches to a pale-blue gradient background, a centered white rounded container, heavy sans-serif type, large bubbly cards, and a three-card grid. It is almost a textbook generic AI/SaaS landing-page composition.

The difference is too large to read as purposeful variation. It reads as two separately generated design directions that were both shipped.

**Why it creates the vibe-coded impression:** A real design system can support different page types while retaining typography, spacing, container behavior, navigation, controls, and tonal continuity. These two pages share almost none of that visual grammar.

**Fix direction:** Pick the editorial system as the canonical public brand and rebuild `/examples` within it. Do not merely recolor the existing cards.

### 2. The Library mobile header visibly collides with itself

**Severity:** Critical  
**Confidence:** High

At 430 px, `Library`, `Clean up structure`, `Cabinet`, `Thought partner`, and the italic subtitle overlap in the top portion of the page. The collision is visible immediately, before any interaction.

There is no horizontal page overflow, but avoiding overflow is not the same as having a responsive composition. The desktop action row was compressed over the mobile title instead of being collapsed, moved, or reprioritized.

**Why it creates the vibe-coded impression:** This is the kind of defect that survives when a desktop concept is made responsive mechanically rather than designed at the breakpoint.

**Fix direction:** Give mobile a dedicated header composition: title and subtitle first, one primary action, remaining actions in a menu or lower utility row.

### 3. Library presents mutually contradictory states

**Severity:** Critical  
**Confidence:** High

The final rendered Library state simultaneously says:

- “Your reading room is ready”
- “No saved sources yet”
- “0 sources”
- “Failed to load folders”
- “Failed to load articles”
- “Library context visible”
- “waiting for highlights to reveal themes”

Before failure resolved, the page also showed “Loading cabinet…” and skeleton rows alongside the zero-source empty state.

This is not merely a backend failure. It is a state-design failure: the product does not establish one authoritative page state and adapt the rest of the interface to it.

**Why it creates the vibe-coded impression:** Generated UIs often have independently composed loading, empty, success, assistant, and error components. When state orchestration is weak, all of their messages appear at once.

**Fix direction:** Define a page-level state machine. If article or folder loading fails, suppress “ready,” empty-state coaching, and agent contextualization that assumes a valid corpus. Present one recoverable error with one next action.

### 4. The Wiki home has no dominant job

**Severity:** High  
**Confidence:** High

The first screen combines:

- a “Morning Paper”
- repository processing status
- a return path
- evidence surfaced
- claim review controls
- a continuation recommendation
- recently grown pages
- a watch rail
- page-building controls

The pieces are visually refined, but the page does not answer one basic question: **What is the single most important thing I should do here?**

On one observed state, repository status appeared multiple times using variants of “ignored” and “not yet analyzed — queued.” Another state put a long OpenAI Agents SDK claim beside an equally prominent NVIDIA continuation.

**Why it creates the vibe-coded impression:** The interface feels like an accumulation of compelling feature demos. Product editing would choose a primary return-loop action and subordinate the rest.

**Fix direction:** Make the page a ranked decision queue. One primary action should dominate; evidence, continuation, watchers, and creation tools should become secondary layers.

### 5. Internal and system-shaped language leaks into the experience

**Severity:** High  
**Confidence:** High

The live Wiki exposed:

- `__repo_inventory__/code-inventory.txt`
- commit-like identifiers such as `828286c`
- “50 repository evidence records collected”
- status combinations such as “GitHub · ignored” and “not yet analyzed — queued”
- labels including “source clock,” “accepted maintenance loop,” “proven head,” and “claim-level maintenance event”

Some of this language is meaningful in an audit view. It is not appropriate as unfiltered first-screen copy.

**Why it creates the vibe-coded impression:** The product is displaying the vocabulary of its underlying agent and data processes rather than a deliberately translated user model.

**Fix direction:** Separate operator/debug evidence from reader-facing status. Show the human consequence first; reveal technical provenance on demand.

### 6. Think is information-rich but compositionally undisciplined

**Severity:** High  
**Confidence:** High

Think combines:

- concept navigation
- long open questions
- notebook entries
- a return headline
- overnight updates
- in-motion items
- pending agent outputs
- output templates
- maintenance routines
- a thought-partner composer

On desktop, the page initially held large skeleton regions for several seconds. Once loaded, it became an extremely dense multi-column workspace. On mobile, the entire first viewport is consumed by the left shelf—concepts, long questions, and notebook links—before the main “Think” return experience becomes visible. The document remains viewport-height and relies on an internal scroll region.

**Why it creates the vibe-coded impression:** The surface communicates breadth instead of intent. Nearly every concept receives a visible module, so none becomes the organizing idea.

**Fix direction:** Define Think’s mobile and desktop primary loop separately. A likely mobile order is return prompt → one recommended thread → composer → compact shelf access. Output Studio and maintenance belong behind explicit modes.

### 7. The navigation is cramped and under-sized on mobile

**Severity:** Medium  
**Confidence:** High

At 430 px, the persistent header attempts to retain `Noeis`, the current section, theme, `Connections`, `Settings`, `More`, and account. Several controls are only 34 px high. Many additional links across the product are 16–38 px high, below a comfortable 44 px touch target.

The header technically fits, but it reads as compressed desktop chrome. On Library and Think, important primary navigation items disappear while secondary utilities remain.

**Fix direction:** Establish a mobile navigation hierarchy. Keep brand, current location, and one menu trigger. Move utility destinations into the menu and enforce a 44 px minimum interactive target.

### 8. Typography is distinctive but overextended

**Severity:** Medium  
**Confidence:** High

The editorial serif gives Noeis a recognizable voice, especially on `/proof`. Across the authenticated product, however, display serif, body serif, sans-serif, condensed uppercase labels, and monospace status text compete on the same screen. The Wiki inspection found seven rendered font-family variants and a 15 px body size.

Large display headlines are sometimes used where the information is operational rather than editorial. `/proof` uses a 56 px mobile headline with a line height below its font size; visually strong, but it consumes roughly a quarter of the first viewport before the product explanation begins.

**Fix direction:** Reduce the number of typographic roles. Reserve display serif for page-level editorial meaning, use one body family for reading, and confine monospace to optional provenance detail.

### 9. Semantic and visual hierarchy are not consistently aligned

**Severity:** Medium  
**Confidence:** High

On Wiki and Think, rendered heading order places section-level `h2` elements before the page `h1`. Visually, long claims can compete with or outweigh the actual page title. Controls such as `Still hold`, `Revise`, and `Retire` appear beside paragraph-scale claims without a strong decision frame.

This makes the screens harder to scan and weakens accessibility even when the typography is attractive.

**Fix direction:** Give every page one explicit `h1`, one primary task, and a predictable section order. Long claims should live inside a clearly labeled review object rather than functioning as page-level visual headlines.

## What is working

The site is not devoid of design judgment.

- The warm ivory and navy palette is calm and differentiated.
- `/proof` has a memorable editorial identity and makes a complex product concept feel serious.
- The product avoids the default purple-gradient AI aesthetic on its main authenticated surfaces.
- At the tested 430 px viewport, the reviewed pages did not create page-level horizontal overflow.
- The core concept—knowledge that changes under evidence while preserving human acceptance—is more distinctive than the current interface makes it feel.

These strengths are why the correct diagnosis is not “bad design.” It is **insufficiently unified design**.

## Scorecard

| Dimension | Grade | Assessment |
| --- | --- | --- |
| Visual craft | B- | Several screens are elegant in isolation. |
| Brand coherence | D+ | `/proof` and `/examples` appear to come from different products. |
| Product hierarchy | D+ | Authenticated homes expose too many equally weighted jobs. |
| Responsive design | C- | No horizontal overflow, but mobile collisions and poor recomposition are visible. |
| State integrity | D | Library’s ready, empty, loading, and failure messages conflict. |
| Content clarity | C- | Valuable concepts are obscured by system vocabulary and dense prose. |
| Accessibility ergonomics | C- | Small body text, undersized targets, and heading-order problems recur. |
| AI-slop resistance | C | Stronger than a generic template overall, but `/examples` and the screen-by-screen inconsistency are obvious tells. |
| **Overall design** | **C** | Distinctive raw material without sufficient convergence. |

## Highest-leverage correction sequence

1. **Repair mobile Library and its page-level state model.** These are unambiguous broken-product signals.
2. **Choose one public visual system.** Rebuild `/examples` in the `/proof` editorial language.
3. **Reduce Wiki home to one ranked return action.** Secondary material should support that action, not compete with it.
4. **Recompose Think for mobile.** Do not put the shelf before the main thinking loop.
5. **Create a product-language boundary.** Translate agent, ingestion, repository, and maintenance internals into user consequences.
6. **Normalize navigation, typography, spacing, and touch targets across every surface.**

## Bottom line

The site looks vibe coded because it shows **addition without enough subtraction**. The problem is not that AI helped make it. The problem is that no final design pass appears to have forced every page, state, and breakpoint to obey the same product thesis.

The product needs a convergence pass, not another layer of polish.
