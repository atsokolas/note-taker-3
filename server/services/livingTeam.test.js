const assert = require('assert');
const {
  approvalReceipt,
  authorityAt,
  can,
  dissentDiff,
  handoffWalk,
  meetingBrief,
  overlayDissent,
  overlayPosition,
  qualitativeConfidence,
  resolveDissent,
  rightsFor,
  serializeTeam,
  supersedeApprovals
} = require('./livingTeam');

const hostPage = {
  _id: '64f500000000000000000010',
  userId: 'user-host',
  title: 'Compute stays scarce',
  sourceRefs: [{
    _id: 'src-doe',
    title: 'DOE capacity report',
    url: 'https://example.com/doe',
    snippet: 'PRIVATE_LIBRARY_PASSAGE'
  }],
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    ownerLabel: 'Athan',
    confidence: 0.82,
    decisionPosture: 'watch',
    why: [{ text: 'PRIVATE_WHY_NOTE' }],
    against: [{ text: 'PRIVATE_AGAINST_NOTE' }],
    assumptions: [{ text: 'Lead times stay long.' }],
    unknowns: [{ unknownId: 'u1', question: 'Does conversion slip in 2027?' }],
    falsifiers: [{ text: 'Spot prices fall through the 2024 median.', status: 'unobserved' }],
    resolutionCriteria: 'Spot prices stay above the 2024 median.',
    resolutionHorizonAt: '2027-01-01T00:00:00.000Z',
    verdicts: [{ result: 'partly', recordedAt: '2026-08-01T12:00:00.000Z' }]
  }
};

const otherPage = {
  _id: '64f500000000000000000011',
  userId: 'user-reader',
  judgment: {
    currentJudgment: 'Compute eases in two regions.',
    ownerLabel: 'Sam',
    confidence: 0.45,
    decisionPosture: 'act',
    why: [{ text: 'PRIVATE_OTHER_WHY' }],
    against: [{ text: 'PRIVATE_OTHER_AGAINST' }],
    assumptions: [{ text: 'New fabs come online on time.' }],
    unknowns: [{ unknownId: 'u2', question: 'Will the two regions stay the exception?' }],
    decisionPosture: 'act',
    verdicts: [{ result: 'broke', recordedAt: '2026-08-20T12:00:00.000Z' }]
  }
};

const hostSeat = {
  userId: 'user-host',
  pageId: hostPage._id,
  label: 'Athan',
  roles: ['administer']
};

const observerSeat = {
  userId: 'user-reader',
  pageId: otherPage._id,
  label: 'Sam',
  roles: ['observe']
};

const decideSeat = {
  ...observerSeat,
  roles: ['decide']
};

describe('living team roles and mandates', () => {
  it('derives rights from roles and a case mandate, defaulting to least exposure', () => {
    expect(rightsFor({ roles: ['observe'] })).toEqual(['observe']);
    expect(rightsFor({ roles: ['research'] })).toEqual(['observe', 'research']);
    expect(rightsFor({ roles: ['propose'] })).toContain('propose');
    expect(can({ roles: ['decide'] }, 'decide')).toBe(true);
    expect(can({ roles: ['approve'] }, 'publish')).toBe(false);
    expect(can({ roles: ['administer'] }, 'publish')).toBe(true);
    expect(rightsFor({ roles: ['decide'] }, { denied: ['decide'] })).not.toContain('decide');
    expect(rightsFor({ roles: ['observe'] }, { allowed: ['observe', 'research'] })).toEqual(['observe']);
    expect(rightsFor({ roles: ['research'] }, { allowed: ['observe'] })).toEqual(['observe']);
  });

  it('names authority at action time and refuses an unnamed right', () => {
    const allowed = authorityAt(hostSeat, 'approve');
    expect(allowed.allowed).toBe(true);
    expect(allowed.label).toMatch(/You may approve/i);
    expect(allowed.source).toMatch(/administer/i);
    const denied = authorityAt(observerSeat, 'approve');
    expect(denied.allowed).toBe(false);
    expect(denied.label).toMatch(/does not name you/i);
    expect(JSON.stringify(denied)).not.toMatch(/@|score|like/i);
  });

  it('keeps claims on each author\'s page and hides private notes from observers', () => {
    const overlay = overlayPosition({
      member: observerSeat,
      page: otherPage,
      viewer: observerSeat
    });
    expect(overlay.pageId).toBe(otherPage._id);
    expect(overlay.self).toBe(true);
    expect(overlay.interpretation.why).toContain('PRIVATE_OTHER_WHY');

    const asObserverOfHost = overlayPosition({
      member: hostSeat,
      page: hostPage,
      viewer: observerSeat,
      caseMandate: { exposure: 'least' }
    });
    expect(asObserverOfHost.claim).toBe(hostPage.judgment.currentJudgment);
    expect(asObserverOfHost.interpretation.why || []).toHaveLength(0);
    expect(JSON.stringify(asObserverOfHost)).not.toMatch(/PRIVATE_WHY_NOTE|PRIVATE_AGAINST_NOTE|PRIVATE_LIBRARY_PASSAGE/);
    expect(asObserverOfHost.confidence).toBe('certain');
    expect(JSON.stringify(asObserverOfHost)).not.toMatch(/0\.82/);
  });
});

