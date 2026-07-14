#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { WikiPage, WikiRevision, WikiSourceEvent } = require('../server/models');
const { armEdgarWatchForPage } = require('../server/services/edgarWatcherService');
const { armTranscriptWatchForPage } = require('../server/services/earningsTranscriptWatcherService');
const { createWikiRevision, snapshotPage } = require('../server/services/wikiRevisionService');

const DEFAULT_SOURCE_PAGE_ID = '6a53b120a1e0e2129bfd9725';
const DEFAULT_EVIDENCE_PATH = '/Users/athantsokolas/.codex/visualizations/2026/07/12/019f57b8-58bd-7882-bda2-be7dacf1b2ab/alphabet-primary-source-evidence-package-2026-07-12.md';
const TARGET_TITLE = 'Alphabet’s Berkshire-like allocator—and where the analogy breaks';
const TARGET_SLUG = 'alphabet-berkshire-like-allocator-acceptance-2026-07-13';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'output', 'alphabet-acceptance-copy-2026-07-13');

const cleanMarkdown = (value = '') => String(value || '')
  .replace(/^\*([^*].*?)\*$/s, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .trim();

const claimId = (text = '') => `claim-${crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)}`;

const rewriteUnsupportedClaimText = (value = '') => String(value || '')
  .replace(/\s*Waymo’s \$16 billion 2026 funding round, funded in significant majority by Alphabet, indicates continued commitment and some external validation\./, '')
  .replace(/\s*The General Court annulled the Commission’s AdSense for Search decision and €1\.5 billion fine, though the Commission appealed\./, '')
  .replace(/\s+/g, ' ')
  .trim();

const CLAIM_EVIDENCE_RULES = Object.freeze([
  { startsWith: 'Alphabet has the funding capacity', sourceIds: ['A25K', 'B25AR'] },
  { startsWith: 'Fact. Alphabet became the parent holding company', sourceIds: ['A25K'] },
  { startsWith: 'Inference. That structure creates an allocator’s problem', sourceIds: ['A25K', 'A1Q26'] },
  { startsWith: 'Analogy. This is the point at which Berkshire Hathaway becomes useful', sourceIds: ['A25K', 'B25AR', 'B25L'] },
  { startsWith: 'Limit. The resemblance is not identity', sourceIds: ['A25K', 'B25AR'] },
  { startsWith: 'Fact. Alphabet generated $164.713 billion', sourceIds: ['A25K'] },
  { startsWith: 'Fact. Berkshire ended 2025 with approximately $176 billion', sourceIds: ['B25AR', 'B25K'] },
  { startsWith: 'Correction. These are not equivalent numbers', sourceIds: ['A25K', 'B25AR', 'B25K'] },
  { startsWith: 'Analogy. The narrow comparison is that both firms', sourceIds: ['A25K', 'B25AR'] },
  { startsWith: 'Uncertainty. Alphabet’s funding advantage depends', sourceIds: ['A25K', 'A1Q26'] },
  { startsWith: 'Fact. From 2016 through 2025', sourceIds: ['FY2016', 'FY2017', 'FY2018', 'FY2019', 'FY2020', 'FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'] },
  { startsWith: 'Inference. Alphabet did not choose between reinvestment', sourceIds: ['A25K'] },
  { startsWith: 'Disconfirming evidence. The reinvestment bill has accelerated sharply', sourceIds: ['FY2023', 'FY2025', 'A1Q26'] },
  { startsWith: 'Uncertainty. Alphabet does not disclose a single portfolio-wide hurdle rate', sourceIds: ['A25K', 'A1Q26'] },
  { startsWith: 'Fact. Other Bets generated $1.537 billion', sourceIds: ['A25K', 'A1Q26'] },
  { startsWith: 'Fact. Adding the Other Bets operating losses', sourceIds: ['FY2016', 'FY2017', 'FY2018', 'FY2019', 'FY2020', 'FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'] },
  { startsWith: 'Uncertainty. That cumulative sum is not a GAAP measure', sourceIds: ['FY2018', 'FY2023', 'A25K'] },
  { startsWith: 'Inference. Other Bets should be understood as an option portfolio', sourceIds: ['A25K', 'A1Q26'] },
  { startsWith: 'Disconfirming evidence. Revenue remains tiny relative to losses', sourceIds: ['A25K', 'A1Q26'] },
  { startsWith: 'Fact. Alphabet’s Class A shares receive one vote each', sourceIds: ['AP26', 'ACOI'] },
  { startsWith: 'Inference. Control can protect investments', sourceIds: ['AP26', 'ACOI'] },
  { startsWith: 'Disconfirming evidence. The annual-meeting record', sourceIds: ['AP26', 'A25K'] },
  { startsWith: 'Comparison. Berkshire also concentrates capital allocation', sourceIds: ['A25K', 'A1Q26', 'B25AR', 'B25L'] },
  { startsWith: 'Fact. In the U.S. search case', sourceIds: ['DOJ-S'] },
  { startsWith: 'Fact. In the Virginia ad-tech case', sourceIds: ['DOJ-AT'] },
  { startsWith: 'Fact. The European Commission imposed a €2.95 billion', sourceIds: ['EC-AT', 'A1Q26', 'CMA-S'] },
  { startsWith: 'Inference. Regulation is no longer merely a discount rate', sourceIds: ['DOJ-S', 'DOJ-AT', 'EC-AT', 'CMA-S', 'CMA-AT'] },
  { startsWith: 'Disconfirming evidence. Alphabet has not lost every case', sourceIds: ['DOJ-AT'] },
  { startsWith: 'Alphabet deserves analysis as a capital allocator', sourceIds: ['A25K', 'B25AR'] },
  { startsWith: 'But “Berkshire Hathaway 2.0” hides the facts', sourceIds: ['A25K', 'A1Q26', 'AP26', 'B25AR', 'DOJ-S', 'DOJ-AT', 'CMA-S'] },
  { startsWith: 'The investable question is therefore not whether Alphabet has copied Berkshire', sourceIds: ['A25K', 'A1Q26', 'AP26', 'DOJ-S', 'DOJ-AT', 'CMA-S'] }
]);

const claimEvidenceFor = (text = '') => {
  const rule = CLAIM_EVIDENCE_RULES.find(candidate => String(text || '').startsWith(candidate.startsWith));
  if (!rule) throw new Error(`No claim-level evidence mapping for: ${String(text || '').slice(0, 120)}`);
  return [...rule.sourceIds];
};

const parseEvidencePackage = (markdown = '') => {
  const inventory = markdown.split('\n## 2. Financial series')[0] || '';
  const articleMatch = markdown.match(/## 7\. Complete article draft\s+#[^\n]+\n([\s\S]*?)\n---\s+\n## 8\./);
  if (!articleMatch) throw new Error('Could not locate the complete article draft in the evidence package.');

  const sourceRows = [];
  const aliasesByUrl = new Map();
  for (const line of inventory.split('\n')) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (!match) continue;
    const rawId = match[1].trim();
    const id = /^20\d{2}$/.test(rawId) ? `FY${rawId}` : rawId;
    const [, , title, url, period, sections] = match;
    if (!aliasesByUrl.has(url)) {
      aliasesByUrl.set(url, []);
      sourceRows.push({ id, title: cleanMarkdown(title), url, period: period.trim(), sections: sections.trim() });
    }
    aliasesByUrl.get(url).push(id);
  }
  if (sourceRows.length < 20) throw new Error(`Expected at least 20 primary sources; found ${sourceRows.length}.`);
  sourceRows.forEach(row => { row.aliases = aliasesByUrl.get(row.url) || [row.id]; });

  const blocks = [];
  let section = '';
  let paragraphLines = [];
  const flushParagraph = () => {
    const raw = paragraphLines.join(' ').trim();
    paragraphLines = [];
    if (!raw) return;
    const text = rewriteUnsupportedClaimText(cleanMarkdown(raw));
    const label = raw.match(/^\*\*([^*]+)\.\*\*/)?.[1] || '';
    const sourceIds = claimEvidenceFor(text);
    blocks.push({ type: 'paragraph', text, section, label, sourceIds });
  };
  for (const line of articleMatch[1].trim().split('\n')) {
    if (/^##\s+/.test(line)) {
      flushParagraph();
      section = cleanMarkdown(line.replace(/^##\s+/, ''));
      blocks.push({ type: 'heading', text: section, level: 2 });
    } else if (!line.trim()) {
      flushParagraph();
    } else {
      paragraphLines.push(line.trim());
    }
  }
  flushParagraph();
  if (blocks.filter(block => block.type === 'paragraph').length < 20) {
    throw new Error('Article draft did not produce the expected claim-bearing paragraphs.');
  }
  return { sourceRows, blocks };
};

const buildCandidate = ({ sourcePage, parsed, now = new Date() }) => {
  const sourceRefs = parsed.sourceRows.map(row => ({
    _id: new mongoose.Types.ObjectId(),
    type: 'external',
    title: row.title,
    snippet: `${row.period}. Relevant sections: ${row.sections}`.slice(0, 1200),
    url: row.url,
    citationLabel: row.id,
    provider: row.url.includes('sec.gov') ? 'sec-edgar' : row.url.includes('justice.gov') ? 'doj' : row.url.includes('gov.uk') ? 'cma' : 'primary-source',
    metadata: { evidenceIds: row.aliases, period: row.period, relevantSections: row.sections },
    addedBy: 'user',
    createdAt: now
  }));
  const indexByEvidenceId = new Map();
  sourceRefs.forEach((ref, index) => (ref.metadata.evidenceIds || []).forEach(id => indexByEvidenceId.set(id, index + 1)));
  const citations = sourceRefs.map(ref => ({
    _id: new mongoose.Types.ObjectId(),
    sourceRefId: ref._id,
    sourceType: 'external',
    sourceTitle: ref.title,
    quote: '',
    url: ref.url,
    confidence: 1,
    createdAt: now
  }));
  const paragraphs = [];
  const body = {
    type: 'doc',
    content: parsed.blocks.map(block => {
      if (block.type === 'heading') {
        return { type: 'heading', attrs: { level: block.level || 2 }, content: [{ type: 'text', text: block.text }] };
      }
      const citationIndexes = [...new Set(block.sourceIds.map(id => indexByEvidenceId.get(id)).filter(Boolean))];
      const support = ['Fact', 'Correction'].includes(block.label) ? 'supported' : 'partial';
      paragraphs.push({ ...block, citationIndexes, support });
      return {
        type: 'paragraph',
        content: [{
          type: 'text',
          text: block.text,
          marks: [{
            type: 'claim',
            attrs: { claimId: claimId(block.text), support, citationIndexes, contradictionIndexes: [] }
          }]
        }]
      };
    })
  };
  const claims = paragraphs.map(block => ({
    claimId: claimId(block.text),
    text: block.text,
    section: block.section,
    support: block.support,
    citationIds: block.citationIndexes.map(index => citations[index - 1]._id),
    sourceRefIds: block.citationIndexes.map(index => sourceRefs[index - 1]._id),
    contradictedByCitationIds: [],
    confidence: block.support === 'supported' ? 0.95 : 0.72,
    lastReviewedAt: now,
    lastVerifiedAt: now,
    history: [{
      at: now,
      event: 'created',
      support: block.support,
      text: block.text,
      section: block.section,
      citationIds: block.citationIndexes.map(index => citations[index - 1]._id),
      sourceRefIds: block.citationIndexes.map(index => sourceRefs[index - 1]._id),
      contradictedByCitationIds: [],
      summary: 'Claim created from the primary-source editorial rebuild.'
    }],
    createdAt: now
  }));
  const plainText = parsed.blocks.map(block => block.text).join('\n\n');
  return {
    userId: sourcePage.userId,
    title: TARGET_TITLE,
    slug: TARGET_SLUG,
    pageType: sourcePage.pageType || 'source',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'selected_sources',
    createdFrom: {
      type: 'sources',
      objectId: sourcePage._id,
      objectIds: [sourcePage._id],
      text: 'Dedicated Alphabet dual-clock public-proof acceptance copy.',
      label: 'Primary-source acceptance rebuild'
    },
    adoptedFrom: {
      originType: 'page',
      originPageId: sourcePage._id,
      originSlug: sourcePage.slug,
      originTitle: sourcePage.title,
      sample: false,
      adoptedAt: now
    },
    body,
    plainText,
    sourceRefs,
    citations,
    claims,
    freshness: {
      status: 'needs_review',
      lastSourceEventAt: null,
      lastMaintainedAt: null,
      pendingSourceEventIds: [],
      conflictCount: 0,
      staleSectionCount: 0,
      acceptedThrough: null
    },
    publicProof: null,
    hiddenFromHome: true,
    debugOnly: false,
    archived: false
  };
};

const safeSummary = page => ({
  id: String(page._id || ''),
  title: page.title,
  slug: page.slug,
  status: page.status,
  visibility: page.visibility,
  sourceCount: page.sourceRefs?.length || 0,
  claimCount: page.claims?.length || 0,
  wordCount: String(page.plainText || '').split(/\s+/).filter(Boolean).length,
  acceptedThrough: page.freshness?.acceptedThrough || null,
  publicProof: page.publicProof || null,
  watches: {
    edgar: {
      ticker: page.externalWatches?.edgar?.ticker || '',
      cik: page.externalWatches?.edgar?.cik || '',
      status: page.externalWatches?.edgar?.status || 'idle'
    },
    transcripts: {
      ticker: page.externalWatches?.transcripts?.ticker || '',
      provider: page.externalWatches?.transcripts?.provider || 'fmp',
      status: page.externalWatches?.transcripts?.status || 'idle'
    }
  }
});

const writeJson = (filename, payload) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const target = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return target;
};

const main = async () => {
  const apply = process.argv.includes('--apply') || process.env.APPLY === '1';
  const sourcePageId = process.env.ALPHABET_SOURCE_PAGE_ID || DEFAULT_SOURCE_PAGE_ID;
  const evidencePath = process.env.ALPHABET_EVIDENCE_PATH || DEFAULT_EVIDENCE_PATH;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  if (!mongoose.isValidObjectId(sourcePageId)) throw new Error('ALPHABET_SOURCE_PAGE_ID must be a Mongo ObjectId.');
  if (!fs.existsSync(evidencePath)) throw new Error(`Evidence package not found: ${evidencePath}`);

  const parsed = parseEvidencePackage(fs.readFileSync(evidencePath, 'utf8'));
  await mongoose.connect(process.env.MONGODB_URI);
  const sourcePage = await WikiPage.findOne({ _id: sourcePageId, status: { $ne: 'archived' } });
  if (!sourcePage) throw new Error('Alphabet source page not found.');
  if (sourcePage.visibility !== 'private' || sourcePage.externalWatches?.edgar?.ticker !== 'GOOGL') {
    throw new Error('Refusing to copy: source must be the private GOOGL maintained acceptance dossier.');
  }

  const existing = await WikiPage.findOne({ userId: sourcePage.userId, slug: TARGET_SLUG });
  if (existing) {
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', idempotent: true, source: safeSummary(sourcePage), copy: safeSummary(existing) }, null, 2));
    return;
  }

  const candidate = buildCandidate({ sourcePage, parsed });
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    idempotent: false,
    source: safeSummary(sourcePage),
    candidate: safeSummary(candidate),
    inheritedAcceptance: false,
    publicRegistryChanged: false,
    publicPageChanged: false
  };
  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = writeJson(`before-${timestamp}.json`, {
    capturedAt: new Date().toISOString(),
    sourcePage: sourcePage.toObject({ virtuals: false }),
    intendedCandidate: safeSummary(candidate)
  });
  const copy = new WikiPage(candidate);
  await copy.save();
  await armEdgarWatchForPage({
    WikiPage,
    WikiSourceEvent,
    userId: copy.userId,
    pageId: copy._id,
    ticker: 'GOOGL',
    cik: '0001652044',
    companyName: 'Alphabet Inc.',
    forms: ['10-K', '10-Q', '8-K'],
    checkNow: false
  });
  await armTranscriptWatchForPage({
    WikiPage,
    WikiSourceEvent,
    userId: copy.userId,
    pageId: copy._id,
    ticker: 'GOOGL',
    checkNow: false
  });
  const armedCopy = await WikiPage.findById(copy._id);
  const revision = await createWikiRevision({
    WikiRevision,
    userId: armedCopy.userId,
    page: armedCopy,
    reason: 'created',
    actorType: 'user',
    promotionStatus: 'promoted',
    summary: 'Created private Alphabet dual-clock acceptance copy from the primary-source editorial rebuild.'
  });
  const result = {
    ...report,
    candidate: undefined,
    copy: safeSummary(armedCopy),
    revisionId: String(revision?._id || ''),
    snapshotPath,
    rollback: {
      action: 'archive_or_delete_acceptance_copy_only',
      filter: { _id: String(armedCopy._id), userId: String(armedCopy.userId), slug: TARGET_SLUG },
      sourcePageMustRemain: String(sourcePage._id)
    }
  };
  const resultPath = writeJson(`result-${timestamp}.json`, result);
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
};

if (require.main === module) {
  main().catch(async error => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  }).finally(async () => {
    try { await mongoose.disconnect(); } catch (_error) { /* preserve original result */ }
  });
}

module.exports = {
  buildCandidate,
  claimEvidenceFor,
  cleanMarkdown,
  parseEvidencePackage,
  rewriteUnsupportedClaimText
};
