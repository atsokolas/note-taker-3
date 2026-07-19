# Noeis research and publication system

**Status:** Weekend Readings production base landed; private operator-intake increment in implementation
**Date:** 2026-07-19
**Owner:** Athan Tsokolas
**System objective:** Operate one durable research-and-publication practice in which private reading, maintained judgment, selective public proof, decisions, and postmortems remain connected inside canonical Noeis objects.

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

## 1. Directive

This is not a content calendar and it is not a second publishing product.

The system has two complementary output clocks:

- a private weekly reading intake that supplies a reviewed candidate pool;
- a public Weekend Readings Wiki artifact every second weekend, subject to explicit human approval;
- one maintained research focus whose useful life is determined by the question, not the month;
- a monthly decision-grade artifact, substantial chapter, material-change note, or preserved-judgment note when the evidence warrants one;
- a quarterly calibration and workflow-friction review.

The causal order is binding:

> real research -> observed friction -> bounded product change

Noeis remains the canonical internal and public artifact. Distribution outside Noeis remains Athan's job. The publication identity is **Athan Tsokolas, researched and maintained with Noeis**. No new institutional brand is implied.

## 2. Current truth and implementation inventory

### 2.1 Live and repository baseline

- The Daily Loop and Judgment system landed through PR #47. Weekend Readings and the research operating ledger landed through PR #48 at merge `71839eb1`; the release-review hardening landed through PR #49 at exact reviewed tip `599a2f07` and merge `ece79e4c`.
- `https://www.noeis.io/`, `/wiki`, and `/proof` returned HTTP 200 on 2026-07-19. The Render health endpoint returned HTTP 200 with `{"status":"ok","message":"Server is warm."}`. These checks establish availability, not authenticated workflow acceptance.
- No real Weekend Readings artifact has been created or published. Production acceptance is limited to deployment, runtime health, authorization boundaries, and synthetic fixtures.

### 2.2 Existing primitives to reuse

| Need | Existing primitive | Evidence | Decision |
|---|---|---|---|
| Canonical research and publication object | `WikiPage` with private/shared visibility and draft/published status | `server/models/index.js:572-598` | Reuse. An edition is a dated WikiPage; the living thesis is another canonical WikiPage. |
| Source provenance | `sourceRefs` preserve type, object ID, title, snippet, URL, provider, metadata, actor, and created time | `server/models/index.js:314-330` | Reuse and add only a validated research-specific classification contract if the live model still lacks it after Daily Loop lands. |
| Claim connection | Claims carry stable IDs, support, source refs, contradictions, confidence, review time, and append-only history | `server/models/index.js:343-369` | Reuse. Selecting a reading may link to a claim/question but may not auto-change an accepted claim. |
| Source intake | Authenticated `/api/wiki/ingest` creates a durable `WikiSourceEvent` and asynchronously proposes affected pages | `server/routes/wikiRoutes.js:4836-4899` | Reuse for URL intake where appropriate; do not create a new ingestion subsystem. |
| Human disposition | Ingest review supports accept/defer/reject and persists a graph trace only on acceptance | `server/routes/wikiRoutes.js:4925-4983` | Reuse the disposition vocabulary only. The current ingest path mutates matched pages before review and is not an approval-before-change boundary. |
| Direct page attachment | Authenticated page source attachment persists source, refreshes claim derivation, syncs graph, and creates a revision | `server/routes/wikiRoutes.js:4339-4367` | Reuse for editor-controlled edition sources. Add canonical URL dedupe before bulk edition creation. |
| Revision history | `WikiRevision` stores before/after snapshots and promotion state; `createWikiRevision` persists and prunes safely | `server/models/index.js:667-685`; `server/services/wikiRevisionService.js:3-95` | Reuse for draft creation, approval snapshot, thesis phase close, and postmortem changes. |
| Durable operation receipts | `NoeisReceipt` has a unique per-user `receiptId`, status, metrics, touched objects, next action, provenance, error, and completion time | `server/models/index.js:1973-1994`; `server/services/noeisReceiptService.js:25-88` | Reuse for edition continuity/dedupe and research phase completion. |
| Public sharing | Public page route requires `visibility: shared`, excludes archived pages, uses a projection, and passes through an explicit public serializer | `server/routes/wikiRoutes.js:3277-3315` | Reuse. Publication must be one explicit transition after human approval. |
| Public-safe payload | Public serializer reconstructs an allowlisted envelope and strips private wiki-link IDs and claim IDs from body marks | `server/routes/wikiRoutes.js:733-759`; `server/routes/wikiRoutes.js:819-864` | Reuse, but add explicit Weekend Readings and judgment leak tests before shipping new metadata. |
| Public proof privacy tests | Tests assert private user/token/discussion data and source IDs/excerpts do not appear | `server/services/publicProofService.test.js:320-352`; `server/routes/__tests__/wikiRoutes.publicProof.test.js:40-69` | Extend rather than replace. |
| Thesis contract | The Judgment Institution spec requires optional judgment data on WikiPage and forbids a parallel Thesis collection | external spec, sections 5.3, 10.1, and 16 | Daily Loop/Judgment task owns this implementation first. |

