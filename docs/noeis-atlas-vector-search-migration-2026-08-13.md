# Spec — One vector store, on Atlas

**For:** Codex
**Author:** Athan + Claude (2026-08-13)

**Thesis:** Noeis has two semantic search stacks and neither works in production. Consolidate onto MongoDB Atlas Vector Search — the one datastore in this system that is already durable, already paid for, and already holds the documents.

**This is a build, not a migration.** There is no working production index to preserve, no dual-write window, no cutover choreography. That is the one piece of good news in the findings below, and it makes this far smaller than it looks.

---

## What is actually broken (measured 2026-08-13, not inferred)

**Stack 1 — what the product calls.** `/api/search/semantic` → `aiClient.semanticSearch` → the separate `ai_service` on Render. That service works, but it persists vectors to a JSON file:

```python
VECTOR_STORE_PATH = os.getenv("AI_VECTOR_STORE_PATH", "/tmp/note_taker_ai_vectors.json")
```

`/tmp` on Render is wiped on every deploy, and free instances also spin down when idle. The store empties itself and refills only for whatever gets indexed before the next restart. Live check against the founder account: `POST /search` → **200, 0 results** for *"value investing margin of safety risk"* against a corpus with hundreds of matching highlights.

It fails **invisibly**: `server.js` catches upstream 404/429 and returns `{ results: [] }`. Semantic search has never looked broken. It has looked empty.

**Stack 2 — the Qdrant path.** `server/ai/embeddingJobs.js` + `semanticSearch.js` + `qdrantClient.js`. Nothing in the product's search UI calls it; only the embedding job worker writes to it. Production has **no Qdrant service and no `QDRANT_HOST`** (verified in the Render dashboard — the backend's env vars run straight from `OPENROUTER_TIMEOUT_MS` to `WEB_APP_URL`, Secret Files is empty, no env groups linked). So it defaults to `http://localhost:6333` inside the container, where nothing listens.

**Atlas today:** `listSearchIndexes()` succeeds and returns **zero** indexes on `articles`, `highlights`, `notebookentries`. No vector fields on any document. Atlas Search is available on the cluster; it has simply never been used.

**Corpus to index (all users):** 355 articles, 2,438 highlights, 691 notebook entries, 23 questions, 1,976 wiki claims across 209 pages, 119 users. Database is 408 MB data / 189 MB storage.

**Verification rule (house rule):** every item has a live acceptance test on `https://www.noeis.io`. Paste before/after evidence in the PR. No closing from unit tests alone.

---

## Part 0 — Preconditions

**0.1 Tier — checked 2026-08-13, and the news is mixed.**

Cluster `Note-taker` is **M0 Free**. Vector Search **is available** — the Atlas console offers "Create Vector Search Index" on this cluster and currently lists **zero** indexes of any kind. So the feature is not the problem.

**Storage is the problem.** The cluster is at **443.3 MB of 512 MB — 87% full**, with Atlas already warning about it. That leaves roughly **69 MB of headroom**, and it is the binding constraint on this entire design. Part 1 is written around it.

**Where the 443 MB actually is** — measured per collection, and it is not user content:

| collection | data MB | docs |
|---|---|---|
| `wikirevisions` | **260.1** | 1,724 |
| `wikisourceevents` | 58.6 | 12,240 |
| `wikimaintenanceruns` | 49.0 | 36,443 |
| `notebookentries` | 8.8 | 691 |
| `articles` | **7.3** | 356 |

Three operational collections are **83% of the database**. Articles — the thing users actually save — are 7.3 MB. Revision snapshots alone average ~150 KB each.

`wikiRevisionRetentionService.pruneWikiRevisionHistory` already exists and is wired into `wikiRevisionService`, but its `pruneThreshold` is 24 revisions per page and the corpus averages ~8, so it never fires. The size is per-snapshot, not per-count. **Fixing that is the real storage answer and it is separate work** — do not fold it into this migration. Nothing here requires deleting anything.

**0.2 Confirm embedding dimensions.** Measured live at **384** via `embedText()` through `ai_service`. The index declares dimensions statically and cannot be changed without a rebuild, so assert this in code rather than trusting the constant.

**0.3 Does this fit?** Part 1.3 budgets ~15 MB against ~69 MB of headroom, so yes, without deleting anything. If measurement disagrees, prune `wikirevisions` snapshots or upgrade to Flex — in that order, and as separate work. Deleting user content to make room for a search index would be the wrong trade in every direction.

