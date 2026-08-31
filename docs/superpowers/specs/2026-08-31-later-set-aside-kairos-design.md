# Later, Set Aside, and Kairos

**Date:** 2026-08-31
**Status:** design, awaiting implementation plan
**Slice:** Library articles first. Share and topic-feed stay out.

## Goal

Give a source three honest places besides the ordinary Library stream, the way Hey gives mail Reply Later and Set Aside as different piles — plus a clock that reprints a kept promise in the morning paper.

- **Later** — owed a move, out of the day’s face. A seed.
- **Set aside** — at hand this week, not mixed into the stream. A cutting in water.
- **Keep** — already shipped. Forever canon. An olive tree. Orthogonal: you can keep a cutting.
- **Kairos (Remind me)** — the appointed morning. The source returns to the stream and prints once in the paper.

The product should feel like it remembers. Fun is a kept promise, not a notification.

## Why this, and which specs we questioned

Hey’s piles work because they are *places*, not stars. Noeis already has Keep (evergreen). Starring Later would collapse the distinction. Two destinations plus an orthogonal Keep plus a clock is the grammar.

The delight spec (`docs/noeis-delight-two-moments-spec-2026-08-29.md`) freezes new delight until users arrive. That freeze was written to stop random flourishes on a broken morning paper. **This feature is the morning paper keeping a promise.** It is in bounds for Part B (the morning open), not a third tour. We still refuse confetti, badges, streaks, sounds, vines, and unexplained Greek on buttons.

Taste (`docs/noeis-taste-pass-spec-2026-08-29.md`) stays. A fake “you might want to revisit” is filler. An owner-set return is not.

We reversed one earlier design rule: on a quiet morning, `askedBack` may take the single pulse. Scan-for-blue should find the promise. If real news is alive, the lead still owns the pulse. Never two.

## Personality

**Olive ages, one ink.** `--noeis-living` in the semantic theme, resolved from the existing olive `--noeis-success` (`#6f7340`) — not a new palette, not lime, not a garden. Later is paler seed. Set aside is sap on the folio edge. Keep is deep moss, finally looking like the plant it is named for. Light and dark both resolve through the package.

**Material, Greek, restrained.** Olive is ink on paper. A 1px meander (Greek key) on the pile’s living rule and on the paper’s asked-back hairline. Inscriptions may be Greek, the way Judgment already prints `μνήμη · κρίσις`. Controls stay English: Later, Set aside, Keep for good, Remind me.

**Kairos, not a reminder.** The date strip is an inscription of the right morning, not calendar chrome. The paper’s eyebrow for the reprint is `καιρός`. The sentence is English: *You asked for this back.*

**Anamnesis.** The reprint remembers why — title, and the reason if you left one. An Ariadne thread may run from the notice to the article. Gold, brief, orientation. Reduced motion: the knot, no travel.

**Motion.** Sentence-flight vocabulary: 150–250ms settle, no bounce. `prefers-reduced-motion`: instant state, nothing merely disappears. Absence of an empty pile is the reward.

## Architecture

A Library article has two human-only facts, plus an optional clock. The agent cannot write any of them. Same rule as evergreen.

### Placement

Mutually exclusive, like Hey’s piles:

| Value | Meaning | Default stream | Surface |
| --- | --- | --- | --- |
| `stream` | Ordinary Library | Yes | Continue + default shelf |
| `later` | Owed a move | No | Later pile / `/library?scope=later` |
| `setAside` | At hand this week | No | Set-aside pile / `/library?scope=set-aside` |

Default is `stream`. Search still finds parked sources. Deep links still open the reader.

Stored on the article, modeled on Keep:

```js
placement: { type: String, enum: ['stream', 'later', 'setAside'], default: 'stream' }
placementAt: { type: Date, default: null }      // when it entered this pile; first entry, not last toggle
placementReason: { type: String, default: '', trim: true }  // optional, ≤280, for anamnesis
```

`PATCH /articles/:id/placement` mirrors `PATCH /articles/:id/evergreen`. Body: `{ placement, reason? }`. Moving to Later or Set aside records `placementAt` if the value changed. A human Done (verb off, pile Done) returning to stream clears `placementAt` and `placementReason`. A kairos **fire** returning to stream snapshots `placementReason` onto the briefing item first, then clears those fields — the paper must still be able to say why. Invalid value → 400. Missing article → 404. Non-owner → 404/403 as evergreen does.

