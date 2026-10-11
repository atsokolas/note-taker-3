# Onboarding, library-first — plan

Date: 2026-08-17
Status: plan (no code changes in this pass)
Supersedes the first-run half of `docs/noeis-onboarding-town-model-spec-2026-08-13.md`

---

## The decision

**First run gets the user's material into their Library and ends there. Onboarding
does not build a wiki page.**

A wiki page is a built thing — synthesis over accumulated reading. One pasted link
is not accumulated reading. The system already knows this and refuses; we spent a
day trying to overrule it.

## Why — what the evidence actually said

The evidence gate rejects claims whose sentences have no lexical anchor in their
cited source. Chasing that produced four changes, each an improvement, none a fix:

| change | measured effect |
|---|---|
| Writer's window aligned with the gate's (800 -> 1800 chars) | 98 words -> 308; mechanism and boundary coverage absent -> present. Still rejected. |
| Source budget by source count (1800 -> 12,000 for a single source) | *Survivorship bias*, failed 3x, built clean with zero gaps. Also *Loss aversion*. |
| Quality rebuild re-enabled | repairs a near-miss draft that was previously abandoned |
| Longer sources | *Confirmation bias* (112k chars) still fails. Same article can pass and fail on consecutive runs. |

The pattern is not a tuning problem. **With one source, an article of any substance
has to reach past its evidence, and the gate is right to stop it.** The gate is the
product working. The premise — that a first page should exist at all — is what was
wrong.

### What that premise cost

- A ~20 second wait the user cannot skip (URL fetch + page create), then a build
- A whole detached-build apparatus (202 + polling + ambient banner) whose only job
  at minute one is to hide that wait
- "Your first page is ready" displayed while the build is still running — and, in
  the captured run, still running 143 seconds later
- Roughly half of new users meeting a failure as their first outcome

Removing the premise removes all four.

---

## What first run becomes

1. **Get material in.** Connect an archive, or paste a link, or paste text.
2. **Land in the Library, on that material.** It is there, attached to its source,
   and nothing had to be synthesised for it to be real.
3. **Walk them through** — Library, Think, the wiki — while nothing is pending.
4. **End back in the Library.**

The wiki is introduced as where this goes once there is enough of it, not as
something manufactured on day one.

### What this deletes from the current flow

- The wiki page created from a pasted link
- The build kicked off during onboarding
- "Your first page is ready"
- Every first-run failure state, because nothing can fail
- The build banner's role in onboarding (it stays for real builds later)

### What survives, and why

- **Detached build + banner + stall timeout.** Still correct for a real build the
  user starts later. Built, verified, keep.
- **The walkthrough.** Now runs with nothing pending, which is simpler.
- **The extension ask** on the final screen.
- **The fork path.** Forking a public wiki copies pages that were already built
  from real material — that is legitimately a built thing, and it should still land
  on the wiki. See Decision 1.

---

## Findings from the screen review, folded in

Captured from a real signup: `outputs/onboarding-screens-2026-08-17/`.

**Connectors (answers to the two questions raised)**

- The provider names — Readwise, Notion, Instapaper, Evernote — are **static prose,
  not links**. Clicking a name does nothing.
- The one link, "Connect your reading archive", goes to `/connections#sources`: the
  whole settings page, not a named connector, and it **leaves onboarding with no
  return path**.
- Pasting a link **does** add the source to the Library. That part already works and
  is the half worth keeping.

**Copy and truth**

- "Your first page is ready" fires on build *start*. It is false when shown.
- "Now write one thing you believe" asks the user to compose a sentence before they
  have received anything.
- The final screen carries four competing asks: write a sentence, show me around,
  connect more reading, add the extension. Two authors, one screen.

**The walkthrough talks past empty rooms**

- Think: "This is where reading turns into your own thinking" over *No notes yet.*
- Home: "This is home" over *The loop isn't running yet* and
  *first connection possible August 17, 2027* — a date a year out.

**Layout and detail**

- Screens 2-6 use roughly 40% of a 1440px window, weighted top-left, with a large
  empty band above the content.
- Almost every action is an underlined text link — Start, Build from this, Add
  selected pack, Write it down, Show me around. The only real button on the final
  screen is "Add the extension", the least important action there.
- Starter pack card clips: "The Munger latticework for better judgment." collides
  with the next column.
- Build banner wraps a long title across three lines; "- Wikipedia" suffixes do not
  help.

---

## Stages

### S1 — Library-first first run
- Paste/import creates the Library source and **stops there**. No wiki page, no
  build, no build options.
- Final screen becomes an arrival, not a claim: the material is in, here is what it
  is, here is where it went.
- Remove "Your first page is ready" and every first-run failure path.
- Onboarding ends by landing them in the Library on their new source.
- *Removes:* the ~20s blocking wait's justification, the false headline, and the
  50% first-outcome failure rate.

### S2 — Make the connectors real
- The provider names become the affordance. Clicking Readwise starts Readwise.
- Connecting returns **into onboarding** with a receipt — "read 214 highlights" —
  rather than stranding the user on a settings page.
- Keep the paste box as the no-archive path.

### S3 — Honest walkthrough
- Three stops: Library, Think, the wiki. Connections dropped. *(Shipped, PR #172.)*
- Each stop must read correctly when the room is empty. A stop that can only say
  "nothing here yet" either says something true about what will arrive, or is cut.
- Fix "first connection possible August 17, 2027" or stop showing a date.

### S4 — One screen, one ask
- Resolve the two-author seam on the final screen. Decide what the single next
  action is; demote or remove the rest.
- Give real actions real buttons.

### S5 — Layout and polish
- Widen the column, remove the empty top band, fix the pack card clipping and the
  banner title wrap.
- Strip "- Wikipedia"-style site suffixes from imported titles.

### S6 — What is left of the build work
- Keep detached build, banner, stall timeout for user-initiated builds.
- Decide when a first wiki page is *offered* — a threshold of sources, or an
  explicit "build a page from this" action. Not during first run.

---

## Decisions needed

1. **Fork path ending.** A fork arrives with real pages. Land on the wiki (it has
   something to show), or the Library for consistency? Recommend: the wiki.
2. **Does anything get made during first run?** The Library source is real but
   passive. The "one thing you believe" sentence already on the screen would be a
   made thing that cannot fail. Keep it, move it, or cut it?
3. **When is a wiki page first offered?** After N sources, after a first highlight,
   or only on explicit request.

## Not doing

- Loosening the evidence gate. It was right every time it was measured.
- Further source-budget tuning for first run — the budget change stays for real
  builds, but the first-run case it was chasing disappears with this plan.