### 2.3 Existing operations, not product code

The three email automations already provide candidate discovery and a mature operational discipline:

- direct working links only;
- no books;
- source diversity;
- recent technical work mixed with enduring texts;
- concise rationales;
- 8-15 final candidates;
- dedupe against automation memory and sent-mail history;
- post-send verification by exact Gmail subject/message ID.

These are curation rules. They do not require a new Noeis subsystem. The Sunday Reading Sweep remains the single weekly private intake. The Friday lists are continuity evidence and dedupe inputs; they should not create three competing research queues.

The existing continuity is fragmented across prose memory and Gmail history. Exact URL comparison already found repeated links across Sunday and Friday Curation, including the BlackRock chairman letter, Kingdom Capital Q2 letter, a Nature biological-aging-clocks article, and a Nature trained-immunity article. Friday Papers memory often stores titles rather than exact URLs, so it cannot be completely compared. A unified cross-stream/public-edition dedupe ledger is therefore required.

### 2.4 Demonstrated gaps

Current `main` does not yet prove the following complete contracts:

1. An idempotent operation that creates one dated Weekend Readings draft from selected URLs and stores the selection rationale/classification durably.
2. A distinct review state that cannot be mistaken for public publication.
3. An explicit approval action that snapshots the accepted public revision before setting the page public.
4. A unique edition receipt that prevents the same two-week window or canonical URL set from being republished accidentally.
5. A source-to-active-thesis relation that can be accepted without mutating thesis claims or confidence.
6. A durable monthly phase/postmortem ledger on the canonical thesis page or its receipts.
7. A single operational checklist that makes the first Thesis 001 session possible without inventing Athan's prior.
8. An approval-before-mutation path for thesis relevance. Current `/api/wiki/ingest` attaches evidence, runs maintenance, saves the page, creates a revision, and receipts the change before the later review endpoint records its disposition (`server/services/wikiMaintenanceOrchestrator.js:434-452`, `476-541`, `620-700`).
9. A frozen approved public revision. Current sharing exposes the mutable live page; a later edit can change public output without a second approval.
10. Public cache invalidation when an artifact is unpublished or replaced. Current public-page caching can outlive the visibility change and the HTTP response also permits stale reuse.
11. Safe public URL validation. Normal source normalization accepts arbitrary URL strings, which the shared page later renders as links (`server/routes/wikiRoutes.js:1300-1308`; `note-taker-ui/src/pages/SharedWikiPage.jsx:530-550`).
12. An explicit public-safe maintenance summary. The public proof envelope can derive visible text from private `aiState.changeLog` or `maintenanceSummary`; Weekend Readings must publish only an approved summary.

