# Roadmap — The bridge to the judgment ledger

**For:** Athan (direction) → staged specs for Codex/Cursor
**Author:** Athan + Claude, 2026-08-29
**The ambition (agreed):** Noeis as the **system of record for human judgment** — every serious belief a claim with evidence, a birth date, a revision history, and eventually a verdict; audited continuously against the world's clock. Readwise stores what you read; Notion stores what you write; **Noeis stores what you believe — and keeps it honest.**
**Successor to** `noeis-return-loop-roadmap-spec-2026-06-25.md` (largely delivered). Same discipline: stages close on live evidence, not intent.

---

## 1. The honest comparison — vision vs. what exists today

Grounded in three months of live testing, current as of 2026-08-29.

| Vision component | State | Evidence |
|---|---|---|
| Claims as first-class objects (held / revised / retired) | ✅ **Built** | Casebook, check-in ritual, streaks, opinion ghosts — shipped and working |
| Evidence attached with receipts | ✅ **Built** | Claims→sources, citation doors, receipts across surfaces |
| Revision history | 🟡 Partial | Check-in history is append-only ✅; but claims show "Born: Unknown" — formation dates unreliable; revision *reasons* only partly captured |
| Continuous audit vs. the world | 🟡 Partial | EDGAR + GitHub watchers real; transcripts dead (no key); drift queue **stuck 18 days**; claim-impact lines exist but unproven as reliable |
| Intake → belief pipeline (reading feeds judgment) | 🟡 Partial | Reading Loop specced with anti-slop gate; **semantic index empty in prod** (0 completed / 133 abandoned embedding jobs) — Connection mechanic can't run |
| Curation worthy of a ledger | 🔴 In repair | Taste Pass in flight (repo note served as a belief; stale lead; dupes) |
| **Verdicts — beliefs scored right/wrong** | ❌ **Missing entirely** | No mechanism exists. A ledger that never settles isn't a ledger |
| **Calibration — "how good am I at this?"** | ❌ Missing | Follows from verdicts; nothing collects it today |
| Casebook as shareable/provable artifact | ❌ Missing | Page-level public share exists; the judgment record itself has no export or public form |
| Self-serve reliability for a stranger | 🔴 Failed last test | Dossier cold-run gauntlet (`noeis-dossier-reliability-spec-2026-07-25.md`) never passed |
| Multi-user: disagreement, adoption of claims, the network | ❌ Not started | Share→adopt exists for *pages* only. Correctly years away |

**The one-sentence gap:** we built the *belief* half of the ledger (claims, evidence, revisions, the ritual) and none of the *accounting* half (verdicts, calibration, a provable record) — and the audit loop that keeps it honest runs unreliably.

## 2. The load-bearing insight

Everything missing is **compounding of primitives that already exist**. Verdicts = check-in mechanics + a resolution trigger. Calibration = arithmetic over verdict history. The public casebook = the existing share serializer pointed at claims. No stage below requires new architecture — which is exactly why the bridge is credible.

---

## 3. The bridge — four stages, each closing on evidence

### Stage 0 — Trust the ritual *(in flight — the current gate)*
Taste Pass (kernel → gauntlet) + Delight Part A verification. A ledger nobody trusts records nothing.
**Done when:** the 7-morning gauntlet runs clean.

### Stage 1 — Close the loop: verdicts and the mirror *(the missing organ; next big build)*
The single highest-leverage addition in the whole vision. Beliefs must be able to **settle**.
1. **Birth dates.** Every claim gets a reliable `bornAt` (backfill from revision/creation history; kill "Born: Unknown").
2. **Falsifiability prompt.** When a claim is written (or checked in), one optional question: *"What would change your mind — and by when?"* Stored as `resolutionCriteria` + optional `horizon` date. Never mandatory; the skeptic may propose one.
3. **Resolution events.** When a horizon arrives or a watcher lands decisive evidence, the morning paper asks for a **verdict**: `held up / broke / partly / unresolvable` — same one-tap grammar as check-ins, same taste gates (T1 applies).
4. **The Mirror** — one calm page: claims held, average hold time, revision rate, verdict record, time-from-counter-evidence-to-revision. The product's answer to *"how good is my judgment?"* Mono register, no gamification.
**Done when:** a real claim of Athan's travels the full arc — written → criteria → evidence lands → verdict → visible in the Mirror — live, on film.

### Stage 2 — The audit runs itself *(make "continuously honest" true)*
1. Drift pipeline unstuck and **provably draining** (Taste T4's diagnosis is the entry point).
2. Watchers all-real: transcripts shipped or removed (reliability R4); every armed watcher shows a fresh receipt.
3. **Semantic index backfilled** — requeue the 133 abandoned embedding jobs (founder call; production data op) so the Reading Loop's Connection mechanic and claim-matching actually run.
4. **Claim-impact SLA:** new evidence touching a held claim produces an impact assessment (supports / cuts against / neutral) in the next morning's paper — reliably, with the anti-slop gate.
**Done when:** 14 consecutive days where every watcher event shows dated claim impact and no aliveness copy goes stale.

### Stage 3 — The casebook becomes an artifact *(the provable record, v1)*
1. **Casebook export/share:** a public, read-only judgment page per user (or per thesis) — timestamped claims, revision history, verdicts, evidence links — built on the existing public-share serializer discipline (private material stripped, receipts kept).
2. **Integrity minimum:** exported records carry immutable timestamps (server-signed export hash is enough for v1; no blockchain theater).
3. **Self-serve dossier gauntlet finally passed** (`noeis-dossier-reliability-spec-2026-07-25.md`) — the ledger's front door works for a stranger, whenever we choose to open it.
**Done when:** Athan can hand anyone a link to a casebook page that proves what he believed, when, and how it resolved — without exposing anything private.

### Stage 4 — The network *(explicitly deferred)*
Disagreement diffs, claim adoption, calibration leaderboards. **Do not build.** One standing constraint protects it: keep claims/evidence/revisions/verdicts cleanly modeled per-user (no denormalized shortcuts that assume a single user), so cross-user comparison stays possible later.

---

## 4. Sequencing logic
0 makes it **trustworthy** → 1 makes it a **ledger** (things settle) → 2 makes it **honest continuously** (the audit runs) → 3 makes it **provable** (the record stands on its own). Each stage is useful alone; none requires users to exist; all four compound into the moat: **longitudinal judgment data nobody else collects.**

## 5. What this roadmap deliberately ignores
Users/GTM (parked by founder decision), fundraising framing, the network layer, foreign-filer ingestion, and any new surface not listed. The next spec to write when Stage 0 closes: **Stage 1 in full** (verdicts + Mirror) — it deserves the same per-item acceptance rigor as the Taste Pass.

## The line
Today Noeis remembers beliefs. The vision requires it to **settle** them. The whole bridge is that one verb, built in four safe stages on primitives that already work.
</content>
