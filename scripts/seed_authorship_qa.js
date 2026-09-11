#!/usr/bin/env node
// A local-only fixture for the continuous authorship journey. It never loads
// .env and cannot connect to a shared or production database.
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { User, Article, WikiPage } = require('../server/models');

const QA_ORIGIN = 'https://example.test/authorship';

const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = text => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });

const sourceGroundedPage = ({ userId, slug, title, pageType, sections, source, extra = {} }) => {
  const sourceRefId = new mongoose.Types.ObjectId();
  const sourceObjectId = new mongoose.Types.ObjectId();
  const citationId = new mongoose.Types.ObjectId();
  const claimId = `authorship-${slug}`;
  const body = sections.flatMap((section, index) => [
    heading(section.heading),
    index === 0
      ? {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: section.text,
            marks: [{ type: 'claim', attrs: { claimId, support: 'supported', citationIndexes: [1] } }]
          }]
        }
      : paragraph(section.text)
  ]);
  const claimText = sections[0].text;

  return {
    userId, slug, title, pageType, status: 'published', visibility: 'private',
    sourceScope: 'selected_sources',
    createdFrom: { type: 'paste', text: 'Deterministic local QA fixture.', label: `authorship-qa:${slug}` },
    body: { type: 'doc', content: body },
    plainText: sections.map(section => `${section.heading}\n${section.text}`).join('\n\n'),
    sourceRefs: [{
      _id: sourceRefId, type: 'external', objectId: sourceObjectId,
      title: source.title, snippet: source.quote, url: source.url,
      citationLabel: source.label, provider: source.provider, metadata: source.metadata,
      addedBy: 'user'
    }],
    claims: [{
      claimId, text: claimText, section: sections[0].heading, support: 'supported',
      sourceRefIds: [sourceRefId], citationIds: [citationId], confidence: 1,
      epistemicStatus: 'established_fact', materiality: 'major'
    }],
    citations: [{
      _id: citationId, sourceRefId, sourceType: 'external', sourceObjectId,
      sourceTitle: source.title, quote: source.quote, url: source.url, confidence: 1
    }],
    aiState: { draftStatus: 'idle', status: 'idle', provider: '', model: '' },
    ...extra
  };
};

