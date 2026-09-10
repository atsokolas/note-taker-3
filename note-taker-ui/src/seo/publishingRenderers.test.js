const {
  renderHomeFallback,
  patchHomeHead,
  renderExamplesPage,
  renderSitemap,
  renderPrerenderManifest,
  renderStaticRedirects,
  renderVercelConfig,
  renderBingSiteAuthXml
} = require('../../scripts/seo/renderers');
const publishingContent = require('./publishingContent.json');
const homeCopy = require('./homeCopy.json');

describe('publishing renderers', () => {
  it('keeps the signed-out homepage copy in one place', () => {
    expect(publishingContent.home.headline).toBe(homeCopy.headline);
    expect(publishingContent.home.lede).toBe(homeCopy.lede);
    expect(publishingContent.home.statements).toEqual(homeCopy.statements);
    expect(publishingContent.home.title).toBe('Noeis — Make something of what you read');
  });

  it('renders a server-visible homepage fallback from the publishing registry', () => {
    const html = renderHomeFallback(publishingContent);

    expect(html).toContain('A personal research workspace');
    expect(html).toContain('Make something of what you read.');
    expect(html).toContain('Keep the source.');
    expect(html).toContain('Work with the idea.');
    expect(html).toContain('Pick it up again.');
    expect(html).toContain('href="#how-it-works"');
    expect(html).toContain('href="/guides"');
    expect(html).toContain('href="/examples"');
    expect(html).toContain('href="/ai-second-brain"');
    expect(html).toContain('Shared wiki adoption');
    expect(html).toContain('<strong>Make this mine</strong>');
    expect(html).toContain('href="/share/wiki/collection/mental-models"');
    expect(html).toContain('href="/share/wiki/collection/value-investing"');
    expect(html).toContain('Private backlinks, highlights, source notes, and agent work stay with the original owner.');
    expect(html).not.toContain('Nothing is written until you accept it');
    expect(html).not.toContain('An agent brings evidence overnight');
  });

  it('patches the homepage document title and descriptions from the same copy', () => {
    const html = patchHomeHead(
      '<title>old</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /><meta name="twitter:title" content="old" /><meta name="twitter:description" content="old" />',
      publishingContent
    );
    expect(html).toContain('<title>Noeis — Make something of what you read</title>');
    expect(html).toContain(`content="${publishingContent.home.description}"`);
  });

  it('renders a curated examples page for source-grounded public wikis', () => {
    const html = renderExamplesPage(publishingContent);

    expect(html).toContain('Source-Grounded Wiki Examples | Noeis');
    expect(html).toContain('Curated public Noeis wikis');
    expect(html).toContain('href="/share/wiki/collection/mental-models"');
    expect(html).toContain('href="/from-saved-article-to-draft-in-noeis"');
    expect(html).toContain('"@type":"CollectionPage"');
  });

  it('renders a sitemap with canonical www URLs and lastmod values', () => {
    const xml = renderSitemap(publishingContent);

    expect(xml).toContain('<loc>https://www.noeis.io/</loc>');
    expect(xml).toContain('<loc>https://www.noeis.io/guides</loc>');
    expect(xml).toContain('<loc>https://www.noeis.io/examples</loc>');
    expect(xml).toContain('<loc>https://www.noeis.io/ai-second-brain</loc>');
    expect(xml).toContain('<lastmod>2026-04-19</lastmod>');
  });

  it('renders a prerender manifest for marketing routes', () => {
    const manifest = JSON.parse(renderPrerenderManifest(publishingContent));

    expect(manifest.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: '/', file: '/index.html' }),
        expect.objectContaining({ route: '/guides', file: '/guides/index.html' }),
        expect.objectContaining({ route: '/examples', file: '/examples/index.html' }),
        expect.objectContaining({ route: '/source-backed-synthesis-workflow', file: '/source-backed-synthesis-workflow/index.html' }),
        expect.objectContaining({ route: '/from-saved-article-to-draft-in-noeis', file: '/from-saved-article-to-draft-in-noeis/index.html' })
      ])
    );
    expect(manifest.spaFallback).toBe('/index.html');
  });

  it('renders deployment rewrites that prefer prerendered marketing pages over the SPA fallback', () => {
    const redirects = renderStaticRedirects(publishingContent);
    const vercel = JSON.parse(renderVercelConfig(publishingContent));

    expect(redirects).toContain('/guides /guides/index.html 200');
    expect(redirects).toContain('/examples /examples/index.html 200');
    expect(redirects).toContain('/import-reading-archive-into-noeis /import-reading-archive-into-noeis/index.html 200');
    expect(redirects).toContain('/from-saved-article-to-draft-in-noeis /from-saved-article-to-draft-in-noeis/index.html 200');
    expect(redirects.trim().endsWith('/* /index.html 200')).toBe(true);

    expect(vercel.cleanUrls).toBe(true);
    expect(vercel.redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/wiki/list', destination: '/wiki/workspace?view=list', permanent: false }),
        expect.objectContaining({ source: '/wiki/:id((?!workspace$)[^/]+)', destination: '/wiki/workspace?page=:id', permanent: false })
      ])
    );
    expect(vercel.redirects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/wiki' })
      ])
    );
    expect(vercel.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/guides', destination: '/guides/index.html' }),
        expect.objectContaining({ source: '/examples', destination: '/examples/index.html' }),
        expect.objectContaining({ source: '/best-second-brain-app-for-founders', destination: '/best-second-brain-app-for-founders/index.html' }),
        expect.objectContaining({ source: '/from-saved-article-to-draft-in-noeis', destination: '/from-saved-article-to-draft-in-noeis/index.html' }),
        expect.objectContaining({ source: '/(.*)', destination: '/' })
      ])
    );
    expect(vercel.rewrites[vercel.rewrites.length - 1]).toEqual({ source: '/(.*)', destination: '/' });
  });

  it('renders a Bing verification XML payload from a token', () => {
    expect(renderBingSiteAuthXml('bing-verification-token')).toContain('<user>bing-verification-token</user>');
    expect(renderBingSiteAuthXml('bing-verification-token')).toContain('<users>');
  });
});
