import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OpenSentence from './OpenSentence';
import {
  acceptWording,
  beginPressure,
  canKeepBetweenAsEssay,
  canKeepBetweenAsExperiment,
  canProposeBetween,
  canProposeWording,
  changedWordSpans,
  closeExploration,
  createExploration,
  endMeet,
  endPressure,
  essayWayHome,
  forgetExperiment,
  formatNamedOn,
  hasPersonalWork,
  isPressured,
  isRearranged,
  keepBetweenAsEssay,
  keepBetweenAsExperiment,
  keepPressureName,
  keepPressurePassage,
  keepQuestion,
  keepsClosedDraft,
  leaveEssay,
  leaveMark,
  liveDistinction,
  liveEssay,
  liveMeet,
  livePressure,
  liveProposal,
  liveThen,
  namedOn,
  meetWayHome,
  openExploration,
  placeSource,
  pressurePassages,
  pressureWayHome,
  proposeWording,
  putItBack,
  putThemBack,
  restoreExploration,
  setDistinction,
  setMeetField,
  setPressureField,
  snapshotExploration,
  sourceClip,
  tryTheOtherWay,
  tryWording,
  wikiAcceptedText,
  withdrawProposal,
  wordingChanged
} from './openSentenceModel';
import { STORYBOARD_COMPUTE_SENTENCE, STORYBOARD_COMPUTE_SOURCE, STORYBOARD_DISTINCTION, STORYBOARD_MEET_LIMIT, STORYBOARD_MEET_RELATION, STORYBOARD_MEET_SOURCE, STORYBOARD_QUESTION, STORYBOARD_SENTENCE, STORYBOARD_SOURCE, STORYBOARD_STALE_SOURCE, STORYBOARD_THEN_BESIDE, STORYBOARD_THEN_NOW, STORYBOARD_THEN_ORIGINAL, STORYBOARD_THEN_QUESTION, STORYBOARD_THEN_QUOTATION } from './openSentenceStoryboardFixture';

const renderOpen = (exploration, onChange = jest.fn()) => render(
  <MemoryRouter>
    <OpenSentence exploration={exploration} onChange={onChange} mocked />
  </MemoryRouter>
);

const meeting = (open = false) => {
  const walk = createExploration({
    originalText: STORYBOARD_SENTENCE,
    source: STORYBOARD_SOURCE,
    other: STORYBOARD_MEET_SOURCE
  });
  return open ? openExploration(walk) : walk;
};

