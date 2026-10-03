const assert = require('assert');

const {
  hydrateOwnedSourceRefs,
  serializeWikiPage
} = require('../wikiRoutes');

const claimMark = (claimId, citationIndexes) => ({
  type: 'text',
  text: `Claim ${claimId}.`,
  marks: [{ type: 'claim', attrs: { claimId, support: 'supported', citationIndexes } }]
});

const paragraph = (content) => ({ type: 'paragraph', content: Array.isArray(content) ? content : [content] });

const coreweavePage = ({ extraSources = [], extraClaims = [] } = {}) => ({
  title: 'CoreWeave',
  plainText: 'CoreWeave is a GPU cloud company that sells time-to-capacity and cluster operations.',
  investmentDossier: { version: 1 },
  externalWatches: {
    edgar: {
      ticker: 'CRWV',
      cik: '1769628',
      companyName: 'CoreWeave, Inc.',
      status: 'active'
    }
  },
  body: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Current Judgment' }] },
      paragraph(claimMark('crwv-judgment-control-point', [1, 2, 4])),
      paragraph(claimMark('crwv-judgment-capital-loop', [1, 2])),
      paragraph(claimMark('crwv-judgment-security', [1, 2, 3])),
      paragraph(claimMark('crwv-expectations-snapshot', [3])),
      paragraph(claimMark('crwv-question-contract-cash', [1])),
      paragraph(claimMark('crwv-question-scarcity', [1, 4])),
      paragraph(claimMark('crwv-moat-execution', [4, 5]))
    ]
  },
  sourceRefs: [
    {
      _id: 'src-10q',
      type: 'external',
      title: 'CRWV 10-Q filed 2026-05-08',
      url: 'https://www.sec.gov/Archives/edgar/data/1769628/000176962826000123/crwv-20250331.htm',
      provider: 'sec-edgar',
      metadata: { source: 'sec-edgar', ticker: 'CRWV', form: '10-Q' },
      citationLabel: '[1]'
    },
    {
      _id: 'src-10k',
      type: 'external',
      title: 'CRWV 10-K filed 2026-02-27',
      url: 'https://www.sec.gov/Archives/edgar/data/1769628/000176962826000010/crwv-20251231.htm',
      provider: 'sec-edgar',
      metadata: { source: 'sec-edgar', ticker: 'CRWV', form: '10-K' },
      citationLabel: '[2]'
    },
    {
      _id: 'src-nasdaq',
      type: 'external',
      title: 'CRWV Nasdaq last close',
      url: 'https://www.nasdaq.com/market-activity/stocks/crwv',
      citationLabel: '[3]'
    },
    {
      _id: 'src-ops',
      type: 'article',
      objectId: 'article-ops',
      title: 'CoreWeave cluster operations',
      snippet: 'CoreWeave assembles GPU clusters faster than customers can internally.',
      citationLabel: '[4]'
    },
    {
      _id: 'src-cks',
      type: 'article',
      objectId: 'article-cks',
      title: 'CoreWeave Kubernetes Service',
      snippet: 'CoreWeave Kubernetes Service is the operational fabric of the fleet.',
      citationLabel: '[5]'
    },
    {
      _id: 'src-flounder',
      type: 'article',
      title: 'Flounder Mode',
      snippet: 'Founders discuss shipping cadence and startup tactics.',
      citationLabel: '[6]'
    },
    {
      _id: 'src-fed',
      type: 'article',
      title: 'Fed cuts US interest rates again despite flying blind',
      snippet: 'The market moved after a central bank decision and delayed official data.',
      citationLabel: '[7]'
    },
    ...extraSources
  ],
  claims: [
    {
      claimId: 'crwv-judgment-control-point',
      text: 'CoreWeave is a time-to-capacity business.',
      support: 'partial',
      citationIndexes: [1, 2, 4],
      sourceRefIds: ['src-10q', 'src-10k', 'src-ops']
    },
    {
      claimId: 'crwv-judgment-capital-loop',
      text: 'The investment is a leveraged conversion loop.',
      support: 'partial',
      citationIndexes: [1, 2],
      sourceRefIds: ['src-10q', 'src-10k']
    },
    {
      claimId: 'crwv-judgment-security',
      text: 'The security is not a trailing free-cash-flow multiple.',
      support: 'partial',
      citationIndexes: [1, 2, 3],
      sourceRefIds: ['src-10q', 'src-10k', 'src-nasdaq']
    },
    {
      claimId: 'crwv-expectations-snapshot',
      text: 'The dated market boundary is the July snapshot.',
      support: 'supported',
      citationIndexes: [3],
      sourceRefIds: ['src-nasdaq']
    },
    {
      claimId: 'crwv-question-contract-cash',
      text: 'Does contracted revenue produce cash before the debt matures?',
      support: 'partial',
      citationIndexes: [1],
      sourceRefIds: ['src-10q']
    },
    {
      claimId: 'crwv-question-scarcity',
      text: 'How long does scarcity persist at each accelerator generation?',
      support: 'partial',
      citationIndexes: [1, 4],
      sourceRefIds: ['src-10q', 'src-ops']
    },
    {
      claimId: 'crwv-moat-execution',
      text: 'The moat lives in execution rather than the component list.',
      support: 'partial',
      citationIndexes: [4, 5],
      sourceRefIds: ['src-ops', 'src-cks']
    },
    ...extraClaims
  ],
  judgment: {
    kind: 'thesis',
    currentJudgment: 'CoreWeave is a conversion loop, not a proprietary accelerator company.',
    why: [{
      reasonId: 'why-10q',
      text: 'Q1 2026 shows the loop scaling but not yet self-funding.',
      sourceRefIds: ['src-10q']
    }]
  }
});

