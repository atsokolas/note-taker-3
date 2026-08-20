# The judgment loop

*2026-08-18*

## The bet

Every room in Noeis produces inventory. Library produces saved sources, Think
produces notes, Wiki produces pages. Inventory accumulates and never closes,
and the agent accelerates it — 69 pages, 48 needing review, is the agent
outrunning the human.

Judgment is the only room that produces closure. A decision is dated and done.

So the loop is: **read quietly, let beliefs form, and let the product tell you
when your own library starts to disagree.** Deciding is always optional.
Nothing is ever owed.

## What changes on each surface

- **Judgment** is the home of the loop. One claim, one new thing that bears on
  it, three moves — and when there is nothing, it says so.
- **Wiki** stops being a place you maintain. It is what the agent reads to know
  what you think. No review counts, no maintenance state, no badges.
- **Library** is intake. You save all day through the extension; it is where
  this morning's evidence came from, not a room you visit.
- **Think** is where a claim is born. One move: *I think this is true*.

## Why judgments go static, and what to do about each

Three states, distinguishable from the source-events feed:

| state | meaning | what the product does |
|---|---|---|
| **Live** | evidence arrived, you engaged | nothing |
| **Quiet** | nothing has arrived | **nothing** — silence is correct |
| **Avoided** | evidence arrived, you never looked | bubble it |
| **Can't check** | no falsifier; nothing could bear on it | say so once |

Bubbling up *quiet* is nagging. Bubbling up *avoided* is the product doing its
job. Most tools collapse both into "stale"; we must not.

### What Fizzy gets right, and where it does not transfer

37signals' Fizzy auto-closes cards after a configurable inactivity countdown
(default 30 days). Any activity resets it. Columns holding cards near the date
show a bubble at the top of the column, and the terminal state is a **Not Now**
column rather than deletion.

Five properties worth taking:

1. Neglect is measured by inactivity, not deadlines.
2. Any engagement resets the clock. It is forgiving.
3. The signal appears in place, on the surface you are already looking at.
4. The terminal state is set aside, not destroyed.
5. Pruning is the system's job, on by default.

Where it does not transfer: Fizzy tracks **work**, and an idle card means
nobody is doing it. A judgment is not work. A belief untouched for six months
may be your best one — settled, load-bearing, correct. Fizzy's clock measures
*your* inactivity; ours must measure the gap between what arrived and what you
looked at. Same mechanism, inverted trigger.

## The move Fizzy showed we are missing

Judgment has three moves: Still hold / Revise / Retire. Retire means *I no
longer believe this*. Fizzy's Not Now exists because people need a different
state: *I am not tending this right now*. Forcing the second through the door
of the first is why things rot in a list instead.

**Park** is the fourth move. Reversible, no claim about truth.

## And the one that compounds

Closing or parking a judgment is where the durable asset is made, and it is not
the claim — it is what you learned. **A lesson** is recorded at the moment a
judgment closes or parks, and it outlives the claim it came from. Lessons are
their own surface: the shortest, most re-readable thing in the product.

## Stages

1. **Library → judgment deposit.** Two directions. From a judgment: *what does
   my library say about this?* From a source: *does this bear on anything I
   hold?* Candidates come back with provenance and one action each — file under
   Why, or file under Against. The agent retrieves; the human accepts.
2. **Park, and the lesson.** The fourth move, and the record it leaves.
3. **The three states.** Per-claim activity read from source events; the bubble
   in place on the judgment index, not only in a brief.
4. **The weekly brief.** A summary of what the surfaces already showed. Reuses
   the pamphlet renderer.
5. **Claim dependencies.** If you retire *compute is scarce*, what happens to
   *CoreWeave is undervalued*? Agent-proposed, human-accepted — never a graph
   you are asked to draw.

Stage 1 first because everything downstream is thin without a filled ledger.
Stage 5 last because it is the best idea and the most speculative, and it needs
a real stock of claims before it means anything.

## Rules that do not bend

- Agents retrieve. The human accepts. Nothing writes itself in.
- Silence is a valid morning.
- No count of things you owe, on any surface.
- Every deposited line carries where it came from.