### 2.5 Afternoon Research operator-intake contract

OpenClaw's producer is cron job `0a35a454-de07-47b7-b8c5-f3229717af35`, **Jarvis Afternoon Research Brief**, scheduled for 15:00 America/Chicago. OpenClaw remains an upstream private producer. It may write the dated and `latest.json` handoffs under `state/noeis-intake/afternoon-research/`, but it may not mutate Noeis, attach evidence to accepted claims, approve, publish, email, or distribute.

The safe integration is deliberately split:

1. A local read-only collector reads only the fixed OpenClaw handoff directory and the three fixed Sunday/Friday automation-memory files. It rejects symlinks, nonregular or oversized files, detects changes during reads, and never fetches or executes source content.
2. The collector validates the OpenClaw schema, 3-5 item bound, exact producer job ID, unique external IDs and canonical URLs, safe URLs, and `requiresHumanAcceptance=true`.
3. It locally parses dated URL-bearing Sunday/Friday memory sections. Friday Research Papers prose memory is reported as incomplete rather than having URLs invented.
4. It sends only normalized candidates and sanitized provenance to the human-only, non-mutating `POST /api/wiki/weekend-readings/intake/preview` endpoint. Raw automation memory and local absolute paths do not enter Noeis.
5. Noeis canonicalizes and dedupes across producers and against owner-scoped, digest-valid published-edition receipts. Draft, review, and approved-but-unpublished receipts do not count as prior public editions.
6. The preview returns candidates with `accepted=false`, `requiresHumanAcceptance=true`, and explicit missing human editorial fields. It creates no WikiPage, revision, receipt, connection, approval, or publication.
7. The existing human-only draft creator repeats the prior-published-edition check immediately before any write. Selected intake provenance is stored privately in source metadata and remains excluded by the public serializer.

This is an operator intake, not a second CMS or autonomous research agent. Athan still supplies selection, source quality, public-safe relationship/boundary copy, editorial note, approval, publication, and all distribution.

## 3. Ownership fence and landed handoff

The Daily/Judgment task `019f7b94-690d-72e0-9c08-4b1bd0810220` landed PR #47 at merge `3de6adbf`. The fence below governed the investigation and isolated implementation phases and prevented pre-handoff collisions.

It currently owns or is actively editing:

- `server/models/index.js`
- `server/server.js`
- `server/services/wikiMaintenanceService.js`
- `server/services/dailyLoopService.js` and tests
- `server/services/readingWatcherService.js` and tests
- `server/services/morningPaperEmailService.js` and tests
- `server/routes/dailyLoopRoutes.js` and tests
- `note-taker-ui/src/api/dailyLoop.js`
- `WikiFrontPage.jsx` and tests/styles
- `WikiPageReadView.jsx` and tests/styles
- `renderTiptapDoc.jsx`
- `wikiPageMetrics.js`
- Settings and morning-paper settings files
- `.env.example`

After the handoff, the publication branch rebased cleanly and changed only the demonstrated shared seams: `wikiRoutes.js`, `WikiPageReadView.jsx`, their tests, and the Wiki API. It did not alter the landed Judgment model, serializer allowlist for `judgment`, revision-retention rules, causal-model contract, or agent decision constraints.

Owned implementation remains:

- this specification and later dated evidence artifacts;
- read-only current/live investigation;
- operating templates and interview protocol;
- narrowly named Weekend Readings services, routes, fixtures, operator controls, public-reader mode, QA scripts, and the smallest shared route/API wiring against the landed base.

## 4. Operating system

### 4.1 Weekly private intake — Sunday Reading Sweep

The sweep remains private and weekly. It produces 8-15 candidates, not a publication draft.

For every candidate preserve:

- canonical direct URL;
- title, source/provider, and publication date when known;
- one concise reason it matters;
- likely affected thesis claim, unknown, falsifier, or research question when one exists;
- classification: `thesis_evidence`, `counterevidence`, `context`, or `intellectual_broadening`;
- source quality and whether the item is primary or secondary;
- the prior sweep/public edition against which it was deduped.