const titles = (page) => (page.sourceRefs || []).map(source => source.title);
const claimIndexes = (page, claimId) => (
  page.claims.find(claim => claim.claimId === claimId)?.citationIndexes
);
const bodyIndexes = (page) => (
  page.body.content[1].content[0].marks[0].attrs.citationIndexes
);

{
  const serialized = serializeWikiPage(coreweavePage());
  const kept = titles(serialized);
  assert.ok(kept.includes('CRWV 10-Q filed 2026-05-08'), `ticker 10-Q must survive read hygiene, got ${kept.join(' | ')}`);
  assert.ok(kept.includes('CRWV 10-K filed 2026-02-27'), 'ticker 10-K must survive read hygiene');
  assert.ok(kept.includes('CRWV Nasdaq last close'), 'ticker market snapshot must survive read hygiene');
  assert.ok(kept.includes('CoreWeave cluster operations'), 'on-topic CoreWeave sources stay');
  assert.ok(!kept.includes('Flounder Mode'), 'uncited off-topic sources still drop');
  assert.ok(!kept.some(title => /Fed cuts/i.test(title)), 'unrelated macro sources still drop');
  assert.deepStrictEqual(claimIndexes(serialized, 'crwv-judgment-control-point'), [1, 2, 4]);
  assert.deepStrictEqual(bodyIndexes(serialized), [1, 2, 4]);
  assert.strictEqual(serialized.claims.length, 7);
  assert.deepStrictEqual(serialized.judgment.why[0].sourceRefIds, ['src-10q']);
}

{
  const serialized = serializeWikiPage(coreweavePage());
  const tenQ = serialized.sourceRefs.find(source => source.title === 'CRWV 10-Q filed 2026-05-08');
  assert.ok(tenQ, 'citation [1] remains the 10-Q');
  assert.strictEqual(tenQ.citationLabel, '[1]');
  assert.match(tenQ.url, /sec\.gov/);
}

(async () => {
  const filingUrl = 'https://www.sec.gov/Archives/edgar/data/1769628/000176962826000123/crwv-20250331.htm';
  const Article = {
    find: ({ userId, url }) => ({
      select() { return this; },
      async lean() {
        assert.strictEqual(userId, 'user-1');
        const wanted = new Set(url.$in);
        return wanted.has(filingUrl) ? [{ _id: 'library-10q', url: filingUrl }] : [];
      }
    })
  };
  const hydrated = await hydrateOwnedSourceRefs({ page: coreweavePage(), Article, userId: 'user-1' });
  const tenQ = hydrated.sourceRefs.find(source => source.title === 'CRWV 10-Q filed 2026-05-08');
  assert.strictEqual(tenQ.type, 'article');
  assert.strictEqual(String(tenQ.objectId), 'library-10q');
  assert.strictEqual(tenQ.metadata.articleId, 'library-10q');
  assert.match(tenQ.url, /sec\.gov/, 'the filing URL stays for Open original');
  const serialized = serializeWikiPage(hydrated);
  const serializedTenQ = serialized.sourceRefs.find(source => source.title === 'CRWV 10-Q filed 2026-05-08');
  assert.strictEqual(serializedTenQ.type, 'article');
  assert.strictEqual(String(serializedTenQ.objectId), 'library-10q');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
