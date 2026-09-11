const { searchAuthoredWork } = require('./authoredWorkDiscovery');
const model = rows => ({ find: jest.fn(() => ({
  sort() { return this; }, limit() { return this; }, select() { return this; },
  maxTimeMS() { return this; }, lean: async () => rows
})) });
const setup = ({ notes = [], work = [], pages = [], articles = [] } = {}) => ({
  NotebookEntry: model(notes), AuthoredExploration: model(work), WikiPage: model(pages), Article: model(articles), userId: 'owner'
});

describe('explicit writing discovery', () => {
  it('matches literal words, supplies their exact excerpt, and keeps the query owner-scoped', async () => {
    const args = setup({notes:[{_id:'note-1',title:'A calculation',blocks:[{text:'The answer starts with [a+b], not a guess.'}]}]});
    const found = await searchAuthoredWork({...args,query:'[a+b]'});
    expect(found.results).toHaveLength(1);
    const match = found.results[0];
    expect(match.excerpt.slice(match.matchStart,match.matchStart+match.matchLength)).toBe('[a+b]');
    expect(args.NotebookEntry.find).toHaveBeenCalledWith(expect.objectContaining({userId:'owner',archived:{$ne:true},debugOnly:{$ne:true},hiddenFromHome:{$ne:true}}));
    const filter = args.AuthoredExploration.find.mock.calls[0][0];
    expect(filter.userId).toBe('owner');
    expect(Object.keys(filter.$or[0])).toEqual(['draft.title']);
    expect(JSON.stringify(filter)).not.toMatch(/selectedSource|against|keeps|mutations/);
  });
  it('finds a private question but excludes unchanged source wording and inaccessible origins', async () => {
    const args = setup({work:[
      {_id:'question',pageId:'page',claimId:'claim',draft:{question:'What leaves room to return?'}},
      {_id:'source-only',pageId:'page',claimId:'claim',draft:{title:'Other',originalText:'room to return',provisionalText:'room to return',selectedSource:{passage:'room to return'}}},
      {_id:'gone',pageId:'missing',claimId:'claim',draft:{writing:'room to return'}},
      {_id:'highlight-gone',articleId:'article',highlightId:'missing',draft:{writing:'room to return'}}
    ],pages:[{_id:'page',title:'A source'}],articles:[{_id:'article',title:'Another source',highlights:[]}]});
    const found = await searchAuthoredWork({...args,query:'room to return'});
    expect(found.results.map(row=>row.id)).toEqual(['question', 'highlight-gone']);
    expect(found.results[1]).toMatchObject({ articleId: 'article', highlightId: 'missing', originMissing: true });
    expect(found.results[0]).toMatchObject({label:'Question',pageId:'page',claimId:'claim'});
    expect(JSON.stringify(found)).not.toMatch(/originalText|selectedSource|provisionalText/);
  });
  it('reads legacy visible note text and centers the excerpt around a distant match', async () => {
    const found = await searchAuthoredWork({...setup({notes:[{_id:'legacy',title:'Untitled',content:`<p>${'Earlier words. '.repeat(35)}Patience &amp; <em>care</em> can coexist.</p>`}]}),query:'patience & care'});
    expect(found.results).toHaveLength(1);
    expect(found.results[0].excerpt).toContain('Patience & care');
    expect(found.results[0].excerpt.startsWith('…')).toBe(true);
    expect(found.results[0].excerpt.length).toBeLessThanOrEqual(282);
  });
  it('bounds results and reports truncation without presenting a false total', async () => {
    const notes = Array.from({length:50},(_,index)=>({_id:`note-${index}`,title:'Remember this',updatedAt:new Date(2026,0,index+1)}));
    const found = await searchAuthoredWork({...setup({notes}),query:'remember'});
    expect(found.results).toHaveLength(20);
    expect(found.results[0].id).toBe('note-49');
    expect(found.limited).toBe(true);
  });
  it('does not query for empty, one-character or oversized input', async () => {
    const args = setup();
    for (const query of ['', ' ', 'x', 'x'.repeat(161)]) await expect(searchAuthoredWork({...args,query})).rejects.toMatchObject({status:400});
    expect(args.NotebookEntry.find).not.toHaveBeenCalled();
    expect(args.AuthoredExploration.find).not.toHaveBeenCalled();
  });
  it('does not fill results with blank notes whose only match is a placeholder title', async () => {
    const found = await searchAuthoredWork({...setup({notes:[
      {_id:'empty',title:'Untitled',blocks:[]},
      {_id:'written',title:'Untitled',blocks:[{text:'An untitled thought can still matter.'}]}
    ]}),query:'untitled'});
    expect(found.results.map(row=>row.id)).toEqual(['written']);
  });
});
