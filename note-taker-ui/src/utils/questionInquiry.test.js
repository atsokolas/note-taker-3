import {
  INQUIRY_SCOPE,
  bindInquiryToCurrentQuestion,
  inquiryAddressesEarlierWording,
  normalizeInquiry,
  runLibraryInquiry
} from './questionInquiry';

describe('questionInquiry', () => {
  const now = () => '2026-09-16T15:00:00.000Z';
  const createId = () => 'run-1';

  it('keeps a Library look bound to the wording that was asked', async () => {
    const search = jest.fn().mockResolvedValue({
      articles: [{
        _id: 'letter',
        title: 'Household letter',
        content: 'Patience is not the same as avoidance.'
      }],
      highlights: []
    });
    const run = await runLibraryInquiry({
      search,
      brief: 'Find an example that separates patience from avoidance.',
      question: 'Who bears the downside?',
      enough: 'A case where waiting is not hiding.',
      now,
      createId
    });
    expect(search).toHaveBeenCalledWith({
      q: 'Find an example that separates patience from avoidance.',
      type: ['article', 'highlight']
    });
    expect(run).toEqual(expect.objectContaining({
      id: 'run-1',
      status: 'complete',
      boundQuestion: 'Who bears the downside?',
      boundBrief: 'Find an example that separates patience from avoidance.',
      boundScope: INQUIRY_SCOPE,
      boundEnough: 'A case where waiting is not hiding.',
      gaps: 'No saved highlight spoke to this; these are article lines.',
      passages: [expect.objectContaining({
        title: 'Household letter',
        passage: 'Patience is not the same as avoidance.',
        href: '/library?articleId=letter'
      })]
    }));
  });

  it('names a miss instead of filling the result', async () => {
    const run = await runLibraryInquiry({
      search: jest.fn().mockResolvedValue({
        articles: [{
          _id: 'routines',
          title: 'Household routines',
          content: 'Tuesday is laundry.'
        }],
        highlights: []
      }),
      brief: 'Find who bears the downside.',
      question: 'Who bears the downside?',
      now,
      createId
    });
    expect(run.status).toBe('miss');
    expect(run.passages).toEqual([]);
    expect(run.silence).toBe('Nothing you already have speaks to “Find who bears the downside.”.');
    expect(run.gaps).toBe('Nothing named yet that would be enough.');
  });

  it('keeps a highlight whose words sit in the brief without forming that phrase', async () => {
    const run = await runLibraryInquiry({
      search: jest.fn().mockResolvedValue({
        articles: [],
        highlights: [{
          _id: 'h1',
          articleId: 'letter',
          articleTitle: 'Household letter',
          text: 'Patience is not the same as avoidance.'
        }]
      }),
      brief: 'Find an example that separates patience from avoidance.',
      question: 'Who bears the downside?',
      enough: 'A case where waiting is not hiding.',
      now,
      createId
    });
    expect(run.status).toBe('complete');
    expect(run.passages).toEqual([expect.objectContaining({
      highlightId: 'h1',
      passage: 'Patience is not the same as avoidance.',
      href: '/library?articleId=letter&highlightId=h1'
    })]);
  });

  it('keeps a stopped look from rewriting an edited question', async () => {
    const cancelled = { current: true };
    const run = await runLibraryInquiry({
      search: jest.fn().mockResolvedValue({
        articles: [{
          _id: 'letter',
          title: 'Household letter',
          content: 'Patience is not the same as avoidance.'
        }],
        highlights: []
      }),
      brief: 'Find an example that separates patience from avoidance.',
      question: 'Who bears the downside?',
      cancelled,
      now,
      createId
    });
    expect(run.status).toBe('partial');
    expect(run.boundQuestion).toBe('Who bears the downside?');
    expect(inquiryAddressesEarlierWording(run, 'Whose recoverable mistake is this?')).toBe(true);
    expect(bindInquiryToCurrentQuestion(run, 'Whose recoverable mistake is this?').boundQuestion)
      .toBe('Whose recoverable mistake is this?');
  });

  it('does not treat an in-flight look as a durable state', () => {
    expect(normalizeInquiry({
      brief: '  Find patience.  ',
      run: { status: 'looking', boundQuestion: 'Who bears the downside?' }
    })).toEqual(expect.objectContaining({
      brief: 'Find patience.',
      scope: INQUIRY_SCOPE,
      run: expect.objectContaining({ status: 'idle', boundQuestion: 'Who bears the downside?' })
    }));
  });
});
