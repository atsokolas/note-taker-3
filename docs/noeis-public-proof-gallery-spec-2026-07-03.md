# Spec — The Public Proof Gallery: investing dossiers + repo wikis

**For:** Codex (Track 2 build; Track 1 is mostly editorial + small polish)
**Author:** Athan + Claude (strategy session, 2026-07-03)
**Thesis:** Noeis's engine is *maintained dossiers for objects that change under you, with receipts.* This spec points the working engine at two public-facing verticals — **investing dossiers** (the wedge) and **OSS repo wikis** (the distribution/proof play) — as one motion: a public gallery of living pages that demonstrates "maintained vs. generated" better than any landing-page copy can. It also scopes the data connections the investing vertical needs.

**Positioning guardrails (bake into everything):**
- Noeis is a **research/knowledge tool**. It never executes trades, never moves money, and never gives personalized investment advice. All brokerage/portfolio access is **read-only**, used solely to know *what the user researches* so their dossiers stay maintained. State this in the UI at connect time.
- Public pages use the existing safe serializer (`serializePublicWikiPage()`) — private highlights, backlinks, and agent state never leak. Reuse, don't re-derive.

---

# TRACK 1 — Investing dossiers (ship first; ~zero new build to start)

## 1.1 The flagship gallery (editorial work, this week)
Publish ~5 flagship pages from the founder's real corpus as public, indexable, *maintained* pages:
- **Alphabet is Berkshire Hathaway 2.0** (company dossier — the demo page)
- **Margin of Safety in Value Investing** + **Circle of Competence** (concept dossiers)
- One **market map** built via ⌘K (e.g., "AI infrastructure market map") to demo the command surface
- One **live question page** (open questions + contradictions visible) to demo provocation

For each: share → public page, apply Ch.3b polish (semantic HTML, meta tags, JSON-LD `Article`/`about` structured data), add the quiet provenance line and a "maintained by the owner's agent · last reviewed <date>" stamp — **the stamp is the product**. Link the gallery from the homepage ("See a living dossier").

**Acceptance:** a logged-out visitor reaches a flagship dossier from the homepage in one click, sees last-reviewed freshness, and understands the product in ~20s. Pages validate structured data. Paste URLs + rendered head.

## 1.2 Who it's for (drives the connection priorities below)
Two personas, one product:
- **Power home investors** — run real portfolios, read Munger/annual letters, keep theses in Notion/Readwise today. Reachable, self-serve, pay consumer-pro prices.
- **Professionals** (analysts, PMs, family offices) — same loop, higher stakes, richer data needs (filings, transcripts), pay real money. The pro tier is the same product + more connectors + team sharing later.

## 1.3 Data connections roadmap (the ranked build list)

### P0 — SEC EDGAR filings watcher (free, no OAuth, transformative)
**What:** for any ticker a user tracks (or any company dossier), watch EDGAR for new filings (10-K/10-Q/8-K/13F). New filing → ingest as a source on the dossier → drift signal → scheduled maintenance run → morning paper: *"NVDA filed an 8-K yesterday; your data-center-capex claim gained new evidence; one claim now contradicted."*
**Auth:** none — public API, just a User-Agent header + rate-limit compliance. This is the highest-value connector in the vertical and it costs nothing.
**Where it lands:** new `server/services/edgarWatcherService.js` + a ticker/CIK field on dossier pages; feed the existing source-event maintenance trigger.
**Acceptance:** attach a ticker to a dossier; when a new filing posts, the page gains it as a source and the morning paper reports it. Demonstrate with a real filing.

### P0 — Earnings transcripts + fundamentals via one market-data API (API key, cheap)
**What:** earnings-call transcripts and basic fundamentals/news per ticker as ingestable sources. Transcripts are the single richest recurring source for thesis maintenance.
**Provider choice:** one of Financial Modeling Prep / Finnhub / Polygon (all server-side API-key, low-cost tiers; pick by transcript quality + price — FMP is the usual default). Our key, metered per user tier — no user OAuth needed.
**Acceptance:** a dossier with a ticker gains the latest earnings-call transcript as a source; the next maintenance run cites it.

