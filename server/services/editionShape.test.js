const {
  EditionShapeError,
  collectInbox,
  emptySections,
  normalizeEdition,
  resolveEditionProfile,
  retainHeldItems
} = require('./editionShape');

const item = (over = {}) => ({
  title: 'A paper about scaling',
  url: 'https://example.com/paper',
  section: 'models_methods',
  finding: 'Loss keeps falling past the compute budget the authors expected.',
  boundary: 'One lab, one architecture, no independent replication yet.',
  ...over
});

const edition = (over = {}) => ({
  profile: 'this_week_in_ai',
  windowStart: '2026-09-01',
  windowEnd: '2026-09-07',
  items: [item(), item({ title: 'A second', url: 'https://example.com/two' })],
  ...over
});

describe('what an edition has to contain', () => {
  it('takes a well-formed week', () => {
    const built = normalizeEdition(edition());
    expect(built.profile).toBe('this_week_in_ai');
    expect(built.title).toBe('This Week in AI');
    expect(built.items).toHaveLength(2);
  });

  /* The one rule that separates this from a newsletter. */
  it('refuses an item that cannot say what would limit it', () => {
    expect(() => normalizeEdition(edition({ items: [item({ boundary: '' }), item()] })))
      .toThrow(/needs a boundary/);
    expect(() => normalizeEdition(edition({ items: [item({ boundary: '   ' }), item()] })))
      .toThrow(/announcement, not evidence/);
  });

  it('refuses an item with nothing to say', () => {
    expect(() => normalizeEdition(edition({ items: [item({ finding: '' }), item()] })))
      .toThrow(/needs a finding/);
    expect(() => normalizeEdition(edition({ items: [item({ title: '' }), item()] })))
      .toThrow(/needs a title/);
  });

  /* The caller is an agent that can fix the payload and try again, so a
     refusal names the item and the section it should have used. */
  it('names the sections when an item is filed under one that does not exist', () => {
    expect(() => normalizeEdition(edition({ items: [item({ section: 'vibes' }), item()] })))
      .toThrow(/models_methods, infrastructure_systems, evaluation_counterevidence/);
  });

  it('refuses a profile it does not publish', () => {
    expect(() => normalizeEdition(edition({ profile: 'this-week-in-crypto' })))
      .toThrow(/Known profiles/);
  });

  /* The save door turns each link into a library row, so a link that is not
     a link would become a saved source pointing at nothing. */
  it('refuses a link the reader could not open', () => {
    ['javascript:alert(1)', 'data:text/html,hi', 'not a url', ''].forEach((url) => {
      expect(() => normalizeEdition(edition({ items: [item({ url }), item()] }))).toThrow(EditionShapeError);
    });
  });

  it('drops the fragment so two links to one page are one source', () => {
    const built = normalizeEdition(edition({ items: [item({ url: 'https://example.com/p#intro' }), item()] }));
    expect(built.items[0].url).toBe('https://example.com/p');
  });

  it('holds the edition to a size a person would read', () => {
    const many = Array.from({ length: 9 }, (_, index) => item({ url: `https://example.com/${index}` }));
    expect(() => normalizeEdition(edition({ items: many }))).toThrow(/has chosen nothing/);
    expect(() => normalizeEdition(edition({ items: [item()] }))).toThrow(/at least 2 items/);
  });

  it('will not let two items answer to one id', () => {
    expect(() => normalizeEdition(edition({
      items: [item({ itemId: 'a' }), item({ itemId: 'a', url: 'https://example.com/2' })]
    }))).toThrow(/share the id/);
  });

  it('gives every item an id when the agent supplied none', () => {
    expect(normalizeEdition(edition()).items.map(entry => entry.itemId)).toEqual(['item-1', 'item-2']);
  });

  it('refuses a window that runs backwards', () => {
    expect(() => normalizeEdition(edition({ windowStart: '2026-09-07', windowEnd: '2026-09-01' })))
      .toThrow(/falls before/);
    expect(() => normalizeEdition(edition({ windowStart: 'someday' }))).toThrow(/must be a date/);
  });
});

