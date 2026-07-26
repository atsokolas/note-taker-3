# Spec — Self-serve dossier reliability: make the money moment survive a stranger

**For:** Codex
**Author:** Athan + Claude (live replicability test, 2026-07-25, real account)
**Context:** The CoreWeave/Costco dossiers prove the ceiling — analyst-grade, SEC-grounded, judgment-anchored artifacts. But the **self-serve path failed both live attempts** today: ASML (foreign filer) fail-closed with no diagnosis; Deere (vanilla US 10-K filer) died mid-build-stream and RUN AGAIN did not recover it. The failure *handling* was honest (fail-closed, no fabrication, receipts fired) — that discipline is excellent and must be preserved. But honest failure is still failure. This spec closes the gap between the supervised ceiling and the self-serve floor. **Until this ships, do not put a cold user in front of the dossier composer.**

**North-star metric:** self-serve dossier build success rate, cold user, first try, US large-cap ticker → **≥95%**, producing a dossier at the CoreWeave quality bar (claims + sources + judgment + expectations clock populated).

**Live repro artifacts (keep until fixed, then owner-delete):**
- ASML scaffold: `page=6a65e5b2a7fad4555073f631` (0 sources, 0 claims, "BUILD FAILED THE QUALITY GATE", sharing blocked, watcher armed for a build that can never succeed)
- Deere scaffold: `page=6a65e663a7fad4555073f695` (2 sources, 0 claims, 151 words, "build stream did not finish")

**Verification rule:** every item verified live on `https://www.noeis.io` from a fresh state; paste evidence. The final acceptance is a **cold-run gauntlet** (below), not unit tests.

---

## R1 (P0) — The build stream must survive or recover on its own
**Symptom:** DE build died mid-stream ("The page was created, but the build stream did not finish"). RUN AGAIN did not complete it within ~90s. A half-born page with an armed watcher was left behind.
**Fix:**
1. **Instrument the pipeline** stage-by-stage (fetch filings → parse → draft → claims → gate) with per-stage timing + failure logs, so the next dead stream has a named cause (timeout? HF router? SEC rate limit? payload size?). Diagnose the DE failure specifically from logs and fix the root cause.
2. **Internal retries, not user retries.** Transient stage failures (model timeouts, upstream 429s) retry automatically with backoff — at least 2 attempts per stage — before surfacing failure. A "RUN AGAIN" button is not a retry strategy.
3. **Resumable builds.** RUN AGAIN (and the automatic recovery) must resume from the last completed stage (sources already fetched → don't refetch; draft died → redraft from stored sources). Verified: clicking RUN AGAIN on the existing DE scaffold completes it to the quality bar.
4. **No orphaned scaffolds.** If a build terminally fails, the page shows a clear failed state with one-click "rebuild" and "discard"; a scaffold must never sit ambiguous ("Ready for maintenance") when it actually has no article.
**Acceptance:** rebuild the existing DE scaffold to a full dossier via RUN AGAIN; then fresh-create 3 new US large-cap dossiers (pick tickers not previously built, e.g. UNP, ADBE, HD) back-to-back — all 3 complete unattended. Paste each dossier's claims/sources counts + the pipeline stage logs.

## R2 (P0) — Foreign filers: validate upfront, decline gracefully (or support)
**Symptom:** ASML (20-F/6-K foreign private issuer) accepted the create, made a page + armed a watcher, then failed the gate with zero explanation. The user is never told *why*, and the dead watcher stays armed.
**Fix (v1 — decline gracefully):**
1. **Validate the ticker at compose time** (EDGAR company lookup returns filer forms): if the company files 20-F/6-K (or no EDGAR presence), show inline before creating anything: *"ASML files as a foreign private issuer (20-F). Noeis dossiers currently support US domestic filers (10-K/10-Q). Foreign-filer support is coming."* No page, no watcher, judgment preserved in the composer.
2. Never arm a watcher for an unsupported filer.
3. (v2, backlog, don't build now: actual 20-F/6-K ingestion — the demand will be real: ASML/TSM/NVO/SAP are exactly what investors type.)
**Acceptance:** entering ASML shows the graceful decline without creating artifacts; entering a valid US ticker proceeds. Paste both.

## R3 (P0) — Failure copy speaks English, not machinery
**Symptom (three instances live):** "BUILD FAILED THE QUALITY GATE" (reader-facing headline); "NEEDS REVIEW" chip with no explanation of what to review; "FMP_API_KEY is required for earnings transcript sync" (**raw env var shown to the end user** on the Watching surface).
**Fix:** every failure state answers three questions in the product voice: what happened, why, what to do next.
- Gate failure → *"This dossier didn't reach the evidence bar — [reason: not enough filing evidence ingested]. Rebuild, or discard the draft."*
- Stream death → *"The build was interrupted partway. Resume it?"* (with R1's resume).
- Missing transcript key → user-facing: *"Earnings transcripts aren't connected yet."* — and see R4.
**Acceptance:** trigger each failure; screenshot the copy; grep the UI bundle for `FMP_API_KEY`/`QUALITY GATE` → zero user-visible hits.

## R4 (P0) — Transcript watcher: ship it or hide it
**Symptom:** every Transcript watcher on the Watching surface reads "Awaiting transcript · FMP_API_KEY is required" — a visible, permanently-misconfigured feature eroding the trust the receipts built.
**Fix:** either (a) provision the FMP (or chosen provider) key in production and verify a real transcript ingests, or (b) hide the transcript watcher type until the key exists. No third state.
**Acceptance:** Watching surface shows either a working transcript receipt (with ingested transcript on the page) or no transcript rows at all.

## R5 (P1) — Questions rail: fifth attempt, now with teeth
**Symptom:** Think's Questions rail still reads "No questions yet" while wiki pages carry high-quality Open Questions. This item has failed four consecutive pushes.
**Fix:** as previously specced (surface page Open Questions as Question objects in Think, linked to their pages). **This time the PR acceptance is the rail itself:** the PR must include a screenshot of Think's Questions rail populated from the live account, or the PR does not merge. If there's a structural reason this keeps slipping (e.g., questions aren't modeled as objects), say so in the PR and propose the model change instead of silently dropping the item again.

## R6 (P1) — Test-artifact cleanup (after R1/R2 land)
Owner-delete the ASML + DE scaffolds and their watchers (ids above) once they've served as repro cases — unless R1's acceptance rebuilt DE into a real dossier worth keeping. Confirm the Watching surface no longer lists dead watchers.

---

## The cold-run gauntlet (final acceptance for this spec)
On production, from the founder's account but **touching nothing mid-run**:
1. Create dossiers for 3 fresh US large-caps → all complete unattended to the bar (claims ≥20, sources ≥8, judgment + expectations clock populated).
2. Enter 1 foreign ticker → graceful decline, no artifacts.
3. Kill-test: if any build fails, the surfaced copy passes R3 and recovery completes it.
4. Watching surface: zero misconfigured rows, zero dead watchers.
Paste the full gauntlet results in the PR. This spec closes only when the gauntlet passes clean.

## The line
The dossier composer says *"Your judgment stays yours. Noeis uses free SEC filings and opens a private draft for review."* Today that promise is true only when a developer is watching the build. Make it true for a stranger on the first try — that's the difference between a demo and a product.
