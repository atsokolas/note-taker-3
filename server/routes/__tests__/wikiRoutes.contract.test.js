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

const createFakeWikiBriefingCacheModel = () => {
  const records = [];

  function WikiBriefingCache(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
  }

  WikiBriefingCache.records = records;

  WikiBriefingCache.findOne = (query = {}) => {
    const found = records.find(record => matches(record, query));
    return new Query(found ? new WikiBriefingCache(clone(found)) : null);
  };

  WikiBriefingCache.findOneAndUpdate = async (query = {}, updates = {}, options = {}) => {
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
    return new WikiBriefingCache(clone(found));
  };

  return WikiBriefingCache;
};

const createFakeWikiSharedCollectionModel = () => {
  const records = [];

  function WikiSharedCollection(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.visibility = this.visibility || 'shared';
    this.pageIds = Array.isArray(this.pageIds) ? this.pageIds : [];
  }

  WikiSharedCollection.records = records;

  WikiSharedCollection.findOne = (query = {}) => {
    const found = records.find(record => matches(record, query));
    return new Query(found ? new WikiSharedCollection(clone(found)) : null);
  };

  WikiSharedCollection.prototype.toObject = function toObject() {
    return clone(this);
  };

  WikiSharedCollection.prototype.save = async function save() {
    this.updatedAt = new Date();
    const stored = this.toObject();
    const index = records.findIndex(record => String(record._id) === String(this._id));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };

  return WikiSharedCollection;
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

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const waitForIngestRun = async (url, runId, predicate, attempts = 30) => {
  let latest = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await request(url, `/api/wiki/ingest/${runId}`);
    if (latest.res.status === 200 && predicate(latest.body)) {
      return latest;
    }
    await wait(50);
  }
  return latest;
};

