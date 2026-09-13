export const NOTEBOOK_SHARE_PRIVACY = 'Anyone with the link can read the version you share. Later private edits stay in the workshop. Your Library stays private.';

export const NOTEBOOK_SHARE_REVOKE = 'Copies already taken stay with their holders. This link will go unanswered.';

export const NOTEBOOK_SHARE_COLOPHON = 'This is the version that was published. Later private edits do not change it. Ordinary copy of the visible text is allowed.';

export const NOTEBOOK_SHARE_ASK = 'This stays with the author. It is not published.';

export const VOLUME_SHARE_PRIVACY = 'Anyone with the link can read this collection of published notes. Later private edits stay in the workshop. Your Library stays private.';

export const VOLUME_SHARE_REVOKE = 'Copies already taken stay with their holders. This link will go unanswered.';

export const VOLUME_SHARE_COLOPHON = 'This is the collected version that was published. Later private edits do not change it. Ordinary copy of the visible text is allowed.';

export const VOLUME_SHARE_SILENCE = 'Share at least two notes first.';

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

export const volumeSnapshot = (over = {}) => {
  const first = essaySnapshot();
  const second = essaySnapshot({
    title: 'Whose downside?',
    publishedAt: '2026-09-13T12:00:00.000Z',
    blocks: [
      { id: 'h2', type: 'heading', level: 2, text: 'The cost' },
      {
        id: 'p2',
        type: 'paragraph',
        text: 'The cost lands on someone who did not choose the experiment.'
      }
    ]
  });
  return {
    title: 'Who pays?',
    introduction: 'Two finished notes, one question.',
    ownerDisplayName: 'Athan',
    publishedAt: '2026-09-13T18:00:00.000Z',
    contents: [
      { title: first.title, ideas: ['The exception first'] },
      { title: second.title, ideas: ['The cost'] }
    ],
    sources: [{ title: 'A letter on time', href: 'https://example.com/letter' }],
    pieces: [first, second],
    ...over
  };
};
