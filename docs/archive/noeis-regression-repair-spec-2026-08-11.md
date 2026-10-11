# Spec — Regression repair: restore the daily loop, clean the index

**For:** Codex
**Author:** Athan + Claude (live user test after PRs #58–#107, 2026-08-11)
**Context:** The last ~50 PRs brought real wins — the Deere dossier completed (26 claims · 7 sources — reliability work landed), CoreWeave grew to 39 claims, wiki quality gates shipped, research editions exist. But the front-page redesign **buried the daily loop**, and the page index has accumulated **data rot**. This spec repairs regressions only. The larger IA question (Today/Desk/Shelf — Concept A mockup) is a separate founder decision; nothing here blocks it, and R1 is required under any IA.

**Verification rule:** live on `https://www.noeis.io`, before/after evidence in the PR.

---

## R1 (P0) — The watchers: find out what happened to them
**Symptom:** the wiki front page footer reads "REVIEW AND SYSTEM ACTIVITY · **0 watchers**" and the OPEN control did not expand anything. On 2026-07-25 this account had **seven armed watchers** (EDGAR: CRWV, COST, GOOGL ×2, NVDA · Transcript: GOOGL ×2 · GitHub: note-taker-3), each with receipts.
**Investigate first, then fix:** determine whether (a) the watchers were disarmed/lost in a migration (data loss — restore them from the `externalWatches` fields on their pages, which likely still exist), or (b) the count/drawer UI is broken (display bug). Either way:
1. All previously armed watchers appear again with their receipts (accession numbers / head SHA / awaiting states).
2. The OPEN drawer expands and lists them.
3. A regression test asserts the watcher count on the front page equals armed `externalWatches` across pages.
**Acceptance:** front page shows the true watcher count; drawer opens listing them; paste the list.

## R2 (P0) — The daily loop must be visible on the daily surface
**Symptom:** the redesigned front page leads with "CONTINUE → [dossier]" and a 43-row page list. The morning paper lead, RETURN PATH, and **claim check-in are gone from the first screen** — the entire retention loop shipped in July is no longer part of the daily open.
**Fix (IA-neutral, minimal):** restore a compact daily block **above** the Continue section: the paper lead (1–3 sentences, watcher-led when events exist), the claim check-in row, and one return path. Keep the new Continue/index sections below it. (If/when Concept A is approved, this block becomes the Today surface — this repair is the bridge, not the redesign.)
**Acceptance:** cold-open `/wiki` → paper lead + check-in + return path visible without scrolling at 1440×900. Screenshot.

## R3 (P0) — Page index data rot
**Symptoms (all visible in the live index):**
1. **Duplicates:** "Compound Interest" ×2 (rows 13/17), "Survivorship Bias" ×2 (10/14), "Investing: Principles, Process, and Decision Quality" ×2 (41/42).
2. **Kind mislabels:** "Circle of Competence" tagged REPOSITORY in one row and WIKI PAGE in another; "Anchoring" and "Deliberate Practice" tagged REPOSITORY — they are concept pages. The kind/type field is being mis-derived.
3. **Garbled title:** "Cia Teach Investor Behavioural Investment" (row 36) — investigate what this page is; fix title or delete if junk.
4. **Test junk:** "Qzz Test Topic" (row 43) — QA artifact from 2026-07-03 testing; owner-delete (previously flagged; now title-cased and persisting).
**Fix:** dedupe (merge or delete duplicate pages — keep the richer copy; never silently discard user edits: list merged/deleted ids in the PR); derive the kind tag from the page's actual `pageType`/`externalWatches` (a page with a GitHub watch = repository; a dossier = company; else concept/edition); repair or remove the garbled page; delete Qzz.
**Acceptance:** index shows zero duplicate titles, kind tags correct for every row (spot-check the six named above), no test junk. Before/after screenshots.

## R4 (P1) — Kind-aware grouping in the index (bridge to Desk)
The flat 43-row list treats a company dossier, a repo wiki, a weekly edition, and a mental-model page as the same thing. **Group the index by kind** (Companies / Repos / Theses / Concepts / Editions) with the existing row style — no new components, just grouping + per-kind readout column (filing state for companies, head SHA for repos, check-in tallies for theses, dates for editions). This is Concept A's Desk in miniature and is worth doing under any IA.
**Acceptance:** index renders grouped with kind-appropriate right-hand readouts. Screenshot.

## R5 (P1) — Carry-overs that must not slip again
- **Transcript watcher key** (`FMP_API_KEY`) — still unprovisioned on 2026-07-25; if still true, apply reliability-spec R4: ship the key or hide the rows.
- **Questions rail** — verify current state; if still "No questions yet," reliability-spec R5's merge-gate applies (screenshot of populated rail or the PR doesn't merge).
- **Email edition** — founder still needs a live end-to-end send verified; include one real received email screenshot in the PR if not already proven.

## Priority
R1 (watchers — possible data loss, investigate today) → R2 (daily loop visible) → R3 (index rot) → R4 (grouping) → R5 (carry-overs).

## The line
Fifty PRs of features landed on a front page that quietly stopped doing its job. The repair is small: give the daily loop back its first screen, make the index tell the truth, and find the seven watchers. The bigger IA decision (Concept A) stays with Athan — but nothing in this spec is wasted under any answer.
</content>
