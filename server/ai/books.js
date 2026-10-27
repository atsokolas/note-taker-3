const { chatComplete, parseStructuredText } = require('./hfTextClient');

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

/* Asking the author: each question you typed beside a book, answered only
   from the passages you marked in it. The model sees nothing else of the
   book, so an answer that cites no passage it was given is no answer, and a
   question the passages do not reach gets none. */
const ASK_THE_BOOK = [
  'You are given numbered passages a reader marked in one book, and the questions they wrote beside it.',
  'Answer each question the way the book itself would, arguing only from those passages: no outside knowledge, nothing the passages do not say.',
  'Two or three plain sentences, in your own words, citing the passages you lean on by number.',
  'Leave a question out when the passages do not answer it. Silence is better than a guess.',
  'Return JSON: {"answers":[{"question":1,"answer":"...","passages":[2,5]}]}'
].join(' ');

const ASK_PASSAGES = 400;

const askTheBook = async ({ title = '', questions = [], passages: marked = [], complete = chatComplete } = {}) => {
  const passages = marked.slice(0, ASK_PASSAGES);
  if (!questions.length || !passages.length) return [];
  const completion = await complete({
    maxTokens: 1600,
    temperature: 0.2,
    responseFormat: { type: 'json_object' },
    messages: [
      { role: 'system', content: ASK_THE_BOOK },
      {
        role: 'user',
        content: JSON.stringify({
          book: title,
          passages: passages.map((passage, at) => ({ number: at + 1, page: passage.page || undefined, text: passage.text })),
          questions: questions.map((question, at) => ({ number: at + 1, question: question.note }))
        })
      }
    ]
  });
  const answers = parseStructuredText(completion?.text)?.answers;
  return (Array.isArray(answers) ? answers : []).map((found) => {
    const question = questions[Number(found?.question) - 1];
    const cited = [...new Set(Array.isArray(found?.passages) ? found.passages : [])]
      .map(number => passages[Number(number) - 1]).filter(Boolean);
    const answer = String(found?.answer || '').replace(/\s+/g, ' ').trim();
    return question && answer && cited.length
      ? { questionId: String(question._id), answer, marks: cited.map(passage => ({ _id: String(passage._id), page: passage.page || null })) }
      : null;
  }).filter((found, at, all) => found && all.findIndex(other => other?.questionId === found.questionId) === at);
};

module.exports = { askTheBook, readPage };
