const {
  InstitutionError,
  proposeLineage,
  readCalibration,
  readMemory,
  rejectLineage
} = require('./institutionService');
const { exportBundle, validateImport } = require('./institutionalPortability');

const hostPage = {
  _id: '64f500000000000000000010',
  userId: 'user-host',
  title: 'Compute stays scarce',
  slug: 'compute-stays-scarce',
  status: 'active',
  sourceRefs: [{ type: 'article', title: 'DOE capacity report', url: 'https://example.com/doe' }],
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    confidence: 'certain',
    why: [{ text: 'PRIVATE_WHY' }],
    assumptions: [{ text: 'Lead times stay long.' }],
    verdicts: [{ result: 'held_up', recordedAt: '2026-08-01T00:00:00.000Z' }]
  }
};

const otherPage = {
  _id: '64f500000000000000000011',
  userId: 'user-host',
  title: 'Conversion holds',
  status: 'active',
  judgment: {
    currentJudgment: 'Conversion holds in 2027.',
    assumptions: [{ text: 'Lead times stay long.' }]
  }
};

const memory = () => {
  const pages = { [hostPage._id]: { ...hostPage }, [otherPage._id]: { ...otherPage } };
  const links = [];
  const WikiPage = {
    findOne: async ({ _id, userId }) => {
      const page = pages[String(_id)];
      if (!page) return null;
      if (userId && String(page.userId) !== String(userId)) return null;
      return page;
    },
    find: async ({ _id, userId }) => {
      const ids = _id?.$in;
      return Object.values(pages).filter((page) => {
        if (userId && String(page.userId) !== String(userId)) return false;
        if (ids) return ids.map(String).includes(String(page._id));
        return true;
      });
    }
  };
  const CrossCaseLink = {
    find: async ({ userId, $or }) => links.filter((row) => {
      if (String(row.userId) !== String(userId)) return false;
      if (!$or) return true;
      return $or.some((clause) => (
        String(row.fromPageId) === String(clause.fromPageId)
        || String(row.toPageId) === String(clause.toPageId)
      ));
    }),
    findOne: async ({ _id, userId, requestId }) => links.find((row) => (
      (_id && String(row._id) === String(_id) && String(row.userId) === String(userId))
      || (requestId && row.requestId === requestId)
    )) || null,
    create: async (payload) => {
      const row = {
        ...payload,
        _id: `link-${links.length + 1}`,
        async save() { return this; }
      };
      links.push(row);
      return row;
    }
  };
  const receipts = [];
  const NoeisReceipt = {
    findOneAndUpdate: async (_query, { $set }) => {
      receipts.push($set);
      return $set;
    }
  };
  const events = [];
  const DecisionMemoryEvent = {
    find: async () => events,
    findOne: async ({ key }) => events.find((row) => row.key === key) || null,
    create: async (payload) => {
      events.push(payload);
      return payload;
    }
  };
  return { WikiPage, CrossCaseLink, NoeisReceipt, DecisionMemoryEvent, receipts, links };
};

describe('institution persistence', () => {
  it('lets a user reject a proposed cross-case thread', async () => {
    const deps = memory();
    const proposed = await proposeLineage({
      ...deps,
      userId: 'user-host',
      pageId: hostPage._id,
      toPageId: otherPage._id,
      kind: 'assumption',
      object: { kind: 'assumption', text: 'Lead times stay long.' },
      now: () => new Date('2026-08-31T12:00:00.000Z')
    });
    expect(proposed.thread.knots).toHaveLength(1);
    expect(proposed.link.status).toBe('proposed');
    const cut = await rejectLineage({
      ...deps,
      userId: 'user-host',
      pageId: hostPage._id,
      linkId: proposed.link._id,
      now: () => new Date('2026-08-31T13:00:00.000Z')
    });
    expect(cut.link.status).toBe('rejected');
    expect(cut.thread.cut).toHaveLength(1);
    expect(cut.thread.knots).toHaveLength(0);
    expect(deps.receipts.some((row) => row.kind === 'cross_case_lineage_rejected')).toBe(true);
  });

  it('keeps calibration private to the owner and memory public projection leak-free', async () => {
    const deps = memory();
    const calibration = await readCalibration({ WikiPage: deps.WikiPage, userId: 'user-host' });
    expect(calibration.private).toBe(true);
    expect(calibration.cases.every((row) => row.pageId !== 'stranger')).toBe(true);
    expect(JSON.stringify(calibration)).not.toMatch(/leaderboard/);
    const memoryView = await readMemory({
      WikiPage: deps.WikiPage,
      CrossCaseLink: deps.CrossCaseLink,
      userId: 'user-host',
      pageId: hostPage._id
    });
    expect(memoryView.visibility).toBe('owner');
    expect(memoryView.why).toContain('PRIVATE_WHY');
    const publicView = await readMemory({
      WikiPage: {
        findOne: async () => hostPage
      },
      CrossCaseLink: { find: async () => [] },
      userId: 'stranger',
      pageId: hostPage._id
    });
    expect(publicView.visibility).toBe('public');
    expect(JSON.stringify(publicView)).not.toMatch(/PRIVATE_WHY/);
  });

  it('round-trips a signed institution export', () => {
    const bundle = exportBundle({
      pages: [hostPage],
      secret: 'institution-test-secret',
      ownerId: 'user-host',
      signedAt: '2026-08-31T12:00:00.000Z'
    });
    expect(validateImport(bundle, { secret: 'institution-test-secret' }).ok).toBe(true);
  });

  it('refuses a thread between cases that are not the owner\'s', async () => {
    const deps = memory();
    await expect(proposeLineage({
      ...deps,
      userId: 'stranger',
      pageId: hostPage._id,
      toPageId: otherPage._id,
      kind: 'assumption',
      object: { kind: 'assumption', text: 'Lead times stay long.' }
    })).rejects.toBeInstanceOf(InstitutionError);
  });
});