---

## Part 1 — The store

### 1.1 One collection, one document per embeddable unit
Atlas `$vectorSearch` targets a single field path and returns whole documents, so vectors cannot live on array subdocuments — highlights and claims are subdocuments and there are 4,400 of them. A dedicated collection is the only shape that works, and it happens to mirror the Qdrant point model exactly, which keeps the rewrite small.

New `VectorItem` model, collection `vectoritems`:

```
{
  userId:      ObjectId, required, indexed
  objectType:  'article' | 'highlight' | 'notebook_entry' | 'question' | 'wiki_claim'
  objectId:    String    // the Mongo id, or `${pageId}:${claimId}` for claims
  subId:       String    // block id where relevant, '' otherwise
  embedding:   BinData   // float32, 384 dims — NOT an array of doubles
  metadata:    Mixed     // title, articleId, articleTitle, tags, createdAt
  contentHash: String    // sha1 of the embedded text; skip re-embedding when unchanged
  updatedAt:   Date
}
```

Unique compound index on `{ userId, objectType, objectId, subId }` so a re-index overwrites rather than duplicates.

Two decisions are driven entirely by the 69 MB headroom in Part 0.1:

**Store the vector as `binData` float32, not as an array.** A JS array of 384 numbers becomes 384 BSON doubles at 8 bytes each — about 3 KB per item before keys. Atlas Vector Search accepts `binData` float32 vectors natively and they are half that. Across ~7,500 items this is roughly 11 MB instead of 23 MB. `int8` quantization would cut it to ~3 MB at some recall cost; hold that in reserve rather than reaching for it first.

**Do not store the embedded text.** The earlier draft of this spec kept a `text` field so the Reading Loop's quote-verification gate could check against exactly what was embedded. On a cluster with 69 MB spare, duplicating source text is the wrong trade — and it turns out to be unnecessary: `hydrateCandidate` already loads the source document on the read path, so the text is in hand anyway. Keep `contentHash` alone, and treat a hash mismatch as "re-embed", which is the same signal the old `text` field would have given.

### 1.2 The index definition
```json
{
  "name": "vector_index",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      { "type": "vector", "path": "embedding", "numDimensions": 384, "similarity": "cosine" },
      { "type": "filter", "path": "userId" },
      { "type": "filter", "path": "objectType" }
    ]
  }
}
```

Both filter fields are required: every query is scoped to one user, and most are scoped by type. **A vector index without `userId` as a filter field is a cross-tenant data leak**, so treat that line as load-bearing.

Create it from `scripts/` via `createSearchIndex`, and poll `listSearchIndexes()` until `status === 'READY'` — index builds are asynchronous and querying early returns empty rather than erroring, which is exactly the failure mode this whole document exists to eliminate.

**Acceptance:** `listSearchIndexes()` on `vectoritems` shows `vector_index` READY. Paste the output.

### 1.3 Storage budget
| | |
|---|---|
| Vectors, ~7,500 × 384 float32 binData | ~11 MB |
| Metadata, keys, `_id`, compound index | ~3 MB |
| Atlas Search index structures | measure — see below |
| **Headroom available** | **~69 MB** |

**Measured after the founder backfill (3,505 rows): 7.1 MB data + 0.8 MB indexes = 7.9 MB.** Half the 15 MB budgeted, because float32 `binData` and dropping the stored text both paid off. Cluster data size read 415.1 MB of 512 MB afterwards — *lower* than the 443.3 MB before, since the reported figure fluctuates with compaction; treat the delta, not the absolute, as the signal.

Extrapolating to all 119 users at roughly double the founder's corpus gives ~20 MB. That fits without pruning anything. Re-measure before the all-users run rather than trusting this extrapolation.


---

## Part 2 — The write path

### 2.1 One writer
`server/ai/vectorStore.js` — `upsertVectorItem`, `deleteVectorItemsFor`, `searchVectorItems`. Same shape as `qdrantClient.js` so `embeddingJobs.js` changes only in which module it requires.

`drainEmbeddingJobQueue` keeps its queue, retry, and abandon semantics; only the destination changes. Skip the embedding call entirely when `contentHash` matches the stored row — on a re-run of the backfill that turns 3,400 upstream calls into 3,400 cheap reads.

