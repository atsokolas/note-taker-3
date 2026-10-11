const crypto = require('crypto');
const { bodyFrom, paragraphsToHtml, stripTags } = require('../readableArticle');

/**
 * Email-in: a newsletter forwarded to the inbound address becomes a Library
 * piece with its byline.
 *
 * The provider (Resend) receives the mail and posts a signed webhook. Who it
 * belongs to is decided by the address the reader confirmed for delivery —
 * the only address an account holds. Everything here is parsing; the route
 * decides what to keep.
 */

const inboundMailConfig = (env = process.env) => {
  const address = String(env.INBOUND_EMAIL_ADDRESS || '').trim().toLowerCase();
  const secret = String(env.INBOUND_EMAIL_WEBHOOK_SECRET || '').trim();
  // The webhook carries only the envelope; the body is fetched with the key.
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  return { enabled: Boolean(address && secret && apiKey), address, secret, apiKey };
};

/* Svix's scheme, which Resend signs with: HMAC-SHA256 over
   "<id>.<timestamp>.<raw body>" keyed by the base64 secret after "whsec_".
   A stale timestamp is a replay. */
const verifyWebhookSignature = ({ secret, headers = {}, rawBody, now = Date.now(), toleranceSeconds = 300 } = {}) => {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatures = headers['svix-signature'];
  if (!secret || !id || !timestamp || !signatures || rawBody == null) return false;
  if (!(Math.abs(now / 1000 - Number(timestamp)) <= toleranceSeconds)) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return String(signatures).split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    const actual = Buffer.from(String(signature || ''), 'base64');
    return version === 'v1' && actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
};

