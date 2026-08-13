const {
  evaluateWikiArticleQuality,
  __testables: { docFromArticle, findOrdinaryGroundingGaps, normalizeModelResult }
} = require('./wikiMaintenanceService');

const ownedSource = (overrides = {}) => ({
  type: 'article',
  objectId: '507f1f77bcf86cd799439011',
  title: 'Owned Library source',
  url: 'https://example.org/owned-source',
  snippet: 'Owned Library evidence.',
  ...overrides
});

const ordinaryPage = (title = 'Parenting') => ({ title, pageType: 'concept' });

const qualityFor = ({ page, article, sourceRefs, ...rest }) => {
  const body = docFromArticle({ title: page.title, article });
  return evaluateWikiArticleQuality({
    page,
    body,
    claims: [],
    sourceRefs,
    skipDurableCitationCheck: true,
    ...rest
  });
};

describe('ordinary Wiki owned-source utilization contract', () => {
  it('rejects an article whose owned Library sources sit only in References', () => {
    const sourceRefs = [
      ownedSource({
        title: 'Parenting through independence',
        snippet: 'Parenting independence grows when a caregiver lets a child finish a task alone.'
      }),
      ownedSource({
        objectId: '507f1f77bcf86cd799439012',
        url: 'https://example.org/parenting-consequences',
        title: 'Parenting and supportive consequences',
        snippet: 'A supportive consequence keeps the relationship intact while the limit still holds.'
      }),
      {
        type: 'external',
        provider: 'web',
        title: 'National parenting guidance',
        url: 'https://gov.example/parenting-guidance',
        snippet: 'Responsive parenting guidance describes caregiver behaviour that follows a child cue.'
      }
    ];
    const quality = qualityFor({
      page: ordinaryPage(),
      sourceRefs,
      article: {
        summary: {
          text: 'Responsive parenting guidance describes caregiver behaviour that follows a child cue and keeps the interaction going.',
          citationIndexes: [3],
          support: 'supported'
        },
        sections: [{
          heading: 'Caregiver responsiveness',
          paragraphs: [{
            text: 'Responsive parenting guidance treats the caregiver cue and the child response as one exchange rather than two separate behaviours.',
            citationIndexes: [3],
            support: 'supported'
          }],
          bullets: []
        }]
      }
    });

    expect(quality.failures.join(' ')).toMatch(/no claim cites any of them/i);
    expect(quality.metrics.ownedSourceUtilization.ownedFamilyCount).toBe(2);
    expect(quality.metrics.ownedSourceUtilization.utilizedOwnedFamilyCount).toBe(0);
    expect(quality.metrics.ownedSourceUtilization.supplementalFamilyCount).toBe(1);
    expect(quality.metrics.ownedSourceUtilization.receiptSummary)
      .toBe('Used 0 of 2 selected Library source families.');
  });

  it('accepts public authority that supplements real account-grounded synthesis', () => {
    const sourceRefs = [
      ownedSource({
        title: 'Parenting through independence',
        snippet: 'Parenting independence grows when a caregiver lets a child finish a task alone.'
      }),
      ownedSource({
        objectId: '507f1f77bcf86cd799439012',
        url: 'https://example.org/parenting-consequences',
        title: 'Parenting and supportive consequences',
        snippet: 'A supportive consequence keeps the relationship intact while the limit still holds.'
      }),
      {
        type: 'external',
        provider: 'web',
        title: 'National parenting guidance',
        url: 'https://gov.example/parenting-guidance',
        snippet: 'Responsive parenting guidance describes caregiver behaviour that follows a child cue.'
      }
    ];
    const quality = qualityFor({
      page: ordinaryPage(),
      sourceRefs,
      article: {
        summary: {
          text: 'Parenting independence grows when a caregiver lets a child finish a task alone rather than stepping in.',
          citationIndexes: [1],
          support: 'supported'
        },
        sections: [{
          heading: 'Supportive consequences',
          paragraphs: [{
            text: 'A supportive consequence keeps the relationship intact while the limit still holds, which is what makes the limit repeatable.',
            citationIndexes: [2],
            support: 'supported'
          }, {
            text: 'Responsive parenting guidance describes caregiver behaviour that follows a child cue, and national guidance treats that responsiveness as the general case.',
            citationIndexes: [3],
            support: 'supported'
          }],
          bullets: []
        }]
      }
    });

    expect(quality.failures.join(' ')).not.toMatch(/owned Library/i);
    expect(quality.metrics.ownedSourceUtilization.utilizedOwnedFamilyCount).toBe(2);
    expect(quality.metrics.ownedSourceUtilization.utilizationRatio).toBe(1);
  });

  it('counts duplicate highlights of one article as a single source family', () => {
    const sourceRefs = [
      ownedSource({
        title: 'Parenting through independence',
        snippet: 'Parenting independence grows when a caregiver lets a child finish a task alone.'
      }),
      ownedSource({
        type: 'highlight',
        objectId: '507f1f77bcf86cd799439021',
        parentObjectId: '507f1f77bcf86cd799439011',
        title: 'Parenting through independence highlight',
        snippet: 'A caregiver who lets a child finish a task alone is building independence.'
      }),
      ownedSource({
        objectId: '507f1f77bcf86cd799439012',
        url: 'https://example.org/parenting-consequences',
        title: 'Parenting and supportive consequences',
        snippet: 'A supportive consequence keeps the relationship intact while the limit still holds.'
      }),
      ownedSource({
        objectId: '507f1f77bcf86cd799439013',
        url: 'https://example.org/parenting-routines',
        title: 'Parenting routines and predictability',
        snippet: 'A predictable routine lets a child anticipate the caregiver response before it happens.'
      })
    ];
    // Citing the article and its own highlight is one family, not two, so it
    // cannot manufacture coverage of the two families left untouched.
    const quality = qualityFor({
      page: ordinaryPage(),
      sourceRefs,
      article: {
        summary: {
          text: 'Parenting independence grows when a caregiver lets a child finish a task alone rather than stepping in.',
          citationIndexes: [1],
          support: 'supported'
        },
        sections: [{
          heading: 'Letting a task finish',
          paragraphs: [{
            text: 'A caregiver who lets a child finish a task alone is building independence through the task itself.',
            citationIndexes: [2],
            support: 'supported'
          }],
          bullets: []
        }]
      }
    });

    expect(quality.metrics.ownedSourceUtilization.ownedFamilyCount).toBe(3);
    expect(quality.metrics.ownedSourceUtilization.utilizedOwnedFamilyCount).toBe(1);
    expect(quality.failures.join(' ')).toMatch(/uses too little of its owned Library evidence: 1\/3/);
  });

  it('accepts an explicitly excluded owned family with a stated reason', () => {
    const sourceRefs = [
      ownedSource({
        title: 'Parenting through independence',
        snippet: 'Parenting independence grows when a caregiver lets a child finish a task alone.'
      }),
      ownedSource({
        objectId: '507f1f77bcf86cd799439012',
        url: 'https://example.org/parenting-thin',
        title: 'Parenting aside',
        snippet: 'Parenting is hard.'
      }),
      ownedSource({
        objectId: '507f1f77bcf86cd799439013',
        url: 'https://example.org/parenting-duplicate',
        title: 'Parenting independence, restated',
        snippet: 'Parenting independence grows when a caregiver lets a child finish a task alone.'
      })
    ];
    const article = {
      summary: {
        text: 'Parenting independence grows when a caregiver lets a child finish a task alone rather than stepping in.',
        citationIndexes: [1],
        support: 'supported'
      },
      sections: []
    };

    const silent = qualityFor({ page: ordinaryPage(), sourceRefs, article });
    expect(silent.failures.join(' ')).toMatch(/uses too little of its owned Library evidence/);

    const explained = qualityFor({
      page: ordinaryPage(),
      sourceRefs,
      article,
      excludedSources: [{
        familyKey: 'url:example.org/parenting-thin',
        reason: 'One sentence with no mechanism; it cannot carry a claim.'
      }, {
        familyKey: 'url:example.org/parenting-duplicate',
        reason: 'Restates the retained source without adding a mechanism.'
      }]
    });
    expect(explained.failures.join(' ')).not.toMatch(/owned Library evidence/);
    expect(explained.metrics.ownedSourceUtilization.excludedOwnedFamilyCount).toBe(2);
    expect(explained.metrics.ownedSourceUtilization.excludedOwnedFamilies[0].reason)
      .toBe('One sentence with no mechanism; it cannot carry a claim.');
  });

  it('does not force a noisy irrelevant owned source into the article', () => {
    const sourceRefs = [
      ownedSource({
        title: 'Parenting through independence',
        snippet: 'Parenting independence grows when a caregiver lets a child finish a task alone.'
      }),
      ownedSource({
        objectId: '507f1f77bcf86cd799439033',
        url: 'https://example.org/kubernetes-operators',
        title: 'Kubernetes operator patterns',
        snippet: 'Operators reconcile cluster state through control loops and custom resources.'
      })
    ];
    const quality = qualityFor({
      page: ordinaryPage(),
      sourceRefs,
      article: {
        summary: {
          text: 'Parenting independence grows when a caregiver lets a child finish a task alone rather than stepping in.',
          citationIndexes: [1],
          support: 'supported'
        },
        sections: []
      }
    });

    expect(quality.failures.join(' ')).not.toMatch(/owned Library evidence/);
    expect(quality.metrics.ownedSourceUtilization.ownedFamilyCount).toBe(2);
    expect(quality.metrics.ownedSourceUtilization.relevantOwnedFamilyCount).toBe(1);
  });

  it('leaves the stronger investing behaviour intact', () => {
    const sourceRefs = [
      ownedSource({
        title: 'Value investing and margin of safety',
        url: 'https://example.org/value-investing',
        snippet: 'Value investing buys a security below a conservatively estimated intrinsic value, and the gap is the margin of safety.'
      }),
      ownedSource({
        objectId: '507f1f77bcf86cd799439044',
        url: 'https://example.org/screening-metrics',
        title: 'Screening metrics and their limits',
        snippet: 'A low price-to-earnings ratio screens for cheapness but does not establish that the underlying business earns its cost of capital.'
      })
    ];
    const quality = qualityFor({
      page: ordinaryPage('Value investing'),
      sourceRefs,
      article: {
        summary: {
          text: 'Value investing buys a security below a conservatively estimated intrinsic value, and the gap between price and that estimate is the margin of safety.',
          citationIndexes: [1],
          support: 'supported'
        },
        sections: [{
          heading: 'Why a cheap multiple is not a valuation',
          paragraphs: [{
            text: 'A low price-to-earnings ratio screens for cheapness but does not establish that the underlying business earns its cost of capital, so the screen is a starting point rather than a conclusion.',
            citationIndexes: [2],
            support: 'supported'
          }],
          bullets: []
        }]
      }
    });

    expect(quality.failures.join(' ')).not.toMatch(/owned Library/i);
    expect(quality.metrics.ownedSourceUtilization.utilizationRatio).toBe(1);
  });

  it('carries model exclusion notes through normalization and drops unreasoned ones', () => {
    const normalized = normalizeModelResult({
      raw: {
        title: 'Parenting',
        article: { summary: { text: 'Parenting summary.', citationIndexes: [1] }, sections: [] },
        sourceIndexesUsed: [1],
        excludedSources: [
          { index: 2, reason: 'Duplicates source one without adding a mechanism.' },
          { index: 3, reason: 'n/a' },
          { index: 0, reason: 'Index is not addressable.' }
        ]
      },
      page: ordinaryPage(),
      candidates: [
        { index: 1, type: 'article', objectId: 'a', title: 'One', text: 'One' },
        { index: 2, type: 'article', objectId: 'b', title: 'Two', text: 'Two' },
        { index: 3, type: 'article', objectId: 'c', title: 'Three', text: 'Three' }
      ]
    });

    expect(normalized.excludedSources).toEqual([
      { index: 2, reason: 'Duplicates source one without adding a mechanism.' }
    ]);
  });
});

