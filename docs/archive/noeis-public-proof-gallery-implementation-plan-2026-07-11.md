# Noeis public proof gallery — grounded implementation plan

**Date:** 2026-07-11
**Mode:** investigation and planning only; no product code changed
**Confidence:** high on repository state and logged-out production state; moderate on authenticated production state where the newest evidence is a saved QA artifact rather than a fresh mutation

## 2026-07-16 source-policy decision

Noeis uses free sources only for the current proof phase. SEC EDGAR is the required authoritative Alphabet maintenance clock. Paid earnings-transcript providers, including FMP, are disabled and transcript evidence is optional enrichment rather than an acceptance requirement. “Proven” for Alphabet must be described narrowly as filing-maintained proof; it must not imply transcript monitoring. The remaining editorial and privacy gates still apply: a substantive SEC event, its promoted maintenance revision, preserved claim evidence, an explicit accepted-through record, a material receipt, human acceptance, and public-safe serialization.

## Executive recommendation

Build the proof as one maintained-object system, not as investing and developer modes. The public gallery should be a curated registry of six individual shared objects. Each object keeps its private `WikiPage` and existing monitor data; the public API exposes only a deliberately sanitized maintenance proof envelope. The gallery reads that envelope and links directly to the object.

The first implementation push should replace the generic starter-pack gallery with the six real objects and extend the public serializer with safe maintenance facts. This is the shortest path to a real one-click public proof and should not wait for a new connector.

For repo wikis, use a **hybrid model**: one canonical maintained repo object with stable structured sections, plus optional generated public subpages only for unusually large sections or the maintenance comparison. Do not make five independently maintained pages. Independent pages multiply leases, source attachment, publication state, drift decisions, and broken-link risk without improving the first-read experience.

The investing proof is not yet complete. EDGAR and transcript watchers can create durable source events, scheduled workers exist, and generic maintenance can persist claims and revisions. What is missing is a production-proven event-to-claim-delta-to-receipt contract, Morning Paper surfacing, and a public-safe freshness envelope on one real company dossier.

## Evidence reviewed

- Full source spec: `docs/noeis-public-proof-gallery-spec-2026-07-03.md`.
- Dirty tree and recent history through `54154fb6` (`Track repo wiki generator version`).
- Required implementation files, their focused tests, scheduled workers, public serializers, shared-page rendering, claim ledger, Morning Paper briefing, Readwise route test, and public gallery.
- Saved production/browser artifacts under `output/`, especially:
  - `edgar-watch-production-smoke-2026-07-04/`
  - `transcript-watch-ui-2026-07-04/`
  - `repo-wiki-create-production-qa-2026-07-04/`
  - `repo-publication-state-qa-2026-07-10/`
  - `repo-wiki-developer-handoff-live-2026-07-11-final3/`
  - `morning-paper-return-loop-qa-2026-06-03-rerun/`
  - `return-loop-live-2026-06-29T21-38-44-297Z/`
  - `p1-filing-thread-live-verification-2026-07-03/`
- Fresh logged-out production probes on 2026-07-11:
  - `/api/public/wiki/collections/value-investing` and `/mental-models` return starter-pack pages, not founder corpus pages.
  - Starter pages have one scaffold source and zero claims; `Margin of Safety` and `Circle of Competence` are short starter copy.
  - The deployed frontend bundle is `main.0a3e92c9.js` and still contains `See a living dossier`; it does not contain the current dirty-tree direct-link copy.
- Focused test run on 2026-07-11: EDGAR, transcript, GitHub watcher, publication shielding, repo lease, and Readwise sync suites all passed (6/6 files).

## Worktree ownership and collision report

The worktree was already dirty before this plan. Preserve all of it.

| Surface | Current local state | Ownership implication |
|---|---|---|
| `note-taker-ui/src/pages/Landing.jsx` | Modified: homepage CTA changed from `/proof` to the starter collection `/share/wiki/collection/value-investing` | Overlaps Push 1. Treat as another agent/user-owned slice; reconcile rather than overwrite. Its target is still not a real flagship page. |
| `note-taker-ui/src/pages/PublicProofGallery.jsx` | Modified: collection cards link to the first starter page | Overlaps Push 1. Preserve intent, but the planned registry must replace generic collection data. |
| `note-taker-ui/src/pages/PublicProofGallery.test.jsx` | Modified for lead-page links | Same ownership seam as gallery. |
| `note-taker-ui/src/styles/seo-article.css` | Modified for gallery page links | Same ownership seam as gallery. |
| `AGENTS.md` | Modified | Unrelated; do not touch. |
| `output/**` | Many untracked QA artifacts from multiple agents | Evidence only; do not delete or bulk-add. New QA must use a new dated directory. |

