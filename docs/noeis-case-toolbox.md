# The case toolbox

A Judgment case is six slots in one order: thesis, evidence, timeline,
decisions, outcomes, lessons. The grammar lives in
`note-taker-ui/src/pages/caseToolboxModel.js` and the index already reads
it (`JudgmentIndexSlots`); this file is what remains.

## Doctrine

- Same six slots, same order, every case. Picking what you need means
  hiding, never rearranging. Customization is subtraction.
- An investment dossier is a case with full slots and attached pages. There
  is no dossier type, no dossier styling outside dossier surfaces, and no
  new component that only dossiers use. A template needs no ontology.
- Each slot has three states product-wide: empty (one honest line), live,
  failed (retry, place held). No fourth state, no skeletons.
- Silence over filler applies per slot: a case holding only its sentence
  shows no slot line on the index and no empty-slot gallery in the detail.

## Remaining migration (one appetite, not more)

The case detail still renders dossier-flavored chapters beside the slot
shape. Migrate it slot by slot in grammar order — thesis, evidence,
timeline, decisions, outcomes, lessons — deleting dossier-specific chrome
as each slot lands rather than adapting it. Inventory first: anything a
dossier surface shows that no slot holds is either a seventh slot proposed
in writing or decoration leaving.

Circuit breaker: if adapting takes longer than the appetite, the slot model
is wrong, not slow. Say so and reshape the grammar instead of stretching
the schedule.