An item may remain `unassigned`. Broadening is legitimate and must not be forced into Thesis 001.

### 4.2 Biweekly public artifact — Weekend Readings

Every second weekend, Athan selects from the prior two private sweeps. The edition is not a generic link list.

Each selected item must include:

1. linked title and direct URL;
2. why it matters;
3. the claim, unknown, falsifier, or question it may affect, or an explicit `unassigned` label;
4. one classification label;
5. a boundary statement when the item is context rather than evidence;
6. source date/provenance.

The edition-level header contains:

- edition number and covered two-week window;
- publication date;
- author line: `Athan Tsokolas — researched and maintained with Noeis`;
- a one-paragraph editorial note explaining the period's main intellectual pressure;
- links to the active public-safe thesis artifact only when one has already been approved.

Draft lifecycle:

```text
private candidate pool
  -> private Weekend Readings draft
  -> Athan review requested
  -> changes requested or approved revision
  -> explicit publish action
  -> shared canonical Wiki URL + publication receipt
```

No automated job may cross the `approved revision -> publish` boundary.

### 4.3 Monthly maintained-research rhythm

The calendar determines review cadence, not when the thesis is abandoned.

| Week | Required work | Durable result |
|---|---|---|
| 1 — Frame | Record governing question, prior, decision posture, decision at stake, causal model, unknowns, assumptions, falsifiers, and completion test | Immutable initial revision for a new thesis, or a dated framing revision for a continuing thesis |
| 2 — Evidence | Gather a bounded high-quality evidence set; attach each material item to a claim/unknown/falsifier; separate direct evidence from inference | Source events, graph edges, candidate claim implications, and a phase receipt |
| 3 — Challenge | Run the Critic/red team; surface counterevidence, missing base rates, alternative models, and proposed confidence changes | Review queue with human accept/reject/defer/preserve dispositions; no silent mutation |
| 4 — Decide | Record a real public-equity action posture first; record founder/company-creation implications secondarily; create a public-safe artifact only if warranted | Decision record, accepted revision or preserved-judgment note, optional approved publication, and postmortem |

Allowed month-end outputs:

- complete decision-grade thesis;
- substantial chapter;
- material-change note;
- preserved-judgment note documenting why new evidence did not change the judgment.

Filler is forbidden. A continuing thesis remains the same maintained object across months.

### 4.4 Quarterly calibration and friction review

Quarterly review separates:

- forecast calibration;
- decision-process quality;
- outcome quality;
- source quality and diversity;
- accepted, rejected, deferred, and preserved changes;
- maintenance value versus writing a fresh report;
- workflow friction observed repeatedly;
- the smallest product delta justified by that friction.

No product request enters the next build queue unless it removes demonstrated friction in framing, preserving priors, connecting evidence, challenging claims, reviewing belief changes, recording decisions, returning on a truth clock, or evaluating outcomes.

## 5. Minimal durable software contract after the ownership gate

### 5.1 Reuse boundaries

- `WikiPage` is the only root content object.
- `WikiRevision` preserves drafts, approvals, monthly states, and postmortem changes.
- `WikiSourceEvent` represents selected URL intake and candidate thesis effects.
- `Connection` represents accepted source/page and edition/thesis relationships.
- `NoeisReceipt` is the idempotent operational ledger.
- Existing public Wiki routes are the only public CMS surface.

Do not create `WeekendReading`, `Thesis`, `ResearchProgram`, or a second publication collection.

### 5.2 Edition identity and dedupe

Use a deterministic edition key:

```text
weekend-readings:<owner-id>:<window-start>:<window-end>
```

Persist a `NoeisReceipt` for each state transition using stable suffixes such as `:draft`, `:approval`, and `:published`. The receipt should include:

