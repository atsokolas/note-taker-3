import { SHARE_ROUTES, injectSnapshot } from './src/seo/shareSnapshot';

/* Public wiki and edition addresses answer with their own HTML, so search engines and
   agents that do not run JavaScript read the page instead of the homepage.
   Anything that goes wrong falls through to the app exactly as before. */

export const config = { matcher: ['/share/wiki/:path*', '/share/editions/:path*'] };

const API_BASE = process.env.NOEIS_PUBLIC_API_BASE || 'https://note-taker-3-unrg.onrender.com';
const passThrough = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

export default async function middleware(request) {
  if (request.method !== 'GET') return passThrough();
  const url = new URL(request.url);
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
