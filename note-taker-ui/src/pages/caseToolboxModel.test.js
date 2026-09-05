import { CASE_SLOTS, caseSlot, caseSlotLine, resolveCaseSlots } from './caseToolboxModel';

const item = (overrides = {}) => ({
  id: 'c1',
  sentence: 'Integration retains pricing power.',
  state: 'live',
  decisionCount: 2,
  outcomeCount: 1,
  lessons: [{ id: 'l1', text: 'Moats compound.' }],
  ...overrides
});

describe('the case toolbox', () => {
  it('holds six slots in one order, always', () => {
    expect(CASE_SLOTS.map(slot => slot.id)).toEqual([
      'thesis', 'evidence', 'timeline', 'decisions', 'outcomes', 'lessons'
    ]);
    expect(caseSlot('outcomes').label).toBe('Outcomes');
    expect(caseSlot('nope')).toBeNull();
  });

  it('reads each slot live or empty off the index item', () => {
    const states = Object.fromEntries(
      resolveCaseSlots(item()).map(slot => [slot.id, slot.state])
    );
    expect(states).toEqual({
      thesis: 'live',
      evidence: 'live',
      timeline: 'live',
      decisions: 'live',
      outcomes: 'live',
      lessons: 'live'
    });
  });

  it('calls arrived-but-unread evidence live, and quiet honestly empty', () => {
    expect(resolveCaseSlots(item({ state: 'avoided' }))
      .find(slot => slot.id === 'evidence').state).toBe('live');
    expect(resolveCaseSlots(item({ state: 'quiet' }))
      .find(slot => slot.id === 'evidence').state).toBe('empty');
    expect(resolveCaseSlots(item({ state: 'parked' }))
      .find(slot => slot.id === 'evidence').state).toBe('empty');
  });

  it('starts the timeline with the first dated fact, not with age', () => {
    expect(resolveCaseSlots(item({ decisionCount: 0, outcomeCount: 0, lessons: [] }))
      .find(slot => slot.id === 'timeline').state).toBe('empty');
  });

  it('draws the shape in one line, live slots only', () => {
    expect(caseSlotLine(item()))
      .toBe('evidence · 2 decisions · 1 outcome · 1 lesson');
    expect(caseSlotLine(item({
      state: 'quiet', decisionCount: 0, outcomeCount: 0, lessons: []
    }))).toBe('');
  });
});