describe('authored dissent', () => {
  it('isolates assumptions, interpretation, and action without merging', () => {
    const left = overlayPosition({ member: hostSeat, page: hostPage, viewer: hostSeat });
    const right = overlayPosition({ member: decideSeat, page: otherPage, viewer: hostSeat });
    const diff = dissentDiff(left, right);
    expect(diff.assumptions.parted).toBe(true);
    expect(diff.interpretation.parted).toBe(true);
    expect(diff.action.parted).toBe(true);
    expect(left.pageId).not.toBe(right.pageId);
    expect(left.claim).not.toBe(right.claim);

    const overlay = overlayDissent([left, right]);
    expect(overlay).toHaveLength(1);
    expect(overlay[0].parted).toEqual(expect.arrayContaining(['assumptions', 'interpretation', 'action']));
  });

  it('lets a standing decision keep remaining dissent authored', () => {
    const left = overlayPosition({ member: hostSeat, page: hostPage, viewer: hostSeat });
    const right = overlayPosition({ member: decideSeat, page: otherPage, viewer: hostSeat });
    const resolved = resolveDissent({
      positions: [left, right],
      standing: { claim: left.claim, posture: 'watch' },
      decidedBy: left,
      at: '2026-08-31T12:00:00.000Z'
    });
    expect(resolved.overlay).toBe(true);
    expect(resolved.standing.claim).toBe(left.claim);
    expect(resolved.remaining).toHaveLength(1);
    expect(resolved.remaining[0].pageId).toBe(otherPage._id);
    expect(resolved.remaining[0].claim).toBe(otherPage.judgment.currentJudgment);
  });
});

