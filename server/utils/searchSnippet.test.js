const assert = require('assert');
const { snippetAroundQuery, highlightFieldMatch } = require('./searchSnippet');

const run = () => {
  const opening = 'Opening inventory. '.repeat(40);
  const later = 'Patience is not the same as avoidance.';
  const snippet = snippetAroundQuery(`${opening}${later}`, 'patience avoidance');

  assert.ok(snippet.toLowerCase().includes('patience'), 'Library search should open on the matching line.');
  assert.ok(!snippet.startsWith('Opening inventory.'), 'A match past the opening should not return only the leading slice.');

  assert.strictEqual(
    snippetAroundQuery('A short letter about Nomad.', 'Nomad').toLowerCase().includes('nomad'),
    true
  );
  assert.ok(
    snippetAroundQuery('<p>Front matter.</p>'.repeat(30) + '<p>Who bears the downside?</p>', 'bears downside')
      .toLowerCase()
      .includes('downside'),
    'HTML articles should match on visible words, not tags.'
  );
  assert.strictEqual(snippetAroundQuery('', 'Nomad'), '');

  const highlightMatch = highlightFieldMatch(
    'Find an example that separates patience from avoidance.'
  );
  const textClauses = highlightMatch.$or.filter((clause) => clause['highlights.text']);
  assert.ok(
    textClauses.some((clause) => clause['highlights.text'].test('Patience is not the same as avoidance.')),
    'A highlight should match on its own words, not the joined brief.'
  );
  assert.ok(
    !textClauses.some((clause) => String(clause['highlights.text']) === String(/find example separates patience avoidance/i)),
    'Highlight retrieval must not require the whole token dump as one substring.'
  );
};

if (require.main === module) {
  try {
    run();
    console.log('search snippet tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
