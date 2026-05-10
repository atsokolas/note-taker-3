const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildWikiRouter } = require('../wikiRoutes');

const clone = (value) => JSON.parse(JSON.stringify(value));

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const matches = (record, query = {}) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') {
    return value.some(condition => matches(record, condition));
  }
  if (value && typeof value === 'object' && value.$ne !== undefined) {
    return String(record[key]) !== String(value.$ne);
  }
  if (value && typeof value === 'object' && Array.isArray(value.$in)) {
    return value.$in.map(String).includes(String(record[key] || ''));
  }
  if (value instanceof RegExp) {
    return value.test(String(record[key] || ''));
  }
  return String(record[key] || '') === String(value || '');
});

const attachSourceHelpers = (doc) => {
  doc.sourceRefs = Array.isArray(doc.sourceRefs) ? doc.sourceRefs : [];
  doc.sourceRefs.forEach((source) => {
    source._id = source._id || new mongoose.Types.ObjectId().toString();
    source.deleteOne = () => {
      const index = doc.sourceRefs.findIndex(item => String(item._id) === String(source._id));
      if (index >= 0) doc.sourceRefs.splice(index, 1);
    };
  });
  doc.sourceRefs.id = (id) => doc.sourceRefs.find(source => String(source._id) === String(id)) || null;
  return doc.sourceRefs;
};

class Query {
  constructor(value) {
    this.value = value;
  }

  sort() {
    return this;
  }

  limit() {
    return this;
  }

  select() {
    return this;
  }