No implementation push should begin until the owner of the four public-proof frontend files confirms handoff or lands their changes.

## Spec-to-current-state matrix

### Done and production-proven

| Capability | Evidence and qualification |
|---|---|
| Public shared wiki route without auth chrome | `/share/wiki/:idOrSlug` and public API route exist; public page tests cover logged-out rendering and adoption. |
| Safe public serializer foundation | `serializePublicWikiPage()` exposes body, plain text, safe source fields, counts, and reviewed timestamps while omitting user ID, private highlights, backlinks, notes, full claims, and agent state. |
| Structured `Article` metadata on individual shared pages | `SharedWikiPage.jsx` emits canonical metadata, `Article`, dates, citations, word/source/claim signals, and `about`. |
| GitHub public-repo creation, ingestion, polling, source refs, releases, and recent commits | Current service and routes plus successful later live repo artifacts supersede the July 4 token-blocked run. |
| Repo publication leases and candidate shielding | Durable page/head lease, `publishedHeadSha`, `candidateHeadSha`, `buildStatus`, candidate rejection, and last-known-good preservation are implemented and focused tests pass. |
| Repo generator version tracking | `repoWikiGeneratorVersion.js` and watcher staleness logic are on current `main`. |
| Real Noeis repo dossier generation | July 11 live artifact shows a ready page, quickstart, concrete paths, structured sections, current-through SHA, desktop/mobile rendering, and no horizontal overflow. |
| EDGAR production route/control availability | Production smoke artifact shows the public proof and shared collection surfaces after EDGAR watcher deployment; route and UI exist. This is not proof of the full investing loop. |
| Morning Paper can surface recent source/material and maintenance signals | Later June 29 live artifact shows Return Path, new sources, evidence surfaced, and recently grown pages. The older June 28 stub artifact is stale relative to this later proof. |

### Built but not production-proven

| Capability | What is built | Missing proof |
|---|---|---|
| EDGAR watcher end to end | Ticker/CIK resolution, real SEC fetch, tracked forms, durable deduped `WikiSourceEvent`, manual check, scheduler | No saved real-company artifact proves filing ingestion → maintained claim changes → durable receipt → Morning Paper → public dossier. |
| Earnings transcript watcher end to end | FMP client, transcript metadata/detail fetch, durable source event, manual check, scheduler, entity-dossier UI | Saved UI run failed because `FMP_API_KEY` was absent. No production transcript body/source/maintenance proof exists. |
| Claim support/history ledger | Maintenance derives claim support, citations, contradictions, confidence, history, and section maintenance plan | No production acceptance artifact compares pre/post claims for a real external event. Current history labels are generic `created`/`updated`/`reviewed`, not the product-level delta taxonomy. |
| Source-event worker into maintenance | Pending events are claimed and processed through the maintenance orchestrator | No proof that an EDGAR/transcript event reliably targets the acceptance dossier and produces all downstream surfaces exactly once. |
| Durable Noeis receipts and Morning Paper receipt ingestion | `NoeisReceipt`, persistence service, and briefing collection are implemented | Watcher/maintenance runs do not visibly persist an investing-specific receipt contract. Briefing sanitizer is still import-shaped. |
| Public repo publication-state UI | Local/mocked matrix covers current/rebuilding/needs-review/legacy | The July 10 artifact reported production bundle lag. A newer live repo artifact proves ready/current facts in the authenticated reader, but not public sharing of them. |
| Readwise sync | Focused route test passes; existing importer persists Reader-like articles/highlights into Library | No real-account artifact traces a specific Reader newsletter item into Library and then into a dossier claim/source ref. |

### Partially implemented

| Capability | Current gap |
|---|---|
| Public proof gallery | `/proof` is a collection of generic starter packs. It is not the required six-object registry; cards lack latest material maintenance event and truthful per-object clocks. |
| Homepage one-click proof | Production CTA goes to `/proof`. Dirty local code goes to a generic starter collection. Neither is the real flagship `Alphabet is Berkshire Hathaway 2.0` page. |
| Public-safe freshness | Public pages expose `lastReviewedAt`, counts, and citations, but not current-through source version/date, external clock, or latest material maintenance event. |
| Public privacy explanation | Gallery copy explains broad withholding; individual pages need an explicit stable privacy line tied to the serializer contract. |
| Investing comparison semantics | Claims retain history, but there is no durable run-level manifest classifying changed, gained support, contradicted, removed, or unchanged claims. |
| Repo “day one versus maintained” proof | Current and candidate heads exist, revisions exist, refs exist, but no baseline snapshot/comparison model or public comparison serializer/page exists. |
| Repo product shape | One long dossier is useful but very long (17k–27k px in saved browser evidence). It has the right semantic sections but no compact overview/navigation strategy or comparison subpage. |
| Curated public content | Required real founder pages have not been identified by stable IDs, audited, shared, or registered. Current public collection content is scaffold content. |

