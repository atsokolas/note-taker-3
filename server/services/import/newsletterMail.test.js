const assert = require('assert');
const crypto = require('crypto');
const {
  dayOf,
  newsletterFromMail,
  parseAddress,
  receivedMail,
  verifyWebhookSignature
} = require('./newsletterMail');

const READER = 'reader@example.com';

const GMAIL_FORWARD = `<html><head><style>p{}</style></head><body>
<div dir="ltr">worth a read<br><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>From: <strong class="gmail_sendername" dir="auto">Matt Levine</strong> <span dir="auto">&lt;<a href="mailto:noreply@mail.bloomberg.example">noreply@mail.bloomberg.example</a>&gt;</span><br>Date: Tue, Oct 7, 2025 at 9:02 AM<br>Subject: Money Stuff: The Fund Ate Itself<br>To: &lt;<a href="mailto:reader@example.com">reader@example.com</a>&gt;<br></div><br><br>
<table><tr><td><a href="https://www.bloomberg.example/opinion/money-stuff?utm_source=newsletter&amp;id=7">View in browser</a></td></tr>
<tr><td><p>Here is a fund that bought its own shares until nothing else was left.</p><p>Second paragraph &amp; a thought.</p><img src="https://track.example/open.gif" width="1" height="1"></td></tr>
<tr><td><p>You're receiving this because you subscribed. <a href="https://x.example/u">Unsubscribe</a></p><p>731 Lexington Avenue, New York</p></td></tr></table>
</div></div></body></html>`;

const APPLE_FORWARD = `<html><body><div>Thought you'd like this.</div><div><br><blockquote type="cite"><div>Begin forwarded message:</div><br class="Apple-interchange-newline"><div style="margin:0"><span style="color:#000"><b>From: </b></span><span>Ben Carlson &lt;<a href="mailto:ben@awealthofcommonsense.example">ben@awealthofcommonsense.example</a>&gt;<br></span></div><div style="margin:0"><span><b>Subject: </b></span><span><b>Ten things on compounding</b><br></span></div><div style="margin:0"><span><b>Date: </b></span><span>October 7, 2025 at 11:52:13 PM EDT<br></span></div><div style="margin:0"><span><b>To: </b></span><span>reader@example.com<br></span></div><br><div><p>Compounding is boring until it is not.</p><p>It takes decades.</p></div></blockquote></div></body></html>`;

const SUBSTACK_DIRECT = {
  html: `<html><body><table><tr><td><a href="https://substack.example/app-link/post?publication_id=1">READ IN APP</a></td></tr>
<tr><td><h1>The quiet compounding of habits</h1><p>Most change is invisible from the inside.</p><p>And then it is obvious.</p></td></tr>
<tr><td><p>© 2025 Jane Doe</p><p>548 Market Street, San Francisco</p><p><a href="https://x.example/u">Unsubscribe</a></p></td></tr></table></body></html>`,
  text: 'View this post on the web at https://janedoe.substack.example/p/quiet-compounding?utm_campaign=email-post&r=1\n\nMost change is invisible from the inside.'
};