### 2.2 Rate limiting is a first-class concern, not an afterthought
133 jobs reached `abandoned` with `AI service error 429` between 2026-06-21 and 2026-08-13. The worker's five-jobs-a-minute batching against a rate-limited upstream is what did it. Keep the existing backoff, but add a **circuit breaker**: on N consecutive 429s, stop draining and set a cooldown rather than burning attempt counts until every job abandons. A job should abandon because it is bad, never because the upstream was busy.

**Acceptance:** with the AI service returning 429, the queue pauses and jobs retain their attempt budget. Paste the job rows before and after.

---

## Part 3 — The read path

### 3.1 Both stacks collapse onto one query
```js
db.vectoritems.aggregate([
  { $vectorSearch: {
      index: 'vector_index',
      path: 'embedding',
      queryVector: vector,
      numCandidates: limit * 15,
      limit,
      filter: { userId: { $eq: userObjectId }, objectType: { $in: types } }
  }},
  { $addFields: { score: { $meta: 'vectorSearchScore' } } }
])
```

`numCandidates` at ~15× `limit` is the usual recall/latency trade; tune it against measured recall, not by feel.

### 3.2 Keep the existing response contract
`hydrateSemanticResults` (`server.js:5465`) expects `{ id, metadata: { objectType, objectId, subId }, score }`. Return that shape from the new path so `/api/search/semantic`, `/api/*/related`, and the concept surfaces need no changes. This is the difference between a contained change and a sprawling one.

### 3.3 `ai_service` becomes an embedding provider, not a store
Keep `/embed` — it wraps the HF client usefully. Retire `/search`, `/similar`, `/embed/upsert`, `/embed/get`, `/embed/delete` and the `_VECTOR_STORE` machinery, once Part 3.1 is live. Delete `AI_VECTOR_STORE_PATH`. Leaving a second store in place is how this situation happened.

**Acceptance:** search the live site for a phrase that appears only in a highlight body, not in any title. Results return, and they are the right highlights. Paste the query and results.

---

## Part 4 — The Reading Loop cutover

`readingLoopService.js` calls `search()` from `qdrantClient`. Point it at `searchVectorItems`. One import, same result shape.

### 4.1 The similarity band must be converted — this is the trap
**Atlas normalizes cosine scores to `(1 + cosine_similarity) / 2`.** Qdrant returns raw cosine. The Reading Loop's band was tuned on raw cosine against the live corpus (`0.45–0.90`, measured over 840 real pairs — max 0.638, p95 0.375). In Atlas score space the same band is **`0.725–0.95`**.

Ship the conversion, then **re-measure empirically** and correct the constants — do not trust the arithmetic here, including mine. If this is missed, the Reading Loop silently returns nothing, because a 0.45 floor in Atlas space admits essentially every pair in the corpus and the ceiling admits none of the good ones.

Record the measured distribution in `docs/noeis-reading-loop-spec-2026-08-13.md` alongside the Qdrant numbers already there.

**Acceptance:** re-run the connection mechanic on the founder corpus through Atlas and produce a card with both quotes verifying. Paste it next to the Qdrant-era card from the Reading Loop spec — same pair, or a defensible reason it differs.

### 4.2 Claims and questions come along
`wiki_claims` and `questions` become `objectType`s in the same collection, so `rankClaimsForRecent` drops its term-overlap fallback path in favour of one real query. Keep the fallback for one release; delete it once the index is proven.

---

## Part 5 — Backfill

`scripts/backfill_embeddings.js` already exists, already paces itself, already stops after five consecutive failures with a `--skip` resume point, and already catalogues all five types (3,433 items on the founder corpus, verified: 270 of 272 claims and questions indexed successfully). Change its destination to `upsertVectorItem` and add `--all-users`.

Run per-user, founder account first. At 1.2 s/item the founder corpus is roughly an hour; all 119 users is unattended overnight work.

**Acceptance:** `vectoritems` count matches the catalogue for the founder account, and a `$vectorSearch` for a known phrase returns the expected source in the top three.

---

## Part 6 — Make silent death impossible

This failed quietly for months, in two independent ways, because nothing ever reported the size of the index. That is the actual root cause and it deserves a fix of its own.

- **Extend `/health`** (`systemRoutes.js:843`) with `vectorIndex: { status, itemCount, oldestItemAt }`. A store that has emptied itself becomes visible from a curl.
- **Stop returning `{ results: [] }` on upstream failure.** An empty result set and a broken backend must not look identical to the caller. Return a typed degraded state and let the UI say so honestly — the product already has a receipt register for exactly this.
- **Alert on zero.** If `itemCount` is 0 while `articles` is non-zero, that is a defect, not a quiet Tuesday.