  lean() {
    if (Array.isArray(this.value)) return Promise.resolve(this.value.map(clone));
    return Promise.resolve(this.value ? clone(this.value) : null);
  }

  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const createFakeWikiPageModel = () => {
  const records = [];

  function WikiPage(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.sourceRefs = attachSourceHelpers(this);
    this.aiState = this.aiState || {};
  }

  WikiPage.records = records;

  WikiPage.find = (query = {}) => new Query(
    records.filter(record => matches(record, query)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  );

  WikiPage.findOne = (query = {}) => {
    const found = records.find(record => matches(record, query));
    return new Query(found ? new WikiPage(clone(found)) : null);
  };

  WikiPage.findOneAndUpdate = async (query = {}, updates = {}) => {
    const found = records.find(record => matches(record, query));
    if (!found) return null;
    Object.assign(found, updates, { updatedAt: new Date() });
    return new WikiPage(clone(found));
  };

  WikiPage.prototype.toObject = function toObject() {
    const copy = clone(this);
    copy.sourceRefs = (this.sourceRefs || []).map(source => {
      const { deleteOne, ...rest } = source;
      return clone(rest);
    });
    return copy;
  };

  WikiPage.prototype.save = async function save() {
    this.updatedAt = new Date();
    attachSourceHelpers(this);
    const stored = this.toObject();
    const index = records.findIndex(record => String(record._id) === String(this._id));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };

  return WikiPage;
};

const createFakeWikiProposalModel = () => {
  const records = [];

  function WikiProposal(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
  }

  WikiProposal.records = records;

  WikiProposal.find = (query = {}) => new Query(
    records.filter(record => matches(record, query)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  );

  WikiProposal.findOne = (query = {}) => {
    const found = records.find(record => matches(record, query));
    return new Query(found ? new WikiProposal(clone(found)) : null);
  };

  WikiProposal.findOneAndUpdate = async (query = {}, updates = {}, options = {}) => {
    let found = records.find(record => matches(record, query));
    if (!found && options.upsert) {
      found = { ...query };
      records.push(found);
    }
    if (!found) return null;
    const nextUpdates = updates.$set || updates;
    Object.assign(found, nextUpdates, { updatedAt: new Date() });
    return new WikiProposal(clone(found));
  };

  WikiProposal.prototype.toObject = function toObject() {
    return clone(this);
  };

  WikiProposal.prototype.save = async function save() {
    this.updatedAt = new Date();
    const stored = this.toObject();
    const index = records.findIndex(record => String(record._id) === String(this._id));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };

  return WikiProposal;
};

const createFakeLibraryModel = (records = []) => ({
  find: (query = {}) => new Query(records.filter(record => matches(record, query)))
});

const createFakeConnectionModel = () => {
  const records = [];
  const matchesDeleteCondition = (record, condition = {}) => {
    if (condition.fromType?.$in && !condition.fromType.$in.includes(record.fromType)) return false;
    else if (condition.fromType && String(record.fromType || '') !== String(condition.fromType)) return false;
    if (condition.fromId?.$regex && !(new RegExp(condition.fromId.$regex).test(String(record.fromId || '')))) return false;
    else if (condition.fromId && String(record.fromId || '') !== String(condition.fromId)) return false;
    if (condition.toType && String(record.toType || '') !== String(condition.toType)) return false;
    if (condition.toId?.$regex && !(new RegExp(condition.toId.$regex).test(String(record.toId || '')))) return false;
    else if (condition.toId && String(record.toId || '') !== String(condition.toId)) return false;
    if (condition.relationType?.$in && !condition.relationType.$in.includes(record.relationType)) return false;
    else if (condition.relationType && String(record.relationType || '') !== String(condition.relationType)) return false;
    return true;
  };
  return {
    records,
    deleteMany: async (query = {}) => {
      const before = records.length;
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index];
        if (String(record.userId || '') !== String(query.userId || '')) continue;
        if ((query.$or || []).some(condition => matchesDeleteCondition(record, condition))) {
          records.splice(index, 1);
        }
      }
      return { deletedCount: before - records.length };
    },
    findOneAndUpdate: async (query = {}, updates = {}, options = {}) => {
      let found = records.find(record => matches(record, query));
      if (!found && options.upsert) {
        found = {
          _id: new mongoose.Types.ObjectId().toString(),
          ...(updates.$setOnInsert || query),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        records.push(found);
      }
      return found ? clone(found) : null;
    }
  };
};

const request = async (url, path, options = {}) => {
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      Authorization: 'Bearer test',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_error) {
    body = { raw: text };
  }
  return { res, body, text };
};

const run = async () => {
  const WikiPage = createFakeWikiPageModel();
  const WikiProposal = createFakeWikiProposalModel();
  const Article = createFakeLibraryModel([
    {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: 'user-1',
      title: 'Enterprise AI memory article',
      url: 'https://example.com/memory',
      content: '<p>Name: Enterprise AI memory article</p><p>URL: https://example.com/memory</p><p>Enterprise AI memory needs maintained claims, source-backed sections, and fresh evidence review.</p>',
      highlights: [
        {
          _id: new mongoose.Types.ObjectId().toString(),
          text: 'Maintained claims keep AI memory pages alive.',
          tags: ['memory']
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);
  const Connection = createFakeConnectionModel();
  const app = express();
  app.use(express.json());
  const proposalMaintainCalls = [];
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: req.headers['x-test-user'] || 'user-1' };
      next();
    },
    WikiPage,
    WikiProposal,
    Connection,
    Article,
    maintainWikiPage: async ({ page, userId }) => {
      proposalMaintainCalls.push({ pageId: String(page._id), userId });
      const isProposalAccept = page.title === 'Accepted Proposal Page';
      page.title = page.title || 'Maintained proposal page';
      page.sourceScope = 'entire_library';
      page.body = {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: page.title }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: isProposalAccept ? 'Core Idea' : 'Key Signals' }] },
          { type: 'paragraph', content: [{ type: 'text', text: isProposalAccept ? 'Accepted proposal returned as a maintained article.' : 'Enterprise AI memory needs maintained claims, source-backed sections, and fresh evidence review.' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'The response should not expose the starter scaffold.' }] }
        ]
      };
      page.plainText = isProposalAccept
        ? `${page.title}\nCore Idea\nAccepted proposal returned as a maintained article.\nEvidence\nThe response should not expose the starter scaffold.`
        : `${page.title}\nKey Signals\nEnterprise AI memory needs maintained claims, source-backed sections, and fresh evidence review.\nEvidence\nThe response should not expose the starter scaffold.`;
      page.aiState = {
        ...(page.aiState || {}),
        draftStatus: 'ready',
        draftRequestedAt: page.aiState?.draftRequestedAt || new Date(),
        draftStartedAt: page.aiState?.draftStartedAt || new Date(),
        draftCompletedAt: new Date(),
        maintenanceSummary: 'Maintained synchronously from proposal accept.',
        lastDraftedAt: new Date(),
        changeLog: [
          {
            type: 'draft',
            title: 'Maintained page',
            summary: 'Rebuilt the wiki page from available source evidence.',
            at: new Date()
          }
        ],
        suggestions: [
          {
            id: 'suggestion-review-evidence',
            type: 'gap',
            title: 'Review evidence',
            text: 'Check whether the evidence section captures the strongest support.',
            sourceRefIds: []
          }
        ]
      };
      if (!isProposalAccept) {
        page.sourceRefs = attachSourceHelpers(page);
        if (!page.sourceRefs.some(source => source.title === 'Enterprise AI memory article')) {
          page.sourceRefs.push({
            _id: new mongoose.Types.ObjectId().toString(),
            type: 'article',
            title: 'Enterprise AI memory article',
            snippet: 'Enterprise AI memory needs maintained claims, source-backed sections, and fresh evidence review.',
            addedBy: 'ai'
          });
          attachSourceHelpers(page);
        }
      }
      page.claims = [{
        claimId: 'claim-maintained-proposal',
        text: 'Accepted proposal returned as a maintained article.',
        section: 'Core Idea',
        support: 'unsupported',
        citationIds: [],
        sourceRefIds: [],
        contradictedByCitationIds: []
      }];
      return page;
    }
  }));

  const server = await listen(app);
  const url = `http://127.0.0.1:${server.address().port}`;

  try {
    const created = await request(url, '/api/wiki/pages', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Contract Page',
        pageType: 'question',
        sourceScope: 'selected_sources',
        createdFrom: {
          type: 'highlight',
          objectId: new mongoose.Types.ObjectId().toString(),
          text: 'A highlight becomes a Wiki page.',
          label: 'Highlight source'
        },
        initialSourceRef: {
          type: 'highlight',
          title: 'Saved highlight',
          snippet: 'A highlight becomes a Wiki page.'
        }
      })
    });
    assert.strictEqual(created.res.status, 201, created.text);
    assert.strictEqual(created.body.visibility, 'private');
    assert.strictEqual(created.body.pageType, 'question');
    assert.strictEqual(created.body.sourceRefs.length, 1);
    assert.deepStrictEqual(created.body.aiState.suggestions, []);

    const listed = await request(url, '/api/wiki/pages?pageType=question&visibility=private');
    assert.strictEqual(listed.res.status, 200, listed.text);
    assert.ok(Array.isArray(listed.body));
    assert.strictEqual(listed.body.length, 1);
    assert.strictEqual(listed.body[0]._id, created.body._id);

    const hiddenFromOtherUser = await request(url, `/api/wiki/pages/${created.body._id}`, {
      headers: { 'x-test-user': 'user-2' }
    });
    assert.strictEqual(hiddenFromOtherUser.res.status, 404, hiddenFromOtherUser.text);

    const invalidBody = await request(url, `/api/wiki/pages/${created.body._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: [] })
    });
    assert.strictEqual(invalidBody.res.status, 400, invalidBody.text);

    const proposalId = new mongoose.Types.ObjectId().toString();
    const proposal = new WikiProposal({
      _id: proposalId,
      userId: 'user-1',
      status: 'pending',
      proposalType: 'repeated_theme',
      title: 'Accepted Proposal Page',
      thesis: 'This proposal should be maintained before the response returns.',
      whyNow: 'Found across sources.',
      sourceRefs: [{ type: 'article', objectId: new mongoose.Types.ObjectId().toString(), title: 'Proposal source' }],
      starterClaims: ['Starter claim should not be the final returned article.'],
      openQuestions: ['Starter question should not be the final returned article.']
    });
    await proposal.save();

    const acceptedProposal = await request(url, `/api/wiki/proposals/${proposalId}/accept`, { method: 'POST' });
    assert.strictEqual(acceptedProposal.res.status, 201, acceptedProposal.text);
    assert.strictEqual(acceptedProposal.body.page.aiState.draftStatus, 'ready');
    assert.strictEqual(acceptedProposal.body.page.aiState.maintenanceSummary, 'Maintained synchronously from proposal accept.');
    assert.ok(acceptedProposal.body.page.plainText.includes('Core Idea'));
    assert.ok(acceptedProposal.body.page.plainText.includes('Evidence'));
    assert.ok(!acceptedProposal.body.page.plainText.includes('Current Understanding'));
    assert.ok(!acceptedProposal.body.page.plainText.includes('Why This Page Exists'));
    assert.strictEqual(proposalMaintainCalls.length, 1);

    const patched = await request(url, `/api/wiki/pages/${created.body._id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'Contract Page Updated',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated contract body.' }] }]
        }
      })
    });
    assert.strictEqual(patched.res.status, 200, patched.text);
    assert.strictEqual(patched.body.title, 'Contract Page Updated');
    assert.ok(patched.body.plainText.includes('Updated contract body'));

    const maintained = await request(url, `/api/wiki/pages/${created.body._id}/ai/draft`, { method: 'POST' });
    assert.strictEqual(maintained.res.status, 200, maintained.text);
    assert.strictEqual(maintained.body.aiState.draftStatus, 'ready');
    assert.ok(maintained.body.aiState.draftRequestedAt);
    assert.ok(maintained.body.aiState.draftStartedAt);
    assert.ok(maintained.body.aiState.draftCompletedAt);
    assert.strictEqual(maintained.body.sourceScope, 'entire_library');
    assert.ok(maintained.body.plainText.includes('Enterprise AI memory'));
    assert.ok(maintained.body.plainText.includes('Key Signals'));
    assert.ok(!maintained.body.plainText.includes('Updated contract body'));
    assert.ok(!maintained.body.plainText.includes('<p>'));
    assert.ok(!maintained.body.plainText.includes('</p>'));
    assert.ok(!maintained.body.plainText.includes('https://example.com/memory'));
    assert.ok(!maintained.body.plainText.includes('contributes evidence for this page'));
    assert.ok(!maintained.body.plainText.includes('(supported)'));
    assert.ok(maintained.body.sourceRefs.some(source => source.title === 'Enterprise AI memory article'));
    assert.ok(maintained.body.aiState.maintenanceSummary);
    assert.ok(Array.isArray(maintained.body.aiState.health.newItems));
    assert.ok(maintained.body.aiState.changeLog.length >= 1);
    assert.ok(maintained.body.aiState.suggestions.length >= 1);

    const linkedPage = new WikiPage({
      userId: 'user-1',
      title: 'Enterprise AI memory',
      slug: 'enterprise-ai-memory',
      pageType: 'topic',
      status: 'published',
      plainText: 'A destination page for Enterprise AI memory.'
    });
    await linkedPage.save();
    const sourceRecord = WikiPage.records.find(record => String(record._id) === String(created.body._id));
    sourceRecord.body = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'This draft should link Enterprise AI memory inside the body.' }]
      }]
    };
    sourceRecord.plainText = 'This draft should link Enterprise AI memory inside the body.';

    const autolinks = await request(url, `/api/wiki/pages/${created.body._id}/autolinks`);
    assert.strictEqual(autolinks.res.status, 200, autolinks.text);
    assert.ok(autolinks.body.suggestions.some(suggestion => suggestion.pageId === linkedPage._id));

    const appliedAutolink = await request(url, `/api/wiki/pages/${created.body._id}/autolinks/${linkedPage._id}/apply`, { method: 'POST' });
    assert.strictEqual(appliedAutolink.res.status, 200, appliedAutolink.text);
    const linkedText = appliedAutolink.body.body.content[0].content.find(node => node.text === 'Enterprise AI memory');
    assert.strictEqual(linkedText.marks[0].type, 'wikiLink');
    assert.strictEqual(linkedText.marks[0].attrs.pageId, String(linkedPage._id));
    const pageToPageEdge = Connection.records.find(record => (
      record.fromType === 'wiki_page'
      && record.fromId === String(created.body._id)
      && record.toType === 'wiki_page'
      && record.toId === String(linkedPage._id)
    ));
    assert.ok(pageToPageEdge);
    const edgeCountAfterApply = Connection.records.length;

    const duplicateAutolink = await request(url, `/api/wiki/pages/${created.body._id}/autolinks/${linkedPage._id}/apply`, { method: 'POST' });
    assert.strictEqual(duplicateAutolink.res.status, 409, duplicateAutolink.text);
    assert.strictEqual(Connection.records.length, edgeCountAfterApply);

    const sourceArticleId = new mongoose.Types.ObjectId().toString();
    const attachedSource = await request(url, `/api/wiki/pages/${created.body._id}/sources`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'article',
        objectId: sourceArticleId,
        title: 'Graph source'
      })
    });
    assert.strictEqual(attachedSource.res.status, 201, attachedSource.text);
    assert.ok(Connection.records.some(record => (
      record.fromType === 'article'
      && record.fromId === sourceArticleId
      && record.toType === 'wiki_page'
      && record.toId === String(created.body._id)
      && record.relationType === 'supports'
    )));

    const rebuiltPageGraph = await request(url, `/api/wiki/pages/${created.body._id}/graph/rebuild`, { method: 'POST' });
    assert.strictEqual(rebuiltPageGraph.res.status, 200, rebuiltPageGraph.text);
    assert.ok(rebuiltPageGraph.body.createdCount >= 2);

    const rebuiltGraph = await request(url, '/api/wiki/graph/rebuild', {
      method: 'POST',
      body: JSON.stringify({ limit: 25 })
    });
    assert.strictEqual(rebuiltGraph.res.status, 200, rebuiltGraph.text);
    assert.ok(rebuiltGraph.body.pagesProcessed >= 2);

    const addedSourceIndex = attachedSource.body.sourceRefs.length;
    const pageWithClaim = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Graph source supports this claim.',
          marks: [{ type: 'claim', attrs: { claimId: 'claim-route-1', support: 'supported', citationIndexes: [addedSourceIndex] } }]
        }]
      }]
    };
    const patchedClaim = await request(url, `/api/wiki/pages/${created.body._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: pageWithClaim })
    });
    assert.strictEqual(patchedClaim.res.status, 200, patchedClaim.text);
    assert.strictEqual(patchedClaim.body.claims.length, 1);
    assert.strictEqual(patchedClaim.body.claims[0].claimId, 'claim-route-1');
    assert.strictEqual(patchedClaim.body.claims[0].citationIds.length, 1);
    assert.ok(Connection.records.some(record => (
      record.fromType === 'article'
      && String(record.fromId) === sourceArticleId
      && record.toType === 'wiki_claim'
      && record.toId === `${created.body._id}:claim-route-1`
      && record.relationType === 'supports'
    )));

    const invalidSource = await request(url, `/api/wiki/pages/${created.body._id}/sources`, {
      method: 'POST',
      body: JSON.stringify({ type: 'bad-source' })
    });
    assert.strictEqual(invalidSource.res.status, 400, invalidSource.text);

    const archived = await request(url, `/api/wiki/pages/${created.body._id}`, { method: 'DELETE' });
    assert.strictEqual(archived.res.status, 200, archived.text);
    assert.strictEqual(archived.body.status, 'archived');

    const activeAfterArchive = await request(url, '/api/wiki/pages');
    assert.strictEqual(activeAfterArchive.res.status, 200, activeAfterArchive.text);
    assert.ok(activeAfterArchive.body.some(page => page._id === linkedPage._id));
    assert.ok(activeAfterArchive.body.some(page => page._id === acceptedProposal.body.page._id));
    assert.ok(!activeAfterArchive.body.some(page => page._id === created.body._id));

    const archivedList = await request(url, '/api/wiki/pages?status=archived');
    assert.strictEqual(archivedList.res.status, 200, archivedList.text);
    assert.strictEqual(archivedList.body.length, 1);
    assert.strictEqual(archivedList.body[0]._id, created.body._id);
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('wikiRoutes contract tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