- page ID and revision ID;
- covered window;
- canonicalized selected URLs and their hashes;
- source count and classification counts;
- prior edition ID;
- status and approval actor/time;
- public URL only after publication;
- exact next action.

Creation must be idempotent by edition key. URL dedupe uses a canonical URL identity with tracking parameters and fragments removed; title similarity is a review signal, not a destructive automatic merge.

The existing page-creation API cannot provide this draft operation unchanged: initial sources are capped at eight (`server/routes/wikiRoutes.js:1318-1349`), while direct source attachment has no canonical-URL dedupe (`server/routes/wikiRoutes.js:4339-4367`).

### 5.3 Provenance and classification

The durable source record needs validated fields equivalent to:

```json
{
  "canonicalUrl": "https://example.com/direct-source",
  "publishedAt": "2026-07-18T00:00:00.000Z",
  "sourceQuality": "primary|high_quality_secondary|secondary|unknown",
  "readingRole": "thesis_evidence|counterevidence|context|intellectual_broadening",
  "whyItMatters": "...",
  "affectedClaimIds": [],
  "affectedUnknownIds": [],
  "affectedFalsifierIds": [],
  "reviewDisposition": "unreviewed|accepted|deferred|rejected"
}
```

These fields may live in validated source metadata if that remains compatible with the landed model. Public output must not serialize the metadata wholesale. Public copy should be deliberately rendered from an allowlist into the page body and safe source references.

### 5.4 Approval and publication invariant

Publication requires all of the following in one authenticated, owner-only operation:

1. the page is still private;
2. the supplied revision ID matches the current reviewed draft;
3. all selected URLs are direct and canonicalized;
4. every public source URL uses an allowed network scheme (`https:` by default, `http:` only when explicitly accepted);
5. no item is missing `whyItMatters` or `readingRole`;
6. the public serializer leak test passes for the payload shape;
7. public maintenance/change copy is explicitly approved and does not derive from private agent state;
8. Athan explicitly approves this exact revision;
9. an approval revision/receipt is persisted before `visibility = shared` and `status = published`;
10. the publication receipt records the resulting public URL;
11. the public route reads the approved revision snapshot for this artifact, not the mutable current page;
12. publication, replacement, unpublication, and archival invalidate every cache key for the page ID and slug.

Approval is not inferred from draft completeness, a scheduler, an agent recommendation, or a prior edition.

### 5.5 Thesis connection invariant

A proposed reading-to-thesis connection must be stored without invoking the current auto-maintenance ingest path. After human acceptance, it may:

- attach a source reference;
- create bidirectional graph edges;
- identify affected claim/unknown/falsifier IDs;
- queue a review proposal.

It may not:

- change claim support, epistemic status, text, or confidence;
- change thesis confidence or current judgment;
- mark an unknown answered;
- mark a falsifier triggered;
- publish either object.

Those consequential changes require a separate human disposition and revision.

### 5.6 Monthly research ledger

Do not add a parallel program model. Record monthly status through a small current-state contract on the active thesis page, revision snapshots, and phase receipts:

- cycle month and current phase;
- weekly objective and completion test;
- prioritized unknown;
- evidence added and affected IDs;
- Critic run and human disposition counts;
- decision/no-action record ID;
- artifact type and publication state;
- observed workflow friction;
- next review date or event trigger.

The page holds current truth; revisions hold history; receipts hold operational continuity.

### 5.7 Implemented collision-free contracts

The isolated implementation now provides:

- owner-scoped edition identity: `weekend-readings:<owner-id>:<window-start>:<window-end>`;
- private draft creation with canonical URL dedupe, durable source classifications, a Wiki revision, and a draft receipt;
- exact-revision review, approval, and publication receipts with three different literal confirmation strings;
- SHA-256 integrity binding for the approved public artifact snapshot;
- publication refusal after the current draft revision diverges from the approved revision;
- public serialization rebuilt from an allowlisted approved snapshot rather than the mutable WikiPage;
- a hostile leak fixture containing private claim, question, unknown, falsifier, thesis-page, discussion, and agent-state sentinels;
- a private monthly operating ledger implemented as `WikiPage(pageType=log)` plus Wiki revisions and idempotent phase receipts;
- a read-only Playwright CLI scaffold for 1440px Chrome, 1366px WebKit, and 430px WebKit acceptance.

