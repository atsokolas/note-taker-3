# Noeis — Highlights → Question / Wiki Section Investigation

**Date:** 2026-06-03
**Scope:** Investigation for Chapter 3a slice — *"Turn these N highlights into a question / wiki section"*
**Related spec:** `docs/noeis-return-loop-roadmap-spec-2026-06-25.md` §3a
**Out of scope:** duplicate/source merge, SystemStatus history, filing classification quality

---

## 1. Executive summary

**Today:** Library already supports *single-highlight* flows — attach to an open question (`LibraryQuestionModal`), add to concept/notebook, and command-palette wiki build from a *topic phrase* (not selected highlight IDs). Bulk highlight selection exists in `LibraryHighlights.jsx` (add-to-concept, delete) but not question/wiki promotion.

**Smallest safe path:** Frontend-only — reuse `POST /api/questions` (with `linkedHighlightIds` + `highlight-ref` blocks) and `POST /api/wiki/pages` (with `createdFrom.type: 'highlight'`, `objectIds`, `initialSourceRefs`, `draft=1` workspace open). No new backend routes; no structure-proposal thread for this slice (direct draft creation is reviewable in Think/wiki workspace).

**Delivered in Phase 2:** Command-palette intents + Library bulk bar actions + shared `highlightToThinkingModel.js`.

---

## 2. Existing highlight selection (Library / article reader)

| Surface | Selection model | Actions today |
|---------|-----------------|---------------|
| `LibraryHighlights.jsx` | Keyboard row + checkbox bulk `Set` (independent of filters) | Add to concept (bulk), delete (bulk), per-row concept/notebook/question modals |
| `LibraryContext.jsx` | Single `activeHighlightId` per open article | Focus, reference pull-in, notebook, concept, question, dump |
| `ArticleReader.jsx` | Text selection overlay (new highlight) | Save highlight, notebook, concept, question on *selection* (not saved highlights) |
| `ArticleViewer.js` (legacy) | Multi-select up to 10 for recommend/share | Not wired to Think/wiki |

Article reading room (`Library.jsx`) passes `activeHighlightId` into `LibraryContext`; bulk selection lives only on the highlights shelf view.

---

## 3. Question creation APIs (Think)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/questions` | Create question — accepts `text`, `conceptName`, `blocks`, `linkedHighlightIds` (`server/routes/conceptQuestionBoardRoutes.js`) |
| `POST /api/questions/:id/add-highlight` | Attach highlight + embed block |

Frontend client: `note-taker-ui/src/api/questions.js` — `createQuestion()` (extended to forward `linkedHighlightIds`).

Existing pattern in `Library.jsx` / `LibraryHighlights.jsx`: one highlight → modal → question with `highlight-ref` block + `add-highlight`.

---

## 4. Wiki section / page creation

| Endpoint | Purpose |
|----------|---------|
| `POST /api/wiki/pages` | Create draft page — `createdFrom`, `sourceScope: 'selected_sources'`, `initialSourceRefs` |
| Wiki workspace `?draft=1` | Opens editable draft shell |

Helpers: `buildWikiCreatePayload` / `buildWikiSourceRef` / `openWikiDraft` in `note-taker-ui/src/utils/wikiCreate.js`.

Command palette already has topic-based wiki build (`parseWikiBuildCommand`) — creates a page from a *search phrase*, not pinned highlight IDs. Chapter 3a slice adds highlight-ID-backed drafts.

---

## 5. Structure proposal patterns (not used for this slice)

Filing (`POST /api/library/filing-suggestions`) stages `AgentStructureProposal` with folder/move ops reviewed in `StructureProposalReview`. Agent `cleanup_structure` intent follows the same path.

**Why skip for highlights→question/wiki:** No existing structure op for `create_question` or `create_wiki_section_from_highlights`. Adding one requires backend proposal execution work. Direct draft creation matches single-highlight modal UX and satisfies "reviewable" via Think question editor / wiki draft workspace.

Future: agent could stage a proposal with suggested question text + highlight set when LLM synthesis is required.

---

## 6. Smallest safe implementation path

```
Option A (command palette)     parseHighlightToQuestionIntent / parseHighlightToWikiSectionIntent
        +                      resolve highlights: topic search OR session bulk context
Option B (Library bulk bar)    "Question draft" / "Wiki section draft" on selected highlights
Option C (both)                ✓ chosen — shared model module, minimal duplication
```

**Highlight context bridge:** When bulk highlights are selected in Library, IDs + snippets are written to `sessionStorage` (`noeis.highlightActionContext`) so command phrasing *"turn these highlights into …"* can resolve without new global React context.

**Receipts:** Follow Chapter 0.5 pattern via `SystemStatusContext` (command palette) — title, summary, href to created question or wiki draft.

**Tests:** Parser/model unit tests + CommandPalette integration tests for intents.

**Gaps (follow-ups):** LLM-drafted question stem from highlight cluster; article-reader multi-select; structure-proposal review path; `createQuestion` client already dropped `linkedHighlightIds` before this slice (fixed).