**Acceptance:** curl `/health` on production and paste the vector index block. Then delete a few rows and confirm the count moves.

---

## Part 7 — Decommission

Once Parts 3–5 are green on production: delete `server/ai/qdrantClient.js`, drop `QDRANT_HOST`/`QDRANT_API_KEY` from `.env.example` and the README's semantic-search section, and remove the local Qdrant instructions. Two vector stores was the disease; leaving a dormant third path is a relapse waiting to happen.

---

## Part 8 — Wiki content becomes searchable by meaning

Wiki retrieval is not semantic and never has been. `wikiAskService.scoreTextForQuestion` is literal substring counting:

```js
extractAnswerTokens(question)
  .reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
```

Plus a bonus when the page title appears in the question. There is no text index on `wikiPageSchema` either, so this is in-memory counting over already-loaded candidates — not even Mongo `$text`. Ask "what are the moats here?" and a page about *competitive advantage* scores zero.

Once Parts 1–5 land, wiki pages are two more `objectType`s in the same index and this becomes small.

### 8.1 Index wiki page bodies
Add `objectType: 'wiki_page'` alongside the `wiki_claim` rows Part 4.2 already produces. One row per page, embedding `title + plainText`. The post-save hook on `wikiPageSchema` (added for claims) covers writes; the backfill covers the existing 210.

Chunk pages over ~1,500 words into passages with a `subId` — a single vector for a long page averages away the specific passage that answers the question, which is the whole point of asking.

### 8.2 Retrieval becomes hybrid, not replaced
**Keep the token scorer.** It is genuinely better than embeddings for exact-term questions — a ticker, a person's name, a defined term. Semantics is worse at literal matching, not better.

Blend: retrieve with `$vectorSearch`, retrieve with the existing scorer, merge on page id, and rank by `max(normalized_vector_score, normalized_token_score)` with the title-mention bonus preserved. Take the union, not the intersection — the two methods fail on different questions, which is exactly why both are worth keeping.

### 8.3 Where it shows
`selectWikiPageCandidates` (`wikiAskService.js:265`) and the snippet selectors at :357 and :427. Same function signatures, same return shapes — the change is confined to how candidates are ordered and how many survive.

**Acceptance:** on live noeis.io, ask a wiki question using vocabulary that appears nowhere in the target page — the "moats" / "competitive advantage" case. The right page is retrieved and cited. Paste the question, the retrieved pages, and the answer. Then ask a question containing an exact ticker and confirm the token path still wins. Both cases in the PR, or the hybrid is unproven.

---

## Sequencing

1. **Part 0 + 1** — collection and index. If the tier will not build a vector index, everything downstream is moot, so prove this first and alone.
2. **Part 2** — the writer plus the circuit breaker.
3. **Part 5** on the founder account only — a real index to develop against.
4. **Part 3** — the product's search onto Atlas. The biggest user-visible win, and independently shippable.
5. **Part 6** — instrumentation. Before the wider backfill, so the backfill is observable.
6. **Part 4** — Reading Loop cutover, with the band re-measured.
7. **Part 5 again** — all users.
8. **Part 8** — wiki semantic retrieval, once the index has proven itself on articles.
9. **Part 7** — decommission.

Parts 3 and 4 are independently shippable; do not gate the product's search on the Reading Loop.

---

## Risks

- **The band conversion (4.1).** Most likely thing to silently break, and it breaks in the direction of showing nothing — which this codebase has proven it will not notice. Guard with the acceptance test, not with care.
- **Index build latency.** Atlas builds asynchronously and queries return empty, not errors, while building. Poll to READY before any acceptance test, or you will chase a phantom.
- **The 429 ceiling.** The backfill is 3,433 items for one user and ~7,500 across all users. If the AI service's rate limit is per-minute, this is bounded by the limit and not by us; measure the ceiling before scheduling the all-users run.
- **Storage.** The cluster is at 87% before this adds anything. Every part of Part 1 is shaped by that. Re-check the figure after the founder backfill and before the all-users run, and be willing to upgrade rather than compress further — the fallback of `int8` quantization costs recall, and recall is the product.
- **`userId` filter on the index.** Omitting it leaks other users' material into search results. Verify with a two-account test before this reaches anyone but the founder.
