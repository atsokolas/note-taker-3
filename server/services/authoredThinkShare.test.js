const {
  CONTRIBUTION_LIMIT,
  CONTRIBUTION_HELD,
  CONTRIBUTION_TAKE_CHANGED,
  CONTRIBUTION_TAKEN_BACK,
  BRIEF_NEEDS_READING,
  SUCCESSION_NEEDS_UNRESOLVED,
  MANDATE_NEEDS_FIELDS,
  canPublishConcept,
  canPublishQuestion,
  claimShareAgentAsk,
  contributionConflict,
  contributionSlotFilter,
  contributionText,
  endShareMandate,
  freezeShareMandate,
  freezeShareSuccession,
  freezeThinkSnapshot,
  hashPublicConcept,
  hashPublicQuestion,
  missingSnapshot,
  presenceLine,
  presenceNameFor,
  PRESENCE_TTL_MS,
  projectContribution,
  projectPresence,
  projectPublicConcept,
  projectPublicQuestion,
  projectShareBrief,
  projectShareMandate,
  projectShareSuccession,
  publicQuestionPage,
  thinkShareState,
  withSuccessionOutcome
} = require('./authoredThinkShare');
const { AGENT_MANDATE_PAUSE, AGENT_MANDATE_TOOLS } = require('./governedResearch');

