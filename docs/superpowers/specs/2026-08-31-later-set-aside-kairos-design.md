# Later, Set Aside, and Kairos

**Date:** 2026-08-31
**Status:** Stage 1 shipping — piles, placement, living ink. Kairos and Feed still ahead.
**Slice:** Library articles first. Share stays out.

## Goal

Give reading the Hey triad — a work stream, a topic feed, and two piles — plus a clock that reprints a kept promise in the morning paper.

- **Imbox** — the ordinary Library: Continue, things that still want a move.
- **Feed** — already-open reading by topic. A scroll, not a shelf. Out of the Imbox.
- **Later** — owed a move, out of both Imbox and Feed. A seed.
- **Set aside** — at hand this week, out of both. A cutting in water.
- **Keep** — already shipped. Forever canon. An olive tree. Orthogonal: you can keep a cutting.
- **Kairos (Remind me)** — the appointed morning. The source returns to its **home** (Imbox or that topic’s feed) and prints once in the paper.

The product should feel like it remembers. Fun is a kept promise, not a notification.

## Why this, and which specs we questioned

Hey’s piles work because they are *places*, not stars. The Feed works because it is a *destination*, not a filter. Noeis already has Keep (evergreen) and folder shelves. A topic facet on the same stream would be starring with extra steps. Screening a folder as feed, two piles, an orthogonal Keep, and a clock is the grammar.

The delight spec (`docs/noeis-delight-two-moments-spec-2026-08-29.md`) freezes new delight until users arrive. That freeze was written to stop random flourishes on a broken morning paper. **This feature is the morning paper keeping a promise.** It is in bounds for Part B (the morning open), not a third tour. We still refuse confetti, badges, streaks, sounds, vines, and unexplained Greek on buttons.

Taste (`docs/noeis-taste-pass-spec-2026-08-29.md`) stays. A fake “you might want to revisit” is filler. An owner-set return is not.

We reversed one earlier design rule: on a quiet morning, `askedBack` may take the single pulse. Scan-for-blue should find the promise. If real news is alive, the lead still owns the pulse. Never two.

## Personality

**Olive ages, one ink.** `--noeis-living` in the semantic theme, resolved from the existing olive `--noeis-success` (`#6f7340`) — not a new palette, not lime, not a garden. Later is paler seed. Set aside is sap on the folio edge. Keep is deep moss, finally looking like the plant it is named for. Light and dark both resolve through the package.

**Material, Greek, restrained.** Olive is ink on paper. A 1px meander (Greek key) on the pile’s living rule, the feed column’s margin, and the paper’s asked-back hairline. The feed is an unrolled scroll — already open to the latest folio — not a Greek word on a button. Inscriptions may be Greek, the way Judgment already prints `μνήμη · κρίσις`. Controls stay English: Later, Set aside, Keep for good, Remind me, Read as feed.

**Kairos, not a reminder.** The date strip is an inscription of the right morning, not calendar chrome. The paper’s eyebrow for the reprint is `καιρός`. The sentence is English: *You asked for this back.*

**Anamnesis.** The reprint remembers why — title, and the reason if you left one. An Ariadne thread may run from the notice to the article. Gold, brief, orientation. Reduced motion: the knot, no travel.

**Motion.** Sentence-flight vocabulary: 150–250ms settle, no bounce. `prefers-reduced-motion`: instant state, nothing merely disappears. Absence of an empty pile is the reward.

## Architecture

A Library article has two human-only facts, plus an optional clock. The agent cannot write any of them. Same rule as evergreen.

### Placement

Mutually exclusive, like Hey’s piles:

| Value | Meaning | Imbox | Feed |
| --- | --- | --- | --- |
| `stream` | Home, not parked | Yes, unless the folder is feed | Yes, if the folder is feed |
| `later` | Owed a move | No | No |
| `setAside` | At hand this week | No | No |

Default is `stream`. Search still finds parked sources. Deep links still open the reader.

Stored on the article, modeled on Keep:

```js
placement: { type: String, enum: ['stream', 'later', 'setAside'], default: 'stream' }
placementAt: { type: Date, default: null }      // when it entered this pile; first entry, not last toggle
placementReason: { type: String, default: '', trim: true }  // optional, ≤280, for anamnesis
```

`PATCH /articles/:id/placement` mirrors `PATCH /articles/:id/evergreen`. Body: `{ placement, reason? }`. Moving to Later or Set aside records `placementAt` if the value changed. A human Done (verb off, pile Done) returning to `stream` clears `placementAt` and `placementReason`. The sheet goes **home**: Imbox if the folder is not feed, that topic’s feed if it is. A kairos **fire** returning to `stream` snapshots `placementReason` onto the briefing item first, then clears those fields — the paper must still be able to say why. Invalid value → 400. Missing article → 404. Non-owner → 404/403 as evergreen does.

Keep (`evergreen` / `evergreenAt`) is independent. Placement never writes Keep. Keep never writes placement. Feed never writes Keep.

### Home (Imbox vs Feed)

Placement is whether the source is parked. **Home** is where an unparked source lives. Home is not a third placement value.

Hey does not move a sender until you screen them. We do not move a topic until you screen the folder.

- Routing topic = **folder**. Tags do not route. Reading Drift already treats filing as the honest topic; we reuse that, we do not invent one.
- Procedural folders (`unfiled`, `later`, `needs review`, and the rest of `isProceduralShelf`) cannot be feed.
- Folder field: `asFeed: { type: Boolean, default: false }`. Human only. `PATCH` beside other folder updates. Agent cannot set it.
- Default `asFeed` is false. Filed sources stay in the Imbox until you say **Read as feed**. Unfiled sources have no feed home.
- Screening lives on the folder: quiet words in the folder or feed masthead — `Read as feed` / `Keep in Library`. Not a first-run wizard. Nothing moves until that press.

`isImboxArticle`: `placement === 'stream'` and the folder is missing or `asFeed !== true`.
`isFeedArticle`: `placement === 'stream'` and `folder.asFeed === true`.

### Kairos (the clock)

Reuses `ReturnQueueEntry` with `itemType: 'article'` (already allowed). One pending row per article. A new remind replaces the old one. Clearing Remind me completes/cancels the row.

Additions on the entry (not a second reminder collection):

```js
cadence: { type: String, enum: [null, 'weekly', 'monthly'], default: null }
lastFiredOn: { type: String, default: '' }  // local calendar date `YYYY-MM-DD` in the morning-paper timezone
```

`dueAt` already exists. `reason` already exists (≤280). Daily cadence is forbidden — that is a nag.

Timezone is the user’s morning-paper timezone, via `localDateForTimezone` in `dailyLoopService.js`.

### Imbox queries

Continue (`pickReopenCandidate` / `buildLibraryColumn`), All sources, and Unfiled show only `isImboxArticle`. Feed-home sources are not in Continue. Parked sources live in their pile, not in two lists. Folder cabinet still lists every non-procedural folder for filing; a feed folder’s *primary open* is the scroll, not the old title list. Kept shelf still includes evergreen articles even if parked or in a feed folder. Search and exact deep links are unfiltered by placement or `asFeed`.

Room projection gains `laterArticles`, `setAsideArticles`, and `feedTopics` (non-empty screened folders). Empty counts are not rendered.

## Library piles and reader verbs

Hey keeps both piles at the foot of the Imbox. We steal that.

### Column (`/library`, not reading)

Under the shelf, only when non-empty:

- **Later** — work pile. Oldest owed (`placementAt` ascending) on top.
- **Set aside** — folio stack, sap-green edge, 1px meander. Newest on top. Collapsed: thin stack + mono line, e.g. *3 at hand · oldest since Tuesday*. Click fans; click a title opens the reader.

Empty means absent. No “Later (0)”. No skeleton.

**Done** (fan control, or turning the reader verb off) sets placement to `stream`. The sheet flies **home** (Imbox shelf or the topic scroll). Reduced motion: it is simply there; the count ticks. Last item: the pile is gone.