### Missing

| Capability | Required addition |
|---|---|
| Curated public-proof registry | Stable server-owned registry or database collection mapping six proof slots to real page IDs/slugs, clocks, order, and editorial labels. |
| Maintenance proof envelope | Public-safe schema for clock, current-through version/date/label, latest material event, last reviewed, source/claim counts, and public URL. |
| Run-level claim delta | Durable comparison of before/after claim ledgers tied to source event(s), maintenance run, revision, and receipt. |
| Investing maintenance receipt | Persisted receipt with filing/transcript identity, page, outcome counts, review link, and public-safe summary. |
| Public comparison artifact | Baseline + current repo version, repository deltas, claim deltas, static-wiki errors, supporting refs, and screenshotable shared page. |
| Production acceptance harness | A repeatable real-account script for the full dossier sequence with redacted JSON and desktop/mobile logged-out screenshots. |
| Public fleet operating manifest | Selected 10–15 repos, owners, cadence, page IDs, health, published head, last accepted build, and generator version. |

### Intentionally deferred

- Plaid/SnapTrade, brokerage onboarding, holdings, and top-five dossier creation.
- Plain RSS connector. First prove Reader ingestion using the existing Readwise path.
- Private GitHub repositories and GitHub OAuth/App installation.
- GitHub webhooks; six-hour polling is sufficient for the proof fleet.
- Gmail research ingestion.
- Enterprise market-data providers.
- Fundamentals/news feed for the first acceptance proof. Filing plus transcript evidence is sufficient to prove maintenance; add fundamentals/news only if the Alphabet thesis has a specific claim that cannot be responsibly tested by those two clocks.

## Target data contracts

### Public maintenance proof envelope

Add a deliberately constructed public object; never pass `externalWatches`, revisions, claims, receipts, or agent state through wholesale.

```js
maintenanceProof: {
  clock: { type: 'sec_edgar|earnings_transcript|github|reading|manual', label: '...' },
  currentThrough: { label: '10-Q filed 2026-07-XX|commit abc1234', at: Date, ref: 'public-safe ref' },
  lastReviewedAt: Date,
  latestMaterialEvent: { type: 'filing|transcript|repo_release|repo_head|reading', summary: '...', at: Date },
  sourceCount: Number,
  claimCount: Number
}
```

Only values derived from accepted/published state may appear. For repo pages, `currentThrough` must use `publishedHeadSha`, never merely `lastHeadSha` or `candidateHeadSha`. For investing pages, it must use the newest source event included in the accepted revision, not merely the newest observed filing/transcript.

### Maintenance comparison manifest

Persist a run-level immutable manifest, preferably on `WikiMaintenanceRun.metadata.comparison` for the first slice; promote to a dedicated model only if query/retention needs demand it.

```js
{
  baselineRevisionId,
  resultingRevisionId,
  sourceEventIds,
  observedVersion,
  publishedVersion,
  claimDeltas: {
    added: [],
    changed: [],
    gainedSupport: [],
    contradicted: [],
    preserved: [],
    removed: []
  },
  evidenceRefs: [],
  summary,
  createdAt
}
```

Claim matching must use stable `claimId` first and a normalized identity fallback. “Unchanged” means identical text/support/evidence after review; it cannot be inferred merely because a claim still exists.

## Bounded push sequence

## Push 1 — Curate and ship the six-object public proof

**Product outcome**

A logged-out visitor clicks the homepage once and lands on the real Alphabet dossier. `/proof` lists exactly the six initial objects: Alphabet, Margin of Safety, Circle of Competence, one market map, one live question, and the Noeis repo wiki. Each card and shared page truthfully shows its clock, current-through fact, last review, latest material event, counts, direct link, and privacy statement.

**Likely code/data surfaces**

- Existing dirty ownership seam: `note-taker-ui/src/pages/Landing.jsx`, `PublicProofGallery.jsx`, `PublicProofGallery.test.jsx`, `styles/seo-article.css`.
- `server/routes/wikiRoutes.js` public serializer and new proof-registry read route.
- `note-taker-ui/src/pages/SharedWikiPage.jsx` and tests.
- `note-taker-ui/src/api/wiki.js`.
- `server/models/index.js` only if a database-backed registry is chosen; prefer a small environment/config registry keyed by stable page IDs for v1.
- Content operations on six existing private `WikiPage` records: IDs/slugs, sharing, titles, sources, review state, and public eligibility.

**Acceptance criteria**

