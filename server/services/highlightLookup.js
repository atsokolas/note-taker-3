// Finding one highlight among a reader's articles, by its id.
const mongoose = require('mongoose');
const { serializeHighlightWithArticle } = require('../utils/highlightUtils');
const { normalizeItemType } = require('./notebookBlocks');
const { Article } = require('../models/index');

const parseClaimId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const mapHighlightWithArticle = (article, highlight) => (
  serializeHighlightWithArticle(article, highlight, {
    includeAnchor: true,
    normalizeItemType
  })
);

const findHighlightById = async (userId, highlightId) => {
  if (!mongoose.Types.ObjectId.isValid(highlightId)) return null;
  const matches = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': new mongoose.Types.ObjectId(highlightId) } },
    { $project: {
      _id: '$highlights._id',
      text: '$highlights.text',
      note: '$highlights.note',
      tags: '$highlights.tags',
      type: '$highlights.type',
      claimId: '$highlights.claimId',
      articleId: '$_id',
      articleTitle: '$title',
      createdAt: '$highlights.createdAt'
    } }
  ]);
  return matches[0] || null;
};

module.exports = {
  parseClaimId,
  mapHighlightWithArticle,
  findHighlightById
};