Dedicated boards reuse the Kept column pattern (no Continue, a shelf note):

- `/library?scope=later`
- `/library?scope=set-aside`

Those empty states may explain themselves, because the person went looking.

### Left rail

Kept stays a permanent cut of everything, even at zero — that is how you learn it exists. Later and Set aside appear under Kept **only when non-empty**, in living ink. They are not folders among folders.

Feed topics appear under All sources **only when screened and non-empty**, living ink, the folder name not the word “Feed.” At most seven, most recent arrival first. The rest are findable with Find. A screened folder with no `isFeedArticle` (all parked or empty) is silent.

## Feed by topic

The first draft of this spec treated Feed as a filtered view of the Imbox. That is a facet. Hey’s Feed is a destination: those letters never hit the Imbox. We steal that.

**Not a fourth placement.** `stream | later | setAside` is still the whole placement enum. Feed is the home of an unparked source whose folder you screened.

**Not every folder.** Filing names a topic. Screening says that topic is for reading, not for working. Costco filed as work stays in the Imbox. A newsletter folder you mark *Read as feed* leaves Continue.

**Already open.** `/library?scope=feed&topic=<folderId>` is not another title list. It is a stacked column of folios, newest at top: title, source, first graph, already composed. Scroll reads. Clicking a folio opens the full reader with the same verbs. Loading forty full HTML bodies is not required; the dek plus first graph *is* “already open.” Reduced motion: stacked, no compose-in.

**Piles at the foot of the scroll too.** Later and Set aside from a feed piece fly into the same piles as from the Imbox. The stacks are global, at the foot of whichever Library column you are on.

**The paper is not the feed.** New feed arrivals never become `askedBack` or the lead. That would rebuild the Imbox on the masthead. Kairos may still reprint a piece you asked back; after fire it goes home to the feed if that folder is still screened.

**Taste (feed rail is a selector)**

- **Eligibility:** folder `asFeed === true`, not procedural, owner’s, at least one `isFeedArticle`.
- **Quality bar:** real folder name; at most seven topics, ranked by the newest unparked member’s `updatedAt` / `createdAt`; no debug/archived-only topics.
- **Silence:** no Feed heading, no “Feed (0),” no empty topic column. Opening a topic URL with no `isFeedArticle` explains itself the way Kept does, because you went looking.

**Magic.** Screening a folder: the matching Imbox rows fly into an unrolled column (sentence-flight), the rail grows a living-ink name, Continue forgets them. Unscreening reverses. The column’s left measure carries a continuous sap-green meander — a scroll’s margin, not a pile’s edge.

## Reader verbs

One action cluster beside the title, replacing the inline flex bag around Keep:

`Later` · `Set aside` · `Keep for good` · `Remind me`

Underlined words, same control family as `EvergreenToggle`. Later and Set aside swap; they do not stack. Keep is independent. Active placement inks seed or sap; Keep inks deep moss.

Pressing an active Later or Set aside returns the source **home**.

**Remind me** opens a small date strip, not a modal: Tomorrow, Next week, In a month, Every Monday, or a day. Confirm upserts the return-queue row. You can remind from Imbox, Feed, Later, or Set aside. “Set aside until Tuesday” is one breath: placement `setAside` plus `dueAt`.

## Motion and phone

Set aside / Later: the row leaves the shelf and lands on the pile (sentence-flight). The pile’s edge warms. Fan expands downward; titles stagger.

Phone (~430px): piles stay at the foot of the column. Feed is the stacked folios, not extra rail rows above the reading. Fan is a sheet from the bottom. Verify 1440, ~1320, and ~430.

## Morning paper weave

The paper is not a topic feed. New feed arrivals never enter `askedBack` and never take the lead.

Surface: `WikiFrontPage` `paper-open` column (masthead, lead or quiet sign-off, consequence, verdicts, check-in). `buildDailyLoopBriefing` adds `askedBack`: at most three due bubbles that pass the taste gates. The front page reads it the way it already reads `claimCheckIn`. Morning-paper email uses the same field. We do not send people to `/return-queue`.

