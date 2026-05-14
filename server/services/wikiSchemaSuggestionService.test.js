const assert = require('assert');

const {
  suggestWikiSchemaUpdates
} = require('./wikiSchemaSuggestionService');

const run = async () => {
  const result = suggestWikiSchemaUpdates({
    currentSchema: '## Page types I want\n- topic: default research page',
    sourceEvents: [
      {
        sourceType: 'external',
        provider: 'url',
        title: 'Imported field report',
        status: 'processed',
        affectedPageIds: ['page-1', 'page-2'],
        createdAt: new Date('2026-05-12T10:00:00.000Z')
      },
      {
        sourceType: 'notebook',
        provider: 'notion',
        title: 'Notion strategy note',
        status: 'processed',
        affectedPageIds: ['page-2'],
        createdAt: new Date('2026-05-12T11:00:00.000Z')
      }
    ],
    maintenanceRuns: [
      {
        status: 'completed',
        summary: 'Merged new evidence and flagged contradictions.',
        metadata: { sourceType: 'external' },
        createdAt: new Date('2026-05-12T12:00:00.000Z')
      }
    ],
    pages: [
      {
        title: 'AI Memory',
        pageType: 'topic',
        aiState: {
          health: {
            unsupportedClaims: [{ text: 'Needs evaluation examples.' }],
            contradictions: [{ text: 'Memory creates review debt.' }],
            relatedPages: [{ title: 'Source Triage' }]
          }
        },
        updatedAt: new Date('2026-05-12T13:00:00.000Z')
      },
      {
        title: 'Source Triage',
        pageType: 'source',
        aiState: {
          health: {
            unsupportedClaims: [],
            contradictions: [],
            relatedPages: []
          }
        },
        updatedAt: new Date('2026-05-12T14:00:00.000Z')
      }
    ],
    now: new Date('2026-05-13T15:00:00.000Z')
  });

  assert.strictEqual(result.suggestions.length >= 3, true);
  assert.ok(result.proposedPatch.includes('## Suggested schema updates'));
  assert.ok(result.proposedPatch.includes('URL/external'));
  assert.ok(result.proposedPatch.includes('Contradiction handling'));
  assert.ok(result.context.recentSourceEventCount === 2);
  assert.ok(result.context.unsupportedClaimCount === 1);
  assert.ok(result.summary.includes('schema update suggestion'));
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('wikiSchemaSuggestionService tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
