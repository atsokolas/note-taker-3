# Scoped reviewer rehearsal budget

This guard replaces the generic text-provider routing/fallback path only for the verified synthetic reviewer's synchronous fictional Wiki draft. Ordinary users retain the existing maintenance behavior. The default policy is inactive until immutable account/page/source IDs have been verified and reviewed; empty IDs must never be filled by guessing.

The reviewer uses the same maintenance algorithm, quality contract, publication service and owner-acceptance workflow. A reviewer guard failure propagates as a truthful `REVIEWER_*` error instead of being hidden inside deterministic model fallback. A quality-rejected candidate remains rejected. The trusted owner content stays unchanged.

## Admission and outbound bound

`server/services/reviewerRehearsalPolicy.json` pins one immutable user, one private topic Wiki and exactly two owned article sources under `selected_sources`. The synchronous route verifies article ownership. Clients cannot change the policy or select another budget/model/provider. This is application code/data, not a provider-key or global-worker configuration change.

The dedicated adapter constructs the complete provider request from allowed fields: one text-only system/user pair, aggregate content at most 64 KiB, `openai/gpt-4o-mini`, at most 4,200 output tokens, regular/default service tier and no streaming. It forwards no caller-supplied reasoning, tools, plugins, multimodal data, transforms or alternate models. It sends one POST to the fixed OpenRouter endpoint with redirects disabled; it has no retry/hint-drop/provider-fallback branch.

Provider preferences require parameter support and disable fallbacks. Price ceilings are `prompt: 0.20`, `completion: 1`, `request: 0`, meaning dollars per million text tokens and zero per-request fee. If no provider supports these controls, the request fails closed. No credits are purchased.

At the model's documented 128,000-token context bound plus 4,200 output tokens, the enforced token ceilings yield at most **$0.0298 per POST**, **$0.0894 for three POSTs**. The byte limit is not used as a token estimate. These are conditional bounds on supporting provider behavior, not evidence that live inference has run.

## Durable reservations, retries and uncertainty

Before every actual POST, the adapter atomically reserves 100,000 integer micro-dollars in `reviewer_rehearsal_budgets`. Its fixed `_id` is `noeis-openai-review-2026-10-11`; all process instances and new operations use that same identity. Maximum three requests, total **$0.30**, one in flight. A unique Mongo `_id` and conditional `findOneAndUpdate` serialize reservations. Existing counters are never replaced. There is no reset, TTL, refund or lock-expiry API.

Successful receipt settlement requires matching model, a bounded scalar generation ID and bounded prompt/completion tokens plus a reported nonnegative cost no greater than $0.0298. The private receipt stores generation ID, token/cost usage and a bounded completion cache. Identical wire requests replay the successful cache without another POST, including after later exhaustion/freeze. Cached replay proves no new inference; it does not create a new provider receipt.

Any rejected, invalid, timed-out, lost-response or unsettled attempt retains its reservation and in-flight lock, freezes the ledger and stops new calls. A restart cannot reclaim the lock. An operator must investigate the recorded generation/usage before any further decision; this patch provides no unlock/reset convenience.

## Embeddings and exact action closure

The reviewer embedding enqueue persists `held` jobs. Both the durable worker and old transient handler check ownership before inference. Wiki post-save judgment/claim hooks use these same guards. Reviewer queue persistence failures cannot fall back into transient paid inference. Held jobs are not completed, cannot be claimed by the normal worker and make no claim that earlier historical attempts never occurred. Ordinary user enqueue/drain behavior is unchanged.

Reviewer source events persist `held` with truthful metadata. Central processing stops before maintenance queues, write budgets and the `readBack`/`proposeFromReading` sidecar; source-event worker selection and claiming exclude the reviewer. Text import returns `held` rather than claiming normal queued processing. Current main independently removed the legacy AI service and `queueEmbeddingUpsert`; this branch preserves that removal and adds no replacement legacy queue.

These holds cover the side effects of the chosen existing human text-import, highlight and private-Wiki setup APIs. They do **not** bound every AI endpoint: streaming/async Wiki drafts, ask routes and semantic queries remain outside the exact rehearsal. URL fetching/ingestion, Edition held-evidence and Edition save/later are not part of this setup/walkthrough. Do not invoke an additional paid route without separately verifying its guard. Manual synchronous drafting retains the same advertised capability, algorithm, quality contract and owner acceptance.

Scheduled Wiki maintenance excludes only the verified policy reviewer from its query and checks that owner again before budget acquisition, run creation or inference. A stale/adaptor query result returns a truthful held result without a save, event or invented draft timestamp. Empty policy IDs leave normal scheduling unchanged. This reviewer-only quiet-window hold prevents a newly created draft fixture from entering generic scheduled inference. Create draft fixtures only after this hold and the verified user-ID policy have deployed and been verified.

