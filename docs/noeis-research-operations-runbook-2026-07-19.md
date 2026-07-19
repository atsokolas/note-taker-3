# Noeis research operations runbook

**Date:** 2026-07-19
**Owner:** Athan Tsokolas
**Active maintained object:** `Industrial Electrification Value Stack — Living Thesis 001`
**Publication identity:** `Athan Tsokolas — researched and maintained with Noeis`

This runbook begins the operating practice without inventing Athan's judgment or publishing anything automatically. The corresponding product/data contract is in `docs/noeis-research-publication-system-spec-2026-07-19.md`.

## Strategic hierarchy

**Mission**
Build the intelligence infrastructure for exceptional decision-making.

**Long-term vision**
Create the first AI-native institution that continuously compounds judgment and converts superior understanding into companies, investments, and enduring organizations.

**First product**
Noeis: the operating system for maintained judgment.

**First proving ground**
Research and invest in the transformation of physical industries through AI, electrification, and automation.

**Ultimate outcome**
A permanent institution that gets smarter every year.

## 1. Standing cadence

### Every Sunday — private intake

1. Read the prior automation memory and recent sent-mail history.
2. Curate 8-15 direct, working, online-readable candidates.
3. Exclude books, duplicates, brittle links, and source-concentrated filler.
4. Preserve recent technical work plus enduring first-principles material.
5. For each candidate record title, direct URL, source/date, why it matters, source quality, and one role:
   - thesis evidence;
   - counterevidence;
   - context;
   - intellectual broadening.
6. Name the affected claim, unknown, falsifier, or question when known. Otherwise write `unassigned`.
7. Keep the intake private. It is a candidate pool, not a publication.
8. Verify the private email by exact subject/message ID and update continuity memory.

### Every second weekend — Weekend Readings draft

1. Confirm OpenClaw has written and read back the dated and `latest.json` Afternoon Research handoffs. Treat every proposed thesis reference as unaccepted.
2. Run the local intake collector for the two-week window. It combines OpenClaw handoffs with URL-bearing Sunday/Friday automation memory while preserving producer/run provenance.
3. Send the normalized manifest to the authenticated human-only intake preview. No preview operation may write product state.
4. Review canonical dedupe results across sources and prior published editions. A prior private draft is not publication history; a digest-valid publication receipt is.
5. Select 8-15 items. Fill every missing rationale, source-quality judgment, public-safe relationship, and context boundary. Keep `requiresHumanAcceptance=true` until the item is explicitly selected.
6. Create one private dated Noeis Wiki draft through the existing human-only draft route.
7. Write one editorial note naming the period's main intellectual pressure.
8. For each item answer:
   - Why does this matter?
   - What could it change or clarify?
   - Is it evidence, counterevidence, context, or broadening?
   - What does it not prove?
9. Request Athan's review of the exact draft revision.
10. Stop. No job, agent, or scheduler publishes it.
11. After explicit approval, publish the approved revision to one canonical Wiki share URL and verify links/privacy.
12. Athan owns every distribution action outside Noeis.

Collector command for the next two-week window:

```bash
NOEIS_AUTH_TOKEN='<human session token>' node scripts/preview_weekend_readings_intake.js \
  --window-start YYYY-MM-DD \
  --window-end YYYY-MM-DD \
  --api-base https://note-taker-3-unrg.onrender.com
```

The command calls only the preview endpoint. It cannot create, approve, or publish an edition. Do not paste or commit the token, the preview output, or raw private automation memory.

### Every Monday — research frame

Record the week's highest-value unknown, why resolving it could change the decision, the bounded evidence set, and a completion test.

### Tuesday-Wednesday — evidence

Prefer primary sources. Attach evidence to a claim, unknown, assumption, or falsifier. Separate what the source demonstrates from what Athan or an agent infers.

### Thursday — Critic

Run the strongest countercase. Surface unsupported material claims, contradictory evidence, missing base rates, alternative causal models, likely owner bias, falsification tests, and proposed confidence changes. Apply none automatically.

### Friday — human disposition

Athan accepts, rejects, defers, or preserves each material proposal. Record the decision implication. Publish a change note only when a material accepted change warrants one.

### Month end — decision and postmortem

Close with exactly one honest output:

- complete thesis;
- substantial chapter;
- material-change note;
- preserved-judgment note.

