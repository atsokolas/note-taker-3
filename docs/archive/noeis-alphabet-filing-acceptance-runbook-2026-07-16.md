# Alphabet filing-maintenance acceptance runbook

**Source policy:** free authoritative sources only

**Target:** private acceptance copy `6a5588c25ed84be58061eba7`

**Safety:** the runner is read-only unless `--apply` is supplied. Public-proof promotion and sharing additionally require `ACCEPT_ALPHABET_PUBLIC_PROOF=YES`.

## Production state observed 2026-07-16

- The private acceptance copy contains 31 claims.
- SEC EDGAR is active and free to access.
- The accepted SEC clock is source event `6a558acebee74715876eb1a3`, backed by promoted revision `6a558bdf97e7f7e8e0be49ae`.
- The accepted-through source is Alphabet's Q1 2026 10-Q filed April 30, 2026.
- Paid transcript access is out of scope. Transcript evidence is optional and must not block or be implied by the filing-maintenance proof.

## 1. Supply operator credentials locally

Do not commit these values.

```bash
export NOEIS_USERNAME='<account username>'
export NOEIS_PASSWORD='<account password>'
export ALPHABET_PAGE_ID='6a5588c25ed84be58061eba7'
```

## 2. Inspect without mutation

```bash
npm run proof:alphabet:run
```

Expected:

- `readyForAcceptancePreview: true`
- A substantive SEC filing event
- A promoted maintenance revision for that same event
- `sourcePolicy: free_authoritative_sources_only`

## 3. Human review

Review the generated `report.json` and the private dossier. Confirm:

- The filing is an authoritative Alphabet SEC filing.
- The filing body is substantive and SEC provenance resolves directly.
- The promoted revision preserves unrelated trusted claims.
- Claim changes, gained support, contradictions, preserved claims, and removals are defensible.
- The event and revision IDs in the report resolve to this acceptance copy.
- Public wording says filing-maintained; it does not imply transcript monitoring.

## 4. Preview the exact acceptance payload

```bash
npm run proof:alphabet:run -- --preview
```

Do not proceed unless `acceptancePreview.ready` is `true`, `acceptancePreview.publishAsFlagship` is `true`, `requiredClocks.secEdgar` is `true`, and `optionalClocks.earningsTranscript` is `false`.

## 5. Apply after explicit editorial approval

```bash
export ACCEPT_ALPHABET_PUBLIC_PROOF=YES
export ALPHABET_ACCEPTANCE_REASON='The authoritative SEC filing clock and its claim-level effects passed editorial review.'
npm run proof:alphabet:run -- --apply
unset ACCEPT_ALPHABET_PUBLIC_PROOF
```

The route is idempotent for the same filing clock. A confirmed run changes the vetted copy from private draft to shared published as part of the same explicit acceptance. The public registry prefers the newest explicitly proven shared-and-published Alphabet dossier over a stale legacy environment pointer. The runner writes a redacted report but never writes credentials or bearer tokens.

## 6. Verify public truth

```bash
NOEIS_API_URL='https://note-taker-3-unrg.onrender.com' \
REQUIRE_COMPLETE_ALPHABET_PROOF=1 \
node scripts/verify_alphabet_public_proof.js
```

Then verify logged out:

- `/proof` shows Alphabet as proven only from `proofGrade.grade === "proven"`.
- The proof language explicitly says SEC filing maintenance.
- The shared dossier exposes accepted current-through and a public-safe receipt.
- The public payload contains no private watch configuration, user ID, pending event IDs, backlinks, agent state, or maintenance-run ID.
- Desktop and 430 px mobile pages scroll and have no horizontal overflow.
