const assert = require('assert');
const {
  extractOpenQuestionsFromBody,
  buildWikiOpenQuestionRows,
  filterWikiOpenQuestions
} = require('./wikiOpenQuestionsService');

describe('wikiOpenQuestionsService', () => {
  const body = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'This is not a question?' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Open Questions' }] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'What would change this conclusion?' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'How does it connect to opportunity cost?' }] }] }
        ]
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'Which source would make the claim falsifiable?' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'The unresolved question is how to size concentrated positions without converting conviction into hidden fragility.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'It remains unclear how much process structure is enough before the process becomes mechanical and slow.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'The next question is which source would make QA Product Test specific enough to maintain as a wiki page.' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'References' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Does not belong?' }] }
    ]
  };

  it('extracts only question text from the Open Questions section', () => {
    assert.deepStrictEqual(extractOpenQuestionsFromBody(body), [
      'What would change this conclusion?',
      'How does it connect to opportunity cost?',
      'Which source would make the claim falsifiable?',
      'The unresolved question is how to size concentrated positions without converting conviction into hidden fragility.',
      'It remains unclear how much process structure is enough before the process becomes mechanical and slow.'
    ]);
  });

  it('accepts generated declarative prompts while preserving the five-question cap', () => {
    const questions = extractOpenQuestionsFromBody(body);
    assert.ok(questions.includes('The unresolved question is how to size concentrated positions without converting conviction into hidden fragility.'));
    assert.ok(questions.includes('It remains unclear how much process structure is enough before the process becomes mechanical and slow.'));
    assert.strictEqual(questions.length, 5);
    assert.ok(!questions.includes('The next question is which source would make QA Product Test specific enough to maintain as a wiki page.'));
  });

  it('builds stable virtual question rows from eligible wiki pages', () => {
    const rows = buildWikiOpenQuestionRows([
      {
        _id: 'wiki-margin',
        title: 'Margin of Safety',
        body,
        updatedAt: '2026-06-29T12:00:00.000Z'
      },
      {
        _id: 'wiki-hidden',
        title: 'Hidden',
        body,
        debugOnly: true
      }
    ]);

    assert.strictEqual(rows.length, 5);
    assert.strictEqual(rows[0]._id, 'wiki-open-question:wiki-margin:0');
    assert.strictEqual(rows[0].sourceType, 'wiki_open_question');
    assert.strictEqual(rows[0].conceptName, 'Margin of Safety');
    assert.strictEqual(rows[0].href, '/wiki/workspace?page=wiki-margin#open-questions');
  });

  it('filters virtual rows by concept or tag only for open status', () => {
    const rows = buildWikiOpenQuestionRows([{ _id: 'wiki-1', title: 'Opportunity Cost', body }]);

    assert.strictEqual(filterWikiOpenQuestions(rows, { conceptName: 'opportunity cost', status: 'open' }).length, 5);
    assert.strictEqual(filterWikiOpenQuestions(rows, { tag: 'margin', status: 'open' }).length, 0);
    assert.strictEqual(filterWikiOpenQuestions(rows, { conceptName: 'opportunity cost', status: 'answered' }).length, 0);
  });
});
