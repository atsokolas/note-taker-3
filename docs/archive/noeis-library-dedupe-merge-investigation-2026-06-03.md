# Noeis Library — Duplicate / Source Merge Investigation

**Date:** 2026-06-03
**Scope:** Investigation only (Chapter 3a, roadmap spec)
**Related spec:** `docs/noeis-return-loop-roadmap-spec-2026-06-25.md` §3a

---

## 1. Executive summary

**What exists today**

- **Import dedupe** skips duplicate highlights (exact text or Readwise `externalId`) and reuses articles keyed by `url` per user.
- **Library filing (partial 3a)** stages reviewable folder moves via `POST /api/library/filing-suggestions` → `AgentStructureProposal` with LLM/regex classification, source-quality labels, per-item rationale, and bulk accept/reject in `StructureProposalReview`.
- **Structure proposal execution** applies folder CRUD and `move_item` for library articles; `merge_folder` collapses folders, not articles.
- **Graph/backlink plumbing** links highlights to notebook entries, questions, collections, wiki `sourceRefs`, and `ReferenceEdge` — all keyed by highlight/article ObjectIds.

**What Chapter 3a still needs**

- **Duplicate detection** across articles (same book from Readwise CSV vs API, `import://` synthetic URLs vs real URLs, title/author collisions).
- **Reviewable merge proposals** combining highlights, re-pointing backlinks, choosing canonical metadata, and archiving/deleting the loser.
- **UI** to review merge pairs with overlap evidence (shared highlight text, URL host, title similarity).

**Bottom line:** Reuse the structure-proposal + filing review stack; add detection + a new `merge_item` (or `merge_articles`) operation and execution path. Do not extend `merge_folder` for article dedupe.

---

## 2. Data model inventory

### 2.1 Article (`server/models/index.js`)

There is **no separate Source model** — Article is the source record.

| Field | Location | Dedupe relevance |
|-------|----------|------------------|
| `url` | ```129:129:server/models/index.js``` | Primary identity; **unique index** `{ url: 1, userId: 1 }` at ```160:160:server/models/index.js``` |
| `title` | ```130:130:server/models/index.js``` | Fuzzy match; text index weight 8 |
| `author` | ```151:151:server/models/index.js``` | Metadata; searchable in bridge corpus |
| `siteName` | ```153:153:server/models/index.js``` | Closest to “source name”; UI derives label from this or URL host |
| `publicationDate` | ```152:152:server/models/index.js``` | Weak dedupe signal |
| `content` | ```131:131:server/models/index.js``` | Full text; embedding input |
| `folder` | ```132:132:server/models/index.js``` | Filing state; not dedupe |
| `importMeta` | ```154:154:server/models/index.js``` | Provenance — see below |
| `highlights[]` | ```134:149:server/models/index.js``` | Embedded subdocs with own `_id`, `importMeta` |

**Not present:** `canonicalUrl`, `sourceName` (use `siteName` + `importMeta.sourceLabel`).

### 2.2 `importMeta` (article + highlight)

Shared schema at ```106:125:server/models/index.js```:

| Subfield | Dedupe use |
|----------|------------|
| `provider` | `readwise`, `manual`, `evernote`, etc. |
| `sourceType` | `csv`, `api`, `text`, `enex` |
| `sourceLabel` | Human label (connection name, filename) — UI “source name” |
| `sourceUrl` | Original URL when distinct from article `url` |
| `externalId` | Readwise book/highlight id — **highlight dedupe key** |
| `importSessionId` | Tie to import batch / structure proposal |
| `importedAt` | Recency |

### 2.3 Highlight (embedded on Article)

```134:149:server/models/index.js```

- Subdocument `_id` (Mongo-generated)
- `text`, `note`, `tags`, `anchor`, `claimId`
- Per-highlight `importMeta` (same schema)
- Indexed: `{ userId, 'highlights._id' }`, text search on `highlights.text`

**No cross-article highlight table** — overlap must be computed by loading candidate article pairs or aggregating.

### 2.4 Folder

