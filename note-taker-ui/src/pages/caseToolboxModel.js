/**
 * A case is a toolbox, not a dashboard.
 *
 * Every Judgment case gets the same six slots in the same order — thesis,
 * evidence, timeline, decisions, outcomes, lessons. Picking what you need
 * means hiding, never rearranging: a case that has not reached outcomes
 * shows five slots and silence where the sixth will be. Customization is
 * subtraction, which is what keeps forty cases feeling like one product
 * instead of forty pages.
 *
 * An investment dossier is a case with full slots and attached pages. There
 * is no dossier type here on purpose: a separate ontology is how dossier
 * structure leaked into ordinary pages, and a template needs no ontology.
 */

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export const CASE_SLOTS = Object.freeze([
  { id: 'thesis', label: 'Thesis', empty: 'Hold one sentence you think is true.' },
  { id: 'evidence', label: 'Evidence', empty: 'No evidence has arrived yet.' },
  { id: 'timeline', label: 'Timeline', empty: 'Nothing decided yet — the timeline starts with a decision.' },
  { id: 'decisions', label: 'Decisions', empty: 'No decisions on record.' },
  { id: 'outcomes', label: 'Outcomes', empty: 'No observed outcomes yet.' },
  { id: 'lessons', label: 'Lessons', empty: 'Nothing learned yet — lessons arrive when a judgment closes or parks.' }
]);

const byId = (id) => CASE_SLOTS.find(slot => slot.id === id);

const countOf = (item, key) => Math.max(0, Number(item?.[key] || 0));

/**
 * Each slot live or empty, read off a judgment index item — the shape
 * `buildJudgmentIndex` already returns, so no second idea of what a case
 * holds. Evidence follows the activity states: arrived-and-engaged or
 * arrived-and-avoided both mean something bears on the claim; every other
 * quiet is honest emptiness. The timeline is the dated spine and starts
 * with the first decision, outcome, or lesson — a case holding none of
 * those has no timeline yet, whatever its age.
 */
export const resolveCaseSlots = (item = {}) => {
  const decisions = countOf(item, 'decisionCount');
  const outcomes = countOf(item, 'outcomeCount');
  const lessons = Array.isArray(item?.lessons) ? item.lessons.length : 0;
  const evidence = item?.state === 'live' || item?.state === 'avoided';
  const states = {
    thesis: Boolean(String(item?.sentence || '').trim()),
    evidence,
    timeline: decisions > 0 || outcomes > 0 || lessons > 0,
    decisions: decisions > 0,
    outcomes: outcomes > 0,
    lessons: lessons > 0
  };
  return CASE_SLOTS.map(slot => ({
    ...slot,
    state: states[slot.id] ? 'live' : 'empty',
    count: slot.id === 'decisions' ? decisions
      : slot.id === 'outcomes' ? outcomes
      : slot.id === 'lessons' ? lessons
      : null
  }));
};

/**
 * The index row's shape at a glance. The row itself is the thesis, and the
 * timeline is the detail's spine rather than a one-line fact, so the line
 * names what else lives: evidence and the counted slots, live ones only.
 * A case holding nothing but its sentence prints nothing — the sentence is
 * already on the row.
 */
export const caseSlotLine = (item = {}) => {
  const live = resolveCaseSlots(item).filter(slot => slot.state === 'live');
  const parts = [];
  if (live.some(slot => slot.id === 'evidence')) parts.push('evidence');
  const decisions = live.find(slot => slot.id === 'decisions');
  if (decisions) parts.push(plural(decisions.count, 'decision', 'decisions'));
  const outcomes = live.find(slot => slot.id === 'outcomes');
  if (outcomes) parts.push(plural(outcomes.count, 'outcome', 'outcomes'));
  const lessons = live.find(slot => slot.id === 'lessons');
  if (lessons) parts.push(plural(lessons.count, 'lesson', 'lessons'));
  return parts.join(' · ');
};

export const caseSlot = (id = '') => byId(String(id || '').trim()) || null;
