# Spec — The Paper, the Desk, the Shelf

**For:** the implementing agent (Opus)
**Author:** Athan + Claude (product design pass, 2026-09-01)
**Status:** Design brief, approved for implementation in the four passes below
**Companion:** the rendered design concept with plates lives as a Claude artifact ("The Paper, the Desk, the Shelf"); this file is the implementable text of it.
**Sits under:** `docs/noeis-four-room-surface-grammar-2026-08-20.md`, `docs/noeis-close-the-loop-roadmap-2026-08-29.md`, `docs/noeis-taste-pass-spec-2026-08-29.md`, `docs/superpowers/specs/2026-08-31-later-set-aside-kairos-design.md`

---

## The opinion

Reading has three tenses, and software that mixes them nags. Every read-later tool collapses this morning's save, the weekly newsletter, the piece promised for Tuesday, and the essay you will reread for life into one list that can only grow and only reads as guilt. Noeis keeps the tenses apart on purpose:

| Place | Tense | Role | What it is today |
| --- | --- | --- | --- |
| **The Paper** | Today | The one place anything with a clock prints — daily, weekly, fortnightly, or on the morning you asked for something back. The only *push* in the product. Silence collapses it; nothing pads it. | `WikiFrontPage` at `/wiki` (wordmark, `/`, `/today`, `/paper` all land here) |
| **The Desk** | In motion | The Library: the cabinet of folders, the Imbox, screened folders read as scrolls, the two piles. The only *pull*. Nothing on the desk nags; it waits where you left it. | `/library` and its scopes |
| **The Shelf** | Forever | The canon — what you decided to keep: a source you read, a page you built, a belief you hold. Oldest first. Never counted as neglected. | `/library?scope=kept` (articles only, today) |

One thread crosses between places: a **promise**. You park something on the desk and name a morning; the paper prints it once on that morning; it goes home. That crossing — and only that crossing — gets the gold thread.

**The feed never crosses into the paper.** That firewall is doctrine and stays.

The sentence a person should be able to say after one week: *the paper tells me what today wants; the desk holds what's in motion; the shelf holds what I keep.* Every screen must agree with it.

## Where the five products land

| Product | Its clock | Its place |
| --- | --- | --- |
| Morning paper | The world's — daily | The Paper, front page |
| Reading Drift | The season's — six 14-day buckets | The Paper, a fortnightly column; home stays atop Judgment |
| Later / Set aside / Remind me | The promise's | The Desk, the piles; crosses to the Paper once |
| The feed | Arrival — continuous | The Desk, a screened folder read as a scroll |
| Evergreen (Keep) | None — the canon | The Shelf |

### Four seams found in the code (fix first; none hypothetical)

1. `buildEvergreenIndex` in `note-taker-ui/src/pages/evergreenModel.js` — modelled, tested, never rendered. The cross-kind canon exists as dead code with its three labels written (`EVERGREEN_KIND_LABEL`: *Something you read / A page you built / A belief you hold*). The Kept shelf shows articles only.
2. `note-taker-ui/src/components/CommandPalette.jsx` — the page list still advertises Review and Map (dissolved rooms) and omits Judgment, Later, Set aside, Kept, and every feed topic. The only search affordance in the top bar reaches none of the five.
3. Two weeklies — `WeeklyDigest` prints on the paper from `GET /api/knowledge/movements/weekly`; a separate `WeeklyBrief` at `/week` hangs off one link at the foot of Judgment.
4. `LibraryShelfNav.jsx` — feed topics vanish under 900px (`const topics = narrow ? [] : …`). The paper's places strip is the only mobile door into a scroll.

## The proof of coherence — a Tuesday, a Sunday, a month later

Each beat names the surface on stage and what it hands to the next. Every surface below exists to make one of these beats true.