Keep (`evergreen` / `evergreenAt`) is independent. Placement never writes Keep. Keep never writes placement.

### Kairos (the clock)

Reuses `ReturnQueueEntry` with `itemType: 'article'` (already allowed). One pending row per article. A new remind replaces the old one. Clearing Remind me completes/cancels the row.

Additions on the entry (not a second reminder collection):

```js
cadence: { type: String, enum: [null, 'weekly', 'monthly'], default: null }
lastFiredOn: { type: String, default: '' }  // local calendar date `YYYY-MM-DD` in the morning-paper timezone
```

`dueAt` already exists. `reason` already exists (≤280). Daily cadence is forbidden — that is a nag.

Timezone is the user’s morning-paper timezone, via `localDateForTimezone` in `dailyLoopService.js`.

### Stream queries

Default Library list, Continue (`pickReopenCandidate` / `buildLibraryColumn`), All sources, Unfiled, and folder faces exclude `later` and `setAside`. A parked source lives in its pile, not in two lists. Kept shelf still includes evergreen articles even if parked. Search and exact deep links are unfiltered by placement.

Room projection gains `laterArticles` and `setAsideArticles` counts the way it already counts `keptArticles`. Empty counts are not rendered.

## Library piles and reader verbs

Hey keeps both piles at the foot of the Imbox. We steal that.

### Column (`/library`, not reading)

Under the shelf, only when non-empty:

- **Later** — work pile. Oldest owed (`placementAt` ascending) on top.
- **Set aside** — folio stack, sap-green edge, 1px meander. Newest on top. Collapsed: thin stack + mono line, e.g. *3 at hand · oldest since Tuesday*. Click fans; click a title opens the reader.

Empty means absent. No “Later (0)”. No skeleton.

**Done** (fan control, or turning the reader verb off) sets placement to `stream`. The sheet flies home. Reduced motion: it is simply there; the count ticks. Last item: the pile is gone.

Dedicated boards reuse the Kept column pattern (no Continue, a shelf note):

- `/library?scope=later`
- `/library?scope=set-aside`

Those empty states may explain themselves, because the person went looking.

### Left rail

Kept stays a permanent cut of everything, even at zero — that is how you learn it exists. Later and Set aside appear under Kept **only when non-empty**, in living ink. They are not folders among folders.

### Reader verbs

One action cluster beside the title, replacing the inline flex bag around Keep:

`Later` · `Set aside` · `Keep for good` · `Remind me`

Underlined words, same control family as `EvergreenToggle`. Later and Set aside swap; they do not stack. Keep is independent. Active placement inks seed or sap; Keep inks deep moss.

Pressing an active Later or Set aside returns the source to the stream.

**Remind me** opens a small date strip, not a modal: Tomorrow, Next week, In a month, Every Monday, or a day. Confirm upserts the return-queue row. You can remind from stream, Later, or Set aside. “Set aside until Tuesday” is one breath: placement `setAside` plus `dueAt`.

### Motion and phone

Set aside / Later: the row leaves the shelf and lands on the pile (sentence-flight). The pile’s edge warms. Fan expands downward; titles stagger.

Phone (~430px): piles stay at the foot of the column. No extra rail rows above the reading. Fan is a sheet from the bottom. Verify 1440, ~1320, and ~430.

## Morning paper weave

This is not a widget under the paper. It is composed **in** it.

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
- **Silence fallback:** omit the block. The paper does not mention reminders. Leftovers are findable in the stream and in the piles. Filler is never the answer.

`askedBack` items are snapshots: `{ articleId, title, href, reason, fromPlacement, lastFiredOn }`. The paper never reads live `placementReason` after fire has cleared it. v1 Ariadne, when present, orients to the article. Passage-level thread is a follow-on when parking from a highlight.

### Fire

On the local morning, inside `buildDailyLoopBriefing`, in this order:

1. Select at most three due, quality-passing rows (same ranking as the quality bar).
2. For each, snapshot title, href, reason (`entry.reason` or `article.placementReason`), and `fromPlacement`.
3. Placement → `stream`; clear `placementAt` and `placementReason`.
4. Stamp `lastFiredOn` to that local date.
5. **One-shot** (`cadence` empty): complete the queue row. Ignoring it does not nag; it is back on the shelf.
6. **Recurring** (`weekly` | `monthly`): keep pending, advance `dueAt` by seven days or one calendar month. “Every Monday” is weekly on a Monday `dueAt`.
7. Put the snapshots on `briefing.askedBack`. A rebuild the same morning sees `lastFiredOn === today` on pending **or completed** rows, does not fire again, and still reprints those snapshots. One-shot completion therefore does not hide today’s print.

