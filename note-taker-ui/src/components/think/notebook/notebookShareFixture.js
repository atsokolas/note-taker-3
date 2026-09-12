export const NOTEBOOK_SHARE_PRIVACY = 'Anyone with the link can read the version you share. Later private edits stay in the workshop. Your Library stays private.';

export const NOTEBOOK_SHARE_REVOKE = 'Copies already taken stay with their holders. This link will go unanswered.';

export const ACCESS_WITHHELD = 'Not available at a public address.';

export const essaySnapshot = (over = {}) => ({
  title: 'Who gets to experiment, and who pays?',
  ownerDisplayName: 'Athan',
  publishedAt: '2026-09-12T12:00:00.000Z',
  blocks: [
    { id: 'h1', type: 'heading', level: 2, text: 'The exception first' },
    {
      id: 'q1',
      type: 'quote',
      text: 'Two hours a week cannot sustain this.',
      source: {
        title: 'A letter on time',
        href: 'https://example.com/letter',
        access: 'open'
      }
    },
    {
      id: 'p1',
      type: 'paragraph',
      text: 'The rule assumed spare hours. The exception arrives first.'
    },
    { id: 'c1', type: 'concept', text: 'Room to be wrong' }
  ],
  ...over
});