The five cases use:

- P1: source/highlight database reads, exact author/reader/interpretation distinction.
- P2: persisted conditional thought append, identical retry and stale-snapshot rejection. Semantic embedding remains honestly held.
- P3: existing Edition profile/list/get/additive filing and deduplicated reread; no headline or follow-up generation.
- P4: existing private Wiki and source reads.
- P5: synchronous `draft_page`, quality-passing pending candidate, actual review revision/link, preserved owner head.

Database searches used by these cases do not fall through to query embeddings. The separate human Edition held-evidence endpoint performs semantic retrieval, and Edition save/later fetches sources and triggers ingestion. Do not use those doors in the narrow recording. Inspect actual UI requests before opening additional views; a genuine recording of the actual MCP interactions and pending-candidate read can stay within this closure. Do not substitute a staged video or mocks for production results.

Activation follows three verifiable stages. First, independently review/CI/deploy code with empty user/page/source IDs for metadata-only identity verification. The existing human-authenticated `GET /api/concepts/:name/idea-workbench` returns/logs reviewer identity only for private concept `6acb64742a6fed4f58c07ff6`, already owned by that session, after checking the exact enabled username `noeis_openai_review`. Agent tokens, other concepts and mismatched/disabled owners receive no reviewer identity. This adds no endpoint, grant or credential extraction and does not activate the policy automatically. No fixture writes or inference are allowed in this first stage.

Second, bind the verified immutable user ID and deploy all reviewer holds before any fixture write. Page/source IDs remain empty, so synchronous reviewer drafting fails closed. Check reviewer jobs/events/watches and maintain a quiet dedicated account. Use existing human `POST /api/import/text`, `POST /articles/:id/highlights`, and `POST /api/wiki/pages` for the approved two fictional sources, exact highlight/reader thought and private topic Wiki. Supply `initialSourceRefs` with full approved snippets, `selected_sources` and the exact baseline body; omit `evidencePreflight` and `living_thesis`. Text import performs no remote URL fetch. Embeddings/events are honestly held. This is model-free setup, not a connector acceptance pass. Reread exact owner IDs, full source content, highlight/note and Wiki body/source references; reconcile any partial persistence before repeating.

Third, bind the verified page/two-source IDs and deploy the reviewed/CI-passed full policy before P5. The existing private owned Wiki read exposes only that rehearsal's budget counters and provider generation/usage receipts. It excludes prompts/completion caches and foreign owners; unavailable or malformed storage is reported as unavailable rather than zero usage. A missing verified ledger reports not_started without creating it. Read these actual receipts before/after testing. No production-wide pause, shared-key cap change, real-user deletion, new endpoint or credentials are required.

## Private ledger inventory and retention

`reviewer_rehearsal_budgets` is a raw Mongo collection, not a schema-backed model. Its rows contain verified `userId`/`pageId`, reservation counters, attempt metadata, generation/usage receipts and private synthetic completion caches. It is therefore an explicit additional owned store for support-led record inventory. The current generic model-only erasure inventory does not discover it automatically.

For any later reviewed support erasure, inspect this collection by verified owner ID. Remove private cached completions/owned content under the separately approved maintenance procedure while preserving a non-resetting budget tombstone/counters, or permanently disable this fixed rehearsal policy before removing its ledger identity. Do not delete/TTL a live ledger and then allow it to recreate with zero spend. This patch performs no erasure and creates no ledger until the active reviewer invokes inference.

## Verification and release gate

Local tests use fresh disposable Mongo instances, synthetic IDs, mocked providers and no production database or credentials. They cover exact outbound controls, concurrency, successful replay, lifetime exhaustion, restart/new-operation attempts, unknown/over-limit usage, lost response, timeout, settlement storage failure, ownership mismatch, actual pending revision persistence, canonical trusted-head preservation, ordinary-user routing, both queue paths and real Wiki post-save hooks. Tests against the actual maintenance service cover strict initial/repair failure propagation and unchanged ordinary deterministic fallback. Provider/quality fixtures are regression evidence only.

Require independent review and the repository's Server/UI CI before each activation stage. Recheck current main before merge and preserve concurrent contributions. A normal backend auto-deploy still needs exact-commit and health verification. Do not claim zero downtime or live budget enforcement from local tests.

Only after deployment, read the reviewer-scoped ledger and actual production receipts, verify the complete action/UI request closure, then run the authorized fictional five positives and three negatives within the overall $5 ceiling. Report every candidate/quality/budget gap. Leave candidate acceptance and final marketplace submission to Athan.

Primary references checked October 11, 2026:

- https://openrouter.ai/openai/gpt-4o-mini
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://developers.openai.com/plugins/deploy/submission
