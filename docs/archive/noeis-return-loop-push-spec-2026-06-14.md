# Noeis Return Loop Push

Date: 2026-06-14

## Product Thesis

Noeis should prove one claim before it adds more surfaces: it reads the user's corpus, connects ideas across surfaces, maintains the archive, and gives the user a reason to return.

The strongest current experience is the wiki front page as a maintained "Morning Paper": it opens with a fresh agent-authored lead and a page worth reading. The next push should make the rest of the product support that same return loop instead of drifting back into dashboard, filing cabinet, or internal QA console patterns.

## Non-Negotiable Direction

- Prioritize agent intelligence over visual polish when forced to choose.
- Default agent answers should be page-first with automatic related-page expansion.
- Add real suppression/visibility fields for cruft, not only heuristics.
- Library defaults to a reading-room experience; cabinet is secondary.
- Consolidate Connections and Integrations into one user-facing connection center.
- Public sharing for wiki and selected non-library artifacts is in scope for this push.
- Every workstream must include one surprising/magical moment, not only cleanup.

## Workstream 1: Graph-Aware Agent Answers

### Problem

The product promise is an active second brain, but current wiki Q&A can behave like single-page retrieval. If the user asks how one existing concept connects to another existing concept, the agent must traverse the corpus.

### Target Behavior

On a wiki page, asking "How does Loss Aversion connect to Opportunity Cost?" should:

- Start from the open page.
- Detect named related concepts/pages in the question.
- Retrieve the related wiki pages, concept records, highlights, sources, and backlinks when available.
- Answer from multiple corpus objects, not only the selected page.
- Cite the objects used in a compact provenance line such as: `Used 2 wiki pages · 3 highlights · 1 concept`.
- Avoid saying "Answered from the selected wiki page" unless the user explicitly scopes the question to the selected page.

### Magic Moment

When the answer finds a real bridge, the UI should show a concise connective insight before the body:

> Bridge found: Loss aversion explains why hidden opportunity costs feel weaker than visible losses.

The phrasing should be generated from retrieved evidence, not a static template.

### Acceptance Criteria

- Cross-page question on a wiki page retrieves and uses at least two corpus objects when a named related page/concept exists.
- Answer includes provenance by object type.
- Answer remains grounded if no related object exists and states what was searched.
- Unit/integration coverage proves selected-page-only behavior is not the default for cross-page prompts.
- Browser QA captures the answer on a real page.

## Workstream 2: Morning Paper + Think Return Loop

### Problem

The calm Think index model is strong when it uses one orientation lead, one `IN MOTION` stream, one receded `ON THE SHELF`, and a quiet command. Later additions such as separate Return Queue and Updated Stream blocks risk returning the page to dashboard density.

### Target Behavior

Think home and wiki front page should share one return grammar:

- What changed since last time.
- What has pull.
- What needs one action.

Return Queue and Updated Stream should be folded into existing motion/state language instead of separate competing lists.

Examples:

- `CONCEPT · WAITING MATERIAL`
- `QUESTION · RETURNING`
- `NOTE · READY TO REOPEN`
- `WIKI · UPDATED OVERNIGHT`

### Magic Moment

The first visible Think sentence should feel personally authored by the system:

> Your investing thread is warm again: 4 newer sources arrived, and one open question now has enough evidence to answer.

This should be composed from real data, not a generic count sentence.

### Acceptance Criteria

- Think home does not show separate center-column Return Queue and rail Updated Stream lists.
- Motion items can carry return/update states inline.
- Calm grammar remains consistent across home, concepts, questions, and notebook.
- Queued ThoughtPartner prompt behavior remains covered.
- No duplicate h1 regressions.

## Workstream 3: Corpus Maintenance Visibility

### Problem

The wiki front page implies active maintenance, while Library can reveal a mostly unfiled corpus. This undercuts the promise that Noeis tends the archive.

### Target Behavior

Library should honestly show maintenance state and offer a next action:

- Unfiled count.
- Items ready to classify.
- Likely concept candidates.
- Sources needing confirmation.
- Last maintenance action.

The default Library should be a reading room:

- worth reopening
- recently highlighted
- newly imported
- connected to active thinking

Cabinet should become a secondary mode for filing and batch organization.

### Magic Moment

At the top of Library, Noeis should identify one source worth reopening and why:

> Reopen Poor Charlie's Almanack: 27 highlights are now pulling toward Opportunity Cost and Circle of Competence.

### Acceptance Criteria

- Library default is not the cabinet-first filing surface.
- Rows do not repeat generic instructional filler copy when article signal exists.
- Each row prioritizes title, source, date, highlight count, connected concepts, and why it matters/last touched.
- Maintenance state is honest when the corpus is unfiled.
- A clear `Review filing suggestions` path exists.

## Workstream 4: Cruft Suppression

### Problem

Test/debug artifacts on curated surfaces destroy trust. Examples observed across reviews include `TEMP MCP RETEST`, `Blah`, `Test`, `Kevin`, `discard`, `favorite`, and `TEST (8)`.

### Target Behavior

Add real visibility controls for user-facing ranking:

- `hiddenFromHome`
- `debugOnly`
- `archived`
- or equivalent persisted fields by object type where appropriate.

Add temporary heuristics only as a bridge until persisted fields cover the common objects.

### Magic Moment

The system should preserve access without polluting calm surfaces:

> 7 low-signal test items were kept out of your return view.

This belongs in an admin/debug or maintenance affordance, not the main feed.

### Acceptance Criteria

