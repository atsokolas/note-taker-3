const { generate } = require('./ollamaClient');

const isGenerationEnabled = () =>
  String(process.env.AI_GENERATION_ENABLED || 'false').toLowerCase() === 'true';

const buildEvidenceBlock = (highlights = []) =>
  highlights
    .map((item) => {
      const title = item.articleTitle ? ` (${item.articleTitle})` : '';
      return `- ${item.id}${title}: ${item.text}`;
    })
    .join('\n');

const buildPrompt = ({ highlights = [], themes = [], connections = [], questions = [] }) => {
  const themeLines = themes.slice(0, 6).map((theme) => `- ${theme.title}`).join('\n');
  const connectionLines = connections.slice(0, 6).map((conn) => `- ${conn.description}`).join('\n');
  const questionLines = questions.slice(0, 8).map((q) => `- ${q}`).join('\n');

  return [
    'You are drafting insights grounded ONLY in the evidence below.',
    'Return strict JSON with keys: insights, blindSpots, nextQuestions.',
    'Each value is an array of objects: { "text": string, "evidence": [highlightIds...] }.',
    'Do not invent citations. Use highlight IDs from the evidence list.',
    '',
    'Evidence highlights:',
    buildEvidenceBlock(highlights),
    '',
    'Themes:',
    themeLines || '- none',
    '',
    'Connections:',
    connectionLines || '- none',
    '',
    'Open questions:',
    questionLines || '- none'
  ].join('\n');
};

const safeJsonParse = (value = '') => {
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
};

const mapEvidence = (items, highlightMap) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((id) => highlightMap.get(String(id)))
    .filter(Boolean);
};

const generateDraftInsights = async ({ highlights, themes, connections, questions }) => {
  if (!highlights || highlights.length === 0) {
    return null;
  }
  const prompt = buildPrompt({ highlights, themes, connections, questions });
  const response = await generate({
    prompt,
    temperature: 0.2,
    maxTokens: 420
  });
  const parsed = safeJsonParse(response);
  if (!parsed) return null;

  const highlightMap = new Map(highlights.map(item => [String(item.id), item]));
  const normalizeList = (list) => (Array.isArray(list) ? list : []).map(item => ({
    text: item?.text || '',
    evidence: mapEvidence(item?.evidence || [], highlightMap)
  })).filter(item => item.text);

  return {
    insights: normalizeList(parsed.insights),
    blindSpots: normalizeList(parsed.blindSpots),
    nextQuestions: normalizeList(parsed.nextQuestions)
  };
};

module.exports = {
  isGenerationEnabled,
  generateDraftInsights
};
