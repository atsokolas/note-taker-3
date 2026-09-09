# Open a sentence — snapshot share contract

**Date:** 2026-09-09
**Sits under:** [Operable knowledge](noeis-operable-knowledge-vision-spec-2026-09-04.md) §10 / §6 H7 / L6; [S7](noeis-open-sentence-s7-2026-09-08.md)
**Status:** Decision record for carrying an exploration out as a shared snapshot. Not an implementation. Not two Libraries. Not founder acceptance of a public URL. S5 exit remains separately authorized.

H7 already lets a person freeze one question, two included passages, and a provisional conclusion, preview exactly that, and copy it as plain text. The vision asked for access, revocation, retention, and derivative behavior **before** collaboration work. This is that contract for this object. It does not publish anything.

## What already exists, and is not this object

| Object | What a recipient gets | Frozen? | Revoke |
| --- | --- | --- | --- |
| Ordinary Wiki `/share/wiki/:idOrSlug` | Sanitized live page. Source **title + url**. Empty snippets. No library ids, no pocket, no claim ids. | No — later private edits can change the public page. | `visibility: private` → 404. In-process cache TTL 5 minutes; HTTP `max-age=60, stale-while-revalidate=300`. |
| Weekend Readings edition | Approved `publicArtifact` snapshot, not the live body. | Yes, at approval. | No dedicated unpublish route; private or missing receipt → 404. |
| Concept / question share | Live assembly from the current concept or question. No highlights, no library paths. | No. | Delete the share row → 404. Re-mint is a new slug. |
| H7 carry in the pocket | Question, two titled passages, conclusion. Copy is that plain text. | Yes, at include / type time, on this device. | Leave this snapshot. Closing does not publish. |

A Wiki share is still not a pocket share. Public Wiki pages continue to refuse the private pocket, including **Carry this out**.

## The object

A **carried snapshot** is one question, two explicitly included passages, and a provisional conclusion.

```
{
  question,
  conclusion,
  source: { title?, passage },
  other: { title?, passage }
}
```

That is the entire recipient-visible payload. It is not a Wiki page, not a Library article, not a dossier, and not the private exploration record.

Private identity (`against` the accepted line, claim id, article id, highlight id, href, around, marks, unfinished questions not used, the rest of the pocket) stays private.

## Publication

**Copy this snapshot** remains a local act. It does not mint a URL.

**Publish this snapshot** would be a later, distinct act. It is not authorized by this document.

If that act is later authorized, it may run only on a **live** carried snapshot (question, both included passages, conclusion). Empty pending cannot publish. The published artifact is frozen at that moment. Later private edits, includes, or Wiki wording changes do not flow into it.

No invented public URL exists until that act exists. Caption in the pocket stays: “A snapshot. It is not a publication.”

## Access

Unauthenticated read of the frozen payload only.

The recipient page is the pocket preview: the question, two passages, the conclusion. No authoring chrome. No Open. No Meet. No Library door. No adopt of private highlights. Ordinary Copy of the visible text is allowed; it is the same text as **Copy this snapshot**.

Including a passage does not grant the recipient rights to the underlying Library, the rest of that source, or later private notes.

## Source access

Only what the author included by name:

- title, if they had one
- the passage text frozen at include time

Never: `href`, `originalHref`, `articleId`, `highlightId`, surrounding lines, a private mark, a set-aside source, a highlight that was not bound and included.

If the Library copy later moves or disappears, the published snapshot still shows the frozen words. It is not a live citation. Lack of a door is not evidence the source was false.

## Retention

The published snapshot persists until the author revokes it. There is no silent expiry and no automatic deletion.

Revoking the public artifact does not forget the author's private carry record. Those remain different acts.

An optional end date is not part of this contract.

## Revocation

One explicit act by the author. After it, the public identity 404s.

A revoked URL stays 404. Publishing again mints a **new** identity. It does not revive the old address with new words.

Cache, when a URL exists: invalidate on publish and on revoke. Do not advertise public cache longer than `max-age=60`. Name the remaining window honestly: in-process wiki share cache is five minutes today; HTTP share responses also allow `stale-while-revalidate=300`. A snapshot URL should not inherit that stale window. Recipients may still hold a copied page.

## Derivatives

The recipient may copy the visible text. They do not receive a license to the Library, to unpublished notes, or to later private edits.

They may not pull the frozen passages into a second Library as if they had been granted the source. Two people contributing selected material to one question is H8, and stays closed.

## Taste pass (when a URL is later authorized)

**Publish this snapshot**
- Eligibility: a live carried snapshot the author explicitly publishes. Not a Wiki share. Not Copy.
- Quality bar: the frozen payload above, exactly. Identity of the public artifact is that freeze, not the live pocket.
- Silence: not live → no Publish; empty pending → no Publish; a Wiki share is a different object; filler is never the answer.

**Recipient page**
- Eligibility: an unrevoked published snapshot id.
- Quality bar: question, two included passages, conclusion. Same as the author's preview. No chrome from the pocket.
- Silence: unknown, revoked, or unpublished id → 404. No pocket. No library door. Filler is never the answer.

**Revoke this snapshot**
- Eligibility: the author of an unrevoked published snapshot.
- Quality bar: that identity 404s. A later publish is a new identity.
- Silence: already revoked stays 404. Filler is never the answer.

## What this contract does not authorize

Implementing a public URL. Server-sync of private drafts. Changing ordinary Wiki, concept, or question shares. Two Libraries meeting. Generated warrant. A person finding understanding beyond a generated answer.

Those remain separately authorized.
