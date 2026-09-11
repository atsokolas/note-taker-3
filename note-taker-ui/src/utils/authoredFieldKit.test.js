import { fieldKitChanges, fieldKitDocument, readFieldKit } from './authoredFieldKit';

const record = { revision: 3, draft: { title: 'A thought', writing: 'My own words' }, saved: { id: 'work', pageId: 'page', claimId: 'claim', draft: {}, origin: { claimText: 'A recorded sentence' } } };
const kit = { format: 'noeis-field-kit-1', owner: 'owner', id: 'work', revision: 2, fields: { writing: 'Offline words', selectedSource: { passage: 'Cannot overwrite a source' } } };
const read = value => readFieldKit(JSON.stringify(value), { owner: 'owner', record });

it('imports only ordinary writing and retains the base revision for conflict resolution', () => {
  expect(read(kit)).toEqual({ revision: 2, fields: { title: '', writing: 'Offline words', question: '', returnNote: '' } });
});
it.each([{ owner: 'someone' }, { id: 'elsewhere' }, { revision: 4 }, { revision: 0 }, { revision: '2' }, { format: 'other' }])('rejects incompatible identity or revision %j', change => {
  expect(() => read({ ...kit, ...change })).toThrow();
});
it('rejects oversized or non-text writing', () => {
  expect(() => fieldKitChanges({ writing: 'x'.repeat(20001) })).toThrow();
  expect(() => fieldKitChanges({ title: {} })).toThrow();
  expect(() => readFieldKit('x'.repeat(150001), { owner: 'owner', record })).toThrow();
});
it('embeds inert JSON, exactly the selected excerpts, and no account token or experiment payload', () => {
  const unsafe = '</script><script>window.stolen=true</script>';
  const html = fieldKitDocument({ owner: 'owner', record: { ...record, draft: { ...record.draft, writing: unsafe, instrument: { privateExtra: 'not selected for export' } } } });
  expect(html).not.toContain(unsafe);
  expect(html).not.toContain('privateExtra');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const data = JSON.parse(parsed.querySelector('#work').textContent);
  expect(data.fields.writing).toBe(unsafe);
  expect(data.sources).toEqual([{ title: 'Original passage', passage: 'A recorded sentence' }]);
  expect(parsed.querySelectorAll('script[src],link,img,iframe')).toHaveLength(0);
  expect(data.href).toContain('/wiki/read/page?claimId=claim');
});
