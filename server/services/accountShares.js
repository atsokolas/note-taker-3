/* Closing an account takes down everything it put up for others to read:
   shared copies go, pages and collections turn private, lent books come back. */
const SHARED_COPIES = ['SharedEdition', 'SharedQuestion', 'SharedNotebook', 'SharedConcept'];

const takeSharesDown = ({ models, userId }) => Promise.all([
  ...SHARED_COPIES.map(name => models[name].deleteMany({ userId })),
  models.WikiPage.updateMany({ userId, visibility: { $ne: 'private' } }, { $set: { visibility: 'private' } }),
  models.WikiSharedCollection.updateMany({ userId, visibility: { $ne: 'private' } }, { $set: { visibility: 'private' } }),
  models.Article.updateMany({ userId, lentAs: { $gt: '' } }, { $set: { lentAs: '' } })
]);

module.exports = { takeSharesDown };