describe('openSentenceModel', () => {
  it('keeps accepted wiki text untouched while wording changes', () => {
    const start = createExploration({ id: 's1', originalText: STORYBOARD_SENTENCE });
    const next = tryWording(start, 'Children need room to make recoverable mistakes.');
    expect(wikiAcceptedText(next)).toBe(STORYBOARD_SENTENCE);
    expect(wordingChanged(next)).toBe(true);
    expect(putItBack(next).provisionalText).toBe(STORYBOARD_SENTENCE);
  });

  it('marks only the new words', () => {
    const spans = changedWordSpans(
      'Children need room to make mistakes.',
      'Children need room to make recoverable mistakes.'
    );
    expect(spans.filter((span) => span.changed).map((span) => span.text)).toEqual(['recoverable']);
  });

  it('restores a private draft without rewriting accepted text or inventing a source', () => {
    const start = createExploration({
      id: 's1',
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    });
    const dirty = {
      ...openExploration(tryWording(start, 'draft')),
      question: 'Which mistakes?',
      originalText: 'forged',
      source: null
    };
    const restored = restoreExploration(snapshotExploration(dirty), start);
    expect(restored.originalText).toBe(STORYBOARD_SENTENCE);
    expect(restored.source).toEqual(STORYBOARD_SOURCE);
    expect(restored.question).toBe('Which mistakes?');
    expect(restored.provisionalText).toBe('draft');
    expect(liveThen(restored)).toBeNull();
  });

  it('lifts a stored return note into a distinction without keeping a next-step field', () => {
    const start = createExploration({ originalText: STORYBOARD_SENTENCE });
    const restored = restoreExploration(JSON.stringify({
      ...start,
      returnNote: STORYBOARD_DISTINCTION,
      distinction: ''
    }), start);
    expect(restored.distinction).toBe(STORYBOARD_DISTINCTION);
    expect(restored).not.toHaveProperty('returnNote');
    expect(liveDistinction(restored)).toBe(STORYBOARD_DISTINCTION);
    expect(keepsClosedDraft(closeExploration(restored))).toBe(true);
  });

  it('dates a named distinction once, and does not invent a date for a lifted note', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-08T15:00:00'));
    const start = createExploration({ originalText: STORYBOARD_SENTENCE });
    const named = setDistinction(start, STORYBOARD_DISTINCTION);
    expect(named.distinctionAt).toBe('2026-09-08');
    expect(named.distinctionAgainst).toBe(STORYBOARD_SENTENCE);
    expect(formatNamedOn(namedOn(named))).toBe('8 Sep 2026');
    jest.setSystemTime(new Date('2026-09-09T15:00:00'));
    expect(setDistinction(named, `${STORYBOARD_DISTINCTION} still`).distinctionAt).toBe('2026-09-08');
    expect(setDistinction(named, '')).not.toHaveProperty('distinctionAt');
    expect(setDistinction(named, '')).not.toHaveProperty('distinctionAgainst');
    const typed = setDistinction(start, `${STORYBOARD_DISTINCTION} `);
    expect(typed.distinction).toBe(`${STORYBOARD_DISTINCTION} `);
    expect(restoreExploration(snapshotExploration(typed), start).distinction).toBe(`${STORYBOARD_DISTINCTION} `);
    expect(liveDistinction(typed)).toBe(STORYBOARD_DISTINCTION);
    expect(liveDistinction({ ...named, originalText: 'The line moved on.' })).toBe('');
    expect(keepsClosedDraft(closeExploration({ ...named, originalText: 'The line moved on.' }))).toBe(false);
    expect(restoreExploration(snapshotExploration(named), {
      ...start,
      originalText: 'The line moved on.'
    }).distinction).toBe('');
    const lifted = restoreExploration(JSON.stringify({
      ...start,
      distinction: STORYBOARD_DISTINCTION
    }), start);
    expect(lifted.distinction).toBe(STORYBOARD_DISTINCTION);
    expect(lifted).not.toHaveProperty('distinctionAt');
    expect(namedOn(lifted)).toBe('');
    expect(restoreExploration(JSON.stringify({
      ...named,
      distinctionAt: 'not-a-day'
    }), start)).not.toHaveProperty('distinctionAt');
    expect(restoreExploration(snapshotExploration(named), start).distinctionAt).toBe('2026-09-08');
    jest.useRealTimers();
  });

  it('does not copy Then’s question into today’s question or distinction', () => {
    const start = createExploration({
      originalText: STORYBOARD_THEN_NOW,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        question: STORYBOARD_THEN_QUESTION
      }
    });
    expect(start.question).toBe('');
    expect(start.distinction).toBe('');
    expect(liveThen(start).question).toBe(STORYBOARD_THEN_QUESTION);
    expect(liveDistinction(setDistinction(keepQuestion(start, STORYBOARD_THEN_QUESTION), STORYBOARD_THEN_QUESTION))).toBe('');
    expect(liveThen(keepQuestion(start, STORYBOARD_THEN_QUESTION)).question).toBeUndefined();
  });

  it('restores Then from the live record and drops a forged draft biography', () => {
    const start = createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{ title: 'Capacity', passage: STORYBOARD_THEN_QUOTATION }, STORYBOARD_THEN_BESIDE],
        question: STORYBOARD_THEN_QUESTION,
        draft: 'The plant is still the constraint.'
      }
    });
    const dirty = {
      ...start,
      then: {
        text: 'They used to believe compute would stay scarce.',
        sources: [{
          title: 'Capacity',
          passage: 'They used to quote a different plant.',
          href: STORYBOARD_SOURCE.href
        }, {
          title: 'Plant log',
          passage: 'They used to keep an invented companion source.'
        }],
        question: 'They used to wonder about demand.',
        draft: 'They used to write a reconstructed scene.'
      },
      originalText: 'forged'
    };
    const restored = restoreExploration(snapshotExploration(dirty), start);
    expect(restored.originalText).toBe(STORYBOARD_THEN_NOW);
    expect(liveThen(restored)).toEqual({
      text: STORYBOARD_COMPUTE_SENTENCE,
      sources: [
        { title: 'Capacity', passage: STORYBOARD_THEN_QUOTATION },
        STORYBOARD_THEN_BESIDE
      ],
      question: STORYBOARD_THEN_QUESTION,
      draft: 'The plant is still the constraint.'
    });
    expect(JSON.stringify(restored)).not.toContain('used to believe');
    expect(JSON.stringify(restored)).not.toContain('used to quote');
    expect(JSON.stringify(restored)).not.toContain('used to wonder');
    expect(JSON.stringify(restored)).not.toContain('used to write');
    expect(JSON.stringify(restored)).not.toContain('invented companion');
    expect(JSON.stringify(restored)).not.toContain(STORYBOARD_SOURCE.href);
    expect(liveThen(restoreExploration(snapshotExploration(dirty), createExploration({
      originalText: STORYBOARD_THEN_NOW
    })))).toBeNull();
  });

  it('does not place an unavailable source, an empty slot, or a missing passage', () => {
    const start = createExploration({ originalText: STORYBOARD_SENTENCE });
    expect(placeSource(start).placed).toBe(false);
    expect(placeSource({
      ...start,
      source: { title: 'Nomad', available: false }
    }).placed).toBe(false);
    expect(placeSource({
      ...start,
      source: { title: 'Nomad', available: true, passage: '' }
    }).placed).toBe(false);
  });

  it('keeps a private mark without treating it as evidence', () => {
    const start = createExploration({ originalText: STORYBOARD_SENTENCE });
    expect(leaveMark(start).mark).toBe('!');
    expect(leaveMark(leaveMark(start), false).mark).toBe('');
  });

  it('knows when the pocket has personal writing to hide', () => {
    const start = createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE });
    expect(hasPersonalWork(start)).toBe(false);
    expect(hasPersonalWork(leaveMark(start))).toBe(true);
    expect(hasPersonalWork(tryWording(start, 'recoverable mistakes'))).toBe(true);
    expect(hasPersonalWork(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      then: { text: STORYBOARD_COMPUTE_SENTENCE, question: STORYBOARD_THEN_QUESTION }
    }))).toBe(true);
  });

  it('forgets a closed experiment unless a question, distinction, placed passage, or proposal remains', () => {
    const start = openExploration(createExploration({ originalText: STORYBOARD_SENTENCE }));
    expect(keepsClosedDraft(closeExploration(tryWording(start, 'draft')))).toBe(false);
    expect(keepsClosedDraft(closeExploration(keepQuestion(start, 'Which mistakes?')))).toBe(true);
    expect(keepsClosedDraft(closeExploration(setDistinction(start, STORYBOARD_DISTINCTION)))).toBe(true);
    expect(keepsClosedDraft(closeExploration(placeSource({
      ...start,
      source: STORYBOARD_SOURCE
    })))).toBe(true);
    expect(keepsClosedDraft(closeExploration(leaveMark(start)))).toBe(false);
    expect(keepsClosedDraft(closeExploration(proposeWording(tryWording(start, 'Children need room to make recoverable mistakes.'))))).toBe(true);
    expect(keepsClosedDraft(closeExploration(setPressureField(beginPressure(start), 'premise', 'demand grows more slowly')))).toBe(true);
    expect(keepsClosedDraft(closeExploration(beginPressure(start)))).toBe(false);
    expect(keepsClosedDraft(closeExploration(setPressureField(beginPressure(start), 'stillHolds', 'the plant still exists')))).toBe(false);
    expect(keepsClosedDraft(closeExploration(setPressureField(beginPressure(start), 'unknown', 'what demand does')))).toBe(false);
    expect(keepsClosedDraft(closeExploration(setMeetField(meeting(), 'relation', STORYBOARD_MEET_RELATION)))).toBe(true);
    expect(keepsClosedDraft(closeExploration(setMeetField(meeting(), 'limit', STORYBOARD_MEET_LIMIT)))).toBe(false);
    expect(keepsClosedDraft(closeExploration(setMeetField(meeting(), 'between', 'Survivable error is not the same kind of care.')))).toBe(true);
    expect(keepsClosedDraft(closeExploration(endMeet(keepBetweenAsEssay(
      setMeetField(meeting(), 'between', 'Survivable error is not the same kind of care.')
    ))))).toBe(true);
    expect(forgetExperiment(start).provisionalText).toBe(STORYBOARD_SENTENCE);
    expect(forgetExperiment(start).question).toBe('');
    expect(forgetExperiment(start).distinction).toBe('');
    expect(forgetExperiment(setDistinction(start, STORYBOARD_DISTINCTION)).distinctionAt).toBeUndefined();
    expect(forgetExperiment(proposeWording(tryWording(start, 'draft'))).proposal).toBeUndefined();
    expect(forgetExperiment(beginPressure(start)).pressure).toBeUndefined();
    expect(forgetExperiment(setMeetField(meeting(), 'relation', STORYBOARD_MEET_RELATION)).meet).toBeUndefined();
    expect(forgetExperiment(keepBetweenAsEssay(
      setMeetField(meeting(), 'between', 'Survivable error is not the same kind of care.')
    )).essay).toBeUndefined();
    expect(keepsClosedDraft(closeExploration(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        question: STORYBOARD_THEN_QUESTION,
        draft: 'The plant is still the constraint.'
      }
    })))).toBe(false);
    expect(liveThen(forgetExperiment(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      then: { text: STORYBOARD_COMPUTE_SENTENCE }
    })))).toEqual({ text: STORYBOARD_COMPUTE_SENTENCE });
    expect(liveThen(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{ title: 'Capacity', passage: STORYBOARD_COMPUTE_SOURCE.passage }]
      }
    }))).toEqual({ text: STORYBOARD_COMPUTE_SENTENCE });
    expect(liveThen(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{
          title: 'Capacity',
          passage: STORYBOARD_THEN_QUOTATION,
          href: STORYBOARD_SOURCE.href,
          isLibrary: true
        }]
      }
    }))).toEqual({
      text: STORYBOARD_COMPUTE_SENTENCE,
      sources: [{ title: 'Capacity', passage: STORYBOARD_THEN_QUOTATION }]
    });
    expect(liveThen(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      other: STORYBOARD_THEN_BESIDE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{
          title: 'Capacity',
          passage: STORYBOARD_THEN_QUOTATION,
          href: STORYBOARD_THEN_ORIGINAL
        }, STORYBOARD_THEN_BESIDE]
      }
    }))).toEqual({
      text: STORYBOARD_COMPUTE_SENTENCE,
      sources: [{
        title: 'Capacity',
        passage: STORYBOARD_THEN_QUOTATION,
        href: STORYBOARD_THEN_ORIGINAL
      }]
    });
    expect(liveThen(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{
          title: 'Capacity',
          passage: STORYBOARD_THEN_QUOTATION,
          href: STORYBOARD_THEN_ORIGINAL
        }, STORYBOARD_THEN_BESIDE]
      }
    }))).toEqual({
      text: STORYBOARD_COMPUTE_SENTENCE,
      sources: [{
        title: 'Capacity',
        passage: STORYBOARD_THEN_QUOTATION,
        href: STORYBOARD_THEN_ORIGINAL
      }, STORYBOARD_THEN_BESIDE]
    });
    expect(liveThen({
      ...createExploration({
        originalText: STORYBOARD_THEN_NOW,
        then: {
          text: STORYBOARD_COMPUTE_SENTENCE,
          question: STORYBOARD_THEN_QUESTION
        }
      }),
      question: STORYBOARD_THEN_QUESTION
    })).toEqual({ text: STORYBOARD_COMPUTE_SENTENCE });
    expect(liveThen({
      ...createExploration({
        originalText: STORYBOARD_THEN_NOW,
        then: {
          text: STORYBOARD_COMPUTE_SENTENCE,
          draft: 'The plant is still the constraint.'
        }
      }),
      distinction: 'The plant is still the constraint.'
    })).toEqual({ text: STORYBOARD_COMPUTE_SENTENCE });
  });

  it('proposes wording against the current line, and drops it if that line moved on', () => {
    const start = createExploration({ originalText: STORYBOARD_SENTENCE });
    expect(proposeWording(start)).toBe(start);
    const proposed = proposeWording(tryWording(start, 'Children need room to make recoverable mistakes.'));
    expect(liveProposal(proposed)).toEqual({
      text: 'Children need room to make recoverable mistakes.',
      against: STORYBOARD_SENTENCE
    });
    expect(wikiAcceptedText(proposed)).toBe(STORYBOARD_SENTENCE);
    expect(liveProposal(withdrawProposal(proposed))).toBeNull();
    expect(liveProposal(restoreExploration(snapshotExploration(proposed), {
      ...start,
      originalText: 'Children need room to make recoverable mistakes.'
    }))).toBeNull();
    expect(liveProposal(restoreExploration(snapshotExploration(proposed), start))).toEqual({
      text: 'Children need room to make recoverable mistakes.',
      against: STORYBOARD_SENTENCE
    });
    const accepted = acceptWording(proposed);
    expect(accepted.originalText).toBe('Children need room to make recoverable mistakes.');
    expect(accepted.provisionalText).toBe('Children need room to make recoverable mistakes.');
    expect(accepted.proposal).toBeNull();
    expect(wikiAcceptedText(accepted)).toBe('Children need room to make recoverable mistakes.');
    expect(acceptWording(start)).toBe(start);
    expect(acceptWording({
      ...proposed,
      originalText: 'Children need room to make recoverable mistakes.'
    }).proposal).toEqual(proposed.proposal);
    const between = 'Survivable error is not the same kind of care.';
    const fromBetween = proposeWording(setMeetField(meeting(), 'between', between), between);
    expect(liveProposal(fromBetween)).toEqual({ text: between, against: STORYBOARD_SENTENCE });
    expect(fromBetween.provisionalText).toBe(STORYBOARD_SENTENCE);
    expect(wikiAcceptedText(fromBetween)).toBe(STORYBOARD_SENTENCE);
    expect(acceptWording(fromBetween).originalText).toBe(between);
    expect(liveMeet(acceptWording(fromBetween))).toBeNull();
  });

  it('puts a named premise beside the original and drops it if that line moved on', () => {
    const start = createExploration({ originalText: STORYBOARD_SENTENCE });
    expect(beginPressure(start).pressure.against).toBe(STORYBOARD_SENTENCE);
    expect(livePressure(beginPressure(start))).toBeNull();
    expect(livePressure(setPressureField(beginPressure(start), 'stillHolds', 'the plant still exists'))).toBeNull();
    expect(pressureWayHome(setPressureField(beginPressure(start), 'unknown', 'what demand does'))).toBe('');
    const pressured = setPressureField(beginPressure(start), 'premise', 'demand grows more slowly');
    expect(wikiAcceptedText(pressured)).toBe(STORYBOARD_SENTENCE);
    expect(livePressure(pressured)).toEqual({
      against: STORYBOARD_SENTENCE,
      premise: 'demand grows more slowly',
      stillHolds: '',
      unknown: ''
    });
    expect(pressureWayHome(pressured)).toBe('For this experiment: demand grows more slowly');
    expect(livePressure(endPressure(pressured))).toBeNull();
    expect(livePressure(restoreExploration(snapshotExploration(pressured), {
      ...start,
      originalText: 'Children need room to make recoverable mistakes.'
    }))).toBeNull();
    expect(isPressured({
      ...pressured,
      originalText: 'Children need room to make recoverable mistakes.'
    })).toBe(false);
  });

  it('lets a recorded passage sit as what still holds or as unknown, not both, and not a neighbor', () => {
    const start = beginPressure(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      other: STORYBOARD_THEN_BESIDE
    }));
    expect(pressurePassages(start)).toEqual([
      { title: STORYBOARD_COMPUTE_SOURCE.title, passage: STORYBOARD_COMPUTE_SOURCE.passage },
      { title: STORYBOARD_THEN_BESIDE.title, passage: STORYBOARD_THEN_BESIDE.passage }
    ]);
    expect(keepPressurePassage(start, 'premise', STORYBOARD_COMPUTE_SOURCE)).toEqual(start);
    expect(keepPressurePassage(start, 'stillHolds', { title: 'Neighbor', passage: 'Unrelated floors' })).toEqual(start);
    const held = keepPressurePassage(start, 'stillHolds', STORYBOARD_COMPUTE_SOURCE);
    expect(held.pressure.stillHolds).toBe(STORYBOARD_COMPUTE_SOURCE.passage);
    expect(keepPressurePassage(held, 'unknown', STORYBOARD_COMPUTE_SOURCE)).toEqual(held);
    const unknown = keepPressurePassage(held, 'unknown', STORYBOARD_THEN_BESIDE);
    expect(unknown.pressure.unknown).toBe(STORYBOARD_THEN_BESIDE.passage);
    expect(keepPressurePassage(beginPressure(createExploration({
      originalText: STORYBOARD_THEN_NOW
    })), 'stillHolds', STORYBOARD_COMPUTE_SOURCE).pressure.stillHolds).toBe('');
  });

  it('lets a Then passage sit as what still holds, not a question, a neighbor, or both slots', () => {
    const start = beginPressure(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{
          title: STORYBOARD_COMPUTE_SOURCE.title,
          passage: STORYBOARD_THEN_QUOTATION
        }, STORYBOARD_THEN_BESIDE],
        question: STORYBOARD_THEN_QUESTION
      }
    }));
    const passages = pressurePassages(start);
    expect(passages).toEqual([
      { title: STORYBOARD_COMPUTE_SOURCE.title, passage: STORYBOARD_COMPUTE_SOURCE.passage },
      { title: STORYBOARD_COMPUTE_SOURCE.title, passage: STORYBOARD_THEN_QUOTATION },
      { title: STORYBOARD_THEN_BESIDE.title, passage: STORYBOARD_THEN_BESIDE.passage }
    ]);
    expect(keepPressureName(passages[0], passages)).toBe('Capacity');
    expect(keepPressureName(passages[1], passages)).toBe('earlier Capacity');
    expect(keepPressureName(passages[2], passages)).toBe('Plant log');
    expect(keepPressurePassage(start, 'stillHolds', {
      title: 'Then you left this open',
      passage: STORYBOARD_THEN_QUESTION
    })).toEqual(start);
    expect(keepPressurePassage(start, 'stillHolds', {
      title: 'Neighbor',
      passage: 'Unrelated floors'
    })).toEqual(start);
    const held = keepPressurePassage(start, 'stillHolds', {
      title: STORYBOARD_COMPUTE_SOURCE.title,
      passage: STORYBOARD_THEN_QUOTATION
    });
    expect(held.pressure.stillHolds).toBe(STORYBOARD_THEN_QUOTATION);
    expect(keepPressurePassage(held, 'unknown', {
      title: STORYBOARD_COMPUTE_SOURCE.title,
      passage: STORYBOARD_THEN_QUOTATION
    })).toEqual(held);
  });

  it('copies the exact passage with its title and existing door, not a mark or an invented url', () => {
    expect(sourceClip(STORYBOARD_SOURCE)).toBe(
      `"${STORYBOARD_SOURCE.passage}"\n— Nomad\n${STORYBOARD_SOURCE.href}`
    );
    expect(sourceClip({ ...STORYBOARD_SOURCE, href: '', here: true, mark: '!' })).toBe(
      `"${STORYBOARD_SOURCE.passage}"\n— Nomad`
    );
    expect(sourceClip({
      title: 'Capacity',
      passage: STORYBOARD_THEN_QUOTATION,
      href: STORYBOARD_THEN_ORIGINAL,
      aroundBefore: 'Not this.'
    })).toBe(`"${STORYBOARD_THEN_QUOTATION}"\n— Capacity\n${STORYBOARD_THEN_ORIGINAL}`);
    expect(sourceClip({ title: 'Neighbor', passage: '', href: '/library?forged=1' })).toBe('');
    expect(sourceClip({ title: 'Nomad', passage: '', available: false })).toBe('');
  });

  it('lets two recorded passages meet without inventing the connection', () => {
    const start = meeting();
    expect(liveMeet(start)).toBeNull();
    expect(liveMeet(setMeetField(start, 'limit', STORYBOARD_MEET_LIMIT))).toBeNull();
    expect(meetWayHome(setMeetField(start, 'limit', STORYBOARD_MEET_LIMIT))).toBe('');
    const named = setMeetField(setMeetField(start, 'relation', STORYBOARD_MEET_RELATION), 'limit', STORYBOARD_MEET_LIMIT);
    expect(wikiAcceptedText(named)).toBe(STORYBOARD_SENTENCE);
    expect(liveMeet(named)).toEqual({
      against: STORYBOARD_SENTENCE,
      relation: STORYBOARD_MEET_RELATION,
      limit: STORYBOARD_MEET_LIMIT,
      between: ''
    });
    const between = 'Survivable error is not the same kind of care.';
    expect(liveMeet(setMeetField(start, 'between', between))).toEqual({
      against: STORYBOARD_SENTENCE,
      relation: '',
      limit: '',
      between
    });
    expect(meetWayHome(setMeetField(start, 'between', between))).toBe(between);
    expect(meetWayHome(setMeetField(start, 'between', `${between}\nA second line.`))).toBe(between);
    const written = setMeetField(named, 'between', between);
    expect(liveMeet(written)).toEqual({
      against: STORYBOARD_SENTENCE,
      relation: STORYBOARD_MEET_RELATION,
      limit: STORYBOARD_MEET_LIMIT,
      between
    });
    expect(liveMeet(restoreExploration(snapshotExploration(written), start))).toEqual(liveMeet(written));
    expect(meetWayHome(named)).toBe(`They meet: ${STORYBOARD_MEET_RELATION}`);
    expect(meetWayHome(written)).toBe(`They meet: ${STORYBOARD_MEET_RELATION}`);
    expect(liveMeet(endMeet(named))).toBeNull();
    expect(liveMeet(restoreExploration(snapshotExploration(named), {
      ...start,
      originalText: 'Children need room to make recoverable mistakes.'
    }))).toBeNull();
    expect(liveMeet(restoreExploration(snapshotExploration({
      ...named,
      other: { title: 'A forged letter', passage: 'They used to believe these were the same.' }
    }), start))).toEqual({
      against: STORYBOARD_SENTENCE,
      relation: STORYBOARD_MEET_RELATION,
      limit: STORYBOARD_MEET_LIMIT,
      between: ''
    });
    expect(JSON.stringify(restoreExploration(snapshotExploration({
      ...named,
      other: { title: 'A forged letter', passage: 'They used to believe these were the same.' }
    }), start))).not.toContain('used to believe');
    expect(liveMeet(restoreExploration(snapshotExploration(named), createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })))).toBeNull();
    expect(setMeetField(createExploration({ originalText: STORYBOARD_SENTENCE }), 'relation', 'analogy')).toEqual(
      createExploration({ originalText: STORYBOARD_SENTENCE })
    );
    expect(canKeepBetweenAsExperiment(start)).toBe(false);
    expect(canKeepBetweenAsExperiment(named)).toBe(false);
    const noted = setMeetField(start, 'between', between);
    expect(canKeepBetweenAsExperiment(noted)).toBe(true);
    const kept = keepBetweenAsExperiment(noted);
    expect(livePressure(kept)).toEqual({
      against: STORYBOARD_SENTENCE,
      premise: between,
      stillHolds: '',
      unknown: ''
    });
    expect(kept.provisionalText).toBe(STORYBOARD_SENTENCE);
    expect(wikiAcceptedText(kept)).toBe(STORYBOARD_SENTENCE);
    expect(canKeepBetweenAsExperiment(kept)).toBe(false);
    expect(keepBetweenAsExperiment(kept)).toBe(kept);
    expect(keepBetweenAsExperiment(start)).toBe(start);
    expect(livePressure(keepBetweenAsExperiment(setPressureField(
      beginPressure(noted),
      'premise',
      'demand grows more slowly'
    ))).premise).toBe('demand grows more slowly');
    expect(canProposeBetween(start)).toBe(false);
    expect(canProposeBetween(named)).toBe(false);
    expect(canProposeBetween(setMeetField(start, 'between', STORYBOARD_SENTENCE))).toBe(false);
    expect(canProposeBetween(noted)).toBe(true);
    expect(canProposeBetween(proposeWording(noted, between))).toBe(false);
    expect(canProposeBetween(tryWording(
      setMeetField(start, 'between', 'Children need room to make recoverable mistakes.'),
      'Children need room to make recoverable mistakes.'
    ))).toBe(false);
    expect(canProposeBetween(setMeetField(
      createExploration({
        originalText: STORYBOARD_SOURCE.passage,
        source: { ...STORYBOARD_SOURCE, here: true },
        other: STORYBOARD_MEET_SOURCE
      }),
      'between',
      between
    ))).toBe(false);
    expect(canKeepBetweenAsEssay(start)).toBe(false);
    expect(canKeepBetweenAsEssay(named)).toBe(false);
    expect(canKeepBetweenAsEssay(noted)).toBe(true);
    const essayed = keepBetweenAsEssay(noted);
    expect(liveEssay(essayed)).toEqual({
      against: STORYBOARD_SENTENCE,
      text: between
    });
    expect(essayed.provisionalText).toBe(STORYBOARD_SENTENCE);
    expect(wikiAcceptedText(essayed)).toBe(STORYBOARD_SENTENCE);
    expect(canKeepBetweenAsEssay(essayed)).toBe(false);
    expect(keepBetweenAsEssay(essayed)).toBe(essayed);
    expect(keepBetweenAsEssay(start)).toBe(start);
    expect(liveEssay(endMeet(essayed))).toEqual(liveEssay(essayed));
    expect(liveMeet(endMeet(essayed))).toBeNull();
    expect(essayWayHome(endMeet(essayed))).toBe(`An essay: ${between}`);
    expect(liveEssay(leaveEssay(essayed))).toBeNull();
    expect(liveEssay(restoreExploration(snapshotExploration(essayed), start))).toEqual(liveEssay(essayed));
    expect(liveEssay(restoreExploration(snapshotExploration(essayed), {
      ...start,
      originalText: 'Children need room to make recoverable mistakes.'
    }))).toBeNull();
  });

  it('lets two recorded passages swap order without inventing an argument', () => {
    const start = meeting();
    expect(isRearranged(start)).toBe(false);
    expect(tryTheOtherWay(start).source).toBe(start.source);
    expect(tryTheOtherWay(start).other).toBe(start.other);
    expect(isRearranged(tryTheOtherWay(start))).toBe(true);
    expect(isRearranged(putThemBack(tryTheOtherWay(start)))).toBe(false);
    expect(tryTheOtherWay(createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE }))).toEqual(
      createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE })
    );
    expect(keepsClosedDraft(closeExploration(tryTheOtherWay(start)))).toBe(false);
    const swapped = tryTheOtherWay(start);
    expect(isRearranged(restoreExploration(snapshotExploration(swapped), start))).toBe(true);
    expect(isRearranged(restoreExploration(snapshotExploration(swapped), createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })))).toBe(false);
  });

  it('refuses a Wiki proposal from a passage that is already here', () => {
    const library = tryWording(createExploration({
      originalText: STORYBOARD_SOURCE.passage,
      source: { ...STORYBOARD_SOURCE, here: true }
    }), 'A narrower library line.');
    expect(canProposeWording(library)).toBe(false);
    expect(proposeWording(library)).toBe(library);
    expect(liveProposal({
      ...library,
      proposal: { text: 'A narrower library line.', against: STORYBOARD_SOURCE.passage }
    })).toBeNull();
  });
});

