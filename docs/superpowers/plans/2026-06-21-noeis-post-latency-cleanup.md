# Noeis Post-Latency Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the latency instrumentation, fix the shared-wiki attribution mislabel, stop the first-run tour from hijacking deep links, and scope the embedding 429 failure as a durable data-quality fix.

**Architecture:** Keep the latency fixes intact and remove only temporary diagnostics. Treat the first-run tour as a routing policy bug in the client, the attribution issue as a provenance-rendering bug, and the embedding 429 as a background-job reliability problem that should not block the UI cleanup push.

**Tech Stack:** React, Playwright, Jest, Express, Mongoose, Render API, Vercel frontend.

---

## Push Plan

### Push 1: App polish cleanup

Ship together:
- Remove `[hf-timing]` and `[build-timing]` logs.
- Fix wiki attribution rendering.
- Fix first-run tour deep-link hijack.

Why together: these are small, local, testable changes in the main app/API repo. They should deploy quickly and can be verified on production.

Status: complete locally on 2026-06-21. Backend timing logs were removed, Cursor's attribution/tour fixes were reconciled, focused backend/frontend tests passed, and the frontend CI build passed.

### Push 2: Embedding reliability investigation

Ship separately:
- Determine whether `ai-5q0l.onrender.com/embed` 429s are capacity, concurrency, provider quota, or service logic.
- Add durable retry/backlog or adjust infra.

Why separate: this is likely a service/infra task, not a UI polish task. It impacts retrieval quality, but it should not delay Push 1.

Status: implemented locally on 2026-06-21. The repo now has a Mongo-backed `EmbeddingJob` backlog, the existing `enqueue*Embedding` helpers persist work when available, and the API process drains due jobs with low-concurrency retry/backoff. The old in-memory queue remains only as a fallback when persistence is disabled/unavailable. Upstream capacity can still be improved, but 429s no longer permanently drop build/import vectorization work.

---

## Files

### Push 1

- Modify: `server/ai/hfTextClient.js`
  - Remove temporary `[hf-timing]` logs and timing locals only.
- Modify: `server/services/wikiMaintenanceService.js`
  - Remove temporary `[build-timing]` helper/timers only.
  - Preserve `fastProfile` behavior, low reasoning effort on fast path, profile-aware source caps, and source projections.
- Modify: `server/routes/wikiRoutes.js`
  - Remove temporary stream endpoint `[build-timing]` timers/logs only.
  - Preserve deferred inbound autolinks, save retry, and fast options.
- Modify: `note-taker-ui/src/components/wiki/WikiPageReadView.jsx`
  - Render “Adapted from a shared Noeis wiki” only for real shared-page/shared-collection provenance.
  - Render a starter-pack/sample label separately if needed.
- Modify: `note-taker-ui/src/components/wiki/WikiPageReadView.test.jsx`
  - Add coverage for real adopted shared page, starter pack sample, and blank/default `adoptedFrom`.
- Modify: `note-taker-ui/src/tour/TourManager.jsx`
  - Stop automatic forced navigation when a first-run/deep-linked route should remain in place.
  - Keep explicit tour CTA route navigation working.
- Modify: `note-taker-ui/src/tour/TourManager.test.jsx`
  - Add tests for deep links and explicit resume behavior.

### Push 2

- Inspect: `server/ai/embeddingJobs.js`
- Inspect: `server/ai/embed.js`
- Inspect: `server/services/aiServiceClient.js`
- Inspect: `server/config/aiClient.js`
- Inspect: Render service logs/config for `AI_SERVICE_URL=https://ai-5q0l.onrender.com`
- Possible create: `server/ai/embeddingQueue.js`
- Possible create/modify: persistence model for embedding retry backlog if no existing model fits.

---

## Task 1: Remove Temporary Latency Logs

**Files:**
- Modify: `server/ai/hfTextClient.js`
- Modify: `server/services/wikiMaintenanceService.js`
- Modify: `server/routes/wikiRoutes.js`

- [x] **Step 1: Confirm current diagnostics**

Run:

```bash
rg -n "hf-timing|build-timing|attemptStartedAt|responseReadyMs|__buildStartedAt|__bp|__t\\(|__p" server/ai/hfTextClient.js server/services/wikiMaintenanceService.js server/routes/wikiRoutes.js
```