describe('what the week did not cover', () => {
  /* Not a failure. An empty counterevidence layer is the most useful sentence
     a week can contain, and hiding it is what a newsletter does. */
  it('names the sections nobody filled', () => {
    const built = normalizeEdition(edition());
    expect(emptySections(built).map(section => section.key))
      .toEqual(['infrastructure_systems', 'evaluation_counterevidence']);
  });

  it('says nothing when the week covered its own shape', () => {
    const built = normalizeEdition(edition({
      items: [
        item(),
        item({ section: 'infrastructure_systems', url: 'https://example.com/b' }),
        item({ section: 'evaluation_counterevidence', url: 'https://example.com/c' })
      ]
    }));
    expect(emptySections(built)).toEqual([]);
  });

  it('says nothing about a profile it does not know', () => {
    expect(emptySections({ profile: 'nope', items: [] })).toEqual([]);
    expect(emptySections()).toEqual([]);
  });

  it('does not invent columns for a profile that named none', () => {
    const profiles = {
      climate: {
        key: 'climate',
        titleLabel: 'Climate',
        issueLabel: 'Issue',
        sections: [],
        minItems: 1,
        maxItems: 15
      }
    };
    const built = normalizeEdition({
      profile: 'climate',
      windowStart: '2026-09-01',
      windowEnd: '2026-09-07',
      items: [item({ section: 'deployment' })]
    }, { profiles });
    expect(emptySections({ profile: built.profile, items: built.items, profiles })).toEqual([]);
    expect(built.items[0].section).toBe('deployment');
  });
});

describe('profiles', () => {
  it('reads a profile however the agent spelled it', () => {
    expect(resolveEditionProfile('this-week-in-ai')?.key).toBe('this_week_in_ai');
    expect(resolveEditionProfile('  This_Week_In_AI ')?.key).toBe('this_week_in_ai');
    expect(resolveEditionProfile('unknown')).toBeNull();
  });

  /* AI reads in three layers; a reading week reads in four. The difference is
     the argument against neutral sections. */
  it('gives each profile its own shape', () => {
    expect(resolveEditionProfile('this_week_in_ai').sections).toHaveLength(3);
    expect(resolveEditionProfile('weekend_readings').sections.map(s => s.key)).toContain('counterevidence');
  });
});

