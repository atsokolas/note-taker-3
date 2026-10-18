const mongoose = require('mongoose');

/* The nightstand: pieces saved to read later. Minutes are what a reader
   plans an evening with, so a piece is sized by its stored text, never
   fetched or loaded to be measured. */
const CHARS_PER_MINUTE = 6 * 230;
const readingMinutes = (chars = 0) => Math.max(1, Math.round((Number(chars) || 0) / CHARS_PER_MINUTE));
const lengthProjection = { $strLenCP: { $ifNull: ['$content', ''] } };

/* What fits tonight: the piece that has waited longest among the short
   ones. Nothing short waiting is silence, not a long piece offered anyway. */
const TONIGHT_MINUTES = 15;
const waitingTonight = async ({ Article, userId }) => {
  if (!Article || !userId) return null;
  const rows = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)), placement: 'later' } },
    { $sort: { placementAt: 1, createdAt: 1 } },
    { $limit: 50 },
    { $project: { title: 1, placementReason: 1, length: lengthProjection } }
  ]);
  const row = rows.find(item => item.title && readingMinutes(item.length) <= TONIGHT_MINUTES);
  return row ? { articleId: String(row._id), title: row.title, reason: row.placementReason || '', minutes: readingMinutes(row.length) } : null;
};

module.exports = { readingMinutes, lengthProjection, waitingTonight, TONIGHT_MINUTES };
