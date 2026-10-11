#!/usr/bin/env node
/*
 * Point wiki sources at the Library records they are.
 *
 * The wiki page read does this lazily, one page at a time. This does it for
 * every page at once, so "where the passages went" sees pages nobody has
 * opened since. It only adds identity to a source ref: an event id becomes the
 * article or highlight the event was about (the event id is kept in
 * metadata.sourceEventId), and a ref with a URL saved in the same reader's
 * Library gains that article as parentObjectId. Nothing is removed, and
 * updatedAt is left alone.
 *
 * Dry-run is the default. Writing needs --apply and APPLY_LINK_WIKI_SOURCES=YES.
 *   node scripts/link_wiki_sources_to_library.js [--user <id>] [--apply]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { linkPageSources } = require('../server/services/librarySource');

const run = async ({ Article, WikiPage, WikiSourceEvent, apply = false, userId = '' } = {}) => {
  const query = { 'sourceRefs.0': { $exists: true }, ...(userId ? { userId } : {}) };
  const report = { pages: 0, pagesLinked: 0, refsLinked: 0 };
  for await (const page of WikiPage.find(query).select('_id userId sourceRefs').lean().cursor()) {
    report.pages += 1;
    const linked = await linkPageSources({ Article, WikiSourceEvent, WikiPage: apply ? WikiPage : null, page });
    if (linked) {
      report.pagesLinked += 1;
      report.refsLinked += linked;
    }
  }
  return report;
};

if (require.main === module) {
  (async () => {
    const apply = process.argv.includes('--apply');
    if (apply && process.env.APPLY_LINK_WIKI_SOURCES !== 'YES') {
      throw new Error('Refusing to write. Set APPLY_LINK_WIKI_SOURCES=YES after reviewing the dry-run.');
    }
    const userIndex = process.argv.indexOf('--user');
    const userId = userIndex >= 0 ? String(process.argv[userIndex + 1] || '') : '';
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
    const { Article, WikiPage, WikiSourceEvent } = require('../server/models');
    const report = await run({ Article, WikiPage, WikiSourceEvent, apply, userId });
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report }, null, 2));
  })()
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
}

module.exports = { run };
