import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OpenSentence from './OpenSentence';
import {
  acceptWording,
  beginPressure,
  canProposeWording,
  changedWordSpans,
  closeExploration,
  createExploration,
  endMeet,
  endPressure,
  forgetExperiment,
  isPressured,
  keepQuestion,
  keepsClosedDraft,
  leaveMark,
  liveMeet,
  livePressure,
  liveProposal,
  liveThen,
  meetWayHome,
  openExploration,
  placeSource,
  pressureWayHome,
  proposeWording,
  putItBack,
  restoreExploration,
  setMeetField,
  setPressureField,
  setReturnNote,
  snapshotExploration,
  tryWording,
  wikiAcceptedText,
  withdrawProposal,
  wordingChanged
} from './openSentenceModel';
import { STORYBOARD_COMPUTE_SENTENCE, STORYBOARD_MEET_LIMIT, STORYBOARD_MEET_RELATION, STORYBOARD_MEET_SOURCE, STORYBOARD_SENTENCE, STORYBOARD_SOURCE, STORYBOARD_STALE_SOURCE, STORYBOARD_THEN_NOW } from './openSentenceStoryboardFixture';

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

  it('restores Then from the live record and drops a forged draft biography', () => {
    const start = createExploration({
      originalText: STORYBOARD_THEN_NOW,
      then: { text: STORYBOARD_COMPUTE_SENTENCE }
    });
    const dirty = {
      ...start,
      then: { text: 'They used to believe compute would stay scarce.' },
      originalText: 'forged'
    };
    const restored = restoreExploration(snapshotExploration(dirty), start);
    expect(restored.originalText).toBe(STORYBOARD_THEN_NOW);
    expect(liveThen(restored)).toEqual({ text: STORYBOARD_COMPUTE_SENTENCE });
    expect(JSON.stringify(restored)).not.toContain('used to believe');
    expect(liveThen(restoreExploration(snapshotExploration({
      ...dirty,
      then: { text: 'They used to believe compute would stay scarce.' }
    }), createExploration({ originalText: STORYBOARD_THEN_NOW })))).toBeNull();
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

  it('forgets a closed experiment unless a question, return note, placed passage, or proposal remains', () => {
    const start = openExploration(createExploration({ originalText: STORYBOARD_SENTENCE }));
    expect(keepsClosedDraft(closeExploration(tryWording(start, 'draft')))).toBe(false);
    expect(keepsClosedDraft(closeExploration(keepQuestion(start, 'Which mistakes?')))).toBe(true);
    expect(keepsClosedDraft(closeExploration(setReturnNote(start, 'Next: look again')))).toBe(true);
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
    expect(forgetExperiment(start).provisionalText).toBe(STORYBOARD_SENTENCE);
    expect(forgetExperiment(start).question).toBe('');
    expect(forgetExperiment(proposeWording(tryWording(start, 'draft'))).proposal).toBeUndefined();
    expect(forgetExperiment(beginPressure(start)).pressure).toBeUndefined();
    expect(forgetExperiment(setMeetField(meeting(), 'relation', STORYBOARD_MEET_RELATION)).meet).toBeUndefined();
    expect(keepsClosedDraft(closeExploration(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      then: { text: STORYBOARD_COMPUTE_SENTENCE }
    })))).toBe(false);
    expect(liveThen(forgetExperiment(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      then: { text: STORYBOARD_COMPUTE_SENTENCE }
    })))).toEqual({ text: STORYBOARD_COMPUTE_SENTENCE });
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
            returnNote: 'Next: figure out which mistakes are recoverable.'
          }}
          onChange={onChange}
          homecoming="You were in Nomad."
        />
      </MemoryRouter>
    );
    expect(screen.getByText('You were in Nomad.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next: figure out which mistakes are recoverable.' }));
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

  it('lets an unfinished question be the way home when there is no return note', () => {
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

  it('lets the pocket recede before the way home remains', () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    const opened = {
      ...openExploration(createExploration({
        originalText: STORYBOARD_SENTENCE,
        source: STORYBOARD_SOURCE
      })),
      question: 'Which mistakes?',
      returnNote: 'Next: figure out which mistakes are recoverable.'
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
    expect(screen.getByRole('button', { name: 'Next: figure out which mistakes are recoverable.' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
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
  });

  it('shows Then beside the live line without a biography or a therefore', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_THEN_NOW,
      then: { text: STORYBOARD_COMPUTE_SENTENCE }
    })));
    expect(screen.getByRole('button', { name: STORYBOARD_THEN_NOW })).toBeInTheDocument();
    expect(screen.getByText(/The article still reads/)).toHaveTextContent(STORYBOARD_THEN_NOW);
    expect(document.querySelector('.open-sentence-pocket__then')).toHaveTextContent(STORYBOARD_COMPUTE_SENTENCE);
    expect(screen.queryByText(/therefore/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/used to believe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/biography/i)).not.toBeInTheDocument();
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