- **Tue 7:40 — the paper, a quiet night.** Masthead settles; one sign-off: *Quiet night. Your pages held.* Beneath, under a sap-green hairline and the eyebrow καιρός: *You asked for this back. The Costco 10-K — set aside Tuesday · from the margin note on returns.* It carries the morning's one pulse because it is the only thing alive. At the foot, the desk line. Eleven lines total. → *hands the reader one title and the reason you left it.*
- **7:42 — the thread.** Press the title; a gold line runs from the notice to the article's title as the reader opens, settles to a provenance mark, and is gone. On the title's baseline the placement switch reads `SET ASIDE · TUE`. → *hands the switch a piece with a settled promise.*
- **8:05 — the switch.** Done with it: slide to `HOME`; the fill moves in 180ms, the clock cap folds away, and in the rail *Set aside · 1* becomes absent, because empty is absent. Worth keeping for life: press *Keep this*; the word inks moss, reads *Kept*, the row makes one flight toward the shelf. Nothing asks for confirmation. → *hands the desk an honest state, or the shelf a decision.*
- **12:30 — the save card (extension).** Title, then `FILE` (tree picker, folder suggested from domain and last filing), then the same switch slid to `LATER`, cap set to *next week*. Three decisions, one card. The piece never touches the Imbox as triage. → *hands the cabinet a filed source and the paper a promise.*
- **18:00 — the desk.** The cabinet is a tree; *Investing* open, *Costco* inside it in living ink with *2 new*. Open it: an unrolled scroll, newest folio first, already composed. A folio gets the compact switch on hover and slides to `LATER`. Below the cabinet, the piles, and inside the Later fan the ledger: `asked back — Berkshire 2025 letter · next Tue`. → *hands the paper nothing; the desk never pushes.*
- **Sun 9:00 — the weekend edition.** Editions line underlines *the weekend*. The lead is the corpus's clock and takes the pulse (two named ends, two verified quotes, one sentence saying what the new does to the old). Then the drift column on its fortnight. Then the check-in as closing act. Then the desk line. → *hands Judgment a reaffirmed belief.*
- **October — the shelf.** *8 things you decided to keep. The oldest since March 2026.* Oldest first; a source, a page, a belief as peers, each with its kind as an eyebrow. The belief reaffirmed on Sunday is here too: kept exempts it from the desk's clocks, not from scrutiny. *Kept, not unquestioned.* Colophon: μνήμη · κρίσις.

## Surface I — the Paper: one edition, sections on their own clocks

Finish the merge the routes already imply. Each section prints on its cadence and runs the taste trio (eligibility gate → quality bar → silence).

| Section | Prints | Change |
| --- | --- | --- |
| The lead | Daily | None — editorial close, collision, or sign-off (`morningPaperClose.js`) |
| καιρός | The appointed morning | None — `MorningAskedBack`, at most three |
| The check-in | Daily when a belief qualifies | None — still the closing act |
| The weekend | One day a week | **Merge the two weeklies.** Connection-class corpus work + the week in your thinking. Retire `/week` as a destination. |
| The drift | Fortnightly, on bucket close | **New.** Reading Drift's one sentence + sparkline, only above `MIN_SOURCES`. Home stays atop Judgment; the paper gets the sentence, not the surface. |
| The desk line | Always, at the foot | **Promote** `LibraryPlaces` from four links to one composed sentence in living ink: *On your desk — 3 owed a move, 1 at hand, Costco has 2 new folios. The shelf holds 7.* Only non-empty places speak; the feed clause names folders, never the word "feed"; Kept always appears. |

Rules:
- **One pulse across all sections.** `morningPulseTarget` order becomes: consequence → weekend lead → daily lead → verdict → check-in → asked-back. The drift never takes the pulse (it asks nothing).
- **Cadence is printed.** The masthead grows an editions line in mono: `today · the weekend · the drift closes Tue · the canon — 7 kept`. The current edition is underlined. This is how the three places teach themselves.
- A quiet Tuesday is: sign-off · καιρός (if due) · desk line · end. Nothing else.

## Surface II — the Desk: the cabinet is a tree, everything else is a lens on it

The organized library is the desk's spine, and two products run on it: Reading Drift's topics *are* folders (`topicsOf` in `readingDriftModel.js`), and the feed *is* a screened folder (`asFeed` on the folder). The cabinet is the single source of truth; piles, scrolls, and the shelf are lenses over it, never rivals.

- **The cabinet is a tree.** Add `parentFolderId` (ObjectId, ref `Folder`, default null) to `folderSchema` in `server/models/index.js`, with index `{ userId, parentFolderId, name }` — the pattern `notebookFolderSchema` already uses at line ~312. Disclosure at every level, hairline indent guides, counts in tabular figures right-aligned. Counts roll up the tree.
- **Screened folders stay in place.** A screened folder never leaves the tree or grows a "Feed" label; its name turns to living ink at whatever depth. Unscreening reverses. Living ink never rolls up — a parent does not glow because a child is screened.
- **Nesting semantics.** Screening applies to the exact folder (`Costco` can be a scroll while `Investing` stays working material). The drift reads the **top-level ancestor** as the honest topic. Filing reads the exact folder.
- **Rail groups without new words.** Reading (Continue · All sources · the cabinet) / promised (Later · Set aside) / kept (Kept) — separated by hairlines alone.
- **The promise ledger gets a door on the desk.** Keep `/return-queue` unadvertised; print pending appointments inside the Later pile's fan: `asked back — <title> · <day>`. Reads from the return queue (`ReturnQueueEntry`, `itemType: 'article'`).
- **Filing earns its reason where filing happens.** Under the Imbox: `4 unfiled — file them and the drift can see them`.
- **Mobile.** Under 900px the places strip at the top of the Library column carries screened topics.

