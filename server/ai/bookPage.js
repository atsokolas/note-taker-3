const { chatComplete } = require('./hfTextClient');

// The printed words of a photographed page, as running text a quote can be found in.
const READ_PAGE = [
  'This is a photograph of a page of a printed book.',
  'Write out its printed text exactly, word for word, as running plain text:',
  'join the lines, mend words hyphenated across a line break,',
  'and leave out running heads, footnote markers and page numbers. Write nothing else.'
].join(' ');

const readPage = async (image) => {
  const completion = await chatComplete({
    maxTokens: 2400,
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: image } }, { type: 'text', text: READ_PAGE }] }]
  });
  return String(completion?.text || '');
};

module.exports = { readPage };