```96:104:server/models/index.js``` — `{ name, userId }`, unique per user. Articles reference via `folder` ObjectId.

### 2.5 Related models (merge side effects)

| Model | Link to articles/highlights |
|-------|----------------------------|
| `NotebookEntry.linkedArticleId`, `linkedHighlightIds` | ```231:232:server/models/index.js``` |
| `Question.linkedHighlightIds` | ```848:848:server/models/index.js``` |
| `Collection.articleIds`, `highlightIds` | ```1695:1696:server/models/index.js``` |
| `ReferenceEdge` (targetType `article` \| `highlight`) | ```1656:1665:server/models/index.js``` |
| `WikiPage.sourceRefs` (type `article` \| `highlight`) | ```314:328:server/models/index.js``` |
| Embeddings (`objectType: article` \| `highlight`) | `articleToEmbeddingItems.js`, `highlightToEmbeddingItem.js` |

Any merge must **re-point these** or orphaned refs break wiki, notebook, and search.

---

## 3. Existing APIs / routes

### 3.1 Library filing (reusable for 3a proposals)

| Route | File | Purpose |
|-------|------|---------|
| `POST /api/library/filing-suggestions` | `server/routes/libraryFilingRoutes.js` | Stage filing proposal + receipt |
| `GET/PATCH/POST …/apply/reject/rollback` | `server/routes/agentStructureProposalRoutes.js` | Review lifecycle |

Filing service: `server/services/libraryFilingService.js`

- Loads unfiled articles with highlights (```381:394:server/services/libraryFilingService.js```)
- Builds `move_item` + `create_folder` ops with rationale, confidence, `sourceQuality`, `highlightCount` (```154:225:server/services/libraryFilingService.js```)
- Creates `AgentStructureProposal` with `scopeRef: 'library-filing'` (```396:428:server/services/libraryFilingService.js```)

### 3.2 Import structure proposals

`server/services/importStructureProposals.js` — post-import batch moves into `{provider} articles` / `{provider} notes` folders. Same proposal model, `scope: 'import_session'`.

### 3.3 Article CRUD / moves (no merge)

| Route | File:line | Notes |
|-------|-----------|-------|
| `POST /save-article` | ```159:219:server/routes/legacyContentRoutes.js``` | Upsert by `{ url, userId }`; sets title, author, siteName |
| `GET /api/articles/by-url?url=` | ```436:455:server/routes/legacyContentRoutes.js``` | Lookup by exact url |
| `PATCH /articles/:id/move` | ```484:516:server/routes/legacyContentRoutes.js``` | Folder only |
| `DELETE /articles/:id` | ```457:475:server/routes/legacyContentRoutes.js``` | Deletes embeddings for article + highlights |
| `GET /api/articles` | ```306:358:server/routes/legacyContentRoutes.js``` | List with scope, text search on title/url/siteName |
| Highlight CRUD | `server/routes/highlightMutationRoutes.js` | Per-article mutations |

### 3.4 Folder routes

`server/routes/legacyContentRoutes.js` ```221:290``` — GET/POST/DELETE folders (no rename route here; rename via structure proposals).

### 3.5 Structure proposal operation types

Enum at ```1554:1557:server/models/index.js```:

`create_folder | rename_folder | move_item | merge_folder | delete_folder`

Execution: `server/services/agentStructureExecution.js` — library adapter supports folder ops + `move_item`; **no article merge**.

### 3.6 Import duplicate handling (highlight-level only)

Readwise CSV (```1347:1351:server/routes/importRoutes.js```): skip if highlight text already on article.

Readwise API (```1985:1992:server/routes/importRoutes.js```): skip if `importMeta.externalId` matches or text matches.

Article creation: `Article.findOne({ userId, url })` — **different URLs → separate articles** even for same title (e.g. missing URL → `import://readwise/...` at ```1311:1314:server/routes/importRoutes.js```).

### 3.7 Agent intents

- `cleanup_structure` — filing/organization (`collaborativeAgentService.js` ~1797)
- `find_duplicates` skill — notebook/concepts/workspace (`agentSkillCatalog.js` ```291:329:server/services/agentSkillCatalog.js```), **surfaces exclude library**

