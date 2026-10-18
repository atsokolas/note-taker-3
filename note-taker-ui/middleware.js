import { SHARE_ROUTES, injectSnapshot } from './src/seo/shareSnapshot';

/* Public wiki and edition addresses answer with their own HTML, so search engines and
   agents that do not run JavaScript read the page instead of the homepage.
   Anything that goes wrong falls through to the app exactly as before.
   Think's retired share links answer with a permanent redirect to the shared
   wiki page they settled into; with nowhere to go, the app says so in one line. */

export const config = { matcher: ['/share/wiki/:path*', '/share/editions/:path*', '/share/notebooks/:path*', '/share/volumes/:path*', '/share/concepts/:path*'] };

const RETIRED = /^\/share\/(notebooks|volumes|concepts)\/([^/]+)\/?$/;

const API_BASE = process.env.NOEIS_PUBLIC_API_BASE || 'https://note-taker-3-unrg.onrender.com';
const passThrough = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

export default async function middleware(request) {
  if (request.method !== 'GET') return passThrough();
  const url = new URL(request.url);
  const retired = url.pathname.match(RETIRED);
  if (retired) return redirectRetired(url, retired[1], retired[2]);
  const route = SHARE_ROUTES.find((entry) => entry.pattern.test(url.pathname));
  if (!route) return passThrough();
  const slug = decodeURIComponent(url.pathname.match(route.pattern)[1]);

  // The API host sleeps when idle; never hold a reader longer than this.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const [apiResponse, shellResponse] = await Promise.all([
      fetch(`${API_BASE}${route.api(slug)}`, { headers: { accept: 'application/json' }, signal: controller.signal }),
      // Forward cookies so a protected preview deployment serves its own shell.
      fetch(new URL('/index.html', url), { headers: { cookie: request.headers.get('cookie') || '' }, signal: controller.signal })
    ]);
    if (!shellResponse.ok) return passThrough();
    const shell = await shellResponse.text();
    const headers = { 'content-type': 'text/html; charset=utf-8' };
    if (apiResponse.status === 404) {
      return new Response(shell.replace('content="index,follow"', 'content="noindex"'), { status: 404, headers });
    }
    if (!apiResponse.ok) return passThrough();
    const snapshot = route.render(await apiResponse.json(), url.pathname);
    if (!snapshot) return passThrough();
    return new Response(injectSnapshot(shell, snapshot), {
      status: 200,
      headers: { ...headers, 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' }
    });
  } catch (error) {
    return passThrough();
  } finally {
    clearTimeout(timer);
  }
}

async function redirectRetired(url, kind, slug) {
  try {
    const response = await fetch(`${API_BASE}/api/public/retired/${kind}/${slug}`, { signal: AbortSignal.timeout(6000) });
    const { to } = response.ok ? await response.json() : {};
    return to ? Response.redirect(new URL(to, url), 301) : passThrough();
  } catch (error) {
    return passThrough();
  }
}