Expected: matches in the three files above.

- [x] **Step 2: Remove only temporary log code**

In `server/ai/hfTextClient.js`, remove:
- `const attemptStartedAt = Date.now();` in both blocking and stream attempt loops if only used by logs.
- `const responseReadyMs = Date.now() - attemptStartedAt;` if only used by logs.
- all `console.log(`[hf-timing] ...`)` lines.

In `server/services/wikiMaintenanceService.js`, remove:
- `const __t = ...`
- `let __p = Date.now();`
- every `__t(...)` and `__p = Date.now()` used only for build timing.

In `server/routes/wikiRoutes.js`, remove:
- `const __buildStartedAt = Date.now();`
- `let __bp = Date.now();`
- every `console.log(`[build-timing] ...`)`
- every `__bp = Date.now()` used only for timing logs.

Do not touch:
- `streamDraft: false` in onboarding fast options.
- fast-profile reasoning effort.
- `ARTICLE_SOURCE_PROJECTION`
- `FAST_LIBRARY_LIMITS`
- `STANDARD_LIBRARY_LIMITS`
- deferred inbound autolinks.
- save retry on stream-page save conflicts.

- [x] **Step 3: Verify syntax and log removal**

Run:

```bash
node -c server/ai/hfTextClient.js
node -c server/services/wikiMaintenanceService.js
node -c server/routes/wikiRoutes.js
rg -n "hf-timing|build-timing" server/ai/hfTextClient.js server/services/wikiMaintenanceService.js server/routes/wikiRoutes.js || true
```

Expected:
- all `node -c` commands exit 0.
- `rg` returns no matches.

- [x] **Step 4: Run focused backend gates**

Run:

```bash
npm run wiki:maintenance-harness
npx jest server/services/wikiMaintenanceService.claim.test.js --runInBand
node server/routes/__tests__/wikiRoutes.contract.test.js
```

Expected:
- maintenance harness passes 5/5.
- claim test passes 37/37.
- route contract test exits 0.

---

## Task 2: Fix Shared-Wiki Attribution Mislabel

**Files:**
- Modify: `note-taker-ui/src/components/wiki/WikiPageReadView.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiPageReadView.test.jsx`

- [x] **Step 1: Write failing tests**

Add or update tests in `WikiPageReadView.test.jsx` for these cases:

```jsx
it('does not label starter-pack sample pages as adapted from a shared wiki', async () => {
  getWikiPage.mockResolvedValueOnce({
    ...page,
    adoptedFrom: {
      originType: 'starter_pack',
      originCollectionId: 'mental-models',
      originTitle: 'Mental Models',
      packId: 'mental-models',
      sample: true,
      adoptedAt: '2026-06-19T00:00:00.000Z'
    }
  });

  render(<WikiPageReadView pageId="wiki-1" />);

  expect(await screen.findByRole('heading', { name: /portfolio concentration/i })).toBeInTheDocument();
  expect(screen.queryByText(/Adapted from a shared Noeis wiki/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Starter pack sample/i)).toBeInTheDocument();
});

it('does label real adopted shared pages as adapted from a shared wiki', async () => {
  getWikiPage.mockResolvedValueOnce({
    ...page,
    adoptedFrom: {
      originType: 'page',
      originPageId: '665000000000000000000001',
      originSlug: 'opportunity-cost',
      originTitle: 'Opportunity Cost',
      adoptedAt: '2026-06-15T00:00:00.000Z'
    }
  });

  render(<WikiPageReadView pageId="wiki-1" />);

  expect(await screen.findByText(/Adapted from a shared Noeis wiki/i)).toBeInTheDocument();
});

it('does not show adoption attribution for default empty adoptedFrom documents', async () => {
  getWikiPage.mockResolvedValueOnce({
    ...page,
    adoptedFrom: {}
  });

  render(<WikiPageReadView pageId="wiki-1" />);

  expect(await screen.findByRole('heading', { name: /portfolio concentration/i })).toBeInTheDocument();
  expect(screen.queryByText(/Adapted from a shared Noeis wiki/i)).not.toBeInTheDocument();
});
```

If the current test fixture title is not `Portfolio concentration`, use the existing fixture heading instead.

- [x] **Step 2: Run test and confirm failure**

