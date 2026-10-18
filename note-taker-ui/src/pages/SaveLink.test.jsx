import { handedInLink } from './SaveLink';

test('reads the link a Shortcut, a share sheet, or the bookmarklet hands in', () => {
  // A Shortcut writes the link as it is, query string and all.
  expect(handedInLink('?url=https://essays.example/a?b=1&c=2')).toBe('https://essays.example/a?b=1&c=2');
  // The bookmarklet encodes it.
  expect(handedInLink(`?url=${encodeURIComponent('https://essays.example/a?b=1&c=2')}&title=A`)).toBe('https://essays.example/a?b=1&c=2');
  // Some share sheets send only text with the link inside it.
  expect(handedInLink(`?title=A&text=${encodeURIComponent('Worth it https://essays.example/b')}`)).toBe('https://essays.example/b');
  expect(handedInLink('')).toBe('');
});