The shared integration patch after the Judgment handoff is intentionally small and complete locally:

1. Mount authenticated draft/review/approve/publish handlers that delegate to `weekendReadingsWorkflowService`.
2. On explicit publish, set the canonical page to `shared/published`, invalidate page-ID and slug cache keys, and preserve the approval/publication receipts.
3. In the existing public Wiki page route, detect Weekend Readings pages and call `loadPublishedWeekendReadingsArtifact`; return 404 when it fails closed instead of falling through to the generic mutable-page serializer.
4. Expose derived approval state through an authenticated status endpoint without exposing receipt provenance publicly.
5. Add the smallest reader controls and status copy necessary for review, approval, publication, and stale-revision handling.
6. Run fixture-backed route leak tests before any browser or deployment acceptance.

## 6. Thesis 001 day-zero readiness gate

The system is ready for the real 60-90 minute session only when Athan can complete the following without any generated substantive answer being inserted for him:

1. Confirm the governing question and research boundary.
2. State the provisional direct answer before research.
3. Set overall confidence and identify its weakest component.
4. Add 10-15 material claims with epistemic status, support, materiality, and confidence.
5. Draw or describe the causal model.
6. Add the strongest counterargument.
7. Add three to five assumptions and three to five unknowns.
8. Add observable falsifiers.
9. Record public-equity decision implications first and founder/company-creation implications secondarily.
10. Save the immutable initial-judgment revision.

The agent may facilitate, challenge ambiguity, and check completeness. It must not supply Athan's experience, beliefs, confidence, claims, falsifiers, or decision. QA/demo content may test mechanics only.

### Guided session agenda

- **0-10 minutes:** question, boundary, decision at stake.
- **10-25 minutes:** direct answer and value-stack ranking.
- **25-45 minutes:** claims and causal model.
- **45-60 minutes:** counterargument, assumptions, unknowns, falsifiers.
- **60-75 minutes:** confidence and public-equity implications.
- **75-90 minutes:** completeness review and immutable snapshot.

The next user action at the readiness checkpoint is exact: **Athan opens Living Thesis 001 in Noeis and completes this guided session before external thesis research begins.**

## 7. Weekend Readings UX contract

The public artifact hierarchy is:

1. one page title;
2. edition number and covered dates;
3. Athan byline and approved publication date/revision;
4. editorial note;
5. selected readings;
6. optional connected maintained research, only when that thesis artifact is already public;
7. publication record and references.

Each item renders in this order:

1. linked title;
2. publisher/source, source date, and source-quality label;
3. why it matters;
4. evidence/context role;
5. separately authored public-safe relationship or explicit `Unassigned`;
6. boundary statement when it is context rather than direct evidence.

Do not expose a private claim/question string merely because it was used internally for routing. Do not repeat the page title inside the body. The table of contents should list editorial sections, not all 8-15 source titles. Generic adoption, word-count, zero-claim, and maintenance chrome must not precede or overwhelm the editorial artifact.

Approval-state copy must be literal and visible without relying on color:

- `Private draft — not public`
- `Review requested — still private`
- `Approved revision — not published`
- `Draft changed after approval — reapproval required`
- `Published — revision <short id>`

`Approve this revision` and `Publish approved revision` are separate actions. Editing after approval disables publication of the changed draft and leaves the previously approved public snapshot unchanged.

Responsive/accessibility acceptance:

