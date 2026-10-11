# Noeis product realignment — Pass 5 acceptance

**Date:** 2026-08-10
**Plan:** `docs/noeis-product-realignment-imagen-implementation-plan-2026-08-10.md`
**Result:** PASS locally

## Delivered

- Candidate claim review now presents one legible sequence: accepted judgment, candidate evidence, then an explicit human disposition.
- Accept, preserve, reject, and defer remain confirmation-bound and receipt-bound; a parent rerender no longer collapses the pending confirmation.
- Decisions render as three separate layers: immutable decision basis, human-set review clock, and later observed outcome.
- Decision creation is subordinate to accepted Wiki judgment rather than presented as a separate product mode.
- Retained lessons show their exact decision, observed-outcome provenance, and explicitly selected evidence role before adoption into later Think work.
- The Wiki front page now overrides a stale quiet briefing and opens Review and system activity when a real consequential movement is present. The user may collapse it afterward.

## Acceptance evidence

- Persisted authenticated browser journey: `output/noeis-product-realignment-pass5-2026-08-10/`
- Authoritative report: `output/noeis-product-realignment-pass5-2026-08-10/qa-report.md`
- Score: **PASS — 17/17**
- Real routes and a run-unique disposable Mongo database were used for dispositions, decision creation, outcome recording, decision-due return, and lesson adoption.
- All four dispositions persisted and survived reload.
- Decision, review, outcome-due, and observed-outcome clocks remained distinct; the original rationale remained unchanged.
- Lesson adoption required an exact destination and explicit Support, Tension, or Context role; replay was idempotent and stale/conflicting bindings failed closed.
- The due-decision movement opened from the Wiki UI after the review surface auto-open repair.
- Public surfaces leaked no private decision, lesson, or receipt state; agent mutation attempts failed closed.
- Rendered checks passed at 1440/1320/430, with keyboard focus, reduced motion, and no horizontal overflow.
- Cleanup dropped the disposable database and verified zero remaining collections.

## Automated evidence

- Focused Pass 5 component suites passed. The existing `WikiPageReadView` suite continues to emit non-failing React `act(...)` warnings.
- `CI=true npm run build` passed after the final repair.
- Scoped `git diff --check` passed.

## Proof boundary

This is local automated, persisted, and rendered proof against a manifest-bound dirty-worktree snapshot. It is not exact-tree, clean-candidate, merged, deployed, or production proof. No commit or push was performed.

## Next

Pass 6: run the three generalized product scenarios—NVIDIA, circle of competence, and imported-source entry—through the complete Library → Think → Wiki → review loop with real authenticated routes and reload at every durable transition.
