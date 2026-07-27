const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildResearchEditionLibraryNote,
  ensureResearchEditionLibraryItems
} = require('./researchEditionLibraryService');

const items = () => [{
  title: 'A consequential paper',
  url: 'https://arxiv.org/abs/2607.00001',
  publishedAt: '2026-07-24T10:00:00.000Z',
  sourceLabel: 'arXiv:2607.00001',
  whyItMatters: 'The paper reports a bounded finding.',
  technicalApproach: 'It instruments the system at tile granularity.',
  evidenceAssessment: 'The evaluation covers two workloads.',
  consequence: 'It changes how the bottleneck should be measured.',
  boundary: 'It does not test multi-node deployments.'
}];

test('buildResearchEditionLibraryNote keeps the source note wiki-oriented', () => {
  const note = buildResearchEditionLibraryNote(items()[0], { publicationTitle: 'This Week in AI — Issue 002' });
  assert.match(note, /Finding:/);
  assert.match(note, /How it works:/);
  assert.match(note, /Evidence:/);
  assert.match(note, /Limitations:/);
  assert.doesNotMatch(note, /Governing question|Current judgment|Decision posture/);
});

test('ensureResearchEditionLibraryItems reuses existing articles and creates missing sources', async () => {
  const created = [];
  const input = [
    ...items(),
    { ...items()[0], title: 'Second paper', url: 'https://arxiv.org/abs/2607.00002' }
  ];
  const Article = {
    findOne: async ({ url }) => url.endsWith('00001') ? { _id: 'article-existing' } : null,
    create: async value => {
      const article = { _id: 'article-created', ...value };
      created.push(article);
      return article;
    }
  };
  const resolved = await ensureResearchEditionLibraryItems({
    Article,
    userId: 'owner-1',
    items: input,
    publicationTitle: 'This Week in AI — Issue 002'
  });

  assert.deepEqual(resolved.map(item => item.libraryArticleId), ['article-existing', 'article-created']);
  assert.equal(created.length, 1);
  assert.equal(created[0].importMeta.provider, 'this_week_in_ai');
  assert.equal(created[0].importMeta.sourceLabel, 'This Week in AI — Issue 002');
});
