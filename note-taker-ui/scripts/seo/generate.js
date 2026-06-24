const fs = require('fs');
const path = require('path');
const {
  renderGuideHubPage,
  renderExamplesPage,
  renderGuidePage,
  renderHomeFallback,
  renderSitemap,
  renderPrerenderManifest,
  renderStaticRedirects,
  renderVercelConfig,
  renderBingSiteAuthXml
} = require('./renderers');

const rootDir = path.resolve(__dirname, '..', '..');
const publicDir = path.join(rootDir, 'public');
const contentPath = path.join(rootDir, 'src', 'seo', 'publishingContent.json');
const indexHtmlPath = path.join(publicDir, 'index.html');
const guideHubPath = path.join(publicDir, 'guides', 'index.html');
const examplesPath = path.join(publicDir, 'examples', 'index.html');
const sitemapPath = path.join(publicDir, 'sitemap.xml');
const redirectsPath = path.join(publicDir, '_redirects');
const prerenderManifestPath = path.join(publicDir, 'prerender-manifest.json');
const vercelConfigPath = path.join(rootDir, 'vercel.json');
const bingSiteAuthFilename = String(process.env.BING_SITE_AUTH_FILENAME || 'BingSiteAuth.xml').trim();
const bingSiteAuthPath = path.join(publicDir, bingSiteAuthFilename);
const bingSiteAuthXml = String(process.env.BING_SITE_AUTH_XML || '').trim();
const bingSiteAuthToken = String(process.env.BING_SITE_AUTH_TOKEN || '').trim();

const START_MARKER = '<!-- SEO_HOME_FALLBACK_START -->';
const END_MARKER = '<!-- SEO_HOME_FALLBACK_END -->';

const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const homeFallback = renderHomeFallback(content);

if (!indexHtml.includes(START_MARKER) || !indexHtml.includes(END_MARKER)) {
  throw new Error('SEO homepage fallback markers are missing from public/index.html');
}

const nextIndexHtml = indexHtml.replace(
  new RegExp(`${START_MARKER}[\\s\\S]*${END_MARKER}`),
  `${START_MARKER}\n${homeFallback}\n    ${END_MARKER}`
);

fs.writeFileSync(indexHtmlPath, nextIndexHtml);
fs.writeFileSync(guideHubPath, renderGuideHubPage(content));
fs.mkdirSync(path.dirname(examplesPath), { recursive: true });
fs.writeFileSync(examplesPath, renderExamplesPage(content));
fs.writeFileSync(sitemapPath, renderSitemap(content));
fs.writeFileSync(redirectsPath, renderStaticRedirects(content));
fs.writeFileSync(prerenderManifestPath, renderPrerenderManifest(content));
fs.writeFileSync(vercelConfigPath, `${renderVercelConfig(content)}\n`);

if (bingSiteAuthXml || bingSiteAuthToken) {
  fs.writeFileSync(
    bingSiteAuthPath,
    bingSiteAuthXml || renderBingSiteAuthXml(bingSiteAuthToken)
  );
} else if (fs.existsSync(bingSiteAuthPath)) {
  fs.unlinkSync(bingSiteAuthPath);
}

content.guides.forEach((guide) => {
  const guideDir = path.join(publicDir, guide.slug);
  fs.mkdirSync(guideDir, { recursive: true });
  fs.writeFileSync(path.join(guideDir, 'index.html'), renderGuidePage(content, guide.slug));
});
