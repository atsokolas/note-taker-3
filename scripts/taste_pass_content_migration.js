#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const { Article, WikiPage } = require('../server/models');
const { deriveImportedTitle, isFragmentTitle } = require('../server/services/importTitleService');
const {
  buildDuplicateClaimPlan,
  buildDuplicatePagePlan,
  mergeClaimRecords,
  mergePageRecords
} = require('../server/services/wikiDedupeService');
const {
  normalizeExistingWikiTitleForPresentation
} = require('../server/services/wikiPresentationGuard');

const limitFrom = argv => {
  const value = Number(argv.find(arg => arg.startsWith('--limit='))?.split('=')[1]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 20_000) : 5_000;
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  const limit = limitFrom(process.argv.slice(2));
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);

  const [articles, pages] = await Promise.all([
    Article.find({ archived: { $ne: true } })
      .select('_id userId title content author siteName publicationDate url importMeta highlights.text createdAt')
      .limit(limit)
      .lean(),
    WikiPage.find({ status: { $ne: 'archived' } })
      .select('_id userId title plainText body sourceRefs citations claims judgment aiState createdFrom createdAt updatedAt')
      .limit(limit)
      .lean()
  ]);

  const articleTitleChanges = articles.filter(article => isFragmentTitle(article.title)).map(article => ({
    id: String(article._id),
    before: article.title,
    after: deriveImportedTitle({
      metadataTitle: article.title,
      content: article.content || article.highlights?.map(highlight => highlight?.text).find(Boolean) || '',
      author: article.author,
      siteName: article.siteName,
      sourceType: article.importMeta?.sourceType,
      url: article.url,
      publishedAt: article.publicationDate || article.createdAt
    })
  })).filter(change => change.after && change.after !== change.before);

  const wikiTitleChanges = pages.map(page => ({
    id: String(page._id),
    before: page.title,
    after: normalizeExistingWikiTitleForPresentation(page.title)
  })).filter(change => change.after && change.after !== change.before);

  const duplicatePlans = [];
  const pagesByUser = new Map();
  pages.forEach(page => {
    const userId = String(page.userId || '');
    if (!pagesByUser.has(userId)) pagesByUser.set(userId, []);
    pagesByUser.get(userId).push(page);
  });
  pagesByUser.forEach(userPages => duplicatePlans.push(...buildDuplicatePagePlan(
    userPages.map(page => ({
      ...page,
      title: normalizeExistingWikiTitleForPresentation(page.title)
    }))
  )));

  const duplicateClaimMerges = pages.flatMap(page => (
    buildDuplicateClaimPlan(page.claims).map(plan => ({
      pageId: String(page._id),
      ...plan
    }))
  ));

  if (apply) {
    if (articleTitleChanges.length) {
      await Article.bulkWrite(articleTitleChanges.map(change => ({
        updateOne: { filter: { _id: change.id }, update: { $set: { title: change.after } } }
      })));
    }
    if (wikiTitleChanges.length) {
      await WikiPage.bulkWrite(wikiTitleChanges.map(change => ({
        updateOne: { filter: { _id: change.id }, update: { $set: { title: change.after } } }
      })));
    }
    const pagesWithDuplicateClaims = new Set(duplicateClaimMerges.map(plan => plan.pageId));
    for (const page of pages.filter(candidate => pagesWithDuplicateClaims.has(String(candidate._id)))) {
      await WikiPage.updateOne({ _id: page._id }, {
        $set: { claims: mergeClaimRecords(page.claims) }
      });
    }
    for (const plan of duplicatePlans) {
      const merged = mergePageRecords(plan.pages);
      await WikiPage.updateOne({ _id: plan.canonicalId }, {
        $set: {
          sourceRefs: merged.sourceRefs,
          citations: merged.citations,
          claims: merged.claims,
          judgment: merged.judgment,
          aiState: merged.aiState
        }
      });
      await WikiPage.updateMany({ _id: { $in: plan.duplicateIds } }, {
        $set: { status: 'archived', archived: true, hiddenFromHome: true }
      });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scanned: { articles: articles.length, pages: pages.length },
    articleTitleChanges,
    wikiTitleChanges,
    duplicateClaimMerges,
    duplicatePageMerges: duplicatePlans.map(plan => ({
      key: plan.key,
      canonicalId: plan.canonicalId,
      mergedIds: plan.duplicateIds
    }))
  }, null, 2));
};

main()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    try { await mongoose.disconnect(); } catch (_disconnectError) { /* surface original */ }
    console.error(error);
    process.exit(1);
  });
