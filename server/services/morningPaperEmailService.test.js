const assert = require('assert');
const {
  emailConfigurationStatus,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  renderMorningPaperEmail,
  briefingIsEmpty,
  sendWithResend,
  sendMorningPaperForUser
} = require('./morningPaperEmailService');

const secret = 'test-secret-that-is-not-production';
const token = signUnsubscribeToken({ userId: '507f1f77bcf86cd799439011', version: 3, secret });
assert.deepStrictEqual(verifyUnsubscribeToken({ token, secret }), { userId: '507f1f77bcf86cd799439011', version: 3 });
assert.strictEqual(verifyUnsubscribeToken({ token: `${token}x`, secret }), null);
assert.deepStrictEqual(emailConfigurationStatus({}), {
  ready: false,
  missing: ['EMAIL_DISABLED=false', 'RESEND_API_KEY', 'MORNING_PAPER_FROM_EMAIL', 'MORNING_PAPER_UNSUBSCRIBE_SECRET']
});

const briefing = {
  watcherLeads: [{ title: 'NVDA filed a 10-Q', page: { title: 'Nvidia dossier' }, impactSummary: '2 claims touched · 1 contradicted', href: '/wiki/workspace?page=p1' }],
  claimCheckIn: { text: 'Integration retains pricing power.', pageTitle: 'Nvidia dossier', href: '/wiki/workspace?page=p1&claimId=c1' },
  nextAction: { label: 'Review changed evidence', href: '/wiki/workspace?page=p1' },
  counts: { recentMaintenanceChanges: 1 }
};
const rendered = renderMorningPaperEmail({ briefing, unsubscribeUrl: 'https://www.noeis.io/api/morning-paper/unsubscribe?token=x' });
assert.match(rendered.html, /NVDA filed a 10-Q/);
assert.match(rendered.html, /Unsubscribe instantly/i);
assert.match(rendered.text, /CLAIM CHECK-IN/);
assert.strictEqual(briefingIsEmpty({ counts: {} }), true);
assert.strictEqual(briefingIsEmpty(briefing), false);

(async () => {
  const sent = await sendWithResend({
    apiKey: 're_test',
    payload: { to: ['qa@example.com'] },
    fetchImpl: async (_url, options) => ({ ok: true, json: async () => ({ id: 'email-1', body: JSON.parse(options.body) }) })
  });
  assert.strictEqual(sent.id, 'email-1');

  class FakeDelivery {
    static rows = [];
    constructor(value) { Object.assign(this, value); this._id = `delivery-${FakeDelivery.rows.length + 1}`; }
    async save() {
      const existingIndex = FakeDelivery.rows.findIndex(row => row === this || row._id === this._id);
      if (existingIndex >= 0) FakeDelivery.rows[existingIndex] = this;
      else FakeDelivery.rows.push(this);
      return this;
    }
    static findOne(query) {
      const row = FakeDelivery.rows.find(value => String(value.userId) === String(query.userId)
        && value.localDate === query.localDate && (!query.briefingVersion || value.briefingVersion === query.briefingVersion));
      return { lean: async () => row || null };
    }
  }
  const fakeUser = {
    _id: '507f1f77bcf86cd799439011',
    morningPaper: {
      enabled: true,
      email: 'qa@example.com',
      emailConfirmedAt: new Date('2026-07-01'),
      timezone: 'UTC',
      sendHourLocal: 7,
      unsubscribeTokenVersion: 1
    },
    async save() { return this; }
  };
  let sends = 0;
  const models = {
    WikiBriefingCache: { findOne: () => ({ lean: async () => ({ generatedAt: new Date('2026-07-19T06:00:00Z'), payload: briefing }) }) },
    MorningPaperDelivery: FakeDelivery,
    NoeisReceipt: null
  };
  const configuredEnv = {
    EMAIL_DISABLED: 'false', RESEND_API_KEY: 're_test', MORNING_PAPER_FROM_EMAIL: 'paper@noeis.io',
    MORNING_PAPER_UNSUBSCRIBE_SECRET: secret, APP_BASE_URL: 'https://www.noeis.io',
    EMAIL_PUBLIC_API_BASE_URL: 'https://api.noeis.example'
  };
  const fetchImpl = async (_url, options) => {
    sends += 1;
    const payload = JSON.parse(options.body);
    assert.match(payload.headers['List-Unsubscribe'], /api\.noeis\.example/);
    return { ok: true, json: async () => ({ id: 'email-live-qa' }) };
  };
  const first = await sendMorningPaperForUser({
    user: fakeUser, models, env: configuredEnv, fetchImpl, now: new Date('2026-07-19T07:00:00Z')
  });
  assert.strictEqual(first.sent, true);
  const replay = await sendMorningPaperForUser({
    user: fakeUser, models, env: configuredEnv, fetchImpl, now: new Date('2026-07-19T07:10:00Z')
  });
  assert.strictEqual(replay.duplicate, true);
  assert.strictEqual(sends, 1);
  console.log('morningPaperEmailService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
