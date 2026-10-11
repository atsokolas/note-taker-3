# Library — Iteration 02

Authority: supplied Library brief and `/Users/athantsokolas/Downloads/library-v2.html`.
The mentioned DESIGN-NOTES.md was not attached. Private Library and ArticleReader only.
Baseline: rebased main `2b14a7c1`; isolated branch `codex/library-iteration-two-2026-09-16`.
Canonical planning checkout and parallel worktrees remain untouched.

## Storyboard and visual direction

Warm paper, serif source titles, quiet green traces: one title, one search, one
collection. Navigation holds shelves; no permanent context rail. Touch a row to
recognize it in an inline Peek, open its exact passage, leave a thought, and return
to the same shelf/query/row. The changed personal trace is the receipt. A later
visit resumes a real independently saved reading place, without progress claims.
Motion is limited to Peek appearance and a temporary return marker; reduced-motion
users receive still, legible state changes. Existing global navigation is retained.

## Read-only architecture inventory and replacement plan

- Library.jsx coordinates existing filing, placement, Keep, annotation, source
  identity and AgentRail actions. Preserve those handlers and nested shelf grammar.
- LibraryMain, LibraryColumn and LibraryFeedColumn currently render different
  browse hierarchies, featured continuation and piles. Replace routine collection
  branches with a common bounded source list; preserve cross-kind Keepers and
  explicit relevance/review views rather than discarding domain capability.
- Existing All/Imbox filters exclude parked and feed material. The new collection
  must query owned saved articles without those placement exclusions and retain
  visibility/suppression gates. Server-backed search is separate from page browse.
- ArticleReader already owns highlight creation/reuse, exact fragment navigation,
  ReadFresh, authored passage work, provenance, Keep and placement. Extend it with
  one reading-place hook and an anchored thought editor; do not replace the reader.
- articlePassageAnchor supplies exact/context/offset resolution. Reuse its canonical
  text and mapping for automatic places and Peek; ambiguous/changed text never
  claims exact recovery. No navigation-only highlight writes.
- Current `lastPlace` is highlight-derived and its percentage copy overclaims
  reading. Replace it in the new surface with actual ArticleReadingState; label
  retained highlight-only references as marked passages.
- Reading state gets one owned unique document per article, independent timestamps,
  bounded anchor and ratio, owner checks on every route, idempotent article-delete
  cleanup and a post-write ownership check for deletion races. No Article mutation.
- Existing legacy article list/API remain compatible for other callers. Extend
  Library with a small explicit collection endpoint for paginated source summaries,
  full-corpus title/body/highlight-note matches and one honest personal trace.
- AgentRail provider stays mounted. Only Library opts into an invoked context
  surface; source/shelf/library scope must be explicit and collapse preserves chat.

## Implementation slices

1. Quiet collection and shared source rows; remove default hero/pile redundancy.
2. Single inline Peek and account-scoped collection return state.
3. Owned server reading state and bounded, deduplicated background writes.
4. Exact/approximate resume priority and a truthful continuation trace.
5. Anchored thoughts, note/body search results and exact arrival.
6. Scoped Guide, responsive/keyboard/reduced-motion and regression acceptance.

## Verification plan

Real Mongo ownership, uniqueness, timestamp invariance, deletion and 300+ source
pagination/search; reader tests for no mount write, settled movement, deduplication,
flush, explicit-anchor precedence and conservative recovery; rendered Chromium and
WebKit at1440/1024/768/390 with long titles, absent content, many shelves, placement,
thought search, Peek/return, ReadFresh and unchanged source ordering. No live AI
calls. Physical device/IME and production proof remain distinct from local QA.

## Delivered behavior

The default Library is now one quiet source collection. Its left rail contains
the durable Library grammar (All sources, Desk, Later, Keepers, Unfiled,
Passages, and real shelves); the middle contains one title, one search, and the
collection; the right side stays absent until the person invokes the existing
Guide. `LibraryCollection` replaces the routine `LibraryColumn` and
`LibraryFeedColumn` browse paths, and those superseded components and tests are
deleted. Specialized highlight, relevance, and review views still use the
existing production components.

Each source row shows its title, useful source metadata, and at most one real
trace. The trace comes from a saved thought, an actual marked passage, or the
independent reading place. Rows do not synthesize a summary or invent a reason
the person cared. Peek expands beneath one row, loads real source text, supports
Escape/focus restoration, and can open the reader at the displayed passage
without writing reading state. Later and Desk actions preserve the canonical
source; placement receipts include Undo. Keepers retains the cross-kind Wiki
canon.

ArticleReader now remembers one private reading place per person and article.
It ignores initial mount, arms after meaningful reading input, observes semantic
passages, waits for movement to settle, and deduplicates unchanged anchors.
Visibility change, page hide, article switch, and unmount flush a pending change.
Failures remain quiet and retry on the next meaningful place. Explicit highlight,
search, or URL destinations win over the automatic place. A normal reopen may
show a small temporary “Back where you left off” marker and “Start at top”; it
never claims completion or a percentage read.

