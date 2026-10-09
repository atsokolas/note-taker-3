const {
  renderHomeFallback,
  patchHomeHead,
  renderExamplesPage,
  renderSitemap,
  renderPrerenderManifest,
  renderStaticRedirects,
  renderVercelConfig,
  renderLlmsTxt,
  renderBingSiteAuthXml
} = require('../../scripts/seo/renderers');
const publishingContent = require('./publishingContent.json');
const homeCopy = require('./homeCopy.json');
const { GUIDE_SLUGS } = require('./guideSlugs');

const content = { ...publishingContent, home: homeCopy };

describe('publishing renderers', () => {
  it('routes every guide the generator prerenders', () => {
    expect(GUIDE_SLUGS).toEqual(publishingContent.guides.map((guide) => guide.slug));
  });


  it('says what Noeis does, for people and for agents', () => {
    const html = renderHomeFallback(content);

    expect(html).toContain('Grow a knowledge base from what you read.');
    expect(html).toContain('Save what you read.');
    expect(html).toContain('Grow a wiki that cites itself.');
    expect(html).toContain('Ask, and get the passage back.');
    expect(html).toContain('Let your agents learn from it.');
    expect(html).toContain('href="#how-it-works"');
    expect(html).toContain('href="/guides"');
    expect(html).toContain('href="/examples"');
    expect(html).toContain('href="/skill.md"');
    expect(html).toContain('href="/ai-second-brain"');
    expect(html).toContain('<strong>Make this mine</strong>');
    expect(html).toContain('href="/share/wiki/collection/mental-models"');
    expect(html).toContain('href="/share/wiki/collection/value-investing"');
    expect(html).not.toContain('The live app will show');
    expect(html).not.toContain('Nothing is written until you accept it');
    expect(html).not.toContain('An agent brings evidence overnight');
  });

  it('gives answer engines a plain-text map of the site', () => {
    const text = renderLlmsTxt(content);

    expect(text.startsWith('# Noeis\n\n> ')).toBe(true);
    expect(text).toContain(content.home.description);
    expect(text).toContain('(https://www.noeis.io/skill.md)');
    expect(text).toContain('(https://www.noeis.io/share/wiki/collection/mental-models)');
    expect(text).toContain('(https://www.noeis.io/ai-second-brain)');
  });

  it('patches the homepage document title and descriptions from the same copy', () => {
    const html = patchHomeHead(
      '<title>old</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /><meta name="twitter:title" content="old" /><meta name="twitter:description" content="old" /><script type="application/ld+json">{}</script>',
      content
    );
    expect(html).toContain('<title>Noeis — Grow a knowledge base from what you read</title>');
    expect(html).toContain(`content="${homeCopy.description}"`);
    expect(html).toContain('"featureList":["Save what you read.');
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
