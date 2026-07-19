# Noeis research and publication system — evidence checkpoint

**Captured:** 2026-07-19 America/Chicago
**Worktree:** `/Users/athantsokolas/.codex/worktrees/ad66/note-taker-3-1`
**Branch:** `codex/noeis-research-publication-system-2026-07-19`
**Starting commit:** `2095a55accacf80970d052c74bd645492c66ab45`

## Scope completed at this checkpoint

- Read the governing repository instructions, Noeis next-pass skill, Daily Loop spec, Judgment Institution spec, source conversation, and all three automation memories/configs.
- Verified the worktree was clean before edits and recorded the active Daily Loop ownership fence.
- Ran four bounded read-only investigations: ingestion/public path, automation continuity, privacy/approval boundaries, and independent Weekend Readings UX critique.
- Wrote the operating/implementation specification and operating runbook.
- Added an isolated backend Weekend Readings draft primitive and tests.
- Did not modify production data, send email, create a real-account draft, or publish.

## Live availability preflight

On 2026-07-19:

```text
https://www.noeis.io/                         HTTP 200
https://www.noeis.io/wiki                     HTTP 200
https://www.noeis.io/proof                    HTTP 200
https://note-taker-3-unrg.onrender.com/health HTTP 200
{"status":"ok","message":"Server is warm."}
```

Availability does not establish authenticated Weekend Readings or Thesis 001 acceptance.

## Focused test evidence

Command:

```bash
node --test server/services/weekendReadingsService.test.js
```

Result:

```text
tests 8
pass 8
fail 0
```

Covered:

- HTTPS URL enforcement and explicit HTTP override;
- tracking/fragment removal and deterministic query ordering;
- visible duplicate-URL rejection;
- rationale, classification, and source-quality validation;
- context boundary requirement;
- required editorial note and explicit unassigned/date empty states;
- linked-title TipTap structure without a repeated body-level page title;
- private/draft/log WikiPage construction;
- public-safe relationship copy separated from private affected-question metadata;
- source metadata persistence shape;
- revision and receipt creation;
- deterministic edition-level idempotency.

Regression commands:

```bash
node --test server/services/wikiRevisionService.test.js server/services/wikiGraphConnectionService.test.js
node -c server/services/weekendReadingsService.js
node -c server/services/weekendReadingsService.test.js
git diff --check
```

Result:

```text
wikiRevisionService: pass
wikiGraphConnectionService: pass
syntax checks: pass
diff check: pass
```

## Release-critical findings still open

1. Current URL ingest mutates matched pages before the later accept/defer/reject review.
2. Generic Share can expose a draft and does not bind public output to an approved revision.
3. Later edits to a shared page can change the public artifact without reapproval.
4. Unshare/archive can leave a cached public payload reachable until cache expiry.
5. Public maintenance proof can derive visible summary text from private AI state.
6. The normal source API drops provider/classification metadata and caps initial sources at eight.
7. The public renderer does not yet prove linked item titles, artifact-specific hierarchy, approval-state UX, or responsive/accessibility acceptance.

## Ownership gate

The active Daily Loop task `019f7b94-690d-72e0-9c08-4b1bd0810220` still owns the shared Wiki model, main reader/front page, Settings, server boot, maintenance, and its new watcher/email/daily-loop services. Integration and full Wiki QA/build/browser proof must wait for that task's final landed commit/base.

## Honest completion statement

This checkpoint proves the inventory, operating contract, and low-collision private-draft primitive. It does not prove publication, public/private safety under the new artifact contract, responsive UI, live Noeis draft creation, or Thesis 001 day-zero readiness.