Placement in the column: after the news half (lead / collision / consequence / verdicts), with the personal half (check-in). Same serif, same measure, sap-green meander hairline:

```
καιρός
You asked for this back.
The Costco 10-K
set aside Tuesday · from the margin note on returns
```

If there is no reason, the title is enough. No “Reminders.” No count.

**Pulse.** `morningPulseTarget` may return `asked-back` only when no consequence, lead, verdict, or check-in qualifies. Quiet sign-off still prints when there is no news. A quiet night plus a kept promise share a masthead: sign-off, then the personal close, pulse on that block alone.

**Ariadne.** After the briefing is on screen, a thread may run from the asked-back notice to the article’s title in the paper column — orientation to the thing promised back. No article identity: no thread. Passage-level thread is out of this slice.

### Taste (asked-back is a selector)

This block selects what the paper holds out. Per `docs/noeis-taste-pass-spec-2026-08-29.md`:

- **Eligibility gate:** owner-set bubble; article still theirs; either `lastFiredOn` is this local date (already fired this briefing window) or `dueAt` is today or earlier in the morning-paper timezone and `lastFiredOn` is not this date (about to fire).
- **Quality bar:** real title; not debug, archived, or suppressed. At most **three**. Overdue first, then earlier `dueAt`.
- **Silence fallback:** omit the block. The paper does not mention reminders. Leftovers are findable at home and in the piles. Filler is never the answer.

`askedBack` items are snapshots: `{ articleId, title, href, reason, fromPlacement, home, lastFiredOn }`. `home` is `imbox` or `feed` (folder still screened). The paper never reads live `placementReason` after fire has cleared it. v1 Ariadne, when present, orients to the article. Passage-level thread is a follow-on when parking from a highlight.

### Fire

On the local morning, inside `buildDailyLoopBriefing`, in this order:

1. Select at most three due, quality-passing rows (same ranking as the quality bar).
2. For each, snapshot title, href, reason (`entry.reason` or `article.placementReason`), `fromPlacement`, and `home` (`feed` if the folder is still `asFeed`, else `imbox`).
3. Placement → `stream`; clear `placementAt` and `placementReason`. Home does not change; the folder’s `asFeed` is the home.
4. Stamp `lastFiredOn` to that local date.
5. **One-shot** (`cadence` empty): complete the queue row. Ignoring it does not nag; it is back **home**.
6. **Recurring** (`weekly` | `monthly`): keep pending, advance `dueAt` by seven days or one calendar month. “Every Monday” is weekly on a Monday `dueAt`.
7. Put the snapshots on `briefing.askedBack`. A rebuild the same morning sees `lastFiredOn === today` on pending **or completed** rows, does not fire again, and still reprints those snapshots. One-shot completion therefore does not hide today’s print.

The two-minute morning-paper cache reuse (`MORNING_PAPER_OPEN_REUSE_MS`) already covers a double open. Idempotence is `lastFiredOn`, not hope.

Opening the article from the reprint does not re-complete a one-shot; the fire already did. From the paper the person can Later / Set aside again, which parks it and may take a new date. Snooze from the paper item is “Next week” (reschedule), not a toast.

A bubble whose article is gone is not reprinted. The queue row completes quietly. The paper does not say “unavailable.”

## Errors and empty states

- Empty pile, empty rail row, empty feed topic, empty `askedBack`: not rendered.
- Save failure: restore the previous placement, due date, or `asFeed`. Verb stays on the source. Copy: “That did not save.” Same voice as Keep.
- Invalid placement, `dueAt`, or feed on a procedural folder: 400 with a specific message.
- Agent or non-owner write: rejected.
- New remind replaces the old pending row for that article.

Optimistic UI: show local intent for the verb immediately; do not claim the Paper reprint until the briefing includes it.

## Testing

TDD, then the UI. Live acceptance on the founder account before calling the slice done.

**Backend**

