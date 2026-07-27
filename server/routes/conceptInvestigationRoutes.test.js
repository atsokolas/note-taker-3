const assert = require('assert');
const express = require('express');
const {
  buildConceptInvestigationRouter,
  isObjectId
} = require('./conceptInvestigationRoutes');

const USER_ID = '64f300000000000000000001';
const FOREIGN_USER_ID = '64f300000000000000000002';
const CONCEPT_ID = '64f300000000000000000011';
const FOREIGN_CONCEPT_ID = '64f300000000000000000012';
const PAGE_ID = '64f300000000000000000021';
const MISMATCH_PAGE_ID = '64f300000000000000000022';
const FOREIGN_PAGE_ID = '64f300000000000000000023';
const REVISION_ID = '64f300000000000000000031';
const FOREIGN_REVISION_ID = '64f300000000000000000032';
const ARTICLE_ID = '64f300000000000000000041';
const DOSSIER_CONCEPT_ID = '64f300000000000000000051';
const DOSSIER_PAGE_ID = '64f300000000000000000052';
const DOSSIER_REVISION_ID = '64f300000000000000000053';
const DOSSIER_SOURCE_ID = '64f300000000000000000054';
const CURRENT_CLAIM_ID = 'claim-current';
const DOSSIER_CLAIM_ID = 'cost-unit-turns';

const sameId = (left, right) => String(left || '') === String(right || '');

class Query {
  constructor(value) {
    this.value = value;
  }
  select() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return this; }
  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const valueAt = (record, path) => String(path || '').split('.').reduce(
  (value, segment) => value?.[segment],
  record
);
const matches = (record, query = {}) => Object.entries(query).every(([key, expected]) => {
  if (key.startsWith('$')) return true;
  const actual = valueAt(record, key);
  if (expected && typeof expected === 'object' && Array.isArray(expected.$in)) {
    return expected.$in.some(value => sameId(value, actual));
  }
  if (expected && typeof expected === 'object' && Object.hasOwn(expected, '$ne')) {
    return !sameId(actual, expected.$ne);
  }
  return sameId(actual, expected);
});

const modelFor = (records = []) => ({
  findOne: query => new Query(records.find(record => matches(record, query)) || null),
  find: query => new Query(records.filter(record => (
    !query?.userId || sameId(record.userId, query.userId)
  )))
});

const concept = {
  _id: CONCEPT_ID,
  userId: USER_ID,
  name: 'Durable intelligence',
  description: 'A maintained Concept.',
  ideaWorkbench: {
    header: {
      prompt: 'What changes the durable-intelligence thesis?'
    },
    hypothesis: {
      html: '<p>Current working synthesis.</p><script>window.bad = true</script>'
    },
    cards: [{
      id: 'support-1',
      sourceKey: `article:${ARTICLE_ID}`,
      sourcePath: 'javascript:alert(document.domain)',
      zone: 'supports',
      title: 'Owned evidence',
      confidence: '0.99',
      origin: 'library'
    }],
    changeDrafts: [{
      id: 'draft-1',
      kind: 'support',
      status: 'pending',
      title: 'Proposed support',
      summary: 'Review before applying.',
      sourcePath: 'data:text/html,not-safe',
      confidence: '1.0',
      cards: []
    }],
    agent: {
      comments: [{
        id: 'comment-1',
        title: 'Candidate wording',
        body: '<img src=x onerror=alert(1)>Do not render raw HTML.',
        suggestedHtml: '<p>Unaccepted replacement</p>',
        confidence: '0.88',
        status: 'active'
      }]
    }
  }
};

const page = {
  _id: PAGE_ID,
  userId: USER_ID,
  title: 'Maintained current page',
  createdFrom: {
    type: 'concept',
    objectId: CONCEPT_ID
  },
  claims: [{
    claimId: CURRENT_CLAIM_ID,
    text: 'The current accepted-looking claim remains separate.'
  }]
};