- Gallery returns six individual objects, not starter collections.
- Homepage primary proof CTA targets the Alphabet shared-page URL directly.
- Every proof field is populated from accepted state; no “next” clocks or fabricated event copy.
- Individual shared pages repeat the maintenance stamp and state: public article/references are shown; private highlights, backlinks, notes, library context, and agent state are withheld.
- JSON-LD validates as `CollectionPage`/`ItemList` and each page validates as `Article` with `dateReviewed`, `dateModified`, `about`, and citations.
- Unknown/unavailable proof data is omitted or says “No accepted maintenance event yet”; it never falls back to `updatedAt` as a material event.

**Automated tests**

- Public serializer allowlist/denylist tests including all private-field classes.
- Registry route tests: order, missing/private/ineligible page behavior, stable direct URLs.
- Gallery tests for six entries and required fields.
- Shared-page tests for stamp, privacy line, JSON-LD, and repo `publishedHeadSha` semantics.
- Homepage CTA route test.
- `CI=true npm run build` in `note-taker-ui/`.

**Real-account/logged-out browser proof**

- Curate/share via founder account; record stable IDs and public URLs.
- Logged out at 1440, 1280, and 430 px: homepage → Alphabet in one click; `/proof` → each of six pages; no auth chrome or horizontal overflow.
- Time-to-comprehension test with one cold visitor: identify “maintained, not generated,” the clock, current-through fact, and privacy boundary within 20 seconds.
- Save rendered `<head>`, structured-data validator output, API envelopes, and screenshots under a new dated `output/public-proof-gallery-*` folder.

**Deployment dependency:** Render first for public API/serializer, content curation/share operations, then Vercel. Both.

**Rollback/data safety**

- Registry changes are reversible. Do not rewrite or clone private pages to publish them.
- Snapshot each page and current visibility before curation.
- Public serializer remains an explicit allowlist. If a proof envelope cannot be derived safely, omit it.
- Unshare by registry removal plus `visibility=private`; verify public API returns 404.

## Push 2 — Prove the Alphabet investing loop end to end

**Product outcome**

One real Alphabet dossier accepts a real SEC filing and a real earnings transcript, produces accepted maintenance with explicit claim deltas, persists a durable receipt, appears in Morning Paper, and shows public-safe freshness on the shared page.

**Likely code/data surfaces**

- `server/services/edgarWatcherService.js`, `earningsTranscriptWatcherService.js`.
- `server/services/wikiSourceEventWorker.js`, `wikiMaintenanceOrchestrator.js`, `wikiMaintenanceService.js`, `wikiMaintenancePublicationService.js`.
- `server/services/noeisReceiptService.js`, `wikiBriefingService.js`.
- `server/models/index.js` for comparison metadata if current Mixed metadata is insufficient.
- `server/routes/wikiRoutes.js` watcher checks, maintenance response, briefing, and public proof serialization.
- `note-taker-ui/src/components/wiki/WikiEdgarWatchControl.jsx`, transcript watch component, `WikiPageReadView.jsx`, `WikiFrontPage.jsx`, and `SystemStatusContext` producers.
- New repeatable verification script modeled on `scripts/verify_repo_wiki_live.js`.

**Acceptance criteria**

1. Alphabet ticker is attached and resolves to the correct CIK.
2. A real filing creates one deduped event with accession/form/date/SEC URL and durable source evidence.
3. A real transcript creates one deduped event with ticker/quarter/year/date/provider URL or provider identity and substantive text.
4. Both events are attached to the same dossier and included in an accepted revision.
5. The run manifest reports claim `added`, `changed`, `gainedSupport`, `contradicted`, `preserved`, and `removed` counts with affected claim IDs; empty classes are explicit.
6. The accepted page and claim ledger survive reload; a rejected candidate leaves the trusted page unchanged.
7. A durable `NoeisReceipt` links source events, maintenance run, page, revision, and delta counts.
8. Morning Paper shows the event and routes back to the dossier/review surface.
9. Logged-out shared dossier shows only accepted current-through and a public-safe latest-event summary.
10. Rechecking the same filing/transcript is idempotent: no duplicate source event, receipt, maintenance run, or claim history entry.

**Automated tests**

- Existing watcher suites plus real-shape fixtures for the selected filing/transcript.
- Source-event-to-maintenance integration test with two event types and idempotency.
- Claim-diff tests for all six delta classes, claim-ID matching, normalized fallback, and rejected candidate.
- Receipt persistence/sanitization tests and Morning Paper rendering tests.
- Public serializer tests proving accepted-source version selection and private-field exclusion.
- Scheduler test showing worker ordering cannot publish observed-but-unmaintained evidence.
- Focused frontend tests and `CI=true npm run build`.

**Real-account/logged-out browser proof**

