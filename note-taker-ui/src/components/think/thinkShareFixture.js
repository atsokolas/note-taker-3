export const QUESTION_SHARE_PRIVACY = 'Anyone with the link can read the version you share. A later reading sits beside it, not inside it. Later private edits stay in the workshop. Library highlights stay private.';

export const CONCEPT_SHARE_PRIVACY = 'Anyone with the link can read the version you share. Later private edits stay in the workshop. Your Library stays private.';

export const THINK_SHARE_REVOKE = 'Copies already taken stay with their holders. This link will go unanswered.';

export const QUESTION_SHARE_COLOPHON = 'This is the version that was published. A later reading sits beside it. Later private edits do not change it.';

export const QUESTION_SHARE_OFFER = 'Only these words leave your side. Your Library stays private. What you still hold is optional.';

export const QUESTION_SHARE_TAKE = 'The reading stays. This sits beside it.';

export const CONCEPT_SHARE_COLOPHON = 'This is the version that was published. Later private edits do not change it.';

export const QUESTION_NOT_PUBLISHED = 'This question is not published.';

export const CONCEPT_NOT_PUBLISHED = 'This concept is not published.';

export const questionSnapshot = (over = {}) => ({
  ownerDisplayName: 'Athan',
  publishedAt: '2026-09-13T12:00:00.000Z',
  question: {
    text: 'What survives compounding?',
    status: 'open',
    conceptName: 'Compounding',
    paragraphs: [{ id: 'p1', type: 'paragraph', text: 'Time plus reinvestment beats picking once.' }]
  },
  ...over
});

export const questionContribution = (over = {}) => ({
  id: 'c1',
  by: 'Mara',
  text: 'Same fact, different time horizon.',
  remainder: 'Who pays when the window closes?',
  createdAt: '2026-09-13T16:00:00.000Z',
  ...over
});

export const conceptSnapshot = (over = {}) => ({
  ownerDisplayName: 'Athan',
  publishedAt: '2026-09-13T12:00:00.000Z',
  concept: {
    name: 'Opportunity Cost',
    framing: 'What does this explain?',
    description: 'Tradeoffs over hidden alternatives.',
    hypothesisHtml: '<p>Tradeoffs compound.</p>',
    supports: [{
      id: 's1',
      title: 'Public argument',
      content: 'Choosing one path excludes another.',
      whyItMatters: 'It makes hidden alternatives visible.'
    }],
    contradictions: [{
      id: 'c1',
      title: 'Disruption',
      content: 'Some windows close before the cost is visible.'
    }],
    questions: [{
      id: 'q1',
      title: 'What survives 100 years?'
    }]
  },
  ...over
});