describe('ordinary Wiki grounding judge', () => {
  const supportSource = {
    title: 'Responsive interaction and brain development',
    snippet: 'Responsive caregiver interaction shapes neural circuits during early development, and serve-and-return exchanges drive that circuitry.'
  };
  const routineSource = {
    title: 'Routines and predictability',
    snippet: 'Predictable daily routines lower household stress and let a child anticipate the caregiver response.'
  };

  it('accepts synthesis that bridges two cited sources without close lexical overlap', () => {
    const gaps = findOrdinaryGroundingGaps({
      claims: [{
        text: 'Predictable routines and responsive serve-and-return exchanges reinforce each other, because a child who can anticipate the caregiver response is freer to initiate the interaction that shapes neural circuits.',
        citationIndexes: [1, 2],
        support: 'supported'
      }],
      sourceRefs: [supportSource, routineSource]
    });

    expect(gaps).toEqual([]);
  });

  it('still rejects an unsupported abstraction with no anchor in its cited evidence', () => {
    const gaps = findOrdinaryGroundingGaps({
      claims: [{
        text: 'Modern institutions increasingly favour decentralised governance models that redistribute authority across autonomous participating units.',
        citationIndexes: [1, 2],
        support: 'supported'
      }],
      sourceRefs: [supportSource, routineSource]
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(/decentralised governance/);
  });

  it('rejects a sub-threshold bridge that leans on only one of its cited sources', () => {
    // "caregiver" appears in both sources, so it cannot show which source the
    // sentence drew on. Every other anchor comes from one source alone, which
    // makes this a single-source overreach wearing a two-source citation.
    const gaps = findOrdinaryGroundingGaps({
      claims: [{
        text: 'Responsive caregiver interaction therefore guarantees measurable academic advantage throughout secondary schooling, university admission, career progression, and lifetime earnings across every measured population cohort.',
        citationIndexes: [1, 2],
        support: 'supported'
      }],
      sourceRefs: [supportSource, routineSource]
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(/lifetime earnings/);
  });

  it('represents contradictory evidence as a tension rather than a silent reconciliation', () => {
    const permissive = {
      title: 'Autonomy-supportive parenting',
      snippet: 'Autonomy-supportive parenting lets a child choose the pace of a task and avoids imposing an external consequence.'
    };
    const structured = {
      title: 'Structured consequences',
      snippet: 'Structured parenting applies a consistent external consequence so the child learns the limit quickly.'
    };
    const gaps = findOrdinaryGroundingGaps({
      claims: [{
        text: 'Autonomy-supportive parenting lets a child choose the pace of a task, while structured parenting applies a consistent external consequence, and the two traditions disagree about which produces a durable limit.',
        citationIndexes: [1],
        contradictionIndexes: [2],
        support: 'conflicted'
      }],
      sourceRefs: [permissive, structured]
    });

    expect(gaps).toEqual([]);
  });
});
