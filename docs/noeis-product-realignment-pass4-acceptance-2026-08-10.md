# Noeis product realignment — Pass 4 acceptance

**Result:** PASS locally on the manifest-bound release worktree snapshot.

## What changed

- Consolidated cross-surface references on the durable `Connection` graph. The legacy notebook-block `ReferenceEdge` index remains outside this universal write path.
- Added one shared `Reference…` interaction across Library, Think, and authenticated Wiki reading.
- Library source mode writes the semantic edge from active work to the source, plus the reciprocal `referenced_by` edge and receipt.
- Exact highlight navigation preserves both the highlight ObjectId and its parent article ObjectId.
- Concept, Wiki page, and Wiki claim graph results now use exact identity-based internal routes.
- Exact-highlight entry opens Source context and the mobile Thought partner drawer remains explicit.
- Fixed the `pull=1` timing seam so the route is not consumed before the requested article exists.

## Persisted acceptance

Evidence: `output/noeis-product-realignment-pass4-2026-08-10/`

The real authenticated routed browser journey used a run-unique disposable Mongo database and disposable users, with no API response interception. It proved:

1. A Library highlight referenced the exact investigation Concept with one POST whose semantic direction was Concept → highlight.
2. Mongo persisted exactly the forward `related` row and reciprocal `referenced_by` row.
3. The forward connection and reciprocal identity were bound by one `connection_created` receipt.
4. Reload rendered `1 out · 1 in`, and the backlink opened the exact Concept ObjectId.
5. One browser Back returned to the exact original article and highlight.
6. Cross-user, malformed, unsupported-type, and self-reference requests failed closed with no extra rows or receipts.
7. Library and Wiki reference controls rendered at 1440, 1320, and 430 pixels without horizontal overflow; mobile used the explicit Thought partner drawer.
8. Cleanup dropped the disposable database to zero collections.

The journey also reran the accepted Pass 3 consequence-loop path. Exact investigation identity, proposal separation, contrary-evidence action, accepted-Wiki immutability, and responsive behavior remained green.

## Automated acceptance

- Backend: four focused schema/route suites passed, including reciprocal creation, receipt rollback, scoped lists, and Wiki graph behavior.
- Frontend: 7 suites / 216 tests passed.
- Production frontend build passed.
- `git diff --check` passed for the Pass 4 source and acceptance files.

Existing React `act(...)` warnings remain in older Think/Wiki tests; they did not produce failures and are not treated as rendered proof.

## Proof boundary

This is local automated, persisted, and rendered proof against a manifest-bound dirty-worktree snapshot. It is not an exact clean Git tree, commit, merge, deployment, or production proof. No personal corpus or production data was used.

## Next

Pass 5: visually and behaviorally integrate claim review, decisions, outcomes, and retained lessons into the accepted Wiki judgment flow while preserving exact identities, explicit four-action disposition, distinct clocks, and role-explicit lesson adoption.
