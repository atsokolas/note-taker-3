# Spec — The Reading Loop: the corpus reads you back

**For:** Codex
**Author:** Athan + Claude (2026-08-13)

**Thesis:** The daily loop borrows the world's clock — watchers, filings, releases. This borrows the **corpus's clock**. The agent reads what you've been reading this week, finds what it collides with in the part of your library you've forgotten, and hands you the thinking already done. Not "these are related." What the two things *do to each other*.

This becomes the landing page. It is the first thing a logged-in user sees.

**The one rule everything else serves:** a card that can only say *"these are related"* does not render. The agent must name the relation — one fills a gap in the other, they contradict, one is the general case, one supersedes it — and quote both ends. If it can't, the section is silent. Silence is a feature; filler is how this dies.

---

## What already exists — build ON this, do not rebuild

- **Embeddings + vector search:** Qdrant-backed, with mappers for articles, highlights, notebook entries, questions, concepts (`server/ai/embed.js`, `semanticSearch.js`, `embeddingJobs.js`, `mappers/`). Collections in `COLLECTIONS`.
- **Dormancy signal:** `lastOpenedAt` on articles (`server/models/index.js:49`), `createdAt` everywhere, `updatedAt` on notebook entries.
- **Claims with contradiction roles:** `contradictedByCitationIds` / support IDs per claim, plus delta detection (`wikiClaimComparisonService.js:30,181`).
- **Open questions:** extraction from wiki page bodies (`wikiOpenQuestionsService.js`).
- **Claim check-in ritual, shipped:** `checkInStatus`, `checkInStreak`, `selectDailyClaimCheckIn`, `recordClaimCheckIn` (`dailyLoopService.js:142,273`), API at `dailyLoopRoutes.js:139`.
- **Tag/interest aggregation:** `reflectionService.getReflections` (counts over a window — the raw material, not the product).
- **Briefing precompute + cache-first render pattern:** `dailyLoopService.buildDailyLoopBriefing`, `WikiFrontPage.jsx`.

**Verification rule (house rule):** every item has a live acceptance test on `https://www.noeis.io`. Paste before/after evidence in the PR. No closing from unit tests alone.

---

## Part 0 — The page

### 0.1 Route and default landing
**Build:** new page at `/paper`, rendered by a new `note-taker-ui/src/pages/Paper.jsx`. Change the authed root redirect (`App.js:569`) from `/wiki` to `/paper`. `/wiki` keeps working and keeps `WikiFrontPage` — it is no longer the landing, and nav should reflect that.

**Assumption to confirm:** the existing morning paper at `/wiki` (watcher leads, claim check-in, return path) stays as-is and is *not* merged into `/paper` in this pass. Two pages, one landing. If the two should merge, say so and this spec's Part 5 changes.

**Acceptance:** log in on live noeis.io → land on `/paper`. `/wiki` still renders the old front page unchanged.

### 0.2 Layout — newspaper, not dashboard
Follow the existing editorial register (Newsreader serif for reading, mono for receipts, cream/near-black). Reuse the design tokens the wiki front page already uses. No cards-in-a-grid, no icons, no colored status pills.

```
      NOEIS · THE PAPER            Thursday, August 13
      ──────────────────────────────────────────────
      [ LEAD — Connection ]                  ← native, always rendered
        You read something close to this in January.
        <two named ends, two relation lines>
        ── refreshed Aug 8 · [refresh]

      ──────────────────────────────────────────────
      COLLISION                                 [run]
        <result, or invitation, or "nothing this week">
        ── last run Aug 6

      RESOLUTION                                [run]
      CONVERGENCE                               [run]
      THE UNNAMED THREAD                        [run]
```

Single column, generous measure. The lead gets the full editorial treatment; the four sections below are quieter — section rule, small-caps mono label, run control on the right with a last-run receipt in mono.

