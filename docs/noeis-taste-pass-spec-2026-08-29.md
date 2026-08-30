# Spec — The Taste Pass: the product develops judgment about its own content

**For:** Codex / Cursor
**Author:** Athan + Claude (full product review, 2026-08-29, live on the founder account)
**Context:** The machinery is built — paper, check-ins, judgment casebook, steward/skeptic postures, kind-grouped wikis. What fails now is **selection**: the product generates and maintains content well, and curates it badly. Today's front door served a repo-debugging note as a personal belief, in display serif, truncated mid-word. This spec is one focused pass that gives every surfacing algorithm three things: **an eligibility gate, a quality bar, and a fallback of silence.** That trio is already product doctrine (the Reading Loop's anti-slop gate — "silence over filler"); this pass extends it from one feature to the whole product.

**Hard rule for this cycle: no new features ship until this spec's gauntlet passes.** Every item below was observed live today; nothing is hypothetical.

**Sequencing (revised 2026-08-29): ship the kernel first.** T1 + T4 + T6 are the **ritual-breaking embarrassments** — a wrong claim served as a belief, a stale lead, a mid-word cut on the front door. They are ~days of work and repair the daily ritual itself; ship them as the immediate kernel. T2/T3/T5 (dupes, titles, triage) land in the following days. The 7-day gauntlet closes the whole spec. (User testing is parked by founder decision — this spec's only job is making the product meet its own bar.)

**Verification rule:** live on `https://www.noeis.io`, founder account, before/after screenshots in the PR.

---

## T1 (P0) — Check-in claim eligibility: a belief, or nothing

**Observed:** the morning paper's claim check-in presented — as a belief to reaffirm/revise/retire —

> "Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries… WikiRepoCreateComposer, createRepoWikiFromGitHub, POST /api/wiki/pages/from-github… debugging only the v…"

~100 words of engineering prose from the repo wiki, truncated mid-word, attributed to a stale page title, with Still hold / Revise / Retire underneath.

**Fix — an eligibility gate on the check-in selector.** A claim is check-in-eligible only if ALL hold:
1. **Belief-shaped:** a stance a person can hold or revise — not instructions, not descriptions of code, not process notes. Practical test: it survives the frame *"Do you still believe that …?"* as natural English.
2. **From a judgment surface:** dossiers, theses, concept pages. **Never** from repo wikis, editions ("This Week in AI"), system/acceptance pages, or agent-generated process notes.
3. **Short:** ≤ 2 sentences and ≤ ~220 characters. Render in full — if it doesn't fit the layout, it isn't eligible (see T6; never truncate a belief).
4. **First-person ownable:** the user wrote it, accepted it, or checked it in before.
5. **Not shown in the last 14 days** (existing rule — keep).
If no claim qualifies today: **show no check-in.** Silence over filler.
**Acceptance:** 7 consecutive mornings of screenshots — every served claim passes all five tests, or the block is absent. Plus a unit test feeding the repo-wiki claim corpus through the gate → zero eligible.

## T2 (P0) — Duplicates die at write time, and the UI never confesses them

**Observed:** Judgment shows *"I believe AI compute is going through orders of magnitude changes…"* with the caption **"4 more copies of this claim"** — the product printing its own failure. Earlier passes: duplicate pages (Compound Interest ×2, Survivorship Bias ×2), and the repo wiki wearing two names at once ("note-taker-3 — repo wiki" in the wiki table, "Atsokolas/Note-Taker-3 Repo Wiki" on the paper's claim attribution).
**Fix:**
1. **Write-time dedupe** for claims: normalized-text match (case/whitespace/punctuation-insensitive) against the user's existing claims → merge into the existing claim (preserving check-in history) instead of creating a copy.
2. **One-time merge migration** for existing duplicate claims and pages; keep the richest copy + its history; list merged ids in the PR.
3. **Canonical titles:** one title field, one renderer; every surface (paper attribution, wiki table, casebook, Explore) reads the same string. Kill the stale title-cased variants.
4. Delete the string "more copies of this claim" from the UI. If dedupe works, it has nothing to say.
**Acceptance:** casebook shows one copy of the AI-compute claim with merged history; grep the bundle for "copies of this claim" → gone; the repo wiki carries one name everywhere (screenshot all three surfaces).

## T3 (P0) — Title hygiene at import

**Observed in Library:** items titled "work", "write code. He was a bodyguard.", "inception remain the same. What has changed is the world around us." — X-thread fragments promoted to titles.
**Fix:** at import, derive titles in this order: explicit metadata title → first heading → **author + first sentence** for social/thread content ("Jeffrey Yan — turned down $100 million…") → domain + date as last resort. A title must never begin lowercase mid-sentence or be a single generic word. Backfill the existing offenders (the three above plus an audit sweep of `scope=all`).
**Acceptance:** Library list shows zero fragment titles; paste before/after of the three named rows + the audit count fixed.

## T4 (P0) — The drift line must be true, or say nothing

**Observed:** *"eight wiki pages have queued signals awaiting a rebuild, most notably Survivorship Bias with 5"* — **verbatim identical on Aug 11 and Aug 29.** Eighteen days. Either the drift queue is stuck (a real pipeline bug — investigate first) or the copy re-reports old state as news. Both violate the product's core claim of being alive.
**Fix:**
1. Diagnose the queue: has Survivorship Bias actually had 5 signals pending for 18 days? If the scheduler stopped draining drift signals, fix that (this is the bigger bug).
2. **Date-stamp every aliveness claim internally**; if the state is unchanged since the last visit, the copy must change register: *"Survivorship Bias has been waiting on a rebuild for 18 days — clear it?"* (honest, actionable) — never re-serve stale state in the present tense.
3. If there is genuinely nothing new: the quiet-day line, not a re-warmed old one.
**Acceptance:** the pipeline diagnosis in the PR; then two consecutive days of screenshots where the lead either changes with reality or goes quiet honestly.

## T5 (P1) — Review triage: three, not forty-one

**Observed:** "Needs review · 41" of 58 wikis; Library "Needs Review · 149". At that scale the word means nothing and the number reads as neglect.
**Fix:**
1. Surfaces show **at most 3 curated review items** (ranked: user-authored judgment pages first, then most-visited, then most-drifted). The full backlog lives behind the count, one click away — a drawer, not a wall.
2. **Decay policy:** low-stakes reviews (editions, repo wikis, pages never visited) auto-accept or expire after N days instead of accumulating. State the chosen policy in the PR.
3. The counts themselves stay honest — but framed as triage ("3 worth your attention · 38 minor"), not backlog.
**Acceptance:** wiki + library review surfaces show ≤3 promoted items each with visible rationale; backlogs reachable but not shouting. Screenshots.

## T6 (P1) — Truncation ban on editorial surfaces

**Observed today:** the check-in claim ends "…debugging only the v…". Observed across three months: the morning-lead clamp (fixed, then recurred in variants). This class of bug keeps returning because truncation is decided per-surface.
**Fix:** one shared rule at the render layer for editorial text (paper lead, claims, dossier summaries, judgment cards): **sentence-boundary trim or full render — never a mid-word/mid-clause ellipsis.** If the text can't fit whole at the surface's scale, the *selector* must pick shorter text (see T1.3) — the renderer never amputates.
**Acceptance:** grep-level: the shared trimmer is the only truncation path for those surfaces; live: 5 reloads across paper/judgment/wiki front with zero mid-word cuts.

---

## The gauntlet (closes this spec)
Seven consecutive days on the founder account, one screenshot of the daily open each morning:
- every check-in claim is a genuine belief, whole, from a judgment surface (or absent);
- the lead is either new, honestly aged, or quiet — never verbatim-stale;
- no visible duplicate, no dupe-count caption, no fragment title, no mid-word ellipsis anywhere in the shot.
Any violation restarts the seven days. When the week runs clean, the Taste Pass is done and the delight spec (`noeis-delight-two-moments-spec-2026-08-29.md`) unblocks.

## The line
Noeis's pitch is an agent with judgment. Right now the *product* has none about its own output — it prints its duplicates, re-serves stale news, and asks the user to believe in a POST route. Every fix above is the same fix: give each selector an eligibility gate, a quality bar, and permission to stay silent. Taste is a feature. Ship it.
</content>