Selecting source text now offers Leave a thought beside the existing actions.
The editor stays anchored to the exact highlight, retains the draft after a
failed save, and uses the existing private highlight note field. After return,
that thought can become the row’s single trace. Search covers the owned corpus,
including readable source text and attached passage thoughts, while normal
browse remains paginated. A match names its evidence and opens the associated
passage or thought directly.

The existing AgentRail remains the only assistant. Library invokes it on demand
with an explicit source, shelf, or whole-Library scope. Collapse preserves the
conversation, and malformed scope fails closed.

## Data model and API

- `ArticleReadingState`: `{ userId, articleId, anchor, ratio, visitedAt }`, with
  independent timestamps and a unique `userId + articleId` index. The bounded
  anchor permits 6,000 characters of text, 240-character prefix/suffix context,
  a non-negative safe approximate offset, and a ratio from zero to one.
- `GET /api/articles/:id/reading-state`: human-authenticated owner read with
  `no-store`; a deletion race is rechecked before returning private state.
- `PUT /api/articles/:id/reading-state`: validates the bounded place, upserts
  without touching Article, recovers a duplicate-key race, then rechecks article
  ownership and removes a stale place if deletion won.
- `GET /api/library/collection`: owner-scoped pagination, sorting, suppression
  gates, canonical placement semantics, full-corpus search, one honest trace,
  and match identity sufficient for direct arrival.
- Legacy article deletion removes the associated reading-state row. No migration
  or Article rewrite is required; the new collection is additive.

## Anchor recovery and changed text

Reading places reuse the reader’s canonical visible-text mapping. Resolution
prefers unique exact text with prefix/suffix context, then a context-qualified
approximate offset. Repeated identical text without enough context is rejected.
A conservative ratio fallback may place the viewport near the old location, but
the UI does not claim exact recovery. Explicit destinations retain higher
priority. When a search or Peek passage no longer resolves, the reader opens the
source with the existing changed-passage message instead of attaching the anchor
to a plausible different sentence.

## Verification evidence

- Focused frontend regression: 52 suites and 649 tests passed after rebasing the
  completed Library work onto current main.
- Server agent regression: collaborative agent, authorship boundary, Wiki graph
  stream, and two Library scope tests passed with zero live model calls.
- Optimized React production build compiled successfully.
- Isolated real Mongo acceptance passed against 312 sources: owner isolation,
  unique reading-state key, validation, independent timestamps and ordering,
  full-corpus body/thought search, placement independence, private access, and
  deletion cleanup.
- Chromium rendered acceptance passed Peek/no-write, Escape/focus, automatic
  resume and write deduplication, thought persistence and row receipt, body and
  thought search/direct arrival, collection scroll/Peek/focus restoration, Guide
  draft retention, reduced motion, missing content, and zero horizontal overflow
  at 1440, 1024, 768, and 390 pixels.
- WebKit passed inline Peek and exact passage arrival at 1024 pixels.
- A touch-sized Chromium run passed selection-toolbar bounds, creation of a new
  anchored thought, persistence, private search, exact readback, and no overflow.
- `git diff --check` passed.

Screenshots:

- `output/library-v2/collection-1440.png`
- `output/library-v2/collection-1024.png`
- `output/library-v2/collection-768.png`
- `output/library-v2/collection-390.png`
- `output/library-v2/desktop-peek.png`
- `output/library-v2/webkit-1024.png`
- `output/library-v2/phone-selection.png`
- `output/library-v2/phone-thought.png`
- `output/library-v2/unavailable-phone.png`

## Files and replacement boundary

The implementation adds the collection and reading-state APIs, the semantic
collection/Peek, anchored thought and reading-place modules, the server model and
routes, scoped-agent tests, and the isolated acceptance fixture. It changes
Library coordination, ArticleReader, the shelf rail, AgentRail invocation,
selection placement, shared anchor mapping, deletion cleanup, and their tests.
It removes `LibraryColumn`, `LibraryFeedColumn`, their obsolete tests, and the
fake percentage/continuation branches from `libraryColumnModel`.

## Known limits and deliberate differences

- Evidence is local and fixture-authenticated. This branch is not merged,
  deployed, or authenticated against production yet.
- WebKit provides Safari-engine coverage; a physical iPad, hardware keyboard,
  mobile Safari viewport chrome, and IME composition still need device acceptance.
- Reading-place acceptance proves reopen and exact readback within the test
  session. Cross-device behavior follows server persistence but still needs a
  two-device production check after deployment.
- All Sources means all authorized saved Article sources, including Later, Desk,
  and feed placements, subject to visibility/suppression rules. Private notes and
  highlights surface their parent source rather than appearing as duplicate
  top-level sources. Cross-kind Wiki pages and beliefs remain in Keepers.
- The prototype’s fixture-only count, fake reasons, separate Source Guide, and
  duplicate clean-reading controls are omitted. Production keeps global
  navigation, nested filing, provenance, Read Fresh, source connections, Think
  handoff, and unavailable-source behavior because those are existing capabilities.
- Full-corpus search is intentionally separate from bounded browse. It streams
  candidate source text on a query and uses a server time bound; a future Atlas
  search index may replace that scan without changing the response contract.
