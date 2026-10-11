# Spec — Delight, aimed at two moments

**For:** Codex / Cursor
**Author:** Athan + Claude (product review, 2026-08-29)
**Gate (revised 2026-08-29):** **Part A is ungated** — it is verification QA of already-shipped work and can run immediately, in parallel with the Taste Pass. **Parts B and C unblock only when the Taste Pass gauntlet passes** (`noeis-taste-pass-spec-2026-08-29.md`). Fun lands on top of trust; a sentence-flight animation on a duplicated claim is lipstick on a bug. Sequence is the feature. Side benefit: the Part B/C recordings double as demo assets for user recruitment and the LongJump thread.

**Context:** a real delight vocabulary already shipped (much of it 2026-08-29 via Cursor, **unverified live**): magnetic rows · sentence-flight (inbox passage flies into the log) · two inks + one warm highlight · folio line ("what you hold" on a related source) · opinion ghosts on hold-change · "Name this" ghost on unnamed cases · Library doors on citations · "Accept inks Last review" · Morning Paper as close-or-silence (a collision of two closes, or quiet) · Keep filing feel · the Greek colophon (μνήμη · κρίσις) · Skeptical Partner note-slide. This spec is therefore **verify → complete → concentrate**: confirm what exists, finish its rough edges, and concentrate all remaining effort on the two moments that carry the daily ritual. **No new delight moments beyond these two** until real users are in the product.

**House rules for all motion (existing vocabulary, keep it):** material metaphors only — ink, paper, folio, doors; 150–250ms with settle, no bounce; `prefers-reduced-motion` honored everywhere (state changes instantly, nothing merely disappears); no confetti, no badges, no streak-fire — the mono register IS the reward; every moment must read as *the product being well-made*, not *the product performing*.

---

## Part A — Verify the shipped inventory (evidence first)

For each named moment, verify live on the founder account and paste a short screen recording or before/after screenshots in the PR. Fix what's broken; delete what doesn't land rather than leaving it half-alive.

| # | Moment | Where | Verify |
|---|---|---|---|
| A1 | Sentence-flight | Judgment inbox → log | A filed Why/Against visibly travels into the arriving log row; with reduced-motion it appears instantly in place |
| A2 | Magnetic rows | Library/wiki lists | Hover bloom follows cursor; no jank at 60fps; first-frame counts honest |
| A3 | Two inks + warm highlight | Reader | Highlight + annotation inks are distinct and consistent light/dark |
| A4 | Folio line | Reader, related source | "What you hold" line appears only when a real held claim relates; empty fetches never blank the reader (regression noted in `a3eb4649` — confirm fixed) |
| A5 | Opinion ghosts / "Name this" | Judgment | Previous opinion ghosts on hold-change; unnamed case shows the ghost prompt; ghosts never trap focus or block edit |
| A6 | Library doors on citations | Wiki claims | Citation popover opens the in-app reader at the passage (not a dead end) |
| A7 | Close-or-silence + collision | Morning paper | A news day names one editorial close, or a collision of two; a quiet day is silence — never broadsheet, never skeleton, never filler |
| A8 | Colophon + note-slide | Judgment rail | Colophon renders both themes; Skeptical Partner notes slide in without shifting layout |

**Acceptance:** the table above with pass/fail + evidence per row; failures fixed or the moment removed.

## Part B — Moment one: the morning open

The daily open should feel like a paper arriving, not a page loading. Build on A7:

1. **The settle.** On open, the masthead date and lead compose with one orchestrated entrance — lead text first (cache-first, instant), then the mono readouts settle in ≤400ms total. One motion, not scattered fades. Reduced-motion: everything instant.
2. **The quiet day has its own pleasure.** When there's no news, the paper prints a single short sign-off in the editorial voice — rotating among a small fixed set (write ~6: e.g. *"Quiet night. Your pages held."* / *"Nothing moved. Read something worth keeping."*) — plus the date. No two consecutive days repeat one. Silence with craft is the brand.
3. **The one blue thing.** If (and only if) something is alive this morning, exactly one element carries the pulse accent (per the earlier pulse rule). Scan-for-blue = read-the-day. Never two.
4. **The check-in as closing act.** Post-Taste-Pass claims are short and real; give the tap its due — verb press inks the choice, the mono tally ticks up in place (`reaffirmed · 4th · held 212 days`), and the block settles to rest. Retire: the claim strikes through and *files itself* toward the casebook (one motion, same vocabulary as sentence-flight).
**Acceptance:** two 10-second recordings — a news morning and a quiet morning — each legible as one designed moment; reduced-motion variants verified.

## Part C — Moment two: the write-down

"What do you think is true? Write the claim as one sentence." is the most important input in the product. Make committing a belief feel like ink:

1. **The line accepts like a pen.** On submit, the sentence lifts from the input and sets into the casebook list (sentence-flight vocabulary, A1), the input clearing only after the landing — never evaporate-and-pop.
2. **The case opens quietly.** The new claim's row shows its birth in mono (`held · today`), and the Skeptical Partner acknowledges once, in character (*"Noted. I'll look for what cuts against it."*) — one line, no modal.
3. **Duplicate catch, in the moment** (rides on Taste T2): if the sentence matches an existing claim, the existing case slides forward instead — *"You already hold this — 21 days."* That's a delight moment disguised as dedupe: the product remembers so you don't.
**Acceptance:** one 10-second recording of write → flight → landing → partner acknowledgment; the duplicate path recorded once.

---

## Out of scope (until users arrive)
New delight surfaces, sounds, onboarding tours, seasonal flourishes, any motion not tied to the two moments. The next fun budget after this ships belongs to real-user feedback, not our imagination.

## The line
Fun in Noeis isn't games — it's the feeling that someone finished the software. A paper that arrives, a belief that sets like ink, a skeptic who answers in character: that's the product's personality expressed in details that are all true. Verify what shipped, aim everything at the two moments, and stop there — then go get the users who deserve it.
</content>