Record a public-equity action/no-action posture first. Record founder, private-company, and company-creation implications secondarily. Complete the workflow-friction postmortem whether or not anything is published.

### Quarter end — calibration

Review predictions, confidence, process quality, outcome quality, maintenance value, and repeated friction. Promote a workflow lesson into doctrine only when repeated evidence supports it.

## 2. First operating checkpoint — guided Thesis 001 day zero

Do not begin external thesis research before this session.

### Session opening

Read this boundary aloud:

> This session records Athan's current judgment before research. The agent may clarify and challenge but may not supply the answer, claims, confidence, experience, falsifiers, or decision.

### Guided questions

1. In one sentence, where do you currently expect durable economic value to accrue as off-highway and industrial equipment electrifies?
2. Which two or three layers appear most attractive, and which two or three appear most likely to commoditize or destroy capital?
3. What direct operating experience makes you believe that?
4. What is external knowledge, and what is inference?
5. What causal chain connects application constraints to durable returns on capital?
6. What are the 10-15 propositions that must be true?
7. For each material claim, what is its epistemic status, evidence support, materiality, and confidence?
8. What is the strongest version of the counterargument?
9. Which three to five assumptions carry the most weight?
10. Which three to five unknowns could most change the ranking?
11. What observable events would falsify the thesis or a major claim?
12. What public-equity research or action/no-action posture might follow if the thesis were right?
13. What founder, private-company, or company-creation implications follow secondarily?
14. What is the overall confidence, and which part is weakest?
15. Is the initial snapshot complete enough to preserve without pretending it is proven?

### Session close

- Save the immutable initial revision.
- Record the revision ID and session date.
- Confirm no external sources were added before the snapshot.
- Select one critical unknown for Week 1.
- Set one completion test for the next evidence pass.

## 3. Weekend Readings editorial template

```markdown
# Weekend Readings — YYYY-MM-DD — Edition N

Athan Tsokolas — researched and maintained with Noeis

Coverage: YYYY-MM-DD through YYYY-MM-DD

## Editorial note

<What pressure, question, or contradiction connected this period's reading?>

## Selected readings

### 1. <Linked title>

Source/date: <source, YYYY-MM-DD or era>

Why it matters: <one precise paragraph>

Role: <Thesis evidence | Counterevidence | Context | Intellectual broadening>

Claim/question pressure: <claim, unknown, falsifier, question, or Unassigned>

Boundary: <what this source does not establish>

## Maintained-object note

<If an approved public thesis exists, link it and state whether these readings changed it, queued review, or supplied context. Do not imply an update that has not been accepted.>
```

## 4. Monthly phase receipt template

```yaml
month: YYYY-MM
thesis_page_id: null
phase: frame | evidence | challenge | decide
weekly_objective: ""
completion_test: ""
priority_unknown_id: null
sources_added: []
affected_claim_ids: []
affected_unknown_ids: []
critic_run_id: null
dispositions:
  accepted: 0
  rejected: 0
  deferred: 0
  preserved: 0
decision_record_id: null
artifact_type: none | thesis | chapter | material_change | preserved_judgment
publication_state: private | awaiting_approval | approved | published
observed_friction: []
next_review_at: null
next_review_trigger: ""
```

## 5. Monthly friction postmortem

1. Which claim changed most, or was most meaningfully preserved?
2. Which belief was weakest at the start?
3. Which source delivered the most decision value?
4. Was counterevidence easier to see than in a static document?
5. Did the causal model clarify the decision or merely grow?
6. What action or explicit no-action decision followed?
7. Which maintenance step created unique value?
8. Which step was tedious without improving rigor?
9. Which friction repeated enough to justify a product change?
10. Should the maintained object continue unchanged next month?

## 6. Publication stop conditions

Do not publish when any of these is true:

- Athan has not approved the exact revision;
- the public payload is the mutable live draft rather than the approved snapshot;
- a selected item lacks a direct safe URL, provenance, rationale, or role;
- a material claim is stronger than its cited evidence;
- the strongest counterargument is missing where the artifact makes a thesis claim;
- private decisions, positions, expert identities, notes, prompts, internal IDs, or agent state appear;
- the artifact implies accepted thesis change where only a source connection was proposed;
- public cache invalidation and revocation have not been tested;
- the output exists only to satisfy the calendar.