The two-minute morning-paper cache reuse (`MORNING_PAPER_OPEN_REUSE_MS`) already covers a double open. Idempotence is `lastFiredOn`, not hope.

Opening the article from the reprint does not re-complete a one-shot; the fire already did. From the paper the person can Later / Set aside again, which parks it and may take a new date. Snooze from the paper item is “Next week” (reschedule), not a toast.

A bubble whose article is gone is not reprinted. The queue row completes quietly. The paper does not say “unavailable.”

## Errors and empty states

- Empty pile, empty rail row, empty `askedBack`: not rendered.
- Save failure: restore the previous placement or due date. Verb stays on the source. Copy: “That did not save.” Same voice as Keep.
- Invalid placement or `dueAt`: 400 with a specific message.
- Agent or non-owner write: rejected.
- New remind replaces the old pending row for that article.

Optimistic UI: show local intent for the verb immediately; do not claim the Paper reprint until the briefing includes it.

## Testing

TDD, then the UI. Live acceptance on the founder account before calling the slice done.

**Backend**

- Placement exclusivity; stream query excludes parked sources; Keep unchanged by placement.
- Agent / non-owner rejected; missing article 404.
- `askedBack` selector: eligible; suppressed excluded; cap 3; quiet when none.
- One-shot does not reprint day two; it still reprints later the same morning after the row is completed.
- Weekly advances `dueAt`; same-morning rebuild is idempotent (`lastFiredOn`).
- Recurring does not complete the row; one-shot does.

**Frontend**

- Empty pile omitted; fan and Done; reader verbs next to Keep.
- Reduced-motion has no flight.
- Morning paper renders `askedBack` only when the briefing has it; quiet morning with no bubbles stays a sign-off.
- Quiet morning with bubbles: sign-off + asked-back, pulse on asked-back only.
- News morning: pulse stays on lead/consequence/verdict/check-in; asked-back still typesets without pulse.

**Browser**

- Library at 1440, ~1320, ~430, with and without piles.
- Paper with a due bubble, without, and reduced-motion.

## Files (intended, not an implementation plan)

- `server/models/index.js` — article placement fields; return-queue `cadence` and `lastFiredOn`.
- `server/routes/legacyContentRoutes.js` — placement GET/PATCH beside evergreen.
- `server/services/libraryRoomProjectionService.js` / Library list queries — exclude parked from default stream; count piles.
- `server/routes/returnQueueRoutes.js` — accept `cadence`; upsert one pending article row.
- `server/services/dailyLoopService.js` — fire + `askedBack` on the briefing (not in the route handler).
- `server/services/morningPaperEmailService.js` — same `askedBack`.
- `note-taker-ui/src/styles/semantic-theme.css` — `--noeis-living` role.
- `note-taker-ui/src/pages/evergreenModel.js` pattern — a small `placementModel.js` for pile lines, ordering, labels. Do not overload Keep’s model.
- `note-taker-ui/src/components/library/LibraryColumn.jsx` + `libraryColumnModel.js` — filter stream; render piles.
- `note-taker-ui/src/components/library/LibraryShelfNav.jsx` — non-empty Later / Set aside under Kept.
- `note-taker-ui/src/components/ArticleReader.jsx` — action cluster; delete the inline flex style.
- `note-taker-ui/src/components/wiki/WikiFrontPage.jsx` + `morningPaperClose.js` — `askedBack` compose, pulse target.
- `note-taker-ui/src/pages/Library.jsx` — scopes `later` and `set-aside`.
- Tests beside each of the above.

Delete the reader’s inline Keep cluster style. Do not add a parallel reminder collection. Do not send a new delight stylesheet; living ink is a semantic role.

## Out of scope

- Share expansion (articles, highlights, clippings). Wiki / concept / question share already exists.
- Feed by topic.
- Wiki pages, notebook entries, and claims as first-class placement targets. The grammar should be reusable; this slice only writes it on articles.
- Daily cadence.
- Making `/return-queue` the product surface.
- Unexplained Greek on buttons, olive-branch illustration, streak copy.

## The line

Later is a seed. Set aside is a cutting. Keep is the tree. Kairos is the morning the cutting was promised back. The paper either has news, or it is quiet, or it keeps a promise — and it is allowed to do the last two at once.