Run:

```bash
cd note-taker-ui
CI=1 npm test -- --watchAll=false --runInBand src/components/wiki/WikiPageReadView.test.jsx
```

Expected before implementation: starter-pack/sample case fails because it renders shared-wiki attribution.

- [x] **Step 3: Implement strict provenance helpers**

In `WikiPageReadView.jsx`, replace the loose helper with explicit helpers:

```jsx
const hasSharedWikiProvenance = (adoptedFrom = {}) => {
  if (!adoptedFrom || typeof adoptedFrom !== 'object') return false;
  if (adoptedFrom.sample || adoptedFrom.originType === 'starter_pack') return false;
  return Boolean(
    adoptedFrom.originPageId
    || adoptedFrom.originCollectionId
  );
};

const hasStarterPackSampleProvenance = (adoptedFrom = {}) => {
  if (!adoptedFrom || typeof adoptedFrom !== 'object') return false;
  return Boolean(adoptedFrom.sample || adoptedFrom.originType === 'starter_pack' || adoptedFrom.packId);
};

const starterPackAttributionLine = (adoptedFrom = {}) => {
  const title = String(adoptedFrom.originTitle || '').trim();
  return title ? `Starter pack sample · ${title}` : 'Starter pack sample';
};
```

Then render:

```jsx
{hasSharedWikiProvenance(page.adoptedFrom) ? (
  <p className="wiki-read__adopted-attribution" role="note">
    {adoptedAttributionLine(page.adoptedFrom)}
  </p>
) : hasStarterPackSampleProvenance(page.adoptedFrom) ? (
  <p className="wiki-read__adopted-attribution wiki-read__adopted-attribution--sample" role="note">
    {starterPackAttributionLine(page.adoptedFrom)}
  </p>
) : null}
```

- [x] **Step 4: Re-run focused frontend test**

Run:

```bash
cd note-taker-ui
CI=1 npm test -- --watchAll=false --runInBand src/components/wiki/WikiPageReadView.test.jsx
```

Expected: all tests pass.

---

## Task 3: Fix First-Run Tour Deep-Link Hijack

**Files:**
- Modify: `note-taker-ui/src/tour/TourManager.jsx`
- Modify: `note-taker-ui/src/tour/TourManager.test.jsx`

- [x] **Step 1: Write failing route-preservation test**

Add tests around the route navigation effect in `TourManager.test.jsx`:

```jsx
it('does not force first-time deep links back to Think home when the tour auto-opens', async () => {
  mockLocation('/wiki/workspace?page=wiki-1');
  fetchTourState.mockResolvedValue({
    status: 'not_started',
    currentStepId: null,
    completedStepIds: [],
    isFirstTimeVisitor: true,
    signals: {}
  });

  renderWithTour(<TourManager />);

  await waitFor(() => {
    expect(startTourOrUpdateStateMock).toHaveBeenCalled();
  });
  expect(navigate).not.toHaveBeenCalledWith('/think?tab=home', expect.anything());
});

it('still navigates when the user explicitly resumes the tour from ?tour=resume', async () => {
  mockLocation('/wiki/workspace?page=wiki-1&tour=resume');
  fetchTourState.mockResolvedValue({
    status: 'paused',
    currentStepId: 'install_extension',
    completedStepIds: [],
    isFirstTimeVisitor: false,
    signals: {}
  });

  renderWithTour(<TourManager />);

  await waitFor(() => {
    expect(navigate).toHaveBeenCalledWith('/think?tab=home', expect.anything());
  });
});
```

Use the existing mock helpers in the file. If helper names differ, keep the assertions equivalent:
- first-time auto-start must not force-navigate away from `/wiki/workspace`, `/connections`, `/share/wiki/:id`.
- explicit `?tour=resume` must still navigate to the current tour step route.

- [x] **Step 2: Implement route policy**

In `TourManager.jsx`, add a helper:

```jsx
const TOUR_AUTONAV_BLOCKED_PREFIXES = [
  '/wiki/workspace',
  '/connections',
  '/integrations',
  '/share/'
];

const shouldAutoNavigateForTour = ({ location, currentStep, explicitResume = false } = {}) => {
  if (!currentStep?.route) return false;
  if (explicitResume) return true;
  const pathname = location?.pathname || '';
  if (TOUR_AUTONAV_BLOCKED_PREFIXES.some(prefix => pathname.startsWith(prefix))) return false;
  return true;
};
```