## Surface III — the Switch: one fact, one instrument

Placement is one mutually-exclusive fact with three values (`stream` → shown as `HOME`, `later`, `setAside`). Both scattered words and a row of separate buttons misstate it. The correct form for a three-position fact is a **switch**: one capsule, machined once, shared product-wide. It replaces `PlacementWord` + `RemindWord` in `ArticleReader.jsx`.

Two kinds of fact, two grammars:
- **Mechanics → the switch.** Where the piece sits. One hairline capsule, three positions; the active position fills with living ink (seed for Later, sap for Set aside) and the label inverts to paper. The **clock cap** is an end-cap that exists only while a parked position is active; pressing it unfolds the **return strip** beneath (`tomorrow · next week · <weekday> · a date… · no clock`; last line *just remind me — leave it where it is*). A set promise prints its day in gold. Park-and-promise is one gesture. "Remind me" no longer exists as a separate control.
- **Meaning → the word.** *Keep this* stays `EvergreenToggle` exactly as shipped: a written word with a rule under it, moss when true, reading *Kept*. It is never inside the switch.

### Craft spec
- 28px optical height (22px compact), 3px radius, one hairline (`--noeis-hairline`), interior dividers one shade lighter than the frame. Sits on the title's baseline; never wraps. Hit areas extend to 40px past the optical edge.
- Positions in the mono register, small caps, 0.13em tracking. Inactive positions faded ink; `HOME` full ink when current — the resting state is legible with no fill.
- Flat living ink fill, label inverted. No shadows, gradients, icons, glow.
- Fill slides between positions in 180ms with a settle; strip unfolds in 150ms; the row then flies to its pile in the existing sentence-flight vocabulary. `prefers-reduced-motion`: every state instant, nothing merely disappears.
- The only gold on the control is a set promise. Focus ring: 1px gold, 2px offset.
- Failure: fill slides back; copy *That did not save.* (same voice as Keep).
- One component travels: reader (full + vow), save card, library rows and feed folios (compact, on hover / long-press, no vow), paper items (as a printed receipt with one next move), palette (positions as commands: `Later: <title>`).

### The save card (extension popup)
Title · site · minutes; `FILE` — tree picker with a suggested folder (domain + last filing); `PLACE` — the compact switch with cap; `Save`. Footer line: *arrives on the desk, filed and promised.* Three decisions, one card.

## Surface IV — the Shelf: ship the canon you already built

Render `buildEvergreenIndex` on `/library?scope=kept`: one list, all three kinds, oldest-first (`orderKeptOldestFirst`), each entry with its kind as a mono eyebrow (`EVERGREEN_KIND_LABEL`), `keptShelfLine` as the heading, the colophon μνήμη · κρίσις at the foot. Wiki pages and judgments already carry `evergreen` / `evergreenAt`; the Wiki route already refuses agent writes.

Rule: **a kept belief still checks in.** Keep exempts a thing from the desk's clocks, not from the check-in selector's eligibility.

## Surface V — the Thread: the palette is the second nav; motion is a crossing

- Rebuild `CommandPalette`'s index from `noeisSurfaceDefinitions.js` plus the places model (`libraryPlacesModel.js`, `feedModel.rankFeedTopics`) so it cannot go stale. Add positions as commands on the current object and on search hits. Rows read as sentences: `Later: the Costco 10-K — parks it, oldest-owed first`.
- Sentence-flight and the gold Ariadne thread are reserved for **crossings between places**: source → pile, folio → home, καιρός reprint → article, kept thing → shelf. Movement within a place is instant.

## The house grammar — eight rules, no surface exempt

| Rule | Everywhere |
| --- | --- |
| Five inks | Seed and sap for parked positions; moss for the vow; gold for a promise or the thread; the blue pulse for today's one alive thing. Nothing else is colored. |
| Two registers | Serif when reading, mono when operating. A control never wears serif; a sentence never wears mono. |
| Sentences, not counts | *3 things owed a move. The oldest since July.* Empty is absent — never "(0)", never a skeleton. |
| Silence over filler | Every selector: eligibility gate, quality bar, silence. |
| One pulse | At most one alive element per morning across all sections. |
| Motion is a crossing | Flight and thread only between places; instant within. Reduced motion: instant everywhere. |
| Human-only vows | Keep, placement, screening: no agent writes them; the server refuses. |
| Exact return | Leaving and returning restores the exact object, selection, and context. |

