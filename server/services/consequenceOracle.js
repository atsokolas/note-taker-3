const { contractEvent } = require('./consequenceEvent');
const { routeOne, selectPaperConsequence } = require('./consequenceRoute');

const NOW = new Date('2026-08-31T12:00:00.000Z');

const secEvent = (overrides = {}) => ({
  _id: 'evt-sec-1',
  provider: 'sec-edgar',
  externalId: '0001045810-26-000123',
  title: 'NVIDIA 10-Q',
  text: 'Confirmed signed capacity converts within 90 days.',
  url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000123/nvda.htm',
  sourceUpdatedAt: new Date('2026-08-28T00:00:00.000Z'),
  affectedPageIds: ['page-nvda'],
  metadata: {},
  ...overrides
});

const nvdaPage = (overrides = {}) => ({
  _id: 'page-nvda',
  title: 'NVIDIA',
  createdAt: new Date('2026-01-01'),
  claims: [{
    claimId: 'claim-nvda',
    text: 'NVIDIA demand still outruns deliverable capacity.',
    lastCheckedAt: new Date('2026-08-01')
  }],
  judgment: {
    currentJudgment: 'NVIDIA demand still outruns deliverable capacity.',
    falsifiers: [{
      falsifierId: 'f-1',
      text: 'Confirmed signed capacity converts within 90 days.',
      status: 'unobserved'
    }],
    why: [{ reasonId: 'w-1', text: 'Lead times and power constrain what can be delivered.' }],
    decisions: [{
      decisionId: 'd-1',
      summary: 'Won’t add until signed capacity converts.',
      status: 'taken'
    }]
  },
  ...overrides
});

const evaluate = (fixture) => {
  const routed = routeOne({
    event: fixture.event,
    pages: fixture.pages,
    seenIdentities: fixture.seenIdentities || new Set(),
    now: fixture.now || NOW
  });
  return {
    ...fixture.expected,
    routed,
    persist: {
      mutated: Boolean(routed.preview) && routed.kind === 'material',
      claim: fixture.pages[0]?.judgment?.currentJudgment || '',
      dependents: fixture.pages.slice(1).map((page) => page.judgment?.currentJudgment)
    }
  };
};

const FIXTURES = Object.freeze({
  material: {
    id: 'material',
    event: secEvent(),
    pages: [nvdaPage()],
    expected: {
      kind: 'material',
      ui: 'card',
      fold: ['what changed', 'what it affects', 'what I need from you'],
      mutation: false,
      afterAccept: 'claim wording changes; prior preserved on receipt'
    }
  },
  noImpact: {
    id: 'no-impact',
    event: secEvent({
      _id: 'evt-quiet',
      text: 'The company restated its headquarters address in Santa Clara.',
      title: 'Address restatement'
    }),
    pages: [nvdaPage()],
    expected: {
      kind: 'no_impact',
      ui: 'quiet',
      mutation: false
    }
  },
  ambiguous: {
    id: 'ambiguous',
    event: secEvent({
      affectedPageIds: ['page-nvda', 'page-avgo'],
      text: 'Confirmed signed capacity converts within 90 days across NVIDIA and Broadcom supply.'
    }),
    pages: [
      nvdaPage(),
      nvdaPage({
        _id: 'page-avgo',
        title: 'Broadcom',
        claims: [{
          claimId: 'claim-avgo',
          text: 'Broadcom demand still outruns deliverable capacity.',
          lastCheckedAt: new Date('2026-08-01')
        }],
        judgment: {
          currentJudgment: 'Broadcom demand still outruns deliverable capacity.',
          falsifiers: [{
            falsifierId: 'f-2',
            text: 'Confirmed signed capacity converts within 90 days.',
            status: 'unobserved'
          }]
        }
      })
    ],
    expected: {
      kind: 'ambiguous',
      ui: 'silence',
      message: "Can't determine the effect",
      mutation: false
    }
  },
  duplicate: {
    id: 'duplicate',
    event: secEvent({ _id: 'evt-copy' }),
    pages: [nvdaPage()],
    seenIdentities: new Set([contractEvent(secEvent()).eventIdentity]),
    expected: {
      kind: 'duplicate',
      ui: 'silence',
      mutation: false
    }
  },
  stale: {
    id: 'stale',
    event: secEvent({
      sourceUpdatedAt: new Date('2026-06-01T00:00:00.000Z')
    }),
    pages: [nvdaPage({
      claims: [{
        claimId: 'claim-nvda',
        text: 'NVIDIA demand still outruns deliverable capacity.',
        lastCheckedAt: new Date('2026-08-01'),
        lastAcceptedEvidenceAt: new Date('2026-08-01')
      }]
    })],
    expected: {
      kind: 'stale',
      ui: 'aged',
      presentTense: false,
      mutation: false
    }
  },
  malformed: {
    id: 'malformed',
    event: {
      _id: 'evt-bad',
      provider: 'unknown',
      text: '',
      title: ''
    },
    pages: [nvdaPage()],
    expected: {
      kind: 'malformed',
      ui: 'silence',
      quarantine: true,
      mutation: false
    }
  },
  wrongCorpus: {
    id: 'wrong-corpus',
    event: secEvent({
      affectedPageIds: ['page-other'],
      text: 'A filing about a different company entirely, with no overlapping claim language.'
    }),
    pages: [nvdaPage()],
    expected: {
      kind: 'wrong_corpus',
      ui: 'silence',
      message: 'No bound evidence',
      mutation: false
    }
  }
});

const runFixture = (name) => evaluate(FIXTURES[name]);

const paperFromFixtures = (rows = []) => selectPaperConsequence({
  events: rows.map((row) => row.event),
  pages: rows[0]?.pages || [],
  now: NOW
});

module.exports = {
  FIXTURES,
  NOW,
  nvdaPage,
  paperFromFixtures,
  runFixture,
  secEvent
};