### P1 — Brokerage holdings (read-only) — the magic onboarding
**What:** connect brokerage → import holdings (tickers + weights only) → **auto-offer a maintained dossier per top holding**. This is the vertical's activation moment: "connect Schwab, and by tomorrow you have a living research page for every position, fed by their filings and your own reading."
**Auth/provider:** **Plaid Investments** (or SnapTrade as the retail-broker-focused alternative) — user-facing OAuth-style Link flow, per-user access tokens, read-only investments scope. Never request trading scopes. Costs are per-connected-account, so gate behind the paid tier.
**Privacy:** store tickers/weights, not balances by default (offer balances as opt-in for position-sizing context). Say exactly this on the connect screen.
**Acceptance:** connect a brokerage in sandbox → holdings appear → one-click "create dossiers for my top 5" → pages exist with EDGAR watchers attached.

### P1 — Newsletters/RSS (the reading layer, mostly exists)
**What:** Substack/newsletter/RSS ingestion. Much of this already arrives via the existing **Readwise** connector (Reader syncs RSS + newsletters); confirm Reader items flow through, and add a plain RSS-URL connector as the no-Readwise fallback (cheap, no auth).
**Acceptance:** a Substack post read in Readwise Reader lands in Library and can back a dossier claim.

### P2 — Later, by pull (don't build speculatively)
- **Gmail (OAuth)** — research emails/broker notes into Library. Scope-sensitive; wait for users to ask.
- **Podcast highlights** — Snipd already exports via Readwise; document the recipe rather than building.
- **X/Twitter** — API cost/quality is bad; skip.
- **Bloomberg/FactSet/CapIQ** — the pro-tier enterprise ask; take the call when a professional design partner brings a license.

### Connection UX (applies to all of the above)
Every connector follows the Ch.0.5 contract: connect → live status → durable receipt ("EDGAR watcher armed for NVDA · last filing ingested 8-K Jun 28") on the connections card, feeding the morning paper. The existing Readwise/Notion receipt work is the template.

---

# TRACK 2 — OSS repo wikis (the next Codex build cycle)

## 2.1 What it is
Public, auto-maintained wikis for ~10–15 popular OSS repos + the Noeis repo itself (dogfood). Each repo gets a small page set: **Overview** (what/why), **Architecture**, **Key decisions** (from ADRs/design docs), **Changelog digest** (release-over-release, editorialized), **Open questions**. All public via the existing share path, all refreshed by the existing scheduled worker.

**Why:** codebases change daily, so "maintained" is objectively demonstrable; devs share these; it's the DeepWiki playbook with the one thing DeepWiki lacks — a maintenance loop.

## 2.2 The GitHub connector (the only genuinely new machinery)
**Ingestion mapping (repo → source set):**
- `README*`, `docs/**`, `CONTRIBUTING`, `ARCHITECTURE*`, ADR directories (`docs/adr/**`, `adr/**`), `CHANGELOG*`
- Releases (notes + tag) and, optionally, merged-PR titles/descriptions since last sync (capped)
- Each source carries its **ref**: file path + commit SHA (or release tag). **Claims pin to refs** — this is the receipts story for code: *"claim supported by `auth/session.ts` @ `abc123`."*

**Refresh triggers:** poll per repo on the existing 6h schedule (releases + default-branch HEAD); a new release or HEAD change marks affected sources stale → source-event maintenance run. (GitHub webhooks are a later optimization; polling is fine at 15 repos.)

**Auth:** public repos need only a GitHub App/PAT for rate limits (server-side, no user OAuth). Private-repo support = GitHub App OAuth per user — **explicitly out of scope for v1**; it's the future enterprise door, don't build it now.

**Drift language for code:** when a claim's pinned file changes in a way the agent judges material, flag the claim (needs-review), not silently rewrite — same reviewable-plan discipline as filing.

## 2.3 The DeepWiki diff (the marketing artifact)
On day 1 of a repo's wiki, snapshot it. After 30 days of maintenance, produce the comparison: what changed in the repo (releases, breaking changes) vs. what a generate-once wiki still claims vs. what the Noeis wiki says now. One page, side-by-side, screenshotable.
**Acceptance:** for at least 2 fast-moving repos, the 30-day diff shows the maintained wiki caught ≥3 material changes a static snapshot missed. This artifact is a homepage/fundraise asset.

## 2.4 Repo selection (v1 list criteria)
Fast-moving (weekly releases), well-documented (so pages are good), high-recognition (so sharing works). Candidates: pick ~12 across JS/Python/AI tooling (e.g. active agent frameworks, popular build tools) + `note-taker-3-1` itself. Final list is a founder taste call.

