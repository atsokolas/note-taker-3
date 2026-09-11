import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { distinctionRecord } from '../../../utils/distinctionUse';
import { writeHeldInstrument } from './openSentenceJourney';
import OpenSentence from './OpenSentence';

jest.mock('../../../api/notebook', () => ({
  getNotebookSummaries: () => new Promise(() => {}),
  getNotebookEntry: async () => {
    const error = new Error('Notebook entry not found.');
    error.response = { status: 404 };
    throw error;
  },
  createNotebookEntry: async () => null
}));
import {
  acceptWording,
  beginCarry,
  beginContributions,
  beginPressure,
  bringParagraphBackLabel,
  bringTheParagraphBack,
  bringSourceBackLabel,
  bringTheSourceBack,
  canApplyInstrument,
  canCarryOut,
  canFillContributionQuestion,
  canKeepAsExhibit,
  canKeepAsInstrument,
  canKeepAsRehearsal,
  canKeepAsUnwritten,
  canKeepBetweenAsEssay,
  canKeepBetweenAsExperiment,
  canMakeThisTheTitle,
  canProposeBetween,
  canProposeWording,
  canMeetContributions,
  canTryWithoutSource,
  canFillCarryBetween,
  canFillCarryQuestion,
  contributionKindLabel,
  contributionName,
  contributionsWayHome,
  carryClip,
  carryWayHome,
  changedWordSpans,
  chooseLibraryPassage,
  closeExploration,
  closedWayHome,
  createExploration,
  endMeet,
  endPressure,
  essayWayHome,
  exhibitWayHome,
  forgetExperiment,
  formatNamedOn,
  hasPersonalWork,
  includeCarryPassage,
  instrumentWayHome,
  isPressured,
  isRearranged,
  isWithoutParagraph,
  isWithoutSource,
  applyInstrument,
  keepAsExhibit,
  keepAsInstrument,
  keepAsRehearsal,
  keepAsUnwritten,
  keepBetweenAsEssay,
  keepBetweenAsExperiment,
  keepPressureName,
  keepPressurePassage,
  keepQuestion,
  keepsClosedDraft,
  leaveEssay,
  leaveCarry,
  leaveCarryPassage,
  leaveContributions,
  leaveExhibit,
  leaveInstrument,
  leaveMark,
  leaveRehearsal,
  leaveUnwritten,
  liveBearing,
  liveCarry,
  liveContributions,
  liveDistinction,
  liveEssay,
  liveExhibit,
  liveInstrument,
  liveMeet,
  livePressure,
  liveProposal,
  liveRehearsal,
  liveThen,
  liveUnwritten,
  namedOn,
  meetWayHome,
  openExploration,
  pendingInstrument,
  rehearsalStillBeside,
  rehearsalWayHome,
  placeSource,
  pressurePassages,
  pressureWayHome,
  proposeWording,
  putItBack,
  putThemBack,
  restoreExploration,
  setCarryField,
  setCarryFields,
  setContributionField,
  setContributionFields,
  setContributionKind,
  setDistinction,
  setExhibitFields,
  setInstrumentName,
  setMeetField,
  setPressureField,
  setRehearsalAttempt,
  setUnwrittenField,
  snapshotExploration,
  sourceClip,
  showExhibitWay,
  tryTheOtherWay,
  tryWithoutThisParagraph,
  tryWithoutThisSource,
  tryWording,
  unwrittenWayHome,
  fillCarryBetween,
  fillCarryQuestion,
  fillContributionQuestion,
  wikiAcceptedText,
  withdrawProposal,
  wordingChanged
} from './openSentenceModel';
import {
  STORYBOARD_BEARING_SOURCE,
  STORYBOARD_BOTH_ACCEPT,
  STORYBOARD_CARRY_CONCLUSION,
  STORYBOARD_CARRY_QUESTION,
  STORYBOARD_COMPUTE_SENTENCE,
  STORYBOARD_COMPUTE_SOURCE,
  STORYBOARD_CONTRIBUTIONS_QUESTION,
  STORYBOARD_DISTINCTION,
  STORYBOARD_EXHIBIT_NAME,
  STORYBOARD_EXHIBIT_OTHER,
  STORYBOARD_EXHIBIT_THIS,
  STORYBOARD_INSTRUMENT_NAME,
  STORYBOARD_LIBRARY_SOURCE,
  STORYBOARD_MEET_LIMIT,
  STORYBOARD_MEET_RELATION,
  STORYBOARD_MEET_SOURCE,
  STORYBOARD_OBSERVATION,
  STORYBOARD_OTHER_DISPUTES,
  STORYBOARD_QUESTION,
  STORYBOARD_REHEARSAL,
  STORYBOARD_SENTENCE,
  STORYBOARD_SOURCE,
  STORYBOARD_STALE_SOURCE,
  STORYBOARD_THEN_BESIDE,
  STORYBOARD_THEN_NOW,
  STORYBOARD_THEN_ORIGINAL,
  STORYBOARD_THEN_QUESTION,
  STORYBOARD_THEN_QUOTATION,
  STORYBOARD_THIS_DISPUTES,
  STORYBOARD_UNWRITTEN,
  STORYBOARD_UNWRITTEN_GAP
} from './openSentenceStoryboardFixture';

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

