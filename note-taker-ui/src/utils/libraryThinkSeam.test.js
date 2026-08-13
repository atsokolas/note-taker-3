import {
  buildLibrarianSelectionPrompt,
  buildLibraryThinkHref,
  findExistingHighlightForSelection
} from './libraryThinkSeam';

describe('Library to Think seam', () => {
  it('opens concepts and questions with exact persisted identities', () => {
    expect(buildLibraryThinkHref({ type: 'concept', id: 'concept/1', name: 'Ignored name' }))
      .toBe('/think?tab=concepts&conceptId=concept%2F1');
    expect(buildLibraryThinkHref({ type: 'question', id: 'question/1' }))
      .toBe('/think?tab=questions&questionId=question%2F1');
  });

  it('uses the concept name only when the persisted identity is unavailable', () => {
    expect(buildLibraryThinkHref({ type: 'concept', name: 'Circle of competence' }))
      .toBe('/think?tab=concepts&concept=Circle%20of%20competence');
  });

  it('drafts a source-grounded Librarian question from the exact passage', () => {
    expect(buildLibrarianSelectionPrompt({ text: '  The edge of the circle matters.  ' }))
      .toContain('“The edge of the circle matters.”');
    expect(buildLibrarianSelectionPrompt({ text: '   ' })).toBe('');
  });

  it('reuses one exact anchored highlight instead of duplicating provenance', () => {
    const original = {
      _id: 'highlight-original',
      text: 'The support trail and counter signal both matter.',
      anchor: { text: 'The support trail and counter signal both matter.', startOffsetApprox: 42 }
    };
    expect(findExistingHighlightForSelection({
      highlights: [original],
      text: '  The support trail and counter signal both matter. ',
      anchor: { startOffsetApprox: 43 }
    })).toBe(original);
  });

  it('does not guess between repeated unanchored passages', () => {
    expect(findExistingHighlightForSelection({
      highlights: [
        { _id: 'first', text: 'Repeated sentence.' },
        { _id: 'second', text: 'Repeated sentence.' }
      ],
      text: 'Repeated sentence.'
    })).toBeNull();
  });

  it('does not reuse a different anchored occurrence with identical text', () => {
    expect(findExistingHighlightForSelection({
      highlights: [{
        _id: 'first-occurrence', text: 'Repeated sentence.',
        anchor: { text: 'Repeated sentence.', startOffsetApprox: 10 }
      }],
      text: 'Repeated sentence.',
      anchor: { startOffsetApprox: 210 }
    })).toBeNull();
  });

  it('does not reuse an unanchored legacy highlight for an anchored selection', () => {
    expect(findExistingHighlightForSelection({
      highlights: [{ _id: 'legacy-occurrence', text: 'Repeated sentence.' }],
      text: 'Repeated sentence.',
      anchor: { startOffsetApprox: 210 }
    })).toBeNull();
  });
});
