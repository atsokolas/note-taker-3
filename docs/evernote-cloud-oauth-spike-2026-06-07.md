# Evernote Cloud OAuth Viability Spike

Date: 2026-06-07

## Recommendation

Stay with guided ENEX import for now.

Offer a local-client bridge later only if a real power-user workflow emerges, but do not build Evernote Cloud OAuth as the default Noeis path yet.

## Why

Evernote still documents a Cloud API with OAuth, note and notebook access, and sync-oriented primitives, so the integration is technically possible.

The blocker is product friction and operational risk:

- Production API access is gated behind a manual API-key request and review process.
- Full-access permissions require extra justification.
- Webhooks also require direct outreach to developer support.
- The documentation and SDK surface read like a legacy platform, not a fast-moving self-serve developer program.

That makes Evernote Cloud OAuth a weak fit for the current Noeis goal: low-friction, self-serve connections that a solo user can turn on without waiting for vendor approval.

## Evidence

### Cloud OAuth exists

Evernote documents OAuth for the Cloud API:

- OAuth entrypoint: `GET https://www.evernote.com/oauth`
- Docs: `https://dev.evernote.com/doc/articles/authentication.php`

The platform docs also describe Cloud API access to notes, notebooks, tags, and searches:

- `https://dev.evernote.com/documentation/`

### Production access is manually gated

Evernote’s developer docs still say API keys must be requested through a form and are subject to manual review:

- `https://dev.evernote.com/doc/`

The docs also note that full-access or app-notebook permissions need justification for production activation:

- `https://dev.evernote.com/doc/articles/permissions.php`

The developer FAQ says webhook registration requires contacting Evernote support directly:

- `https://dev.evernote.com/support/faq.php`

### ENEX remains the clean migration path

Evernote help still explicitly documents desktop export of notes and notebooks as `.enex`:

- `https://help.evernote.com/hc/en-us/articles/209005557-Export-Notes-and-Notebooks-as-ENEX-or-HTML`

That lines up with the product shape already implemented in Noeis:

- guided export
- preview before commit
- import receipt
- mirrored destination folder in Think

## Answered questions

### Is Evernote Cloud API OAuth currently available for new apps?

Yes, in principle. The docs are still live and describe the OAuth flow. But production use is not self-serve because API keys require manual approval.

### Can we list notebooks and notes and fetch note bodies?

Yes, the Cloud API is documented as supporting notes, notebooks, tags, search, and data retrieval.

### Can we support incremental sync?

Probably yes, but with more implementation and QA risk than ENEX. Evernote’s sync/data model is richer and older than the current Noeis import flow, so this would be a real connector project, not a thin wrapper.

### What security/storage obligations exist?

Normal OAuth-token handling would apply on our side:

- encrypt access tokens at rest
- scope least privilege
- support reconnect/revoke flows
- handle token failure and re-auth states

The bigger issue is not token storage itself. It is whether the vendor access model is stable enough to justify the build.

### Is local-client automation better for the solo-user case?

Only as a secondary power-user bridge. The Evernote docs still mention local-client options, but that path would be desktop-specific and brittle compared with ENEX. It is not a better default than guided ENEX import.

## Implementation effort

### Guided ENEX import

Low to medium. Mostly UX polish, receipts, preview clarity, and QA.

### Cloud OAuth sync

Medium to high. Requires:

- Evernote production key approval
- token storage and reconnect lifecycle
- notebook/note sync mapping
- incremental sync logic
- error handling for revoked or degraded access
- long-tail QA against real accounts

## Product risk

Cloud OAuth would create the appearance of a “simple connection,” but the vendor’s approval gate means the setup path is not fully under our control. That is the opposite of the low-friction story these tickets are trying to deliver.

## Next ticket recommendation

1. Keep shipping the guided ENEX path as the default Evernote flow.
2. If demand persists, open a separate ticket for `Evernote power-user bridge exploration` rather than `Evernote OAuth implementation`.
3. Revisit Cloud OAuth only after there is evidence that ENEX is insufficient and Evernote production access has been successfully approved.
