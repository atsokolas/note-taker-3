# Spec — Post-latency cleanup (remove diagnostics, fix attribution mislabel, embed 429)

**For:** Codex
**Author:** Athan + Claude (2026-06-21)
**Context:** We just fixed the onboarding wiki-build latency (**~115s → ~25–30s**, see "What we changed" at the bottom). Three follow-ups remain: remove the temporary timing logs, fix an attribution-line mislabel found while reading output, and address the embedding service's 429s (a data-quality issue, not latency).

**Verification rule:** reproduce live on `https://www.noeis.io`; paste before/after evidence in the PR. Don't close from a unit test alone.

---

## Task 1 (P1) — Remove the temporary timing instrumentation

We added two diagnostic log families to locate the bottleneck. They've served their purpose — strip them so prod logs aren't noisy.

Remove these `console.log` lines (added 2026-06-21):

1. **`[hf-timing]`** — `server/ai/hfTextClient.js`, in both `chatComplete` (blocking path) and `chatCompleteStream` (stream path). Two log sites each (success + error). Also remove the now-unused `attemptStartedAt` / `responseReadyMs` locals introduced only for those logs.
2. **`[build-timing]`** — `server/services/wikiMaintenanceService.js` (the `__t` helper + `__p` timers around `collectLibrarySources`, `selectCandidateSources`, `collectKnownWikiPages`, `materializeMaintenanceResult`) and `server/routes/wikiRoutes.js` (the `__buildStartedAt`/`__bp` timers + `[build-timing]` logs around `maintainWikiPage`, `applyAutolinksForPage`, `syncPageGraph`, `autolinkPagesToTarget`, `createWikiRevision`, and the endpoint total).

**Keep all the actual fixes** (do NOT revert):
- `streamDraft: false` in `WikiOnboarding.jsx` `FAST_BUILD_OPTIONS`.
- `draftReasoningEffort = fastProfile ? 'low' : 'medium'` in `wikiMaintenanceService.js`.
- The `collectLibrarySources` projection (`ARTICLE_SOURCE_PROJECTION`) + profile caps (`FAST_LIBRARY_LIMITS` / `STANDARD_LIBRARY_LIMITS`) + the `runFind` projection param.

**Verify:** `node -c` both files, `npm run wiki:maintenance-harness` (5/5), `npx jest wikiMaintenanceService.claim.test.js` (37/37). Grep confirms zero `hf-timing` / `build-timing` strings remain.

**Optional (nice to have):** replace the removed ad-hoc logs with a single structured metric via the existing `logAgentMetric(...)` (used already in `aiServiceClient.js`) — e.g. `wiki.build.ms` tagged by profile — so we keep observability without raw console spam. Only if it's clean; otherwise just delete.

---

## Task 2 (P2) — Attribution line mislabels onboarding/pasted pages as "Adapted from a shared Noeis wiki"

### Live symptom
A page built from the onboarding **paste** path (e.g. "Hyperbolic Discounting", built from pasted text, never adopted) renders the line **"Adapted from a shared Noeis wiki"** in the reader header. That line is meant only for pages created via the **adopt** flow (`adoptedFrom` provenance). It's firing on non-adopted pages.

### Root cause to find
The attribution line (added for adoption spec §4) is keying off something that's also set on paste/starter-pack builds — likely `adoptedFrom.sample` is being written for onboarding pages, or the render condition checks `adoptedFrom` truthiness loosely. Check:
- `WikiPageReadView.jsx` (or wherever the "Adapted from a shared Noeis wiki" string renders) — the display condition.
- The onboarding paste path (`WikiOnboarding.jsx buildFromPaste` → `createWikiPage`) and starter-pack adoption — confirm what `adoptedFrom` they set.

### Fix
Only show "Adapted from a shared Noeis wiki · <date>" when the page was genuinely adopted from another user's shared page/collection (a real `adoptedFrom.originPageId`/`originCollectionId`). A page built from the user's own pasted text or a first-party starter pack should NOT show it (or, for starter packs, show the intended "Sample" badge instead — not "adapted from a shared wiki").

### Test (live)
- Build a page via onboarding paste → no "Adapted from a shared Noeis wiki" line. Paste the header.
- Adopt a real shared page (account A → B) → the line DOES show. Paste the header.

---

## Task 3 (P2, separate service) — Embedding endpoint returns 429 on every build

### Live symptom
Every build logs, on `POST /api/import/text` and `POST /api/wiki/pages`:
```
[AI-UPSTREAM] /embed → 429 Too Many Requests → ai_upstream.retry value 1..4 → ❌ Job failed (embedding)
```
The embed call to `ai-5q0l.onrender.com/embed` is rate-limited and **fails after retries on essentially every new source/page**.

### Why it matters (and why it's NOT the latency)
Embedding is fire-and-forget (`enqueueArticleEmbedding(...).catch(...)` in `importRoutes.js:191–198`), so it does **not** block the build (confirmed — that's why fixing latency didn't touch it). BUT: failed embeddings mean **new content never gets vectorized → semantic search / retrieval silently degrades** over time. Left alone, the corpus quietly stops being searchable.

### Investigate + fix (likely outside this repo's request path)
1. Determine why `ai-5q0l.onrender.com/embed` returns 429 — is it a free-tier rate cap, a concurrency limit, a cold-start, or a per-minute quota on the embedding service itself? (That service is the `AI_SERVICE_URL` upstream, probably a separate Render service / repo.)
2. Options, in order of preference:
   - Raise the embedding service's rate limit / concurrency / plan so normal build traffic doesn't 429.
   - Add a **server-side queue with throttle + durable retry** for embeddings (instead of fire-4-times-then-give-up), so transient 429s eventually succeed rather than dropping the job. The retry/backoff already exists in `aiServiceClient.js` (`computeBackoffMs`, honors `retry-after`) — the issue is `retries` is exhausted and the job is abandoned. Consider a persistent embedding backlog the scheduler drains, mirroring the wiki maintenance worker pattern.
   - At minimum, surface a metric/alert when embedding failure rate is high so it's not silent.
3. Confirm the embedding service sends a sane `retry-after` (or none) — a large `retry-after` would also have inflated client-perceived ret[...]

### Test
- After the fix, run a build and confirm `/embed` succeeds (or the job is durably re-queued and later succeeds), not `❌ Job failed`. Paste the log line.
- Confirm newly built pages become semantically searchable.

---

## Priority
Task 1 (remove logs) now — it's trivial and keeps prod clean. Task 2 (attribution) is a small, user-visible polish. Task 3 (embed 429) is the most consequential for long-term quality but is an infra/capacity investigation on the embedding service — scope it separately, don't block 1 and 2 on it.