- Confirm `FMP_API_KEY` is configured on Render without printing it.
- Use a dedicated acceptance copy of the real Alphabet dossier first; after pass, repeat on the flagship if desired.
- Capture before page/claims, arm EDGAR and transcript, run checks, wait for source worker/maintenance, capture after page/claims/receipt/Morning Paper.
- Reload after every durable step.
- Open the public page in a clean logged-out context at 1440 and 430 px.
- Inspect Render logs for one event → one maintenance transaction and store redacted evidence JSON.

**Deployment dependency:** Render for the full data path; Vercel for visible delta/receipt/Morning Paper/public stamp. Both.

**Rollback/data safety**

- Run on a copied acceptance dossier before touching the flagship.
- Store immutable pre-run page/revision/claim snapshots.
- Publication shielding must wrap investing maintenance as it does repo maintenance; rejected candidates cannot replace trusted content.
- Receipt and comparison records are append-only; never rewrite historical evidence.
- Disarm watches and restore the copied page if the run fails. External evidence records remain auditable rather than deleted.

## Push 3 — Capture repo baselines and deterministic repo change manifests

**Product outcome**

The Noeis repo and one fast-moving external repo have immutable day-one baselines and repeatable current comparisons, without yet requiring the final public design.

**Likely code/data surfaces**

- `server/services/githubRepoWatcherService.js` for normalized repository deltas.
- `wikiMaintenanceService.js`, `wikiMaintenancePublicationService.js`, `wikiRepoBuildLeaseService.js`.
- `server/models/index.js` for baseline/comparison persistence.
- `server/routes/wikiRoutes.js` authenticated capture/read endpoints.
- New `server/services/wikiRepoComparisonService.js` and focused tests.
- `scripts/verify_repo_wiki_live.js` or a new comparison verifier.

**Acceptance criteria**

- Baseline pins repository identity, default branch, head SHA, release tag, selected source paths/blob SHAs, accepted page revision, generator version, and claim ledger.
- Re-running baseline capture is idempotent and cannot silently replace the original.
- Comparison reports file/doc/release/commit changes from GitHub data and claim deltas from accepted page revisions.
- Supporting refs resolve to GitHub blob/commit/release URLs.
- “Static wiki would now be wrong” items require a baseline claim plus changed supporting ref; the model cannot invent them from commit titles alone.
- No candidate or failed build is presented as current.

**Automated tests**

- Baseline immutability and owner/repo/head idempotency.
- Rename/delete/modify/release cases and truncated API payloads.
- Claim preserved/changed/rejected/flagged classifications.
- Lease concurrency and failed candidate behavior.
- Public-ref URL allowlist tests even though public UI ships next.

**Real-account/logged-out browser proof**

- Authenticated capture for `atsokolas/note-taker-3` and the founder-selected external repo.
- Advance or select two real SHAs with material changes; verify the manifest against GitHub refs by hand.
- No public exposure required in this push; inspect only authenticated API/data and saved redacted artifact.

**Deployment dependency:** Render only.

**Rollback/data safety**

- Baselines and comparisons are append-only records.
- Never repurpose `publishedHeadSha` as baseline; it represents current accepted publication.
- Feature flag capture endpoints and allow deletion only of erroneous QA baselines, not production history.

## Push 4 — Ship the screenshotable maintenance comparison

**Product outcome**

A logged-out page shows day one versus maintained for Noeis and one external repo: versions, repository changes, claims changed/preserved/rejected or flagged, static-wiki errors, and supporting refs.

**Likely code/data surfaces**

- New public comparison serializer/route in `server/routes/wikiRoutes.js` or a narrow route module.
- New `note-taker-ui/src/pages/PublicWikiComparison.jsx`, route in `App.js`, SEO hook/schema, and scoped CSS.
- Link from the repo proof card and shared repo page.
- Comparison service/model from Push 3.

**Acceptance criteria**

- One-screen summary is legible and screenshotable at 1440 px; detail remains usable at 1280 and 430 px.
- Baseline and current accepted SHAs/tags are unmistakable.
- Each material claim delta links to at least one public repository ref.
- Preserved claims are shown alongside changed/flagged claims; the artifact does not imply change for its own sake.
- A “generate once would now say” section contains only demonstrably stale baseline statements.
- Privacy allowlist excludes user ID, private notes, highlights, backlinks, agent state, internal QA source text, tokens, and candidate content.
- JSON-LD describes a public `Article`/`TechArticle` with reviewed/modified dates and citations.

**Automated tests**

- Public comparison serializer privacy and rejected-candidate tests.
- Route 404/ineligible/baseline-missing behavior.
- UI semantic structure, refs, empty delta classes, and SEO schema.
- Responsive visual assertions/no overflow and frontend build.