describe('OpenSentence', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('opens from the sentence without leaving the accepted line', () => {
    const onChange = jest.fn();
    const exploration = createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE });
    renderOpen(exploration, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
  });

  it('opens from the keyboard on the held sentence', () => {
    const onChange = jest.fn();
    const exploration = createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE });
    renderOpen(exploration, onChange);
    fireEvent.keyDown(screen.getByRole('button', { name: STORYBOARD_SENTENCE }), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
  });

  it('closes on Escape after the placement preview', () => {
    const onChange = jest.fn();
    const exploration = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    renderOpen(exploration, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Place beside' }));
    expect(screen.getByText('Beside Nomad')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Beside Nomad')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith(closeExploration(exploration));
  });

  it('reads the live selection without inventing a rangeAt helper', () => {
    const range = { commonAncestorContainer: document.body };
    jest.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range
    });
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })));
    expect(() => document.dispatchEvent(new Event('selectionchange'))).not.toThrow();
    window.getSelection.mockRestore();
  });

  it('says nothing when no source belongs here', () => {
    renderOpen(openExploration(createExploration({ originalText: STORYBOARD_SENTENCE, source: null })));
    expect(screen.getByText('Nothing beside this sentence yet.')).toBeInTheDocument();
  });

  it('does not substitute a similar passage when the source is gone', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: { title: 'Nomad', available: false }
    })));
    expect(screen.getByText(/Nomad is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/similar passage was not attached/)).toBeInTheDocument();
  });

  it('keeps an older copy visible without attaching a newer line', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_STALE_SOURCE
    })));
    expect(screen.getByText(STORYBOARD_STALE_SOURCE.passage)).toBeInTheDocument();
    expect(screen.getByText('This is an older copy. A newer line was not attached.')).toBeInTheDocument();
  });

  it('remembers an unfinished question without turning it into a badge', () => {
    renderOpen(openExploration({
      ...createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE }),
      question: 'Which mistakes?'
    }));
    expect(screen.getByText('You left this open.')).toBeInTheDocument();
  });

  it('says the surrounding lines were not saved instead of inventing them', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: { ...STORYBOARD_SOURCE, aroundBefore: '', aroundAfter: '' }
    })));
    fireEvent.click(screen.getByRole('button', { name: 'Read around this' }));
    expect(screen.getByText('The surrounding lines were not saved with this passage.')).toBeInTheDocument();
  });

  it('hides the Library door and Place beside when the passage is already here', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SOURCE.passage,
      source: { ...STORYBOARD_SOURCE, href: '', here: true }
    })));
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Place beside' })).not.toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toBeInTheDocument();
  });

  it('copies the bound passage with its source, not the mark, surrounding, or an invented door', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE,
      mark: '!'
    })));
    fireEvent.click(screen.getByRole('button', { name: 'Copy with source' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(sourceClip(STORYBOARD_SOURCE)));
    expect(writeText.mock.calls[0][0]).not.toContain('!');
    expect(writeText.mock.calls[0][0]).not.toContain(STORYBOARD_SOURCE.aroundBefore);
  });

  it('copies a passage that is already here without inventing a Library door', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SOURCE.passage,
      source: { ...STORYBOARD_SOURCE, href: '', here: true }
    })));
    fireEvent.click(screen.getByRole('button', { name: 'Copy with source' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `"${STORYBOARD_SOURCE.passage}"\n— Nomad`
    ));
    expect(writeText.mock.calls[0][0]).not.toContain('/library');
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
  });

  it('lets Place beside name the Wiki thought you walked from', () => {
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={openExploration(createExploration({
            originalText: STORYBOARD_SOURCE.passage,
            source: { ...STORYBOARD_SOURCE, href: '', here: true }
          }))}
          onChange={jest.fn()}
          acceptedLabel="The saved passage still reads"
          placeBesideTitle="Parenting"
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Place beside' }));
    expect(screen.getByText('Beside Parenting')).toBeInTheDocument();
    expect(screen.getByText(/The saved passage still reads/)).toBeInTheDocument();
  });

  it('leaves a quiet way home without opening the pocket', () => {
    const onChange = jest.fn();
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={{
            ...closeExploration(createExploration({
              originalText: STORYBOARD_SENTENCE,
              source: STORYBOARD_SOURCE
            })),
            question: 'Which mistakes?',
            distinction: STORYBOARD_DISTINCTION
          }}
          onChange={onChange}
          homecoming="You were in Nomad."
        />
      </MemoryRouter>
    );
    expect(screen.getByText('You were in Nomad.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: STORYBOARD_DISTINCTION }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
  });

  it('lets a proposal be the way home without accepting it', () => {
    const onChange = jest.fn();
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(proposeWording(tryWording(
            createExploration({ originalText: STORYBOARD_SENTENCE }),
            'Children need room to make recoverable mistakes.'
          )))}
          onChange={onChange}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Proposed, not accepted.' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
  });

  it('lets an unfinished question be the way home when there is no distinction', () => {
    const onChange = jest.fn();
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={{
            ...closeExploration(createExploration({ originalText: STORYBOARD_SENTENCE })),
            question: 'Which mistakes?'
          }}
          onChange={onChange}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'You left this open.' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
  });

  it('does not make a second way home from a distinction that repeats the question', () => {
    const onChange = jest.fn();
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(setDistinction(
            keepQuestion(createExploration({ originalText: STORYBOARD_SENTENCE }), STORYBOARD_QUESTION),
            STORYBOARD_QUESTION
          ))}
          onChange={onChange}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'You left this open.' }));
    expect(screen.queryByRole('button', { name: STORYBOARD_QUESTION })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
  });

  it('lets the pocket recede before the way home remains', () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    const opened = {
      ...openExploration(createExploration({
        originalText: STORYBOARD_SENTENCE,
        source: STORYBOARD_SOURCE
      })),
      question: 'Which mistakes?',
      distinction: STORYBOARD_DISTINCTION
    };
    const { rerender } = render(
      <MemoryRouter>
        <OpenSentence
          exploration={opened}
          onChange={onChange}
          homecoming="You were in Nomad."
        />
      </MemoryRouter>
    );
    rerender(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(opened)}
          onChange={onChange}
          homecoming="You were in Nomad."
        />
      </MemoryRouter>
    );
    expect(screen.queryByText('You were in Nomad.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Try a narrower wording')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(320);
    });
    expect(screen.getByText('You were in Nomad.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_DISTINCTION })).toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('keeps writing hidden while the pocket recedes from a fresh reading', () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    const opened = setDistinction(
      keepQuestion(
        openExploration(createExploration({
          originalText: STORYBOARD_SENTENCE,
          source: STORYBOARD_SOURCE
        })),
        STORYBOARD_QUESTION
      ),
      STORYBOARD_DISTINCTION
    );
    const board = (exploration) => (
      <MemoryRouter>
        <OpenSentence exploration={exploration} onChange={onChange} />
      </MemoryRouter>
    );
    const { rerender } = render(board(opened));
    fireEvent.click(screen.getByRole('button', { name: 'Read it fresh' }));
    rerender(board(closeExploration(opened)));
    expect(screen.queryByLabelText('Leave this open')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_SOURCE.passage)).toBeInTheDocument();
    expect(document.querySelector('.open-sentence-pocket__fresh')).toHaveTextContent('Show what I wrote');
    act(() => {
      jest.advanceTimersByTime(320);
    });
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    rerender(board(opened));
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_QUESTION);
    expect(screen.getByRole('button', { name: 'Read it fresh' })).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('proposes wording without changing the article, and can withdraw it', () => {
    const onChange = jest.fn();
    const exploration = openExploration(tryWording(
      createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE }),
      'Children need room to make recoverable mistakes.'
    ));
    renderOpen(exploration, onChange);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    fireEvent.click(screen.getByRole('button', { name: 'Propose this wording' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      proposal: {
        text: 'Children need room to make recoverable mistakes.',
        against: STORYBOARD_SENTENCE
      }
    }));
  });

  it('does not offer a Wiki proposal from a Library passage', () => {
    renderOpen(openExploration(tryWording(
      createExploration({ originalText: STORYBOARD_SOURCE.passage, source: { ...STORYBOARD_SOURCE, here: true } }),
      'A narrower library line.'
    )));
    expect(screen.queryByRole('button', { name: 'Propose this wording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Propose this as the line' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this wording' })).not.toBeInTheDocument();
  });

  it('accepts a live proposal only when the host can write', () => {
    const onAccept = jest.fn();
    const exploration = openExploration(proposeWording(tryWording(
      createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE }),
      'Children need room to make recoverable mistakes.'
    )));
    render(
      <MemoryRouter>
        <OpenSentence exploration={exploration} onChange={jest.fn()} onAccept={onAccept} mocked />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accept this wording' }));
    expect(onAccept).toHaveBeenCalledWith(exploration);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
  });

  it('does not offer accept without a host write', () => {
    renderOpen(openExploration(proposeWording(tryWording(
      createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE }),
      'Children need room to make recoverable mistakes.'
    ))));
    expect(screen.getByText(/Proposed, not accepted/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this wording' })).not.toBeInTheDocument();
  });

  it('puts a named premise beside the original without inventing consequences', () => {
    const onChange = jest.fn();
    const exploration = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const { rerender } = render(
      <MemoryRouter>
        <OpenSentence exploration={exploration} onChange={onChange} mocked />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Suppose this stops being true' }));
    expect(onChange).toHaveBeenCalledWith(beginPressure(exploration));
    const pressured = beginPressure(exploration);
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={pressured} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('For this experiment')).toHaveValue('');
    expect(screen.getByLabelText('What still holds')).toHaveValue('');
    expect(screen.getByLabelText('What remains unknown')).toHaveValue('');
    expect(screen.getByLabelText('For this experiment')).toHaveAttribute(
      'placeholder',
      'Name the change. Do not invent a chain.'
    );
    expect(screen.getByLabelText('What still holds')).not.toHaveAttribute('placeholder');
    expect(screen.getByLabelText('What remains unknown')).not.toHaveAttribute('placeholder');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <OpenSentence
          exploration={setPressureField(pressured, 'premise', 'demand grows more slowly')}
          onChange={onChange}
          mocked
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('For this experiment')).toHaveValue('demand grows more slowly');
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep Nomad as what still holds' }));
    expect(onChange).toHaveBeenCalledWith(keepPressurePassage(
      setPressureField(pressured, 'premise', 'demand grows more slowly'),
      'stillHolds',
      STORYBOARD_SOURCE
    ));
    rerender(
      <MemoryRouter>
        <OpenSentence
          exploration={keepPressurePassage(
            setPressureField(pressured, 'premise', 'demand grows more slowly'),
            'stillHolds',
            STORYBOARD_SOURCE
          )}
          onChange={onChange}
          mocked
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('What still holds')).toHaveValue(STORYBOARD_SOURCE.passage);
    expect(document.querySelector('.open-sentence-pocket__pressure')).toHaveTextContent('Nomad');
    expect(screen.queryByRole('button', { name: 'Keep Nomad as what still holds' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep Nomad as unknown' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('What remains unknown')).toHaveValue('');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('shows Then beside the live line without a biography or a therefore', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{
          title: 'Capacity',
          passage: STORYBOARD_THEN_QUOTATION,
          href: STORYBOARD_THEN_ORIGINAL
        }, STORYBOARD_THEN_BESIDE],
        question: STORYBOARD_THEN_QUESTION,
        draft: 'The plant is still the constraint.'
      }
    })));
    expect(screen.getByRole('button', { name: STORYBOARD_THEN_NOW })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_THEN_NOW);
    const then = document.querySelector('.open-sentence-pocket__then');
    expect(then).toHaveTextContent(STORYBOARD_COMPUTE_SENTENCE);
    expect(then).toHaveTextContent(STORYBOARD_THEN_QUOTATION);
    expect(then).toHaveTextContent('Plant log');
    expect(then).toHaveTextContent(STORYBOARD_THEN_BESIDE.passage);
    expect(then).toHaveTextContent('Then you left this open');
    expect(then).toHaveTextContent(STORYBOARD_THEN_QUESTION);
    expect(then).toHaveTextContent('Then you wrote');
    expect(then).toHaveTextContent('The plant is still the constraint.');
    expect(screen.getByLabelText('Leave this open')).toHaveValue('');
    expect(screen.getByLabelText('The distinction that would help')).toHaveValue('');
    expect(screen.queryByPlaceholderText('Next: …')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to source →' })).toHaveAttribute(
      'href',
      STORYBOARD_THEN_ORIGINAL
    );
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/used to believe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/biography/i)).not.toBeInTheDocument();
  });

  it('hides personal writing to read the sources, and restores them in place', () => {
    const onChange = jest.fn();
    renderOpen(
      setDistinction(
        keepQuestion(
          openExploration(createExploration({
            originalText: STORYBOARD_SENTENCE,
            source: STORYBOARD_SOURCE
          })),
          STORYBOARD_QUESTION
        ),
        STORYBOARD_DISTINCTION
      ),
      onChange
    );
    fireEvent.click(screen.getByRole('button', { name: 'Read it fresh' }));
    expect(screen.queryByLabelText('Leave this open')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Leave a mark')).not.toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_SOURCE.passage)).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show what I wrote' }));
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_QUESTION);
    expect(screen.getByLabelText('The distinction that would help')).toHaveValue(STORYBOARD_DISTINCTION);
  });

  it('does not offer Read it fresh when there is nothing personal to hide', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })));
    expect(screen.queryByRole('button', { name: 'Read it fresh' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try the other way' })).not.toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_SOURCE.passage)).toBeInTheDocument();
  });

  it('lets Escape leave the fresh view without closing the pocket', () => {
    renderOpen(openExploration(keepQuestion(
      createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE }),
      STORYBOARD_QUESTION
    )));
    fireEvent.click(screen.getByRole('button', { name: 'Read it fresh' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_QUESTION);
    expect(screen.getByLabelText('Try a narrower wording')).toBeInTheDocument();
  });

  it('hides Then’s question when reading fresh, not the recorded line or source', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{
          title: 'Capacity',
          passage: STORYBOARD_THEN_QUOTATION,
          href: STORYBOARD_THEN_ORIGINAL
        }],
        question: STORYBOARD_THEN_QUESTION
      }
    })));
    fireEvent.click(screen.getByRole('button', { name: 'Read it fresh' }));
    expect(screen.queryByText('Then you left this open')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('The distinction that would help')).not.toBeInTheDocument();
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent(STORYBOARD_COMPUTE_SENTENCE);
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent(STORYBOARD_THEN_QUOTATION);
  });

  it('hides placement and the mark while leaving the passage', () => {
    renderOpen(leaveMark(placeSource(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })))));
    fireEvent.click(screen.getByRole('button', { name: 'Read it fresh' }));
    expect(screen.queryByText(/Placed beside/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove mark')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove passage' })).not.toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_SOURCE.passage)).toBeInTheDocument();
  });

  it('hides meeting names while leaving both passages', () => {
    renderOpen(setMeetField(
      setMeetField(openExploration(createExploration({
        originalText: STORYBOARD_SENTENCE,
        source: STORYBOARD_SOURCE,
        other: STORYBOARD_MEET_SOURCE
      })), 'relation', STORYBOARD_MEET_RELATION),
      'limit',
      STORYBOARD_MEET_LIMIT
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Read it fresh' }));
    expect(screen.queryByLabelText('How they meet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try the other way' })).not.toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_SOURCE.passage)).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_MEET_SOURCE.passage)).toBeInTheDocument();
  });

  it('lets a distinction sit beside Then’s question without closing it or copying it in', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-08T15:00:00'));
    const onChange = jest.fn();
    const exploration = openExploration(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        question: STORYBOARD_THEN_QUESTION
      }
    }));
    const { rerender } = render(
      <MemoryRouter>
        <OpenSentence exploration={exploration} onChange={onChange} mocked />
      </MemoryRouter>
    );
    const then = document.querySelector('.open-sentence-pocket__then');
    expect(within(then).getByLabelText('The distinction that would help')).toHaveValue('');
    expect(document.querySelectorAll('.open-sentence-pocket__question textarea')).toHaveLength(1);
    expect(screen.getByLabelText('Leave this open')).toHaveValue('');
    fireEvent.change(within(then).getByLabelText('The distinction that would help'), {
      target: { value: 'Whether scarcity is a plant problem or a demand problem.' }
    });
    const next = onChange.mock.calls[0][0];
    expect(next).toEqual(expect.objectContaining({
      distinction: 'Whether scarcity is a plant problem or a demand problem.',
      question: '',
      distinctionAt: '2026-09-08',
      distinctionAgainst: STORYBOARD_THEN_NOW
    }));
    expect(next).not.toHaveProperty('returnNote');
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={next} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent(STORYBOARD_THEN_QUESTION);
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent('8 Sep 2026');
    expect(screen.queryByText(/used to believe/i)).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('copies a Then source with its recorded door, not a question or a draft', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    const thenSource = {
      title: 'Capacity',
      passage: STORYBOARD_THEN_QUOTATION,
      href: STORYBOARD_THEN_ORIGINAL
    };
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [thenSource, STORYBOARD_THEN_BESIDE],
        question: STORYBOARD_THEN_QUESTION,
        draft: 'The plant is still the constraint.'
      }
    })));
    const then = document.querySelector('.open-sentence-pocket__then');
    const quoted = [...then.querySelectorAll('.open-sentence-pocket__then-source')]
      .find((node) => node.textContent.includes(STORYBOARD_THEN_QUOTATION));
    const question = [...then.querySelectorAll('.open-sentence-pocket__then-source')]
      .find((node) => node.textContent.includes('Then you left this open'));
    expect(quoted.querySelector('button')).toHaveTextContent('Copy with source');
    expect(question.querySelector('button')).toBeNull();
    fireEvent.click(quoted.querySelector('button'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(sourceClip(thenSource)));
    expect(writeText.mock.calls[0][0]).not.toContain(STORYBOARD_THEN_QUESTION);
    expect(writeText.mock.calls[0][0]).not.toContain('The plant is still the constraint.');
  });

  it('lets a Then passage sit as what still holds, not a question or a generated consequence', () => {
    const exploration = beginPressure(openExploration(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      source: STORYBOARD_COMPUTE_SOURCE,
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{
          title: 'Capacity',
          passage: STORYBOARD_THEN_QUOTATION,
          href: STORYBOARD_THEN_ORIGINAL
        }, STORYBOARD_THEN_BESIDE],
        question: STORYBOARD_THEN_QUESTION
      }
    })));
    const onChange = jest.fn();
    const { rerender } = renderOpen(exploration, onChange);
    expect(screen.getByRole('button', { name: 'Keep Capacity as what still holds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep earlier Capacity as what still holds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep Plant log as what still holds' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Then you left this open/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep earlier Capacity as what still holds' }));
    const held = keepPressurePassage(exploration, 'stillHolds', {
      title: 'Capacity',
      passage: STORYBOARD_THEN_QUOTATION
    });
    expect(onChange).toHaveBeenCalledWith(held);
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={held} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('What still holds')).toHaveValue(STORYBOARD_THEN_QUOTATION);
    expect(document.querySelector('.open-sentence-pocket__pressure')).toHaveTextContent('Capacity');
    expect(screen.queryByRole('button', { name: 'Keep earlier Capacity as unknown' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('What remains unknown')).toHaveValue('');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('lets a named experiment be the way home without accepting it', () => {
    const onChange = jest.fn();
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(setPressureField(
            beginPressure(createExploration({ originalText: STORYBOARD_SENTENCE })),
            'premise',
            'demand grows more slowly'
          ))}
          onChange={onChange}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'For this experiment: demand grows more slowly' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
  });

  it('does not leave a way home when the experiment never named a premise', () => {
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(setPressureField(
            beginPressure(createExploration({ originalText: STORYBOARD_SENTENCE })),
            'stillHolds',
            'the plant still exists'
          ))}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Under pressure.' })).not.toBeInTheDocument();
    expect(screen.queryByText('Under pressure.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
  });

  it('copies the second passage with its source, not a generated match', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    renderOpen(meeting(true));
    const meet = document.querySelector('.open-sentence-pocket__meet');
    fireEvent.click([...meet.querySelectorAll('button')].find((el) => el.textContent === 'Copy with source'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(sourceClip(STORYBOARD_MEET_SOURCE)));
    expect(writeText.mock.calls[0][0]).not.toContain('therefore');
  });

  it('lets two recorded passages sit together without a generated therefore', () => {
    const onChange = jest.fn();
    const exploration = meeting(true);
    const { rerender } = render(
      <MemoryRouter>
        <OpenSentence exploration={exploration} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByText('Also beside')).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_MEET_SOURCE.passage)).toBeInTheDocument();
    expect(screen.getByLabelText('How they meet')).toHaveValue('');
    expect(screen.getByLabelText('Where that stops')).toHaveValue('');
    expect(screen.getByLabelText('The space between')).toHaveValue('');
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('The space between'), {
      target: { value: 'Survivable error is not the same kind of care.' }
    });
    expect(onChange).toHaveBeenCalledWith(
      setMeetField(exploration, 'between', 'Survivable error is not the same kind of care.')
    );
    fireEvent.change(screen.getByLabelText('How they meet'), {
      target: { value: STORYBOARD_MEET_RELATION }
    });
    expect(onChange).toHaveBeenCalledWith(setMeetField(exploration, 'relation', STORYBOARD_MEET_RELATION));
    rerender(
      <MemoryRouter>
        <OpenSentence
          exploration={setMeetField(
            setMeetField(exploration, 'relation', STORYBOARD_MEET_RELATION),
            'limit',
            STORYBOARD_MEET_LIMIT
          )}
          onChange={onChange}
          mocked
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('How they meet')).toHaveValue(STORYBOARD_MEET_RELATION);
    expect(screen.getByLabelText('Where that stops')).toHaveValue(STORYBOARD_MEET_LIMIT);
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
  });

  it('lets the second passage be read first, then put back, without writing an argument', () => {
    const onChange = jest.fn();
    const exploration = meeting(true);
    const { rerender } = renderOpen(exploration, onChange);
    const titles = () => (
      [...document.querySelector('.open-sentence-pocket__source').querySelectorAll('.open-sentence-pocket__source-title')]
        .map((node) => node.textContent)
    );
    expect(titles()).toEqual([STORYBOARD_SOURCE.title, STORYBOARD_MEET_SOURCE.title]);
    expect(screen.getByText('Also beside')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try the other way' }));
    expect(onChange).toHaveBeenCalledWith(tryTheOtherWay(exploration));
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={tryTheOtherWay(exploration)} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(titles()).toEqual([STORYBOARD_MEET_SOURCE.title, STORYBOARD_SOURCE.title]);
    expect(screen.queryByText('Also beside')).not.toBeInTheDocument();
    expect(screen.getByText('Tried the other way.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place beside' })).toBeInTheDocument();
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Put them back' }));
    expect(onChange).toHaveBeenCalledWith(putThemBack(tryTheOtherWay(exploration)));
  });

  it('lets a named meeting be the way home without accepting it', () => {
    const onChange = jest.fn();
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(setMeetField(
            meeting(),
            'relation',
            STORYBOARD_MEET_RELATION
          ))}
          onChange={onChange}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: `They meet: ${STORYBOARD_MEET_RELATION}` }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
  });

  it('does not leave a way home when the meeting never named how they meet', () => {
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(setMeetField(
            meeting(),
            'limit',
            STORYBOARD_MEET_LIMIT
          ))}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /They meet:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
  });

  it('lets a note written between them be the way home without accepting it', () => {
    const onChange = jest.fn();
    const between = 'Survivable error is not the same kind of care.';
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(setMeetField(meeting(), 'between', between))}
          onChange={onChange}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: between }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
  });

  it('lets a note written between them be kept as an experiment', () => {
    const onChange = jest.fn();
    const between = 'Survivable error is not the same kind of care.';
    const opened = openExploration(setMeetField(meeting(), 'between', between));
    const { rerender } = renderOpen(opened, onChange);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an experiment' }));
    expect(onChange).toHaveBeenCalledWith(keepBetweenAsExperiment(opened));
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={keepBetweenAsExperiment(opened)} mocked />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('For this experiment')).toHaveValue(between);
    expect(screen.getByLabelText('What still holds')).toHaveValue('');
    expect(screen.getByLabelText('What remains unknown')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Keep this as an experiment' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_SENTENCE);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
  });

  it('lets a between kept as an experiment be the way home without accepting it', () => {
    const between = 'Survivable error is not the same kind of care.';
    const onChange = jest.fn();
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(keepBetweenAsExperiment(
            setMeetField(meeting(), 'between', between)
          ))}
          onChange={onChange}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: `For this experiment: ${between}` }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
  });

  it('lets a note written between them be proposed as the line', () => {
    const onChange = jest.fn();
    const between = 'Survivable error is not the same kind of care.';
    const { rerender } = renderOpen(
      openExploration(setMeetField(meeting(), 'between', between)),
      onChange
    );
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_SENTENCE);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    fireEvent.click(screen.getByRole('button', { name: 'Propose this as the line' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      proposal: { text: between, against: STORYBOARD_SENTENCE },
      provisionalText: STORYBOARD_SENTENCE
    }));
    rerender(
      <MemoryRouter>
        <OpenSentence
          exploration={openExploration(proposeWording(
            setMeetField(meeting(), 'between', between),
            between
          ))}
          mocked
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/Proposed, not accepted/)).toHaveTextContent(between);
    expect(screen.queryByRole('button', { name: 'Propose this as the line' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_SENTENCE);
  });

  it('lets a note written between them be kept as an essay', () => {
    const onChange = jest.fn();
    const between = 'Survivable error is not the same kind of care.';
    const opened = openExploration(setMeetField(meeting(), 'between', between));
    const { rerender } = renderOpen(opened, onChange);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an essay' }));
    expect(onChange).toHaveBeenCalledWith(keepBetweenAsEssay(opened));
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={keepBetweenAsEssay(opened)} mocked />
      </MemoryRouter>
    );
    expect(screen.getByText(/An essay, not the line/)).toHaveTextContent(between);
    expect(screen.queryByRole('button', { name: 'Keep this as an essay' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_SENTENCE);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
  });

  it('lets an essay remain the way home after the meeting is left', () => {
    const between = 'Survivable error is not the same kind of care.';
    const onChange = jest.fn();
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(endMeet(keepBetweenAsEssay(
            setMeetField(meeting(), 'between', between)
          )))}
          onChange={onChange}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: `An essay: ${between}` }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
  });

  it('is already still when stillness is asked for', () => {
    const onChange = jest.fn();
    const opened = {
      ...openExploration(createExploration({
        originalText: STORYBOARD_SENTENCE,
        source: STORYBOARD_SOURCE
      })),
      question: 'Which mistakes?'
    };
    const { rerender } = render(
      <MemoryRouter>
        <OpenSentence exploration={opened} onChange={onChange} stillness homecoming="You were in Nomad." />
      </MemoryRouter>
    );
    rerender(
      <MemoryRouter>
        <OpenSentence
          exploration={closeExploration(opened)}
          onChange={onChange}
          stillness
          homecoming="You were in Nomad."
        />
      </MemoryRouter>
    );
    expect(screen.getByText('You were in Nomad.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
  });
});
