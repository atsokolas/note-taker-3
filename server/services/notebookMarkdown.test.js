const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNotebookMarkdown } = require('./notebookMarkdown');

test('exports a finished essay with source links and distinguishable quotation', () => {
  const markdown = buildNotebookMarkdown({
    title: 'Who gets to experiment, and who pays?',
    blocks: [
      {
        id: 'rule',
        type: 'paragraph',
        text: 'Recoverable mistakes belong to the person who can still put things back.'
      },
      {
        id: 'exception',
        type: 'paragraph',
        text: 'The exception is when the downside lands on someone who never chose the experiment.'
      },
      {
        id: 'quote',
        type: 'quote',
        text: 'The cost is borne by people who did not volunteer.',
        articleId: 'article-1',
        articleTitle: 'A beautiful source',
        sourcePath: '/library?articleId=article-1#passage=exact'
      },
      {
        id: 'close',
        type: 'paragraph',
        text: 'Who gets to experiment, and who pays?'
      }
    ],
    asidePieces: [{
      id: 'held',
      label: 'A discarded draft opening',
      blocks: [{ id: 'held-1', type: 'paragraph', text: 'This must not leave the workshop.' }]
    }]
  });

  assert.match(markdown, /^# Who gets to experiment, and who pays\?\n/);
  assert.match(markdown, /Recoverable mistakes belong to the person who can still put things back\./);
  assert.match(markdown, /^> The cost is borne by people who did not volunteer\.$/m);
  assert.match(markdown, /> — \[A beautiful source\]\(\/library\?articleId=article-1#passage=exact\)/);
  assert.equal(markdown.includes('This must not leave the workshop.'), false);
});

test('uses the heading’s actual opening line', () => {
  const markdown = buildNotebookMarkdown({
    title: 'Letter',
    blocks: [{ id: 'h1', type: 'heading', level: 2, text: 'The exception comes first.' }]
  });
  assert.match(markdown, /^## The exception comes first\.\n/m);
});