describe('the public paper', () => {
  const { hashPublicEdition, projectPublicEdition, publicHttpUrl } = require('./editionShape');

  it('keeps the editorial paper and drops the private house', () => {
    const seen = projectPublicEdition({
      _id: 'e1',
      userId: 'user-1',
      profile: 'this_week_in_ai',
      title: 'This Week in AI',
      number: 14,
      windowStart: '2026-09-01',
      windowEnd: '2026-09-07',
      standfirst: 'A quiet week.',
      throughLine: 'Inference cost.',
      watchNext: ['The replication'],
      writtenBy: { label: 'Jarvis', agentTokenId: 'tok-9' },
      savedCount: 3,
      items: [{
        itemId: 'item-1',
        title: 'A paper about scaling',
        url: 'https://example.com/paper#intro',
        sourceLabel: 'Lab Blog',
        sourceDate: 'Sep 3',
        section: 'models_methods',
        finding: 'Loss keeps falling.',
        boundary: 'One lab.',
        note: 'Editorial aside.',
        savedArticleId: 'art-1',
        filedBy: { label: 'Jarvis', agentTokenId: 'tok-9' },
        placement: 'later',
        highlights: [{ text: 'secret' }]
      }]
    }, 'Athan');

    expect(seen).toEqual({
      title: 'This Week in AI',
      issueLabel: 'Issue',
      number: 14,
      windowStart: '2026-09-01',
      windowEnd: '2026-09-07',
      standfirst: 'A quiet week.',
      throughLine: 'Inference cost.',
      watchNext: ['The replication'],
      writtenBy: '',
      ownerDisplayName: 'Athan',
      sections: [
        { key: 'models_methods', label: 'Models & methods' },
        { key: 'infrastructure_systems', label: 'Infrastructure & systems' },
        { key: 'evaluation_counterevidence', label: 'Evaluation & counterevidence' }
      ],
      items: [{
        itemId: 'item-1',
        title: 'A paper about scaling',
        url: 'https://example.com/paper',
        sourceLabel: 'Lab Blog',
        sourceDate: 'Sep 3',
        section: 'models_methods',
        finding: 'Loss keeps falling.',
        boundary: 'One lab.',
        note: 'Editorial aside.'
      }]
    });
    expect(seen._id).toBeUndefined();
    expect(JSON.stringify(seen)).not.toMatch(/art-1|tok-9|user-1|secret|later|savedCount/);
    expect(hashPublicEdition(seen)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('will not turn a javascript URL into an outbound source link', () => {
    expect(publicHttpUrl('javascript:alert(1)')).toBe('');
    expect(publicHttpUrl('data:text/html,hi')).toBe('');
    expect(publicHttpUrl('https://example.com/ok')).toBe('https://example.com/ok');
  });

  it('keeps a custom profile’s section labels', () => {
    const seen = projectPublicEdition({
      profile: 'biotech',
      title: 'Biotech',
      windowStart: '2026-09-01',
      windowEnd: '2026-09-30',
      items: []
    }, 'Athan', {
      profiles: {
        biotech: {
          key: 'biotech',
          titleLabel: 'Biotech',
          issueLabel: 'Month',
          sections: [{ key: 'trials', label: 'Trials' }]
        }
      }
    });
    expect(seen.issueLabel).toBe('Month');
    expect(seen.sections).toEqual([{ key: 'trials', label: 'Trials' }]);
  });

  /* A stranger is told which agent wrote it, by runtime, and a paper filed
     before runtimes were recorded projects exactly as it did. */
  it('carries the writer’s runtime only when there is one', () => {
    const edition = {
      profile: 'this_week_in_ai', title: 'This Week in AI', windowStart: '2026-09-28', windowEnd: '2026-10-04', items: []
    };
    const named = projectPublicEdition({ ...edition, writtenBy: { label: 'My laptop', agentTokenId: 't1', runtime: 'codex' } }, 'Athan');
    expect(named.writtenByRuntime).toBe('codex');
    const legacy = projectPublicEdition({ ...edition, writtenBy: { label: 'My laptop', agentTokenId: 't1' } }, 'Athan');
    expect(legacy).not.toHaveProperty('writtenByRuntime');
    expect(hashPublicEdition(projectPublicEdition({ ...edition, writtenBy: { label: 'My laptop', runtime: '' } }, 'Athan')))
      .toBe(hashPublicEdition(legacy));
  });

  /* A share published before hands were named by what they are still holds
     the label typed for a token; a public read never lets it out. */
  it('names every public hand by the agent, even on a share published earlier', () => {
    const { publicHands } = require('./editionShape');
    const old = {
      title: 'This Week in AI',
      writtenBy: 'Codex Wiki account grounding audit',
      silences: [{ key: 'm', label: 'Models', state: 'checked', by: [{ label: 'Jarvis', runtime: '' }, { label: 'My OpenClaw box', runtime: '' }] }]
    };
    expect(publicHands(old)).toEqual({
      title: 'This Week in AI',
      writtenBy: 'Codex',
      silences: [{ key: 'm', label: 'Models', state: 'checked', by: [{ label: 'OpenClaw', runtime: '' }] }]
    });
    expect(publicHands({ writtenBy: 'Jarvis' }).writtenBy).toBe('');
    expect(publicHands(publicHands(old))).toEqual(publicHands(old));
  });

  /* Which silence an empty section is belongs to the paper, so it travels;
     a share from before receipts projects, and hashes, as it did. */
  it('carries the silences a stranger can read, and none it cannot tell', () => {
    const edition = {
      profile: 'this_week_in_ai', title: 'This Week in AI', windowStart: '2026-09-07', windowEnd: '2026-09-13', items: [],
      checks: [{ section: 'models_methods', note: 'Private reasoning.', by: { label: 'Jarvis', agentTokenId: 't1', runtime: 'openclaw' } }]
    };
    const now = new Date('2026-10-09');
    const seen = projectPublicEdition(edition, 'Athan', { receiptsSince: '2026-09-07', now });
    expect(seen.silences).toEqual([
      { key: 'models_methods', label: 'Models & methods', state: 'checked', by: [{ label: 'OpenClaw', runtime: 'openclaw' }] },
      { key: 'infrastructure_systems', label: 'Infrastructure & systems', state: 'unreported', by: [] },
      { key: 'evaluation_counterevidence', label: 'Evaluation & counterevidence', state: 'unreported', by: [] }
    ]);
    expect(JSON.stringify(seen)).not.toMatch(/Private reasoning|t1|Jarvis/);

    const legacy = { ...edition, checks: [] };
    expect(projectPublicEdition(legacy, 'Athan', { now })).not.toHaveProperty('silences');
    expect(hashPublicEdition(projectPublicEdition(legacy, 'Athan', { now })))
      .toBe(hashPublicEdition(projectPublicEdition({ ...legacy, checks: undefined }, 'Athan')));
  });
});

describe('a second reading on a shared paper', () => {
  const { hashPublicEdition, projectPublicEdition } = require('./editionShape');
  const issue = (items) => ({
    profile: 'this_week_in_ai', title: 'This Week in AI', windowStart: '2026-09-28', windowEnd: '2026-10-04', items
  });
  const first = {
    itemId: 'i1', title: 'A paper', url: 'https://example.com/a', section: 'models_methods',
    finding: 'Twelve points better.', boundary: 'One lab.',
    filedBy: { label: 'OpenClaw · Jarvis', agentTokenId: 't1', runtime: 'openclaw' }
  };

  it('publishes both hands and nothing private about either', () => {
    const seen = projectPublicEdition(issue([{
      ...first,
      readings: [{
        filedBy: { label: 'Codex', agentTokenId: 't2', runtime: 'codex' },
        filedAt: '2026-10-01', finding: 'Within noise.', boundary: 'Three seeds.', note: ''
      }]
    }]), 'Athan');
    expect(seen.items[0]).toMatchObject({
      filedBy: 'OpenClaw',
      filedByRuntime: 'openclaw',
      readings: [{ filedBy: 'Codex', filedByRuntime: 'codex', finding: 'Within noise.', boundary: 'Three seeds.', note: '' }]
    });
    expect(JSON.stringify(seen)).not.toMatch(/t1|t2|filedAt|Jarvis/);
  });

  /* The label is typed for the owner's eyes. A stranger gets the agent's
     name when the label carries one, and no name when it does not. */
  it('never publishes a token label', () => {
    const seen = projectPublicEdition(issue([{
      ...first,
      filedBy: { label: 'Codex Wiki account grounding audit', agentTokenId: 't1', runtime: '' },
      readings: [{ filedBy: { label: 'Night shift on the studio Mac', agentTokenId: 't2', runtime: '' }, finding: 'f', boundary: 'b' }]
    }]), 'Athan');
    expect(seen.items[0].filedBy).toBe('Codex');
    expect(seen.items[0].readings[0].filedBy).toBe('');
    expect(JSON.stringify(seen)).not.toMatch(/grounding|Night shift/);
  });

  it('projects a single-hand item exactly as before', () => {
    const seen = projectPublicEdition(issue([first]), 'Athan');
    expect(seen.items[0]).not.toHaveProperty('readings');
    expect(seen.items[0]).not.toHaveProperty('filedBy');
    expect(hashPublicEdition(seen)).toBe(hashPublicEdition(projectPublicEdition(issue([{ ...first, readings: [] }]), 'Athan')));
  });
});

describe('the two silences', () => {
  const { normalizeChecks, sectionSilences } = require('./editionShape');
  const profile = resolveEditionProfile('this_week_in_ai');
  const week = {
    profile: 'this_week_in_ai', windowStart: '2026-09-07', windowEnd: '2026-09-13', now: new Date('2026-10-09')
  };
  const stateOf = (silences, key) => silences.find(silence => silence.key === key)?.state;

  it('refuses a check on a section the paper does not have, naming the ones it has', () => {
    expect(() => normalizeChecks(['models_methods', { section: 'robotics' }], profile))
      .toThrow(/Check 2 names "robotics".*models_methods, infrastructure_systems, evaluation_counterevidence/);
  });

  it('takes a key or a key with a note, once per section', () => {
    expect(normalizeChecks(['models-methods', { section: 'models_methods', note: 'again' }, { section: 'infrastructure_systems', note: ' Quiet. ' }], profile))
      .toEqual([{ section: 'models_methods', note: '' }, { section: 'infrastructure_systems', note: 'Quiet.' }]);
  });

  it('accuses no issue opened before the paper took receipts', () => {
    const before = sectionSilences({ ...week, receiptsSince: '2026-09-14' });
    expect(before.map(silence => silence.state)).toEqual(['unknown', 'unknown', 'unknown']);
    const from = sectionSilences({ ...week, receiptsSince: '2026-09-07' });
    expect(from.map(silence => silence.state)).toEqual(['unreported', 'unreported', 'unreported']);
    expect(sectionSilences({ ...week, receiptsSince: null }).map(silence => silence.state)).toEqual(['unknown', 'unknown', 'unknown']);
  });

  it('waits out the grace before calling a section unreported', () => {
    const at = now => stateOf(sectionSilences({ ...week, receiptsSince: '2026-09-01', now: new Date(now) }), 'models_methods');
    expect(at('2026-09-16T23:00:00Z')).toBe('unknown');
    expect(at('2026-09-17T01:00:00Z')).toBe('unreported');
  });

  it('names every agent that looked, and lets an item supersede them', () => {
    const checks = [
      { section: 'models_methods', by: { label: 'Jarvis', agentTokenId: 't1', runtime: 'openclaw' } },
      { section: 'models_methods', by: { label: 'Codex', agentTokenId: 't2', runtime: 'codex' } }
    ];
    const silences = sectionSilences({ ...week, checks, receiptsSince: '2026-09-07' });
    expect(silences[0]).toEqual({
      key: 'models_methods',
      label: 'Models & methods',
      state: 'checked',
      by: [{ label: 'Jarvis', runtime: 'openclaw' }, { label: 'Codex', runtime: 'codex' }]
    });
    const filled = sectionSilences({ ...week, checks, items: [{ section: 'models_methods' }], receiptsSince: '2026-09-07' });
    expect(filled.map(silence => silence.key)).not.toContain('models_methods');
  });
});

describe('keeping a reader’s place in a rewritten week', () => {
  it('follows the source URL, not the position', () => {
    const kept = retainHeldItems(
      [
        { itemId: 'item-1', url: 'https://example.com/two', title: 'B' },
        { itemId: 'item-2', url: 'https://example.com/paper', title: 'A' }
      ],
      [
        { itemId: 'item-1', url: 'https://example.com/paper', savedArticleId: 'art-1', readerState: { status: 'opened', at: 'then' } },
        { itemId: 'item-2', url: 'https://example.com/two' }
      ],
      { label: 'Jarvis' },
      new Date()
    );
    const paper = kept.find(row => row.url === 'https://example.com/paper');
    expect(paper.itemId).toBe('item-1');
    expect(paper.savedArticleId).toBe('art-1');
    expect(paper.readerState.status).toBe('opened');
  });

  it('refuses a collision instead of silently renaming', () => {
    expect(() => retainHeldItems(
      [
        { itemId: 'item-1', url: 'https://example.com/new', title: 'New' },
        { itemId: 'x', url: 'https://example.com/paper', title: 'A' }
      ],
      [{ itemId: 'item-1', url: 'https://example.com/paper' }],
      {},
      new Date()
    )).toThrow(/share the id/);
  });

  it('collects only new, ready items, newest filing first', () => {
    const inbox = collectInbox([
      {
        _id: 'e1',
        profile: 'this_week_in_ai',
        title: 'This Week in AI',
        createdAt: '2026-09-01',
        items: [
          { itemId: 'old', title: 'Opened', url: 'https://example.com/a', finding: 'A', boundary: 'B', filedAt: '2026-09-08', readerState: { status: 'opened' } },
          { itemId: 'bad', title: 'No link', url: 'javascript:alert(1)', finding: 'A', boundary: 'B', filedAt: '2026-09-10' },
          { itemId: 'fresh', title: 'Fresh', url: 'https://example.com/b', finding: 'A', boundary: 'B', filedAt: '2026-09-09' }
        ]
      }
    ]);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].itemId).toBe('fresh');
    expect(inbox.items[0].finding).toBeUndefined();

    const power = collectInbox([
      {
        _id: 'e1',
        profile: 'this_week_in_ai',
        title: 'This Week in AI',
        createdAt: '2026-09-01',
        items: [
          {
            itemId: 'fresh', title: 'Fresh', url: 'https://example.com/b',
            finding: 'A useful finding.', boundary: 'One lab only.', note: 'Read beside Tuesday.',
            filedBy: { label: 'Jarvis' }, savedArticleId: 'article-1', filedAt: '2026-09-09',
            readings: [{ filedBy: { label: 'Codex', runtime: 'codex' }, finding: 'A second view.', boundary: 'Its own limit.' }]
          }
        ]
      }
    ], { withContent: true });
    expect(power.items[0]).toMatchObject({
      finding: 'A useful finding.',
      boundary: 'One lab only.',
      note: 'Read beside Tuesday.',
      filedBy: 'Jarvis',
      savedArticleId: 'article-1',
      readings: [{ filedBy: 'Codex', filedByRuntime: 'codex', finding: 'A second view.', boundary: 'Its own limit.', note: '' }]
    });
  });

  it('narrows arrivals to one paper, and to the hand that filed or read them', () => {
    const item = (itemId, filedBy, readings = []) => ({
      itemId, title: itemId, url: `https://example.com/${itemId}`, finding: 'A', boundary: 'B', filedAt: '2026-09-09', filedBy, readings
    });
    const editions = [
      {
        _id: 'ai',
        profile: 'this_week_in_ai',
        items: [
          item('codex', { label: 'Codex Wiki account grounding audit' }),
          item('claw', { label: 'Second reader', runtime: 'openclaw' }),
          item('both', { label: 'Desk', runtime: 'codex' }, [{ filedBy: { label: 'Jarvis', runtime: 'openclaw' } }])
        ]
      },
      { _id: 'wr', profile: 'weekend_readings', items: [item('weekend', { runtime: 'codex' })] }
    ];
    const ids = options => collectInbox(editions, options).items.map(row => row.itemId).sort();
    expect(ids({ profile: 'weekend_readings' })).toEqual(['weekend']);
    expect(ids({ by: 'openclaw' })).toEqual(['both', 'claw']);
    expect(ids({ by: 'codex', profile: 'this_week_in_ai' })).toEqual(['both', 'codex']);
    expect(ids({ by: 'agent:nobody' })).toEqual([]);
  });
});

describe('the reader’s layer of a finding', () => {
  const { answerWatchList, projectPublicEdition, hashPublicEdition, readerLayerOf } = require('./editionShape');
  const layered = over => item({
    finding: 'Agents completed 83.54% of tasks but recovered from 46.72% of failures.',
    plain: 'Finishing a job and cleaning up after a mistake are different skills.',
    passage: 'task competence of 83.54% … conditional recovery of 46.72%',
    sourceKind: 'Peer-reviewed',
    confidence: 'Moderate',
    figures: [{ label: 'Recovered', value: '46.72%' }, { label: 'Trials', value: '2,880' }],
    note: 'Across 2880 paired trials.',
    ...over
  });
  const two = first => [first, item({ title: 'A second', url: 'https://example.com/two' })];

  it('takes a plain line, a passage, a source kind, how sure, and the numbers it turns on', () => {
    const [built] = normalizeEdition(edition({ items: two(layered()) })).items;
    expect(built).toMatchObject({
      plain: 'Finishing a job and cleaning up after a mistake are different skills.',
      sourceKind: 'peer_reviewed',
      confidence: 'moderate',
      figures: [{ label: 'Recovered', value: '46.72%' }, { label: 'Trials', value: '2,880' }]
    });
  });

  it('asks nothing of an item that carries none of it', () => {
    const [built] = normalizeEdition(edition()).items;
    expect(built).toMatchObject({ plain: '', passage: '', sourceKind: '', confidence: '', figures: [] });
  });

  /* A key figure is a quotation: a number the agent never wrote down beside
     the finding is how a paper starts making things up. */
  it('refuses a key figure that its finding, passage and note never say', () => {
    expect(() => normalizeEdition(edition({ items: two(layered({ figures: [{ label: 'Recovered', value: '47%' }] })) })))
      .toThrow(/key figure "Recovered" \(47%\) is not in its finding/);
    /* "147" does not say 47. */
    expect(() => normalizeEdition(edition({ items: two(layered({ note: 'Across 147 participants.', figures: [{ label: 'Share', value: '47' }] })) })))
      .toThrow(/key figure "Share" \(47\) is not in its finding/);
    expect(() => normalizeEdition(edition({ items: two(layered({ figures: [{ label: 'Mood', value: 'high' }] })) })))
      .toThrow(/has no number in it/);
    expect(() => normalizeEdition(edition({ items: two(layered({ figures: Array(4).fill({ label: 'Recovered', value: '46.72%' }) })) })))
      .toThrow(/keep the 3/);
  });

  it('names the words it knows when a source kind or confidence is not one of them', () => {
    expect(() => normalizeEdition(edition({ items: two(layered({ sourceKind: 'blog' })) })))
      .toThrow(/preprint, peer_reviewed, company, news, other/);
    expect(() => normalizeEdition(edition({ items: two(layered({ confidence: 'certain' })) })))
      .toThrow(/high, moderate, low/);
  });

  it('says whether a passage has been held to its source yet', () => {
    expect(readerLayerOf({ passage: 'words' }).passageCheck).toBe('unchecked');
    expect(readerLayerOf({ passage: 'words', passageCheck: 'missing' }).passageCheck).toBe('missing');
    expect(readerLayerOf({}).passageCheck).toBe('');
  });

  /* A check holds for the words it checked. */
  it('keeps a passage check across a rewrite only while the passage is unchanged', () => {
    const held = [{ ...layered(), itemId: 'item-1', passageCheck: 'found' }];
    const [same] = retainHeldItems([layered()], held, { label: 'x' });
    const [changed] = retainHeldItems([layered({ passage: 'other words entirely' })], held, { label: 'x' });
    expect(same.passageCheck).toBe('found');
    expect(changed.passageCheck).toBe('');
  });

  /* A stranger sees a passage only once it was found in the source, and a
     share published before any of this keeps its hash. */
  it('publishes a passage only once it was found, and leaves old shares alone', () => {
    const issue = items => ({ profile: 'this_week_in_ai', title: 'This Week in AI', windowStart: '2026-09-01', windowEnd: '2026-09-07', items });
    const plain = normalizeEdition(edition()).items[0];
    const [rich] = normalizeEdition(edition({ items: two(layered()) })).items;
    expect(projectPublicEdition(issue([rich]), 'Athan').items[0]).not.toHaveProperty('passage');
    expect(projectPublicEdition(issue([{ ...rich, passageCheck: 'found' }]), 'Athan').items[0].passage).toMatch(/83.54%/);
    expect(projectPublicEdition(issue([rich]), 'Athan').items[0]).toMatchObject({ plain: rich.plain, sourceKind: 'peer_reviewed' });
    const { plain: _p, passage: _q, sourceKind: _s, confidence: _c, figures: _f, ...before } = plain;
    expect(hashPublicEdition(projectPublicEdition(issue([plain]), 'Athan')))
      .toBe(hashPublicEdition(projectPublicEdition(issue([before]), 'Athan')));
  });

  /* "Watch for X" is a promise; the next issue says what became of it. */
  it('answers only lines the last issue printed, as it printed them, newest answer winning', () => {
    const { followUps } = normalizeEdition(edition({ followUps: [{ watch: 'whether undobench replicates', status: 'Not yet' }] }));
    const printed = ['Whether UndoBench replicates', 'The next open-weight release'];
    expect(answerWatchList(followUps, printed)).toEqual([{ watch: 'Whether UndoBench replicates', status: 'not_yet', note: '' }]);
    expect(answerWatchList([...followUps, { watch: 'Whether UndoBench replicates', status: 'happened', note: 'It did.' }], printed))
      .toEqual([{ watch: 'Whether UndoBench replicates', status: 'happened', note: 'It did.' }]);
    expect(() => answerWatchList([{ watch: 'Something else', status: 'happened' }], printed)).toThrow(/It printed: Whether UndoBench/);
    expect(() => answerWatchList([{ watch: 'Something else', status: 'happened' }], [])).toThrow(/printed no watch list/);
    expect(() => normalizeEdition(edition({ followUps: [{ watch: 'x' }] }))).toThrow(/needs a status/);
  });
});
