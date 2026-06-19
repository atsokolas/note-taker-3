# Spec — Adopt a shared wiki ("make this mine")

**For:** Codex
**Author:** Athan + Claude (product session, 2026-06-18)
**One-line:** A user shares a wiki (page or collection); another user adopts it into their own workspace as a snapshot copy, and from that moment their own agent keeps it updated. It's a fork, not a live mirror.

**Why this matters twice:** it's a **growth loop** (a shared link is a signup magnet) *and* a **cold-start on-ramp** (an adopted wiki is instant content + the thick aha). It also unifies with onboarding starter packs — those become first-party adoptable wikis (see `noeis-onboarding-spec-2026-06-18.md`).

**Verification rule:** reproduce live on `https://www.noeis.io` — share a page from account A, adopt it from account B, confirm B's copy exists, is owned by B, carries provenance, and survives a maintenance run. State before/after in the PR.

---

## 1. What already exists (build on this — do NOT rebuild)

Sharing is shipped and safe. The adopt side is the only new layer.

| Piece | Status | File |
|---|---|---|
| `visibility: private \| shared` field | ✅ | `server/models/index.js` (wikiPageSchema ~455–478) |
| Publish action ("Share safe link") sets `visibility:'shared'` | ✅ | `note-taker-ui/src/components/wiki/WikiPageReadView.jsx:1201–1226` |
| Public read endpoint (no auth) | ✅ | `server/routes/wikiRoutes.js:1977–2000` (`GET /api/public/wiki/pages/:idOrSlug`) |
| **Safe serialization (strips private)** | ✅ | `server/routes/wikiRoutes.js:506–535` (`serializePublicWikiPage()`) — keeps title/slug/pageType/body/plainText/sourceRefs(minimal)/claims/citations/counts; strips userId, aiState, discussions, freshness, createdFrom |
| Public read view (read-only, wikilinks disabled) | ✅ | `note-taker-ui/src/pages/SharedWikiPage.jsx`, route `/share/wiki/:idOrSlug` |
| Whole-wiki markdown export (zip) | ✅ (auth only) | `server/routes/wikiRoutes.js:1753–1789` (`GET /api/wiki/export.zip`) |
| Page create + autolink + graph sync | ✅ | `server/routes/wikiRoutes.js:1911–1965`, `syncPageGraph()` |
| Maintenance service (refreshes a page) | ✅ on-demand | `server/services/wikiMaintenanceService.js:1329–1589` (`maintainWikiPage()`) |

**Gaps to fill:** no provenance field, no adopt endpoint, no adopt button, no collection-level share, no scheduled refresh (the "kept updated" promise — see §7).

## 2. The model: snapshot fork, then the adopter's agent owns it