const run = async () => {
  // Gmail's forward: the forwarder's note and header block go; the original
  // sender is the byline; the date is the original's; the footer is cut.
  const gmail = newsletterFromMail({
    from: `Reader <${READER}>`,
    subject: 'Fwd: Money Stuff: The Fund Ate Itself',
    html: GMAIL_FORWARD,
    date: 'Wed, 8 Oct 2025 10:00:00 +0000',
    readerEmail: READER
  });
  assert.strictEqual(gmail.title, 'Money Stuff: The Fund Ate Itself');
  assert.strictEqual(gmail.author, 'Matt Levine');
  assert.strictEqual(gmail.publicationDate, '2025-10-07');
  assert.strictEqual(gmail.sourceUrl, 'https://www.bloomberg.example/opinion/money-stuff?id=7');
  assert.ok(gmail.content.startsWith('<p>Here is a fund that bought its own shares'), gmail.content);
  assert.ok(gmail.content.includes('Second paragraph &amp; a thought.'));
  for (const gone of ['worth a read', 'Forwarded message', 'View in browser', 'Unsubscribe', 'Lexington', 'track.example', 'p{}']) {
    assert.ok(!gmail.content.includes(gone), `${gone} should not survive: ${gmail.content}`);
  }

  // Apple Mail's forward, whose headers sit in styled spans; an evening
  // time in New York is still the seventh.
  const apple = newsletterFromMail({ from: READER, subject: 'Fw: Ten things on compounding', html: APPLE_FORWARD, readerEmail: READER });
  assert.strictEqual(apple.title, 'Ten things on compounding');
  assert.strictEqual(apple.author, 'Ben Carlson');
  assert.strictEqual(apple.publicationDate, '2025-10-07');
  assert.strictEqual(apple.content, '<p>Compounding is boring until it is not.</p>\n<p>It takes decades.</p>');

  // Substack sent straight on by a mail filter: no forward block, so the
  // envelope sender is the newsletter, "Author from Publication".
  const substack = newsletterFromMail({
    from: '"Jane Doe from Quiet Habits" <quiethabits@substack.example>',
    subject: 'The quiet compounding of habits',
    date: '2025-10-06T14:00:00.000Z',
    readerEmail: READER,
    ...SUBSTACK_DIRECT
  });
  assert.deepStrictEqual(
    { author: substack.author, siteName: substack.siteName, publicationDate: substack.publicationDate },
    { author: 'Jane Doe', siteName: 'Quiet Habits', publicationDate: '2025-10-06' }
  );
  assert.strictEqual(substack.sourceUrl, 'https://janedoe.substack.example/p/quiet-compounding?r=1');
  assert.ok(substack.content.includes('Most change is invisible'));
  assert.ok(!/READ IN APP|Unsubscribe|Market Street/.test(substack.content), substack.content);

  // A forward the client did not mark: the reader is the envelope, so there
  // is no byline and no date rather than the reader's own name.
  const unmarked = newsletterFromMail({ from: `Reader <${READER}>`, subject: 'FW: fwd: A note', text: 'Just the text.', date: '2025-10-08', readerEmail: READER });
  assert.deepStrictEqual(
    { title: unmarked.title, author: unmarked.author, publicationDate: unmarked.publicationDate, content: unmarked.content },
    { title: 'A note', author: '', publicationDate: '', content: '<p>Just the text.</p>' }
  );

  assert.deepStrictEqual(parseAddress('"Levine, Matt" <Matt@Example.com>'), { name: 'Levine, Matt', email: 'matt@example.com' });
  assert.deepStrictEqual(parseAddress({ name: 'A', email: 'A@B.co' }), { name: 'A', email: 'a@b.co' });
  assert.strictEqual(dayOf('Tue, 07 Oct 2025 23:02:00 -0700'), '2025-10-07');
  assert.strictEqual(dayOf('sometime'), '');

  // Svix-style signatures: the right key passes, a changed body, a stale
  // timestamp or the wrong secret does not.
  const key = crypto.randomBytes(24);
  const secret = `whsec_${key.toString('base64')}`;
  const body = Buffer.from(JSON.stringify({ type: 'email.received', data: { email_id: 'e1' } }));
  const now = Date.UTC(2026, 9, 11);
  const timestamp = String(Math.floor(now / 1000));
  const sign = (bytes) => crypto.createHmac('sha256', key).update(`msg_1.${timestamp}.${bytes}`).digest('base64');
  const headers = { 'svix-id': 'msg_1', 'svix-timestamp': timestamp, 'svix-signature': `v1,bm90IGl0 v1,${sign(body)}` };
  assert.strictEqual(verifyWebhookSignature({ secret, headers, rawBody: body, now }), true);
  assert.strictEqual(verifyWebhookSignature({ secret, headers, rawBody: Buffer.from(`${body} `), now }), false);
  assert.strictEqual(verifyWebhookSignature({ secret, headers, rawBody: body, now: now + 10 * 60 * 1000 }), false);
  assert.strictEqual(verifyWebhookSignature({ secret: `whsec_${crypto.randomBytes(24).toString('base64')}`, headers, rawBody: body, now }), false);
  assert.strictEqual(verifyWebhookSignature({ secret, headers: {}, rawBody: body, now }), false);

  // The webhook carries the envelope; the body is fetched by id.
  const fetched = [];
  const mail = await receivedMail(
    { type: 'email.received', data: { email_id: 'e1', from: READER, to: ['read@noeis.io'], subject: 'Fwd: X', message_id: '<abc@mail>' } },
    {
      apiKey: 're_test',
      fetchImpl: async (url, init) => {
        fetched.push([url, init.headers.Authorization]);
        return { ok: true, json: async () => ({ html: '<p>Body</p>', text: 'Body' }) };
      }
    }
  );
  assert.deepStrictEqual(fetched, [['https://api.resend.com/emails/receiving/e1', 'Bearer re_test']]);
  assert.strictEqual(mail.html, '<p>Body</p>');
  assert.strictEqual(mail.messageId, 'abc@mail');
};

run().then(() => console.log('newsletterMail tests passed')).catch((error) => {
  console.error(error);
  process.exit(1);
});
