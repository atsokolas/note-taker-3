const assert = require('assert');
const {
  ConceptContinuityError,
  ensureWikiInvestigationConcept,
  anchorQueryFor,
  neutralConceptName
} = require('./conceptContinuityService');

const IDS = {
  user: '64f300000000000000000001',
  foreignUser: '64f300000000000000000002',
  page: '64f300000000000000000011',
  revision: '64f300000000000000000012',
  concept: '64f300000000000000000021',
  anchored: '64f300000000000000000022'
};

class Query {
  constructor(value) { this.value = value; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const query = value => new Query(value);
const page = ({ createdFrom, ...overrides } = {}) => ({
  _id: IDS.page,
  userId: IDS.user,
  title: 'Semiconductor capital allocation',
  status: 'active',
  claims: [{ claimId: 'claim-1', text: 'A bounded current claim.' }],
  sourceRefs: [{ type: 'article', id: 'source-1' }],
  plainText: 'A sufficiently detailed Wiki page used to exercise neutral continuity behavior.',
  ...(createdFrom === undefined ? {} : { createdFrom }),
  ...overrides
});
const revision = overrides => ({
  _id: IDS.revision,
  pageId: IDS.page,
  userId: IDS.user,
  after: { claims: [{ claimId: 'claim-1', text: 'A bounded candidate claim.' }] },
  ...overrides
});
const concept = (conceptId = IDS.concept, overrides = {}) => ({
  _id: conceptId,
  userId: IDS.user,
  name: 'Semiconductor investigation',
  isPublic: false,
  ...overrides
});

const makeModels = ({
  wikiPage = page(),
  wikiRevision = revision(),
  legacy = null,
  anchored = null,
  nameCollision = null,
  upsertResult,
  upsertError
} = {}) => {
  const calls = [];
  const TagMeta = {
    findOne(filter) {
      calls.push({ method: 'findOne', filter });
      if (filter?._id) return query(legacy);
      if (filter?.['continuityAnchor.objectId']) return query(anchored);
      if (filter?.name) return query(nameCollision);
      return query(null);
    },
    async findOneAndUpdate(filter, update, options) {
      calls.push({ method: 'findOneAndUpdate', filter, update, options });
      if (upsertError) throw upsertError;
      return upsertResult;
    }
  };
  return {
    calls,
    models: {
      TagMeta,
      WikiPage: { findOne: filter => {
        calls.push({ method: 'WikiPage.findOne', filter });
        return query(
          wikiPage
          && String(wikiPage._id) === String(filter._id)
          && String(wikiPage.userId) === String(filter.userId)
            ? wikiPage
            : null
        );
      } },
      WikiRevision: { findOne: filter => {
        calls.push({ method: 'WikiRevision.findOne', filter });
        return query(
          wikiRevision
          && String(wikiRevision._id) === String(filter._id)
          && String(wikiRevision.pageId) === String(filter.pageId)
          && String(wikiRevision.userId) === String(filter.userId)
            ? wikiRevision
            : null
        );
      } }
    }
  };
};

const ensure = (models, overrides = {}) => ensureWikiInvestigationConcept({
  userId: IDS.user,
  wikiPageId: IDS.page,
  models,
  ...overrides
});

const expectContinuityError = async (promise, { status, code, message }) => {
  try {
    await promise;
    assert.fail(`Expected ${status} ${code}`);
  } catch (error) {
    assert.ok(error instanceof ConceptContinuityError);
    assert.strictEqual(error.status, status);
    assert.strictEqual(error.code, code);
    if (message) assert.match(error.message, message);
  }
};

const run = async () => {
  // A valid legacy Concept origin wins without mutating either record.
  {
    const legacy = concept();
    const fixture = makeModels({
      wikiPage: page({ createdFrom: { type: 'concept', objectId: IDS.concept } }),
      legacy
    });
    const result = await ensure(fixture.models);
    assert.strictEqual(result.created, false);
    assert.strictEqual(result.concept.id, IDS.concept);
    assert.strictEqual(result.continuity.wikiPageId, IDS.page);
    assert.ok(!fixture.calls.some(call => call.method === 'findOneAndUpdate'));
  }

  // A durable anchor is reused exactly and keeps the requested revision/claim context.
  {
    const anchored = concept(IDS.anchored, {
      continuityAnchor: { kind: 'wiki_investigation', objectType: 'wiki_page', objectId: IDS.page }
    });
    const fixture = makeModels({ anchored });
    const result = await ensure(fixture.models, {
      revisionId: IDS.revision,
      claimId: 'claim-1'
    });
    assert.strictEqual(result.created, false);
    assert.strictEqual(result.concept.id, IDS.anchored);
    assert.match(result.concept.href, new RegExp(`revisionId=${IDS.revision}`));
    assert.match(result.concept.href, /claimId=claim-1/);
    assert.ok(!fixture.calls.some(call => call.method === 'findOneAndUpdate'));
  }

  // Creation is neutral: it records identity/privacy only, never pins evidence or invents judgment.
  {
    const created = concept(IDS.anchored, {
      name: `Investigation · Semiconductor capital allocation · ${IDS.page.slice(-6)}`,
      continuityAnchor: { kind: 'wiki_investigation', objectType: 'wiki_page', objectId: IDS.page }
    });
    const fixture = makeModels({
      upsertResult: { value: created, lastErrorObject: { updatedExisting: false, upserted: IDS.anchored } }
    });
    const result = await ensure(fixture.models);
    assert.strictEqual(result.created, true);
    const write = fixture.calls.find(call => call.method === 'findOneAndUpdate');
    assert.deepStrictEqual(write.filter, anchorQueryFor({ userId: IDS.user, wikiPageId: IDS.page }));
    assert.strictEqual(write.options.upsert, true);
    assert.strictEqual(write.options.includeResultMetadata, true);
    assert.strictEqual(write.update.$setOnInsert.name, neutralConceptName(page()));
    assert.strictEqual(write.update.$setOnInsert.isPublic, false);
    const serializedWrite = JSON.stringify(write.update);
    for (const forbidden of [
      'pinnedArticleIds', 'pinnedHighlightIds', 'pinnedNoteIds', 'ideaWorkbench',
      'confidence', 'judgment', 'support', 'tension', 'assumption', 'falsifier'
    ]) assert.ok(!serializedWrite.includes(forbidden), `neutral create must omit ${forbidden}`);
  }

  // An upsert replay reports reuse based on driver metadata, not a guessed create.
  {
    const winner = concept(IDS.anchored);
    const fixture = makeModels({
      upsertResult: { value: winner, lastErrorObject: { updatedExisting: true } }
    });
    const result = await ensure(fixture.models);
    assert.strictEqual(result.created, false);
    assert.strictEqual(result.concept.id, IDS.anchored);
  }

  // Concurrent duplicate creation re-reads the anchor winner and returns it idempotently.
  {
    const winner = concept(IDS.anchored);
    let anchorReads = 0;
    const fixture = makeModels({ upsertError: Object.assign(new Error('duplicate'), { code: 11000 }) });
    fixture.models.TagMeta.findOne = filter => {
      fixture.calls.push({ method: 'findOne', filter });
      if (filter?.['continuityAnchor.objectId']) {
        anchorReads += 1;
        return query(anchorReads === 1 ? null : winner);
      }
      return query(null);
    };
    const result = await ensure(fixture.models);
    assert.strictEqual(result.created, false);
    assert.strictEqual(result.concept.id, IDS.anchored);
    assert.strictEqual(anchorReads, 2);
  }

  // A deterministic-name collision cannot silently merge an unrelated Concept.
  {
    const fixture = makeModels({ nameCollision: concept(IDS.anchored) });
    await expectContinuityError(ensure(fixture.models), {
      status: 409,
      code: 'name_conflict',
      message: /different Concept/i
    });
    assert.ok(!fixture.calls.some(call => call.method === 'findOneAndUpdate'));
  }

  // Conflicting legacy and anchored identities stop rather than choosing one.
  {
    const fixture = makeModels({
      wikiPage: page({ createdFrom: { type: 'concept', objectId: IDS.concept } }),
      legacy: concept(IDS.concept),
      anchored: concept(IDS.anchored)
    });
    await expectContinuityError(ensure(fixture.models), {
      status: 409,
      code: 'continuity_conflict',
      message: /conflicting Concepts/i
    });
  }

  // Ownership and visibility are enforced by the page query and by defensive checks.
  {
    const missing = makeModels({ wikiPage: null });
    await expectContinuityError(ensure(missing.models), {
      status: 404, code: 'not_found', message: /Wiki page not found/i
    });
    const foreign = makeModels({ wikiPage: page({ userId: IDS.foreignUser }) });
    await expectContinuityError(ensure(foreign.models), {
      status: 404, code: 'not_found', message: /Wiki page not found/i
    });
    const hidden = makeModels({ wikiPage: page({ hiddenFromHome: true }) });
    await expectContinuityError(ensure(hidden.models), {
      status: 404, code: 'not_found', message: /Wiki page not found/i
    });
    assert.strictEqual(missing.calls[0].filter.userId, IDS.user);
  }

  // Revision ownership/page binding and claim membership are independently required.
  {
    const missingRevision = makeModels({ wikiRevision: null });
    await expectContinuityError(ensure(missingRevision.models, { revisionId: IDS.revision }), {
      status: 404, code: 'not_found', message: /revision not found/i
    });
    const revisionCalls = missingRevision.calls.filter(call => call.method === 'WikiRevision.findOne');
    assert.strictEqual(revisionCalls[0].filter.pageId, IDS.page);
    assert.strictEqual(revisionCalls[0].filter.userId, IDS.user);

    const missingClaim = makeModels();
    await expectContinuityError(ensure(missingClaim.models, {
      revisionId: IDS.revision,
      claimId: 'claim-does-not-exist'
    }), { status: 404, code: 'not_found', message: /claim not found/i });
  }

  // Broken or hidden legacy origins are never repaired by creating a second Concept.
  {
    const broken = makeModels({
      wikiPage: page({ createdFrom: { type: 'concept', objectId: IDS.concept } }),
      legacy: null
    });
    await expectContinuityError(ensure(broken.models), {
      status: 409, code: 'continuity_conflict', message: /broken Concept origin/i
    });
    const unavailable = makeModels({ anchored: concept(IDS.anchored, { archived: true }) });
    await expectContinuityError(ensure(unavailable.models), {
      status: 409, code: 'continuity_conflict', message: /unavailable investigation Concept/i
    });
  }

  console.log('concept continuity service tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