### 3.8 Wiki merge (reference pattern, not library)

`POST /api/wiki/proposals/:proposalId/merge` in `wikiRoutes.js` — merges wiki *pages*, not library articles.

---

## 4. Highlight overlap — how to compute from existing data

### 4.1 What exists

1. **Exact text match** (import uses this): `(article.highlights || []).some(h => h.text === highlightText)`
2. **External id match** (Readwise API): `highlight.importMeta.externalId`
3. **Embeddings**: separate vectors per highlight (`highlightToEmbeddingItem.js`) and article (`articleToEmbeddingItems.js`) — semantic similarity possible via existing `semanticSearch` (used in `conceptAgentService.js`)
4. **Token overlap utility**: `tokenOverlap()` in `wikiProposalService.js` ```97+``` — used for wiki page dedupe candidates ```277:307:server/services/wikiProposalService.js```
5. **Cross-article highlight listing**: `GET /api/highlights/all` aggregates all highlights with `articleId` (```557:576:server/routes/legacyContentRoutes.js```)

### 4.2 Proposed overlap signals (no new schema required for v1)

| Signal | Computation |
|--------|-------------|
| **Exact highlight overlap** | Normalize whitespace; count intersection of highlight texts between article A and B |
| **External id overlap** | Match `highlights[].importMeta.externalId` across articles |
| **URL equivalence** | Normalize URLs (strip www, trailing slash, http/https); compare `url`, `importMeta.sourceUrl` |
| **Title similarity** | `tokenOverlap(titleA, titleB)` ≥ 0.8 (wiki proposal threshold) |
| **Author + title** | Same author string + high title overlap |
| **Synthetic url cluster** | Group `import://readwise/*` with same slug base or same `importMeta.externalId` |
| **Semantic** (optional v2) | Embedding cosine similarity on article title+snippet or highlight sets |

### 4.3 Backlink blast radius

Before merge, query:

- `GET /api/articles/:id/references` and `/backlinks` (```34:108:server/routes/referenceBacklinkRoutes.js```)
- NotebookEntry / Question / Collection / WikiPage.sourceRefs by highlight/article ids

Overlap score alone is insufficient — high backlink count on the “losing” article raises merge risk.

---

## 5. Gaps for agent-suggested merge proposals

| Gap | Detail |
|-----|--------|
| **No duplicate candidate API** | Nothing like `GET /api/library/duplicate-candidates` |
| **No merge operation type** | Structure proposals cannot express “merge article B into A” |
| **No merge executor** | `agentStructureExecution` has no highlight consolidation, ref rewiring, or canonical url pick |
| **No canonical URL field** | Merging two real URLs requires choosing survivor `url` or adding `canonicalUrl` |
| **URL uniqueness constraint** | `{ url, userId }` unique — loser must be deleted or url changed before survivor upsert |
| **No UI for merge review** | `StructureProposalReview` only labels folder ops (```35:41:note-taker-ui/src/components/agent/StructureProposalReview.jsx```) |
| **Agent skill scope** | `find_duplicates` excludes library surface |
| **Import does not merge articles** | Different URLs create duplicate articles for same source |
| **No normalized URL index** | Exact `url` match misses `http` vs `https`, trailing slashes |

---

## 6. Smallest backend + UI slice (recommendation)

### 6.1 Backend

1. **`libraryDedupeService.js`** (new)
   - `findDuplicateCandidates({ userId, limit, minOverlap })` — scan recent/imported articles
   - Pair scoring: exact highlight overlap count + title token overlap + url host match
   - Return pairs with evidence payload

2. **`POST /api/library/merge-suggestions`** (mirror `libraryFilingRoutes.js`)
   - Calls detection + stages `AgentStructureProposal` with `scopeRef: 'library-dedupe'`
   - Operations: new type **`merge_item`** (or extend payload on a dedicated type)

3. **Extend `agentStructureProposalOperationSchema.type` enum** with `merge_item`

