const {
  ACCESS_OPEN,
  ACCESS_WITHHELD,
  canPublishNotebook,
  collectArticleIds,
  freezeNotebookSnapshot,
  hashPublicNotebook,
  liveNotebookPreview,
  notebookShareState,
  projectPublicNotebook
} = require('./authoredNotebookShare');

const USER = '64f200000000000000000001';
const ARTICLE = '64f2000000000000000000bb';
const NOTE = '64f2000000000000000000cc';

const essay = (over = {}) => ({
  _id: NOTE,
  userId: USER,
  title: 'Who gets to experiment, and who pays?',
  blocks: [{
    id: 'h1',
    type: 'heading',
    level: 2,
    text: 'The exception first'
  }, {
    id: 'q1',
    type: 'highlight_embed',
    highlightId: '64f2000000000000000000aa',
    articleId: ARTICLE,
    articleTitle: 'A letter on time',
    text: 'Two hours a week cannot sustain this.',
    sourcePath: `/library?articleId=${ARTICLE}`
  }, {
    id: 'p1',
    type: 'paragraph',
    text: 'The rule assumed spare hours. The exception arrives first.'
  }],
  ...over
});

describe('authored notebook share', () => {
  it('projects an allowlist: quotation, title, public URL — never library doors or ids', () => {
    const snapshot = projectPublicNotebook(essay(), 'Athan', {
      articlesById: new Map([[ARTICLE, { url: 'https://example.com/letter', title: 'A letter on time' }]])
    });
    expect(snapshot.title).toBe('Who gets to experiment, and who pays?');
    expect(snapshot.ownerDisplayName).toBe('Athan');
    expect(JSON.stringify(snapshot)).not.toMatch(/library\?/);
    expect(JSON.stringify(snapshot)).not.toMatch(ARTICLE);
    expect(JSON.stringify(snapshot)).not.toMatch(/highlightId/);
    expect(snapshot.blocks[1]).toEqual({
      id: 'q1',
      type: 'quote',
      text: 'Two hours a week cannot sustain this.',
      source: {
        title: 'A letter on time',
        href: 'https://example.com/letter',
        access: ACCESS_OPEN
      }
    });
  });

  it('withholds a source door when the original has no public address', () => {
    const snapshot = projectPublicNotebook(essay(), 'Athan', { articlesById: new Map() });
    expect(snapshot.blocks[1].source).toEqual({
      title: 'A letter on time',
      href: '',
      access: ACCESS_WITHHELD
    });
  });

  it('drops javascript and private paths pretending to be URLs', () => {
    const snapshot = projectPublicNotebook(essay({
      blocks: [{
        id: 'a1',
        type: 'article_ref',
        articleTitle: 'Held privately',
        url: 'javascript:alert(1)'
      }]
    }), 'Athan');
    expect(snapshot.blocks[0].source.href).toBe('');
    expect(snapshot.blocks[0].source.access).toBe(ACCESS_WITHHELD);
  });

  it('keeps named concepts and questions without workspace doors', () => {
    const snapshot = projectPublicNotebook(essay({
      blocks: [{
        id: 'c1',
        type: 'concept_ref',
        conceptId: '64f2000000000000000000ee',
        conceptName: 'Room to be wrong'
      }, {
        id: 'n1',
        type: 'question_ref',
        questionId: '64f2000000000000000000ff',
        questionText: 'Whose downside?'
      }]
    }), 'Athan');
    expect(snapshot.blocks).toEqual([
      { id: 'c1', type: 'concept', text: 'Room to be wrong' },
      { id: 'n1', type: 'question', text: 'Whose downside?' }
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/conceptId|questionId|64f2/);
  });

  it('does not treat a code language as a path, and ignores path-shaped sourcePath', () => {
    const snapshot = projectPublicNotebook({
      title: 'Notes',
      blocks: [
        { id: 'code-1', type: 'code', text: 'const x = 1;', sourcePath: 'js' },
        { id: 'code-2', type: 'code', text: 'plain', sourcePath: '/library?articleId=x' }
      ]
    }, 'Athan');
    expect(snapshot.blocks[0].language).toBe('js');
    expect(snapshot.blocks[1].language).toBeUndefined();
  });

  it('is silent when nothing would read as a piece of writing', () => {
    const empty = projectPublicNotebook({ title: '', blocks: [] }, 'Athan');
    expect(empty.blocks).toEqual([]);
    expect(canPublishNotebook(empty)).toBe(false);
    expect(canPublishNotebook(projectPublicNotebook(essay(), 'Athan'))).toBe(true);
  });

  it('hashes the live preview, not the freeze date, so publish itself is not stale', () => {
    const preview = projectPublicNotebook(essay(), 'Athan');
    const frozen = freezeNotebookSnapshot(preview, '2026-09-12T12:00:00.000Z');
    expect(frozen.publishedAt).toBe('2026-09-12T12:00:00.000Z');
    expect(hashPublicNotebook(frozen)).toBe(hashPublicNotebook(preview));
  });

  it('keeps the first share date and an optional correction, without hashing them', () => {
    const preview = projectPublicNotebook(essay(), 'Athan');
    const revised = freezeNotebookSnapshot(preview, '2026-09-12T12:00:00.000Z', {
      revisedAt: '2026-09-13T15:00:00.000Z',
      correction: '  The exception now leads. <em>private</em> '
    });
    expect(revised.publishedAt).toBe('2026-09-12T12:00:00.000Z');
    expect(revised.revisedAt).toBe('2026-09-13T15:00:00.000Z');
    expect(revised.correction).toBe('The exception now leads. private');
    expect(hashPublicNotebook(revised)).toBe(hashPublicNotebook(preview));
    expect(freezeNotebookSnapshot(preview, '2026-09-12T12:00:00.000Z', {
      revisedAt: '2026-09-12T12:00:00.000Z',
      correction: '   '
    }).revisedAt).toBeUndefined();
    expect(freezeNotebookSnapshot({
      ...preview,
      correction: 'A previous sentence.'
    }, '2026-09-12T12:00:00.000Z', {
      revisedAt: '2026-09-13T15:00:00.000Z',
      correction: '  '
    }).correction).toBeUndefined();
  });

  it('collects article ids for a single source lookup', () => {
    expect(collectArticleIds(essay())).toEqual([ARTICLE]);
  });

  it('marks a published share stale only when the live preview moved', () => {
    const preview = projectPublicNotebook(essay(), 'Athan');
    const hash = hashPublicNotebook(preview);
    const fresh = notebookShareState({
      slug: 'abc',
      contentHash: hash,
      snapshot: freezeNotebookSnapshot(preview, '2026-09-12T12:00:00.000Z')
    }, { preview, currentHash: hash });
    expect(fresh.shared).toBe(true);
    expect(fresh.stale).toBe(false);

    const moved = projectPublicNotebook(essay({
      blocks: [{ id: 'p1', type: 'paragraph', text: 'Rewritten privately.' }]
    }), 'Athan');
    const stale = notebookShareState({
      slug: 'abc',
      contentHash: hash,
      snapshot: preview
    }, { preview: moved, currentHash: hashPublicNotebook(moved) });
    expect(stale.stale).toBe(true);
  });

  it('resolves owner name and article URLs for a live preview', async () => {
    const Article = {
      find: (query) => ({
        select() {
          return {
            lean: async () => {
              expect(query.userId).toBe(USER);
              expect(query._id.$in).toEqual([ARTICLE]);
              return [{ _id: ARTICLE, url: 'https://example.com/letter', title: 'A letter on time' }];
            }
          };
        }
      })
    };
    const User = {
      findById: () => ({
        select() {
          return { lean: async () => ({ displayName: 'Athan' }) };
        }
      })
    };
    const live = await liveNotebookPreview({ Article, User, entry: essay(), userId: USER });
    expect(live.ownerDisplayName).toBe('Athan');
    expect(live.publishable).toBe(true);
    expect(live.preview.blocks[1].source.href).toBe('https://example.com/letter');
    expect(live.currentHash).toBe(hashPublicNotebook(live.preview));
  });
});
