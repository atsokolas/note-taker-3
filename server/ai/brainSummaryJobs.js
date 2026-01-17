const mongoose = require('mongoose');
const { enqueue, registerHandler } = require('./jobQueue');
const { generate } = require('./ollamaClient');

const MAX_HIGHLIGHTS = 120;

const parseDays = (range = '30d') => {
  const match = String(range).match(/^(\d+)\s*d$/i);
  if (!match) return 30;
  const days = Number(match[1]);
  if (Number.isNaN(days)) return 30;
  return days;
};

const extractJson = (text) => {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (error) {
    return null;
  }
};

const buildPrompt = ({ highlights, timeRange }) => {
  const header = [
    'You are a research assistant.',
    `Summarize highlights from the last ${timeRange}.`,
    'Return ONLY valid JSON with this shape:',
    '{ "themes": ["..."], "connections": ["..."], "questions": ["..."] }',
    'Each item should include citations using the highlight id in square brackets, e.g. "Theme text [highlightId]".',
    'Limit: themes<=6, connections<=5, questions<=5.',
    'Highlights:'
  ].join('\n');
  const lines = highlights.map(h => (
    `[${h._id}] (${h.articleTitle || 'Untitled'}) ${h.text || ''}`
  ));
  return `${header}\n${lines.join('\n')}`;
};

const enqueueBrainSummary = ({ userId, timeRange }) => {
  enqueue('brain_summary', { userId, timeRange });
};

const registerBrainSummaryHandler = ({ Article, BrainSummary }) => {
  registerHandler('brain_summary', async ({ userId, timeRange }) => {
    const days = parseDays(timeRange);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const highlights = await Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: cutoff } } },
      { $sort: { 'highlights.createdAt': -1 } },
      { $limit: MAX_HIGHLIGHTS },
      { $project: {
        _id: '$highlights._id',
        text: '$highlights.text',
        articleTitle: '$title'
      } }
    ]);

    const prompt = buildPrompt({ highlights, timeRange });
    const raw = await generate({ prompt });
    const parsed = extractJson(raw) || {};

    const themes = Array.isArray(parsed.themes) ? parsed.themes.slice(0, 6) : [];
    const connections = Array.isArray(parsed.connections) ? parsed.connections.slice(0, 5) : [];
    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 5) : [];
    const sourceHighlightIds = highlights.map(h => h._id);

    await BrainSummary.create({
      timeRange,
      generatedAt: new Date(),
      sourceCount: highlights.length,
      themes,
      connections,
      questions,
      sourceHighlightIds,
      userId
    });
  });
};

module.exports = {
  enqueueBrainSummary,
  registerBrainSummaryHandler,
  parseDays
};