const namedWalk = (extra = {}) => setDistinction(
  keepQuestion(
    createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE,
      ...extra
    }),
    STORYBOARD_QUESTION
  ),
  STORYBOARD_DISTINCTION
);

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

  it('lets a later passage bear on the named distinction without resolving it', () => {
    const start = namedWalk({ bearing: STORYBOARD_BEARING_SOURCE });
    expect(liveBearing(start)).toEqual(STORYBOARD_BEARING_SOURCE);
    expect(liveBearing(keepQuestion(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE,
      bearing: STORYBOARD_BEARING_SOURCE
    }), STORYBOARD_QUESTION))).toBeNull();
    expect(liveBearing(setDistinction(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE,
      bearing: STORYBOARD_BEARING_SOURCE
    }), STORYBOARD_DISTINCTION))).toBeNull();
    expect(liveBearing(namedWalk({ bearing: STORYBOARD_SOURCE }))).toBeNull();
    expect(liveBearing(namedWalk({
      other: STORYBOARD_MEET_SOURCE,
      bearing: STORYBOARD_MEET_SOURCE
    }))).toBeNull();
    expect(liveBearing(namedWalk({
      bearing: { ...STORYBOARD_BEARING_SOURCE, passage: 'An unrelated later note.' }
    }))).toBeNull();
    expect(liveBearing(namedWalk({
      bearing: { ...STORYBOARD_BEARING_SOURCE, passage: 'The map is still useful.' }
    }))).toBeNull();
    expect(liveBearing(namedWalk({
      bearing: { ...STORYBOARD_BEARING_SOURCE, available: false, passage: '' }
    }))).toBeNull();
    expect(keepsClosedDraft(closeExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      bearing: STORYBOARD_BEARING_SOURCE
    })))).toBe(false);
    expect(forgetExperiment(start).bearing).toEqual(STORYBOARD_BEARING_SOURCE);
    expect(forgetExperiment(start).question).toBe('');
    expect(restoreExploration(snapshotExploration(start), createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })).bearing).toBeUndefined();
    expect(restoreExploration(snapshotExploration(createExploration({
      originalText: STORYBOARD_SENTENCE
    })), createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE,
      bearing: STORYBOARD_BEARING_SOURCE
    })).bearing).toEqual(STORYBOARD_BEARING_SOURCE);
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

  it('preserves authored wording in the durable loop without changing legacy experiment retention', () => {
    const start = openExploration(createExploration({ originalText: STORYBOARD_SENTENCE }));
    expect(keepsClosedDraft(closeExploration(tryWording(start, 'draft')))).toBe(false);
    expect(keepsClosedDraft(closeExploration(tryWording(start, 'draft')), { preserveAuthorship: true })).toBe(true);
    expect(keepsClosedDraft(closeExploration(keepQuestion(start, 'Which mistakes?')))).toBe(true);
    expect(chooseLibraryPassage(keepQuestion(start, STORYBOARD_QUESTION), STORYBOARD_MEET_SOURCE).question)
      .toBe(STORYBOARD_QUESTION);
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
      bearing: { title: 'Field notes', passage: STORYBOARD_THEN_QUOTATION },
      then: {
        text: STORYBOARD_COMPUTE_SENTENCE,
        sources: [{ title: 'Capacity', passage: STORYBOARD_THEN_QUOTATION }]
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

  it('lets a named distinction be kept as an instrument and applied without writing', () => {
    const start = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    expect(canKeepAsInstrument(start)).toBe(false);
    const named = setDistinction(start, STORYBOARD_DISTINCTION);
    expect(canKeepAsInstrument(named)).toBe(true);
    const kept = keepAsInstrument(named);
    expect(pendingInstrument(kept)).toEqual({
      name: '',
      definition: STORYBOARD_DISTINCTION,
      against: STORYBOARD_SENTENCE
    });
    expect(liveInstrument(kept)).toBeNull();
    expect(canKeepAsInstrument(kept)).toBe(false);
    expect(keepAsInstrument(kept)).toBe(kept);
    expect(keepAsInstrument(start)).toBe(start);
    expect(keepsClosedDraft(closeExploration(kept))).toBe(true);
    expect(keepsClosedDraft(closeExploration({
      ...keepAsInstrument(named),
      distinction: '',
      distinctionAgainst: '',
      distinctionAt: undefined
    }))).toBe(false);
    const titled = setInstrumentName(kept, STORYBOARD_INSTRUMENT_NAME);
    expect(liveInstrument(titled)).toEqual(distinctionRecord({
      name: STORYBOARD_INSTRUMENT_NAME,
      definition: STORYBOARD_DISTINCTION,
      against: STORYBOARD_SENTENCE
    }));
    expect(wikiAcceptedText(titled)).toBe(STORYBOARD_SENTENCE);
    expect(instrumentWayHome(titled)).toBe(`An instrument: ${STORYBOARD_INSTRUMENT_NAME}`);
    expect(keepsClosedDraft(closeExploration(setDistinction(titled, '')))).toBe(true);
    expect(liveInstrument(leaveInstrument(titled))).toBeNull();
    expect(setInstrumentName(kept, '')).toEqual(leaveInstrument(kept));
    expect(liveInstrument(restoreExploration(snapshotExploration(titled), start))).toEqual(
      liveInstrument(titled)
    );
    expect(liveInstrument(restoreExploration(snapshotExploration(titled), {
      ...start,
      originalText: 'Children need room to make recoverable mistakes.'
    }))).toBeNull();
    const compute = openExploration(createExploration({
      originalText: STORYBOARD_COMPUTE_SENTENCE,
      source: STORYBOARD_COMPUTE_SOURCE
    }));
    const held = liveInstrument(titled);
    expect(canApplyInstrument(compute, held)).toBe(true);
    expect(canApplyInstrument(titled, held)).toBe(false);
    expect(canApplyInstrument(setDistinction(compute, 'A different fork.'), held)).toBe(false);
    const applied = applyInstrument(compute, held);
    expect(liveInstrument(applied)).toEqual(distinctionRecord({
      name: STORYBOARD_INSTRUMENT_NAME,
      definition: STORYBOARD_DISTINCTION,
      against: STORYBOARD_COMPUTE_SENTENCE
    }));
    expect(applied.distinction).toBe('');
    expect(wikiAcceptedText(applied)).toBe(STORYBOARD_COMPUTE_SENTENCE);
    expect(applyInstrument(applied, held)).toBe(applied);
    expect(applyInstrument(compute, { name: '', definition: STORYBOARD_DISTINCTION })).toBe(compute);
    expect(forgetExperiment(titled).instrument).toBeUndefined();
  });

  it('lets an exhibit, a rehearsal, unwritten work, and a set-aside source sit beside the line', () => {
    const start = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    expect(canKeepAsExhibit(start)).toBe(true);
    expect(canKeepAsExhibit(createExploration({ originalText: STORYBOARD_SENTENCE }))).toBe(false);
    const exhibited = setExhibitFields(keepAsExhibit(start), {
      name: STORYBOARD_EXHIBIT_NAME,
      thisWay: STORYBOARD_EXHIBIT_THIS,
      otherWay: STORYBOARD_EXHIBIT_OTHER
    });
    expect(liveExhibit(exhibited)).toEqual({
      against: STORYBOARD_SENTENCE,
      name: STORYBOARD_EXHIBIT_NAME,
      thisWay: STORYBOARD_EXHIBIT_THIS,
      otherWay: STORYBOARD_EXHIBIT_OTHER,
      showing: 'this'
    });
    expect(wikiAcceptedText(showExhibitWay(exhibited, 'other'))).toBe(STORYBOARD_SENTENCE);
    expect(exhibitWayHome(exhibited)).toBe(`An exhibit: ${STORYBOARD_EXHIBIT_NAME}`);
    expect(exhibitWayHome(setExhibitFields(keepAsExhibit(start), {
      thisWay: STORYBOARD_EXHIBIT_THIS,
      otherWay: STORYBOARD_EXHIBIT_OTHER
    }))).toBe(`An exhibit: ${STORYBOARD_EXHIBIT_THIS}`);
    expect(liveExhibit(setExhibitFields(keepAsExhibit(start), {
      thisWay: STORYBOARD_EXHIBIT_THIS,
      otherWay: STORYBOARD_EXHIBIT_THIS
    }))).toBeNull();
    expect(keepsClosedDraft(closeExploration(keepAsExhibit(start)))).toBe(false);
    expect(keepsClosedDraft(closeExploration(setExhibitFields(keepAsExhibit(start), {
      thisWay: STORYBOARD_EXHIBIT_THIS,
      otherWay: STORYBOARD_EXHIBIT_THIS
    })))).toBe(false);
    expect(keepsClosedDraft(closeExploration(exhibited))).toBe(true);
    expect(liveExhibit(leaveExhibit(exhibited))).toBeNull();
    expect(liveExhibit(restoreExploration(snapshotExploration(exhibited), start))).toEqual(
      liveExhibit(exhibited)
    );
    expect(liveExhibit(restoreExploration(snapshotExploration(exhibited), {
      ...start,
      originalText: 'Children need room to make recoverable mistakes.'
    }))).toBeNull();
    expect(forgetExperiment(exhibited).exhibit).toBeUndefined();

    expect(canKeepAsRehearsal(start)).toBe(true);
    const rehearsed = setRehearsalAttempt(keepAsRehearsal(start), STORYBOARD_REHEARSAL);
    expect(liveRehearsal(rehearsed).attempt).toBe(STORYBOARD_REHEARSAL);
    expect(rehearsalStillBeside(rehearsed).passage).toBe(STORYBOARD_SOURCE.passage);
    expect(rehearsalStillBeside(tryWithoutThisSource(rehearsed))).toBeNull();
    expect(rehearsalStillBeside(setRehearsalAttempt(
      keepAsRehearsal(start),
      STORYBOARD_SOURCE.passage
    ))).toBeNull();
    expect(rehearsalWayHome(rehearsed)).toBe(`A rehearsal: ${STORYBOARD_REHEARSAL}`);
    expect(setRehearsalAttempt(keepAsRehearsal(start), '')).toEqual(leaveRehearsal(keepAsRehearsal(start)));
    expect(keepsClosedDraft(closeExploration(keepAsRehearsal(start)))).toBe(false);
    expect(wikiAcceptedText(rehearsed)).toBe(STORYBOARD_SENTENCE);
    expect(liveRehearsal(restoreExploration(snapshotExploration(rehearsed), start))).toEqual(
      liveRehearsal(rehearsed)
    );

    const drafted = setUnwrittenField(
      setUnwrittenField(keepAsUnwritten(start), 'question', STORYBOARD_UNWRITTEN),
      'gap',
      STORYBOARD_UNWRITTEN_GAP
    );
    expect(liveUnwritten(drafted)).toEqual({
      against: STORYBOARD_SENTENCE,
      question: STORYBOARD_UNWRITTEN,
      gap: STORYBOARD_UNWRITTEN_GAP
    });
    expect(unwrittenWayHome(drafted)).toBe(`Unwritten: ${STORYBOARD_UNWRITTEN}`);
    expect(canKeepAsUnwritten(drafted)).toBe(false);
    expect(setUnwrittenField(keepAsUnwritten(start), 'question', '')).toEqual(
      leaveUnwritten(keepAsUnwritten(start))
    );
    expect(wikiAcceptedText(drafted)).toBe(STORYBOARD_SENTENCE);
    expect(liveUnwritten(restoreExploration(snapshotExploration(drafted), start))).toEqual(
      liveUnwritten(drafted)
    );

    expect(canTryWithoutSource(start)).toBe(true);
    expect(canTryWithoutSource(createExploration({ originalText: STORYBOARD_SENTENCE }))).toBe(false);
    const aside = tryWithoutThisSource(start);
    expect(isWithoutSource(aside)).toBe(true);
    expect(aside.originalText).toBe(STORYBOARD_SENTENCE);
    expect(bringTheSourceBack(aside)).toEqual(start);
    expect(bringSourceBackLabel(aside)).toBe('Bring Nomad back');
    expect(isWithoutSource(closeExploration(aside))).toBe(false);
    expect(keepsClosedDraft(closeExploration(aside))).toBe(false);
    expect(isWithoutSource(restoreExploration(snapshotExploration(aside), start))).toBe(true);
    expect(isWithoutSource(restoreExploration(
      snapshotExploration(closeExploration(aside)),
      start
    ))).toBe(false);
    expect(isWithoutSource(restoreExploration(snapshotExploration(aside), createExploration({
      originalText: 'The line moved on.',
      source: STORYBOARD_SOURCE
    })))).toBe(false);
    expect(closedWayHome(closeExploration(exhibited))).toBe(`An exhibit: ${STORYBOARD_EXHIBIT_NAME}`);
    expect(closedWayHome(closeExploration(rehearsed))).toBe(`A rehearsal: ${STORYBOARD_REHEARSAL}`);
    expect(closedWayHome(closeExploration(drafted))).toBe(`Unwritten: ${STORYBOARD_UNWRITTEN}`);
  });

  it('lets a snapshot of two included passages be carried out without publishing', () => {
    const start = openExploration(meeting());
    expect(canCarryOut(start)).toBe(true);
    expect(canCarryOut(tryWithoutThisSource(start))).toBe(true);
    expect(canCarryOut(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }))).toBe(false);
    expect(beginCarry(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }))).toEqual(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const pending = beginCarry(start);
    expect(liveCarry(pending)).toBeNull();
    expect(keepsClosedDraft(closeExploration(pending))).toBe(false);
    expect(includeCarryPassage(pending, 'source').carry.source).toEqual({
      title: STORYBOARD_SOURCE.title,
      passage: STORYBOARD_SOURCE.passage
    });
    expect(JSON.stringify(includeCarryPassage(pending, 'source').carry.source)).not.toMatch(
      /href|articleId|highlightId|around/
    );
    expect(includeCarryPassage(tryWithoutThisSource(pending), 'source')).toEqual(
      tryWithoutThisSource(pending)
    );
    const included = includeCarryPassage(includeCarryPassage(pending, 'source'), 'other');
    expect(included.carry.other).toEqual({
      title: STORYBOARD_MEET_SOURCE.title,
      passage: STORYBOARD_MEET_SOURCE.passage
    });
    expect(setCarryField(pending, 'question', '')).toEqual(leaveCarry(pending));
    const asked = keepQuestion(start, STORYBOARD_QUESTION);
    expect(canFillCarryQuestion(beginCarry(asked))).toBe(true);
    expect(fillCarryQuestion(beginCarry(asked)).carry.question).toBe(STORYBOARD_QUESTION);
    const between = setMeetField(start, 'between', STORYBOARD_CARRY_CONCLUSION);
    expect(canFillCarryBetween(beginCarry(between))).toBe(true);
    expect(fillCarryBetween(beginCarry(between)).carry.conclusion).toBe(STORYBOARD_CARRY_CONCLUSION);
    const snapshot = setCarryFields(included, {
      question: STORYBOARD_CARRY_QUESTION,
      conclusion: STORYBOARD_CARRY_CONCLUSION
    });
    expect(liveCarry(snapshot)).toEqual({
      against: STORYBOARD_SENTENCE,
      question: STORYBOARD_CARRY_QUESTION,
      conclusion: STORYBOARD_CARRY_CONCLUSION,
      source: {
        title: STORYBOARD_SOURCE.title,
        passage: STORYBOARD_SOURCE.passage
      },
      other: {
        title: STORYBOARD_MEET_SOURCE.title,
        passage: STORYBOARD_MEET_SOURCE.passage
      }
    });
    expect(wikiAcceptedText(snapshot)).toBe(STORYBOARD_SENTENCE);
    expect(carryWayHome(snapshot)).toBe(`A snapshot: ${STORYBOARD_CARRY_QUESTION}`);
    expect(closedWayHome(closeExploration(snapshot))).toBe(`A snapshot: ${STORYBOARD_CARRY_QUESTION}`);
    expect(keepsClosedDraft(closeExploration(snapshot))).toBe(true);
    expect(carryClip(snapshot)).toBe([
      STORYBOARD_CARRY_QUESTION,
      `${STORYBOARD_SOURCE.title}\n"${STORYBOARD_SOURCE.passage}"`,
      `${STORYBOARD_MEET_SOURCE.title}\n"${STORYBOARD_MEET_SOURCE.passage}"`,
      STORYBOARD_CARRY_CONCLUSION
    ].join('\n\n'));
    expect(carryClip(snapshot)).not.toMatch(/https?:|\/library|articleId|illustrated-nomad/);
    expect(leaveCarryPassage(included, 'source').carry.source).toBeNull();
    expect(liveCarry(restoreExploration(snapshotExploration(snapshot), start))).toEqual(
      liveCarry(snapshot)
    );
    expect(restoreExploration(snapshotExploration(includeCarryPassage(pending, 'source')), {
      ...start,
      source: { ...STORYBOARD_SOURCE, passage: 'A later private edit of Nomad.' }
    }).carry.source.passage).toBe(STORYBOARD_SOURCE.passage);
    expect(liveCarry(restoreExploration(snapshotExploration(snapshot), {
      ...start,
      originalText: 'Children need room to make recoverable mistakes.'
    }))).toBeNull();
    expect(forgetExperiment(snapshot).carry).toBeUndefined();
  });

  it('lets two bound passages meet as attributed contributions, not a consensus', () => {
    const start = openExploration(meeting());
    expect(canMeetContributions(start)).toBe(true);
    expect(canMeetContributions(tryWithoutThisSource(start))).toBe(false);
    expect(canMeetContributions(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }))).toBe(false);
    expect(beginContributions(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }))).toEqual(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const pending = beginContributions(start);
    expect(liveContributions(pending)).toBeNull();
    expect(keepsClosedDraft(closeExploration(pending))).toBe(false);
    expect(canMeetContributions(pending)).toBe(false);
    expect(setContributionField(pending, 'question', '')).toEqual(leaveContributions(pending));
    expect(contributionName(start, 'source')).toBe(STORYBOARD_SOURCE.title);
    expect(contributionName(start, 'other')).toBe(STORYBOARD_MEET_SOURCE.title);
    expect(contributionName(createExploration({ originalText: STORYBOARD_SENTENCE }), 'source'))
      .toBe('this contribution');
    expect(contributionName(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: { passage: STORYBOARD_SOURCE.passage, available: true },
      other: { passage: STORYBOARD_MEET_SOURCE.passage, available: true }
    }), 'other')).toBe('the other contribution');
    expect(contributionKindLabel('values')).toBe('Different values');
    expect(setContributionKind(pending, 'values').contributions.kind).toBe('values');
    expect(setContributionKind(setContributionKind(pending, 'values'), 'values').contributions.kind)
      .toBe('');
    const asked = keepQuestion(start, STORYBOARD_QUESTION);
    expect(canFillContributionQuestion(beginContributions(asked))).toBe(true);
    expect(fillContributionQuestion(beginContributions(asked)).contributions.question)
      .toBe(STORYBOARD_QUESTION);
    const meetingWalk = setContributionFields(pending, {
      question: STORYBOARD_CONTRIBUTIONS_QUESTION,
      kind: 'values',
      bothAccept: STORYBOARD_BOTH_ACCEPT,
      thisDisputes: STORYBOARD_THIS_DISPUTES,
      otherDisputes: STORYBOARD_OTHER_DISPUTES,
      observation: STORYBOARD_OBSERVATION
    });
    expect(liveContributions(meetingWalk)).toEqual({
      against: STORYBOARD_SENTENCE,
      question: STORYBOARD_CONTRIBUTIONS_QUESTION,
      kind: 'values',
      bothAccept: STORYBOARD_BOTH_ACCEPT,
      thisDisputes: STORYBOARD_THIS_DISPUTES,
      otherDisputes: STORYBOARD_OTHER_DISPUTES,
      observation: STORYBOARD_OBSERVATION
    });
    expect(liveContributions(tryWithoutThisSource(meetingWalk))).toBeNull();
    expect(wikiAcceptedText(meetingWalk)).toBe(STORYBOARD_SENTENCE);
    expect(contributionsWayHome(meetingWalk)).toBe(
      `Two contributions: ${STORYBOARD_CONTRIBUTIONS_QUESTION}`
    );
    expect(closedWayHome(closeExploration(meetingWalk))).toBe(
      `Two contributions: ${STORYBOARD_CONTRIBUTIONS_QUESTION}`
    );
    expect(keepsClosedDraft(closeExploration(meetingWalk))).toBe(true);
    expect(hasPersonalWork(pending)).toBe(true);
    expect(liveContributions(restoreExploration(snapshotExploration(meetingWalk), start))).toEqual(
      liveContributions(meetingWalk)
    );
    expect(liveContributions(restoreExploration(snapshotExploration(meetingWalk), {
      ...start,
      originalText: 'Children need room to make recoverable mistakes.'
    }))).toBeNull();
    expect(forgetExperiment(meetingWalk).contributions).toBeUndefined();
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
    const emptyFirst = createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: { ...STORYBOARD_SOURCE, passage: '' },
      other: STORYBOARD_MEET_SOURCE
    });
    expect(tryTheOtherWay(emptyFirst)).toBe(emptyFirst);
    expect(keepsClosedDraft(closeExploration(tryTheOtherWay(start)))).toBe(false);
    const swapped = tryTheOtherWay(start);
    expect(isRearranged(restoreExploration(snapshotExploration(swapped), start))).toBe(true);
    expect(isRearranged(restoreExploration(snapshotExploration(swapped), createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })))).toBe(false);
    expect(isRearranged(restoreExploration(snapshotExploration(swapped), createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE,
      other: { ...STORYBOARD_MEET_SOURCE, passage: 'A different recorded letter.' }
    })))).toBe(false);
    expect(isRearranged(restoreExploration(snapshotExploration(swapped), createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: { ...STORYBOARD_SOURCE, passage: 'A different recorded Nomad.' },
      other: STORYBOARD_MEET_SOURCE
    })))).toBe(false);
  });

  it('lets the opened paragraph be set aside without deleting it', () => {
    const start = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const aside = tryWithoutThisParagraph(start);
    expect(isWithoutParagraph(aside)).toBe(true);
    expect(aside.originalText).toBe(STORYBOARD_SENTENCE);
    expect(bringTheParagraphBack(aside)).toEqual(start);
    expect(bringParagraphBackLabel(aside)).toBe(`Bring “${STORYBOARD_SENTENCE}” back`);
    const here = createExploration({
      originalText: STORYBOARD_SOURCE.passage,
      source: STORYBOARD_LIBRARY_SOURCE
    });
    expect(tryWithoutThisParagraph(here)).toBe(here);
    const empty = createExploration({ originalText: '' });
    expect(tryWithoutThisParagraph(empty)).toBe(empty);
    expect(keepsClosedDraft(closeExploration(aside))).toBe(false);
    expect(isWithoutParagraph(closeExploration(aside))).toBe(false);
    expect(isWithoutParagraph(restoreExploration(snapshotExploration(aside), start))).toBe(true);
    expect(isWithoutParagraph(restoreExploration(
      snapshotExploration(closeExploration(aside)),
      start
    ))).toBe(false);
    expect(isWithoutParagraph(restoreExploration(snapshotExploration(aside), createExploration({
      originalText: 'The line moved on.',
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

  it('lets wording become the title only when it is not already named', () => {
    expect(canMakeThisTheTitle('Parenting', STORYBOARD_SENTENCE)).toBe(true);
    expect(canMakeThisTheTitle('', STORYBOARD_SENTENCE)).toBe(true);
    expect(canMakeThisTheTitle(STORYBOARD_SENTENCE, STORYBOARD_SENTENCE)).toBe(false);
    expect(canMakeThisTheTitle('Parenting', '  ')).toBe(false);
    expect(canMakeThisTheTitle('Parenting', '')).toBe(false);
  });
});

describe('OpenSentence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

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

  it.each([{ isComposing: true }, { keyCode: 229 }])('does not close the pocket for input-method Escape (%j)', (composition) => {
    const onChange = jest.fn();
    const exploration = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    renderOpen(exploration, onChange);
    fireEvent.keyDown(window, { key: 'Escape', ...composition });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith(closeExploration(exploration));
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

  it('lets later material sit beside the distinction without closing the question', () => {
    renderOpen(openExploration(namedWalk({ bearing: STORYBOARD_BEARING_SOURCE })));
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_QUESTION);
    expect(screen.getByLabelText('The distinction that would help')).toHaveValue(STORYBOARD_DISTINCTION);
    expect(screen.getByText('Bears on this distinction.')).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_BEARING_SOURCE.passage)).toBeInTheDocument();
    expect(screen.getByText('Field notes')).toBeInTheDocument();
    expect(screen.queryByText(/resolved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });

  it('stays silent when later material does not bear on the distinction', () => {
    renderOpen(openExploration(namedWalk({
      bearing: { ...STORYBOARD_BEARING_SOURCE, passage: 'An unrelated later note.' }
    })));
    expect(screen.getByLabelText('Leave this open')).toHaveValue(STORYBOARD_QUESTION);
    expect(screen.queryByText('Bears on this distinction.')).not.toBeInTheDocument();
    expect(screen.queryByText('An unrelated later note.')).not.toBeInTheDocument();
  });

  it('keeps the bearing passage when reading fresh', () => {
    renderOpen(openExploration(namedWalk({ bearing: STORYBOARD_BEARING_SOURCE })));
    fireEvent.click(screen.getByRole('button', { name: 'Read it fresh' }));
    expect(screen.queryByLabelText('Leave this open')).not.toBeInTheDocument();
    expect(screen.getByText('Bears on this distinction.')).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_BEARING_SOURCE.passage)).toBeInTheDocument();
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

  it('does not offer Try the other way when the first passage is empty', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: { ...STORYBOARD_SOURCE, passage: '' },
      other: STORYBOARD_MEET_SOURCE
    })));
    expect(screen.queryByRole('button', { name: 'Try the other way' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('How they meet')).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_MEET_SOURCE.passage)).toBeInTheDocument();
  });

  it('hides the paragraph in the article and brings it back by name', () => {
    const onChange = jest.fn();
    const exploration = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const { rerender } = renderOpen(exploration, onChange);
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try without this paragraph' }));
    expect(onChange).toHaveBeenCalledWith(tryWithoutThisParagraph(exploration));
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={tryWithoutThisParagraph(exploration)} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(document.querySelector('.open-sentence')).toHaveClass('is-without');
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.getByText('Trying without this paragraph.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: bringParagraphBackLabel(exploration) }));
    expect(onChange).toHaveBeenCalledWith(bringTheParagraphBack(tryWithoutThisParagraph(exploration)));
  });

  it('does not offer to set aside a paragraph that is already here', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SOURCE.passage,
      source: STORYBOARD_LIBRARY_SOURCE
    })));
    expect(screen.queryByRole('button', { name: 'Try without this paragraph' })).not.toBeInTheDocument();
  });

  it('names the page from the wording and leaves the sentence', () => {
    const onMakeTitle = jest.fn();
    const exploration = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={exploration}
          onChange={jest.fn()}
          mocked
          pageTitle="Parenting"
          onMakeTitle={onMakeTitle}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Make this the title' }));
    expect(onMakeTitle).toHaveBeenCalledWith(STORYBOARD_SENTENCE);
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
  });

  it('does not offer Make this the title when the wording is already the title', () => {
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={openExploration(createExploration({
            originalText: STORYBOARD_SENTENCE,
            source: STORYBOARD_SOURCE
          }))}
          mocked
          pageTitle={STORYBOARD_SENTENCE}
          onMakeTitle={jest.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Make this the title' })).not.toBeInTheDocument();
  });

  it('does not offer Make this the title without a host or wording', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })));
    expect(screen.queryByRole('button', { name: 'Make this the title' })).not.toBeInTheDocument();
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={openExploration(tryWording(createExploration({
            originalText: STORYBOARD_SENTENCE,
            source: STORYBOARD_SOURCE
          }), '   '))}
          mocked
          pageTitle="Parenting"
          onMakeTitle={jest.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Make this the title' })).not.toBeInTheDocument();
  });

  it('lets Escape bring the paragraph back without closing the pocket', () => {
    const onChange = jest.fn();
    renderOpen(tryWithoutThisParagraph(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }))), onChange);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })));
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }));
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

  it('lets a named distinction be kept as an instrument without writing', () => {
    const onChange = jest.fn();
    const opened = openExploration(setDistinction(
      createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE }),
      STORYBOARD_DISTINCTION
    ));
    const { rerender } = renderOpen(opened, onChange);
    expect(screen.queryByRole('button', { name: 'Use this here' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an instrument' }));
    expect(onChange).toHaveBeenCalledWith(keepAsInstrument(opened));
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={keepAsInstrument(opened)} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Name this instrument')).toHaveValue('');
    expect(screen.getByLabelText('The distinction that would help')).toHaveValue(STORYBOARD_DISTINCTION);
    fireEvent.change(screen.getByLabelText('Name this instrument'), {
      target: { value: STORYBOARD_INSTRUMENT_NAME }
    });
    expect(onChange).toHaveBeenCalledWith(setInstrumentName(keepAsInstrument(opened), STORYBOARD_INSTRUMENT_NAME));
    rerender(
      <MemoryRouter>
        <OpenSentence
          exploration={setInstrumentName(keepAsInstrument(opened), STORYBOARD_INSTRUMENT_NAME)}
          onChange={onChange}
          mocked
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/An instrument, not the line/)).toHaveTextContent(STORYBOARD_INSTRUMENT_NAME);
    expect(screen.queryByRole('button', { name: 'Keep this as an instrument' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Try a narrower wording')).toHaveValue(STORYBOARD_SENTENCE);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
  });

  it('lets a named instrument be applied beside another sentence without writing', () => {
    const titled = setInstrumentName(keepAsInstrument(openExploration(setDistinction(
      createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE }),
      STORYBOARD_DISTINCTION
    ))), STORYBOARD_INSTRUMENT_NAME);
    const { unmount } = render(
      <MemoryRouter>
        <OpenSentence exploration={titled} mocked />
      </MemoryRouter>
    );
    unmount();
    const compute = openExploration(createExploration({
      originalText: STORYBOARD_COMPUTE_SENTENCE,
      source: STORYBOARD_COMPUTE_SOURCE
    }));
    const appliedChange = jest.fn();
    const { rerender } = render(
      <MemoryRouter>
        <OpenSentence exploration={compute} onChange={appliedChange} mocked />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use this here' }));
    expect(appliedChange).toHaveBeenCalledWith(applyInstrument(compute, liveInstrument(titled)));
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={applyInstrument(compute, liveInstrument(titled))} mocked />
      </MemoryRouter>
    );
    expect(screen.getByText(/An instrument, not the line/)).toHaveTextContent(STORYBOARD_INSTRUMENT_NAME);
    expect(screen.getByText('Used here as written.')).toBeInTheDocument();
    expect(screen.getByText(STORYBOARD_DISTINCTION)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use this here' })).not.toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_COMPUTE_SENTENCE);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('does not offer another account’s held distinction', () => {
    writeHeldInstrument(distinctionRecord({
      name: STORYBOARD_INSTRUMENT_NAME,
      definition: STORYBOARD_DISTINCTION,
      ownerId: 'owner-2'
    }));
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={openExploration(createExploration({
            originalText: STORYBOARD_COMPUTE_SENTENCE,
            source: STORYBOARD_COMPUTE_SOURCE
          }))}
          mocked
          authorship={{ ready: true, owner: 'owner-1' }}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Use this here' })).not.toBeInTheDocument();
  });

  it('keeps the recorded definition when the notebook page is gone', async () => {
    const applied = applyInstrument(
      openExploration(createExploration({
        originalText: STORYBOARD_COMPUTE_SENTENCE,
        source: STORYBOARD_COMPUTE_SOURCE
      })),
      distinctionRecord({
        name: STORYBOARD_INSTRUMENT_NAME,
        definition: STORYBOARD_DISTINCTION,
        sourceId: 'note-gone'
      })
    );
    render(
      <MemoryRouter>
        <OpenSentence exploration={applied} />
      </MemoryRouter>
    );
    expect(await screen.findByText(STORYBOARD_DISTINCTION)).toBeInTheDocument();
    expect(await screen.findByText('The notebook page is gone. These are the words used here.')).toBeInTheDocument();
  });

  it('lets a named instrument be the way home when that sentence has no distinction', () => {
    const onChange = jest.fn();
    const applied = applyInstrument(
      openExploration(createExploration({
        originalText: STORYBOARD_COMPUTE_SENTENCE,
        source: STORYBOARD_COMPUTE_SOURCE
      })),
      { name: STORYBOARD_INSTRUMENT_NAME, definition: STORYBOARD_DISTINCTION }
    );
    render(
      <MemoryRouter>
        <OpenSentence exploration={closeExploration(applied)} onChange={onChange} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: `An instrument: ${STORYBOARD_INSTRUMENT_NAME}` }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_COMPUTE_SENTENCE })).toBeInTheDocument();
  });

  it('lets two readings be kept as an exhibit without writing', () => {
    const onChange = jest.fn();
    const opened = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const { rerender } = renderOpen(opened, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as an exhibit' }));
    expect(onChange).toHaveBeenCalledWith(keepAsExhibit(opened));
    const both = setExhibitFields(keepAsExhibit(opened), {
      name: STORYBOARD_EXHIBIT_NAME,
      thisWay: STORYBOARD_EXHIBIT_THIS,
      otherWay: STORYBOARD_EXHIBIT_OTHER
    });
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={both} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByText(/An exhibit, not evidence/)).toHaveTextContent(STORYBOARD_EXHIBIT_NAME);
    expect(screen.getByLabelText('This way')).toHaveValue(STORYBOARD_EXHIBIT_THIS);
    expect(screen.getByLabelText('The other way')).toHaveValue(STORYBOARD_EXHIBIT_OTHER);
    fireEvent.click(screen.getByRole('button', { name: 'Show the other way' }));
    expect(onChange).toHaveBeenCalledWith(showExhibitWay(both, 'other'));
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={showExhibitWay(both, 'other')} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Show the other way' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('lets the person try saying it without a grade', () => {
    const onChange = jest.fn();
    const opened = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const { rerender } = renderOpen(opened, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Try saying it' }));
    expect(onChange).toHaveBeenCalledWith(keepAsRehearsal(opened));
    const rehearsed = setRehearsalAttempt(keepAsRehearsal(opened), STORYBOARD_REHEARSAL);
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={rehearsed} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByText('A rehearsal, not a grade.')).toBeInTheDocument();
    expect(screen.getByLabelText('Try saying it')).toHaveValue(STORYBOARD_REHEARSAL);
    expect(screen.getByText('Still beside this explanation.')).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('names unwritten work without ghostwriting the article', () => {
    const onChange = jest.fn();
    const opened = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const { rerender } = renderOpen(opened, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Keep this as unwritten work' }));
    expect(onChange).toHaveBeenCalledWith(keepAsUnwritten(opened));
    const drafted = setUnwrittenField(
      setUnwrittenField(keepAsUnwritten(opened), 'question', STORYBOARD_UNWRITTEN),
      'gap',
      STORYBOARD_UNWRITTEN_GAP
    );
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={drafted} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByText('Unwritten work, not the article.')).toBeInTheDocument();
    expect(screen.getByLabelText('What this collection could become')).toHaveValue(STORYBOARD_UNWRITTEN);
    expect(screen.getByLabelText('What still stops it')).toHaveValue(STORYBOARD_UNWRITTEN_GAP);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('lets a snapshot be carried out from two included passages without writing', async () => {
    const onChange = jest.fn();
    const opened = openExploration(meeting());
    const { rerender } = renderOpen(opened, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Carry this out' }));
    expect(onChange).toHaveBeenCalledWith(beginCarry(opened));
    const pending = beginCarry(opened);
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={pending} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.queryByText('A snapshot. It is not a publication.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Include Nomad' }));
    expect(onChange).toHaveBeenCalledWith(includeCarryPassage(pending, 'source'));
    const withSource = includeCarryPassage(pending, 'source');
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={withSource} onChange={onChange} mocked />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Include Letter to a young investor' }));
    expect(onChange).toHaveBeenCalledWith(includeCarryPassage(withSource, 'other'));
    const included = includeCarryPassage(withSource, 'other');
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={included} onChange={onChange} mocked />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('The question'), {
      target: { value: STORYBOARD_CARRY_QUESTION }
    });
    expect(onChange).toHaveBeenCalledWith(setCarryField(included, 'question', STORYBOARD_CARRY_QUESTION));
    const asked = setCarryField(included, 'question', STORYBOARD_CARRY_QUESTION);
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={asked} onChange={onChange} mocked />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('A provisional conclusion'), {
      target: { value: STORYBOARD_CARRY_CONCLUSION }
    });
    const snapshot = setCarryFields(included, {
      question: STORYBOARD_CARRY_QUESTION,
      conclusion: STORYBOARD_CARRY_CONCLUSION
    });
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={snapshot} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByText('A snapshot. It is not a publication.')).toBeInTheDocument();
    expect(screen.getByLabelText('What a recipient would see')).toHaveTextContent(STORYBOARD_CARRY_QUESTION);
    expect(screen.getByLabelText('What a recipient would see')).toHaveTextContent(STORYBOARD_SOURCE.passage);
    expect(screen.getByLabelText('What a recipient would see')).toHaveTextContent(STORYBOARD_MEET_SOURCE.passage);
    expect(screen.getByLabelText('What a recipient would see')).toHaveTextContent(STORYBOARD_CARRY_CONCLUSION);
    expect(screen.getByLabelText('What a recipient would see').querySelector('a')).toBeNull();
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy this snapshot' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(carryClip(snapshot)));
    expect(writeText.mock.calls[0][0]).not.toMatch(/https?:|\/library/);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
  });

  it('lets two bound passages meet as attributed contributions without judging a motive', () => {
    const onChange = jest.fn();
    const opened = openExploration(meeting());
    const { rerender } = renderOpen(opened, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Let two contributions meet' }));
    expect(onChange).toHaveBeenCalledWith(beginContributions(opened));
    const pending = beginContributions(opened);
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={pending} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.queryByText('Two contributions. Not a consensus.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Shared question'), {
      target: { value: STORYBOARD_CONTRIBUTIONS_QUESTION }
    });
    expect(onChange).toHaveBeenCalledWith(
      setContributionField(pending, 'question', STORYBOARD_CONTRIBUTIONS_QUESTION)
    );
    const asked = setContributionField(pending, 'question', STORYBOARD_CONTRIBUTIONS_QUESTION);
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={asked} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByText('Two contributions. Not a consensus.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Different values' }));
    expect(onChange).toHaveBeenCalledWith(setContributionKind(asked, 'values'));
    const named = setContributionFields(asked, {
      kind: 'values',
      bothAccept: STORYBOARD_BOTH_ACCEPT,
      thisDisputes: STORYBOARD_THIS_DISPUTES,
      otherDisputes: STORYBOARD_OTHER_DISPUTES,
      observation: STORYBOARD_OBSERVATION
    });
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={named} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Different values' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Different values', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByLabelText(`What ${STORYBOARD_SOURCE.title} still disputes`))
      .toHaveValue(STORYBOARD_THIS_DISPUTES);
    expect(screen.getByLabelText(`What ${STORYBOARD_MEET_SOURCE.title} still disputes`))
      .toHaveValue(STORYBOARD_OTHER_DISPUTES);
    expect(screen.getByLabelText('What both accept')).toHaveValue(STORYBOARD_BOTH_ACCEPT);
    expect(screen.getByLabelText('What observation might help')).toHaveValue(STORYBOARD_OBSERVATION);
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <OpenSentence
          exploration={tryWithoutThisSource(named)}
          onChange={onChange}
          mocked
        />
      </MemoryRouter>
    );
    expect(screen.queryByText('Two contributions. Not a consensus.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Shared question')).toHaveValue(STORYBOARD_CONTRIBUTIONS_QUESTION);
  });

  it('hides the bound source in the pocket and brings it back by name', () => {
    const onChange = jest.fn();
    const opened = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const { rerender } = renderOpen(opened, onChange);
    expect(screen.getByText(STORYBOARD_SOURCE.passage)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try without this source' }));
    expect(onChange).toHaveBeenCalledWith(tryWithoutThisSource(opened));
    rerender(
      <MemoryRouter>
        <OpenSentence exploration={tryWithoutThisSource(opened)} onChange={onChange} mocked />
      </MemoryRouter>
    );
    expect(screen.queryByText(STORYBOARD_SOURCE.passage)).not.toBeInTheDocument();
    expect(screen.getByText('This source is set aside. Support that remains is this sentence.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_SENTENCE);
    fireEvent.click(screen.getByRole('button', { name: 'Bring Nomad back' }));
    expect(onChange).toHaveBeenCalledWith(bringTheSourceBack(tryWithoutThisSource(opened)));
  });

  it('does not offer an exhibit or a set-aside source when nothing is bound', () => {
    renderOpen(openExploration(createExploration({ originalText: STORYBOARD_SENTENCE })));
    expect(screen.queryByRole('button', { name: 'Keep this as an exhibit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try without this source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carry this out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Let two contributions meet' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try saying it' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep this as unwritten work' })).toBeInTheDocument();
  });

  it('does not offer to carry a snapshot when only one passage is bound', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    })));
    expect(screen.queryByRole('button', { name: 'Carry this out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Let two contributions meet' })).not.toBeInTheDocument();
  });

  it('lets a live exhibit, rehearsal, unwritten work, or snapshot be the way home', () => {
    const opened = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    const onChange = jest.fn();
    const closed = (exploration) => (
      <MemoryRouter>
        <OpenSentence exploration={closeExploration(exploration)} onChange={onChange} />
      </MemoryRouter>
    );
    const { rerender } = render(closed(setExhibitFields(keepAsExhibit(opened), {
      name: STORYBOARD_EXHIBIT_NAME,
      thisWay: STORYBOARD_EXHIBIT_THIS,
      otherWay: STORYBOARD_EXHIBIT_OTHER
    })));
    fireEvent.click(screen.getByRole('button', { name: `An exhibit: ${STORYBOARD_EXHIBIT_NAME}` }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
    rerender(closed(setRehearsalAttempt(keepAsRehearsal(opened), STORYBOARD_REHEARSAL)));
    expect(screen.getByRole('button', { name: `A rehearsal: ${STORYBOARD_REHEARSAL}` })).toBeInTheDocument();
    rerender(closed(setUnwrittenField(keepAsUnwritten(opened), 'question', STORYBOARD_UNWRITTEN)));
    expect(screen.getByRole('button', { name: `Unwritten: ${STORYBOARD_UNWRITTEN}` })).toBeInTheDocument();
    rerender(closed(setCarryFields(
      includeCarryPassage(includeCarryPassage(beginCarry(openExploration(meeting())), 'source'), 'other'),
      {
        question: STORYBOARD_CARRY_QUESTION,
        conclusion: STORYBOARD_CARRY_CONCLUSION
      }
    )));
    expect(screen.getByRole('button', { name: `A snapshot: ${STORYBOARD_CARRY_QUESTION}` })).toBeInTheDocument();
    rerender(closed(setContributionFields(
      beginContributions(openExploration(meeting())),
      { question: STORYBOARD_CONTRIBUTIONS_QUESTION }
    )));
    expect(screen.getByRole('button', {
      name: `Two contributions: ${STORYBOARD_CONTRIBUTIONS_QUESTION}`
    })).toBeInTheDocument();
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

  it('finds an owned passage beside a saved question without moving the question', () => {
    const onChange = jest.fn();
    const exploration = {
      ...chooseLibraryPassage(
        keepQuestion(openExploration(createExploration({
          originalText: STORYBOARD_SENTENCE,
          source: STORYBOARD_SOURCE
        })), STORYBOARD_QUESTION),
        STORYBOARD_MEET_SOURCE
      ),
      writing: 'Recoverable mistakes stay possible.'
    };
    render(
      <MemoryRouter>
        <OpenSentence
          exploration={exploration}
          onChange={onChange}
          authorship={{
            ready: true,
            owner: 'owner-1',
            record: { saved: { id: 'work-1' }, revision: 1 },
            keep: jest.fn(),
            discard: jest.fn(),
            resolveConflict: jest.fn()
          }}
        />
      </MemoryRouter>
    );
    const question = screen.getByLabelText('Leave this open');
    expect(question).toHaveValue(STORYBOARD_QUESTION);
    const beside = question.closest('.open-sentence-pocket__question');
    expect(beside).toHaveTextContent('Beside this question');
    expect(beside).toHaveTextContent(STORYBOARD_MEET_SOURCE.passage);
    expect(within(beside).getByRole('button', { name: 'Find what I already have' })).toBeInTheDocument();
    expect(screen.queryByText('Also beside')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your writing')).toHaveValue('Recoverable mistakes stay possible.');
  });
});
