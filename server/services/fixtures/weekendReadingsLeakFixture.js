const privateSentinel = 'PRIVATE-THESIS-SENTINEL-DO-NOT-PUBLISH';

const weekendReadingsLeakFixture = () => ({
  _id: 'page-private-1',
  title: 'Weekend Readings — 2026-07-19 — Edition 1',
  slug: 'weekend-readings-2026-07-19',
  pageType: 'log',
  status: 'draft',
  visibility: 'private',
  createdFrom: { type: 'sources', label: 'weekend-readings:2026-07-06:2026-07-19' },
  body: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Athan Tsokolas — researched and maintained with Noeis' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Reading window: 2026-07-06 through 2026-07-19' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Editorial note' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Qualification durability is the public-safe pressure in this edition.' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Selected readings' }] }
    ]
  },
  sourceRefs: [{
    type: 'external',
    title: 'Primary filing',
    url: 'https://example.com/filing',
    snippet: 'It tests the public demand premise.',
    citationLabel: 'Example filing',
    provider: 'Example filing',
    metadata: {
      weekendReadings: {
        canonicalUrl: 'https://example.com/filing',
        sourceDateLabel: '2026-07-18',
        sourceQuality: 'primary',
        readingRole: 'thesis_evidence',
        whyItMatters: 'It tests the public demand premise.',
        publicRelationship: 'Whether qualification cycles create durable switching costs.',
        boundary: '',
        affectedQuestion: privateSentinel,
        affectedClaimIds: [`${privateSentinel}-claim`],
        affectedUnknownIds: [`${privateSentinel}-unknown`],
        affectedFalsifierIds: [`${privateSentinel}-falsifier`],
        thesisConnectionDisposition: 'unreviewed',
        activeThesisPageId: `${privateSentinel}-page`
      }
    }
  }],
  claims: [{ claimId: 'private-claim', text: privateSentinel }],
  discussions: [{ body: privateSentinel }],
  aiState: { maintenanceSummary: privateSentinel, changeLog: [{ text: privateSentinel }] }
});

module.exports = { privateSentinel, weekendReadingsLeakFixture };
