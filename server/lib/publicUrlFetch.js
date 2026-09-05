const dns = require('dns').promises;
const net = require('net');

/**
 * Fetching a URL the reader supplied, safely.
 *
 * This is the reading watcher's hardening, lifted so a second caller does not
 * become a second copy. Everything here was already load-bearing for feeds —
 * the private-address check, the redirect ceiling, the bounded read — and none
 * of it was ever feed-specific except the wording and the `Accept` header.
 *
 * The rules, all of which exist because the URL comes from outside:
 *
 *   No credentials in the URL, no non-standard ports, no localhost.
 *   Every resolved address must be public — checked again after each redirect,
 *   because a public host may redirect to a private one.
 *   A ceiling on redirects, a timeout, and a byte cap read incrementally, so a
 *   hostile server cannot hold a socket open or stream until memory runs out.
 *
 * `subject` names the caller in the error a person will read: a bad feed URL
 * and a bad article URL are the same failure with different consequences.
 */

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;

const isPrivateIpv4 = (address = '') => {
  const octets = String(address).split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
};

const isPrivateAddress = (address = '') => {
  const value = String(address || '').trim().toLowerCase();
  if (!value) return true;
  if (net.isIPv4(value)) return isPrivateIpv4(value);
  if (!net.isIPv6(value)) return true;
  if (value === '::' || value === '::1') return true;
  /* An IPv4-mapped address is an IPv4 address wearing a hat. */
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb)/.test(value);
};

const refuse = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
};

/** The URL, proven public, or the reason it is not. */
const validatePublicUrl = async (value, { lookup = dns.lookup, subject = 'This URL' } = {}) => {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch (_error) {
    return refuse(`${subject} is not a valid URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    return refuse(`${subject} must use public HTTP(S) without embedded credentials.`);
  }
  if ((parsed.port && parsed.protocol === 'http:' && parsed.port !== '80')
    || (parsed.port && parsed.protocol === 'https:' && parsed.port !== '443')) {
    return refuse(`${subject} must use the standard HTTP(S) port.`);
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return refuse(`${subject} must resolve to a public host.`);
  }
  const literalFamily = net.isIP(host);
  const addresses = literalFamily ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(row => isPrivateAddress(row.address))) {
    return refuse(`${subject} must resolve only to public IP addresses.`);
  }
  parsed.hash = '';
  return parsed.toString();
};

/**
 * The body, or nothing — never more than the cap.
 *
 * A declared length is trusted enough to refuse early and never enough to
 * stop reading incrementally, because a server that lies about one can lie
 * about the other.
 */
const readBoundedBody = async (response, maxBytes = DEFAULT_MAX_BYTES, subject = 'The response') => {
  const tooBig = () => { throw new Error(`${subject} exceeds the size limit.`); };
  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (declared > maxBytes) tooBig();
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) tooBig();
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => null);
      tooBig();
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * Fetch a public URL and return its text, following redirects safely.
 *
 * Redirects are followed manually so every hop is re-validated. A public host
 * that redirects to 127.0.0.1 is the whole reason this function exists.
 */
const fetchPublicText = async ({
  url,
  subject = 'This URL',
  accept = 'text/html,application/xhtml+xml',
  userAgent = 'Noeis (+https://www.noeis.io)',
  contentTypePattern = null,
  contentTypeMessage = '',
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = global.fetch,
  lookup = dns.lookup
} = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available.');
  let current = await validatePublicUrl(url, { lookup, subject });

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: accept, 'User-Agent': userAgent }
      });
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response?.status)) {
      const location = response.headers?.get?.('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error(`${subject} exceeded the redirect limit.`);
      current = await validatePublicUrl(new URL(location, current).toString(), { lookup, subject });
      continue;
    }
    if (!response?.ok) throw new Error(`${subject} request failed with HTTP ${response?.status || 'unknown'}.`);

    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (contentTypePattern && contentType && !contentTypePattern.test(contentType)) {
      throw new Error(contentTypeMessage || `${subject} did not return the expected content type.`);
    }
    return { text: await readBoundedBody(response, maxBytes, subject), url: current, contentType };
  }
  throw new Error(`${subject} exceeded the redirect limit.`);
};

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  MAX_REDIRECTS,
  fetchPublicText,
  isPrivateAddress,
  readBoundedBody,
  validatePublicUrl
};