---

## Sequencing
1. **Track 1.1 gallery now** (editorial + Ch.3b polish) — feeds the LongJump conversation immediately.
2. **EDGAR watcher + transcripts API** (P0 connectors) — next Codex cycle alongside…
3. **Track 2 GitHub connector + first 12 repo wikis.**
4. **Brokerage (Plaid) onboarding** once the paid tier / 3–5-user proof cycle says the wedge holds.
5. The 30-day DeepWiki diff matures in the background; harvest it as the marketing artifact.

**The standing priority above all of this:** the 3–5-user maintained-dossier proof (per `noeis-return-loop-roadmap-spec` + the strategy review). The gallery is distribution *for* that proof, not a replacement.

## The line
The gallery makes the invisible visible: a stranger should be able to watch a Noeis page stay true while the world changes under it — a stock's filings, a repo's releases — and understand in 20 seconds why "maintained" beats "generated." Filings and releases are the two loudest public clocks in the world; put Noeis's receipts on both.

---

## Stage 4 gate preflight — 2026-08-31

**Gate:** AT-467 — inspectable public proof with zero private leakage

**Status:** **Blocked; reader observation has not started.** AT-430, the Stage 3 gate, remains open, and the live registry says that no object meets the flagship bar yet.

### Candidate inspected

- Object: [`note-taker-3 — repo wiki`](https://www.noeis.io/share/wiki/6a49ad6f22f7ad6bbbdf2154)
- Comparison: [`regeneration stability under review`](https://www.noeis.io/share/wiki/6a49ad6f22f7ad6bbbdf2154/comparison)
- Published proof head: `828286c`
- Repository head at preflight: `8c19193d`
- Disqualifying evidence: the registry labels the object a candidate, not a flagship; two material claim rewrites failed editorial acceptance; the public object is behind the current repository head.

The candidate already demonstrates useful mechanics: a reader can see what was accepted, preserved, or rejected and can open exact GitHub source doors. Those mechanics are **preflight evidence only**. They do not substitute for a flagship object, an independent human reader, or voluntary recurrence.

### Predeclared independent-reader protocol

The observation window begins only after AT-430 passes and the registry promotes the exact object under test to flagship status.

| Field | Predeclared rule |
| --- | --- |
| Cohort | Three non-founder readers who have not received an explanation of the object or the Noeis product thesis. Record only opaque reader codes. |
| Object freeze | Record the public URL, accepted-through revision, maintenance timestamp, and comparison URL before the first reader opens it. All readers receive the same version. |
| First-read task | Without owner guidance, each reader states the maintained case in their own words, identifies one material change and its disposition, opens the exact supporting source, and names what remains unknown. |
| Comprehension threshold | At least two of three readers accurately reconstruct the central case and the material change. All claimed source-door opens must resolve to the cited evidence. |
| Privacy threshold | Zero private notes, highlights, backlinks, Library content, agent state, credentials, or private identifiers appear in any reader session. One leak fails the gate. |
| Recurrence window | Fourteen calendar days from the first cold read. At least one reader must voluntarily return, follow, fork, or adopt the object. A prompted return does not count. |
| Maintenance proof | During or before the window, one correction or revocation must produce a valid public receipt, and the maintained object must continue to resolve afterward. |
| Failure rule | No flagship, owner explanation, prompted answers, a private leak, a broken or stale source door, failed comprehension, no voluntary recurrence, or an unreceipted correction leaves AT-467 open. Silence is preferable to weakening the gate. |

### Evidence ledger

Complete this table only with observed behavior; never infer a reader's understanding or record personally identifying information.

| Reader | Cold read date | Case reconstructed | Material change + disposition identified | Exact source opened | Unknown named | Voluntary return in 14 days | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | — | — | — | — | — | — | Not started |
| R2 | — | — | — | — | — | — | Not started |
| R3 | — | — | — | — | — | — | Not started |

### Advancement receipt

AT-467 may move only when the frozen object/version, reader ledger, zero-leak test receipt, correction or revocation receipt, and voluntary-return evidence are linked together. Passing local tests, rendering the public surface, or publishing a candidate is necessary evidence, but none is the Stage 4 outcome by itself.
</content>
