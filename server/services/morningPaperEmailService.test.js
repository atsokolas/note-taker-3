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
assert.doesNotMatch(rendered.html, /WORTH SAYING/);

/* Friday's three lines: quoted passages with their sources, all three or none. */
const worthSaying = [1, 2, 3].map((n) => ({ articleId: `a${n}`, highlightId: `h${n}`, title: `Piece ${n}`, quote: `Passage ${n} worth repeating.` }));
const friday = renderMorningPaperEmail({ briefing, worthSaying, unsubscribeUrl: 'https://www.noeis.io/u' });
assert.match(friday.html, /THREE THINGS WORTH SAYING THIS WEEK/);
assert.match(friday.html, /“Passage 2 worth repeating\.”/);
assert.match(friday.text, /library\?articleId=a3&highlightId=h3/);
assert.doesNotMatch(renderMorningPaperEmail({ briefing, worthSaying: worthSaying.slice(0, 2), unsubscribeUrl: 'u' }).html, /WORTH SAYING/);
assert.strictEqual(briefingIsEmpty({ counts: {} }), true);
assert.strictEqual(briefingIsEmpty(briefing), false);
assert.strictEqual(briefingIsEmpty({
  askedBack: [{ title: 'The Costco 10-K', href: '/library?articleId=a1' }]
}), false);
// A short piece waiting is the paper's last line, with why it was saved.
const tonight = renderMorningPaperEmail({ briefing, nightstand: { articleId: 'n1', title: 'The Shape of Attention', minutes: 8, reason: 'Sam sent this' }, unsubscribeUrl: 'u' });
assert.match(tonight.html, /On your nightstand: <a href="https:\/\/www\.noeis\.io\/library\?articleId=n1"[^>]*>The Shape of Attention<\/a>, 8 min\./);
assert.match(tonight.text, /On your nightstand: The Shape of Attention, 8 min\. Sam sent this/);
assert.doesNotMatch(rendered.text, /nightstand:/, 'nothing short waiting is silence');
// A book closed a year ago today comes back with its sentence.
const finished = renderMorningPaperEmail({ briefing, closedBook: { articleId: 'b1', title: 'Middlemarch', line: 'Nobody is only what they do.', years: 1 }, unsubscribeUrl: 'u' });
assert.match(finished.html, /A year ago today you finished <a href="https:\/\/www\.noeis\.io\/library\/books\/b1"[^>]*>Middlemarch<\/a> and said you’d remember: “Nobody is only what they do\.” Do you\?/);
assert.match(finished.text, /A year ago today you finished Middlemarch and said you’d remember: “Nobody is only what they do\.” Do you\?/);
assert.match(renderMorningPaperEmail({ briefing, closedBook: { articleId: 'b1', title: 'Middlemarch', line: 'x', years: 3 }, unsubscribeUrl: 'u' }).text, /^3 years ago today/m);
assert.doesNotMatch(rendered.text, /you finished/, 'no book coming back is silence');

const askedBackMail = renderMorningPaperEmail({
  briefing: {
    askedBack: [{
      title: 'The Costco 10-K',
      href: '/library?articleId=a1',
      fromPlacement: 'setAside',
      reason: 'the margin note on returns'
    }]
  },
  unsubscribeUrl: 'https://www.noeis.io/api/morning-paper/unsubscribe?token=x'
});
assert.match(askedBackMail.html, /καιρός/);
assert.match(askedBackMail.html, /You asked for this back/);
assert.match(askedBackMail.html, /The Costco 10-K/);
assert.doesNotMatch(askedBackMail.html, /Reminders/);
assert.match(askedBackMail.text, /You asked for this back/);

const inquiryMail = renderMorningPaperEmail({
  briefing: {
    askedBack: [{
      title: 'Who bears the downside?',
      href: '/think?tab=questions&questionId=q-downside',
      itemType: 'question',
      questionId: 'q-downside',
      reason: 'the look you asked for'
    }]
  },
  unsubscribeUrl: 'https://www.noeis.io/api/morning-paper/unsubscribe?token=x'
});
assert.match(inquiryMail.html, /Who bears the downside\?/);
assert.match(inquiryMail.html, /think\?tab=questions&amp;questionId=q-downside/);
assert.doesNotMatch(inquiryMail.html, /\/library\?articleId=/);

const movement = {
  id: 'contradiction:p1:c1:e1',
  kind: 'contradiction',
  occurredAt: '2026-08-21T06:00:00.000Z',
  title: 'A filing contradicted the margin claim.',
  whyItMatters: 'Two sources now disagree on the trend your dossier holds.',
  materiality: 'critical',
  subject: { type: 'wiki_claim', id: 'c1', title: 'Margins expand', href: '/wiki/workspace?page=p1&claimId=c1' },
  evidence: [],
  affected: [],
  unresolved: [],
  nextAction: { label: 'Investigate in Think', href: '/think?tab=concepts', intent: 'investigate_movement' }
};
const renderedWithMovements = renderMorningPaperEmail({
  briefing: {},
  movements: [movement],
  unsubscribeUrl: 'https://www.noeis.io/api/morning-paper/unsubscribe?token=x'
});
assert.match(renderedWithMovements.html, /WHAT CHANGED/);
assert.match(renderedWithMovements.html, /A filing contradicted the margin claim\./);
assert.match(renderedWithMovements.html, /Two sources now disagree/);
assert.match(renderedWithMovements.html, /Contradicted · Aug 21/);
assert.match(renderedWithMovements.text, /CONTRADICTED: A filing contradicted the margin claim\. — https:\/\/www\.noeis\.io\/think/);

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
  const anniversaryMail = renderMorningPaperEmail({
    briefing: { anniversary: { text: 'Capex is defensive.', years: 2, toTheDay: true, pageId: 'p1' } },
    unsubscribeUrl: 'https://noeis.io/u'
  });
  assert.match(anniversaryMail.text, /2 YEARS AGO TODAY YOU WROTE THIS DOWN/);
  assert.match(anniversaryMail.html, /Do you still hold it\?/);

  /* No-news days send nothing — but a belief you never revisited is news on
     an otherwise silent morning. */
  assert.strictEqual(briefingIsEmpty({}), true);
  assert.strictEqual(briefingIsEmpty({ anniversary: { text: 'Capex is defensive.' } }), false);
  assert.strictEqual(briefingIsEmpty({ anniversary: { text: '   ' } }), true);

  console.log('morningPaperEmailService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