**Real-account/logged-out browser proof**

- Logged-out Noeis and external-repo comparisons at 1440/1280/430.
- Manually open every supporting GitHub ref.
- Capture one clean homepage/fundraise screenshot plus full-page evidence.
- Cold-reader check: explain baseline, current state, and at least one stale static claim in under 30 seconds.

**Deployment dependency:** Render then Vercel. Both.

**Rollback/data safety**

- Public route can be disabled per comparison without deleting baselines.
- Do not expose a comparison until it has explicit `publicEligible=true` after editorial review.

## Push 5 — Reshape the repo dossier into the hybrid model

**Product outcome**

The canonical repo object becomes a compact developer entry point with durable sections and optional detail pages, without fragmenting maintenance ownership.

**Recommended model**

- **Canonical object:** one `WikiPage` and one GitHub watch/publication lease.
- **Stable sections in that object:** Overview, Architecture, Key decisions, Changelog digest, Open questions.
- **Overview-first reader:** compact summary, quickstart, current-through state, table of contents, and section-level change badges.
- **Optional generated subpages:** only when a section exceeds a usefulness threshold or needs a separately shareable artifact. Initial allowed subpages: Architecture detail and Maintenance comparison. Subpages reference the canonical page/revision and do not own independent watches.

This gives users one trustworthy URL and one maintenance transaction, while allowing the long 17k–27k px dossier to become navigable. Five independently watched pages would increase maintenance cost roughly fivefold and create inconsistent heads. A single undifferentiated article is operationally simple but increasingly hard to scan and share.

**Likely code/data surfaces**

- `wikiMaintenanceService.js` section contract and quality gates.
- `WikiPageReadView.jsx`, `WikiRepoDeveloperQuickstart`, repo watch control, renderer/TOC.
- `wikiRoutes.js` only for canonical-to-subpage projection/read behavior.
- Models only if projected subpages need stable records; prefer derived views first.

**Acceptance criteria**

- All five required information jobs are present and deep-linked.
- Cold-start developer can answer: what it is, how to run it, where core boundaries live, what changed, and what is uncertain.
- One canonical published head governs every section and derived view.
- Section-level maintenance changes link to the comparison manifest.
- No duplicate source events, builds, or public pages for the same owner/repo/head.

**Automated tests**

- Existing repo quality suite plus required-section and deep-link tests.
- Canonical/subpage head consistency and share privacy.
- Quickstart, TOC, mobile, and agent-rail regression tests.
- `npm run wiki:qa` and frontend build.

**Real-account/logged-out browser proof**

- Rebuild Noeis and one external repo.
- Cold-start developer task test, desktop/1280/mobile, authenticated and shared.
- Compare scan time and scroll depth against the current long dossier artifact.

**Deployment dependency:** Render for generator/derived data; Vercel for reader. Both.

**Rollback/data safety**

- Preserve canonical page IDs/slugs and previous accepted revisions.
- Derived subpages must be disposable projections, not independent maintenance roots.
- Generator-version bump queues rebuild but publication shielding retains the old page until acceptance.

## Push 6 — Launch the first public repo fleet and close reading-source proof

**Product outcome**

Publish 10–15 recognizable repo objects with health monitoring, and separately prove one Readwise Reader item can become dossier evidence. This scales already-proven models; it does not introduce new connector classes.

**Likely code/data surfaces**

- Small repo fleet manifest/seed script, GitHub creation route, scheduled worker, generator version, public registry.
- Existing Readwise import route/service, Library article/highlight persistence, source-attachment UI/API, maintenance comparison/receipt path.
- Ops documentation and new production QA artifacts.

**Acceptance criteria**

- Fleet spans JavaScript, Python, and AI tooling; each repo is public, active, documented, and has an accepted useful page.
- Every fleet row records canonical page, owner/repo, cadence, published head, generator version, latest accepted build, and public URL.
- Batch creation respects GitHub limits and worker leases; failures do not publish scaffolds.
- One real Reader newsletter/post appears in Library with URL/content/highlights, attaches to the Alphabet dossier, affects or supports a claim, and appears in the durable maintenance receipt.
- Plain RSS remains deferred unless this proof fails specifically because Reader cannot cover the target source.

**Automated tests**

- Fleet manifest validation, dedupe/upsert, rate-limit recovery, and no-scaffold-publication.
- Readwise payload fixture representing a Reader feed/newsletter item through Library persistence and page source attachment.
- Cross-user/privacy and idempotency tests.

**Real-account/logged-out browser proof**

- Sample all fleet URLs by API; browser-test Noeis plus four representative repos across languages at desktop/mobile.
- Real founder Readwise account: identify one non-book Reader item, sync, attach, maintain, reload, and verify public-safe result.

