#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Article, Connection, WikiPage, WikiRevision, NoeisReceipt } = require('../server/models');
const {
  buildWeekendReadingsDraft,
  createWeekendReadingsDraft
} = require('../server/services/weekendReadingsService');
const { ensureResearchEditionLibraryItems } = require('../server/services/researchEditionLibraryService');

const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const REPLACE_DRAFT = process.argv.includes('--replace-draft') || process.env.REPLACE_DRAFT === '1';
const OWNER_REFERENCE_PAGE_ID = process.env.NOEIS_OWNER_REFERENCE_PAGE_ID || '6a62aa71a5153ffa3255d6de';

const argumentValue = name => {
  const prefix = `--${name}=`;
  const inline = process.argv.find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || '' : '';
};

const dateKey = (value, field) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date.toISOString().slice(0, 10);
};

const readManifest = manifestPath => {
  const resolved = path.resolve(String(manifestPath || ''));
  if (!manifestPath || !fs.existsSync(resolved)) throw new Error('--manifest must point to a readable JSON file.');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`The weekly manifest is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The weekly manifest must be a JSON object.');
  }
  return parsed;
};

const validateWeeklyManifest = manifest => {
  const input = {
    ...manifest,
    publicationProfile: 'this_week_in_ai',
    authorLabel: String(manifest.authorLabel || 'Athan Tsokolas').trim() || 'Athan Tsokolas'
  };
  const issueNumber = Number(input.editionNumber);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error('editionNumber must be a positive integer.');
  }
  const windowStart = dateKey(input.windowStart, 'windowStart');
  const windowEnd = dateKey(input.windowEnd, 'windowEnd');
  for (const [index, item] of (Array.isArray(input.items) ? input.items : []).entries()) {
    let url;
    try {
      url = new URL(String(item?.url || item?.canonicalUrl || ''));
    } catch (_error) {
      throw new Error(`items[${index}] must have a valid arXiv URL.`);
    }
    if (url.protocol !== 'https:' || url.hostname !== 'arxiv.org' || !/^\/abs\/[^/]+\/?$/.test(url.pathname)) {
      throw new Error(`items[${index}] must use a direct https://arxiv.org/abs/... primary-source URL.`);
    }
    if (String(item?.sourceQuality || '').toLowerCase() !== 'primary') {
      throw new Error(`items[${index}] must be marked as a primary source.`);
    }
    const published = dateKey(item?.publishedAt, `items[${index}].publishedAt`);
    if (published < windowStart || published > windowEnd) {
      throw new Error(`items[${index}] falls outside the evidence window.`);
    }
  }
  return input;
};

const safeSummary = ({ draft, created = false, updated = false, page = null, receipt = null } = {}) => ({
  editionKey: draft.editionKey,
  title: draft.title,
  status: draft.page.status,
  visibility: draft.page.visibility,
  sourceCount: draft.page.sourceRefs.length,
  wordCount: String(draft.plainText || '').split(/\s+/).filter(Boolean).length,
  created,
  updated,
  pageId: String(page?._id || page?.id || ''),
  receiptId: String(receipt?.receiptId || receipt?.id || '')
});

const runEdition = async ({
  manifest,
  apply = APPLY,
  replaceExistingDraft = REPLACE_DRAFT,
  ownerReferencePageId = OWNER_REFERENCE_PAGE_ID
} = {}) => {
  const input = validateWeeklyManifest(manifest);
  const preview = buildWeekendReadingsDraft({ ...input, ownerId: 'preview-owner' });
  if (!apply) return { mode: 'dry-run', ...safeSummary({ draft: preview }) };
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for --apply.');
  if (!mongoose.isValidObjectId(ownerReferencePageId)) {
    throw new Error('NOEIS_OWNER_REFERENCE_PAGE_ID must be a Mongo ObjectId.');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const referencePage = await WikiPage.findOne({
      _id: ownerReferencePageId,
      status: { $ne: 'archived' }
    }).select('_id userId');
    if (!referencePage?.userId) throw new Error('Owner reference page was not found.');
    const libraryItems = await ensureResearchEditionLibraryItems({
      Article,
      userId: referencePage.userId,
      items: input.items,
      publicationTitle: preview.title
    });
    const result = await createWeekendReadingsDraft({
      ...input,
      items: libraryItems,
      replaceExistingDraft,
      WikiPage,
      WikiRevision,
      NoeisReceipt,
      Connection,
      userId: referencePage.userId,
      buildUniqueSlug: async () => `this-week-in-ai-${dateKey(input.windowEnd, 'windowEnd')}-issue-${String(input.editionNumber).padStart(3, '0')}`
    });
    return {
      mode: 'apply',
      ...safeSummary({
        draft: result.draft,
        created: result.created,
        updated: result.updated,
        page: result.page,
        receipt: result.receipt
      }),
      libraryArticleCount: libraryItems.length,
      nextAction: result.receipt?.nextAction || null
    };
  } finally {
    await mongoose.disconnect();
  }
};

const main = async () => {
  const manifest = readManifest(argumentValue('manifest'));
  const result = await runEdition({ manifest });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

if (require.main === module) {
  main().catch(async error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    if (mongoose.connection.readyState) await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = {
  dateKey,
  readManifest,
  runEdition,
  safeSummary,
  validateWeeklyManifest
};