4. **`applyMergeItem` in `agentStructureExecution.js`**
   - Input: `sourceArticleId`, `destinationArticleId`, `canonicalFields` (title, url, author, siteName)
   - Steps: merge highlights (dedupe by text + externalId), re-point `linkedHighlightIds` / collections / wiki sourceRefs / ReferenceEdge, move folder if needed, delete source article + re-queue embeddings
   - `undoPayload`: snapshot both articles pre-merge (for rollback)

5. **Optional: `GET /api/library/duplicate-candidates`** for Library UI preview without staging

### 6.2 Operation payload shape (minimal)

```json
{
  "type": "merge_item",
  "targetDomain": "library",
  "payload": {
    "sourceArticleId": "...",
    "destinationArticleId": "...",
    "canonicalUrl": "https://...",
    "canonicalTitle": "...",
    "reason": "12 shared highlights; same Readwise book",
    "overlapCount": 12,
    "overlapMethod": "exact_text"
  },
  "preview": {
    "sourceTitle": "...",
    "destinationTitle": "...",
    "sourceHighlightCount": 15,
    "destinationHighlightCount": 27,
    "sharedHighlightCount": 12
  },
  "risk": "medium"
}
```

### 6.3 UI

- **Extend `StructureProposalReview`** — add `merge_item` to `OPERATION_LABELS`, `describeOperationTitle`, evidence chips (overlap count) via `structureProposalReviewModel.js`
- **Entry points:** Library reading-room maintenance block (alongside filing); command palette intent “clean up duplicate sources”; post-import receipt when `duplicateSkips === 0` but article count suggests url-split dupes
- **Review surface:** existing Think thread + `ThoughtPartnerPanel` (```1412:1422:note-taker-ui/src/components/agent/ThoughtPartnerPanel.jsx```) — no new page required for v1

### 6.4 Test plan outline

1. **Unit:** pair detection with fixtures (same title, different `import://` urls, overlapping highlights)
2. **Unit:** `applyMergeItem` — highlights merged, duplicate text skipped, loser deleted
3. **Unit:** backlink rewiring (notebook `linkedHighlightIds`, collection `articleIds`)
4. **Contract:** `POST /api/library/merge-suggestions` → pending proposal; apply → one article remains
5. **Rollback:** apply then rollback restores two articles (if undo implemented)
6. **E2E:** Readwise import creating url-split dupes → merge suggestion → accept → single article in Library
7. **Regression:** filing proposals (`library-filing` scope) unchanged

---

## 7. Risks / constraints

| Risk | Mitigation |
|------|------------|
| **Data loss on merge** | Review-only proposals; medium risk flag; preview both sides; undo snapshots |
| **Canonical URL conflicts** | User picks survivor in review; don’t auto-pick when both are real https URLs |
| **Unique url index** | Delete or re-url loser before saving merged canonical url |
| **Orphaned wiki/notebook refs** | Mandatory rewiring pass; integration test with linked highlights |
| **Embedding drift** | Re-queue upsert for survivor, delete loser ids (pattern in article delete ```465:473:server/routes/legacyContentRoutes.js```) |
| **False positives** | Same author different editions — require minimum overlap count + rationale; LLM optional v2 |
| **PDF attachments** | Articles have `pdfs[]` — merge must concatenate or pick; not handled by filing today |
| **Claim-tagged highlights** | `claimId` on highlights — preserve when merging |
| **Performance** | O(n²) naive pairing expensive; scope to import session articles or unfiled/recent batch |

---

## Appendix: Field trace quick reference

| Spec field | Actual location |
|------------|-----------------|
| `url` | `Article.url` ```129:129:server/models/index.js``` |
| `canonicalUrl` | **Does not exist** — use `Article.url` or add field |
| `title` | `Article.title` |
| `sourceName` | **Does not exist** — use `Article.siteName`, `importMeta.sourceLabel`, or URL host (`LibraryArticleList.jsx` ```16:31```) |
| `author` | `Article.author` |
| `importMeta` | `Article.importMeta`, `highlights[].importMeta` ```106:125:server/models/index.js``` |

---

*Investigation only — no product code changed.*
