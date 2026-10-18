/* Noeis offline: the app opens without a network, and what waits on your
   nightstand can still be read. The shell is kept as it was last served;
   an article is kept only while its own placement says "later", so a piece
   you have read or moved stops being stored the next time it is fetched.
   Nothing but GETs is ever stored, and signing out drops the reading cache
   (see clearStoredTokens in src/api.js). */

const SHELL = 'noeis-shell-v1';
const READING = 'noeis-reading';

const ARTICLE = /^\/articles\/[^/]+$/;
const NIGHTSTAND = /^\/api\/library\/collection$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== SHELL && key !== READING).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

const fromNetwork = async (request, keep) => {
  try {
    const response = await fetch(request);
    if (response.ok) await keep(response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
};

const store = (name, request) => async response => (await caches.open(name)).put(request, response);

const keepIfLater = request => async (response) => {
  const cache = await caches.open(READING);
  const article = await response.json().catch(() => null);
  if (article?.placement === 'later') await cache.put(request, new Response(JSON.stringify(article), response));
  else await cache.delete(request);
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/static/')) {
    event.respondWith(caches.match(request).then(cached => cached || fromNetwork(request, store(SHELL, request))));
  } else if (ARTICLE.test(url.pathname)) {
    event.respondWith(fromNetwork(request, keepIfLater(request)));
  } else if (NIGHTSTAND.test(url.pathname) && url.searchParams.get('scope') === 'later') {
    event.respondWith(fromNetwork(request, store(READING, request)));
  }
});
