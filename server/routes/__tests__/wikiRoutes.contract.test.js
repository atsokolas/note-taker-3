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

const attachDiscussionHelpers = (doc) => {
  doc.discussions = Array.isArray(doc.discussions) ? doc.discussions : [];
  doc.discussions.forEach((discussion) => {
    discussion._id = discussion._id || new mongoose.Types.ObjectId().toString();
    discussion.deleteOne = () => {
      const index = doc.discussions.findIndex(item => String(item._id) === String(discussion._id));
      if (index >= 0) doc.discussions.splice(index, 1);
    };
  });
  doc.discussions.id = (id) => doc.discussions.find(discussion => String(discussion._id) === String(id)) || null;
  return doc.discussions;
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
    this.discussions = attachDiscussionHelpers(this);
    this.aiState = this.aiState || {};
  }

  WikiPage.records = records;

  WikiPage.find = (query = {}) => new Query(
    records
      .filter(record => matches(record, query))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map(record => new WikiPage(clone(record)))
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
    copy.discussions = (this.discussions || []).map(discussion => {
      const { deleteOne, ...rest } = discussion;
      return clone(rest);
    });
    return copy;
  };

  WikiPage.prototype.save = async function save() {
    this.updatedAt = new Date();
    attachSourceHelpers(this);
    attachDiscussionHelpers(this);
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

const createFakeWikiSourceEventModel = () => {
  const records = [];

  function WikiSourceEvent(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.status = this.status || 'pending';
    this.affectedPageIds = Array.isArray(this.affectedPageIds) ? this.affectedPageIds : [];
    this.metadata = this.metadata || {};
  }

  WikiSourceEvent.records = records;

  WikiSourceEvent.find = (query = {}) => new Query(
    records.filter(record => matches(record, query)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  );

  WikiSourceEvent.findOne = (query = {}) => {
    const found = records.find(record => matches(record, query));
    return new Query(found ? new WikiSourceEvent(clone(found)) : null);
  };

  WikiSourceEvent.prototype.toObject = function toObject() {
    return clone(this);
  };

  WikiSourceEvent.prototype.save = async function save() {
    this.updatedAt = new Date();
    const stored = this.toObject();
    const index = records.findIndex(record => String(record._id) === String(this._id));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };

  return WikiSourceEvent;
};

const createFakeWikiMaintenanceRunModel = () => {
  const records = [];

  function WikiMaintenanceRun(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.metadata = this.metadata || {};
  }

  WikiMaintenanceRun.records = records;

  WikiMaintenanceRun.find = (query = {}) => new Query(
    records.filter(record => matches(record, query)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  );

  WikiMaintenanceRun.findOne = (query = {}) => {
    const found = records.find(record => matches(record, query));
    return new Query(found ? new WikiMaintenanceRun(clone(found)) : null);
  };

  WikiMaintenanceRun.findOneAndUpdate = async (query = {}, updates = {}, options = {}) => {
    let found = records.find(record => matches(record, query));
    if (!found && options.upsert) {
      found = {
        _id: new mongoose.Types.ObjectId().toString(),
        ...query,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      records.push(found);
    }
    if (!found) return null;
    Object.assign(found, updates.$set || updates, { updatedAt: new Date() });
    return new WikiMaintenanceRun(clone(found));
  };

  WikiMaintenanceRun.prototype.toObject = function toObject() {
    return clone(this);
  };

  WikiMaintenanceRun.prototype.save = async function save() {
    this.updatedAt = new Date();
    const stored = this.toObject();
    const index = records.findIndex(record => String(record._id) === String(this._id));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };

  return WikiMaintenanceRun;
};

const createFakeWikiSchemaSettingsModel = () => {
  const records = [];

  function WikiSchemaSettings(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.snapshots = Array.isArray(this.snapshots)
      ? this.snapshots.map(snapshot => ({
        ...snapshot,
        _id: snapshot._id || new mongoose.Types.ObjectId().toString()
      }))
      : [];
  }

  WikiSchemaSettings.records = records;

  WikiSchemaSettings.findOne = async (query = {}) => {
    const found = records.find(record => matches(record, query));
    return found ? new WikiSchemaSettings(clone(found)) : null;
  };

  WikiSchemaSettings.prototype.toObject = function toObject() {
    return clone(this);
  };

  WikiSchemaSettings.prototype.save = async function save() {
    this.updatedAt = new Date();
    const stored = this.toObject();
    const index = records.findIndex(record => String(record.userId) === String(this.userId));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };

  return WikiSchemaSettings;
};

const createFakeWikiRevisionModel = () => {
  const records = [];

  function WikiRevision(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
  }

  WikiRevision.records = records;
  WikiRevision.find = (query = {}) => new Query(records.filter(record => matches(record, query)));
  WikiRevision.findOne = (query = {}) => {
    const found = records
      .filter(record => matches(record, query))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return new Query(found ? new WikiRevision(clone(found)) : null);
  };

  WikiRevision.prototype.toObject = function toObject() {
    return clone(this);
  };

  WikiRevision.prototype.save = async function save() {
    const stored = this.toObject();
    const index = records.findIndex(record => String(record._id) === String(this._id));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };

  return WikiRevision;
};

const createFakeWikiLintRunModel = () => {
  const records = [];

  function WikiLintRun(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.findings = this.findings || {};
  }

  WikiLintRun.records = records;
  WikiLintRun.find = (query = {}) => new Query(records.filter(record => matches(record, query)));
  WikiLintRun.findOne = (query = {}) => {
    const found = records.find(record => matches(record, query));
    return new Query(found ? new WikiLintRun(clone(found)) : null);
  };

  WikiLintRun.prototype.toObject = function toObject() {
    return clone(this);
  };

  WikiLintRun.prototype.markModified = function markModified() {};

  WikiLintRun.prototype.save = async function save() {
    const stored = this.toObject();
    const index = records.findIndex(record => String(record._id) === String(this._id));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };

  return WikiLintRun;
};

const createFakeConnectorActionLogModel = () => {
  const records = [];

  function ConnectorActionLog(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
  }

  ConnectorActionLog.records = records;
  ConnectorActionLog.find = (query = {}) => new Query(records.filter(record => matches(record, query)));

  ConnectorActionLog.create = async (payload = {}) => {
    const row = new ConnectorActionLog(payload);
    records.push(row.toObject());
    return row;
  };

  ConnectorActionLog.prototype.toObject = function toObject() {
    return clone(this);
  };

  ConnectorActionLog.prototype.save = async function save() {
    records.push(this.toObject());
    return this;
  };

  return ConnectorActionLog;
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
  const WikiRevision = createFakeWikiRevisionModel();
  const WikiLintRun = createFakeWikiLintRunModel();
  const WikiSourceEvent = createFakeWikiSourceEventModel();
  const WikiMaintenanceRun = createFakeWikiMaintenanceRunModel();
  const WikiSchemaSettings = createFakeWikiSchemaSettingsModel();
  const ConnectorActionLog = createFakeConnectorActionLogModel();
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
      if (req.headers['x-agent-token-id']) {
        req.agentToken = {
          id: req.headers['x-agent-token-id'],
          _id: req.headers['x-agent-token-id'],
          label: req.headers['x-agent-token-label'] || 'Codex local',
          scopes: ['read', 'agent-write']
        };
      }
      next();
    },
    WikiPage,
    WikiProposal,
    WikiRevision,
    WikiLintRun,
    WikiSourceEvent,
    WikiMaintenanceRun,
    WikiSchemaSettings,
    ConnectorActionLog,
    Connection,
    Article,
    maintainWikiPage: async ({ page, userId, onProgress }) => {
      proposalMaintainCalls.push({ pageId: String(page._id), userId });
      if (onProgress) {
        await onProgress({
          stage: 'test_progress',
          summary: 'Fake maintenance progress event.'
        });
      }
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
    const unsupportedCreate = await request(url, '/api/wiki/pages', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Imported Page',
        sourceRefs: [{ title: 'Raw source' }]
      })
    });
    assert.strictEqual(unsupportedCreate.res.status, 400, unsupportedCreate.text);
    assert.match(unsupportedCreate.body.error, /Unsupported wiki page metadata fields: sourceRefs/);

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

    const legacyPerson = await request(url, '/api/wiki/pages', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Legacy Person Page',
        pageType: 'person'
      })
    });
    assert.strictEqual(legacyPerson.res.status, 201, legacyPerson.text);
    assert.strictEqual(legacyPerson.body.pageType, 'entity');

    const listed = await request(url, '/api/wiki/pages?pageType=question&visibility=private');
    assert.strictEqual(listed.res.status, 200, listed.text);
    assert.ok(Array.isArray(listed.body));
    assert.strictEqual(listed.body.length, 1);
    assert.strictEqual(listed.body[0]._id, created.body._id);

    const listedLegacyPerson = await request(url, '/api/wiki/pages?pageType=person');
    assert.strictEqual(listedLegacyPerson.res.status, 200, listedLegacyPerson.text);
    assert.strictEqual(listedLegacyPerson.body.length, 1);
    assert.strictEqual(listedLegacyPerson.body[0].pageType, 'entity');

    const graphSizedList = await request(url, '/api/wiki/pages?limit=500');
    assert.strictEqual(graphSizedList.res.status, 200, graphSizedList.text);
    assert.ok(graphSizedList.body.length >= 2);

    const defaultSchema = await request(url, '/api/wiki/schema');
    assert.strictEqual(defaultSchema.res.status, 200, defaultSchema.text);
    assert.ok(defaultSchema.body.content.includes('Page types I want'));

    const savedSchema = await request(url, '/api/wiki/schema', {
      method: 'PUT',
      body: JSON.stringify({ content: '# Wiki Schema\n\n## Ingest workflow\n- Prefer source-backed updates.' })
    });
    assert.strictEqual(savedSchema.res.status, 200, savedSchema.text);
    assert.strictEqual(savedSchema.body.content, '# Wiki Schema\n\n## Ingest workflow\n- Prefer source-backed updates.');
    assert.strictEqual(savedSchema.body.snapshots.length, 1);

    const updatedSchema = await request(url, '/api/wiki/schema', {
      method: 'PUT',
      body: JSON.stringify({ content: '# Wiki Schema\n\n## Voice and tone\n- Keep it terse.' })
    });
    assert.strictEqual(updatedSchema.res.status, 200, updatedSchema.text);
    assert.strictEqual(updatedSchema.body.snapshots.length, 2);

    const revertedSchema = await request(url, '/api/wiki/schema/revert', {
      method: 'POST',
      body: JSON.stringify({ snapshotId: savedSchema.body.snapshots[0].id })
    });
    assert.strictEqual(revertedSchema.res.status, 200, revertedSchema.text);
    assert.strictEqual(revertedSchema.body.content, savedSchema.body.content);
    assert.strictEqual(revertedSchema.body.snapshots.length, 3);

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

    const patchedLegacySynthesis = await request(url, `/api/wiki/pages/${created.body._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pageType: 'synthesis' })
    });
    assert.strictEqual(patchedLegacySynthesis.res.status, 200, patchedLegacySynthesis.text);
    assert.strictEqual(patchedLegacySynthesis.body.pageType, 'overview');

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

    const markdown = await request(url, `/api/wiki/pages/${created.body._id}/markdown`);
    assert.strictEqual(markdown.res.status, 200, markdown.text);
    assert.match(markdown.res.headers.get('content-type') || '', /text\/markdown/);
    assert.match(markdown.res.headers.get('content-disposition') || '', /attachment; filename="contract-page-updated\.md"/);
    assert.ok(markdown.text.includes('title: "Contract Page Updated"'));
    assert.ok(markdown.text.includes('## Key Signals'));
    assert.ok(markdown.text.includes('## References'));
    assert.ok(markdown.text.includes('Enterprise AI memory article'));

    const missingMarkdown = await request(url, `/api/wiki/pages/${new mongoose.Types.ObjectId()}/markdown`);
    assert.strictEqual(missingMarkdown.res.status, 404, missingMarkdown.text);
    assert.strictEqual(missingMarkdown.body.error, 'Wiki page not found.');

    const streamed = await request(url, `/api/wiki/pages/${created.body._id}/ai/draft/stream`, { method: 'POST' });
    assert.strictEqual(streamed.res.status, 200, streamed.text);
    assert.match(streamed.res.headers.get('content-type') || '', /text\/event-stream/);
    assert.ok(streamed.text.includes('event: wiki-page'));
    assert.ok(streamed.text.includes('"stage":"maintaining"'));
    assert.ok(streamed.text.includes('"stage":"test_progress"'));
    assert.ok(streamed.text.includes('"stage":"complete"'));

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

    const lintRun = await request(url, '/api/wiki/lint', {
      method: 'POST',
      body: JSON.stringify({ pageId: created.body._id })
    });
    assert.strictEqual(lintRun.res.status, 200, lintRun.text);
    assert.ok(lintRun.body.runId);
    assert.strictEqual(lintRun.body.scope, 'page');
    assert.ok(Array.isArray(lintRun.body.findings.gaps));
    assert.ok(lintRun.body.findings.gaps[0].id);
    assert.strictEqual(lintRun.body.findings.gaps[0].status, 'open');
    assert.ok(WikiLintRun.records.some(run => String(run._id) === String(lintRun.body.runId)));

    const streamedLint = await request(url, '/api/wiki/lint/stream', {
      method: 'POST',
      body: JSON.stringify({ pageId: created.body._id })
    });
    assert.strictEqual(streamedLint.res.status, 200, streamedLint.text);
    assert.ok(streamedLint.text.includes('event: wiki-lint'));
    assert.ok(streamedLint.text.includes('"stage":"complete"'));

    const lintDetail = await request(url, `/api/wiki/lint/${lintRun.body.runId}`);
    assert.strictEqual(lintDetail.res.status, 200, lintDetail.text);
    assert.strictEqual(lintDetail.body.runId, lintRun.body.runId);

    const gapFindingId = lintRun.body.findings.gaps[0].id;
    const ignoredFinding = await request(url, `/api/wiki/lint/${lintRun.body.runId}/findings/${encodeURIComponent(gapFindingId)}/ignore`, { method: 'POST' });
    assert.strictEqual(ignoredFinding.res.status, 200, ignoredFinding.text);
    assert.strictEqual(ignoredFinding.body.status, 'ignored');
    assert.strictEqual(ignoredFinding.body.run.resolutions[gapFindingId].status, 'ignored');

    const linkedTarget = new WikiPage({
      userId: 'user-1',
      title: 'Systems Thinking',
      slug: 'systems-thinking',
      pageType: 'topic',
      status: 'published',
      plainText: 'A destination page for Systems Thinking.'
    });
    await linkedTarget.save();
    const linkSource = new WikiPage({
      userId: 'user-1',
      title: 'Process Notes',
      slug: 'process-notes',
      pageType: 'topic',
      status: 'published',
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'This page mentions Systems Thinking without a link.' }]
        }]
      },
      plainText: 'This page mentions Systems Thinking without a link.'
    });
    await linkSource.save();
    const missingLinkRun = await request(url, '/api/wiki/lint', {
      method: 'POST',
      body: JSON.stringify({ pageId: linkSource._id })
    });
    assert.strictEqual(missingLinkRun.res.status, 200, missingLinkRun.text);
    const missingLinkFinding = missingLinkRun.body.findings.missingLinks.find(finding => finding.targetPageId === linkedTarget._id);
    assert.ok(missingLinkFinding, JSON.stringify(missingLinkRun.body.findings.missingLinks));
    const fixedLink = await request(url, `/api/wiki/lint/${missingLinkRun.body.runId}/findings/${encodeURIComponent(missingLinkFinding.id)}/fix`, { method: 'POST' });
    assert.strictEqual(fixedLink.res.status, 200, fixedLink.text);
    assert.strictEqual(fixedLink.body.status, 'fixed');
    assert.strictEqual(fixedLink.body.page._id, linkSource._id);

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

    const ingest = await request(url, '/api/wiki/ingest', {
      method: 'POST',
      body: JSON.stringify({
        source: {
          type: 'text',
          text: 'Enterprise AI memory needs source-backed maintenance and fresh claims.',
          url: 'https://example.com/ingest-source'
        }
      })
    });
    assert.strictEqual(ingest.res.status, 202, ingest.text);
    assert.ok(ingest.body.runId);
    assert.strictEqual(ingest.body.sourceRef.type, 'external');
    assert.strictEqual(ingest.body.status, 'processed');
    assert.ok(ingest.body.affectedPageIds.includes(String(created.body._id)));
    assert.ok(ingest.body.summary.includes('Updated'));

    const ingestDetails = await request(url, `/api/wiki/ingest/${ingest.body.runId}`);
    assert.strictEqual(ingestDetails.res.status, 200, ingestDetails.text);
    assert.strictEqual(ingestDetails.body.runId, ingest.body.runId);
    assert.ok(ingestDetails.body.affectedPageIds.includes(String(created.body._id)));
    assert.ok(ingestDetails.body.timeline.some(item => item.type === 'maintenance'));

    const asked = await request(url, `/api/wiki/pages/${created.body._id}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question: 'What changed after the ingest?' })
    });
    assert.strictEqual(asked.res.status, 200, asked.text);
    assert.strictEqual(asked.body.discussions.length, 1);

    const neighborPage = new WikiPage({
      userId: 'user-1',
      title: 'Neighbor Page',
      slug: 'neighbor-page',
      pageType: 'topic',
      status: 'published',
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'This page should link to Ingest Change Answer when it exists.' }]
        }]
      },
      plainText: 'This page should link to Ingest Change Answer when it exists.'
    });
    await neighborPage.save();

    const promoted = await request(
      url,
      `/api/wiki/pages/${created.body._id}/discussions/${asked.body.discussions[0]._id}/promote`,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Ingest Change Answer' })
      }
    );
    assert.strictEqual(promoted.res.status, 201, promoted.text);
    assert.strictEqual(promoted.body.page.title, 'Ingest Change Answer');
    assert.strictEqual(promoted.body.page.pageType, 'question');
    assert.strictEqual(promoted.body.page.createdFrom.type, 'question');
    assert.strictEqual(promoted.body.page.createdFrom.label, 'Contract Page Updated');
    assert.ok(promoted.body.page.plainText.includes('Answer'));
    assert.ok(promoted.body.page.plainText.includes('Source question'));
    assert.ok(!promoted.body.page.plainText.includes('You asked:'));
    assert.ok(promoted.body.page.sourceRefs.length >= 1);
    assert.ok(WikiPage.records.some(record => String(record._id) === String(promoted.body.page._id)));
    assert.ok(promoted.body.linkedNeighborPageIds.includes(String(neighborPage._id)));
    const linkedNeighbor = WikiPage.records.find(record => String(record._id) === String(neighborPage._id));
    const neighborLinkText = linkedNeighbor.body.content[0].content.find(node => node.text === 'Ingest Change Answer');
    assert.strictEqual(neighborLinkText.marks[0].type, 'wikiLink');

    const citedOnlyDiscussionId = new mongoose.Types.ObjectId().toString();
    const sourceRecordForPromotion = WikiPage.records.find(record => String(record._id) === String(created.body._id));
    sourceRecordForPromotion.sourceRefs = [
      {
        _id: new mongoose.Types.ObjectId().toString(),
        type: 'article',
        title: 'Uncited source',
        snippet: 'This source should not be copied.',
        addedBy: 'user'
      },
      {
        _id: new mongoose.Types.ObjectId().toString(),
        type: 'article',
        title: 'Only cited source',
        snippet: 'This source should be copied and remapped to citation 1.',
        addedBy: 'user'
      }
    ];
    sourceRecordForPromotion.discussions = [{
      _id: citedOnlyDiscussionId,
      question: 'Why does index remapping matter?',
      answer: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Only the second source backs this answer.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-promoted-remap', support: 'partial', citationIndexes: [2] } }]
          }]
        }]
      },
      citationIndexesUsed: [2],
      status: 'answered',
      askedAt: new Date()
    }];
    const remappedPromotion = await request(
      url,
      `/api/wiki/pages/${created.body._id}/discussions/${citedOnlyDiscussionId}/promote`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    );
    assert.strictEqual(remappedPromotion.res.status, 201, remappedPromotion.text);
    assert.strictEqual(remappedPromotion.body.page.title, 'Why does index');
    assert.strictEqual(remappedPromotion.body.page.sourceRefs.length, 1);
    assert.strictEqual(remappedPromotion.body.page.sourceRefs[0].title, 'Only cited source');
    const remappedClaimText = remappedPromotion.body.page.body.content[2].content[0];
    assert.deepStrictEqual(remappedClaimText.marks[0].attrs.citationIndexes, [1]);
    assert.strictEqual(remappedPromotion.body.page.claims[0].citationIds.length, 1);
    const fetchedPromotedPage = await request(url, `/api/wiki/pages/${remappedPromotion.body.page._id}`);
    assert.strictEqual(fetchedPromotedPage.res.status, 200, fetchedPromotedPage.text);
    assert.strictEqual(fetchedPromotedPage.body._id, remappedPromotion.body.page._id);

    const agentTokenId = new mongoose.Types.ObjectId().toString();
    const agentPageList = await request(url, '/api/wiki/pages', {
      headers: {
        'x-agent-token-id': agentTokenId,
        'x-agent-token-label': 'Codex local'
      }
    });
    assert.strictEqual(agentPageList.res.status, 200, agentPageList.text);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(ConnectorActionLog.records.some(record => (
      record.action === 'list_pages' &&
      record.actorType === 'agent_token' &&
      String(record.agentTokenId) === agentTokenId
    )));

    const activity = await request(url, '/api/wiki/activity?limit=20');
    assert.strictEqual(activity.res.status, 200, activity.text);
    assert.ok(activity.body.events.some(event => event.type === 'ingest' && event.runId === ingest.body.runId));
    assert.ok(activity.body.events.some(event => event.type === 'ask' && event.pageId === String(created.body._id)));
    assert.ok(activity.body.events.some(event => event.type === 'lint' && event.runId === lintRun.body.runId));
    assert.ok(activity.body.events.some(event => event.type === 'maintenance' && event.runId));
    assert.ok(activity.body.events.some(event => event.type === 'external_agent_action' && event.title.includes('list pages')));
    const activityTimes = activity.body.events.map(event => new Date(event.at).getTime());
    assert.deepStrictEqual(activityTimes, [...activityTimes].sort((a, b) => b - a));
    const futureActivity = await request(url, '/api/wiki/activity?limit=20&since=2100-01-01T00%3A00%3A00.000Z');
    assert.strictEqual(futureActivity.res.status, 200, futureActivity.text);
    assert.deepStrictEqual(futureActivity.body.events, []);
    const invalidSinceActivity = await request(url, '/api/wiki/activity?since=not-a-date');
    assert.strictEqual(invalidSinceActivity.res.status, 400, invalidSinceActivity.text);

    const undoneIngest = await request(url, `/api/wiki/ingest/${ingest.body.runId}/undo`, { method: 'POST' });
    assert.strictEqual(undoneIngest.res.status, 200, undoneIngest.text);
    assert.ok(undoneIngest.body.undoneAt);
    assert.ok(undoneIngest.body.restoredPageIds.includes(String(created.body._id)));
    const undoneAgain = await request(url, `/api/wiki/ingest/${ingest.body.runId}/undo`, { method: 'POST' });
    assert.strictEqual(undoneAgain.res.status, 409, undoneAgain.text);

    const activityAfterUndo = await request(url, '/api/wiki/activity?limit=20');
    assert.strictEqual(activityAfterUndo.res.status, 200, activityAfterUndo.text);
    assert.ok(activityAfterUndo.body.events.some(event => event.type === 'ingest_undo' && event.runId === ingest.body.runId));

    const schemaSuggestions = await request(url, '/api/wiki/schema/suggestions', {
      method: 'POST',
      body: JSON.stringify({
        currentSchema: '## Page types I want\n- topic: default research page'
      })
    });
    assert.strictEqual(schemaSuggestions.res.status, 200, schemaSuggestions.text);
    assert.ok(schemaSuggestions.body.runId);
    assert.ok(schemaSuggestions.body.proposedPatch.includes('## Suggested schema updates'));
    assert.ok(schemaSuggestions.body.suggestions.length >= 1);
    assert.strictEqual(schemaSuggestions.body.context.recentSourceEventCount >= 1, true);
    assert.ok(WikiMaintenanceRun.records.some(run => (
      run.trigger === 'batch'
      && run.status === 'completed'
      && run.metadata?.kind === 'schema_suggestions'
    )));

    const exported = await request(url, '/api/wiki/export.zip');
    assert.strictEqual(exported.res.status, 200, exported.text);
    assert.match(exported.res.headers.get('content-type') || '', /application\/zip/);
    assert.ok(exported.text.length > 50);

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