**Acceptance:** paste a screenshot at 1440px and 390px. Type scale, measure, and rules match the wiki front page's register.

---

## Part 1 — The retrieval core (shared by all five mechanics)

All five mechanics are the same query with different scoring and different LLM framing. Build the core once as `server/services/readingLoopService.js`.

### 1.1 The recent set
**Corrected against live data 2026-08-13.** Everything the user *engaged with* in the last 30 days: articles with a highlight created in window, notebook entries updated in window. Cap at 40, most recent first.

Two things the first draft got wrong, both found by running against the real corpus:
- **`lastOpenedAt` is a dead field.** It exists on the schema and nothing in the product writes it — 0 of 286 articles on the founder account have it set. Keying the recent set off it produced a permanently empty loop. Highlight dates are the real engagement signal.
- **The window was 7 days; real cadence is monthly.** The founder corpus shows ~5 highlighted articles a month, and zero in a typical 7-day window. 30 days is the honest window for a weekly lead.

### 1.2 The dormant set — dormant, not just old
Eligibility:
- **Last engagement ≥ 120 days ago**, where engagement is the most recent highlight on the article (falling back to `createdAt` only when nothing was ever marked).
- **Substantive:** has extractable text — a highlight, a claim, or a body excerpt.

**`createdAt` is not age.** A Readwise or Notion import stamps hundreds of articles with the import date: 231 of the founder's 286 articles were created on 2026-06-08 but were read across 2024–2026. Highlight dates survive the import and are the only honest timeline. Judging dormancy by row age would have collapsed a two-year reading history into one day and left a dormant pool of 15 instead of 228.

The single test is on last engagement, which subsumes the old age-plus-cold pair: something read last Tuesday is not dormant however old the row is.

