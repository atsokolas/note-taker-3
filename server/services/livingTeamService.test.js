const {
  LivingTeamError,
  approveVersion,
  grantSeat,
  handOffCase,
  readTeam,
  revokeSeat
} = require('./livingTeamService');

const hostPage = {
  _id: '64f500000000000000000010',
  userId: 'user-host',
  title: 'Compute stays scarce',
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    ownerLabel: 'Athan',
    decisionPosture: 'watch',
    why: [{ text: 'PRIVATE_WHY' }],
    assumptions: [{ text: 'Lead times stay long.' }],
    unknowns: [{ unknownId: 'u1', question: 'Does conversion slip?' }],
    falsifiers: [{ text: 'Prices fall through the median.' }]
  }
};

const otherPage = {
  _id: '64f500000000000000000011',
  userId: 'user-reader',
  judgment: {
    currentJudgment: 'Compute eases in two regions.',
    ownerLabel: 'Sam',
    decisionPosture: 'act',
    assumptions: [{ text: 'Fabs arrive on time.' }]
  }
};

const memoryTeam = (seed = {}) => {
  const row = {
    hostPageId: hostPage._id,
    hostUserId: hostPage.userId,
    mandate: { exposure: 'least', purpose: '', allowed: [], denied: [] },
    members: seed.members || [{
      userId: hostPage.userId,
      pageId: hostPage._id,
      label: 'Athan',
      roles: ['administer'],
      grantedAt: new Date('2026-08-01T00:00:00.000Z')
    }],
    approvals: [],
    handoffs: [],
    audit: [],
    markModified() {},
    async save() { return this; }
  };
  return row;
};

const models = (team) => {
  const pages = {
    [hostPage._id]: hostPage,
    [otherPage._id]: otherPage
  };
  const WikiPage = {
    findOne: async ({ _id, userId }) => {
      const page = pages[String(_id)];
      if (!page) return null;
      if (userId && String(page.userId) !== String(userId)) return null;
      return page;
    },
    find: async ({ _id }) => {
      const ids = _id?.$in || [];
      return ids.map((key) => pages[String(key)]).filter(Boolean);
    }
  };
  const CaseTeam = {
    findOne: async () => team,
    create: async (payload) => {
      Object.assign(team, payload);
      return team;
    }
  };
  const receipts = [];
  const NoeisReceipt = {
    findOneAndUpdate: async (_query, { $set }) => {
      receipts.push($set);
      return $set;
    }
  };
  return { WikiPage, CaseTeam, NoeisReceipt, receipts };
};

describe('living team persistence', () => {
  it('grants a seat onto the overlay without copying the host judgment', async () => {
    const team = memoryTeam();
    const deps = models(team);
    const result = await grantSeat({
      ...deps,
      userId: 'user-host',
      pageId: hostPage._id,
      memberUserId: 'user-reader',
      memberPageId: otherPage._id,
      roles: ['decide'],
      now: () => new Date('2026-08-31T12:00:00.000Z')
    });
    expect(result.seat.pageId).toBe(otherPage._id);
    expect(result.seat.roles).toEqual(expect.arrayContaining(['observe', 'decide']));
    expect(hostPage.judgment.currentJudgment).toBe('Compute stays scarce through 2027.');
    expect(otherPage.judgment.currentJudgment).toBe('Compute eases in two regions.');
    expect(result.team.positions.map((row) => row.pageId).sort()).toEqual(
      [hostPage._id, otherPage._id].sort()
    );
    const other = result.team.positions.find((row) => row.userId === 'user-reader');
    expect(JSON.stringify(other)).not.toMatch(/PRIVATE_WHY/);
    expect(hostPage.judgment.why[0].text).toBe('PRIVATE_WHY');
    expect(deps.receipts[0].kind).toBe('living_team_role_granted');
  });

  it('refuses a grant from someone the case does not name to administer', async () => {
    const team = memoryTeam({
      members: [{
        userId: 'user-reader',
        pageId: otherPage._id,
        label: 'Sam',
        roles: ['observe']
      }]
    });
    await expect(grantSeat({
      ...models(team),
      userId: 'user-reader',
      pageId: hostPage._id,
      memberUserId: 'user-other',
      roles: ['decide']
    })).rejects.toMatchObject({ name: 'LivingTeamError', status: 403 });
  });

  it('approves a version and supersedes the receipt when the object later moves', async () => {
    const team = memoryTeam();
    const first = await approveVersion({
      ...models(team),
      userId: 'user-host',
      pageId: hostPage._id,
      conditions: 'If conversion holds.',
      now: () => new Date('2026-08-01T12:00:00.000Z')
    });
    expect(first.approval.object.versionHash).toBeTruthy();
    expect(first.approval.conditions).toBe('If conversion holds.');
    hostPage.judgment.currentJudgment = 'Compute stays scarce through 2028.';
    const view = await readTeam({
      ...models(team),
      userId: 'user-host',
      pageId: hostPage._id
    });
    expect(view.approvals[0].supersededBy).toBeTruthy();
    hostPage.judgment.currentJudgment = 'Compute stays scarce through 2027.';
  });

  it('hands the case on as a guided walk and leaves departed authorship intact', async () => {
    const team = memoryTeam({
      members: [
        {
          userId: hostPage.userId,
          pageId: hostPage._id,
          label: 'Athan',
          roles: ['administer']
        },
        {
          userId: otherPage.userId,
          pageId: otherPage._id,
          label: 'Sam',
          roles: ['decide']
        }
      ]
    });
    const result = await handOffCase({
      ...models(team),
      userId: 'user-host',
      pageId: hostPage._id,
      toUserId: 'user-reader',
      toPageId: otherPage._id,
      now: () => new Date('2026-08-31T15:00:00.000Z')
    });
    expect(result.walk.fromAuthorshipIntact).toBe(true);
    expect(result.walk.from.pageId).toBe(hostPage._id);
    expect(result.walk.to.pageId).toBe(otherPage._id);
    expect(result.walk.walk.length).toBeGreaterThan(2);
    expect(hostPage.judgment.currentJudgment).toBe('Compute stays scarce through 2027.');
    expect(otherPage.judgment.why).toBeUndefined();
  });

  it('revokes a seat without touching the author’s page', async () => {
    const team = memoryTeam({
      members: [
        {
          userId: hostPage.userId,
          pageId: hostPage._id,
          label: 'Athan',
          roles: ['administer']
        },
        {
          userId: otherPage.userId,
          pageId: otherPage._id,
          label: 'Sam',
          roles: ['observe']
        }
      ]
    });
    const result = await revokeSeat({
      ...models(team),
      userId: 'user-host',
      pageId: hostPage._id,
      memberUserId: 'user-reader'
    });
    expect(team.members.find((row) => row.userId === 'user-reader').revokedAt).toBeTruthy();
    expect(otherPage.judgment.currentJudgment).toBe('Compute eases in two regions.');
    expect(result.team.members.some((row) => row.userId === 'user-reader')).toBe(false);
  });

  it('fails closed when the overlay is missing', async () => {
    await expect(readTeam({
      WikiPage: null,
      CaseTeam: {},
      userId: 'user-host',
      pageId: hostPage._id
    })).rejects.toBeInstanceOf(LivingTeamError);
  });
});