const mismatchPage = {
  ...page,
  _id: MISMATCH_PAGE_ID,
  createdFrom: {
    type: 'concept',
    objectId: FOREIGN_CONCEPT_ID
  }
};

const foreignPage = {
  ...page,
  _id: FOREIGN_PAGE_ID,
  userId: FOREIGN_USER_ID
};

const candidateRevision = {
  _id: REVISION_ID,
  userId: USER_ID,
  pageId: PAGE_ID,
  promotionStatus: 'candidate',
  summary: 'Candidate stays separate.',
  after: {
    claims: [{
      claimId: CURRENT_CLAIM_ID,
      text: '<strong>Candidate claim must not be raw HTML.</strong>',
      support: 'partial'
    }],
    sourceRefs: []
  }
};

const foreignRevision = {
  ...candidateRevision,
  _id: FOREIGN_REVISION_ID,
  userId: FOREIGN_USER_ID
};

const article = {
  _id: ARTICLE_ID,
  userId: USER_ID,
  title: 'Owned source',
  content: 'Owned evidence for the working Concept.',
  url: 'https://example.com/evidence'
};

const dossierConcept = {
  _id: DOSSIER_CONCEPT_ID,
  userId: USER_ID,
  name: 'Costco investment investigation',
  ideaWorkbench: {},
  continuityAnchor: {
    kind: 'wiki_investigation',
    objectType: 'wiki_page',
    objectId: DOSSIER_PAGE_ID
  }
};

const dossierCurrentClaim = {
  claimId: DOSSIER_CLAIM_ID,
  text: 'Costco turns inventory quickly.',
  support: 'partial',
  sourceRefIds: []
};
const dossierProposedClaim = {
  ...dossierCurrentClaim,
  text: 'Costco produced 13.1 inventory turns in the bounded calculation.',
  sourceRefIds: [DOSSIER_SOURCE_ID]
};
const dossierSource = {
  _id: DOSSIER_SOURCE_ID,
  type: 'external',
  objectId: null,
  title: 'Costco fiscal 2025 Form 10-K',
  url: 'https://www.sec.gov/example-costco-2025-10k'
};
const dossierPage = {
  _id: DOSSIER_PAGE_ID,
  userId: USER_ID,
  title: 'Costco Wholesale investment dossier',
  pageType: 'entity',
  status: 'draft',
  investmentDossier: { version: 2 },
  aiState: { candidateStatus: 'awaiting_claim_acceptance' },
  claims: [dossierCurrentClaim],
  createdFrom: { label: 'company-dossier:COST' }
};
const dossierRevision = {
  _id: DOSSIER_REVISION_ID,
  userId: USER_ID,
  pageId: DOSSIER_PAGE_ID,
  promotionStatus: 'candidate',
  createdAt: new Date('2026-08-02T12:00:00.000Z'),
  claimReview: {
    state: 'pending',
    targetClaimId: DOSSIER_CLAIM_ID
  },
  before: {
    claims: [dossierCurrentClaim],
    sourceRefs: [],
    citations: []
  },
  after: {
    claims: [dossierProposedClaim],
    sourceRefs: [dossierSource],
    citations: []
  }
};