Track explicit resume:

```jsx
const explicitTourResume = new URLSearchParams(location.search).get(TOUR_RESUME_QUERY) === TOUR_RESUME_VALUE;
```

Update the forced navigation effect:

```jsx
useEffect(() => {
  if (!state.open || !currentStep) return;
  if (routeMatches(location, currentStep.route)) return;
  if (!shouldAutoNavigateForTour({ location, currentStep, explicitResume: explicitTourResume })) return;
  navigate(currentStep.route, { replace: false });
}, [currentStep, explicitTourResume, location, navigate, state.open]);
```

If the explicit resume query is deleted before this effect observes it, preserve it in a `useRef`.

- [x] **Step 3: Re-run tour tests**

Run:

```bash
cd note-taker-ui
CI=1 npm test -- --watchAll=false --runInBand src/tour/TourManager.test.jsx
```

Expected: tests pass.

- [ ] **Step 4: Browser verify**

On production after deploy:

1. Create a fresh production user.
2. Without completing tour, open `/connections`.
3. Expected: URL remains `/connections`; tour may appear, but it does not force the page to `/think?tab=home`.
4. Open `/wiki/workspace?page=<id>` as a fresh user with a seeded page.
5. Expected: URL remains `/wiki/workspace?page=<id>`.

---

## Task 4: Embedding 429 Investigation and Durable Retry Scope

**Files:**
- Inspect: `server/ai/embeddingJobs.js`
- Inspect: `server/ai/embed.js`
- Inspect: `server/services/aiServiceClient.js`
- Inspect: `server/config/aiClient.js`
- Inspect: Render logs/config for `AI_SERVICE_URL`

- [ ] **Step 1: Reproduce from production logs**

Trigger a small import on production:

```bash
POST /api/import/text
```

Expected current bad evidence in Render logs:

```text
[AI-UPSTREAM] /embed → 429 Too Many Requests
ai_upstream.retry value 1..4
❌ Job failed (embedding)
```

- [x] **Step 2: Identify the failing boundary**

Read the embedding path:

```bash
rg -n "enqueueArticleEmbedding|embedText|/embed|computeBackoffMs|retry-after" server/ai server/services server/routes/importRoutes.js
```

Confirm:
- import route enqueues and catches embedding failures.
- `aiServiceClient.js` retries transient upstream failures.
- after final retry, the job is abandoned.
- semantic search depends on successful embedding upserts.

Confirmed from source inspection:
- `server/ai/jobQueue.js` is an in-memory array with no persistent state.
- `server/ai/embeddingJobs.js` registers a handler that calls `embedText(text)` and `upsertVector(...)`; failures bubble to the in-memory queue and are logged.
- `server/services/aiServiceClient.js` has transient retry/backoff handling, but no durable retry after final failure.
- import routes fire-and-forget embedding work, so builds are not blocked but retrieval quality can decay.

- [x] **Step 3: Decide infra vs code fix**

Use this decision table:

| Evidence | Fix |
| --- | --- |
| Render service plan/rate cap causes 429 under normal traffic | Raise plan/limit first, then add alerting |
| Burst concurrency causes 429 | Add process-local throttle immediately |
| Transient 429s recover if delayed | Add durable retry/backlog |
| Embedding service returns missing/huge `retry-after` | Fix service header and client backoff handling |

Decision: repo-side durable retry/backlog is the safer product fix even if upstream capacity is also increased. Raising credits/limits may reduce current 429s, but the app should not permanently drop vectorization jobs when upstream fails.

- [x] **Step 4: Minimum repo-side reliability fix if service cannot be changed immediately**

Implement persistent embedding retry backlog:
- store failed embedding jobs with `collection`, `id`, `text`, `payload`, `attemptCount`, `nextRunAt`, `lastError`.
- drain with a low-concurrency worker.
- keep the existing AI client `retry-after` handling for immediate retries; use durable exponential backoff after final failure because the final error does not reliably expose the upstream header.
- expose high failure-rate metric/log.

Do not block the import request.