describe('approval receipts', () => {
  it('records actor, authority, object version, time, and conditions', () => {
    const authority = authorityAt(hostSeat, 'approve');
    const receipt = approvalReceipt({
      actor: hostSeat,
      authority,
      object: { kind: 'position', pageId: hostPage._id, versionHash: 'hash-v1' },
      conditions: 'If conversion holds.',
      at: '2026-08-31T12:00:00.000Z'
    });
    expect(receipt.actor.label).toBe('Athan');
    expect(receipt.authority.action).toBe('approve');
    expect(receipt.object.versionHash).toBe('hash-v1');
    expect(receipt.conditions).toBe('If conversion holds.');
    expect(receipt.at).toBe('2026-08-31T12:00:00.000Z');
    expect(receipt.supersededBy).toBe(null);
    expect(receipt.receiptId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('visibly supersedes an approval when the object moves', () => {
    const first = approvalReceipt({
      actor: hostSeat,
      authority: authorityAt(hostSeat, 'approve'),
      object: { kind: 'position', pageId: hostPage._id, versionHash: 'hash-v1' },
      at: '2026-08-01T12:00:00.000Z'
    });
    const next = supersedeApprovals([first], 'hash-v2');
    expect(next[0].object.versionHash).toBe('hash-v1');
    expect(next[0].supersededBy).toMatch(/superseded:/);
    expect(supersedeApprovals([first], 'hash-v1')[0].supersededBy).toBe(null);
  });
});

describe('meeting briefs', () => {
  it('writes only material sentences, each linked, with kinds distinct, and stays silent when nothing moved', () => {
    const left = overlayPosition({ member: hostSeat, page: hostPage, viewer: hostSeat });
    const right = overlayPosition({ member: decideSeat, page: otherPage, viewer: hostSeat });
    const dissent = overlayDissent([left, right]);
    const team = {
      hostPageId: hostPage._id,
      audit: [{
        at: '2026-08-30T12:00:00.000Z',
        summary: 'Sam was named to decide.',
        receiptId: 'audit-1'
      }]
    };
    const brief = meetingBrief({
      team,
      positions: [left, right],
      dissent,
      approvals: [],
      hostPage
    });
    expect(brief.silent).toBe(false);
    const kinds = new Set(brief.sentences.map((row) => row.kind));
    expect(kinds.has('fact')).toBe(true);
    expect(kinds.has('inference')).toBe(true);
    expect(kinds.has('unknown')).toBe(true);
    expect(kinds.has('recommendation')).toBe(true);
    brief.sentences.forEach((row) => {
      expect(row.record).toBeTruthy();
      expect(row.record.pageId).toBeTruthy();
    });
    expect(JSON.stringify(brief)).not.toMatch(/chat|toast|like|score|consensus/i);
    expect(meetingBrief({ team: {}, positions: [], dissent: [], hostPage: {} }).silent).toBe(true);
  });
});

describe('handoff, succession, historian', () => {
  it('transfers posture, rights, questions, dissent, and triggers without rewriting the departed page', () => {
    const from = overlayPosition({ member: hostSeat, page: hostPage, viewer: hostSeat });
    const right = overlayPosition({ member: decideSeat, page: otherPage, viewer: hostSeat });
    const walk = handoffWalk({
      from: hostSeat,
      to: { userId: 'user-reader', pageId: otherPage._id, label: 'Sam' },
      fromPosition: from,
      dissent: overlayDissent([from, right]),
      at: '2026-08-31T15:00:00.000Z'
    });
    expect(walk.fromAuthorshipIntact).toBe(true);
    expect(walk.from.pageId).toBe(hostPage._id);
    expect(walk.transferred.posture).toBe('watch');
    expect(walk.transferred.rights).toContain('administer');
    expect(walk.transferred.questions[0]).toMatch(/conversion/i);
    expect(walk.walk.some((step) => step.kind === 'dissent')).toBe(true);
    expect(walk.walk.some((step) => step.kind === 'triggers')).toBe(true);
    walk.walk.forEach((step) => {
      expect(step.record).toBeTruthy();
      expect(step.record.pageId).toBeTruthy();
    });
  });
});

describe('team overlay serialization', () => {
  it('never copies a second judgment onto the host page', () => {
    const team = {
      hostPageId: hostPage._id,
      hostUserId: 'user-host',
      mandate: { purpose: 'Hold compute scarce until prices speak.', exposure: 'least' },
      members: [observerSeat],
      approvals: [],
      audit: []
    };
    const view = serializeTeam({
      team,
      hostPage,
      pagesById: { [hostPage._id]: hostPage, [otherPage._id]: otherPage },
      viewerId: 'user-reader'
    });
    expect(view.visible).toBe(true);
    expect(view.positions).toHaveLength(2);
    expect(view.positions.map((row) => row.pageId).sort()).toEqual([hostPage._id, otherPage._id].sort());
    const hostPosition = view.positions.find((row) => row.userId === 'user-host');
    expect(JSON.stringify(hostPosition)).not.toMatch(/PRIVATE_WHY_NOTE/);
    expect(view.mandate.exposure).toBe('least');
    expect(JSON.stringify(view)).not.toMatch(/user-host@|score|like-count|chat/i);
  });

  it('hides the room from anyone the case does not name', () => {
    const view = serializeTeam({
      team: { hostPageId: hostPage._id, hostUserId: 'user-host', members: [] },
      hostPage,
      pagesById: { [hostPage._id]: hostPage },
      viewerId: 'stranger'
    });
    expect(view.visible).toBe(false);
    expect(view.positions).toHaveLength(0);
  });
});

describe('taste', () => {
  it('never invents a consensus score or a vanity count', () => {
    expect(qualitativeConfidence(0.82)).toBe('certain');
    expect(qualitativeConfidence('uncertain')).toBe('uncertain');
    const wire = JSON.stringify(serializeTeam({
      team: {
        hostPageId: hostPage._id,
        hostUserId: 'user-host',
        members: [decideSeat]
      },
      hostPage,
      pagesById: { [hostPage._id]: hostPage, [otherPage._id]: otherPage },
      viewerId: 'user-host'
    }));
    assert.ok(!/\b\d+\s+(likes?|votes?|members?)\b/i.test(wire));
    assert.ok(!/forced consensus|agree to disagree score/i.test(wire));
  });
});