describe('authored think share', () => {
  it('projects question paragraphs and withholds library doors', () => {
    const preview = projectPublicQuestion({
      text: 'What survives compounding?',
      status: 'open',
      conceptName: 'Compounding',
      blocks: [
        { id: 'p1', type: 'paragraph', text: 'Public paragraph.' },
        { id: 'h1', type: 'highlight-ref', text: 'secret highlight' },
        {
          id: 'private',
          type: 'paragraph',
          text: 'An exact excerpt from the owner Library.',
          articleId: '64f2000000000000000000aa',
          articleTitle: 'Private source',
          sourcePath: '/library?articleId=private'
        }
      ]
    }, 'Athan');
    expect(preview.question.text).toBe('What survives compounding?');
    expect(preview.question.paragraphs).toEqual([
      { id: 'p1', type: 'paragraph', text: 'Public paragraph.' }
    ]);
    expect(JSON.stringify(preview)).not.toMatch(/library\?/);
    expect(JSON.stringify(preview)).not.toMatch(/secret highlight/);
    expect(canPublishQuestion(preview)).toBe(true);
    expect(canPublishQuestion(projectPublicQuestion({ text: '   ' }, 'Athan'))).toBe(false);
  });

  it('projects concept cards without source trails or ConceptNote', () => {
    const preview = projectPublicConcept({
      name: 'Opportunity Cost',
      description: 'Tradeoffs over hidden alternatives.',
      ideaWorkbench: {
        hypothesis: { html: '<p>Tradeoffs compound.</p>' },
        header: { prompt: 'What does this explain?' },
        cards: [{
          id: 'card-1',
          zone: 'supports',
          type: 'highlight',
          title: 'Public argument',
          content: 'Choosing one path excludes another.',
          source: 'Private article title',
          whyItMatters: 'It makes hidden alternatives visible.',
          sourcePath: '/library?articleId=private'
        }]
      }
    }, 'Athan');
    expect(preview.concept.name).toBe('Opportunity Cost');
    expect(preview.concept.supports[0].title).toBe('Public argument');
    expect(preview.concept.supports[0].source).toBeUndefined();
    expect(preview.concept.note).toBeUndefined();
    expect(JSON.stringify(preview)).not.toMatch(/Private article title/);
    expect(JSON.stringify(preview)).not.toMatch(/library\?/);
    expect(canPublishConcept(preview)).toBe(true);
  });

  it('hashes the public payload without dates so a later freeze is not a rewrite', () => {
    const preview = projectPublicQuestion({ text: 'What survives compounding?' }, 'Athan');
    const frozen = freezeThinkSnapshot(preview, '2026-09-13T12:00:00.000Z', {
      revisedAt: '2026-09-13T15:00:00.000Z',
      correction: 'The exception now leads.'
    });
    expect(frozen.publishedAt).toBe('2026-09-13T12:00:00.000Z');
    expect(frozen.revisedAt).toBe('2026-09-13T15:00:00.000Z');
    expect(frozen.correction).toBe('The exception now leads.');
    expect(hashPublicQuestion(preview)).toBe(hashPublicQuestion(frozen));
    expect(hashPublicConcept(projectPublicConcept({ name: 'Cost' }, 'Athan')))
      .toBe(hashPublicConcept(freezeThinkSnapshot(projectPublicConcept({ name: 'Cost' }, 'Athan'), new Date())));
  });

  it('marks a share stale only when the live hash moved', () => {
    const preview = projectPublicQuestion({ text: 'What survives compounding?' }, 'Athan');
    const hash = hashPublicQuestion(preview);
    const shared = thinkShareState({
      slug: 'qslug',
      snapshot: freezeThinkSnapshot(preview, '2026-09-13T12:00:00.000Z'),
      contentHash: hash,
      publishedAt: '2026-09-13T12:00:00.000Z'
    }, { preview, currentHash: hash, kind: 'question' });
    expect(shared.stale).toBe(false);
    const moved = projectPublicQuestion({ text: 'What survives the rewrite?' }, 'Athan');
    expect(thinkShareState({
      slug: 'qslug',
      snapshot: shared.snapshot,
      contentHash: hash
    }, { preview: moved, currentHash: hashPublicQuestion(moved), kind: 'question' }).stale).toBe(true);
    expect(missingSnapshot({})).toBe(true);
    expect(missingSnapshot({ snapshot: preview })).toBe(false);
  });

  it('keeps an attributed reading beside the snapshot, not inside it', async () => {
    const preview = projectPublicQuestion({ text: 'What survives compounding?' }, 'Athan');
    const frozen = freezeThinkSnapshot({
      ...preview,
      contributions: [{ by: 'Leaked', text: 'Should not freeze.' }],
      interpretation: 'Should not freeze.',
      yours: [{ by: 'Leaked', text: 'Should not freeze.' }],
      mine: true,
      brief: { agreement: 'Should not freeze.' },
      succession: { unresolved: 'Should not freeze.' }
    }, '2026-09-13T12:00:00.000Z');
    expect(frozen.contributions).toBeUndefined();
    expect(frozen.interpretation).toBeUndefined();
    expect(frozen.yours).toBeUndefined();
    expect(frozen.mine).toBeUndefined();
    expect(frozen.brief).toBeUndefined();
    expect(frozen.succession).toBeUndefined();
    expect(frozen.succession).toBeUndefined();
    expect(hashPublicQuestion(preview)).toBe(hashPublicQuestion(frozen));

    expect(contributionText('  <em>Patience is not avoidance.</em>  '))
      .toBe('Patience is not avoidance.');
    expect(projectContribution({
      _id: 'c1',
      by: ' Mara ',
      text: '<p>Same fact, different time horizon.</p>',
      remainder: 'Who pays when the window closes?',
      createdAt: '2026-09-13T16:00:00.000Z',
      articleId: 'private',
      sourcePath: '/library?articleId=secret'
    })).toEqual({
      id: 'c1',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?',
      createdAt: '2026-09-13T16:00:00.000Z'
    });
    expect(projectContribution({
      _id: 'c1',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?',
      interpretation: '<em>The horizon is the claim, not the fact.</em>',
      createdAt: '2026-09-13T16:00:00.000Z'
    }, { interpretedBy: 'Athan <athan@lab.org>' })).toEqual({
      id: 'c1',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?',
      interpretation: 'The horizon is the claim, not the fact.',
      interpretedBy: 'Athan',
      createdAt: '2026-09-13T16:00:00.000Z'
    });
    expect(projectContribution({
      by: 'Mara',
      text: 'Selected writing.',
      interpretation: 'A private take.'
    })).not.toHaveProperty('interpretation');
    expect(projectContribution({ by: '', text: 'Nameless' })).toBeNull();
    expect(JSON.stringify(projectContribution({
      by: 'Mara',
      text: 'Selected writing.',
      articleId: 'secret',
      sourcePath: '/library?articleId=secret'
    }))).not.toMatch(/library\?/);

    expect(contributionSlotFilter('qslug')).toEqual({
      slug: 'qslug',
      snapshot: { $ne: null },
      $expr: { $lt: [{ $ifNull: ['$contributionCount', 0] }, CONTRIBUTION_LIMIT] }
    });

    const page = publicQuestionPage({
      ownerDisplayName: 'Athan',
      snapshot: {
        ...frozen,
        contributions: [{ by: 'Stale', text: 'From the frozen row.' }],
        interpretation: 'Should not freeze.'
      }
    }, [{
      _id: 'c2',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?',
      interpretation: 'The horizon is the claim, not the fact.',
      createdAt: '2026-09-13T16:00:00.000Z'
    }]);
    expect(page.question.text).toBe('What survives compounding?');
    expect(page.interpretation).toBeUndefined();
    expect(page.contributions).toEqual([{
      id: 'c2',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?',
      interpretation: 'The horizon is the claim, not the fact.',
      interpretedBy: 'Athan',
      createdAt: '2026-09-13T16:00:00.000Z'
    }]);

    const hash = hashPublicQuestion(preview);
    const shared = thinkShareState({
      slug: 'qslug',
      snapshot: frozen,
      contentHash: hash
    }, {
      preview,
      currentHash: hash,
      kind: 'question',
      contributions: [{
        _id: 'c2',
        by: 'Mara',
        text: 'Same fact, different time horizon.',
        interpretation: 'The horizon is the claim, not the fact.'
      }]
    });
    expect(shared.contributions[0]).toMatchObject({
      by: 'Mara',
      interpretation: 'The horizon is the claim, not the fact.',
      interpretedBy: 'Athan'
    });
    expect(shared.snapshot.contributions).toBeUndefined();
    expect(thinkShareState(null, { preview, kind: 'concept' }).contributions).toBeUndefined();

    const heldPage = publicQuestionPage({
      ownerDisplayName: 'Athan',
      snapshot: frozen
    }, [{
      _id: 'held',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      held: true
    }, {
      _id: 'legacy',
      by: 'Ada',
      text: 'An earlier reading without the hold field.'
    }]);
    expect(heldPage.contributions).toEqual([{
      id: 'legacy',
      by: 'Ada',
      text: 'An earlier reading without the hold field.',
      createdAt: ''
    }]);
    expect(heldPage.waiting).toBeUndefined();

    const ownerState = thinkShareState({
      slug: 'qslug',
      ownerDisplayName: 'Athan',
      snapshot: frozen,
      contentHash: hash
    }, {
      preview,
      currentHash: hash,
      kind: 'question',
      contributions: [
        { _id: 'held', by: 'Mara', text: 'Same fact, different time horizon.', held: true },
        { _id: 'live', by: 'Ada', text: 'Already on the page.' }
      ]
    });
    expect(ownerState.contributions).toEqual([{
      id: 'live',
      by: 'Ada',
      text: 'Already on the page.',
      createdAt: ''
    }]);
    expect(ownerState.waiting).toEqual([{
      id: 'held',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      createdAt: ''
    }]);
    expect(ownerState.waiting[0].held).toBeUndefined();
    expect(ownerState.contributions[0].held).toBeUndefined();

    const yoursPage = publicQuestionPage({
      ownerDisplayName: 'Athan',
      snapshot: {
        ...frozen,
        yours: [{ by: 'Leaked', text: 'Should not publish.' }]
      }
    }, [{
      _id: 'held-mine',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?',
      held: true,
      contributorUserId: 'contrib-1',
      articleId: 'secret'
    }, {
      _id: 'held-theirs',
      by: 'Ada',
      text: 'Another held reading.',
      held: true,
      contributorUserId: 'contrib-2'
    }, {
      _id: 'live',
      by: 'Ada',
      text: 'Already on the page.',
      contributorUserId: 'contrib-1'
    }], 'contrib-1');
    expect(yoursPage.contributions).toEqual([{
      id: 'live',
      by: 'Ada',
      text: 'Already on the page.',
      createdAt: '',
      mine: true
    }]);
    expect(yoursPage.yours).toEqual([{
      id: 'held-mine',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?',
      createdAt: ''
    }]);
    expect(yoursPage.yours[0].contributorUserId).toBeUndefined();
    expect(yoursPage.yours[0].held).toBeUndefined();
    expect(yoursPage.waiting).toBeUndefined();
    expect(JSON.stringify(yoursPage)).not.toMatch(/contrib-1|contrib-2|secret/);
    const heldMine = [{
      _id: 'held-mine',
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      held: true,
      contributorUserId: 'contrib-1'
    }];
    expect(publicQuestionPage({ snapshot: frozen }, heldMine, 'contrib-3').yours).toBeUndefined();
    expect(publicQuestionPage({ snapshot: frozen }, heldMine).yours).toBeUndefined();
    const placedForOther = publicQuestionPage({ snapshot: frozen }, [{
      _id: 'live',
      by: 'Ada',
      text: 'Already on the page.',
      contributorUserId: 'contrib-1'
    }], 'contrib-2');
    expect(placedForOther.contributions[0].mine).toBeUndefined();
    expect(placedForOther.yours).toBeUndefined();

    const withdrawnAt = '2026-09-13T18:00:00.000Z';
    const stampedAt = '2026-09-13T17:00:00.000Z';
    expect(contributionConflict({ withdrawnAt })).toEqual({
      error: CONTRIBUTION_TAKEN_BACK,
      field: 'withdrawn'
    });
    expect(contributionConflict({ held: true }, { expectPlaced: true })).toEqual({
      error: CONTRIBUTION_HELD,
      field: 'held'
    });
    expect(contributionConflict(
      { updatedAt: stampedAt, withdrawnAt },
      { expectedUpdatedAt: '2026-09-13T16:00:00.000Z' }
    )).toEqual({
      error: CONTRIBUTION_TAKEN_BACK,
      field: 'withdrawn'
    });
    expect(contributionConflict(
      { updatedAt: stampedAt },
      { expectedUpdatedAt: '2026-09-13T16:00:00.000Z' }
    )).toEqual({
      error: CONTRIBUTION_TAKE_CHANGED,
      field: 'updatedAt'
    });
    expect(contributionConflict(
      { updatedAt: stampedAt },
      { expectedUpdatedAt: stampedAt }
    )).toBeNull();
    expect(contributionConflict({ held: true })).toBeNull();

    const withdrawnRows = [{
      _id: 'gone',
      by: 'Nia',
      text: 'I will take this back.',
      held: true,
      withdrawnAt,
      contributorUserId: 'contrib-1',
      updatedAt: withdrawnAt
    }, {
      _id: 'live',
      by: 'Ada',
      text: 'Already on the page.',
      updatedAt: stampedAt
    }];
    const silentPage = publicQuestionPage({ snapshot: frozen }, withdrawnRows, 'contrib-1');
    expect(silentPage.contributions).toEqual([{
      id: 'live',
      by: 'Ada',
      text: 'Already on the page.',
      createdAt: ''
    }]);
    expect(silentPage.yours).toBeUndefined();
    expect(silentPage.contributions[0].updatedAt).toBeUndefined();
    expect(JSON.stringify(silentPage)).not.toMatch(/withdrawnAt|I will take this back/);

    const ownerSilent = thinkShareState({
      slug: 'qslug',
      ownerDisplayName: 'Athan',
      snapshot: frozen,
      contentHash: hash
    }, {
      preview,
      currentHash: hash,
      kind: 'question',
      contributions: withdrawnRows
    });
    expect(ownerSilent.waiting).toBeUndefined();
    expect(ownerSilent.contributions[0]).toMatchObject({
      id: 'live',
      updatedAt: stampedAt
    });
    expect(JSON.stringify(ownerSilent)).not.toMatch(/withdrawnAt|I will take this back/);

    const liveRows = [{
      _id: 'live',
      by: 'Ada',
      text: 'Already on the page.',
      remainder: 'Who pays when the window closes?'
    }];
    const shareWithBrief = {
      slug: 'qslug',
      ownerDisplayName: 'Athan',
      snapshot: {
        ...frozen,
        brief: { agreement: 'Should not publish from the snapshot.' }
      },
      brief: {
        agreement: '<em>The fact is shared. The horizon is not.</em>',
        remainder: 'The window may close before compounding pays.',
        observation: 'Watch who is still in the room when the cost arrives.'
      }
    };
    expect(projectShareBrief({ snapshot: frozen }, [])).toBeNull();
    expect(projectShareBrief(shareWithBrief, liveRows)).toEqual({
      agreement: 'The fact is shared. The horizon is not.',
      remainder: 'The window may close before compounding pays.',
      observation: 'Watch who is still in the room when the cost arrives.',
      by: 'Athan'
    });
    const briefPage = publicQuestionPage(shareWithBrief, liveRows);
    expect(briefPage.brief).toEqual({
      agreement: 'The fact is shared. The horizon is not.',
      remainder: 'The window may close before compounding pays.',
      observation: 'Watch who is still in the room when the cost arrives.',
      by: 'Athan'
    });
    expect(briefPage.snapshot).toBeUndefined();
    expect(publicQuestionPage({ snapshot: frozen, brief: shareWithBrief.brief }, []).brief).toBeUndefined();
    const ownerBrief = thinkShareState(shareWithBrief, {
      preview,
      currentHash: hash,
      kind: 'question',
      contributions: liveRows
    });
    expect(ownerBrief.brief).toEqual({
      agreement: 'The fact is shared. The horizon is not.',
      remainder: 'The window may close before compounding pays.',
      observation: 'Watch who is still in the room when the cost arrives.',
      by: 'Athan'
    });
    expect(ownerBrief.snapshot.brief).toBeUndefined();

    const handed = freezeShareSuccession(shareWithBrief, liveRows, {
      outcome: '<em>The window closed. The latecomer paid.</em>',
      at: '2026-09-13T18:00:00.000Z'
    });
    expect(handed.error).toBeUndefined();
    expect(handed.succession).toEqual({
      unresolved: 'The window may close before compounding pays.',
      alternatives: [{
        id: 'live',
        by: 'Ada',
        text: 'Already on the page.',
        remainder: 'Who pays when the window closes?',
        createdAt: ''
      }],
      evidenceThen: {
        text: 'What survives compounding?',
        publishedAt: '2026-09-13T12:00:00.000Z'
      },
      uncertainty: 'The window may close before compounding pays.',
      authority: 'Athan',
      review: 'Watch who is still in the room when the cost arrives.',
      held: 'The fact is shared. The horizon is not.',
      outcome: 'The window closed. The latecomer paid.',
      handedAt: '2026-09-13T18:00:00.000Z'
    });
    expect(freezeShareSuccession(shareWithBrief, []).error).toBe(BRIEF_NEEDS_READING);
    expect(freezeShareSuccession({
      ...shareWithBrief,
      brief: { agreement: 'What holds.', remainder: '', observation: '' }
    }, liveRows).error).toBe(SUCCESSION_NEEDS_UNRESOLVED);
    expect(projectShareSuccession({
      ownerDisplayName: 'Athan',
      succession: { unresolved: 'Invented.', alternatives: [], evidenceThen: { text: 'What survives compounding?' } }
    })).toBeNull();
    const shareWithSuccession = { ...shareWithBrief, succession: handed.succession };
    const publicHanded = publicQuestionPage(shareWithSuccession, liveRows);
    expect(publicHanded.succession.unresolved).toBe('The window may close before compounding pays.');
    expect(publicHanded.succession.outcome).toBe('The window closed. The latecomer paid.');
    expect(publicHanded.snapshot).toBeUndefined();
    expect(publicQuestionPage({
      snapshot: frozen,
      succession: { unresolved: 'Should not publish from the snapshot.' }
    }, liveRows).succession).toBeUndefined();
    const ownerHanded = thinkShareState(shareWithSuccession, {
      preview,
      currentHash: hash,
      kind: 'question',
      contributions: liveRows
    });
    expect(ownerHanded.succession.unresolved).toBe('The window may close before compounding pays.');
    expect(ownerHanded.snapshot.succession).toBeUndefined();
    expect(withSuccessionOutcome(handed.succession, '').outcome).toBeUndefined();
    expect(withSuccessionOutcome(handed.succession, 'A later mixed result.').outcome).toBe('A later mixed result.');

    const named = freezeShareMandate({
      ...shareWithBrief,
      userId: 'owner-1'
    }, {
      scope: 'This published question.',
      stop: 'Stop when the successor writes what happened later.',
      review: 'Return to this door to end or renew the assignment.',
      budget: 2
    }, { now: '2026-09-14T00:20:00.000Z' });
    expect(named.error).toBeUndefined();
    expect(named.mandate.owner).toBe('Athan');
    expect(named.mandate.ownerId).toBe('owner-1');
    expect(named.mandate.tools).toBe(AGENT_MANDATE_TOOLS);
    expect(named.mandate.budget.asks).toBe(2);
    expect(freezeShareMandate({}, { scope: 'No snapshot.' }).error).toBe('This question is not published.');
    expect(freezeShareMandate(shareWithBrief, { owner: 'Athan' }).error).toBe(MANDATE_NEEDS_FIELDS);
    expect(projectShareMandate({
      mandate: { owner: 'Athan', scope: 'Invented without the rest.' }
    })).toBeNull();
    const shareWithMandate = { ...shareWithBrief, userId: 'owner-1', mandate: named.mandate };
    const publicMandated = publicQuestionPage(shareWithMandate, liveRows);
    expect(publicMandated.mandate.owner).toBe('Athan');
    expect(publicMandated.mandate.scope).toBe('This published question.');
    expect(publicMandated.mandate.ownerId).toBeUndefined();
    expect(projectShareMandate({
      userId: 'gone',
      mandate: named.mandate
    }).pause).toBe(AGENT_MANDATE_PAUSE.owner);
    expect(publicQuestionPage({
      snapshot: frozen,
      mandate: { owner: 'Should not publish from the snapshot.' }
    }, liveRows).mandate).toBeUndefined();
    const ownerMandated = thinkShareState(shareWithMandate, {
      preview,
      currentHash: hash,
      kind: 'question',
      contributions: liveRows
    });
    expect(ownerMandated.mandate.review).toBe('Return to this door to end or renew the assignment.');
    expect(ownerMandated.snapshot.mandate).toBeUndefined();
    const ended = endShareMandate(named.mandate, { now: '2026-09-14T00:21:00.000Z' });
    expect(ended.status).toBe('paused');
    expect(ended.pause).toBe(AGENT_MANDATE_PAUSE.ended);
    expect(projectShareMandate({ mandate: ended }).pause).toBe(AGENT_MANDATE_PAUSE.ended);

    const store = { share: { slug: 'qslug', userId: 'owner-1', mandate: { ...named.mandate } } };
    const SharedQuestion = {
      findOne(query = {}) {
        const match = query.slug === store.share.slug ? store.share : null;
        return {
          select() {
            return match;
          }
        };
      },
      async findOneAndUpdate(filter, update) {
        if (filter['mandate.budget.remaining'] && store.share.mandate.budget.remaining <= 0) return null;
        if (update.$inc) {
          store.share.mandate.budget.spent += update.$inc['mandate.budget.spent'];
          store.share.mandate.budget.remaining += update.$inc['mandate.budget.remaining'];
        }
        if (update.$set?.mandate) store.share.mandate = update.$set.mandate;
        return store.share;
      }
    };
    expect(await claimShareAgentAsk(SharedQuestion, { slug: 'qslug' })).toEqual({ ok: true });
    expect(store.share.mandate.budget.remaining).toBe(1);
    expect(await claimShareAgentAsk(SharedQuestion, { slug: 'qslug' })).toEqual({ ok: true });
    expect(store.share.mandate.status).toBe('paused');
    expect(await claimShareAgentAsk(SharedQuestion, { slug: 'qslug' })).toEqual({
      paused: true,
      reason: AGENT_MANDATE_PAUSE.budget
    });
    expect(await claimShareAgentAsk(SharedQuestion, { slug: 'missing' })).toEqual({ ok: true });

    expect(presenceNameFor({ userId: 'owner-1', ownerDisplayName: 'Athan' }, [], 'owner-1')).toBe('Athan');
    expect(presenceNameFor({ userId: 'owner-1', ownerDisplayName: 'Athan' }, [{
      contributorUserId: 'contrib-1',
      by: 'Mara'
    }], 'contrib-1')).toBe('Mara');
    expect(presenceNameFor({ userId: 'owner-1', ownerDisplayName: 'Athan' }, [{
      contributorUserId: 'contrib-1',
      by: 'Mara',
      held: true,
      withdrawnAt: new Date()
    }], 'contrib-1')).toBe('Mara');
    expect(presenceNameFor({ userId: 'owner-1' }, [], 'stranger')).toBe('');
    expect(presenceNameFor({ userId: 'owner-1', ownerDisplayName: 'Athan' }, liveRows, '')).toBe('');

    const now = Date.parse('2026-09-13T18:00:00.000Z');
    expect(projectPresence([
      { userId: 'owner-1', by: 'Athan', at: new Date(now) },
      { userId: 'contrib-1', by: 'Mara', at: new Date(now) },
      { userId: 'stale', by: 'Ada', at: new Date(now - PRESENCE_TTL_MS - 1) },
      { userId: 'dup', by: 'Mara', at: new Date(now) }
    ], 'owner-1', now)).toEqual([{ by: 'Mara' }]);
    expect(presenceLine([{ by: 'Mara' }])).toBe('Mara is here.');
    expect(presenceLine([{ by: 'Athan' }, { by: 'Mara' }])).toBe('Athan and Mara are here.');
    expect(presenceLine([{ by: 'Ada' }, { by: 'Athan' }, { by: 'Mara' }])).toBe('Ada, Athan, and Mara are here.');
    expect(presenceLine([])).toBe('');

    const frozenHere = freezeThinkSnapshot({
      ...preview,
      here: [{ by: 'Mara' }],
      presence: [{ by: 'Mara' }]
    }, '2026-09-13T12:00:00.000Z');
    expect(frozenHere.here).toBeUndefined();
    expect(frozenHere.presence).toBeUndefined();

    const pageWithHere = publicQuestionPage({
      snapshot: { ...frozen, here: [{ by: 'Should not freeze.' }] }
    }, liveRows, 'owner-1', [
      { userId: 'contrib-1', by: 'Mara', at: new Date() }
    ]);
    expect(pageWithHere.here).toEqual([{ by: 'Mara' }]);
    expect(publicQuestionPage({ snapshot: frozen }, liveRows).here).toBeUndefined();

    const ownerHere = thinkShareState(shareWithBrief, {
      preview,
      currentHash: hash,
      kind: 'question',
      contributions: liveRows,
      here: [{ by: 'Mara' }]
    });
    expect(ownerHere.here).toEqual([{ by: 'Mara' }]);
    expect(ownerHere.snapshot.here).toBeUndefined();
    expect(thinkShareState(shareWithBrief, {
      preview,
      currentHash: hash,
      kind: 'question',
      contributions: liveRows,
      here: []
    }).here).toBeUndefined();
  });
});
