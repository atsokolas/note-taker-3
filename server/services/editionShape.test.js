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
      writtenBy: 'Jarvis',
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
      { key: 'models_methods', label: 'Models & methods', state: 'checked', by: [{ label: 'Jarvis', runtime: 'openclaw' }] },
      { key: 'infrastructure_systems', label: 'Infrastructure & systems', state: 'unreported', by: [] },
      { key: 'evaluation_counterevidence', label: 'Evaluation & counterevidence', state: 'unreported', by: [] }
    ]);
    expect(JSON.stringify(seen)).not.toMatch(/Private reasoning|t1/);

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
      filedBy: 'OpenClaw · Jarvis',
      filedByRuntime: 'openclaw',
      readings: [{ filedBy: 'Codex', filedByRuntime: 'codex', finding: 'Within noise.', boundary: 'Three seeds.', note: '' }]
    });
    expect(JSON.stringify(seen)).not.toMatch(/t1|t2|filedAt/);
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
            filedBy: { label: 'Jarvis' }, savedArticleId: 'article-1', filedAt: '2026-09-09'
          }
        ]
      }
    ], { withContent: true });
    expect(power.items[0]).toMatchObject({
      finding: 'A useful finding.',
      boundary: 'One lab only.',
      note: 'Read beside Tuesday.',
      filedBy: 'Jarvis',
      savedArticleId: 'article-1'
    });
  });
});
