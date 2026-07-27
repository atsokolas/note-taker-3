# Noeis — This Week in AI

**Status:** Issue 001 implementation slice
**Date:** 2026-07-27
**Owner:** Athan Tsokolas
**Product role:** A scarce weekly source-backed wiki assembled from the Library, not an investment dossier or AI-news digest.

## 1. Governing objective

The edition answers one editorial question:

> Which technical papers materially advanced our understanding of AI models and infrastructure this week, and how do their mechanisms and limitations connect?

Success is not readership volume or the number of papers summarized. Success is whether a cold expert can understand what each selected paper found, how it works, how strong the evidence is, where it stops applying, and how it connects to the other selected work.

The edition follows the normal Noeis knowledge path:

> Library sources → selected weekly corpus → source-backed Wiki synthesis

It does not inherit the investment dossier's decision, posture, confidence, valuation, judgment, assumption, falsifier, or monitoring schema.

## 2. Binding editorial constraints

1. An edition contains **two to five** papers. It may contain no edition at all when the evidence does not support a material synthesis.
2. There is no quota for models, infrastructure, or evaluation. Consequence determines inclusion.
3. Every paper must materially improve the week's technical map. “Interesting” is not a selection reason.
4. Every selected paper carries:
   - a direct primary-source URL;
   - the paper's actual finding;
   - a technical explanation of the mechanism or method;
   - an evidence assessment;
   - the technical or economic consequence;
   - an explicit evidence boundary.
5. Headline benchmark gains may not be repeated without the evaluated hardware, workload, baseline, and transfer limitation.
6. Preprints remain candidate evidence. Publication in the edition does not imply independent replication or accepted truth.
7. No automated process may invent editorial conclusions, approve a revision, or publish it.
8. “No material change” is a valid and preferable result to filler.

The operative rule is:

> No summary without a consequence, and no claimed consequence without evidence.

## 3. Selection gate

A paper qualifies only when it satisfies at least one consequence test:

- changes a material technical belief;
- alters credible capability or scaling expectations;
- changes infrastructure demand, utilization, or economics;
- reveals a significant constraint, regression, or failure mode;
- invalidates an influential previous result or evaluation practice;
- creates a credible new product or competitive possibility.

Candidates are scored during research, not shown publicly:

| Dimension | Question |
|---|---|
| Importance if true | Would the result alter a consequential decision or technical model? |
| Evidence quality | Are the comparison, ablation, and measurement methods adequate? |
| Genuine novelty | Is this new mechanism or merely new terminology? |
| External validity | Does it survive outside one benchmark, model, hardware generation, or lab? |
| Reproducibility | Are code, artifacts, parameters, and evaluation details available? |
| Cross-layer consequence | Does it alter model design, infrastructure, product, or economic expectations? |

Popularity, social engagement, author prestige, and leaderboard movement are discovery signals, not acceptance criteria.

## 4. Edition anatomy

Every issue contains:

1. **In brief**
2. **At a glance**
3. **Models and methods**, when evidence qualifies
4. **Infrastructure and systems**, when evidence qualifies
5. **Evaluation and measurement**, when evidence qualifies
6. **Connections across the week**
7. **What to watch next**

Each paper entry reads as a compact wiki section:

1. finding;
2. how it works;
3. evidence;
4. why it matters;
5. limitations.

The reader must not render investment-dossier controls or expose internal maintenance bookkeeping.

## 5. Compounding model

The dated issue is an immutable approved snapshot. It can link to persistent topic pages, but it does not silently edit them or become an investment decision record.

Selected evidence should pressure persistent topic pages such as:

- verified self-improvement;
- agent skills and procedural context;
- agent reliability measurement;
- GPU performance modeling;
- mixture-of-experts execution economics;
- memory, networking, and inference utilization.

Connections to persistent pages are normal wiki links and source relationships. Any later change to another page follows the ordinary Wiki revision boundary.

## 6. Software contract

`This Week in AI` extends the existing Weekend Readings publication machinery:

- selected papers are first saved as `Article` records in the owner's Library;
- root object: `WikiPage`;
- immutable snapshot: `WikiRevision`;
- source provenance: `sourceRefs`;
- lifecycle and idempotency: `NoeisReceipt`;
- explicit review, approval, and publication actions;
- public artifact reconstructed from an approved safe snapshot.

It uses the edition profile `this_week_in_ai`, edition prefix `this-week-in-ai`, and public artifact type `this_week_in_ai`. It does not introduce another database collection or autonomous publishing system.

The profile enforces:

- two-to-five-item count;
- three allowed evidence layers;
- paper-level finding, technical approach, evidence assessment, significance, and limitation;
- edition-level overview, highlights, cross-paper connections, and watch list.

Publication controls are reused infrastructure. They do not determine the reader's content model.

## 7. Issue 001 acceptance

Issue 001 is ready for Athan's review only when:

- all selected sources are direct arXiv paper pages;
- every selected paper exists in the owner's Library and the Wiki source ledger points to that `Article`;
- Library article → Wiki support edges exist in both directions;
- every source was submitted within the stated evidence window;
- all quantitative statements are bounded by the paper's evaluated workload;
- the issue contains two to five sources;
- the private draft is idempotent and requires human review;
- the exact-revision approval path can reconstruct the new artifact type;
- no public state changes during draft creation;
- ordinary Library-created wiki pages retain their source references, standard reader, maintenance controls, and safe-sharing path;
- dossier-only UI remains gated by an explicit `investmentDossier.version`;
- focused service tests and the frontend build pass.

Issue 001 is not public merely because these checks pass. Publication remains a separate explicit human action.
