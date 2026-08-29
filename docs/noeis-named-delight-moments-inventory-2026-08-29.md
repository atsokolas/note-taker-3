# Named delight moments — inventory (AT-415 / AT-417)

Investigation-only snapshot of whether the product's already-named copy moments are real end-to-end, decorative, or lying. Sourced from Linear AT-415 / AT-417 and related AT-403 / AT-407 / AT-409 / AT-414, plus `docs/noeis-close-the-loop-roadmap-2026-08-29.md`.

**Verdict up front:** route and persistence primitives exist for several moments (Library deep-links, evergreen Keep, Judgment PDF pamphlet, claim check-in). The named *delight* — citation opens the marked passage, Accept inks a home-row date, Morning Paper as broadsheet, Skeptical Partner note-slide, Ariadne thread — is mostly still lying or only half-wired.

---

## 1. Wiki citation `[1]` → in-app Library reader with passage marked

**Claim (AT-403 / AT-417#1):** Click `[1]` → source name or “Open in Library” → Library reader scrolled to the cited passage, already marked. “Open source / Open original” may remain secondary for the external filing.

### Where the copy/affordance lives

| Surface | File | What the user sees |
|---|---|---|
| Inline claim marker `[1]` | `note-taker-ui/src/components/wiki/extensions/Claim.js` | Citation chip on claim text |
| Claim popover | `note-taker-ui/src/components/wiki/ClaimCitationPopover.jsx` | Support pill, epistemic ledger, source list |
| Popover open link | same | **`Return to source →`** (in-app) or **`Open original ↗`** (external) — **not** “Open in Library” |
| Source title | same | Inert `<span class="wiki-claim-popover__item-title">` — not a link |
| References section | `WikiPageReadView.jsx` (`WikiReadReferences`) | Same pattern: title inert; `Return to source` / `Open original` |
| Article reader chrome | `ArticleReader.jsx` | Separate **Open source** link = original `article.url` (external) |
| Judgment citations | `JudgmentThread.jsx` | `[n]` links via `buildSourceOpenPath`; library hrefs get `is-passage` class. No “Open in Library” string anywhere in the repo |

There is **no** UI copy string `"Open in Library"` / `"Open in library"` in the codebase.

### Does it work end-to-end?

**Partial / often broken for the named moment.**

Working plumbing when `sourceRefs` carry Library identity:

- `buildSourceOpenPath` (`note-taker-ui/src/utils/sourceRoutes.js`) prefers `type` + `objectId` (+ `parentObjectId` for highlights) over public URL.
- Library honors `?articleId=&highlightId=` and calls `readerRef.scrollToHighlight` (`Library.jsx`).
- `ArticleReader` scrolls to `[data-highlight-id="highlight-…"]`.

Gaps vs the named moment:

1. **Live AT-403 symptom still matches code:** when a source only has `url` (or `type: 'external'`), the only door is external (`Open original ↗` → sec.gov). Title stays inert.
2. **Highlight without `parentObjectId` fails closed to the public URL** (`sourceRoutes.test.js` documents this). Passage deep-link never builds.
3. **“Passage already marked” is weak:** scroll lands on an existing highlight mark if `highlightId` is present; there is no dedicated “this is the cited passage” arrival mark when the citation is article-level only, and the reader does not add a transient selection/mark for a snippet that was never saved as a highlight.
4. Copy still says **Return to source**, not **Open in Library**.

Bet 0B in the close-the-loop roadmap claims the fail-closed route contract is locally implemented — that is true for the *router*, not for populating every wiki citation with Library identity or for the delight of landing on a marked passage.

### Key files and APIs

- UI: `ClaimCitationPopover.jsx`, `WikiPageReadView.jsx` (`resolvedActiveSources`, popover mount ~3511), `Claim.js`
- Route contract: `note-taker-ui/src/utils/sourceRoutes.js` (+ tests)
- Reader: `Library.jsx`, `ArticleReader.jsx` (`scrollToHighlight`)
- Schema: `server/models/index.js` `wikiSourceRefSchema` (`type`, `objectId`, `parentObjectId`, `url`, `snippet`)
- Judgment reuse target: `judgmentModel.js` `buildSourceOpenPath` / `isLibraryHref`; inbox is passage text + Why/Against, not an “Open in Library” label

### What’s missing to make the moment real

1. Prefer Library door: title-as-link + primary “Open in Library” when `objectId` resolves; demote external to secondary.
2. Ensure maintenance/citation write paths always persist `objectId` / `parentObjectId` for Library-backed evidence (data + serializers — list/detail already know `sourceRefs.objectId` in some selects).
3. When only a snippet exists, open the article and mark/scroll the passage (snippet search or create/reuse highlight), not just the article top.
4. Frontend-mostly for copy/priority; **backend** if CoreWeave-style refs lack object identity today.

**Status: lying / incomplete** (AT-403 still the product gate).

---

## 2. Accept wiki review → quiet inked date on the row

**Claim (AT-407 / AT-417#2):** Accept one wiki review. Home row “Last review” stops saying “Not reviewed” and shows a quiet date. “Review available” becomes a day. Feels like signing.

### Where the copy/affordance lives

| Surface | File | Copy |
|---|---|---|
| Wiki home living table | `WikiFrontPage.jsx` | Columns: Wiki / Grounded in / **Last review** / Maintenance state |
| Last review cell | `wikiReviewDate()` | `page.lastReviewedAt \|\| page.qualityReview?.reviewedAt` → relative date, else **`Not reviewed`** |
| Maintenance state | `wikiReviewState()` | **`Review available`** / `New evidence` / `No proposal` |
| Shelf filters | same | Needs review / Recently updated counts |
| Accept UI (on page, not home row) | `WikiFirstHeadReview.jsx` | **Accept trusted head** / **Accept maintenance** |
| Claim disposition | `wikiClaimDispositionService.js` + workspace review UIs | Accept/preserve/reject candidates |
| Morning claim ritual | `WikiFrontPage` paper lead | Still hold / Revise / Retire (check-in, not maintenance Accept) |

### Does Accept persist a last-review date the home row can show?

**No — not in a way the living table reads.**

Evidence:

1. `wikiPageSchema` has **no** top-level `lastReviewedAt` field (`server/models/index.js`).
2. `wikiFreshnessSchema` has `status`, `lastMaintainedAt`, etc. — **not** `lastReviewedAt` / `reviewedAt` in the schema definition (writes to `freshness.reviewedAt` / `freshness.lastReviewedAt` are schema-orphans).
3. Accept research candidate (`POST …/research-candidate/accept`, ~4278 in `wikiRoutes.js`) sets `freshness.status = 'fresh'` and `lastMaintainedAt` — **does not** set anything `wikiReviewDate()` reads.
4. Claim disposition sets **`claim.lastReviewedAt`**, not page-level review for the home column.
5. Claim check-in (`recordClaimCheckIn` in `dailyLoopService.js`) sets `claim.lastCheckedAt` / `checkInStatus` — again not the home “Last review” field.
6. Front page therefore correctly shows **Not reviewed** on every row when those fields are empty — matching AT-407’s live report.

Accept **does** persist real state (candidate cleared, receipt, revision, dossier firstHead). The *named delight* (inked date on the home row) is disconnected from that write.

### Key files and APIs

- Display: `WikiFrontPage.jsx` (`wikiReviewDate`, `wikiReviewState`, living table ~1006+)
- Accept: `reviewWikiFirstHeadCandidate` → `POST /api/wiki/pages/:id/research-candidate/{accept|reject}`
- Disposition: `server/services/wikiClaimDispositionService.js`
- Freshness endpoint (orphan field): `POST /api/wiki/pages/:id/freshness/review` writes `freshness.reviewedAt`
- Metrics helper with same bug shape: `wikiPageMetrics.js`

### What’s missing

1. **Backend:** on human Accept (maintenance / first head / claim disposition), persist a page-level review clock the index actually reads (schema field + write + list projection). Prefer one durable clock, e.g. `freshness.lastReviewedAt` or top-level `lastReviewedAt`, and map it in serializers.
2. **Frontend:** after Accept, refresh home so “Review available” → quiet date without a full reload dance; optional short inked-date transition (reduced-motion safe).
3. Do not invent dates from `updatedAt` (public serializer already falls back aggressively — home must stay honest).

**Status: lying** — Accept works for dossiers; the home-row ink does not.

**Needs backend** (schema + write path) plus light frontend.

---

## 3. Morning Paper as broadsheet (one claim, today’s change, the date) — not a badge

**Claim (AT-414 / AT-417#3):** Morning Paper names yesterday’s actual close, or is silent. Broadsheet: one claim, today’s change, the date. Never a badge inventing work.

### Where it lives

| Surface | File | Behavior |
|---|---|---|
| `/wiki` fold | `WikiFrontPage.jsx` `WikiFrontPageShell` | `<details class="wiki-front-page__paper-fold">` summary: **“Morning paper”** + **“A claim and today’s changes are ready.”** when `lead` is truthy |
| Fold body | embeds `Paper` compact with `paperLead` / `paperTail` | Claim check-in, Still hold / Revise / Retire, recently grown, week line |
| Styles | `wiki-front-page.css` `.wiki-front-page__paper-fold` | Disclosure / badge chrome |
| Full Paper room | `/paper` → `Paper.jsx` | Separate Reading Loop surface (four mechanics on demand) |
| Briefing API | `/api/wiki/briefing`, `dailyLoopService` `claimCheckIn` | Lead + check-in selection |
| Email | `morningPaperEmailService.js` | Parallel delivery channel |

### Badge or editorial surface?

**On `/wiki`, it is structurally a badge/disclosure, not a broadsheet.**

- Collapsed by default behind `<details>`.
- Summary copy **always claims readiness** when any `lead` node exists — including the quiet lead *“No claim is due for review this morning.”* That is exactly AT-414’s “badge that invents work.”
- The expanded content *can* be editorial (one claim + verbs + date via `Morning paper · {mastheadDate()}`), and check-in persistence is real (`POST /api/daily-loop/check-ins/...`).
- Living index (“Your living wikis”) is the dominant first viewport; Morning Paper is not.

### What’s missing

1. **Frontend composition:** promote Morning Paper to the first editorial plane on `/wiki` (or silence the fold entirely when nothing closed); kill the always-ready summary badge.
2. **Truth:** summary/lead must say nothing when nothing closed; when something closed, name that close (pairs with Accept ink / receipts — **backend** signal quality).
3. Do not merge Keep into Morning Paper (AT-409 / AT-414 split).

**Status: half-real content, lying presentation** on `/wiki`.

**Mostly frontend** once Accept/close signals are truthful; briefing honesty may need backend.

---

## 4. Keep for good — filed feel, count ticks, survives refresh

**Claim (AT-409 / AT-417#4):** Keep a source; it feels filed; count ticks; survives reload. No Kept dashboard product.

### Where it lives

| Surface | File | Copy |
|---|---|---|
| Article reader | `ArticleReader.jsx` + `EvergreenToggle.jsx` | **Keep for good** / **Kept for good** |
| Library shelf | `LibraryShelfNav.jsx` | **Kept** + count meta |
| Empty shelf copy | `LibraryColumn.jsx` | Explains the control when empty |
| Model | `evergreenModel.js` | Labels / ordering |
| API | `setArticleEvergreen` → `PATCH /articles/:id/evergreen` (`legacyContentRoutes.js`) | Persists `evergreen` + `evergreenAt` |
| Schema | `articleSchema` | `evergreen`, `evergreenAt` indexed |
| Room projection | `libraryRoomProjectionService.js` | `keptArticles` count |

### Does it work?

**Code path looks end-to-end and real.**

- Toggle calls API; local `kept` state syncs from `article.evergreen` on id/evergreen change.
- Library updates the article list on toggle (`handleToggleEvergreen`).
- Kept shelf count comes from projection or `allArticles.filter(evergreen)`.
- Tests: `ArticleReader.test.jsx`, `LibraryShelfNav.test.jsx`, `LibraryColumnKept.test.jsx`.

Linear AT-409 is still Backlog (“Keep that doesn’t stick is a lie”), so treat production verification as open — but this is not a missing-feature gap the way citation/Accept are. If reload fails in prod, debug the PATCH/auth/cache path rather than invent a new surface.

### What’s missing for the *delight*

1. Confirm production reload (AT-409 acceptance).
2. Optional feel polish: subtle shelf count tick / filed motion (frontend-only; no toast/XP).
3. AT-409 explicitly: **no** Kept dashboard, weekly email, or Morning Paper merge.

**Status: mostly done** (verify reload); polish is frontend-only.

---

## 5. Print this as one page — artifact you slide across a table

**Claim (AT-417#5):** Printable artifact — four sections, grounded claim, colophon, Greek `μνήμη · κρίσις`. Not a browser print dialog.

### Where it lives

| Surface | File | Behavior |
|---|---|---|
| Judgment chrome | `Judgment.jsx` | Button **Print this as one page** → `downloadJudgmentPamphlet(pageId)` |
| Client API | `wiki.js` `downloadJudgmentPamphlet` | Authenticated blob download |
| Server | `GET /api/wiki/pages/:id/pamphlet.pdf` (`wikiRoutes.js`) | Builds PDF |
| PDF builder | `server/services/judgmentPamphlet.js` | LETTER PDF via PDFKit |
| Greek colophon (UI only) | `judgment.css` `.judgment-shelf::after` | `content: "μνήμη · κρίσις"` on the shelf, **not** in the PDF |

### Real artifact or `window.print()`?

**Real PDF artifact**, not browser print.

Four sections on the sheet (empty sections omitted):

1. Why (+ italic source labels)
2. Against
3. I'd change my mind if
4. What I did

Lead: claim sentence. Footer line: `Printed {date}. This is what I thought and why; the reasons are the argument, not the conclusion.` — a quiet colophon.

### What’s missing vs the named moment

1. **Greek `μνήμη · κρίσις` is not on the PDF** — only CSS on the Judgment shelf.
2. “Slide across a table” feel is product language; download is a file click (acceptable if the PDF itself is the artifact).
3. Optional: warmer typography / one-page hard constraint polish in `judgmentPamphlet.js`.

**Status: largely done**; Greek/colophon finish is a small **backend PDF** (+ optional CSS) polish.

---

## 6. Skeptical Partner’s first counterargument arrives like a note slid across

**Claim (AT-417#6):** First counterargument arrives like a note slid across, not a chat panel lighting up.

### Where it lives

| Surface | File | Behavior |
|---|---|---|
| Role | `contextualAgentContracts.js` | Judgment room → **Skeptical partner** |
| Rail UI | `AgentRail.jsx` | Proposals: sentence + source + Accept/Against/Why/Dismiss |
| Proposal motion | `agent-rail.css` | **Leave** collapse (`is-leaving`); **no** slide-in arrival |
| Closest “note slid” motion | `JudgmentThread.jsx` + `columnMotion.js` | Library inbox → file Why/Against uses `handOffSentence` / `is-arriving` on the **log row** (after human files), not on the partner’s first retrieve |
| Overnight line | `Judgment.jsx` `OvernightLine` | Separate overnight proposal, accept in place |

### How the first counterargument appears today

1. User asks (or surface retrieves); proposal **appears in the rail list** with no dedicated arrival choreography.
2. Caption remains “Retrieves. You accept.”
3. Accept writes into Why/Against; dismissal animates out.
4. The product *does* have a note-slide metaphor for **filing a library passage into the judgment log** — different moment than the partner’s first counterargument.

### What’s missing

1. **Frontend motion:** first Skeptical Partner proposal enters like a note (translate/opacity from the rail edge or page margin); honor `prefers-reduced-motion`.
2. Optional differentiation of counterevidence posture (docs already note Skeptical Partner actions are thinner than Imagen examples — `noeis-four-room-imagen-implementation-audit-2026-08-24.md`).
3. Do not turn it into toast/chat chrome.

**Status: role real; arrival delight not shipped.** Frontend-only for the named motion.

---

## Ariadne thread (roadmap signature)

Named in `docs/noeis-close-the-loop-roadmap-2026-08-29.md`:

> after a person accepts evidence, a fine warm-gold line briefly travels from the quoted source margin to the sentence it changed, settles into a quiet provenance mark, and disappears.

**Not implemented under that name.** Closest shipped relatives:

- Wiki home: `.wiki-living-row.is-library-changed::before` warm-gold vertical thread for Library-changed rows (`wiki-front-page.css`) — row decoration, not accept→sentence.
- Judgment: `handOffSentence` / fly-into-log on file — related metaphor, different surface.
- Stage 4 plan text mentioned a faint provenance thread on library-changed rows (same as above).

**Missing:** post-successful-write SVG/CSS path from source margin → claim sentence; must not precede write; reduced-motion = settle mark only.

**Frontend** after Accept/write identity exists (pairs with Bet 1 sentence loop).

---

## Prioritized implementation assessment

| Priority | Moment | State | FE vs BE | Why this order |
|---|---|---|---|---|
| P0 | Wiki `[1]` → Library + marked passage (AT-403) | Lying / incomplete | FE copy + door priority; **BE** if refs lack `objectId`/`parentObjectId`; FE passage mark | Trust-breaking; named in Bet 0; blocks “sources stay inspectable” |
| P0 | Accept → inked Last review (AT-407) | Lying | **BE schema + write** on Accept; FE row refresh/ink | Maintenance column never closes; Bet 3 gate |
| P1 | Morning Paper broadsheet vs badge (AT-414) | Content half-real; presentation lying | **Mostly FE** composition/silence; BE for truthful “what closed” | Same class of lie as fake zero; depends on real closes from Accept |
| P1 | Keep for good survives reload (AT-409) | Code looks done | Verify prod; tiny FE feel | Don’t rebuild; prove stickiness |
| P2 | Print pamphlet Greek/colophon finish | Mostly done | Small BE PDF + optional CSS | Artifact exists; finish the named details |
| P2 | Skeptical Partner note-slide arrival | Role done; motion missing | FE-only | Delight after truth |
| P3 | Ariadne thread | Spec only | FE after write success | Signature of Bet 1; must not precede durable Accept |

### Already done (do not re-litigate)

- Shared fail-closed `buildSourceOpenPath` contract + Library `highlightId` scroll.
- Evergreen Keep API + Kept shelf count wiring.
- Judgment pamphlet PDF download path.
- Skeptical Partner role labeling on Judgment rail.
- Claim check-in ritual persistence (Still hold / Revise / Retire).
- Research-candidate Accept receipt path (without home-row ink).

### Still lying

- Citation primary door to Library with marked passage.
- Home “Last review” / “Not reviewed” after Accept.
- Morning Paper “ready” badge over quiet or empty closes.
- Ariadne accept→sentence thread.
- Skeptical Partner “note slid across” first arrival.

### Frontend-only polish vs backend

| Frontend-only | Needs backend |
|---|---|
| Popover copy: Open in Library; title link; secondary Open original | Persist/repair `sourceRefs.objectId` + `parentObjectId` on wiki evidence |
| Passage mark animation when highlight opens | Page-level `lastReviewedAt` (or freshness clock) written on Accept |
| Un-fold / silence Morning Paper badge; broadsheet composition | Briefing/close signal that only names real closes |
| Keep feel / count tick | (Keep persist already exists — fix only if prod PATCH fails) |
| Skeptical Partner arrival motion | Pamphlet Greek line in PDF |
| Ariadne thread after successful write | — |

---

## Linear map

| Issue | Role |
|---|---|
| AT-415 | Parent: delight that is the product |
| AT-417 | Checklist of six named moments (child of AT-415) |
| AT-403 | Citation → Library reader (related) |
| AT-407 | Accept one wiki review on the record (related) |
| AT-409 | Keep survives reload (related) |
| AT-414 | Morning Paper close or silence (related; AT-417 text mis-pairs Morning Paper with AT-409) |