Adoption **copies** the public-safe page(s) into the adopter's workspace at adopt time. After that the copy is fully the adopter's: it diverges, links into *their* graph, and is refreshed by *their* maintenance loop. It does **not** stay synced to the origin. (Live "follow updates from the origin" is a deliberate v2 — note it, don't build it.)

Rationale: matches "becomes theirs for their agent to keep updated," avoids cross-user data coupling, and is the git-fork mental model users already understand.

## 3. What gets copied (and what must not)

Copy **only** what `serializePublicWikiPage()` already exposes — the safe surface:
- `title`, `slug` (regenerate to avoid collisions in adopter's space), `pageType`, `body` (TipTap JSON), `plainText`, `claims`, `citations`.
- `sourceRefs` reduced to citation form (`{ type, title, url, snippet }`). These become **external citations** in the adopter's page, NOT entries in the adopter's Library and NOT the sharer's private highlights.

Never copy: `userId`, `aiState`, `discussions`, `freshness`, `createdFrom`, backlinks, graph edges. (All already stripped by the public serializer — adopt must consume the *public* serialization, not the internal one, so privacy is enforced by reuse.)

**Source deepening (optional, offered):** after adopt, show "Pull these sources into your Library so your agent can deepen this page with your own highlights." This re-binds external citations to real Library articles the adopter can highlight. Default off; one click to do it.

## 4. Provenance & attribution

Add to wikiPageSchema:
```
adoptedFrom: {
  originPageId: ObjectId,      // internal ref, not displayed
  originSlug: String,
  originTitle: String,
  adoptedAt: Date
}
```
Display on the adopted page: a quiet line — *"Adapted from a shared Noeis wiki · <date>."* Do **not** expose the origin user's identity (the public serializer doesn't carry it). If we later add opt-in author handles to shares, surface the handle then — flag as a decision, don't invent identity now.

## 5. Granularity: page and collection

- **Adopt a page** (v1 core): from `SharedWikiPage.jsx`, one button. Builds directly on the existing per-page share.
- **Adopt a wiki / collection** (the "shares a wiki" ask): sharing today is per-page. Add a lightweight **shared collection** = a named set of pages shared under one link (`/share/wiki/collection/:id`), adoptable as a bundle. Adopting a collection copies each member page (§3) and re-creates the intra-collection wikilinks among the copies so the graph arrives intact. If collection scope is too big for v1, ship page-adopt first and fast-follow collections — but the user explicitly wants whole-wiki adoption, so keep it in scope.

## 6. Dedup on adopt

If the adopter already has a page with the same normalized title:
- Default: keep both, name the new one *"<Title> (adapted)"*, and surface a one-click **"Merge with my existing page"** that asks the agent to reconcile claims/citations into one. Never silently clobber the adopter's existing page.

## 7. "Kept updated" — the maintenance integration (and the dependency)

Once adopted, the page is a normal page in the adopter's wiki and flows through `maintainWikiPage()` like any other. Two things to handle:
1. **Cold page refresh.** An adopted page initially has only external citations, no backing Library sources. `maintainWikiPage()` must handle "page whose sources aren't in my Library yet" gracefully — refresh from the citations + general knowledge, and deepen automatically as the adopter adds matching Library sources. Confirm/extend this behavior.
2. **The scheduler dependency.** "Kept updated" implies the overnight/background refresh (the morning-paper grow). Today maintenance is **on-demand only** — recon found no cron/scheduled refresh (`wikiMaintenanceService` runs on click; `wikiBriefingService` only compiles stats). **Codex must check and confirm** whether a scheduled refresh exists anywhere; if not, that scheduler is a prerequisite for both this feature's "kept updated" promise and the onboarding "while you slept" hook, and should be specced/built separately. Report the finding in the PR.

## 8. The flow (frontend)

On `SharedWikiPage.jsx` (and the collection share view):
1. Add a primary **"Make this mine"** / **"Adopt to my wiki"** button.
2. **Logged in** → `POST /api/wiki/pages/adopt { originIdOrSlug }` (or `/collections/adopt`) → server clones via §3, writes `adoptedFrom`, runs autolink/graph sync into the adopter's graph, returns new `pageId` → route the user to their new page, alive, with the attribution line and the optional "pull sources into Library" nudge.
3. **Logged out** → this is the growth moment: prompt sign up/in, carry the share id through auth, then drop the new user **into onboarding with the adopt as their first content** (they land on Screen 3/4 of the onboarding arc — a real page already built, zero effort). Wire this hand-off to the onboarding orchestrator.

## 9. Backend endpoints (new)

- `POST /api/wiki/pages/adopt` — body `{ originIdOrSlug }`. Auth required. Reads the **public** serialization of the origin, clones into caller's workspace, sets `adoptedFrom`, autolinks, returns the new page.
- `POST /api/wiki/collections/adopt` — body `{ collectionId }`. Clones all member pages + rebuilds internal links among copies.
- (Collection sharing) `POST /api/wiki/collections` + `GET /api/public/wiki/collections/:id` — create/share a named set; public read reuses `serializePublicWikiPage()` per member.

## 10. Safety

- Only `visibility:'shared'` (and non-archived) pages/collections are adoptable — enforced by reading through the existing public endpoint/serializer, never the internal one.
- No private data can leak because adopt consumes the same sanitized payload the public web view already shows.
- Adoption writes only into the caller's own workspace.

## 11. Acceptance criteria

1. Account A shares a page; account B opens `/share/wiki/:id`, clicks "Make this mine," and gets an owned copy in B's wiki with the attribution line. Paste both page ids in the PR.
2. The adopted copy contains body + claims + citations, and **none** of A's private data (no userId, aiState, discussions, backlinks, highlights). Verify by diffing against `serializePublicWikiPage`.
3. Running maintenance on the adopted page succeeds (does not error on "no backing Library sources") and refreshes content.
4. Adopting a page whose title already exists in B does not clobber B's page (creates "(adapted)" + offers merge).
5. Collection adopt copies all pages and preserves the internal wikilinks among the copies.
6. Logged-out adopt routes through signup and lands the new user in onboarding with the adopted page as first content.
7. `adoptedFrom` provenance is stored and the origin user's identity is never exposed.
8. Codex reports whether a scheduled refresh exists (§7) and, if not, flags the scheduler as a separate dependency.

## 12. Open product decisions (for Athan)
- **Author credit:** keep attribution anonymous ("a shared Noeis wiki"), or add opt-in author handles so sharers get credited (better for virality, needs an identity field on shares)? Default: anonymous for v1.
- **Collections in v1** or page-adopt first, collections fast-follow? Default per your ask: collections in v1.
- **Follow-the-origin (live updates)** is v2 — confirm you're fine with snapshot-only for now.
