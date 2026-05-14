# PRD — LLM-Native Wiki Reshape

**Owner:** Athan
**Status:** Proposal
**Source spec:** Karpathy, "LLM Wiki" — https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
**Related shipped work:** PRs #30, #31, #32, #33, #34, #35, #36, #37 (current wiki primitives)

---

## 1. Problem

The current Noeis wiki ships nearly all of Karpathy's *capabilities* (claim atoms with citations, ambient agent presence, ask-this-page Q&A, daily briefing, what-changed-since-last-visit banner, backlinks panel, "linkable pages here" panel, daily index briefing) but lays them on top of the wrong primitive: **a Notion-style rich-text editor with a blinking cursor inviting the user to type.**

Karpathy's pattern is the inverse of that primitive:

> "The LLM writes and maintains all of [the wiki]. You're in charge of sourcing, exploration, and asking the right questions… Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."

The capabilities we built are real wins, but they decorate a writer's tool. The user opens a wiki page and is asked to author it. Nothing about the surface communicates "this is a Wikipedia article that the LLM keeps current; your job is to read, drop sources, and ask questions."

This PRD reshapes the wiki around the correct primitive — a **reading-first, link-rich, agent-authored knowledge surface** — and migrates the existing capabilities into their proper positions.

## 2. Thesis (one line)

**The LLM is the writer. The user is the reader, sourcer, and questioner. Every UI decision flows from this stance.**

## 3. Goals

1. A wiki page opens in **read mode** by default — Wikipedia/Tolkien-Gateway-shaped, not Notion-shaped.
2. The agent's writing contains **inline `[[wiki-links]]`** that render as actual hyperlinks in the prose, with hover previews of the destination page. (We already have the data via the autolinks service; we just don't render it inside the body.)
3. A **graph view** is the index — a force-directed map of the wiki where the user can see hubs, orphans, and clusters at a glance.
4. **One top-level "drop a source" affordance** that triggers Karpathy's 10-15-pages-touched magic. The agent decides which pages to update from a single source ingest.
5. Great answers to "ask this page" questions can be **promoted to standalone wiki pages** with one click.
6. A **schema editor** (CLAUDE.md-shaped settings page) where the user co-evolves the agent's wiki conventions over time.
7. All currently-shipped capabilities (claim atoms, ambient presence, briefing, etc.) survive the reshape and attach to the new primitive.

## 4. Non-goals

- Replacing Library, Notebook, or Concepts — those stay. The wiki is a **synthesis layer above** the existing library, not a replacement for it.
- Multi-user collaboration on a single wiki page (lock contention, real-time presence, etc.). Single-user for now.
- A general markdown editor that competes with Notion / Obsidian. Edit mode is a fallback, not the focus.
- Auto-publishing to a public surface (sharing the wiki publicly is a future concern — `/share/concepts/:slug` is the model when we get there).
- Building our own search engine over markdown files. Existing search across the user's library covers it.
- Mobile-first design for v1. Desktop-first; mobile is a follow-up.

## 5. Users and jobs

**Primary user:** Athan (and individual researchers / serious readers like him). Curates sources, has opinions, wants the agent to do the bookkeeping.

**Jobs (in order of frequency):**

| Job | Today's flow | Reshape flow |
|---|---|---|
| Read about a topic I've been building knowledge on | Open wiki page → see editor → struggle to read past chrome | Open wiki page → see Wikipedia-shaped article → read |
| Drop a new source into the wiki | Save in Library → navigate to wiki page → open form → fill in fields → attach to one page | Save in Library or paste URL → "Feed to wiki" → agent decides which 10-15 pages to update |
| Find a related concept I've written about | Read prose → eyes drift to right rail → scan "linkable pages here" → click | Click an inline link in the prose → land on related page |
| See what I've built across the whole wiki | Open `/wiki` → grid of cards filtered by 3 dropdowns | Open `/wiki` → graph of pages-as-nodes → see hubs and orphans |
| Ask a question about my knowledge base | Open relevant page → bottom composer → answer locked into discussion thread | Ask from anywhere → answer renders → "save as wiki page" → joins the wiki |
| Teach the agent how I want my wiki organized | (no surface) | Settings → Wiki schema → text editor → co-evolve with agent |

## 6. The five moments (functional requirements)

### 6.1 Read mode (the default)