const run = async () => {
  await mongoose.connect('mongodb://127.0.0.1:27028/noeis_authorship_qa');
  const user = await User.findOneAndUpdate({ username: 'authorship_preview' }, {
    $setOnInsert: { password: await bcrypt.hash('LocalAuthorshipOnly!7', 10) }
  }, { upsert: true, new: true });
  const fixtures = [
    { key: 'parenting', title: 'Room to learn', content: '<p>Learning takes practice, patience, and a chance to try again.</p><p>Children need room to make mistakes.</p><p>The parent helps keep another attempt possible.</p>', passage: 'Children need room to make mistakes.' },
    { key: 'nomad', title: 'Nomad — recoverable mistakes', content: '<p>This is an illustrative QA passage, not a quotation from a real letter.</p><p>A recoverable mistake can buy understanding. A mistake that removes the next attempt cannot.</p><p>Patience &amp; curiosity are useful only while another attempt remains possible.</p>', passage: 'A recoverable mistake can buy understanding. A mistake that removes the next attempt cannot.' },
    { key: 'strategy', title: 'Small product experiments', content: '<p>A small release makes the next decision easier.</p><p>Ship the smallest experiment that can teach us something.</p><p>The point is to preserve the ability to change direction.</p>', passage: 'Ship the smallest experiment that can teach us something.' }
  ];
  const articles = [];
  for (const fixture of fixtures) {
    let article = await Article.findOne({ userId: user._id, url: `https://example.test/authorship/${fixture.key}` });
    if (!article) article = await Article.create({ userId: user._id, url: `https://example.test/authorship/${fixture.key}`, title: fixture.title, content: fixture.content, highlights: [{ text: fixture.passage }] });
    articles.push(article);
  }
  const pages = [];
  for (const [index, title] of [[0, 'Parenting'], [2, 'Product strategy']]) {
    const article = articles[index];
    const claimId = `authorship-${fixtures[index].key}`;
    const sourceId = new mongoose.Types.ObjectId();
    const citationId = new mongoose.Types.ObjectId();
    let page = await WikiPage.findOne({ userId: user._id, slug: fixtures[index].key });
    if (!page) page = await WikiPage.create({
      userId: user._id, title, slug: fixtures[index].key, status: 'published',
      plainText: fixtures[index].passage,
      body: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'An illustrative page for trying an idea in your own words.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: fixtures[index].passage, marks: [{ type: 'claim', attrs: { claimId, support: 'supported', citationIndexes: [1] } }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'What matters is the shape of the next attempt: what stays possible, and what this experience helps us notice.' }] }
      ] },
      claims: [{ claimId, text: fixtures[index].passage, support: 'supported', sourceRefIds: [sourceId], citationIds: [citationId] }],
      sourceRefs: [{ _id: sourceId, type: 'highlight', objectId: article.highlights[0]._id, parentObjectId: article._id, title: article.title, snippet: fixtures[index].passage }],
      citations: [{ _id: citationId, sourceRefId: sourceId, sourceType: 'highlight', sourceObjectId: article.highlights[0]._id, sourceTitle: article.title, quote: fixtures[index].passage }]
    });
    pages.push({ pageId: String(page._id), claimId, title });
  }

  const specializedFixtures = [
    sourceGroundedPage({
      userId: user._id,
      slug: 'fixture-repository-field-guide',
      title: 'Fixture repository field guide',
      pageType: 'repo',
      sections: [
        { heading: 'What this repo is', text: 'This fictional repository is a deterministic QA fixture for checking the specialized repository reader and its agent context.' },
        { heading: 'Architecture map', text: 'The example application keeps request handling in server/routes, durable records in server/models, and browser rendering in note-taker-ui/src.' },
        { heading: 'Developer quickstart', text: 'From the repository root, run npm test. This command is illustrative and performs no network or background work in this fixture.' },
        { heading: 'Open questions', text: 'Can the reader explain the repository structure while keeping authorship controls out of this specialized surface?' }
      ],
      source: {
        title: 'Fixture repository README',
        quote: 'This fictional repository is a deterministic QA fixture for the specialized repository reader.',
        url: `${QA_ORIGIN}/repository/readme`,
        label: 'README.md @ qa-fixture-head',
        provider: 'github-repo',
        metadata: { path: 'README.md', ref: 'qa-fixture-head', repository: 'noeis-fixtures/authorship-reader' }
      },
      extra: {
        externalWatches: { githubRepo: {
          owner: 'noeis-fixtures', repo: 'authorship-reader', defaultBranch: 'main', status: 'idle',
          lastHeadSha: 'qa-fixture-head', publishedHeadSha: 'qa-fixture-head', buildStatus: 'idle'
        } },
        freshness: { status: 'fresh', acceptedThrough: { type: 'github', headSha: 'qa-fixture-head' } }
      }
    }),
    sourceGroundedPage({
      userId: user._id,
      slug: 'fixture-investment-dossier',
      title: 'Fixture Systems investment dossier',
      pageType: 'entity',
      sections: [
        { heading: 'Research boundary', text: 'Fixture Systems is fictional. This local QA dossier tests the specialized investment reader with no market claim, recommendation, or generated research.' },
        { heading: 'Business model', text: 'The fixture describes a subscription software company so the reader can present a concrete operating model without implying that the company exists.' },
        { heading: 'Evidence and uncertainty', text: 'Every number is intentionally omitted. The only supported claim is that this record is a deterministic local QA fixture.' },
        { heading: 'Decision question', text: 'Can the reader expose dossier-specific agent capabilities while keeping the authored open-sentence pocket absent?' }
      ],
      source: {
        title: 'Fixture Systems QA brief',
        quote: 'Fixture Systems is fictional and exists only to exercise the specialized investment reader.',
        url: `${QA_ORIGIN}/investment/brief`,
        label: 'Local QA brief',
        provider: 'authorship-qa-fixture',
        metadata: { evidenceRole: 'qa_boundary', fictional: true, asOf: '2026-09-07' }
      },
      extra: {
        investmentDossier: {
          version: 2,
          company: { name: 'Fixture Systems', ticker: 'FIXQ', cik: '' },
          startingJudgment: 'No investment judgment: this is a fictional local QA fixture.',
          businessModel: { primary: 'subscription_software' },
          researchPlan: { status: 'researching', requiredModuleIds: [], modules: [] },
          valuation: { status: 'not_started', currency: 'USD', unitScale: 'millions', scenarios: [] }
        },
        freshness: { status: 'fresh' }
      }
    })
  ];
  const specializedPages = [];
  for (const fixture of specializedFixtures) {
    const existing = await WikiPage.findOne({ userId: user._id, slug: fixture.slug });
    const page = await WikiPage.findOneAndUpdate(
      { userId: user._id, slug: fixture.slug },
      { $setOnInsert: fixture },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    specializedPages.push({
      pageId: String(page._id),
      title: page.title,
      pageType: page.pageType,
      route: `/wiki/workspace?page=${page._id}`,
      sourceCount: page.sourceRefs.length,
      claimCount: page.claims.length,
      disposition: existing ? 'preserved' : 'created'
    });
  }

  const result = {
    userId: String(user._id),
    pages,
    specializedPages,
    articles: articles.map(article => ({ articleId: String(article._id), highlightId: String(article.highlights[0]._id), title: article.title }))
  };
  const output = path.resolve('output/authorship-qa/fixture.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ fixture: output, pages, specializedPages }, null, 2));
  await mongoose.disconnect();
};

run().catch(async error => { console.error(error.message); await mongoose.disconnect(); process.exitCode = 1; });