## The finish — thirty-four small opinions

Tagged with the pass each rides in (P1 seams · P2 editions · P3 switch and tree · P4 thread).

**The paper**
- Number the editions: `No. 412` in the masthead — mornings since the account began. Never resets. (P2)
- Print time, not open time: `printed 6:02` under the date; after local midnight it reprints. (P2)
- The paper has an end: `— end of the paper —` after the last item. (P2)
- The pulse breathes once: 600ms swell on arrival, then still; reduced motion: still from the start. (P4)
- Recurring promises remember: first fire *You asked for this back.*; second fire of a weekly *Again, as you asked.* (P2)
- `@media print` stylesheet: masthead, rules, measure — ⌘P yields a real paper. (P2)
- Email subject = the lead's first six words, or *Quiet night.*; email footer = the desk line. (P2)

**The switch and the piles**
- `HOME` names the home: reads `IMBOX`, or the screened folder's own name (`COSTCO`). (P3)
- Long-press a position parks it and opens the strip. (P3)
- Weekday within six days, date beyond: `TUE` / `OCT 1` / `MON ↻`. One rule for every time word in the product. (P3)
- The Set aside stack counts materially: one drawn folio edge per piece up to five, then `5+`. (P3)
- Done flashes the destination: the folder's name in the cabinet inks living-green for 250ms. (P4)
- One drag grammar: onto a folder = filed; onto a pile = parked; the drop target's name inks. (P3)

**The cabinet**
- Disclosure triangles only on hover/focus; at rest the tree is names and numbers. (P3)
- Screening leaves a receipt: `screened Aug 3` under *Read as feed / Keep in Library*. (P1)
- Living ink dries in: black → olive over 250ms on screening; reverse on unscreening. (P4)
- Procedural shelves never enter the tree: one mono line under the Imbox. (P3)
- Continue remembers the exact place: *You were 40% through, Tuesday.* (P1)
- Domain screening in the save card: after three same-domain saves to one folder, *Always file berkshirehathaway.com here.* (P3)

**The shelf**
- The shelf keeps its errata: a kept belief retired in a check-in stays, struck through, `retired Sep 6`. (P1)
- Letting go leaves a seven-day receipt at the shelf's foot with an undo word; no confirm modal. (P1)
- Dates on the shelf are decision dates, never last-touched. (P1)

**Typography and materials**
- Old-style figures in serif running text (`font-variant-numeric: oldstyle-nums`); lining tabular figures in every mono receipt. (P2)
- Hairlines at half a pixel on retina (`border-width: thin`). (P2)
- Three rules, three meanings: double for editions/masthead; single for sections; meander only for living things. (P2)
- Provenance as typography: site name in small caps above the reader title. (P3)

**Voice, enforced**
- A banned-word unit test over the UI string catalogue: fails on *items, entries, content, notifications, dashboard*. (P1)
- Three error sentences product-wide: *That did not save.* / *Nothing here yet.* / *You went looking — here is why it's empty.* (P1)
- No number without a noun and a time — including the desk line and cabinet count tooltips. (P2)

**Keyboard**
- Single letters on a focused row: `h` home, `l` later, `s` set aside, `k` keep, `r` strip. Hints only while holding `?`. (P3)

**First mornings**
- Day one prints one line: *No news yet. Save something worth keeping — I'll print it when it moves.* Desk line: *Your desk is empty. The shelf holds nothing yet.* (P2)
- Day 120 prints once: *The corpus is old enough to talk back.* (P2)

## Constraints — what to break, what to keep

| Constraint | Verdict | Why |
| --- | --- | --- |
| "Two pages, one landing" | Break | Routes already merged; finish it. Retire `/week` and the old `/trending`. |
| The delight freeze | Break, narrowly | Editions line, desk line, thread-on-crossings are "the morning open" (Part B) by the freeze's own definition. Everything else stays frozen. |
| Controls are words, never buttons | Break, once | Placement becomes the product's one switch. Keep stays a word; everything else stays words. |
| "Don't send people to /return-queue" | Bend | Route stays unadvertised; appointments print in the Later pile. |
| Drift lives only in Judgment | Bend | Keeps its home; the paper prints its sentence fortnightly. |
| The folder cabinet | Keep — sacred | Folders are the source of truth two products read. Full nested tree; lenses over it. |
| "The paper is not the feed" | Keep — sacred | The desk line is as close as they ever get. |
| One pulse, silence over filler, human-only Keep | Keep — sacred | The doctrine that makes the ambition smooth. |

