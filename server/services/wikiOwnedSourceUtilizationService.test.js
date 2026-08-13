const assert = require('assert');
const {
  sourceFamilyKey,
  isOwnedSource,
  deriveSourceFamilies,
  normalizeExclusions,
  resolveExclusionFamilies,
  evaluateOwnedSourceUtilization
} = require('./wikiOwnedSourceUtilizationService');
const { __testables: { sourceTopicCoverage } } = require('./wikiMaintenanceService');

const ownedArticle = (overrides = {}) => ({
  type: 'article',
  objectId: '507f1f77bcf86cd799439011',
  title: 'Parenting through independence and supportive consequences',
  url: 'https://example.org/parenting-independence',
  snippet: 'Parenting independence grows when a caregiver lets a child finish a task alone and applies a supportive consequence rather than rescuing.',
  ...overrides
});

const run = () => {
  // ---------------------------------------------------------------------
  // Family identity
  // ---------------------------------------------------------------------
  {
    // Test 4: duplicate highlights collapse into one source family.
    const article = ownedArticle();
    const highlightA = ownedArticle({
      type: 'highlight',
      objectId: '507f1f77bcf86cd799439012',
      parentObjectId: '507f1f77bcf86cd799439011',
      title: 'Parenting through independence and supportive consequences highlight'
    });
    const highlightB = ownedArticle({
      type: 'highlight',
      objectId: '507f1f77bcf86cd799439013',
      parentObjectId: '507f1f77bcf86cd799439011',
      title: 'Parenting through independence and supportive consequences highlight'
    });
    assert.equal(sourceFamilyKey(article), sourceFamilyKey(highlightA));
    assert.equal(sourceFamilyKey(highlightA), sourceFamilyKey(highlightB));

    const families = deriveSourceFamilies({ sourceRefs: [article, highlightA, highlightB] });
    assert.equal(families.length, 1, 'article plus its highlights is one family');
    assert.deepEqual(families[0].indexes, [1, 2, 3]);
    assert.equal(families[0].title, 'Parenting through independence and supportive consequences');
  }

  {
    // A duplicate import of the same URL under a fresh ObjectId is still one
    // family, so re-importing an article cannot inflate coverage.
    const original = ownedArticle();
    const reimport = ownedArticle({
      objectId: '507f1f77bcf86cd7994390ff',
      url: 'https://www.example.org/parenting-independence/?utm_source=newsletter'
    });
    assert.equal(sourceFamilyKey(original), sourceFamilyKey(reimport));
    assert.equal(deriveSourceFamilies({ sourceRefs: [original, reimport] }).length, 1);
  }

  {
    // Library material without a URL still separates by its own identity.
    const notebookA = { type: 'notebook', objectId: 'aaa111', title: 'Consequences log' };
    const notebookB = { type: 'notebook', objectId: 'bbb222', title: 'Independence log' };
    assert.notEqual(sourceFamilyKey(notebookA), sourceFamilyKey(notebookB));
  }

  // ---------------------------------------------------------------------
  // Ownership
  // ---------------------------------------------------------------------
  {
    assert.equal(isOwnedSource(ownedArticle()), true);
    assert.equal(isOwnedSource({ type: 'highlight', parentObjectId: 'abc' }), true);
    assert.equal(isOwnedSource({ type: 'external', objectId: 'abc' }), false);
    // Provider-fetched evidence is supplemental even in a Library-shaped row.
    assert.equal(isOwnedSource({ type: 'article', objectId: 'abc', provider: 'sec-edgar' }), false);
    assert.equal(
      isOwnedSource({ type: 'article', objectId: 'abc', metadata: { source: 'sec-edgar' } }),
      false
    );
    // A row with no durable account identity is not owned evidence.
    assert.equal(isOwnedSource({ type: 'article', title: 'Loose card' }), false);
  }

  // ---------------------------------------------------------------------
  // Test 1: owned sources materially influence visible claims (Parenting)
  // ---------------------------------------------------------------------
  {
    const sourceRefs = [
      ownedArticle(),
      ownedArticle({
        type: 'highlight',
        objectId: '507f1f77bcf86cd799439012',
        parentObjectId: '507f1f77bcf86cd799439011'
      }),
      ownedArticle({
        objectId: '507f1f77bcf86cd799439021',
        url: 'https://example.org/parenting-psychological-safety',
        title: 'Psychological safety in parenting routines',
        snippet: 'Parenting routines that keep a predictable response build psychological safety for the child.'
      })
    ];
    const result = evaluateOwnedSourceUtilization({
      sourceRefs,
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1, 3]
    });
    assert.equal(result.ok, true, result.failures.join(' | '));
    assert.equal(result.metrics.ownedFamilyCount, 2);
    assert.equal(result.metrics.utilizedOwnedFamilyCount, 2);
    assert.equal(result.metrics.utilizationRatio, 1);
    assert.equal(result.metrics.receiptSummary, 'Used 2 of 2 selected Library source families.');
  }

  // ---------------------------------------------------------------------
  // The primary product defect: owned sources sit passively in References
  // ---------------------------------------------------------------------
  {
    const sourceRefs = [
      ownedArticle(),
      ownedArticle({
        objectId: '507f1f77bcf86cd799439021',
        url: 'https://example.org/parenting-psychological-safety',
        title: 'Psychological safety in parenting routines',
        snippet: 'Parenting routines that keep a predictable response build psychological safety.'
      })
    ];
    const result = evaluateOwnedSourceUtilization({
      sourceRefs,
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: []
    });
    assert.equal(result.ok, false);
    assert.match(result.failures[0], /no claim cites any of them/);
    assert.equal(result.metrics.utilizedOwnedFamilyCount, 0);
    assert.equal(result.metrics.receiptSummary, 'Used 0 of 2 selected Library source families.');
  }

  {
    // Half the relevant owned families is the floor, not a target: 1 of 4 fails.
    const sourceRefs = [1, 2, 3, 4].map(seed => ownedArticle({
      objectId: `507f1f77bcf86cd79943902${seed}`,
      url: `https://example.org/parenting-${seed}`,
      title: `Parenting practice ${seed}`,
      snippet: 'Parenting practice evidence about independence and supportive consequences.'
    }));
    const result = evaluateOwnedSourceUtilization({
      sourceRefs,
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1]
    });
    assert.equal(result.ok, false);
    assert.match(result.failures[0], /uses too little of its owned Library evidence: 1\/4/);
    assert.equal(result.metrics.utilizationRatio, 0.25);

    // Exactly half clears the bar.
    const halfUsed = evaluateOwnedSourceUtilization({
      sourceRefs,
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1, 3]
    });
    assert.equal(halfUsed.ok, true, halfUsed.failures.join(' | '));
    assert.equal(halfUsed.metrics.utilizationRatio, 0.5);
  }

  // ---------------------------------------------------------------------
  // Test 3: an irrelevant or noisy owned source is excluded honestly
  // ---------------------------------------------------------------------
  {
    const relevant = ownedArticle();
    const noisy = ownedArticle({
      objectId: '507f1f77bcf86cd799439031',
      url: 'https://example.org/kubernetes-operators',
      title: 'Kubernetes operator patterns',
      snippet: 'Operators reconcile cluster state through control loops and custom resources.'
    });
    const result = evaluateOwnedSourceUtilization({
      sourceRefs: [relevant, noisy],
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1]
    });
    // The noisy source never becomes accountable, so it is not forced into
    // prose and it does not drag a good article below the utilization bar.
    assert.equal(result.ok, true, result.failures.join(' | '));
    assert.equal(result.metrics.ownedFamilyCount, 2);
    assert.equal(result.metrics.relevantOwnedFamilyCount, 1);
    assert.equal(result.metrics.accountableOwnedFamilyCount, 1);
  }

  {
    // A relevant family may still be set aside, but only with a real reason.
    const first = ownedArticle();
    const second = ownedArticle({
      objectId: '507f1f77bcf86cd799439041',
      url: 'https://example.org/parenting-thin',
      title: 'Parenting note',
      snippet: 'Parenting is hard.'
    });
    const excludedWell = evaluateOwnedSourceUtilization({
      sourceRefs: [first, second],
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1],
      exclusions: [{ index: 2, reason: 'Single sentence with no mechanism to carry a claim.' }]
    });
    assert.equal(excludedWell.ok, true, excludedWell.failures.join(' | '));
    assert.equal(excludedWell.metrics.excludedOwnedFamilyCount, 1);
    assert.equal(
      excludedWell.metrics.excludedOwnedFamilies[0].reason,
      'Single sentence with no mechanism to carry a claim.'
    );

    // Silence is not an exclusion, and neither is a throwaway reason.
    const excludedBadly = evaluateOwnedSourceUtilization({
      sourceRefs: [first, second, ownedArticle({
        objectId: '507f1f77bcf86cd799439042',
        url: 'https://example.org/parenting-third',
        title: 'Parenting routines',
        snippet: 'Parenting routines and predictable responses support independence.'
      })],
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1],
      exclusions: [{ index: 2, reason: 'n/a' }, { index: 3, reason: '' }]
    });
    assert.equal(excludedBadly.ok, false);
    assert.equal(excludedBadly.metrics.excludedOwnedFamilyCount, 0);
    assert.match(excludedBadly.failures[0], /uses too little of its owned Library evidence: 1\/3/);
  }

  {
    // Excluding everything is honest, but it is not an account-grounded page.
    const result = evaluateOwnedSourceUtilization({
      sourceRefs: [ownedArticle()],
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [],
      exclusions: [{ index: 1, reason: 'Source is about a different subject entirely.' }]
    });
    assert.equal(result.ok, false);
    assert.match(result.failures[0], /excludes every owned Library source/);
  }

  {
    // Citing a family outranks a stale exclusion note about the same family.
    const result = evaluateOwnedSourceUtilization({
      sourceRefs: [ownedArticle()],
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1],
      exclusions: [{ index: 1, reason: 'Claimed irrelevant but the article cited it anyway.' }]
    });
    assert.equal(result.ok, true, result.failures.join(' | '));
    assert.equal(result.metrics.utilizedOwnedFamilyCount, 1);
    assert.equal(result.metrics.excludedOwnedFamilyCount, 0);
  }

  // ---------------------------------------------------------------------
  // Test 8: public evidence supplements, it cannot masquerade as personal
  // ---------------------------------------------------------------------
  {
    const sourceRefs = [
      ownedArticle(),
      {
        type: 'external',
        title: 'National guidance on responsive caregiving',
        url: 'https://gov.example/responsive-caregiving',
        provider: 'web',
        snippet: 'Responsive caregiving guidance for parenting programs.'
      },
      {
        type: 'external',
        title: 'Population study of parenting programs',
        url: 'https://journal.example/parenting-programs',
        provider: 'web',
        snippet: 'Population-level parenting program outcomes.'
      }
    ];
    // Public authority alone does not satisfy the contract.
    const publicOnly = evaluateOwnedSourceUtilization({
      sourceRefs,
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [2, 3]
    });
    assert.equal(publicOnly.ok, false);
    assert.match(publicOnly.failures[0], /no claim cites any of them/);
    assert.equal(publicOnly.metrics.supplementalFamilyCount, 2);
    assert.equal(publicOnly.metrics.ownedFamilyCount, 1);

    // Public evidence strengthening real account-grounded synthesis passes.
    const mixed = evaluateOwnedSourceUtilization({
      sourceRefs,
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1, 2, 3]
    });
    assert.equal(mixed.ok, true, mixed.failures.join(' | '));
    assert.equal(mixed.metrics.utilizedOwnedFamilyCount, 1);
    assert.equal(mixed.metrics.receiptSummary, 'Used 1 of 1 selected Library source family.');
  }

  // ---------------------------------------------------------------------
  // A selected family the article dropped entirely is still accountable
  // ---------------------------------------------------------------------
  {
    const kept = ownedArticle();
    const dropped = ownedArticle({
      objectId: '507f1f77bcf86cd799439051',
      url: 'https://example.org/parenting-dropped',
      title: 'Parenting consequences that stay supportive',
      snippet: 'Parenting consequences remain supportive when the caregiver keeps the relationship intact.'
    });
    const secondDropped = ownedArticle({
      objectId: '507f1f77bcf86cd799439052',
      url: 'https://example.org/parenting-dropped-two',
      title: 'Parenting routines and predictable response',
      snippet: 'Parenting routines make the caregiver response predictable enough for a child to anticipate it.'
    });
    // Dropping a selected family counts against utilization exactly as leaving
    // it uncited does; it is the same passive-evidence defect, hidden better.
    const result = evaluateOwnedSourceUtilization({
      sourceRefs: [kept],
      selectedSources: [kept, dropped, secondDropped],
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1]
    });
    assert.equal(result.ok, false);
    assert.equal(result.metrics.droppedOwnedFamilyCount, 2);
    assert.match(result.failures[0], /Parenting consequences that stay supportive/);

    // A dropped family is still reported even when the ratio itself passes, so
    // the receipt can show what left the page.
    const reportedOnly = evaluateOwnedSourceUtilization({
      sourceRefs: [kept],
      selectedSources: [kept, dropped],
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1]
    });
    assert.equal(reportedOnly.ok, true, reportedOnly.failures.join(' | '));
    assert.equal(reportedOnly.metrics.droppedOwnedFamilyCount, 1);
    assert.equal(reportedOnly.metrics.utilizationRatio, 0.5);

    // Dropping it with a stated reason is an acceptable editorial answer.
    const explained = evaluateOwnedSourceUtilization({
      sourceRefs: [kept],
      selectedSources: [kept, dropped],
      topic: 'Parenting',
      topicCoverage: sourceTopicCoverage,
      usedCitationIndexes: [1],
      exclusions: resolveExclusionFamilies({
        exclusions: [{ index: 2, reason: 'Duplicates the retained source without adding a mechanism.' }],
        sources: [kept, dropped]
      })
    });
    assert.equal(explained.ok, true, explained.failures.join(' | '));
    assert.equal(explained.metrics.excludedOwnedFamilyCount, 1);
  }

  // ---------------------------------------------------------------------
  // Exclusion plumbing
  // ---------------------------------------------------------------------
  {
    assert.deepEqual(normalizeExclusions([{ index: 0, reason: 'long enough reason here' }]), []);
    assert.deepEqual(normalizeExclusions([{ index: 2, reason: 'short' }]), []);
    assert.deepEqual(
      normalizeExclusions([{ sourceIndex: 2, reason: 'Not about this subject at all.' }]),
      [{ index: 2, reason: 'Not about this subject at all.' }]
    );
    // Exclusions resolve to family identity, so ledger renumbering cannot
    // silently detach a stated reason from the material it was about.
    const resolved = resolveExclusionFamilies({
      exclusions: [{ index: 2, reason: 'Not about this subject at all.' }],
      sources: [ownedArticle(), ownedArticle({ objectId: 'zzz', url: 'https://example.org/other' })]
    });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].familyKey, 'url:example.org/other');
  }

  {
    // A page with no owned evidence is handled by the existing no-sources gate,
    // not by this contract.
    const result = evaluateOwnedSourceUtilization({ sourceRefs: [], topic: 'Parenting' });
    assert.equal(result.ok, true);
    assert.equal(result.metrics.receiptSummary, '');
    assert.equal(result.metrics.utilizationRatio, null);
  }

  console.log('wikiOwnedSourceUtilizationService tests passed');
};

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