- Placement exclusivity; Imbox query excludes parked **and** feed-home sources; Keep unchanged by placement or `asFeed`.
- Agent / non-owner rejected; missing article 404; procedural folder cannot be feed.
- `askedBack` selector: eligible; suppressed excluded; cap 3; quiet when none; feed arrivals never selected.
- One-shot does not reprint day two; it still reprints later the same morning after the row is completed.
- Weekly advances `dueAt`; same-morning rebuild is idempotent (`lastFiredOn`).
- Recurring does not complete the row; one-shot does.
- Fire returns a feed-home article to the feed, not to Continue.

**Frontend**

- Empty pile omitted; fan and Done; reader verbs next to Keep.
- Feed: stacked folios, not a title list; Continue omits screened-folder sources; rail silent when no feed topics.
- Screening a folder removes those rows from Imbox; unscreening restores them.
- Reduced-motion has no flight.
- Morning paper renders `askedBack` only when the briefing has it; quiet morning with no bubbles stays a sign-off.
- Quiet morning with bubbles: sign-off + asked-back, pulse on asked-back only.
- News morning: pulse stays on lead/consequence/verdict/check-in; asked-back still typesets without pulse.

**Browser**

- Library at 1440, ~1320, ~430, with and without piles, and one feed topic.
- Paper with a due bubble, without, and reduced-motion.

## Files (intended, not an implementation plan)

- `server/models/index.js` — article placement fields; folder `asFeed`; return-queue `cadence` and `lastFiredOn`.
- `server/routes/legacyContentRoutes.js` — placement GET/PATCH beside evergreen; folder `asFeed` PATCH.
- `server/services/libraryRoomProjectionService.js` / Library list queries — Imbox vs feed-home; count piles and feed topics.
- `server/routes/returnQueueRoutes.js` — accept `cadence`; upsert one pending article row.
- `server/services/dailyLoopService.js` — fire + `askedBack` on the briefing (not in the route handler).
- `server/services/morningPaperEmailService.js` — same `askedBack`.
- `note-taker-ui/src/styles/semantic-theme.css` — `--noeis-living` role.
- `note-taker-ui/src/pages/evergreenModel.js` pattern — a small `placementModel.js` for pile lines, ordering, labels. Do not overload Keep’s model.
- `note-taker-ui/src/pages/readingDriftModel.js` — reuse `isProceduralShelf` / `topicsOf`; do not duplicate the procedural list.
- `note-taker-ui/src/components/library/LibraryColumn.jsx` + `libraryColumnModel.js` — Imbox filter; render piles.
- `note-taker-ui/src/components/library/LibraryFeedColumn.jsx` — stacked folios for a screened topic (new, small).
- `note-taker-ui/src/components/library/LibraryShelfNav.jsx` — non-empty Later / Set aside under Kept; screened topics under All sources.
- `note-taker-ui/src/components/ArticleReader.jsx` — action cluster; delete the inline flex style.
- `note-taker-ui/src/components/wiki/WikiFrontPage.jsx` + `morningPaperClose.js` — `askedBack` compose, pulse target.
- `note-taker-ui/src/pages/Library.jsx` — scopes `later`, `set-aside`, `feed`.
- Tests beside each of the above.

Delete the reader’s inline Keep cluster style. Do not add a parallel reminder collection. Do not send a new delight stylesheet; living ink is a semantic role.

## Out of scope

- Share expansion (articles, highlights, clippings). Wiki / concept / question share already exists.
- Auto-screening every filed folder. Nothing becomes feed until the human says so.
- Tag-routed feeds. Folder is the routing topic; tags stay a finder’s tool.
- Wiki pages, notebook entries, and claims as first-class placement targets. The grammar should be reusable; this slice only writes it on articles.
- Daily cadence.
- Making `/return-queue` the product surface.
- Unexplained Greek on buttons, olive-branch illustration, streak copy.

## The line

Later is a seed. Set aside is a cutting. Keep is the tree. The feed is an unrolled scroll for a topic you screened. Kairos is the morning the cutting was promised back — home to the Imbox or to that scroll. The paper either has news, or it is quiet, or it keeps a promise — and it is allowed to do the last two at once.
