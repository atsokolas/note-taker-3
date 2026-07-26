const assert = require('node:assert/strict');
const { WikiPage } = require('./index');

const indexes = WikiPage.schema.indexes();
const activeDossierIndex = indexes.find(([fields]) => (
  fields.userId === 1 && fields.activeCompanyDossierKey === 1
));

assert.ok(activeDossierIndex, 'WikiPage must define an owner-and-active-dossier identity index.');
assert.equal(activeDossierIndex[1].unique, true);
assert.deepEqual(activeDossierIndex[1].partialFilterExpression, {
  activeCompanyDossierKey: { $type: 'string' },
  archived: false
});

console.log('wikiPage company dossier index tests passed');