const run = async () => {
  const WikiPage = createFakeWikiPageModel();
  const WikiProposal = createFakeWikiProposalModel();
  const WikiRevision = createFakeWikiRevisionModel();
  const WikiLintRun = createFakeWikiLintRunModel();
  const WikiSourceEvent = createFakeWikiSourceEventModel();
  const WikiMaintenanceRun = createFakeWikiMaintenanceRunModel();
  const WikiBriefingCache = createFakeWikiBriefingCacheModel();
  const WikiSharedCollection = createFakeWikiSharedCollectionModel();
  const WikiSchemaSettings = createFakeWikiSchemaSettingsModel();
  const ConnectorActionLog = createFakeConnectorActionLogModel();
  const Question = createFakeLibraryModel([
    {
      _id: 'question-opportunity-cost',
      userId: 'user-1',
      text: 'Can Opportunity Cost explain capital allocation mistakes?',
      status: 'open',
      conceptName: 'Opportunity Cost'
    }
  ]);
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
  const trackCalls = [];
  const transcriptWatchCalls = [];
  const githubRepoWatchCalls = [];
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
    WikiBriefingCache,
    WikiSharedCollection,
    WikiSchemaSettings,
    ConnectorActionLog,
    Connection,
    Article,
    Question,
    EVENT_NAMES: {
      WIKI_PAGE_CREATED: 'wiki_page_created',
      WIKI_SOURCE_ATTACHED: 'wiki_source_attached',
      WIKI_DRAFT_GENERATED: 'wiki_draft_generated',
      WIKI_SHARED_ADOPTED: 'wiki_shared_adopted',
      WIKI_SCHEMA_SAVED: 'wiki_schema_saved',
      WIKI_SCHEMA_SUGGESTED: 'wiki_schema_suggested',
      WIKI_INGEST_SUBMITTED: 'wiki_ingest_submitted',
      WIKI_INGEST_COMPLETED: 'wiki_ingest_completed',
      WIKI_INGEST_NO_MATCH: 'wiki_ingest_no_match',
      WIKI_QA_PROMOTED: 'wiki_qa_promoted'
    },
    trackEvent: (event) => {
      trackCalls.push(event);
    },
    armTranscriptWatchForPage: async ({
      WikiPage: WikiPageModel,
      userId,
      pageId,
      ticker,
      checkNow
    }) => {
      transcriptWatchCalls.push({ userId, pageId, ticker, checkNow });
      const page = await WikiPageModel.findOne({ _id: pageId, userId });
      page.externalWatches = {
        ...(page.externalWatches || {}),
        transcripts: {
          provider: 'fmp',
          ticker,
          status: 'active',
          lastCheckedAt: new Date('2026-07-04T00:00:00.000Z'),
          lastTranscriptKey: 'MSFT:2026:2:2026-07-01'
        }
      };
      if (typeof page.save === 'function') await page.save();
      return {
        page,
        transcript: { symbol: ticker, year: 2026, quarter: 2, date: '2026-07-01' },
        events: [{
          _id: new mongoose.Types.ObjectId().toString(),
          title: `${ticker} earnings call transcript Q2 2026`,
          status: 'pending',
          externalId: `fmp-transcript:${ticker}:2026:2:2026-07-01`,
          sourceUpdatedAt: new Date('2026-07-01T00:00:00.000Z')
        }]
      };
    },
    armGitHubRepoWatchForPage: async ({
      WikiPage: WikiPageModel,
      userId,
      pageId,
      repo,
      checkNow
    }) => {
      githubRepoWatchCalls.push({ userId, pageId, repo, checkNow });
      if (String(repo || '').includes('rate-limited')) {
        const error = new Error('GitHub request failed with HTTP 403.');
        error.statusCode = 403;
        throw error;
      }
      const [repoOwner, repoName] = String(repo || '').split('/');
      const repoFullName = `${repoOwner}/${repoName}`;
      const page = await WikiPageModel.findOne({ _id: pageId, userId });
      page.externalWatches = {
        ...(page.externalWatches || {}),
        githubRepo: {
          owner: repoOwner,
          repo: repoName,
          defaultBranch: 'main',
          status: 'active',
          lastCheckedAt: new Date('2026-07-04T00:00:00.000Z'),
          lastHeadSha: 'abc1234567890abcdef',
          lastReleaseTag: 'v1.2.3'
        }
      };
      if (typeof page.save === 'function') await page.save();
      return {
        page,
        snapshot: {
          fullName: repoFullName,
          description: 'Agents SDK for TypeScript',
          defaultBranch: 'main',
          headSha: 'abc1234567890abcdef',
          docs: [{ path: 'README.md' }, { path: 'package.json' }],
          latestRelease: { tagName: 'v1.2.3' }
        },
        events: [{
          _id: new mongoose.Types.ObjectId().toString(),
          title: `${repoFullName} README.md`,
          status: 'pending',
          externalId: `github-doc:${repoFullName}:abc1234567890abcdef:README.md:readme-sha`,
          url: `https://github.com/${repoFullName}/blob/abc1234567890abcdef/README.md`,
          sourceUpdatedAt: null,
          provider: 'github-repo',
          metadata: {
            source: 'github-repo',
            fullName: repoFullName,
            path: 'README.md',
            evidenceType: 'document',
            docClass: 'readme',
            commitSha: 'abc1234567890abcdef'
          }
        }, {
          _id: new mongoose.Types.ObjectId().toString(),
          title: `${repoFullName} package.json`,
          status: 'pending',
          externalId: `github-doc:${repoFullName}:abc1234567890abcdef:package.json:package-sha`,
          url: `https://github.com/${repoFullName}/blob/abc1234567890abcdef/package.json`,
          sourceUpdatedAt: null,
          provider: 'github-repo',
          text: [
            `${repoFullName} repository developer evidence source.`,
            'Path: package.json.',
            'Commit: abc1234567890abcdef.',
            '{ "name": "agents-js", "scripts": { "start": "node server/server.js", "wiki:qa": "node scripts/wiki_qa.js", "build": "npm run build --workspace note-taker-ui" } }'
          ].join('\n\n'),
          metadata: {
            source: 'github-repo',
            fullName: repoFullName,
            path: 'package.json',
            evidenceType: 'config',
            docClass: 'config',
            commitSha: 'abc1234567890abcdef'
          }
        }]
      };
    },
    checkGitHubRepoHeadForPage: async ({ page }) => ({
      page,
      head: {
        owner: page.externalWatches?.githubRepo?.owner || '',
        repo: page.externalWatches?.githubRepo?.repo || '',
        headSha: page.externalWatches?.githubRepo?.lastHeadSha || ''
      },
      changed: false
    }),
    maintainWikiPage: async ({
      page,
      userId,
      maintenanceProfile,
      sourceLimit,
      sourceTextLimit,
      skipQualityRebuild,
      streamDraft,
      onProgress
    }) => {
      proposalMaintainCalls.push({
        pageId: String(page._id),
        userId,
        maintenanceProfile,
        sourceLimit,
        sourceTextLimit,
        skipQualityRebuild,
        streamDraft
      });
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
        quality: {
          ok: true,
          status: 'pass',
          failures: []
        },
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
    await new WikiRevision({
      userId: 'user-1',
      pageId: new mongoose.Types.ObjectId().toString(),
      reason: 'source_event',
      summary: 'Added two new tradeoff notes.',
      createdAt: new Date(),
      before: {
        title: 'Opportunity Cost',
        sourceRefs: [],
        claims: [],
        aiState: { health: { contradictions: [] } }
      },
      after: {
        title: 'Opportunity Cost',
        sourceRefs: [
          { id: 's1', title: 'Tradeoff note' },
          { id: 's2', title: 'Capital allocation note' }
        ],
        claims: [{ text: 'Opportunity cost is comparative.', support: 'supported' }],
        aiState: { health: { contradictions: [] } }
      }
    }).save();

    const briefing = await request(url, '/api/wiki/briefing');
    assert.strictEqual(briefing.res.status, 200, briefing.text);
    assert.strictEqual(briefing.body.model, 'stub');
    assert.ok(Array.isArray(briefing.body.recentMaintenanceChanges), 'Briefing should expose maintenance changes.');
    assert.ok(Array.isArray(briefing.body.pagesWithNewSourceMaterial), 'Briefing should expose pages with new source material.');
    assert.ok(Array.isArray(briefing.body.answerableQuestions), 'Briefing should expose answerable questions.');
    assert.ok(briefing.body.nextAction, 'Briefing should expose a next action when return-loop evidence exists.');
    assert.strictEqual(briefing.body.nextAction.type, 'answer_question');
    assert.match(briefing.body.summary, /open question|source material|Opportunity Cost/i);
    assert.strictEqual(briefing.res.headers.get('x-noeis-briefing-cache'), 'MISS');

    const cachedBriefing = await request(url, '/api/wiki/briefing');
    assert.strictEqual(cachedBriefing.res.status, 200, cachedBriefing.text);
    assert.strictEqual(cachedBriefing.res.headers.get('x-noeis-briefing-cache'), 'HIT');
    assert.strictEqual(cachedBriefing.body.summary, briefing.body.summary);

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
    assert.strictEqual(created.body.sourceRefs[0].objectId, created.body.createdFrom.objectId);
    assert.deepStrictEqual(created.body.aiState.suggestions, []);
    assert.ok(Connection.records.some(record => (
      record.fromType === 'highlight'
      && String(record.fromId) === String(created.body.createdFrom.objectId)
      && record.toType === 'wiki_page'
      && String(record.toId) === String(created.body._id)
      && record.relationType === 'supports'
    )));
    assert.ok(Connection.records.some(record => (
      record.fromType === 'wiki_page'
      && String(record.fromId) === String(created.body._id)
      && record.toType === 'highlight'
      && String(record.toId) === String(created.body.createdFrom.objectId)
      && record.relationType === 'supported_by'
    )));

    const transcriptWatch = await request(url, `/api/wiki/pages/${created.body._id}/transcript-watch`, {
      method: 'POST',
      body: JSON.stringify({ ticker: 'msft' })
    });
    assert.strictEqual(transcriptWatch.res.status, 200, transcriptWatch.text);
    assert.strictEqual(transcriptWatch.body.page.externalWatches.transcripts.ticker, 'MSFT');
    assert.strictEqual(transcriptWatch.body.sourceEvents.length, 1);
    assert.strictEqual(transcriptWatchCalls.length, 1);
    assert.deepStrictEqual(transcriptWatchCalls[0], {
      userId: 'user-1',
      pageId: String(created.body._id),
      ticker: 'MSFT',
      checkNow: true
    });

    const githubRepoWatch = await request(url, `/api/wiki/pages/${created.body._id}/github-repo-watch`, {
      method: 'POST',
      body: JSON.stringify({ repo: 'openai/agents-js-watch' })
    });
    assert.strictEqual(githubRepoWatch.res.status, 200, githubRepoWatch.text);
    assert.strictEqual(githubRepoWatch.body.page.externalWatches.githubRepo.owner, 'openai');
    assert.strictEqual(githubRepoWatch.body.page.externalWatches.githubRepo.repo, 'agents-js-watch');
    assert.strictEqual(githubRepoWatch.body.snapshot.fullName, 'openai/agents-js-watch');
    assert.strictEqual(githubRepoWatch.body.snapshot.docCount, 2);
    assert.strictEqual(githubRepoWatch.body.sourceEvents.length, 2);
    assert.ok(githubRepoWatch.body.page.sourceRefs.length >= 1);
    assert.ok(githubRepoWatch.body.page.sourceRefs.some(source => /openai\/agents-js-watch/i.test(source.title || '')));
    const githubRef = githubRepoWatch.body.page.sourceRefs.find(source => /openai\/agents-js-watch/i.test(source.title || ''));
    assert.strictEqual(githubRef.provider, 'github-repo');
    assert.strictEqual(githubRef.metadata.path, 'README.md');
    assert.strictEqual(githubRef.metadata.evidenceType, 'document');
    assert.strictEqual(githubRef.metadata.docClass, 'readme');
    const githubPackageRef = githubRepoWatch.body.page.sourceRefs.find(source => source.metadata?.path === 'package.json');
    assert.ok(githubPackageRef);
    assert.match(githubPackageRef.snippet, /npm run build --workspace note-taker-ui/);
    assert.match(githubPackageRef.snippet, /wiki:qa/);
    assert.deepStrictEqual(githubRepoWatchCalls[0], {
      userId: 'user-1',
      pageId: String(created.body._id),
      repo: 'openai/agents-js-watch',
      checkNow: true
    });

    const repoWikiCreate = await request(url, '/api/wiki/pages/from-github', {
      method: 'POST',
      body: JSON.stringify({ repo: 'https://github.com/openai/agents-js' })
    });
    assert.strictEqual(repoWikiCreate.res.status, 201, repoWikiCreate.text);
    assert.strictEqual(repoWikiCreate.body.page.pageType, 'repo');
    assert.strictEqual(repoWikiCreate.body.page.sourceScope, 'entire_library');
    assert.strictEqual(repoWikiCreate.body.page.createdFrom.label, 'GitHub repo: openai/agents-js');
    assert.strictEqual(repoWikiCreate.body.page.externalWatches.githubRepo.owner, 'openai');
    assert.strictEqual(repoWikiCreate.body.page.aiState.draftStatus, 'ready');
    assert.match(repoWikiCreate.body.page.plainText, /source-backed sections/i);
    assert.strictEqual(repoWikiCreate.body.snapshot.fullName, 'openai/agents-js');
    assert.strictEqual(repoWikiCreate.body.snapshot.docCount, 2);
    assert.strictEqual(repoWikiCreate.body.sourceEvents.length, 2);
    assert.ok(repoWikiCreate.body.page.sourceRefs.length >= 1);
    const repoSourceRef = repoWikiCreate.body.page.sourceRefs.find(source => /openai\/agents-js/i.test(source.title || ''));
    assert.ok(repoSourceRef);
    assert.strictEqual(repoSourceRef.provider, 'github-repo');
    assert.strictEqual(repoSourceRef.metadata.path, 'README.md');
    assert.strictEqual(repoSourceRef.metadata.evidenceType, 'document');
    assert.strictEqual(repoSourceRef.metadata.docClass, 'readme');
    const repoPackageRef = repoWikiCreate.body.page.sourceRefs.find(source => source.metadata?.path === 'package.json');
    assert.ok(repoPackageRef);
    assert.match(repoPackageRef.snippet, /npm run build --workspace note-taker-ui/);
    assert.match(repoPackageRef.snippet, /wiki:qa/);
    assert.deepStrictEqual(githubRepoWatchCalls[githubRepoWatchCalls.length - 1], {
      userId: 'user-1',
      pageId: String(repoWikiCreate.body.page._id),
      repo: 'openai/agents-js',
      checkNow: true
    });
    assert.ok(proposalMaintainCalls.some(call => (
      call.pageId === String(repoWikiCreate.body.page._id)
      && call.maintenanceProfile === 'standard'
      && call.skipQualityRebuild === false
      && call.streamDraft === false
    )));

    const repoPageCountBeforeUpsert = WikiPage.records.filter(page => (
      page.pageType === 'repo'
      && page.createdFrom?.label === 'GitHub repo: openai/agents-js'
    )).length;
    const repoWikiUpdate = await request(url, '/api/wiki/pages/from-github', {
      method: 'POST',
      body: JSON.stringify({ repo: 'OPENAI/agents-js' })
    });
    assert.strictEqual(repoWikiUpdate.res.status, 200, repoWikiUpdate.text);
    assert.strictEqual(repoWikiUpdate.body.action, 'updated');
    assert.strictEqual(String(repoWikiUpdate.body.page._id), String(repoWikiCreate.body.page._id));
    assert.strictEqual(WikiPage.records.filter(page => (
      page.pageType === 'repo'
      && page.createdFrom?.label === 'GitHub repo: openai/agents-js'
    )).length, repoPageCountBeforeUpsert);

    const repoWikiPartial = await request(url, '/api/wiki/pages/from-github', {
      method: 'POST',
      body: JSON.stringify({ repo: 'openai/rate-limited' })
    });
    assert.strictEqual(repoWikiPartial.res.status, 201, repoWikiPartial.text);
    assert.strictEqual(repoWikiPartial.body.page.pageType, 'repo');
    assert.strictEqual(repoWikiPartial.body.page.createdFrom.label, 'GitHub repo: openai/rate-limited');
    assert.strictEqual(repoWikiPartial.body.watchError.statusCode, 403);
    assert.match(repoWikiPartial.body.watchError.message, /GitHub request failed/);
    assert.deepStrictEqual(repoWikiPartial.body.sourceEvents, []);
    assert.deepStrictEqual(githubRepoWatchCalls[githubRepoWatchCalls.length - 1], {
      userId: 'user-1',
      pageId: String(repoWikiPartial.body.page._id),
      repo: 'openai/rate-limited',
      checkNow: true
    });

    const externalPage = await request(url, '/api/wiki/pages', {
      method: 'POST',
      body: JSON.stringify({
        title: 'External Ingest Page',
        pageType: 'topic',
        sourceScope: 'selected_sources',
        createdFrom: {
          type: 'external',
          objectId: 'ingest-run-source',
          label: 'External source'
        },
        initialSourceRef: {
          type: 'external',
          title: 'Outside source',
          url: 'https://example.com/source',
          citationLabel: 'ingest:run-source'
        }
      })
    });
    assert.strictEqual(externalPage.res.status, 201, externalPage.text);
    assert.strictEqual(externalPage.body.sourceRefs.length, 1);
    assert.strictEqual(externalPage.body.sourceRefs[0].url, 'https://example.com/source');
    assert.ok(Connection.records.some(record => (
      record.fromType === 'external'
      && String(record.fromId) === 'https://example.com/source'
      && record.toType === 'wiki_page'
      && String(record.toId) === String(externalPage.body._id)
      && record.relationType === 'supports'
    )));
    assert.ok(Connection.records.some(record => (
      record.fromType === 'wiki_page'
      && String(record.fromId) === String(externalPage.body._id)
      && record.toType === 'external'
      && String(record.toId) === 'https://example.com/source'
      && record.relationType === 'supported_by'
    )));

    const pulledHighlightId = new mongoose.Types.ObjectId().toString();
    const pulledArticleId = new mongoose.Types.ObjectId().toString();
    const multiSourcePage = await request(url, '/api/wiki/pages', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Promoted Think Page',
        pageType: 'overview',
        sourceScope: 'current_item',
        createdFrom: {
          type: 'question',
          objectId: new mongoose.Types.ObjectId().toString(),
          text: 'Promoted question with pulled references.',
          label: 'Think question'
        },
        initialSourceRefs: [
          {
            type: 'Highlight',
            objectId: pulledHighlightId,
            parentObjectId: pulledArticleId,
            title: 'Pulled highlight',
            snippet: 'This was pulled into the Think workspace before promotion.'
          },
          {
            type: 'external',
            title: 'External pulled note',
            url: 'https://example.com/pulled-reference'
          }
        ]
      })
    });
    assert.strictEqual(multiSourcePage.res.status, 201, multiSourcePage.text);
    assert.strictEqual(multiSourcePage.body.sourceRefs.length, 2);
    assert.deepStrictEqual(
      multiSourcePage.body.sourceRefs.map(source => source.type),
      ['highlight', 'external']
    );
    assert.ok(Connection.records.some(record => (
      record.fromType === 'highlight'
      && String(record.fromId) === pulledHighlightId
      && record.toType === 'wiki_page'
      && String(record.toId) === String(multiSourcePage.body._id)
      && record.relationType === 'supports'
    )));
    assert.ok(Connection.records.some(record => (
      record.fromType === 'external'
      && String(record.fromId) === 'https://example.com/pulled-reference'
      && record.toType === 'wiki_page'
      && String(record.toId) === String(multiSourcePage.body._id)
      && record.relationType === 'supports'
    )));
    assert.ok(Connection.records.some(record => (
      record.fromType === 'wiki_page'
      && String(record.fromId) === String(multiSourcePage.body._id)
      && record.toType === 'highlight'
      && String(record.toId) === pulledHighlightId
      && record.relationType === 'supported_by'
    )));

    const hygieneCreated = await request(url, '/api/wiki/pages', {
      method: 'POST',
      body: JSON.stringify({ title: 'Enterprise AI memory' })
    });
    assert.strictEqual(hygieneCreated.res.status, 201, hygieneCreated.text);
    const staleSourcePage = WikiPage.records.find(record => String(record._id) === String(hygieneCreated.body._id));
    staleSourcePage.title = 'Enterprise AI memory';
    staleSourcePage.plainText = 'Enterprise AI memory keeps source-backed claims connected to maintained wiki pages.';
    staleSourcePage.sourceRefs = [
      {
        _id: new mongoose.Types.ObjectId().toString(),
        type: 'article',
        title: 'Enterprise AI memory article',
        snippet: 'Enterprise AI memory needs maintained claims and source-backed sections.',
        citationLabel: '[1]'
      },
      {
        _id: new mongoose.Types.ObjectId().toString(),
        type: 'article',
        title: 'Flounder Mode',
        snippet: 'Founders discuss operating cadence and startup tactics.',
        citationLabel: '[2]'
      },
      {
        _id: new mongoose.Types.ObjectId().toString(),
        type: 'article',
        title: 'Maintained wiki claims',
        snippet: 'Maintained wiki claims keep evidence, source refs, and page updates synchronized.',
        citationLabel: '[3]'
      },
      {
        _id: new mongoose.Types.ObjectId().toString(),
        type: 'article',
        title: 'Source-backed wiki sections',
        snippet: 'Source-backed wiki sections preserve citation context for evidence reviews.',
        citationLabel: '[4]'
      },
      {
        _id: new mongoose.Types.ObjectId().toString(),
        type: 'article',
        title: 'Fed cuts US interest rates again despite flying blind',
        snippet: 'The market moved after a central bank decision and delayed official data.',
        citationLabel: '[5]'
      },
      {
        _id: new mongoose.Types.ObjectId().toString(),
        type: 'article',
        title: 'How to do things if you are not that smart',
        snippet: 'A generic productivity essay about people trying to make work feel meaningful.',
        citationLabel: '[6]'
      }
    ];
    staleSourcePage.body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Enterprise AI memory should cite relevant sources and suppress unrelated stale sources.',
            marks: [{ type: 'claim', attrs: { citationIndexes: [1, 2, 3, 4, 5, 6] } }]
          }]
        },
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Flounder Mode is an unrelated stale source that should not survive just because it leaked into the body.'
          }]
        }
      ]
    };
    staleSourcePage.claims = [{
      claimId: 'claim-stale-source',
      text: 'Enterprise AI memory should cite relevant sources.',
      support: 'supported',
      citationIndexes: [1, 2, 3, 4, 5, 6],
      sourceRefIds: staleSourcePage.sourceRefs.map(source => source._id)
    }];
    attachSourceHelpers(staleSourcePage);
    const sanitizedLedger = await request(url, `/api/wiki/pages/${hygieneCreated.body._id}`);
    assert.strictEqual(sanitizedLedger.res.status, 200, sanitizedLedger.text);
    assert.ok(!sanitizedLedger.body.sourceRefs.some(source => source.title === 'Flounder Mode'));
    assert.ok(!sanitizedLedger.body.sourceRefs.some(source => /Fed cuts/i.test(source.title)));
    assert.ok(!sanitizedLedger.body.sourceRefs.some(source => /not that smart/i.test(source.title)));
    assert.ok(!JSON.stringify(sanitizedLedger.body.body).includes('Flounder Mode'));
    assert.deepStrictEqual(
      sanitizedLedger.body.body.content[0].content[0].marks[0].attrs.citationIndexes,
      [1, 2, 3]
    );

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

    const malformedFixturePage = new WikiPage({
      userId: 'user-1',
      title: 'Complementary Machine Thing',
      slug: 'complementary-machine-thing',
      pageType: 'topic',
      status: 'published',
      visibility: 'shared',
      plainText: 'Machine assistance can extend human judgment when citations and review stay visible.'
    });
    await malformedFixturePage.save();
    const failedDraftPrivatePage = new WikiPage({
      userId: 'user-1',
      title: 'Failed Draft Stub',
      slug: 'failed-draft-stub',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      plainText: 'This page has real words but should stay private until the failed draft state is repaired.',
      aiState: {
        draftStatus: 'error',
        lastError: 'Failed to build wiki page.',
        errorCode: 'DRAFT_FAILED'
      }
    });
    await failedDraftPrivatePage.save();
    const sparseDraftPage = new WikiPage({
      userId: 'user-1',
      title: 'Sparse Legitimate Draft',
      slug: 'sparse-legitimate-draft',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      plainText: ''
    });
    await sparseDraftPage.save();

    const defaultQualityList = await request(url, '/api/wiki/pages?q=Complementary%20Machine%20Thing');
    assert.strictEqual(defaultQualityList.res.status, 200, defaultQualityList.text);
    assert.deepStrictEqual(defaultQualityList.body.map(page => page.title), []);

    const blockedQualityList = await request(url, '/api/wiki/pages?quality=blocked');
    assert.strictEqual(blockedQualityList.res.status, 200, blockedQualityList.text);
    assert.ok(blockedQualityList.body.some(page => (
      page.title === 'Complementary Machine Thing'
      && page.qualityReview?.surfaceEligible === false
    )));

    const reviewQualityList = await request(url, '/api/wiki/pages?quality=needs_review');
    assert.strictEqual(reviewQualityList.res.status, 200, reviewQualityList.text);
    assert.ok(reviewQualityList.body.some(page => page.title === 'Sparse Legitimate Draft'));
    assert.ok(reviewQualityList.body.some(page => page.title === 'Complementary Machine Thing'));

    const blockedPublicPage = await request(url, '/api/public/wiki/pages/complementary-machine-thing', {
      headers: {}
    });
    assert.strictEqual(blockedPublicPage.res.status, 404, blockedPublicPage.text);

    const blockedShareAttempt = await request(url, `/api/wiki/pages/${failedDraftPrivatePage._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility: 'shared' })
    });
    assert.strictEqual(blockedShareAttempt.res.status, 422, blockedShareAttempt.text);
    assert.strictEqual(blockedShareAttempt.body.error, 'Fix or archive this page before sharing it publicly.');

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

    const sharedPage = new WikiPage({
      userId: 'user-1',
      title: 'Public Systems Page',
      slug: 'public-systems-page',
      pageType: 'topic',
      status: 'published',
      visibility: 'shared',
      plainText: 'A shared systems page for unauthenticated readers.',
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'A shared systems page for unauthenticated readers.' }]
        }]
      },
      sourceRefs: [{
        type: 'article',
        title: 'Public source title',
        url: 'https://example.com/source',
        snippet: 'Public citation snippet.',
        objectId: new mongoose.Types.ObjectId().toString(),
        privateNote: 'private source note'
      }],
      claims: [{ text: 'Private claim draft', sourceRefIds: ['private-source'] }],
      citations: [{ claimId: 'private-claim', sourceRefId: 'private-source' }],
      discussions: [{ question: 'Private discussion', answer: { content: [] } }],
      aiState: {
        model: 'private-model',
        provider: 'private-provider',
        changeLog: [{ summary: 'private agent log' }]
      }
    });
    await sharedPage.save();
    const privatePage = new WikiPage({
      userId: 'user-1',
      title: 'Private Systems Page',
      slug: 'private-systems-page',
      pageType: 'topic',
      status: 'published',
      visibility: 'private',
      plainText: 'This private page must not be public.'
    });
    await privatePage.save();
    const archivedSharedPage = new WikiPage({
      userId: 'user-1',
      title: 'Archived Shared Systems Page',
      slug: 'archived-shared-systems-page',
      pageType: 'topic',
      status: 'archived',
      visibility: 'shared',
      plainText: 'This archived page must not be public.'
    });
    await archivedSharedPage.save();

    const publicBySlug = await request(url, '/api/public/wiki/pages/public-systems-page', {
      headers: {}
    });
    assert.strictEqual(publicBySlug.res.status, 200, publicBySlug.text);
    assert.strictEqual(publicBySlug.body.page._id, String(sharedPage._id));
    assert.strictEqual(publicBySlug.body.page.visibility, 'shared');
    assert.strictEqual(publicBySlug.body.page.plainText, 'A shared systems page for unauthenticated readers.');
    assert.strictEqual(publicBySlug.body.page.sourceRefs[0].title, 'Public source title');
    assert.strictEqual(publicBySlug.body.page.sourceRefs[0].url, 'https://example.com/source');
    assert.strictEqual(publicBySlug.body.page.sourceRefs[0].snippet, 'Public citation snippet.');
    assert.strictEqual(publicBySlug.body.page.sourceRefs[0].objectId, undefined);
    assert.strictEqual(publicBySlug.body.page.sourceRefs[0].privateNote, undefined);
    assert.strictEqual(publicBySlug.body.page.discussions, undefined);
    assert.strictEqual(publicBySlug.body.page.aiState, undefined);
    assert.strictEqual(publicBySlug.body.page.claims, undefined);
    assert.strictEqual(publicBySlug.body.page.citations, undefined);
    assert.strictEqual(publicBySlug.body.page.createdFrom, undefined);

    const publicById = await request(url, `/api/public/wiki/pages/${sharedPage._id}`, {
      headers: {}
    });
    assert.strictEqual(publicById.res.status, 200, publicById.text);
    assert.strictEqual(publicById.body.page.slug, 'public-systems-page');

    const adoptedPublicPage = await request(url, `/api/public/wiki/pages/${sharedPage._id}/adopt`, {
      method: 'POST',
      headers: { 'x-test-user': 'user-2' }
    });
    assert.strictEqual(adoptedPublicPage.res.status, 201, adoptedPublicPage.text);
    assert.strictEqual(adoptedPublicPage.body.page.userId, 'user-2');
    assert.strictEqual(adoptedPublicPage.body.page.title, 'Public Systems Page');
    assert.strictEqual(adoptedPublicPage.body.page.visibility, 'private');
    assert.strictEqual(adoptedPublicPage.body.page.status, 'draft');
    assert.strictEqual(adoptedPublicPage.body.page.sourceScope, 'selected_sources');
    assert.strictEqual(adoptedPublicPage.body.page.adoptedFrom.originTitle, 'Public Systems Page');
    assert.strictEqual(adoptedPublicPage.body.page.adoptedFrom.originSlug, 'public-systems-page');
    assert.strictEqual(String(adoptedPublicPage.body.page.adoptedFrom.originPageId), String(sharedPage._id));
    assert.strictEqual(adoptedPublicPage.body.page.sourceRefs.length, 1);
    assert.strictEqual(adoptedPublicPage.body.page.sourceRefs[0].type, 'external');
    assert.strictEqual(adoptedPublicPage.body.page.sourceRefs[0].title, 'Public source title');
    assert.strictEqual(adoptedPublicPage.body.page.sourceRefs[0].url, 'https://example.com/source');
    assert.strictEqual(adoptedPublicPage.body.page.sourceRefs[0].snippet, 'Public citation snippet.');
    assert.strictEqual(adoptedPublicPage.body.page.sourceRefs[0].objectId, undefined);
    assert.strictEqual(adoptedPublicPage.body.page.sourceRefs[0].privateNote, undefined);
    assert.deepStrictEqual(adoptedPublicPage.body.page.discussions, []);
    assert.deepStrictEqual(adoptedPublicPage.body.page.aiState.suggestions, []);
    assert.notStrictEqual(adoptedPublicPage.body.page.aiState.model, 'private-model');
    assert.notStrictEqual(adoptedPublicPage.body.page.aiState.provider, 'private-provider');
    const adoptionRevision = WikiRevision.records.find(record => (
      String(record.pageId) === String(adoptedPublicPage.body.page._id)
      && record.summary.includes('Adopted shared wiki')
    ));
    assert.ok(adoptionRevision);
    assert.strictEqual(adoptionRevision.after.adoptedFrom.originSlug, 'public-systems-page');
    assert.ok(trackCalls.some(call => (
      call.event === 'wiki_shared_adopted'
      && call.userId === 'user-2'
      && call.properties.originType === 'page'
      && call.properties.originSlug === 'public-systems-page'
      && call.properties.pageCount === 1
    )));

    const duplicateAdoptedPublicPage = await request(url, `/api/public/wiki/pages/${sharedPage._id}/adopt`, {
      method: 'POST',
      headers: { 'x-test-user': 'user-2' }
    });
    assert.strictEqual(duplicateAdoptedPublicPage.res.status, 201, duplicateAdoptedPublicPage.text);
    assert.strictEqual(duplicateAdoptedPublicPage.body.page.title, 'Public Systems Page (adapted)');
    assert.strictEqual(duplicateAdoptedPublicPage.body.mergeAvailable, true);

    const collectionTargetPage = new WikiPage({
      userId: 'user-1',
      title: 'Shared Target Page',
      slug: 'shared-target-page',
      pageType: 'topic',
      status: 'published',
      visibility: 'shared',
      plainText: 'A second page in the shared wiki collection.',
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A second page in the shared wiki collection.' }] }]
      }
    });
    await collectionTargetPage.save();
    const collectionSourcePage = new WikiPage({
      userId: 'user-1',
      title: 'Shared Source Page',
      slug: 'shared-source-page',
      pageType: 'topic',
      status: 'published',
      visibility: 'shared',
      plainText: 'A page that links to Shared Target Page.',
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This collection page points to ' },
            {
              type: 'text',
              text: 'Shared Target Page',
              marks: [{ type: 'wikiLink', attrs: { pageId: String(collectionTargetPage._id), title: 'Shared Target Page' } }]
            },
            { type: 'text', text: '.' }
          ]
        }]
      }
    });
    await collectionSourcePage.save();
    const createdSharedCollection = await request(url, '/api/wiki/collections', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Judgment starter collection',
        description: 'A two page shared wiki.',
        pageIds: [collectionSourcePage._id, collectionTargetPage._id]
      })
    });
    assert.strictEqual(createdSharedCollection.res.status, 201, createdSharedCollection.text);
    assert.strictEqual(createdSharedCollection.body.collection.slug, 'judgment-starter-collection');

    const publicCollection = await request(url, '/api/public/wiki/collections/judgment-starter-collection', {
      headers: {}
    });
    assert.strictEqual(publicCollection.res.status, 200, publicCollection.text);
    assert.strictEqual(publicCollection.body.collection.pageCount, 2);
    assert.strictEqual(publicCollection.body.collection.pages[0].userId, undefined);
    assert.strictEqual(publicCollection.body.collection.pages[0].aiState, undefined);

    const adoptedCollection = await request(url, '/api/public/wiki/collections/judgment-starter-collection/adopt', {
      method: 'POST',
      headers: { 'x-test-user': 'user-2' }
    });
    assert.strictEqual(adoptedCollection.res.status, 201, adoptedCollection.text);
    assert.strictEqual(adoptedCollection.body.pages.length, 2);
    assert.ok(adoptedCollection.body.pages.every(page => page.userId === 'user-2'));
    assert.ok(adoptedCollection.body.pages.every(page => page.adoptedFrom.originType === 'collection'));
    const adoptedSource = adoptedCollection.body.pages.find(page => page.title === 'Shared Source Page');
    const adoptedTarget = adoptedCollection.body.pages.find(page => page.title === 'Shared Target Page');
    const adoptedLinkMark = adoptedSource.body.content[0].content[1].marks[0];
    assert.strictEqual(adoptedLinkMark.attrs.pageId, String(adoptedTarget._id));
    assert.notStrictEqual(adoptedLinkMark.attrs.pageId, String(collectionTargetPage._id));
    assert.ok(trackCalls.some(call => (
      call.event === 'wiki_shared_adopted'
      && call.userId === 'user-2'
      && call.properties.originType === 'collection'
      && call.properties.originSlug === 'judgment-starter-collection'
      && call.properties.pageCount === 2
    )));

    const starterPacks = await request(url, '/api/public/wiki/starter-packs', { headers: {} });
    assert.strictEqual(starterPacks.res.status, 200, starterPacks.text);
    assert.ok(starterPacks.body.packs.some(pack => pack.id === 'mental-models'));
    assert.ok(starterPacks.body.packs.some(pack => pack.id === 'value-investing'));

    const starterPackCollection = await request(url, '/api/public/wiki/collections/mental-models', {
      headers: {}
    });
    assert.strictEqual(starterPackCollection.res.status, 200, starterPackCollection.text);
    assert.strictEqual(starterPackCollection.body.collection.slug, 'mental-models');
    assert.strictEqual(starterPackCollection.body.collection.sourceType, 'starter_pack');
    assert.strictEqual(starterPackCollection.body.collection.packId, 'mental-models');
    assert.ok(starterPackCollection.body.collection.pages.length >= 6);
    assert.strictEqual(starterPackCollection.body.collection.pages[0].userId, undefined);
    assert.strictEqual(starterPackCollection.body.collection.pages[0].aiState, undefined);
    assert.ok(starterPackCollection.body.collection.pages[0].lastReviewedAt, 'Starter pack public pages should expose a safe reviewed timestamp.');

    const adoptedStarterPackCollection = await request(url, '/api/public/wiki/collections/mental-models/adopt', {
      method: 'POST',
      headers: { 'x-test-user': 'user-4' }
    });
    assert.strictEqual(adoptedStarterPackCollection.res.status, 201, adoptedStarterPackCollection.text);
    assert.strictEqual(adoptedStarterPackCollection.body.collection._id, 'mental-models');
    assert.strictEqual(adoptedStarterPackCollection.body.collection.slug, 'mental-models');
    assert.strictEqual(adoptedStarterPackCollection.body.collection.sourceType, 'starter_pack');
    assert.strictEqual(adoptedStarterPackCollection.body.collection.packId, 'mental-models');
    assert.strictEqual(adoptedStarterPackCollection.body.pack, undefined);
    assert.ok(adoptedStarterPackCollection.body.pages.length >= 6);
    assert.ok(adoptedStarterPackCollection.body.pages.every(page => page.userId === 'user-4'));
    assert.ok(adoptedStarterPackCollection.body.pages.every(page => page.adoptedFrom.originType === 'starter_pack'));
    assert.ok(adoptedStarterPackCollection.body.pages.every(page => page.adoptedFrom.sample === true));
    assert.ok(adoptedStarterPackCollection.body.pages.every(page => page.adoptedFrom.packId === 'mental-models'));
    const collectionFirstPrinciples = adoptedStarterPackCollection.body.pages.find(page => page.title === 'First Principles Thinking');
    const collectionOpportunityCost = adoptedStarterPackCollection.body.pages.find(page => page.title === 'Opportunity Cost');
    const collectionStarterLink = JSON.stringify(collectionFirstPrinciples.body);
    assert.ok(collectionStarterLink.includes(String(collectionOpportunityCost._id)));
    assert.ok(trackCalls.some(call => (
      call.event === 'wiki_shared_adopted'
      && call.userId === 'user-4'
      && call.properties.originType === 'starter_pack'
      && call.properties.surface === 'collection_route'
      && call.properties.packId === 'mental-models'
    )));

    const adoptedStarterPack = await request(url, '/api/public/wiki/starter-packs/mental-models/adopt', {
      method: 'POST',
      headers: { 'x-test-user': 'user-3' }
    });
    assert.strictEqual(adoptedStarterPack.res.status, 201, adoptedStarterPack.text);
    assert.strictEqual(adoptedStarterPack.body.pack.id, 'mental-models');
    assert.ok(adoptedStarterPack.body.pages.length >= 6);
    assert.ok(adoptedStarterPack.body.pages.every(page => page.userId === 'user-3'));
    assert.ok(adoptedStarterPack.body.pages.every(page => page.adoptedFrom.originType === 'starter_pack'));
    assert.ok(adoptedStarterPack.body.pages.every(page => page.adoptedFrom.sample === true));
    assert.ok(adoptedStarterPack.body.pages.every(page => page.adoptedFrom.packId === 'mental-models'));
    const firstPrinciples = adoptedStarterPack.body.pages.find(page => page.title === 'First Principles Thinking');
    const opportunityCost = adoptedStarterPack.body.pages.find(page => page.title === 'Opportunity Cost');
    const starterLink = JSON.stringify(firstPrinciples.body);
    assert.ok(starterLink.includes(String(opportunityCost._id)));
    assert.ok(trackCalls.some(call => (
      call.event === 'wiki_shared_adopted'
      && call.userId === 'user-3'
      && call.properties.originType === 'starter_pack'
      && call.properties.packId === 'mental-models'
      && !call.properties.surface
    )));

    const hiddenPrivatePublicPage = await request(url, '/api/public/wiki/pages/private-systems-page', {
      headers: {}
    });
    assert.strictEqual(hiddenPrivatePublicPage.res.status, 404, hiddenPrivatePublicPage.text);

    const hiddenArchivedPublicPage = await request(url, '/api/public/wiki/pages/archived-shared-systems-page', {
      headers: {}
    });
    assert.strictEqual(hiddenArchivedPublicPage.res.status, 404, hiddenArchivedPublicPage.text);

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

    const maintainCallsBeforeProposalAccept = proposalMaintainCalls.length;
    const acceptedProposal = await request(url, `/api/wiki/proposals/${proposalId}/accept`, { method: 'POST' });
    assert.strictEqual(acceptedProposal.res.status, 201, acceptedProposal.text);
    assert.strictEqual(acceptedProposal.body.page.aiState.draftStatus, 'ready');
    assert.strictEqual(acceptedProposal.body.page.aiState.maintenanceSummary, 'Maintained synchronously from proposal accept.');
    assert.ok(acceptedProposal.body.page.plainText.includes('Core Idea'));
    assert.ok(acceptedProposal.body.page.plainText.includes('Evidence'));
    assert.ok(!acceptedProposal.body.page.plainText.includes('Current Understanding'));
    assert.ok(!acceptedProposal.body.page.plainText.includes('Why This Page Exists'));
    assert.strictEqual(proposalMaintainCalls.length, maintainCallsBeforeProposalAccept + 1);

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

    const fastStreamed = await request(url, `/api/wiki/pages/${created.body._id}/ai/draft/stream`, {
      method: 'POST',
      body: JSON.stringify({
        maintenanceProfile: 'fast',
        sourceLimit: 8,
        sourceTextLimit: 800,
        inlineAutolinkLimit: 150,
        skipQualityRebuild: true,
        streamDraft: true,
        deferInboundAutolinks: true
      })
    });
    assert.strictEqual(fastStreamed.res.status, 200, fastStreamed.text);
    assert.ok(fastStreamed.text.includes('"stage":"inbound_links_deferred"'));
    assert.ok(!fastStreamed.text.includes('"stage":"graph_synced"'));
    assert.ok(proposalMaintainCalls.some(call => (
      call.pageId === String(created.body._id)
      && call.maintenanceProfile === 'fast'
      && call.sourceLimit === 8
      && call.sourceTextLimit === 800
      && call.skipQualityRebuild === false
      && call.streamDraft === true
    )));

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
    assert.strictEqual(ingest.body.status, 'pending');
    assert.deepStrictEqual(ingest.body.affectedPageIds, []);

    const ingestDetails = await waitForIngestRun(url, ingest.body.runId, body => body.status === 'processed');
    assert.strictEqual(ingestDetails.res.status, 200, ingestDetails.text);
    assert.strictEqual(ingestDetails.body.runId, ingest.body.runId);
    assert.ok(ingestDetails.body.affectedPageIds.includes(String(created.body._id)));
    assert.ok(ingestDetails.body.summary.includes('last trusted version'), JSON.stringify(ingestDetails.body));
    assert.ok(Array.isArray(ingestDetails.body.candidateUpdates));
    assert.ok(ingestDetails.body.candidateUpdates.some(candidate => (
      candidate.targetType === 'wiki_page'
      && candidate.pageId === String(created.body._id)
      && candidate.status === 'needs_review'
    )));
    assert.ok(ingestDetails.body.timeline.some(item => item.type === 'maintenance'));
    assert.strictEqual(ingestDetails.body.reviewStatus, 'pending_review');
    const wikiCandidate = ingestDetails.body.candidateUpdates.find(candidate => candidate.pageId === String(created.body._id));

    const reviewedIngest = await request(url, `/api/wiki/ingest/${ingest.body.runId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'defer',
        note: 'Review after adding more sources.',
        candidateIds: [wikiCandidate.id]
      })
    });
    assert.strictEqual(reviewedIngest.res.status, 200, reviewedIngest.text);
    assert.strictEqual(reviewedIngest.body.runId, ingest.body.runId);
    assert.strictEqual(reviewedIngest.body.reviewStatus, 'partially_deferred');
    assert.ok(reviewedIngest.body.candidateUpdates.some(candidate => (
      candidate.pageId === String(created.body._id)
      && candidate.status === 'deferred'
      && candidate.reviewAction === 'defer'
    )));
    assert.ok(!Connection.records.some(record => (
      record.fromType === 'external'
      && String(record.fromId) === ingest.body.runId
      && record.toType === 'wiki_page'
      && String(record.toId) === String(created.body._id)
    )));

    const acceptedIngest = await request(url, '/api/wiki/ingest', {
      method: 'POST',
      body: JSON.stringify({
        source: {
          type: 'text',
          text: 'Contract Page needs accepted ingest traces that connect highlight source events to wiki pages.',
          url: 'https://example.com/accepted-ingest-source'
        }
      })
    });
    assert.strictEqual(acceptedIngest.res.status, 202, acceptedIngest.text);
    assert.strictEqual(acceptedIngest.body.status, 'pending');
    const acceptedIngestDetails = await waitForIngestRun(url, acceptedIngest.body.runId, body => body.status === 'processed');
    assert.strictEqual(acceptedIngestDetails.res.status, 200, acceptedIngestDetails.text);
    const acceptedWikiCandidate = acceptedIngestDetails.body.candidateUpdates.find(candidate => (
      candidate.targetType === 'wiki_page'
      && candidate.pageId === String(created.body._id)
    ));
    assert.ok(acceptedWikiCandidate);

    const acceptedReview = await request(url, `/api/wiki/ingest/${acceptedIngest.body.runId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'accept',
        note: 'Keep this source attached to the page graph.',
        candidateIds: [acceptedWikiCandidate.id]
      })
    });
    assert.strictEqual(acceptedReview.res.status, 200, acceptedReview.text);
    assert.strictEqual(acceptedReview.body.reviewStatus, 'partially_accepted');
    const acceptedReviewedCandidate = acceptedReview.body.candidateUpdates.find(candidate => (
      candidate.pageId === String(created.body._id)
      && candidate.status === 'accepted'
      && candidate.reviewAction === 'accept'
    ));
    assert.ok(acceptedReviewedCandidate);
    assert.strictEqual(acceptedReviewedCandidate.graphTrace.bidirectional, true);
    assert.deepStrictEqual(acceptedReviewedCandidate.graphTrace.source, {
      type: 'external',
      id: acceptedIngest.body.runId
    });
    assert.deepStrictEqual(acceptedReviewedCandidate.graphTrace.target, {
      type: 'wiki_page',
      id: String(created.body._id)
    });
    assert.ok(Connection.records.some(record => (
      record.fromType === 'external'
      && String(record.fromId) === acceptedIngest.body.runId
      && record.toType === 'wiki_page'
      && String(record.toId) === String(created.body._id)
      && record.relationType === 'supports'
    )));
    assert.ok(Connection.records.some(record => (
      record.fromType === 'wiki_page'
      && String(record.fromId) === String(created.body._id)
      && record.toType === 'external'
      && String(record.toId) === acceptedIngest.body.runId
      && record.relationType === 'supported_by'
    )));

    const asked = await request(url, `/api/wiki/pages/${created.body._id}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question: 'What changed after the ingest?' })
    });
    assert.strictEqual(asked.res.status, 200, asked.text);
    assert.strictEqual(asked.body.discussions.length, 1);
    assert.ok(
      Number(asked.body.discussions[0].provenance?.temporalChangeCount || 0) >= 1,
      'Temporal wiki ask should include revision-history provenance.'
    );
    assert.match(
      JSON.stringify(asked.body.discussions[0].answer),
      /visible step|revision|source/i,
      'Temporal wiki ask should answer from page-history context.'
    );

    const streamedAsk = await request(url, `/api/wiki/pages/${created.body._id}/ask/stream`, {
      method: 'POST',
      body: JSON.stringify({ question: 'What changed after the ingest?' })
    });
    assert.strictEqual(streamedAsk.res.status, 200, streamedAsk.text);
    assert.match(streamedAsk.res.headers.get('content-type') || '', /text\/event-stream/);
    assert.ok(streamedAsk.text.includes('event: wiki-ask-delta'));
    assert.ok(streamedAsk.text.includes('"stage":"complete"'));

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

    const graphAsked = await request(url, `/api/wiki/pages/${created.body._id}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question: 'How does this connect to Neighbor Page?' })
    });
    assert.strictEqual(graphAsked.res.status, 200, graphAsked.text);
    const graphDiscussion = graphAsked.body.discussions[graphAsked.body.discussions.length - 1];
    assert.strictEqual(graphDiscussion.provenance.mode, 'graph_expanded');
    assert.ok(
      graphDiscussion.provenance.wikiPages.length >= 2,
      graphDiscussion.provenance.summary
    );
    assert.ok(graphDiscussion.provenance.wikiPages.some(page => page.title === 'Neighbor Page'));

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

    const activeAfterArchive = await request(url, '/api/wiki/pages?includeLowQuality=1&limit=500');
    assert.strictEqual(activeAfterArchive.res.status, 200, activeAfterArchive.text);
    assert.ok(activeAfterArchive.body.some(page => page._id === linkedPage._id));
    assert.ok(activeAfterArchive.body.some(page => page._id === acceptedProposal.body.page._id));
    assert.ok(!activeAfterArchive.body.some(page => page._id === created.body._id));

    const archivedList = await request(url, '/api/wiki/pages?status=archived');
    assert.strictEqual(archivedList.res.status, 200, archivedList.text);
    assert.ok(archivedList.body.some(page => page._id === created.body._id));
    assert.ok(archivedList.body.some(page => page._id === String(archivedSharedPage._id)));
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