**Layout:**
- Header: page title (serif display), eyebrow showing page type, a subtle infobox row with `Type · Sources count · Last reviewed · Word count`.
- Body: serif typography, generous line-height, max-width ~720px. Inline `[[wiki-links]]` rendered as underlined hyperlinks; hover any link → 250ms delay → preview card with destination page title + first paragraph + source count.
- Left sidebar (desktop only, collapses on narrow viewports): auto-generated table of contents from H2 / H3 headings. Active section highlights as user scrolls.
- Right sidebar: structured infobox per page type (e.g. for `entity` → role / born / key claims; for `concept` → definition / first-seen / contradictions; for `source` → author / date / URL / takeaways). Below the infobox: existing claim health summary, source list, backlinks ("Mentioned in N pages").
- Footer: backlinks rendered as a Wikipedia-style "Mentioned in" list (replacing the current sidebar rail's home).
- No blinking cursor. No editor chrome by default.

**Edit affordance:**
- `e` keystroke or a small "Edit" button in the topline drops into the existing tiptap editor (current PR #30+ wiki page editor).
- `Esc` or "Done editing" returns to read mode.
- Edit mode preserves all current chrome (ambient presence, ask composer, discussions, etc.).

**Acceptance:**
- Default view is read mode. Tests assert the cursor is not present in the DOM until edit mode is engaged.
- All inline `[[link]]` text renders as a `<Link>` component with the destination page id.
- Hover preview triggers within 250ms; dismisses on mouseout with 100ms grace period for moving into the preview itself.

### 6.2 Inline `[[wiki-links]]` written by the agent

**Pipeline:**
1. The maintenance service (when drafting / rewriting page body) writes `[[Page Title]]` markers wherever a known wiki page title appears in the prose.
2. We add a TipTap `wikiLink` mark with attributes `{ pageId, slug, title }`.
3. The maintenance service post-processes the doc: for every plain text occurrence of a known title (case-insensitive, word-boundary), wrap it in the `wikiLink` mark with the resolved pageId.
4. Read mode renders `wikiLink` marks as `<Link to={`/wiki/${pageId}`}>`. Hover triggers the preview card.
5. Edit mode preserves the marks; the user typing replaces or breaks them as expected.
6. A small "Linkify" button on the edit toolbar runs the autolink pass on demand.

**Acceptance:**
- After a maintenance run, the body contains at least one `wikiLink` mark per matching title (verified by walking the doc).
- Read mode renders these as clickable links with no extra markup leaking through.
- The rail-side "Linkable pages here" panel from PR #37 stays as a fallback for the empty-prose / new-draft case but is hidden when inline links are present and resolved.

### 6.3 Graph view as the index

**New route:** `/wiki` becomes the graph view. The card grid moves to `/wiki/list` as a fallback.

**Layout:**
- Full-width canvas with force-directed layout (`react-force-graph-2d` or hand-rolled with `d3-force`).
- Nodes = wiki pages. Edges = links (inline `wikiLink` marks + maintenance-derived "related" edges).
- Node size scales with inbound link count.
- Node color encodes page type (entity / concept / source / synthesis / question / topic).
- Hover a node → tooltip with title, type, last touched.
- Click a node → opens that page in read mode.
- Right rail filters: page type, modified-within (24h / 7d / 30d / all), drift status.
- Top: the existing daily briefing card (PR #34) remains as the editorial summary above the graph.
- Bottom-left: a small legend showing what node colors mean.
- Performance budget: should render up to 500 nodes / 2000 edges at 60fps.

**Acceptance:**
- Graph loads in <1s for a wiki with up to 200 pages.
- Click any node navigates to `/wiki/:id`.
- Filters update the graph in <200ms.
- Mobile: graph degrades gracefully to the card grid (under 720px viewport).

### 6.4 "Drop a source" pipeline

**Affordance:** A persistent composer at the top of `/wiki` (above the graph): "Paste a URL, drop an article, or pick a library item."

**Backend:**
- New endpoint: `POST /api/wiki/ingest` taking `{ source: { type, objectId | url | text } }`.
- The agent reads the source, decides which existing wiki pages it affects, and queues maintenance runs against each. Returns an "ingest run" id.
- Ingest run record: `{ runId, sourceRef, affectedPageIds, summary, status, startedAt, completedAt }`.

**Frontend:**
- After submission, a non-modal toast shows: "Reading [source title]… 0 / 5 pages updated so far. View details →"
- "View details" opens an ingest run page: timeline of which pages were touched, what changed in each, links to open the diff in each.
- Ingest runs are listed on the new "Activity" tab of `/wiki` (timeline-shaped — Karpathy's `log.md`).

**Acceptance:**
- A user can paste a URL and trigger an ingest without leaving `/wiki`.
- The agent updates ≥1 wiki page when the source is relevant; 0 pages and a "no relevant pages — should I create one?" prompt when it isn't.
- The ingest run shows up in the activity log within 2s of completion.

### 6.5 Promote answer to wiki page

**Affordance:** Every Q&A turn in the existing discussions log (PR #32) gains a "Save as wiki page" button.

**Behavior:**
- Click → modal asks for the new page title (pre-filled with a 2-3 word slug derived from the question).
- Agent runs a "convert answer to wiki page" pass: rewrites the answer as a standalone page (drops "you asked X" preamble; promotes citations to inline marks; runs the autolink pass).
- New page is created; agent runs maintenance against neighboring pages so the new page gets backlinks.
- User is navigated to the new page in read mode.

**Acceptance:**
- Saved page renders in read mode immediately, with claim citations preserved.
- Backlinks update on referenced pages within one maintenance pass.

### 6.6 Schema editor

**Surface:** Settings → Wiki schema. Plain text editor (markdown).

**Behavior:**
- Default content: a CLAUDE.md-shaped scaffold ("Page types I want… Ingest workflow… Voice and tone… What to flag in lint…")
- Content is appended to the system prompt of every maintenance / ingest / ask call.
- Versioned: every save creates a snapshot; user can revert.
- A "let the agent suggest changes to the schema" button kicks off a meta-maintenance pass: agent reads recent ingest history and proposes schema updates ("you keep manually re-categorizing X as Y; should I add a rule?").

**Acceptance:**
- Schema content reaches the agent on the next ingest / maintenance call (verified end-to-end with a test prompt).
- Schema is at most 8000 characters (truncate with warning past that).

## 7. Phasing

Three releases, each shippable independently and behind a feature flag (`wiki.read_mode_v2`).

### Release R1 — The reading surface (the spine)

| | |
|---|---|
| **PR R1.1** | Read mode layout. Open page in read mode by default. TOC sidebar. Infobox. Edit toggle that drops into existing tiptap editor. Feature-flagged. |
| **PR R1.2** | Inline `[[wiki-links]]` end-to-end. TipTap `wikiLink` mark. Maintenance service emits them. Read mode renders as `<Link>`. Hover preview. |
| **PR R1.3** | "Mentioned in" footer that replaces the backlinks rail in read mode. (Backlinks rail stays in edit mode.) |

After R1: a wiki page feels like a Wikipedia article that the LLM keeps current. This is the moment the user opens a page and goes "yes, this is what I wanted."

### Release R2 — The graph + the ingest

| | |
|---|---|
| **PR R2.1** | Graph view as `/wiki`. Card grid moves to `/wiki/list`. Daily briefing stays at top. |
| **PR R2.2** | "Drop a source" composer at top of `/wiki`. Backend ingest endpoint. Toast + activity log. |
| **PR R2.3** | Activity log tab — chronological timeline of every ingest, query, maintenance run. Karpathy's `log.md`. |

After R2: the wiki looks alive *as a whole*, not just per page. The user sees the shape and the activity.

### Release R3 — Compounding queries + co-evolved schema

| | |
|---|---|
| **PR R3.1** | "Save answer as wiki page" on every Q&A turn. |
| **PR R3.2** | Schema editor in Settings. System-prompt integration. Versioning. |
| **PR R3.3** | "Agent suggests schema updates" meta-maintenance pass. |

After R3: every great answer compounds back into the wiki. The user can teach the agent how their wiki should be organized.

## 8. What survives, what migrates, what dies

| Component | Status |
|---|---|
| **Claim mark + citation popover (PR #30)** | Survives unchanged. Renders in both read and edit mode. |
| **Ambient agent presence (PR #31)** | Survives, repositioned. In read mode it becomes a small dot in the page header next to the title. |
| **Ask this page composer + discussions (PR #32)** | Survives. In read mode the composer is at the bottom of the page; discussions render as a "Talk" tab next to "Article" (Wikipedia-style). |
| **Changes since last visit banner (PR #33)** | Survives, moves to the top of read mode. |
| **Daily briefing card (PR #34)** | Survives, moves above the graph view in `/wiki`. |
| **Backlinks panel (PR #35)** | Migrates. The data stays. Render becomes the "Mentioned in" footer of read mode. The right-rail panel only shows in edit mode. |
| **QA cleanup (PR #36)** | Survives. |
| **Linkable pages here panel (PR #37)** | Migrates. The data feeds the inline `[[wiki-links]]` pipeline. The right-rail panel only shows in edit mode (as a fallback for unlinked drafts). |
| **Page meta bar (current dropdowns)** | Demoted. In read mode the page type is displayed as an eyebrow + infobox. The dropdowns only appear in edit mode. |
| **Card grid index (current `/wiki`)** | Migrates to `/wiki/list` as a fallback view. Graph becomes default. |

## 9. Acceptance criteria for the spine (R1)

To call R1 done, all of the following must be true:

1. Opening any wiki page goes to read mode by default. The user does not see a cursor or input field unless they engage edit mode.
2. The page renders with: serif body, TOC sidebar (≥2 H2 headings), infobox top-right (page type + sources + last reviewed).
3. Inline `[[Page Title]]` markers from the agent render as clickable `<Link>` components with hover previews.
4. Pressing `e` or clicking "Edit" enters edit mode (the existing tiptap editor) without losing scroll position.
5. The "Mentioned in" footer renders backlinks at the bottom of every page that has them.
6. All existing components (claim popover, ambient presence, briefing, ask composer, discussions, changes banner) work in both modes without regression.
7. Feature flag `wiki.read_mode_v2` defaults to off; setting it to on enables the new surface for the user. Tests run with the flag on.
8. All existing wiki + claim + visit-tracker tests still pass.
9. Build clean.

## 10. Open questions

1. **TipTap link extension.** No `@tiptap/extension-link` installed today. R1.2 needs either that package or a custom `wikiLink` mark. Custom mark is cleaner (no broad CSS surprises) but ~150 LoC of work. Decision: **custom mark**, modeled after the existing `Claim` mark.
2. **Hover preview implementation.** Single-source-of-truth question: does the preview re-fetch the page each time, or do we maintain a small client-side cache? Decision pending — start with re-fetch, add cache if it feels slow.
3. **Graph rendering lib vs. hand-roll.** `react-force-graph-2d` is ~300KB; hand-rolled `d3-force` is more work but lighter. Open. Probably start with the lib for speed.
4. **What page types do we support in v2?** Today: `topic / question / project / source / person / synthesis`. Karpathy implies `entity / concept / source / comparison / overview / log`. Need to reconcile. Probably: keep current set, add `entity` and `comparison`, fold `synthesis` into `concept`.
5. **Schema editor: free-form markdown vs. structured form?** Free-form is closer to Karpathy's intent. Risk: users won't write good schemas. Decision: free-form with a templated default.

## 11. Risks

| Risk | Mitigation |
|---|---|
| **R1 breaks the existing editor flow** users rely on | Behind a feature flag. Edit mode is one keystroke away. |
| **Inline `[[wiki-links]]` look broken on pages where the agent hasn't run autolink yet** | The autolink pass runs as part of every maintenance call after R1.2 lands. Pages that haven't been touched since show no inline links — they fall back to the rail. |
| **Graph view performance on large wikis** | 500-node budget for v1. Beyond that, switch to clustered/aggregated rendering. Document in code. |
| **"Drop a source" agent makes too many bad page edits** | Ingest runs are reversible — every maintenance pass already snapshots before/after via `wikiRevisionService`. Add a one-click "undo this ingest" on the activity log. |
| **Parallel-agent injection problem keeps making PRs painful** | This has been a persistent friction during the wiki PRs. Worth a separate hardening pass on the agent harness — out of scope for this PRD but flagging. |

## 12. Success metrics

How do we know the reshape worked?

- **Qualitative (must-have):** Athan opens a wiki page and the first reaction is "yes, this is a wiki" not "this is a Notion doc with helpers." Measured by his own gut and by looking at session recordings.
- **Behavioral (six weeks post-ship):**
  - Time spent in read mode vs. edit mode > 4:1 (currently ~0:1 because read mode doesn't exist).
  - Ingest events per week > 5 (currently ~0 because the affordance doesn't exist).
  - Q&A turns promoted to wiki pages > 0 (currently impossible).
  - Number of wiki pages with ≥3 inline `wikiLink` marks in their body > 50% of all wiki pages.
- **Non-metric proof:** the wiki should pass the "stranger test" — someone who has never used Noeis should be able to open `/wiki` and intuitively know what it is, by analogy to Wikipedia.

---

## Appendix A — Karpathy's three-line spec (for reference)

> "Most people's experience with LLMs and documents looks like RAG… The idea here is different. Instead of just retrieving from raw documents at query time, the LLM **incrementally builds and maintains a persistent wiki**."
>
> "**You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it.** You're in charge of sourcing, exploration, and asking the right questions."
>
> "**Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase.**"