- Primary ranked surfaces exclude obvious test/debug artifacts.
- Hidden items remain searchable or accessible through explicit admin/debug/filter mode.
- The suppression decision is test-covered.
- No ranked Think/Wiki/Library front-door surface displays `TEMP MCP RETEST`, `Blah`, `Test`, or equivalent known fixtures.

## Workstream 5: Connections Consolidation

### Problem

The user-facing model is split across Connections, Integrations, data integrations, agents, imports, MCP, Readwise, Notion, Evernote, OpenClaw, and Hermes.

### Target Behavior

Consolidate into one connection center:

1. Sources
   - Readwise
   - Notion
   - Evernote
   - file/import/paste
2. Agents
   - OpenClaw
   - Hermes
   - Codex
   - Claude Code
   - custom worker
3. Advanced
   - MCP snippets
   - tokens
   - API URL
   - key rotation

Readwise should lead with browser OAuth. API token is fallback/advanced.

### Magic Moment

After connecting a source or agent, the page should say what Noeis can now do:

> Readwise connected. I found 27 highlights that can strengthen 4 active concepts.

### Acceptance Criteria

- `/connections` and `/integrations` no longer present two different user models.
- One route redirects or both routes render the same consolidated connection center.
- Readwise OAuth is the primary CTA.
- API token flow is advanced/fallback copy.
- Agent setup retains the simple `skill.md` / one-command flow.

## Workstream 6: Public Sharing

### Problem

The user wants to share wikis and selected non-library artifacts publicly, including with people who do not have accounts. Library itself should remain private by default.

### Target Behavior

Support public sharing for:

- wiki pages
- selected concept pages
- selected question pages or answer artifacts, if product-ready

Do not expose:

- private Library source list
- raw highlights unless explicitly included
- private notes unless explicitly included

### Magic Moment

The share preview should feel like publishing a maintained page, not dumping internal state:

> Public page ready: citations included, private source notes withheld.

### Acceptance Criteria

- Public wiki page URL works logged out.
- Private library/source data is not exposed by default.
- Share state can be toggled off.
- Public page has appropriate title, readable typography, and no app chrome requiring auth.
- Browser QA verifies logged-out access.

## Workstream 7: Trust Polish

### Problem

Small details are breaking the spell: inert `MORE`, missing spaces in shared rail headers, delayed wiki load, filler row text, and occasional narrow-width risk.

### Target Behavior

Fix only polish that directly supports trust:

- `MORE` opens something useful or is removed.
- Shared rail headers render proper spacing.
- Wiki has a meaningful loading state.
- Library rows avoid boilerplate filler.
- No horizontal clipping at desktop, tablet, and Safari-sidebar widths.

### Magic Moment

The loading state should not be generic skeleton only. It should say what the product is doing:

> Checking overnight edits and drift signals...

### Acceptance Criteria

- Browser QA at desktop and Safari-sidebar-like width.
- No obvious clipping.
- No inert top-nav actions.
- No duplicated or placeholder copy in primary rows.

## Delegation Plan

### Codex Owns

- Graph-aware agent retrieval design and implementation.
- Return-loop grammar decisions.
- Corpus maintenance data model and API contract.
- Public sharing architecture/security boundaries.
- Final integration and product QA.

### Cursor Candidates

- Cruft suppression fields and tests once schema/API contract is defined.
- Shared row-copy cleanup in Library.
- `MORE` action removal or menu wiring.
- Shared rail header spacing bug.
- Narrow-width CSS verification.

### Grok Build Candidates

- Product critique of revised Think home after Return Queue/Updated Stream are folded into motion.
- Library row redesign critique: reading room versus cabinet.
- Connections center information architecture critique.
- Public wiki share page critique against Notion/Readwise/Substack-style sharing expectations.

## Suggested Cursor Prompt

Implement the low-risk trust-polish slice for the Noeis Return Loop Push from `docs/noeis-return-loop-push-spec-2026-06-14.md`.

Scope only:
- Fix the shared rail header spacing issue such as `Thought partnerLibrary context visible`.
- Make the top-nav `MORE` action either open a small useful menu or remove it from the nav if no menu exists.
- Remove repeated generic Library row filler copy when an article has better available signal; do not redesign Library layout.
- Add focused tests for these changes.

Do not touch graph-aware agent retrieval, public sharing, Readwise OAuth, or Think home return-loop structure. Run the relevant unit tests plus `CI=true npm run build`.

## Suggested Grok Build Prompt

Review `docs/noeis-return-loop-push-spec-2026-06-14.md` as a product/design critic, not as an implementer.

Focus on:
- Whether folding Return Queue and Updated Stream into `IN MOTION` preserves the calm front-door model.
- Whether the Library target feels like a reading room rather than a cabinet.
- Whether the consolidated Connections model is understandable to a non-technical user.
- Whether the public sharing scope is compelling enough without exposing private library material.
- One magical/surprising detail that should be required in each surface.

Return a prioritized critique: what to keep, what to cut, what is over-scoped, and what would make the product feel meaningfully better than Readwise, Notion, Obsidian, or Mem.

## Verification Gate

This push is not done until:

- A cross-page agent question returns a cited answer using multiple corpus objects.
- Think front-door ranked surfaces do not show known test/cruft artifacts.
- Library default reads like maintained saved work, not raw imports.
- One consolidated connection center is live.
- At least one public wiki page can be viewed logged out.
- Every workstream includes its magic moment or an explicit explanation for why it was deferred.
- Browser QA passes desktop and Safari-sidebar-like widths.
- Relevant tests pass.
- `CI=true npm run build` passes.