**Deployment dependency:** Render for fleet/Reader data paths; Vercel only if registry/receipt UI changes. Both unless no UI change is required.

**Rollback/data safety**

- Create fleet pages private; share only after quality and editorial review.
- Batch sizes and concurrency limits must be configurable.
- Never publish imported Reader text/highlights verbatim; only public-safe citations and accepted dossier prose may cross the serializer.

## Flagship content migration and curation plan

This is a curation operation, not a database migration that creates a parallel content type.

1. **Inventory by exact title and owner.** Query the founder’s pages for the three named pages, market maps, live questions, and Noeis repo page. Record `_id`, slug, page type, visibility, source refs/count, claims/count, last accepted revision, quality eligibility, current watches, and public URL status.
2. **Resolve duplicates deliberately.** Select one canonical page for each slot based on source depth and current usefulness. Do not merge automatically. Archive or redirect duplicates only after founder review.
3. **Snapshot before editing.** Create/export a revision plus a redacted metadata manifest for each canonical page. Record prior visibility.
4. **Editorial audit.** For each page verify the title, first paragraph, claim quality, sources, citations, open questions, private material, and latest accepted review. The Alphabet page must contain a falsifiable thesis, not just a company overview.
5. **Attach clocks without cloning.** Alphabet receives EDGAR and transcript watches on its existing `WikiPage`. Noeis repo keeps its existing GitHub watch. Concept/map/question pages declare reading/manual clocks until a real external monitor exists.
6. **Run accepted maintenance.** Rebuild only where evidence is sufficient. A failed quality candidate leaves the page private or shows the last trusted version; it does not block curation of other entries.
7. **Share through existing visibility.** Use current share workflow and `serializePublicWikiPage()`. Never copy body/source data into a gallery document.
8. **Register stable IDs.** Add the six canonical page IDs/slugs and editorial order to the proof registry. The registry contains presentation labels, not page content or private data.
9. **Validate privacy and indexing.** Fetch every public API response logged out, diff keys against the allowlist, inspect HTML/JSON-LD, and check canonical URLs/robots.
10. **Cut over atomically.** Deploy the registry API, populate it, verify six entries, then deploy homepage/gallery links. Keep `/proof` available throughout.
11. **Rollback.** Restore registry version and page visibility from the manifest; public routes must 404 after unsharing. Revisions and watches remain intact.

## Fundamentals/news, Readwise, and RSS decisions

- **Fundamentals/news:** not required for the first proof. EDGAR tests the authoritative financial clock; the transcript tests management narrative and claim pressure. Adding news/fundamentals now would enlarge provider scope before the receipt/comparison loop is trustworthy. Revisit only after the Alphabet acceptance run identifies a material claim those sources cannot test.
- **Readwise Reader:** code-path evidence is positive but production proof is missing. The importer and focused sync test exist. Treat the real Reader → Library → dossier evidence test as a bounded acceptance task in Push 6, not as a new connector build.
- **Plain RSS:** defer. It becomes necessary only if target users cannot or will not use Readwise, or if the real Reader acceptance test cannot preserve enough source metadata/content to support claims.

## Delegation map and paste-ready prompts

Delegation should start only after the current dirty frontend owner hands off or lands. The prompts below have non-overlapping ownership.

### Cursor task A — public proof frontend only (Push 1)

**Ownership:** `note-taker-ui/src/pages/Landing.jsx`, `note-taker-ui/src/pages/PublicProofGallery.jsx`, `note-taker-ui/src/pages/PublicProofGallery.test.jsx`, `note-taker-ui/src/pages/SharedWikiPage.jsx`, their focused tests, and only the proof/shared-page selectors in `note-taker-ui/src/styles/seo-article.css` or shared-page CSS. Do not edit backend files.

```text
Work in /Users/athantsokolas/Documents/GitHub/note-taker-3-1. Read docs/noeis-public-proof-gallery-implementation-plan-2026-07-11.md, especially Push 1 and the dirty-tree ownership section. Frontend-only. First inspect and preserve existing uncommitted changes in Landing.jsx, PublicProofGallery.jsx, PublicProofGallery.test.jsx, and seo-article.css; stop if their owner has not handed them off. Consume the backend's public proof registry and maintenanceProof envelope without inventing fallback maintenance facts. Render exactly six individual proof objects, required clock/current-through/last-reviewed/latest-event/count/direct-link/privacy fields, and link the homepage CTA directly to the configured Alphabet public page. Extend SharedWikiPage with the same safe stamp and privacy line. Preserve public-share no-auth chrome and reduced motion. Add focused tests for missing proof fields, JSON-LD, direct URLs, and privacy copy. Verify at 1440, 1280, and 430 px with no horizontal overflow, then run CI=true npm run build. Do not edit server/, models, scripts, or content data. Do not commit.
```