### 1.3 Pairing
For each recent item, vector-search the dormant set (reuse `semanticSearch`'s Qdrant path with a `userId` filter plus a dormancy filter). Keep pairs in a similarity **band**, not above a floor: strong enough to be about the same thing, not so strong they're the same document restated.

**Tuned 2026-08-13 against the live corpus: 0.45–0.90.** Measured over 840 real recent×dormant pairs from 242 highlighted articles with the production 384-dim embedding model — observed max 0.638, p99 0.490, p95 0.375, median 0.150. The first draft's 0.62 floor admitted **one pair out of 840**; these scores are model-specific and the original numbers were calibrated against nothing. The floor now sits just above p95, so a pair must be in roughly the top 2% to be worth a model call. The ceiling never fires on real pairs and exists only to catch the same article saved twice (~0.99). Overridable via `READING_LOOP_SIMILARITY_MIN`/`MAX`; **re-measure if the embedding model changes.**

Never pair two items from the same source document, the same author within 30 days, or a pair surfaced to this user in the last 60 days.

### 1.4 The relation pass — where the product actually is
For each candidate pair, one LLM call with **both texts** (best-matching excerpts, not summaries) that must return this shape or nothing:

```
{
  relation: 'fills_gap' | 'contradicts' | 'generalizes' | 'supersedes',
  recentQuote: string,      // verbatim from the recent item
  dormantQuote: string,     // verbatim from the dormant item
  lines: [string, string]   // 1-2 sentences each, what one does to the other
}
```

**Every relation is asymmetric, deliberately.** A `shared_mechanism` option was in the first draft and was removed after the first live run: it is the escape hatch a model reaches for when there is no real relation, and it produced exactly the mush this design exists to exclude (*"Both texts emphasize the importance of acknowledging mistakes"*). Removing the symmetric option turned the same pair into a real `contradicts` card. Do not add one back.

**Hard gates, enforced in code after the model returns:**
1. `relation` must be one of the enum. "Related" is not an option and must not be addable.
2. Both quotes must **string-match into the source text** after whitespace normalization. If a quote isn't literally present, drop the pair. This kills hallucinated evidence for the price of an `indexOf`.
3. Both `lines` non-empty and under 240 chars.
4. **No symmetric phrasing.** A line beginning "both / they / these / the two / each" is announcing an association, not stating a relation; it is dropped. If no line survives, so does the card. Rejecting the phrasing in code is more reliable than hoping the prompt prevents it.

A pair failing any gate is dropped silently, not repaired. If every candidate fails, the section renders its honest empty state.

**Acceptance:** unit tests for each gate, plus a live run on the founder account showing at least one card where both quotes are verifiably present in the named sources. Include one forced-failure case (fabricated quote → card suppressed).

---

## Part 2 — Connection (the lead)

**Native. Rendered on load. No user action required.**

The full retrieval core with no relation-type preference — best-scoring pair wins. This is the card from the thread: names both ends with dates, then says what they do to each other. Complete on its own; a user who reads it and closes the tab got the value.

**Cadence:** precomputed weekly per user in the existing worker infrastructure. Renders from cache — target < 500ms, same contract as the briefing. The user can **refresh** it from the page; that runs the pipeline live, replaces the edition, and stamps a new receipt. Rate-limit refresh to a small number per day per user and show the limit in the receipt when hit.

**Empty state:** *"Nothing worth connecting this week."* plus the last edition, still readable, with its date. Do not manufacture a card.

**Acceptance:** on the founder account, `/paper` renders a Connection lead from cache on first paint; refresh produces a different, valid card; both quotes check out against the named sources. Paste the rendered lead.

---

## Part 3 — The four prompted mechanics

Same core, different selection and framing. Each renders its last result with a mono receipt (`last run Aug 6`) and a run control; never generated yet → a one-line invitation. **User-initiated only — nothing here runs on page load.**

### 3.1 Collision
Restrict the dormant side to **claims on wiki pages** (`checkInStatus !== 'retired'`, ≥ 2 sources). Restrict `relation` to `contradicts` or `supersedes`. The card states the claim, when it was written, what challenges it, and ends in the existing ritual: **Still hold · Revise · Retire**, writing through `recordClaimCheckIn` (`dailyLoopService.js:273`). No new write path.

**Acceptance:** a real contradiction on the founder corpus; each of the three actions writes history and reflects on the claim's page.

### 3.2 Resolution
Dormant side = open questions (`wikiOpenQuestionsService` + the `Question` model, `status: 'open'`). Recent side = this week's reading. The card names the question, when it was asked, and what in this week's reading bears on it. Action: **attach as evidence** (existing source-attachment path) or **mark answered**.

**Acceptance:** an open question ≥ 120 days old matched to a source read this week; attaching evidence lands on the question.

### 3.3 Convergence
The one-to-many case: ≥ 3 recent items that all pair to the **same** dormant item or named concept. Framing: *"Three things you read this week are instances of something you named in October."* Requires ≥ 3 or it doesn't render — no two-item "convergence."

**Acceptance:** a live 3-item convergence, all three named and clickable, or an honest empty state with the reason.

### 3.4 The unnamed thread
Different shape — no dormant side. Cluster the **recent set** (7–21 day window) and find clusters of ≥ 4 items with no existing wiki page covering them. Output: a proposed name, the count, and **every source listed and clickable**.

No percentages, no word clouds, no "you seem drawn to." The count is real or the card doesn't render.

Actions: **name it** (creates a wiki page seeded with the sources, reusing the existing page-creation path) or **not a thing** (suppresses this cluster for 60 days — the rejection is signal; log it).

**Acceptance:** a live cluster with ≥ 4 named sources; "name it" produces a page seeded with exactly those sources; "not a thing" suppresses it on re-run.

---

## Part 4 — Model, cost, cold start

### 4.1 Storage
New `ReadingLoopEdition` collection, one current document per user:

```
{ userId, connection: { card, generatedAt, sourceIds },
  collision / resolution / convergence / thread: { card, generatedAt, ... },
  suppressed: [{ kind, key, until }],     // rejected threads, shown pairs
  history: [{ kind, key, shownAt }] }     // 60-day no-repeat ledger
```

No new page/claim structures. Cards reference existing objects by ID and resolve at render.

### 4.2 Cost control
On-demand runs are LLM calls per click. Per-user daily caps on each mechanic; the run control disables with an honest mono receipt when capped (`limit reached · resets 00:00`). Cap the candidate pairs sent to the relation pass — score first, send the top handful, stop at the first card that clears the gates.

### 4.3 Cold start
A user with < 120 days of corpus cannot have a Connection, and pretending otherwise is the worst possible first impression. Under the age threshold, the lead says so plainly and points at the thing that *does* work — recent reading, the wiki, capture — with a real date for when the loop turns on. Never fabricate a shallow connection to fill the lead.

**Acceptance:** a fresh account lands on `/paper` and sees an honest, well-set cold-start lead — not an empty page, not a fake card.

---

## Part 5 — Instrumentation

The success metric is **not** clicks. Log, per mechanic: rendered, refreshed, and the *consequential* action — claim revised or retired, question answered, thread named or rejected. If a mechanic is rendering weekly and never producing a consequential action, it's decorative and should be cut. Make that visible in the existing marketing/funnel metrics surface rather than a new dashboard.

---

## Sequencing

1. **Part 1** — the retrieval core with its gates. Everything else is framing on top of it.
2. **Part 2 + Part 0** — Connection as the lead, `/paper` live, root redirect flipped. This alone is shippable and is the whole bet.
3. **Part 3.1 Collision** — highest value of the four, and reuses the shipped check-in ritual end to end.
4. **Part 3.2 Resolution**, then **3.4 Unnamed thread**, then **3.3 Convergence** last (weakest; cut it without regret if the gates prove expensive).

Do not start Part 3 until Part 2's quote-verification gate is proven on live data.

---

## Live verification log — 2026-08-13

Run against the founder corpus (286 articles, 2,381 highlights, 62 wiki pages) with the real embedding service, a real Qdrant instance, and the real text model. Everything below was observed, not inferred.

### Blocker found and fixed: the vector index has never worked
`qdrantClient.upsertVector` passed Mongo ObjectId hex strings as Qdrant point IDs. Qdrant accepts only an unsigned integer or a UUID and rejects anything else with a 400, which the embedding job queue swallowed and retried until abandoning. Evidence: **0 completed embedding jobs, 133 abandoned**, and a live upsert reproducing the 400. This silently disabled `semanticSearch` product-wide and made the Reading Loop's Connection mechanic impossible. Fixed in `server/ai/qdrantClient.js` with a deterministic UUID derived from the ID (`toPointId`); nothing reads the point ID back, so the mapping need not be reversible. **A backfill is still required** — the 133 abandoned jobs need requeuing before the index reflects the corpus.

### Mechanic results
| Mechanic | Result | Note |
|---|---|---|
| Connection | **ready** | Vanderheiden (2026-07-27) × *The Intelligent Investor* (2025-09-16), both quotes verified |
| Collision | **ready** | after two fixes, below |
| Resolution | empty, correct | the only 4 open questions >120d are placeholders ("New question" ×3, "What") — filtered by the 20-char minimum |
| Convergence | empty, correct | no dormant item drew 3+ recent items |
| Thread | empty, correct | 7 items in window, no cluster of 4 shares enough vocabulary |

Three of five are silent on this corpus, and that is the design working. Resolution in particular cannot be exercised until there are real long-lived open questions.

### Quality gates added because live output demanded them
Each was added after observing the failure, not anticipated:
1. **Symmetric relations removed.** `shared_mechanism` produced *"Both texts emphasize the importance of acknowledging mistakes"* — the exact mush this design exists to exclude. Removing the symmetric option turned the same pair into a real `contradicts` card.
2. **Symmetric phrasing gate.** Lines opening "both / they / these / the two / each" are dropped.
3. **Echo gate.** A line that repeats a quote back says nothing; observed *"The older piece dreads a bull market, since it makes stocks more costly to buy"* offered as the *relation* for a card whose dormant quote was that exact sentence.
4. **Claim age floor (30d) for collision.** Observed a claim generated from an article being "superseded" by that same article — circular. A conviction has to have been held.
5. **Maintenance-meta claim filter.** Wiki-process claims ("the recurring pattern across…", "the page should…") are artifacts, not positions.
6. **Convergence reads the 45-day window,** not 30. At a real cadence of ~5 marked articles a month, the 30-day window rarely holds the three items convergence requires, making the mechanic structurally impossible rather than merely quiet.

### Known remaining weakness
**The relation label is not independently verified.** With the symmetric option removed, the model over-reaches for `contradicts`: the live Connection card labels two texts that broadly *agree* (Vanderheiden on avoiding ruin, Graham on dreading bull markets) as contradictory. The quotes are real and the lines are asymmetric, so the card is not misleading — but the label is doing less work than it claims. The fix, if it proves worth the cost, is a second cheap pass that asks only *"does A actually oppose B?"* and downgrades the relation when the answer is no. Deliberately not built yet: it doubles model cost on the most common relation, and the label may simply not carry enough weight in the UI to justify it.

---

## Follow-up pass — 2026-08-13 (later)

### Correction to the blocker above
The Qdrant point-ID bug is real and reproduced, but it was **not** what abandoned the 133 jobs. Their error history is **133 × `AI service error 429: Too Many Requests`** spanning 2026-06-21 to 2026-08-13 — they failed at the *embedding* step and never reached Qdrant. The two `fetch failed` entries are from local runs on 2026-08-13. Both blockers are real; the rate limit is the one that has been biting.

### Landing page held back
`/` still redirects to `/wiki`, and the brand link with it. The Paper is built, routed at `/paper`, and in the primary nav — but until the index is backfilled in production its lead reads "nothing worth connecting this week", which is the wrong first impression for a home page. Flip `App.js` and `TopBar.jsx` together once the lead is reliably producing.

### `lastOpenedAt` now written
`GET /articles/:id` stamps it, fire-and-forget, `timestamps: false` — reading is not editing. `lastEngagementAt` takes the max of last highlight and last open, so reading without highlighting is finally visible to the loop. Before this, an article you read but never marked did not exist as far as the Reading Loop was concerned.

### Claims and questions indexed
New `wiki_claims` collection plus `enqueueWikiClaimEmbeddings`, fired from a **post-save hook on `wikiPageSchema`** — there are 51 `.save()` sites for wiki pages and no other single choke point. Only collision-eligible claims are embedded (≥2 sources, not retired, not maintenance-meta, ≥40 chars), which is ~269 of ~861. Collision and resolution now rank candidates by vector similarity and fall back to term overlap only when the index is empty or unreachable.

### Backfill tool
`scripts/backfill_embeddings.js` — one request at a time with a configurable pause, stops after 5 consecutive failures and prints a `--skip` resume point. The existing worker's five-jobs-a-minute batching against a rate-limited upstream is what produced 133 abandonments; a backfill needs the opposite behaviour. Catalogues 3,433 embeddable items on the founder corpus (256 articles, 2,377 highlights, 528 notes, 3 questions, 269 claims). Verified by indexing claims + questions: **270 of 272 succeeded** (2 timeouts on placeholder questions).

### The relation prose is model-limited — stop prompt-engineering it
Four rounds of prompt and gate work each traded one failure mode for another:

| Attempt | What came back |
|---|---|
| `shared_mechanism` allowed | *"Both texts emphasize the importance of acknowledging mistakes"* |
| symmetric option removed | *"The older piece dreads a bull market, since it makes stocks more costly to buy"* — echoing the quote |
| echo gate + explicit template in prompt | *"The older piece could not do X. This one does Y."* — the template, literally |
| template replaced with an example | *"The recent text emphasizes… The dormant text highlights…"* — two summaries, not a relation |

Every structural element works: retrieval, dormancy, the band, quote verification, the index, the gates. What does not work is getting **relational** prose out of `gpt-4o-mini`. Each gate correctly killed the failure it was written for, and the model moved to the next-nearest way of not answering.

The relation pass is now routed with the `critique` profile at `reasoningEffort: 'high'`, but `OPENROUTER_AGENT_CRITIQUE_ROUTES` is unset so it still resolves to the same small model. **The fix is configuration, not prompting:** point that route at a stronger model and re-run. If the prose does not improve there either, the honest options are to accept softer lines or to drop the relation lines and let the two quotes and the dates carry the card alone — which is most of the value anyway.

**Resolved — stop asking the model to write prose at all.**

The five rounds above all shared one assumption: that the model should write the sentence. It should not. The relation pass now asks it to fill two slots and the *sentence frame is ours*:

```
"The older piece ___(A)___. The newer one ___(B)___."

A = what the older text holds or assumes (a verb phrase, no subject)
B = what the newer text DOES TO THAT
```

This makes "two independent summaries" **structurally impossible**: B has nowhere to be a standalone sentence, because it is grammatically a predicate hanging off A. Two supporting gates finish the job:

- **`SLOT_BAD_OPENER_RE`** — a slot beginning "the / this / it / they / both / a" is a sentence in disguise, which is how the failure mode gets back in.
- **`DESCRIBING_VERB_RE`** (B only) — "emphasizes / highlights / discusses / describes / focuses on" describe a text rather than act on a claim. The test in the prompt and in code is the same: *if B would read identically when the older text does not exist, it is wrong.* A may describe; only B must act.

Live result on the same `gpt-4o-mini` that produced four rounds of mush:

> **Connection** — *"The 2025 piece assumes that safety of principal is enough for investment success. The newer one adds the necessity of managing risk to avoid being removed from the investment game."*
>
> **Collision** — *"The older piece assumes that visibility of success is a key factor in investment outcomes. The newer one supplies a counterpoint by emphasizing the importance of managing risk and timing over merely observing successful cases."*

Both are real relations, on the small model, with no model upgrade. The relation *label* also became more accurate as a side effect — the Graham × Vanderheiden pair is now correctly `fills_gap` rather than the earlier wrong `contradicts`, which suggests the label was previously suffering from the same free-form looseness.

A stronger model on the `critique` route should improve the prose further, but is no longer required for the feature to be worth shipping.

---

## Store migration — 2026-08-13 (later still)

The Reading Loop no longer reads from Qdrant. Qdrant was never provisioned in production and has been deleted from the codebase; the index is now MongoDB Atlas Vector Search (`vectoritems`). See `docs/noeis-atlas-vector-search-migration-2026-08-13.md`.

**The band constants did not change, but the comparison did.** `DEFAULT_SIMILARITY_MIN`/`MAX` remain **raw cosine** (0.45 / 0.90) because that is the space they were measured in. Atlas reports `(1 + cosine) / 2`, so `atlasSimilarityBand()` converts at the point of comparison — 0.725 / 0.95 — rather than storing pre-converted numbers, which would leave two conventions in one file with no way to tell which a given constant is in.

Confirmed against the live index: a query scoring **0.859 in Atlas space is 0.718 raw**, comfortably inside the band, and the top hits for *"what are the moats and competitive advantages"* are the **Economic Moats** page and its claims — a query with zero keyword overlap against that page's text.

Collision and resolution now rank candidates by real similarity rather than term overlap; claims are indexed as `wiki_claim` rows and questions as `question` rows. The term-overlap path survives as a fallback for when the index is empty or unreachable, and should be deleted once the index has proven itself in production.