- At desktop, approximately 1280-1400px with sidebar-reduced usable width, and approximately 430px mobile: one readable column, no horizontal clipping, no title/byline duplication, and no item-title wall before the first reading.
- Links use article titles rather than raw URLs, expose visible keyboard focus, and have usable touch targets.
- Approval actions and state text remain operable at 200% zoom; mobile actions are at least 44px high.
- Status changes use `role="status"`; stale approval and publication failures use `role="alert"` without moving focus unexpectedly.
- Long titles, provenance text, and URLs wrap rather than being hidden by overflow.

## 8. Verification and evidence plan

Verification on the landed Daily Loop/Judgment base:

1. Rebase this worktree on the landed commit and re-run the inventory.
2. Add focused backend tests for edition idempotency, URL canonicalization, classification validation, approval race/stale revision rejection, receipts, and no claim auto-mutation.
3. Extend public serializer tests for source metadata, private thesis fields, internal IDs, decisions, review notes, agent state, and unapproved drafts.
4. Add focused frontend tests only if a new review surface is demonstrated as necessary.
5. Run `npm run wiki:qa`.
6. Run `CI=true npm run build` from `note-taker-ui`.
7. For user-facing changes, test desktop, 1280-1400px, and approximately 430px.
8. Use QA seed data for draft/approval/leak tests.
9. Land and deploy before live claims; verify Vercel and Render separately.
10. Create a new dated evidence directory and stage only owned artifacts.

Live acceptance must prove:

- one private dated draft can be created from selected URLs;
- re-running the same window does not create a duplicate;
- classification and provenance survive reload;
- the source can connect to Thesis 001 without changing an accepted claim;
- an unapproved/private draft is unreachable publicly;
- an explicitly approved revision produces one canonical `/share/wiki/:idOrSlug` output;
- public output excludes private fields and internal metadata;
- a publication receipt points to the exact page and revision.

## 9. Phased plan and current status

| Phase | Deliverable | Status |
|---|---|---|
| 0. Preflight and ownership | Governing docs read, worktree/live truth checked, Daily Loop fence recorded | Complete |
| 1. Independent inventory | Ingestion, automation continuity, privacy/approval, and UX investigations | Complete |
| 2. Operating/spec contract | This evidence-backed specification and operating runbook | Complete |
| 3. Low-collision implementation | Private draft builder, provenance/dedupe, approval, receipts, operating ledger, and public serializer | Complete |
| 4. Shared integration and verification | Authenticated routes, operator controls, immutable public reader, leak checks, full Wiki QA/build, responsive browser QA | Complete locally on `3de6adbf` |
| 5. Landing and live proof | PR #48/#49, deployment, live route and UI acceptance | Complete for the base at merge `ece79e4c`; no real artifact created |
| 5A. Private operator intake | Fixed-path collector, schema/parser, receipt-backed preview dedupe, provenance/leak gates | In progress on a fresh branch from `ece79e4c` |
| 6. Real operation | Guided day-zero Thesis 001 session | Pending Athan only when product readiness is proven |

**Overall completion against the original pass:** 100% through landed/deployed Weekend Readings base; real operation remains intentionally user-gated. **Current intake increment:** implementation and focused verification in progress.
**Deviation:** no frontend intake form is being added. Current operating evidence supports a backend/operator CLI preview; the existing Wiki reader owns review/approval once a private draft exists.
**Standout deliverable:** one revision-bound manual publication path that turns private biweekly selection into an immutable public Wiki artifact while preserving thesis connections as proposals and monthly continuity in existing Wiki/revision/receipt primitives.

## 10. Non-goals

- autonomous publishing;
- autonomous social or email distribution of public artifacts;
- a new institutional brand;
- a generic newsletter CMS;
- a parallel thesis or research-program model;
- a second source-ingestion pipeline;
- automatic acceptance of evidence or claim changes;
- weekly filler or forced monthly thesis replacement;
- brokerage, trade execution, or founder outreach;
- claims that monthly or quarterly outcomes have occurred before time passes.
