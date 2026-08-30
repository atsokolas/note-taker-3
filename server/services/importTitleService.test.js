const {
  deriveImportedTitle,
  firstHeading,
  isFragmentTitle
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

  test('falls back to a domain and date instead of a bad fragment', () => {
    expect(deriveImportedTitle({
      metadataTitle: 'work',
      url: 'https://example.com/notes/1',
      publishedAt: '2026-08-29T12:00:00.000Z'
    })).toBe('Example · 2026-08-29');
  });
});
