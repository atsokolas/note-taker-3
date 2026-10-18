# Reviewer fixture UI verification

The isolated `/reviewer-fixtures` frontend route supplies the missing rendered entry into existing authenticated text-import, highlight and private Wiki creation APIs. It adds no navigation item or server endpoint. Normal screens remain unchanged. The fixed bundled material is fictional and contains no credentials or real user content.

The existing owned private-concept metadata read reports whether reviewer holds are active and fixture bindings are complete. The reviewer supplies the previously verified private concept ID in a rendered field; mounting the route makes no request. Verify reviewer reads that concept and checks the returned concept ID. The server requires the exact enabled reviewer identity and private ownership; the form also requires active holds before reading fixture data. Account and concept identifiers are supplied at runtime rather than included in the fictional fixture bundle. Only the canonical production origin can create its application client. Full fixture binding makes setup read-only. Authentication stays in the normal application's in-memory request configuration; it never enters receipts or journals. Session changes and unmount abort further requests.

## Persistence and uncertainty

Use only the existing isolated reviewer browser/profile at the canonical site. Web Locks coordinate this origin/profile, not other profiles. Both setup and read-only reconciliation take the same browser lock. Storage must be available and its write/read comparison must pass before any POST.

Before each of four fixed POSTs, an owner-scoped journal persists uncertain intent. Only exact owner-bound readback and held source-event evidence may confirm it. A lost response or missing record never causes an automatic POST retry. Reload can recover an exactly matching persisted record; otherwise the form pauses. Existing differing content, extra highlights, non-held/previously attempted events, duplicate pages and incomplete lookups are preserved and rejected. No reset, deletion or repair button exists.

Articles use exact owned URL lookups, avoiding capped general lists. Wiki lookup checks draft, published and archived records with low-quality rows included, failing closed at the list cap. Canonical Wiki reuse must match the exact title, structured body, scope, owner and full source references. The incidental empty Wiki from earlier inspection is outside the fixed title and remains untouched.

The complete receipt reports actual IDs, readback time, pinned text hashes, exact structured-body verification and held zero-attempt events. It states connector acceptance has not run. An incomplete state cannot export a complete receipt. No form path calls URL import, ingestion, semantic search, drafting, acceptance or publication.

## Checks

Focused workflow tests cover fixed writes, exact readback, retry/reload, lost import/highlight responses, unknown outcomes, failed confirmation storage, double-click/cross-tab locking, session changes, corrupt or unavailable state, late owner/hold changes, completed binding, content/structure mismatch, incomplete lookup, canonical reuse, noncanonical origins and pinned hashes. Component tests cover role exclusion, content preview, receipt rendering and uncertain-outcome recovery. Existing real-route tests cover metadata activation flags and model-free persistence with provider/read-back traps. Full Server/offline, UI tests/build and model-free agent CI must pass on the release head.

## Live verification

After independent review and CI, verify exact Render and frontend deployment commits. A frontend quota failure is a deployment blocker; do not purchase credits, change plans or use another origin to evade it. Open the canonical route in the existing reviewer browser; enter the previously verified private concept ID and press Verify reviewer. Inspect the fixed content and active-hold state before pressing Save fictional fixtures once. Read the visible receipt, reload, re-enter the same concept ID and press Verify reviewer, then Check saved state. Confirm the same IDs/content without another write. Verify desktop/Safari sidebar and mobile presentation where supported. Save the actual receipt privately before full fixture-policy binding or acceptance testing. Leave final candidate acceptance and marketplace declarations to the owner.

## Manual-text event contract correction — October 18

The first production setup paused after its first source import because text-import connector events use `external`, while the form expected `article`. The new pure `reviewerFixtureEvents.js` replaces the inline event matcher so the real backend route regression can exercise the same validation used by the form. It recognizes only the existing manual-text provenance, exact source identity/title/URL and consistent imported/updated metadata. Ownership, held status, zero attempts and explicit no-inference proof remain required. Every event for the same object is checked; a newer held row cannot hide attempted or unrecognized history. Article and highlight holds retain their existing support.

Regression coverage feeds a real persisted text-import event into that validator. Workflow checks start with a saved first source and unresolved local intent: Check saved state reconciles that record without a POST, and a later continuation skips its import. Wrong owner/object/provider/provenance/title/URL, missing proof, attempted events and mismatched history pause without changing the journal or writing. No backend runtime, policy, fixture payload or journal version changes.

After the scoped fix is independently reviewed, CI passes and the canonical deployment is verified, preserve the existing browser/profile and journal. Reload the form, verify the same reviewer and use Check saved state first. Expect one saved source and no highlight/Wiki; do not press Save during this reconciliation check. Confirm no import POST occurred and report the partial state for the recovery handoff. Existing mismatches or missing held events remain blockers, without data repair or guard bypass.
