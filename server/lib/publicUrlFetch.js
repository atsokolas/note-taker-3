const dns = require('dns');
const net = require('net');
const { Agent } = require('undici');

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
const DEFAULT_DEADLINE_MS = 20000;
const MAX_REDIRECTS = 3;

/* Every address that is not the public internet. IPv4 rules also catch the
   same address written as IPv6 (::ffff:7f00:1); NAT64, 6to4 and Teredo carry
   an IPv4 address inside, so they are refused whole. */
const NOT_PUBLIC = /** @type {[string, number][]} */ ([
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
  ['::', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 32], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]
]).reduce((list, [network, prefix]) => {
  list.addSubnet(network, prefix, net.isIPv4(network) ? 'ipv4' : 'ipv6');
  return list;
}, new net.BlockList());

const isPrivateAddress = (address = '') => {
  const value = String(address || '').trim();
  const family = net.isIP(value);
  return !family || NOT_PUBLIC.check(value, family === 4 ? 'ipv4' : 'ipv6');
};

/* The check happens on the address the socket actually dials, so a name that
   answers public to the check and private to the connection gets nowhere. */
/** @param {string} hostname @param {{ all?: boolean }} options @param {Function} callback */
const publicLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, /** @type {dns.LookupAddress[]} */ addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(row => isPrivateAddress(row.address))) {
      return callback(Object.assign(new Error(`${hostname} does not resolve only to public addresses.`), { code: 'ENOTPUBLIC' }));
    }
    return options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family);
  });
};
const pinnedToPublic = new Agent({ connect: { lookup: publicLookup } });

const refuse = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
};

/** The URL, proven public, or the reason it is not. */
const validatePublicUrl = async (value, { lookup = dns.promises.lookup, subject = 'This URL' } = {}) => {
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
  const host = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
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
 * Request a public URL, following redirects safely, and return the final
 * response.
 *
 * Redirects are followed manually so every hop is re-validated. A public host
 * that redirects to 127.0.0.1 is the whole reason this function exists.
 */
const requestPublic = async ({
  url,
  method = 'GET',
  subject = 'This URL',
  accept = 'text/html,application/xhtml+xml',
  userAgent = 'Noeis (+https://www.noeis.io)',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal = null,
  fetchImpl = global.fetch,
  lookup = dns.promises.lookup
} = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available.');
  let current = await validatePublicUrl(url, { lookup, subject });

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // The hop's timer stops at the headers; a caller's signal can still end the body.
    signal?.addEventListener('abort', () => controller.abort(), { once: true });
    let response;
    try {
      response = await fetchImpl(current, /** @type {RequestInit} */ ({
        method,
        redirect: 'manual',
        dispatcher: pinnedToPublic,
        signal: controller.signal,
        headers: { Accept: accept, 'User-Agent': userAgent }
      }));
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response?.status)) {
      const location = response.headers?.get?.('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error(`${subject} exceeded the redirect limit.`);
      current = await validatePublicUrl(new URL(location, current).toString(), { lookup, subject });
      continue;
    }
    return { response, url: current };
  }
  throw new Error(`${subject} exceeded the redirect limit.`);
};

/** Fetch a public URL and return its text. */
const fetchPublicText = async ({
  contentTypePattern = null,
  contentTypeMessage = '',
  maxBytes = DEFAULT_MAX_BYTES,
  subject = 'This URL',
  deadlineMs = DEFAULT_DEADLINE_MS,
  ...request
} = {}) => {
  // One deadline over every hop and the whole body, so a page that sends its
  // headers and then trickles forever is cut off and its socket released.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), deadlineMs);
  try {
    const { response, url } = await requestPublic({ ...request, subject, signal: deadline.signal });
    if (!response?.ok) {
      const error = new Error(`${subject} request failed with HTTP ${response?.status || 'unknown'}.`);
      error.status = response?.status || 0;
      throw error;
    }
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (contentTypePattern && contentType && !contentTypePattern.test(contentType)) {
      throw new Error(contentTypeMessage || `${subject} did not return the expected content type.`);
    }
    return { text: await readBoundedBody(response, maxBytes, subject), url, contentType };
  } finally {
    clearTimeout(timer);
  }
};

/* Not Found and Gone are the only answers that mean the page is no longer
   there. A 403, a 500 or a timeout is a door that did not open today. */
const isGoneStatus = (status) => status === 404 || status === 410;

/**
 * The status a public URL answers a HEAD with, or 0 when it would not say.
 * Nothing is read: a check, not a fetch.
 */
const publicUrlStatus = async ({ url, timeoutMs = 5000, ...request } = {}) => {
  try {
    const { response } = await requestPublic({ ...request, url, timeoutMs, method: 'HEAD', accept: '*/*' });
    response?.body?.cancel?.().catch?.(() => null);
    return Number(response?.status) || 0;
  } catch (_error) {
    return 0;
  }
};

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  MAX_REDIRECTS,
  fetchPublicText,
  isGoneStatus,
  publicUrlStatus,
  isPrivateAddress,
  readBoundedBody,
  validatePublicUrl
};
