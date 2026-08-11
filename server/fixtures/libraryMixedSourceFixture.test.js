const assert = require('assert');
const {
  createLibraryMixedSourceFixture
} = require('./libraryMixedSourceFixture');

const fixture = createLibraryMixedSourceFixture();
assert.strictEqual(fixture.linkedArticle.highlights.length, 1);
assert.strictEqual(fixture.linkedArticle.highlights[0]._id, fixture.ids.highlight);
assert.deepStrictEqual(fixture.concept.pinnedArticleIds, [fixture.ids.article]);
assert.deepStrictEqual(fixture.concept.pinnedHighlightIds, [fixture.ids.highlight]);
assert.deepStrictEqual(fixture.concept.pinnedNoteIds, []);
assert.strictEqual(fixture.notebookEdge.sourceType, 'notebook');
assert.strictEqual(String(fixture.notebookEdge.sourceId), fixture.ids.note);
assert.strictEqual(String(fixture.notebookEdge.targetId), fixture.ids.article);
assert.strictEqual(fixture.note.userId, fixture.ids.user);
assert.strictEqual(fixture.unconnectedArticle.userId, fixture.ids.user);
console.log('library mixed-source fixture tests passed');