const app = express();
app.use(express.json());
app.use(buildConceptInvestigationRouter({
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer qa') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.headers['x-qa-missing-user'] !== '1') req.user = { id: USER_ID };
    if (req.headers['x-qa-agent'] === '1') req.agentToken = { id: 'qa-agent' };
    return next();
  },
  TagMeta: modelFor([concept, dossierConcept]),
  WikiPage: modelFor([page, mismatchPage, foreignPage, dossierPage]),
  WikiRevision: modelFor([candidateRevision, foreignRevision, dossierRevision]),
  Article: modelFor([article]),
  NotebookEntry: modelFor([]),
  Question: modelFor([])
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const request = async (path, { authorized = true, agent = false, missingUser = false } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: authorized ? {
        Authorization: 'Bearer qa',
        ...(agent ? { 'x-qa-agent': '1' } : {}),
        ...(missingUser ? { 'x-qa-missing-user': '1' } : {})
      } : {}
    });
    return {
      response,
      body: await response.json()
    };
  };
  const investigationPath = (
    `/api/concepts/${CONCEPT_ID}/investigation`
    + `?wikiPageId=${PAGE_ID}`
    + `&revisionId=${REVISION_ID}`
    + `&claimId=${CURRENT_CLAIM_ID}`
  );

  try {
    const unauthorized = await request(investigationPath, { authorized: false });
    assert.strictEqual(unauthorized.response.status, 401);

    const missingUser = await request(investigationPath, { missingUser: true });
    assert.strictEqual(missingUser.response.status, 401);
    assert.strictEqual(missingUser.body.code, 'AUTH_REQUIRED');

    const agentDenied = await request(investigationPath, { agent: true });
    assert.strictEqual(agentDenied.response.status, 403);
    assert.match(agentDenied.body.error, /human owner/i);

    const invalidConcept = await request(
      `/api/concepts/not-an-id/investigation?wikiPageId=${PAGE_ID}`
    );
    assert.strictEqual(invalidConcept.response.status, 400);
    assert.match(invalidConcept.body.error, /conceptId.*valid object id/i);

    const invalidPage = await request(
      `/api/concepts/${CONCEPT_ID}/investigation?wikiPageId=not-an-id`
    );
    assert.strictEqual(invalidPage.response.status, 400);
    assert.match(invalidPage.body.error, /wikiPageId.*valid object id/i);

    const invalidRevision = await request(
      `/api/concepts/${CONCEPT_ID}/investigation`
      + `?wikiPageId=${PAGE_ID}&revisionId=not-an-id`
    );
    assert.strictEqual(invalidRevision.response.status, 400);
    assert.match(invalidRevision.body.error, /revisionId.*valid object id/i);
    const oversizedClaim = await request(
      `/api/concepts/${CONCEPT_ID}/investigation?wikiPageId=${PAGE_ID}&claimId=${'x'.repeat(241)}`
    );
    assert.strictEqual(oversizedClaim.response.status, 400);
    assert.match(oversizedClaim.body.error, /claimId is too long/i);
    const arrayClaim = await request(
      `/api/concepts/${CONCEPT_ID}/investigation?wikiPageId=${PAGE_ID}&claimId[]=claim-1`
    );
    assert.strictEqual(arrayClaim.response.status, 400);
    assert.match(arrayClaim.body.error, /claimId must be a string/i);
    const emptyClaim = await request(
      `/api/concepts/${CONCEPT_ID}/investigation?wikiPageId=${PAGE_ID}&claimId=%20`
    );
    assert.strictEqual(emptyClaim.response.status, 400);
    assert.match(emptyClaim.body.error, /claimId must not be empty/i);
    assert.strictEqual(isObjectId(CONCEPT_ID), true);
    assert.strictEqual(isObjectId('not-an-id'), false);

    const missingConcept = await request(
      `/api/concepts/${FOREIGN_CONCEPT_ID}/investigation?wikiPageId=${PAGE_ID}`
    );
    assert.strictEqual(missingConcept.response.status, 404);
    assert.match(missingConcept.body.error, /concept not found/i);

    const foreignPageResult = await request(
      `/api/concepts/${CONCEPT_ID}/investigation?wikiPageId=${FOREIGN_PAGE_ID}`
    );
    assert.strictEqual(foreignPageResult.response.status, 404);
    assert.match(foreignPageResult.body.error, /wiki page not found/i);

    const mismatch = await request(
      `/api/concepts/${CONCEPT_ID}/investigation?wikiPageId=${MISMATCH_PAGE_ID}`
    );
    assert.strictEqual(mismatch.response.status, 409, JSON.stringify(mismatch.body));
    assert.match(mismatch.body.error, /not linked to this concept/i);

    const foreignRevisionResult = await request(
      `/api/concepts/${CONCEPT_ID}/investigation`
      + `?wikiPageId=${PAGE_ID}&revisionId=${FOREIGN_REVISION_ID}`
    );
    assert.strictEqual(foreignRevisionResult.response.status, 404);
    assert.match(foreignRevisionResult.body.error, /wiki revision not found/i);

    const owned = await request(investigationPath);
    assert.strictEqual(owned.response.status, 200);
    assert.ok(owned.body.generatedAt);
    assert.strictEqual(owned.body.investigation.concept.id, CONCEPT_ID);
    assert.strictEqual(owned.body.investigation.entryContext.page.id, PAGE_ID);
    assert.strictEqual(owned.body.investigation.entryContext.reviewState, 'candidate');
    assert.strictEqual(owned.body.investigation.currentWiki.acceptanceState, 'unverified');
    assert.strictEqual(
      owned.body.investigation.currentWiki.claim.title,
      'The current accepted-looking claim remains separate.'
    );
    assert.strictEqual(
      owned.body.investigation.proposals.candidateWikiRevision.ref.id,
      REVISION_ID
    );
    assert.strictEqual(
      owned.body.investigation.proposals.candidateWikiRevision.currentClaim.title,
      'The current accepted-looking claim remains separate.'
    );
    assert.match(
      owned.body.investigation.proposals.candidateWikiRevision.proposedClaim.title,
      /Candidate claim/
    );
    assert.strictEqual(owned.body.investigation.evidence.support.length, 1);
    assert.strictEqual(owned.body.investigation.evidence.support[0].ref.id, ARTICLE_ID);

    const pendingDossier = await request(
      `/api/wiki/pages/${DOSSIER_PAGE_ID}/pending-claim-review`
    );
    assert.strictEqual(pendingDossier.response.status, 200, JSON.stringify(pendingDossier.body));
    assert.deepStrictEqual(pendingDossier.body.identity, {
      conceptId: DOSSIER_CONCEPT_ID,
      wikiPageId: DOSSIER_PAGE_ID,
      revisionId: DOSSIER_REVISION_ID,
      claimId: DOSSIER_CLAIM_ID
    });
    assert.strictEqual(pendingDossier.body.claimReview.state, 'pending');
    assert.strictEqual(pendingDossier.body.claimReview.evidenceDelta.added.length, 1);
    assert.strictEqual(
      pendingDossier.body.claimReview.evidenceDelta.added[0].href,
      'https://www.sec.gov/example-costco-2025-10k'
    );

    for (const flag of ['archived', 'hiddenFromHome', 'debugOnly']) {
      dossierPage[flag] = true;
      const hiddenDossier = await request(
        `/api/wiki/pages/${DOSSIER_PAGE_ID}/pending-claim-review`
      );
      assert.strictEqual(hiddenDossier.response.status, 404, `${flag} dossier must be denied`);
      delete dossierPage[flag];
    }

    dossierPage.aiState.candidateStatus = 'maintenance_rejected';
    const rejectedDossierReload = await request(
      `/api/wiki/pages/${DOSSIER_PAGE_ID}/pending-claim-review`
    );
    assert.strictEqual(
      rejectedDossierReload.response.status,
      200,
      JSON.stringify(rejectedDossierReload.body)
    );
    assert.strictEqual(rejectedDossierReload.body.state, 'settled');
    assert.strictEqual(rejectedDossierReload.body.claimReview, null);

    const dossierAgentDenied = await request(
      `/api/wiki/pages/${DOSSIER_PAGE_ID}/pending-claim-review`,
      { agent: true }
    );
    assert.strictEqual(dossierAgentDenied.response.status, 403);

    const serialized = JSON.stringify(owned.body);
    assert.doesNotMatch(serialized, /sourcePath/i);
    assert.doesNotMatch(serialized, /suggestedHtml/i);
    assert.doesNotMatch(serialized, /Confidence 0\.89|0\.89/);
    assert.doesNotMatch(serialized, /javascript:|data:text\/html/i);
    assert.doesNotMatch(serialized, /<[^>]+>/);

    console.log('conceptInvestigationRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