Implemented:
- `EmbeddingJob` model with `queued`, `running`, `completed`, `failed`, and terminal `abandoned` states.
- Existing enqueue helpers upsert durable jobs keyed by vector collection/object id.
- Worker claims due/stale jobs, calls `/embed`, upserts vectors, and reschedules failures with exponential backoff.
- Worker runs only when AI indexing is enabled, so disabled/dev environments do not churn failed jobs.
- Worker logs aggregate `[embedding-worker] processed=N failed=N` without blocking import/build requests.
- Focused `server/ai/embeddingJobs.test.js` covers durable upsert, successful drain, retry scheduling, and max-attempt abandonment.

- [ ] **Step 5: Production acceptance**

After infra/code change:
- run `/api/import/text`.
- confirm no permanent `❌ Job failed (embedding)` for the new item.
- confirm either `/embed` succeeds or the job remains in a durable retry state and later succeeds.
- run semantic search for text from the imported item and confirm it appears.

---

## Delegation

### Cursor Prompt

```text
In /Users/athantsokolas/Documents/GitHub/note-taker-3-1, take Push 1 frontend-only tasks from docs/superpowers/plans/2026-06-21-noeis-post-latency-cleanup.md:

1. Fix WikiPageReadView attribution so "Adapted from a shared Noeis wiki" appears only for real shared page/collection adoption, not starter-pack samples or default empty adoptedFrom.
2. Fix TourManager first-run behavior so auto-starting the tour does not force-navigate deep links such as /wiki/workspace, /connections, /integrations, or /share/* back to /think?tab=home. Explicit ?tour=resume should still navigate to the active tour step.

Add focused tests in:
- note-taker-ui/src/components/wiki/WikiPageReadView.test.jsx
- note-taker-ui/src/tour/TourManager.test.jsx

Run:
cd note-taker-ui
CI=1 npm test -- --watchAll=false --runInBand src/components/wiki/WikiPageReadView.test.jsx src/tour/TourManager.test.jsx
CI=true npm run build

Do not touch backend timing logs or embedding code. Report files changed, test output, and any production-browser caveats.
```

### Grok Build Prompt

```text
In /Users/athantsokolas/Documents/GitHub/note-taker-3-1, take the production/user-facing QA slice for docs/superpowers/plans/2026-06-21-noeis-post-latency-cleanup.md:

After Codex/Cursor land Push 1, run browser QA on production:
1. Fresh user opens /connections before completing the tour. Confirm it stays on /connections and does not force-route to /think?tab=home.
2. Fresh user opens /wiki/workspace?page=<seeded page>. Confirm it stays on the wiki page and tour does not hijack the route.
3. A non-adopted onboarding/paste-built wiki page does not show "Adapted from a shared Noeis wiki".
4. A real adopted shared wiki page does show "Adapted from a shared Noeis wiki".
5. Public /share/wiki/:id scrolls on desktop and mobile and does not expose private app chrome.

Capture screenshots and computed evidence. Do not edit code unless explicitly asked.
```

### Codex-Owned Work

I should keep:
- backend timing log cleanup, because it is narrow and easy to verify with grep/node syntax/backend harnesses.
- embedding 429 investigation, because it crosses API code, upstream service behavior, Render logs, and semantic-search quality.

---

## Verification Checklist

Run before Push 1:

```bash
node -c server/ai/hfTextClient.js
node -c server/services/wikiMaintenanceService.js
node -c server/routes/wikiRoutes.js
rg -n "hf-timing|build-timing" server/ai/hfTextClient.js server/services/wikiMaintenanceService.js server/routes/wikiRoutes.js || true
npm run wiki:maintenance-harness
npx jest server/services/wikiMaintenanceService.claim.test.js --runInBand
node server/routes/__tests__/wikiRoutes.contract.test.js
cd note-taker-ui
CI=1 npm test -- --watchAll=false --runInBand src/components/wiki/WikiPageReadView.test.jsx src/tour/TourManager.test.jsx
CI=true npm run build
```

Production checks before declaring done:
- Build a source-backed onboarding wiki page and confirm model output still streams/returns fast.
- Confirm no `[hf-timing]` or `[build-timing]` appears in new Render logs.
- Confirm fresh-user deep links are not hijacked by the tour.
- Confirm attribution behavior on sample vs adopted pages.
