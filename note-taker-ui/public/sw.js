/* Noeis offline: the app opens without a network, and what waits on your
   nightstand can still be read, marked and picked up where you stopped.
   The shell is kept as it was last served. An article is kept, with its
   highlights and your place in it, only while its own placement says
   "later", so a piece you have read or moved stops being stored the next
   time it is fetched. A highlight or a place saved with no network waits in
   the outbox and is sent, in order, the next time the network answers.
   Signing out drops the reading cache, outbox included (see
   clearStoredTokens in src/api.js). */

const SHELL = 'noeis-shell-v1';
const READING = 'noeis-reading';

// The article, and the two things the reader keeps about it.
const READ = /^\/(?:articles\/([^/]+)|api\/articles\/([^/]+)\/(?:highlights|reading-state))$/;
const WRITE = /^\/(?:articles\/[^/]+\/highlights|api\/articles\/[^/]+\/reading-state)$/;
const NIGHTSTAND = /^\/api\/library\/collection$/;
const OUTBOX = `${self.location.origin}/outbox/`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== SHELL && key !== READING).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

/* Sending stops at the first write the network cannot carry; one the
   server answers, even with a refusal, has been delivered. */
let sending = null;
const sendOutbox = () => {
  sending = sending || (async () => {
    const cache = await caches.open(READING);
    for (const key of (await cache.keys()).filter(entry => entry.url.startsWith(OUTBOX))) {
      const { url, method, headers, body } = await (await cache.match(key)).json();
      await fetch(url, { method, headers, body });
      await cache.delete(key);
    }
  })().catch(() => {}).finally(() => { sending = null; });
  return sending;
};

const fromNetwork = async (request, keep) => {
  try {
    const response = await fetch(request);
    if (response.ok) await keep(response.clone());
    sendOutbox();
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
};

const store = (name, request) => async response => (await caches.open(name)).put(request, response);

/* The article decides for all three: kept while it is on the nightstand,
   dropped with its highlights and place once it is not. The reader asks
   for them together, so the highlights and place wait for that decision. */
const partsOf = (id, base) => [`/articles/${id}`, `/api/articles/${id}/highlights`, `/api/articles/${id}/reading-state`]
  .map(path => new URL(path, base).href);
const deciding = new Map();

const keepIfLater = (request, id) => async (response) => {
  const cache = await caches.open(READING);
  const article = await response.json().catch(() => null);
  if (article?.placement === 'later') await cache.put(request, new Response(JSON.stringify(article), response));
  else await Promise.all(partsOf(id, request.url).map(part => cache.delete(part)));
};

const keepWithArticle = (request, id) => async (response) => {
  await deciding.get(id);
  const cache = await caches.open(READING);
  if (await cache.match(partsOf(id, request.url)[0])) await cache.put(request, response);
};

const queue = async (request) => {
  const body = await request.text();
  const write = { url: request.url, method: request.method, headers: [...request.headers], body };
  const key = `${OUTBOX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await (await caches.open(READING)).put(key, new Response(JSON.stringify(write)));
  // The write as sent, with a stand-in id until the server gives it its own.
  return new Response(JSON.stringify({ ...JSON.parse(body || '{}'), _id: `offline-${key.slice(OUTBOX.length)}` }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  });
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const read = READ.exec(url.pathname);

  if (request.method !== 'GET') {
    if (WRITE.test(url.pathname)) {
      // Whatever waits in the outbox goes first, so the newest place wins.
      const copy = request.clone();
      event.respondWith(sendOutbox().then(() => fetch(request)).catch(() => queue(copy)));
    }
  } else if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/static/')) {
    event.respondWith(caches.match(request).then(cached => cached || fromNetwork(request, store(SHELL, request))));
  } else if (read) {
    const [, article, part] = read;
    const answer = fromNetwork(request, article ? keepIfLater(request, article) : keepWithArticle(request, part));
    if (article) deciding.set(article, answer.catch(() => {}));
    event.respondWith(answer);
  } else if (NIGHTSTAND.test(url.pathname) && url.searchParams.get('scope') === 'later') {
    event.respondWith(fromNetwork(request, store(READING, request)));
  }
});
