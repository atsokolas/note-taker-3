const {
  NAMED_LIBRARY_FRAGMENT_EXAMPLES,
  deriveImportedTitle,
  firstHeading,
  isFragmentTitle,
  planArticleTitleRepair
} = require('./importTitleService');

describe('importTitleService', () => {
  test('keeps clean explicit metadata ahead of derived alternatives', () => {
    expect(deriveImportedTitle({
      metadataTitle: 'A durable title',
      content: '# A different heading'
    })).toBe('A durable title');
  });

  test('rejects generic and lowercase fragments', () => {
    expect(isFragmentTitle('work')).toBe(true);
    expect(isFragmentTitle('write code. He was a bodyguard.')).toBe(true);
    expect(isFragmentTitle('inception remain the same. What has changed is the world around us.')).toBe(true);
  });

  test('repairs the three observed Library rows in spec order', () => {
    NAMED_LIBRARY_FRAGMENT_EXAMPLES.forEach(example => {
      expect(isFragmentTitle(example.before)).toBe(true);
      expect(deriveImportedTitle({
        metadataTitle: example.before,
        author: example.author,
        url: example.url,
        sourceType: example.sourceType,
        content: example.content,
        publishedAt: example.publishedAt
      })).toBe(example.after);
      expect(isFragmentTitle(example.after)).toBe(false);
    });
  });

  test('plans a backfill for named offenders and leaves a real title alone', () => {
    const named = NAMED_LIBRARY_FRAGMENT_EXAMPLES.map((example, index) => (
      planArticleTitleRepair({
        _id: `frag-${index}`,
        userId: 'user-1',
        title: example.before,
        author: example.author,
        url: example.url,
        content: example.content,
        importMeta: { sourceType: example.sourceType },
        publicationDate: example.publishedAt
      })
    ));
    expect(named).toEqual(NAMED_LIBRARY_FRAGMENT_EXAMPLES.map((example, index) => ({
      id: `frag-${index}`,
      userId: 'user-1',
      before: example.before,
      after: example.after
    })));
    expect(planArticleTitleRepair({
      _id: 'kept',
      title: 'Fooled by Randomness',
      url: 'https://example.com/fooled'
    })).toBeNull();
  });

  test('repairs recoverable lowercase metadata without replacing its meaning', () => {
    expect(deriveImportedTitle({
      metadataTitle: 'the Endowment Effect',
      content: 'Unrelated fallback body.'
    })).toBe('The Endowment Effect');
    expect(deriveImportedTitle({
      metadataTitle: 'pilot5.ai | Five Independent AI Models',
      content: '# The Architect'
    })).toBe('Pilot5.ai | Five Independent AI Models');
  });

  test('uses the first heading when metadata is a fragment', () => {
    expect(firstHeading('Preface\n# The durable heading\nBody')).toBe('The durable heading');
    expect(deriveImportedTitle({
      metadataTitle: 'work',
      content: '# The durable heading\nBody'
    })).toBe('The durable heading');
  });

  test('names social content with author and its first sentence', () => {
    expect(deriveImportedTitle({
      metadataTitle: 'work',
      author: 'Jeffrey Yan',
      sourceType: 'thread',
      url: 'https://x.com/jeffrey/status/1',
      content: 'Turned down $100 million to keep building. The second sentence stays in the body.'
    })).toBe('Jeffrey Yan — Turned down $100 million to keep building.');
  });

  test('does not promote a generic first word as a social title', () => {
    expect(deriveImportedTitle({
      metadataTitle: 'work',
      author: 'Jeffrey Yan',
      sourceType: 'thread',
      url: 'https://x.com/jeffrey/status/1',
      content: 'work',
      publishedAt: '2026-08-29T12:00:00.000Z'
    })).toBe('X · 2026-08-29');
  });

  test('falls back to a domain and date instead of a bad fragment', () => {
    expect(deriveImportedTitle({
      metadataTitle: 'work',
      url: 'https://example.com/notes/1',
      publishedAt: '2026-08-29T12:00:00.000Z'
    })).toBe('Example · 2026-08-29');
  });

  test('does not invent a title-cased fragment from a lowercase paste', () => {
    expect(deriveImportedTitle({
      metadataTitle: '',
      content: 'write code. He was a bodyguard.',
      sourceType: 'text',
      siteName: 'Pasted text',
      publishedAt: '2026-08-29T12:00:00.000Z'
    })).toBe('Pasted text · 2026-08-29');
  });
});