### Grok Build task B — comparison frontend only (Push 4)

**Ownership:** new `note-taker-ui/src/pages/PublicWikiComparison.jsx`, its test/style module, route wiring in `App.js`, and a link from the shared repo page. Do not edit gallery files or backend.

```text
Work in /Users/athantsokolas/Documents/GitHub/note-taker-3-1. Read Push 4 in docs/noeis-public-proof-gallery-implementation-plan-2026-07-11.md. Build only the logged-out maintenance-comparison UI against the documented public comparison API; do not change backend contracts or gallery files. Show baseline vs current accepted repo versions, material repo changes, claims changed/preserved/rejected-or-flagged, generate-once errors, and public GitHub refs. Make the summary screenshotable at 1440 and fully usable at 1280 and 430. Preserve public privacy/no-auth chrome and render absent delta classes honestly. Add semantic/SEO/privacy/link tests and run CI=true npm run build. Save browser evidence to a new dated output directory. Do not commit.
```

### Cursor task C — repo hybrid reader only (Push 5)

**Ownership:** `WikiPageReadView.jsx`, repo-specific child components/tests, and scoped reader CSS. Do not edit watcher, routes, generator, models, gallery, or comparison page.

```text
Work in /Users/athantsokolas/Documents/GitHub/note-taker-3-1. Read Push 5 in docs/noeis-public-proof-gallery-implementation-plan-2026-07-11.md. Frontend reader slice only. Implement an overview-first hybrid repo dossier presentation from the existing canonical page: compact product orientation, developer quickstart, current-through state, stable deep links for Overview/Architecture/Key decisions/Changelog digest/Open questions, and optional links to backend-provided derived Architecture/Comparison views. Do not create independent watches or infer section data. Preserve ThoughtPartnerPanel, queued prompts, publication states, public privacy, and current quickstart behavior. Add focused tests and browser QA at 1440, 1280, and 430 with agent rail open/closed. Run the focused tests and CI=true npm run build. Do not edit server/ or commit.
```

### Codex-owned backend/data lane

Keep Pushes 1–3 backend contracts, real-account mutations, public serializers, receipt/comparison persistence, and production acceptance harness under one owner. These surfaces are too coupled to split safely across agents: `server/models/index.js`, `server/routes/wikiRoutes.js`, watcher services, source-event orchestration, maintenance/publication, receipts/briefing, and verification scripts.

## Founder decisions genuinely required

1. **Choose the fast-moving external comparison repo and approve the first fleet list.** Repository activity/quality can be measured from GitHub, but recognizability and taste are founder decisions. Recommendation: use one high-release-cadence AI/agent framework with strong docs for the comparison, then approve a balanced 10–15 repo list across JS, Python, and AI tooling.
2. **Approve/provision the transcript-provider spend and production key.** The code has already selected FMP. Engineering can verify configuration but cannot authorize a paid plan or acceptable recurring spend. If FMP transcript quality for Alphabet is inadequate, then choose a provider change based on a side-by-side sample, not preference.
3. **Approve the six canonical public objects and their public exposure.** Engineering can discover candidates and run privacy checks, but only the founder can decide which real corpus pages represent the company publicly and whether their thesis wording is ready.
4. **Approve the public wording of the Alphabet thesis and any “static wiki would be wrong” claims.** These are editorial/fundraising assertions, not implementation facts. Every assertion will still require evidence links.

No founder decision is needed on brokerage, RSS, private GitHub, webhooks, Gmail, fundamentals/news, or the repo page-set architecture for this sequence; those are either deferred or resolved above.

## Estimates and milestones

- **Total bounded pushes:** 6.
- **First complete public proof:** Push 1 delivers the first complete public-facing proof product: one-click flagship plus a truthful six-object gallery. It does not claim the investing automation is proven.
- **First complete investing-loop proof:** Push 2.
- **First screenshotable maintenance comparison:** Push 4; Push 3 supplies its durable data.
- **First scalable repo fleet:** Push 6, after the comparison and hybrid model are proven on two repositories.
- **Still deferred afterward:** brokerage/holdings, plain RSS, private GitHub, webhooks, Gmail research ingestion, enterprise data providers, and fundamentals/news unless the Alphabet acceptance run produces a concrete evidence gap.

## Recommended immediate start

Start Push 1 after resolving ownership of the four dirty public-proof frontend files. In parallel within the same push, inventory the founder corpus and define the backend public proof envelope/registry. Do not point the homepage at `value-investing`; that route is currently a generic starter collection and undermines the claim that the proof is maintained.
