const { enqueue, registerHandler } = require('./jobQueue');
const { embedText } = require('./embed');
const { upsertVector } = require('./qdrantClient');

const COLLECTIONS = {
  highlights: 'highlights',
  articles: 'articles',
  notebook: 'notebook_entries',
  questions: 'questions'
};

const trimText = (value = '', max = 4000) => {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) : text;
};

const buildNotebookText = (entry) => {
  if (!entry) return '';
  if (Array.isArray(entry.blocks) && entry.blocks.length > 0) {
    return trimText([
      entry.title || '',
      ...entry.blocks.map(block => block.text || '')
    ].filter(Boolean).join('\n'));
  }
  return trimText(`${entry.title || ''}\n${entry.content || ''}`);
};

const buildQuestionText = (question) => {
  if (!question) return '';
  if (Array.isArray(question.blocks) && question.blocks.length > 0) {
    return trimText([
      question.text || '',
      ...question.blocks.map(block => block.text || '')
    ].filter(Boolean).join('\n'));
  }
  return trimText(question.text || '');
};

const buildHighlightText = (highlight) => {
  if (!highlight) return '';
  return trimText([highlight.text, highlight.note].filter(Boolean).join('\n'));
};

const buildArticleText = (article) => (
  trimText([article?.title, article?.content].filter(Boolean).join('\n'))
);

const enqueueEmbedding = ({ collection, id, text, payload }) => {
  enqueue('embedding', { collection, id, text, payload });
};

registerHandler('embedding', async ({ collection, id, text, payload }) => {
  const vector = await embedText(text);
  await upsertVector({ collection, id, vector, payload });
});

const enqueueHighlightEmbedding = ({ highlight, article }) => {
  if (!highlight || !article) return;
  enqueueEmbedding({
    collection: COLLECTIONS.highlights,
    id: String(highlight._id),
    text: buildHighlightText(highlight),
    payload: {
      type: 'highlight',
      objectId: String(highlight._id),
      title: highlight.text || '',
      articleTitle: article.title || '',
      articleId: String(article._id),
      tags: highlight.tags || [],
      createdAt: highlight.createdAt || article.createdAt || new Date().toISOString(),
      userId: String(article.userId)
    }
  });
};

const enqueueArticleEmbedding = (article) => {
  if (!article) return;
  enqueueEmbedding({
    collection: COLLECTIONS.articles,
    id: String(article._id),
    text: buildArticleText(article),
    payload: {
      type: 'article',
      objectId: String(article._id),
      title: article.title || '',
      tags: [],
      createdAt: article.createdAt || new Date().toISOString(),
      userId: String(article.userId)
    }
  });
};

const enqueueNotebookEmbedding = (entry) => {
  if (!entry) return;
  enqueueEmbedding({
    collection: COLLECTIONS.notebook,
    id: String(entry._id),
    text: buildNotebookText(entry),
    payload: {
      type: 'notebook_entry',
      objectId: String(entry._id),
      title: entry.title || '',
      tags: entry.tags || [],
      createdAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
      userId: String(entry.userId)
    }
  });
};

const enqueueQuestionEmbedding = (question) => {
  if (!question) return;
  const tags = [question.conceptName || question.linkedTagName].filter(Boolean);
  enqueueEmbedding({
    collection: COLLECTIONS.questions,
    id: String(question._id),
    text: buildQuestionText(question),
    payload: {
      type: 'question',
      objectId: String(question._id),
      title: question.text || '',
      tags,
      createdAt: question.updatedAt || question.createdAt || new Date().toISOString(),
      userId: String(question.userId)
    }
  });
};

module.exports = {
  COLLECTIONS,
  enqueueHighlightEmbedding,
  enqueueArticleEmbedding,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding
};