## Sequencing — four passes, each shippable

1. **P1 — Close the seams (days).** Regenerate the palette from surface definitions; fix mobile feed topics; retire `/trending`; render `buildEvergreenIndex` on the Kept shelf; shelf errata + let-go receipt; screening receipt; Continue position; banned-word test; three error sentences.
2. **P2 — The paper's editions (days).** Editions line; desk line as a sentence; drift column on bucket close; merge the two weeklies into the weekend; edition number, print time, end-of-paper line; recurring-promise copy; print stylesheet; email subject/footer; numerals and hairlines; first-morning and day-120 lines.
3. **P3 — The switch and the tree (a week).** The placement switch on the reader with cap and strip (replacing `PlacementWord` + `RemindWord`); compact on rows and folios; printed receipts on paper items; positions in the palette; `parentFolderId` on Library folders and the cabinet tree with nesting semantics; procedural tray; drag grammar; row keys; provenance small caps; the save card with domain screening.
4. **P4 — The thread (a week, after users arrive).** Reserve sentence-flight and the thread for crossings; pulse-breathes-once; living-ink dries in; done-flashes-destination; the morning-open choreography from the delight spec's Part B.

Passes 1–2 add no surface area the plan forbids and are honest keyboard work before the five users arrive.

## Where the code lives

- Nav / rooms: `note-taker-ui/src/system/noeisSurfaceDefinitions.js`, `note-taker-ui/src/layout/TopBar.jsx`, `note-taker-ui/src/navigation/appNavigation.js`, routes in `note-taker-ui/src/App.js`
- The paper: `note-taker-ui/src/components/wiki/WikiFrontPage.jsx`, `morningPaperClose.js`, `MorningConsequence.jsx`, `MorningVerdict.jsx`, `MorningCheckIn.jsx`, `MorningAskedBack.jsx`, `WeeklyDigest.jsx`; server `server/services/dailyLoopService.js`, `kairosFireService.js`, `morningPaperEmailService.js`, routes `server/routes/dailyLoopRoutes.js`
- Drift: `note-taker-ui/src/components/ReadingDrift.jsx`, `note-taker-ui/src/pages/readingDriftModel.js` (client-side; no endpoint)
- Placement / Kairos: `note-taker-ui/src/pages/placementModel.js`, `kairosModel.js`, `components/PlacementWord.jsx`, `components/RemindWord.jsx`, `components/library/LibraryPiles.jsx`, `components/library/LibraryColumn.jsx`, `components/library/LibraryPlaces.jsx`, `pages/libraryPlacesModel.js`; server `server/routes/legacyContentRoutes.js` (placement GET/PATCH), `server/routes/returnQueueRoutes.js`, `server/services/libraryRoomProjectionService.js`
- Feed: `note-taker-ui/src/pages/feedModel.js`, `components/library/LibraryFeedColumn.jsx`, `components/library/ScreenWord.jsx`, `components/library/LibraryShelfNav.jsx`; server `PATCH /folders/:id/feed`, `server/lib/feedHome.js`
- Evergreen: `note-taker-ui/src/pages/evergreenModel.js`, `components/EvergreenToggle.jsx`, styles `styles/evergreen.css`; server `legacyContentRoutes.js` (article), `wikiRoutes.js` (page, refuses agents)
- Folders: `folderSchema` in `server/models/index.js` (flat today); nesting precedent `notebookFolderSchema.parentFolderId`
- Palette: `note-taker-ui/src/components/CommandPalette.jsx`
- Orphans to retire or fold: `pages/Trending.jsx` + `GET /api/trending`; `layout/LeftNav.jsx` (dead sidebar); `/week` (`WeeklyBrief`)

## Testing

TDD beside each file, then rendered acceptance at 1440, ~1320, and ~430 with reduced motion, then live on the founder account. Every selector gets the trio tested: eligible, suppressed, cap, silence. The switch gets: exclusivity, cap only when parked, strip options, weekday-vs-date rule, failure restores, reduced motion instant, keyboard letters. The tree gets: roll-up counts, living ink does not roll up, drift reads the top-level ancestor, procedural shelves excluded. The shelf gets: three kinds, oldest first, errata struck through, let-go receipt and undo.

## The line

The paper tells me what today wants. The desk holds what's in motion. The shelf holds what I keep. One switch moves things between them; one thread shows the crossing; the cabinet underneath never moves at all.
