# Noeis — This Week in AI

**Status:** Issue 001 implementation slice
**Date:** 2026-07-27
**Owner:** Athan Tsokolas
**Product role:** A scarce weekly maintained-research edition, not an AI-news digest.

## 1. Governing objective

The edition answers one question:

> What changed in our understanding of AI models and infrastructure this week, and what should a technical investor, researcher, or operator now believe differently?

Success is not readership volume or the number of papers summarized. Success is whether a cold expert can identify at least one material belief that was strengthened, weakened, or preserved, understand the evidence and its boundary, and follow the change into a maintained Noeis object.

## 2. Binding editorial constraints

1. An edition contains **two to five** papers. It may contain no edition at all when the evidence does not support a material synthesis.
2. There is no quota for models, infrastructure, or evaluation. Consequence determines inclusion.
3. Every paper must change, pressure, or preserve a material belief. “Interesting” is not a selection reason.
4. Every selected paper carries:
   - a direct primary-source URL;
   - the paper's actual claim;
   - an evidence assessment;
   - the technical or economic consequence;
   - the prior and updated belief when one can be stated honestly;
   - an explicit evidence boundary.
5. Headline benchmark gains may not be repeated without the evaluated hardware, workload, baseline, and transfer limitation.
6. Preprints remain candidate evidence. Publication in the edition does not imply independent replication or accepted truth.
7. No automated process may invent Athan's judgment, approve a revision, or publish it.
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

1. **Governing question**
2. **This week's judgment**
3. **What changed**
4. **Models and methods**, when evidence qualifies
5. **Infrastructure and systems**, when evidence qualifies
6. **Evaluation and counterevidence**, when evidence qualifies
7. **Cross-layer consequence**
8. **Strongest counterargument**
9. **Maintained-object updates**
10. **What to watch next**

Paper entries are evidence units, not content cards. They expose their evidence assessment and limitation in the reading flow.

## 5. Compounding model

The dated issue is an immutable approved snapshot. It does not become the canonical home for a continuing belief.

Selected evidence should pressure persistent topic pages such as:

- verified self-improvement;
- agent skills and procedural context;
- agent reliability measurement;
- GPU performance modeling;
- mixture-of-experts execution economics;
- memory, networking, and inference utilization.

The issue records proposed maintained-object updates. Those proposals do not silently mutate accepted claims. Athan accepts, rejects, defers, or preserves each consequential change through the existing Noeis revision and judgment boundaries.

## 6. Software contract

`This Week in AI` extends the existing Weekend Readings publication machinery:

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
- paper-level evidence assessment, consequence, and boundary;
- edition-level governing question, judgment, cross-layer synthesis, counterargument, maintained-object updates, and watch list.

## 7. Issue 001 acceptance

Issue 001 is ready for Athan's review only when:

- all selected sources are direct arXiv paper pages;
- every source was submitted within the stated evidence window;
- all quantitative statements are bounded by the paper's evaluated workload;
- the issue contains two to five sources;
- the private draft is idempotent and requires human review;
- the exact-revision approval path can reconstruct the new artifact type;
- no public state changes during draft creation;
- focused service tests and the frontend build pass.

Issue 001 is not public merely because these checks pass. Publication remains a separate explicit human action.