/* "Matt Levine <matt@x.com>", a bare address, or a parsed { name, email }. */
const parseAddress = (value) => {
  if (value && typeof value === 'object') {
    return { name: String(value.name || '').trim(), email: String(value.email || value.address || '').trim().toLowerCase() };
  }
  const text = String(value || '').trim();
  const angled = text.match(/^(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  if (angled) return { name: angled[1].replace(/^["']+|["']+$/g, '').trim(), email: angled[2].toLowerCase() };
  const bare = text.match(/[^\s<>"]+@[^\s<>"]+/);
  return { name: '', email: bare ? bare[0].toLowerCase() : '' };
};

const addressList = (value) => (Array.isArray(value) ? value : String(value || '').split(','))
  .map(parseAddress)
  .map(address => address.email)
  .filter(Boolean);

/* Substack names its senders "Author from Publication". */
const bylineFrom = (name = '') => {
  const [author, publication] = String(name || '').split(/\s+from\s+/i);
  return { author: (author || '').trim(), siteName: (publication || '').trim() };
};

const stripForwardPrefix = (subject = '') => String(subject || '').replace(/^\s*((fwd?|fw)\s*:\s*)+/i, '').trim();

/* The calendar day as the sender wrote it — Gmail's "Tue, Oct 7, 2025 at
   9:02 AM", Apple Mail's "October 7, 2025 at 9:02:13 AM EDT", or RFC 2822 —
   without letting a time zone move it to the day before. */
const dayOf = (value = '') => {
  const text = String(value || '');
  const day = text.match(/\d{4}-\d{2}-\d{2}/)?.[0]
    || text.match(/[A-Za-z]{3,9}\.? \d{1,2},? \d{4}/)?.[0]
    || text.match(/\d{1,2} [A-Za-z]{3,9}\.? \d{4}/)?.[0];
  if (!day) return '';
  const date = new Date(`${day.replace(/,/g, '')} 12:00 UTC`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const FORWARD_MARKER = /^(-{2,}\s*Forwarded message\s*-{2,}|Begin forwarded message:?|-{2,}\s*Original Message\s*-{2,})$/i;
const HEADER_LINE = /^(From|Date|Sent|Subject|To|Cc|Reply-To):\s*(.*)$/i;

/* What the forwarder's client prepended: their own note, the marker, and the
   original's headers. Returns those headers and the piece below them. */
const splitForward = (text = '') => {
  const lines = String(text || '').split('\n').map(line => line.replace(/^[\s>]+/, '').trim());
  const start = lines.findIndex(line => FORWARD_MARKER.test(line));
  if (start < 0) return { headers: null, body: text };
  const headers = {};
  let end = start;
  for (let index = start + 1; index < lines.length && index < start + 40; index += 1) {
    const match = lines[index].match(HEADER_LINE);
    if (match) {
      headers[match[1].toLowerCase()] = match[2].trim();
      end = index;
    } else if (lines[index] && Object.keys(headers).length) break;
  }
  return { headers, body: lines.slice(end + 1).join('\n') };
};

/* A newsletter's furniture: the browser link, the app pitch, and the footer
   that begins at its copyright or unsubscribe line. */
const BROWSER_LINK = /view (this )?(post|email|newsletter|issue)?\s*(in|on) (the |your )?(web|browser)|view online|read online|open in (your )?browser/i;
const BOILERPLATE = new RegExp(`${BROWSER_LINK.source}|read in app|forwarded this email\\?`, 'i');
const FOOTER = /^(©|\(c\) \d{4}|copyright )|unsubscribe|manage (your )?(subscription|preferences|email settings)|you('re| are) receiving this/i;

const withoutFurniture = (text = '') => {
  const paragraphs = String(text || '').split(/\n{2,}/).map(block => block.trim())
    .filter(block => block && !(block.length < 200 && BOILERPLATE.test(block)));
  const footer = paragraphs.findIndex((block, index) => index >= paragraphs.length / 2 && FOOTER.test(block));
  return (footer > 0 ? paragraphs.slice(0, footer) : paragraphs).join('\n\n');
};

const withoutTracking = (href = '') => {
  try {
    const url = new URL(stripTags(href));
    if (!/^https?:$/.test(url.protocol)) return '';
    [...url.searchParams.keys()].filter(key => /^utm_/i.test(key)).forEach(key => url.searchParams.delete(key));
    return url.toString();
  } catch (_error) {
    return '';
  }
};

const browserLinkOf = ({ html = '', text = '' } = {}) => {
  for (const [, href, label] of String(html || '').matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (BROWSER_LINK.test(stripTags(label))) return withoutTracking(href);
  }
  const written = String(text || '').match(/View this (?:post|email) (?:on|in) the (?:web|browser) at\s+(https?:\/\/\S+)/i);
  return written ? withoutTracking(written[1]) : '';
};

/**
 * The piece inside a received mail. `readerEmail` is whoever sent it to
 * Noeis: when the envelope sender is someone else, the mail was forwarded by
 * a filter and the envelope sender is the newsletter itself.
 */
const newsletterFromMail = ({ from, subject, html, text, date, readerEmail = '' } = {}) => {
  const readable = html ? bodyFrom(String(html)) : String(text || '').replace(/\r/g, '');
  const { headers, body } = splitForward(readable);
  const envelope = parseAddress(from);
  const forwardedByFilter = !headers && envelope.email && envelope.email !== readerEmail;
  const sender = headers?.from ? parseAddress(headers.from) : forwardedByFilter ? envelope : { name: '' };
  const { author, siteName } = bylineFrom(sender.name);
  return {
    title: stripForwardPrefix(subject) || stripForwardPrefix(headers?.subject),
    author,
    siteName,
    publicationDate: dayOf(headers ? (headers.date || headers.sent) : forwardedByFilter ? date : ''),
    sourceUrl: browserLinkOf({ html, text }),
    content: paragraphsToHtml(withoutFurniture(body))
  };
};

/* The webhook carries the envelope; the body is fetched by id unless the
   payload already holds it (a provider-neutral post, or a test). */
const receivedMail = async (payload = {}, { apiKey = '', fetchImpl = global.fetch } = {}) => {
  const envelope = payload.data || payload;
  let mail = envelope;
  if (!envelope.html && !envelope.text && envelope.email_id && apiKey) {
    const response = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(envelope.email_id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) throw new Error(`Received mail returned HTTP ${response.status}.`);
    mail = { ...envelope, ...(await response.json()) };
  }
  const messageId = String(mail.message_id || mail.messageId || mail.headers?.['message-id'] || '').replace(/^<|>$/g, '').trim();
  return {
    from: mail.from,
    to: mail.to,
    cc: mail.cc,
    subject: String(mail.subject || ''),
    html: String(mail.html || ''),
    text: String(mail.text || ''),
    date: mail.date || mail.created_at || '',
    messageId: messageId || crypto.createHash('sha256')
      .update([JSON.stringify(mail.from), mail.subject, mail.date || mail.created_at].join('\n')).digest('hex').slice(0, 32)
  };
};

/* The one account that confirmed this address. The sender first; failing
   that, the original recipient, which is how a mail filter's forward reads.
   Two accounts claiming one address is no answer at all. */
const readerForMail = async ({ User, mail, inboundAddress = '' }) => {
  const sender = parseAddress(mail.from).email;
  const candidates = [...new Set([sender, ...addressList(mail.to), ...addressList(mail.cc)])]
    .filter(email => email && email !== inboundAddress);
  if (!candidates.length) return null;
  const readers = await User.find({
    accountDisabledAt: null,
    'morningPaper.email': { $in: candidates },
    'morningPaper.emailConfirmedAt': { $ne: null }
  }).select('_id morningPaper.email').lean();
  const bySender = readers.filter(reader => reader.morningPaper?.email === sender);
  const chosen = bySender.length ? bySender : readers;
  return chosen.length === 1 ? chosen[0] : null;
};

module.exports = {
  dayOf,
  inboundMailConfig,
  newsletterFromMail,
  parseAddress,
  readerForMail,
  receivedMail,
  verifyWebhookSignature
};
