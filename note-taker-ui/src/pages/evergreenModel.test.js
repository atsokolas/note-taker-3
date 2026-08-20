import {
  buildEvergreenIndex,
  evergreenHref,
  evergreenToggleLabel,
  EVERGREEN_KIND_LABEL
} from './evergreenModel';

describe('buildEvergreenIndex', () => {
  const articles = [
    { _id: 'a1', title: 'The Bitter Lesson', siteName: 'incompleteideas.net', url: 'https://x/1', evergreen: true, evergreenAt: '2026-01-05T00:00:00.000Z' },
    { _id: 'a2', title: 'Something I merely saved', evergreen: false }
  ];
  const pages = [
    { _id: 'p1', title: 'Reflexivity', evergreen: true, evergreenAt: '2026-08-01T00:00:00.000Z' },
    { _id: 'p2', title: 'Compute', evergreen: true, evergreenAt: '2026-04-01T00:00:00.000Z', judgment: { currentJudgment: 'Compute stays scarce.' } },
    { _id: 'p3', title: 'Not kept', evergreen: false }
  ];

  it('gathers only what was kept, across all three kinds', () => {
    const index = buildEvergreenIndex({ articles, pages });
    expect(index.map(entry => entry.kind)).toEqual(['page', 'judgment', 'source']);
    expect(index.map(entry => entry.targetId)).toEqual(['p1', 'p2', 'a1']);
  });

  it('reads a judgment by its claim, not by its page title', () => {
    const index = buildEvergreenIndex({ articles: [], pages });
    const judgment = index.find(entry => entry.kind === 'judgment');
    expect(judgment.title).toBe('Compute stays scarce.');
    expect(judgment.detail).toBe('Compute');
  });

  it('orders by when you decided to keep it, not when you last touched it', () => {
    const index = buildEvergreenIndex({
      articles: [{ _id: 'old', title: 'Kept long ago', evergreen: true, evergreenAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z' }],
      pages: [{ _id: 'new', title: 'Kept recently', evergreen: true, evergreenAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }]
    });
    expect(index.map(entry => entry.targetId)).toEqual(['new', 'old']);
  });

  it('survives an empty shelf', () => {
    expect(buildEvergreenIndex({})).toEqual([]);
    expect(buildEvergreenIndex()).toEqual([]);
  });
});

describe('evergreenHref', () => {
  it('sends each kind back to the room it lives in', () => {
    expect(evergreenHref({ kind: 'source', targetId: 'a1' })).toBe('/library?article=a1');
    expect(evergreenHref({ kind: 'judgment', targetId: 'p2' })).toBe('/judgment/p2');
    expect(evergreenHref({ kind: 'page', targetId: 'p1' })).toBe('/wiki/p1');
  });
});

describe('the control', () => {
  it('says what pressing it will do', () => {
    expect(evergreenToggleLabel(false)).toBe('Keep this');
    expect(evergreenToggleLabel(true)).toBe('Kept');
  });

  it('names the three kinds in the reader’s language, not the schema’s', () => {
    expect(EVERGREEN_KIND_LABEL.source).toBe('Something you read');
    expect(EVERGREEN_KIND_LABEL.judgment).toBe('A belief you hold');
  });
});
