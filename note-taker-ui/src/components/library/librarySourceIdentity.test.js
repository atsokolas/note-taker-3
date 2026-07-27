import {
  appendUniqueSourceRows,
  isSourceAllowed,
  matchesSourceQuery,
  sourceRowKey
} from './librarySourceIdentity';

describe('librarySourceIdentity', () => {
  it('preserves exact type:id:parentId identity', () => {
    expect(sourceRowKey({
      source: { type: 'highlight', id: 'h1', parentId: 'a1' }
    })).toBe('highlight:h1:a1');
    expect(sourceRowKey({
      source: { type: 'note', id: 'n1' }
    })).toBe('note:n1:');
  });

  it('appends pages without duplicating source keys', () => {
    const first = [{ source: { type: 'note', id: 'n1' } }];
    const second = [
      { source: { type: 'note', id: 'n1' } },
      { source: { type: 'article', id: 'a1' } }
    ];
    expect(appendUniqueSourceRows(first, second)).toEqual([
      { source: { type: 'note', id: 'n1' } },
      { source: { type: 'article', id: 'a1' } }
    ]);
  });

  it('matches search across article, highlight, and notebook fields', () => {
    const highlight = {
      source: { type: 'highlight', id: 'h1', title: 'Margin of safety' },
      provenance: { parentTitle: 'Security Analysis', provider: 'readwise' }
    };
    const note = {
      source: { type: 'note', id: 'n1', title: 'Notebook reflection' },
      provenance: { noteType: 'reflection' }
    };
    expect(matchesSourceQuery(highlight, 'security')).toBe(true);
    expect(matchesSourceQuery(note, 'notebook')).toBe(true);
    expect(matchesSourceQuery(note, 'missing')).toBe(false);
  });

  it('keeps notes visible while filtering article/highlight rows by allowed parents', () => {
    const allowed = new Set(['a1']);
    expect(isSourceAllowed({ source: { type: 'note', id: 'n1' } }, allowed)).toBe(true);
    expect(isSourceAllowed({ source: { type: 'article', id: 'a1' } }, allowed)).toBe(true);
    expect(isSourceAllowed({
      source: { type: 'highlight', id: 'h1', parentId: 'a2' }
    }, allowed)).toBe(false);
  });
});
