const assert = require('assert');

const {
  serializeWikiPage,
  WIKI_JUDGMENT_INDEX_FIELDS,
  WIKI_PAGE_SUMMARY_FIELDS
} = require('../wikiRoutes');

/**
 * The projection a list of Wiki pages is served through.
 *
 * This exists because both failure modes here are silent. Ask for too much and
 * the list is slow in a way no error reports — 57 seconds and 3.2MB for a
 * hundred pages, which is what the surfaces were doing. Ask for too little and
 * a component reads a field that is no longer there, renders an empty string or
 * a zero, and looks like it simply has nothing to show.
 *
 * So the fields are asserted rather than described. The contract test suite's
 * fake model has a no-op select(), so an end-to-end assertion there would pass
 * whatever the projection said.
 */
const fields = new Set(WIKI_PAGE_SUMMARY_FIELDS);
const has = (field) => fields.has(field);
const asksFor = (prefix) => WIKI_PAGE_SUMMARY_FIELDS.some(field => field.startsWith(prefix));

/* ------------------------------------------------------------------ *
 * What every row renders.
 * ------------------------------------------------------------------ */

['_id', 'slug', 'title', 'pageType', 'status', 'visibility', 'updatedAt', 'createdAt']
  .forEach(field => assert.ok(has(field), `a row renders ${field}`));

assert.ok(has('investmentDossier.version'), 'the Wiki shelf identifies investment dossiers without loading them');
assert.strictEqual(serializeWikiPage({ title: 'Topic' }).wikiKind, 'general');
assert.strictEqual(serializeWikiPage({ title: 'Kept', evergreen: true, evergreenAt: new Date() }).evergreen, true);
assert.strictEqual(serializeWikiPage({ title: 'Loose' }).evergreen, false);
assert.strictEqual(serializeWikiPage({ title: 'Repo', pageType: 'repo' }).wikiKind, 'repository');
assert.strictEqual(serializeWikiPage({ title: 'Dossier', investmentDossier: { version: 1 } }).wikiKind, 'investment');

const stamped = serializeWikiPage({
  title: 'Topic',
  createdAt: new Date('2025-11-01T12:00:00.000Z'),
  claims: [{
    claimId: 'from-history',
    text: 'A held sentence.',
    history: [{ at: new Date('2026-01-15T12:00:00.000Z'), event: 'created' }]
  }]
});
assert.strictEqual(
  new Date(stamped.claims[0].bornAt).toISOString(),
  '2026-01-15T12:00:00.000Z',
  'GET stamps bornAt from history so no surface prints Unknown'
);
assert.ok(!JSON.stringify(stamped).includes('Born: Unknown'));

// The row preview reads summary || scope || description || plainText || body.
// None of the first three exist on the schema and body is too expensive to
// send, so plainText is the only thing standing between a list and rows that
// all read "No body yet."
assert.ok(has('plainText'), 'plainText is the preview source once body is gone');
assert.ok(!has('body'), 'the ProseMirror document is the single largest field and no list renders it');

/* ------------------------------------------------------------------ *
 * Identity, not content.
 * ------------------------------------------------------------------ */

// The knowledge map filters pages by typing a source's name, matching against
// each source's title, url, type and objectId. Dropping these does not break
// the map — it makes the search quietly stop finding things.
['sourceRefs.title', 'sourceRefs.url', 'sourceRefs.type', 'sourceRefs.objectId']
  .forEach(field => assert.ok(has(field), `the knowledge map searches ${field}`));

// The snippet is what made sourceRefs expensive: 6KB per page against 1KB for
// all the identity fields together, up to 6000 characters per source. Nothing
// in a list renders it.
assert.ok(!has('sourceRefs.snippet'), 'source snippets are the cost this projection exists to avoid');
assert.ok(!has('sourceRefs.metadata'), 'source metadata is unbounded and unread by lists');

/* ------------------------------------------------------------------ *
 * Counts come from ids.
 * ------------------------------------------------------------------ */

// Surfaces render "N sources" and "N claims" off array length, which survives
// projecting a single id per element. The claim ledger carries the text,
// history and provenance that make a page 90KB; none of it reaches a list.
assert.ok(has('sourceRefs._id'), 'source counts come from real ids');
assert.ok(has('claims.claimId'), 'claim counts come from real ids');
assert.ok(!asksFor('claims.text'), 'claim text is not read by any list');
assert.ok(!asksFor('claims.history'), 'claim history is the largest part of the claim ledger');
assert.ok(!asksFor('citations.quote'), 'citation quotes are not read by any list');

['judgment.dependsOn.dependencyId', 'judgment.dependsOn.pageId', 'judgment.dependsOn.note', 'judgment.dependsOn.proposedBy']
  .forEach(field => assert.ok(has(field), `the Judgment dependency graph reads ${field}`));

/* ------------------------------------------------------------------ *
 * No accidental whole-subtree requests.
 * ------------------------------------------------------------------ */

// 'aiState' would pull the entire change log; 'aiState.changeLog.text' pulls
// one field of it. The distinction is the whole point, and it is easy to undo
// by "simplifying" a long list into its parents.
['aiState', 'sourceRefs', 'claims', 'citations', 'externalWatches', 'discussions', 'judgment', 'investmentDossier']
  .forEach(parent => assert.ok(
    !has(parent),
    `${parent} must be requested field by field, never as a whole subtree`
  ));

assert.ok(Object.isFrozen(WIKI_PAGE_SUMMARY_FIELDS), 'the projection is shared across requests and must not be mutable');

const judgmentFields = new Set(WIKI_JUDGMENT_INDEX_FIELDS);
['_id', 'title', 'evergreen', 'evergreenAt',
  'judgment.currentJudgment', 'judgment.governingQuestion',
  'judgment.why.text', 'judgment.why.sourceLabel', 'judgment.why.acceptedFrom', 'judgment.why.createdAt',
  'judgment.against.text', 'judgment.against.sourceLabel', 'judgment.against.acceptedFrom', 'judgment.against.createdAt',
  'judgment.falsifiers.text',
  'judgment.decisions.summary', 'judgment.lessons.text',
  'sourceRefs._id', 'sourceRefs.title', 'sourceRefs.url']
  .forEach(field => assert.ok(judgmentFields.has(field), `the Judgment casebook reads ${field}`));
['plainText', 'body', 'sourceRefs', 'claims', 'citations', 'aiState']
  .forEach(field => assert.ok(!judgmentFields.has(field), `the Judgment index never loads ${field}`));
assert.ok(Object.isFrozen(WIKI_JUDGMENT_INDEX_FIELDS), 'the Judgment projection must not be mutable');

console.log('wikiRoutes summary projection tests passed');
