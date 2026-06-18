const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildUrl = (host, path = '/') => {
  const pathname = String(path || '/').startsWith('/') ? path : `/${path}`;
  return new URL(pathname, `${host}/`).toString();
};

const getPrerenderRoutes = (content) => [
  { route: '/', file: '/index.html' },
  { route: '/guides', file: '/guides/index.html' },
  ...content.guides.map((guide) => ({
    route: `/${guide.slug}`,
    file: `/${guide.slug}/index.html`
  }))
];

const renderGuideCards = (content) => content.guides.map((guide) => `
      <a class="subcard guide-card" href="/${escapeHtml(guide.slug)}">
        <h2>${escapeHtml(guide.title)}</h2>
        <p>${escapeHtml(guide.description)}</p>
      </a>`).join('');

const renderStarterPackCards = () => ([
  {
    title: 'Mental Models',
    href: '/share/wiki/collection/mental-models',
    description: 'A shareable mini-wiki for first principles, opportunity cost, inversion, and related judgment tools.'
  },
  {
    title: 'Behavioral Economics',
    href: '/share/wiki/collection/behavioral-economics',
    description: 'A starter graph for loss aversion, anchoring, base rates, and decision-making under bias.'
  },
  {
    title: 'How to Think About AI',
    href: '/share/wiki/collection/how-to-think-about-ai',
    description: 'A starter graph for agents, evals, context windows, scaling laws, and capability tradeoffs.'
  },
  {
    title: 'Value Investing',
    href: '/share/wiki/collection/value-investing',
    description: 'A starter graph for intrinsic value, moats, owner earnings, capital allocation, and margin of safety.'
  }
].map((pack) => `
      <a class="subcard guide-card" href="${escapeHtml(pack.href)}">
        <h2>${escapeHtml(pack.title)}</h2>
        <p>${escapeHtml(pack.description)}</p>
      </a>`).join('').trimStart());

const renderGuideLinks = (links = []) => links.map((link) => (
  `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
)).join('');

const renderProofPoints = (items = []) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
const renderParagraphs = (paragraphs = []) => paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n');
const renderMetaPills = (content) => `<div class="meta-row">
  <span>Written by ${escapeHtml(content.site.authorName)}</span>
  ${content.site.authorTitle ? `<span>${escapeHtml(content.site.authorTitle)}</span>` : ''}
  <span>Updated ${escapeHtml(content.site.lastUpdated)}</span>
</div>`;
const renderMethodology = (content, guide) => {
  const methodology = Array.isArray(guide.methodology) && guide.methodology.length > 0
    ? guide.methodology
    : Array.isArray(content.site.editorialMethodology)
      ? content.site.editorialMethodology
      : [];
  if (methodology.length === 0) return '';
  return `<section class="card trust-panel" aria-label="Editorial trust signals">
  <h2>How this guide was produced</h2>
  <p><strong>Written by ${escapeHtml(content.site.authorName)}</strong>${content.site.authorTitle ? `, ${escapeHtml(content.site.authorTitle)}` : ''}.</p>
${renderParagraphs(methodology)}
</section>`;
};
const buildArticleSchema = (content, guide, canonical) => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: guide.heroTitle,
  description: guide.heroDescription,
  mainEntityOfPage: canonical,
  datePublished: content.site.lastUpdated,
  dateModified: content.site.lastUpdated,
  author: {
    '@type': 'Person',
    name: content.site.authorName
  },
  publisher: {
    '@type': 'Organization',
    name: content.site.name,
    url: content.site.host
  }
});
const buildSoftwareApplicationSchema = (content, canonical) => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: content.site.name,
  applicationCategory: 'ProductivityApplication',
  operatingSystem: 'Web',
  url: canonical,
  description: content.site.description,
  publisher: {
    '@type': 'Organization',
    name: content.site.name,
    url: content.site.host
  }
});
const buildMarketingHref = (href, { entry = '', cta = '', pageType = 'marketing' } = {}) => {
  const normalizedHref = String(href || '').trim();
  if (!normalizedHref.startsWith('/')) return normalizedHref;
  const url = new URL(normalizedHref, contentSiteHostFallback);
  url.searchParams.set('via', 'marketing');
  if (entry) url.searchParams.set('entry', entry);
  if (cta) url.searchParams.set('cta', cta);
  if (pageType) url.searchParams.set('page_type', pageType);
  return `${url.pathname}${url.search}${url.hash}`;
};
const contentSiteHostFallback = 'https://www.noeis.io';

const renderCards = (block) => {
  const className = block.variant === 'example'
    ? 'grid'
    : block.variant === 'compare'
      ? 'grid'
      : block.variant === 'faq'
        ? 'stack'
        : 'stack';

  return `<div class="${className}">
${block.items.map((item) => `  <section class="subcard">
    <h3>${escapeHtml(item.title)}</h3>
${renderParagraphs(item.paragraphs)}
  </section>`).join('\n')}
</div>`;
};

const renderStructuredPanel = (label, body) => `<section class="seo-structured-card">
  <p class="seo-structured-label">${escapeHtml(label)}</p>
${body}
</section>`;

const renderRelatedGuides = (content, slugs = []) => `<ul>
${slugs.map((slug) => {
  const guide = content.guides.find((entry) => entry.slug === slug);
  if (!guide) return '';
  return `  <li><a href="/${escapeHtml(slug)}">${escapeHtml(guide.title)}</a></li>`;
}).join('\n')}
</ul>`;

const renderCtas = (items = [], options = {}) => `<div class="cta-row">
${items.map((cta) => {
  const href = cta.href === '/register'
    ? buildMarketingHref(cta.href, {
        entry: options.entry || '',
        cta: cta.track || options.cta || 'body',
        pageType: options.pageType || 'marketing'
      })
    : cta.href;
  return `  <a class="button ${escapeHtml(cta.variant || 'secondary')}" href="${escapeHtml(href)}">${escapeHtml(cta.label)}</a>`;
}).join('\n')}
</div>`;

const renderExternalLinks = (items = []) => `<ul>
${items.map((item) => `  <li><a href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a></li>`).join('\n')}
</ul>`;

const renderBlocks = (content, blocks = [], options = {}) => blocks.map((block) => {
  if (block.type === 'paragraph') return `<p>${escapeHtml(block.text)}</p>`;
  if (block.type === 'orderedList') return `<ol>
${block.items.map((item) => `  <li>${escapeHtml(item)}</li>`).join('\n')}
</ol>`;
  if (block.type === 'unorderedList') return `<ul>
${block.items.map((item) => `  <li>${escapeHtml(item)}</li>`).join('\n')}
</ul>`;
  if (block.type === 'subsections') return block.items.map((item) => `${item.title ? `<h3>${escapeHtml(item.title)}</h3>` : ''}
${renderParagraphs(item.paragraphs)}
${item.orderedList ? `<ol>
${item.orderedList.map((listItem) => `  <li>${escapeHtml(listItem)}</li>`).join('\n')}
</ol>` : ''}`).join('\n');
  if (block.type === 'cards' || block.type === 'faqCards') return renderCards(block);
  if (block.type === 'claimEvidence') {
    return `<div class="seo-structured-grid">
${renderStructuredPanel('Claim', `<p>${escapeHtml(block.claim)}</p>`)}
${renderStructuredPanel('Evidence', `<ul>
${block.evidence.map((item) => `  <li>${escapeHtml(item)}</li>`).join('\n')}
</ul>`)}
${block.whyItMatters ? renderStructuredPanel('Why this matters', `<p>${escapeHtml(block.whyItMatters)}</p>`) : ''}
</div>`;
  }
  if (block.type === 'comparison') {
    return `<div class="seo-comparison-block">
  <p class="seo-structured-label">Comparison</p>
${renderCards({ ...block, variant: 'compare' })}
</div>`;
  }
  if (block.type === 'ctas') return renderCtas(block.items, options);
  if (block.type === 'relatedGuides') return renderRelatedGuides(content, block.items);
  if (block.type === 'externalLinks') return renderExternalLinks(block.items);
  return '';
}).join('\n');

const renderHomeFallback = (content) => `
  <main class="seo-page">
    <article class="seo-shell">
      <header class="seo-hero">
        <p class="eyebrow">${escapeHtml(content.home.eyebrow)}</p>
        <h1>${escapeHtml(content.home.headline)}</h1>
        <p class="lede">${escapeHtml(content.home.lede)}</p>
        <div class="cta-row">
          <a class="button primary" href="${escapeHtml(buildMarketingHref(content.home.primaryCta.href, { entry: 'home', cta: 'hero', pageType: 'home' }))}">${escapeHtml(content.home.primaryCta.label)}</a>
          <a class="button secondary" href="${escapeHtml(content.home.secondaryCta.href)}">${escapeHtml(content.home.secondaryCta.label)}</a>
        </div>
      </header>
      <section class="card">
        <p class="eyebrow">${escapeHtml(content.home.railEyebrow)}</p>
        <p>${escapeHtml(content.home.railCopy)}</p>
        <ul>
          ${renderProofPoints(content.home.proofPoints)}
        </ul>
      </section>
      <section class="card">
        <p class="eyebrow">Start with the guide that matches your intent</p>
        <div class="grid">
          ${renderGuideCards(content)}
        </div>
      </section>
      <section class="card">
        <p class="eyebrow">Shared wiki adoption</p>
        <h2>Opening a shared Noeis wiki?</h2>
        <p>The live app will show a <strong>Make this mine</strong> action that copies the safe public pages into your workspace. Private backlinks, highlights, source notes, and agent work stay with the original owner.</p>
        <div class="cta-row">
          <a class="button primary" href="/share/wiki/collection/mental-models">Try the Mental Models wiki</a>
          <a class="button secondary" href="/onboarding/wiki">Build your wiki</a>
        </div>
        <div class="grid">
          ${renderStarterPackCards()}
        </div>
      </section>
      <section class="card">
        <p class="eyebrow">Research guides</p>
        <p>Noeis publishes opinionated guides on reliable recall, concept formation, and human-centered AI for serious readers.</p>
        <div class="cta-row">
          ${renderGuideLinks(content.home.guideLinks)}
        </div>
      </section>
    </article>
  </main>`;

const renderGuideHubPage = (content) => {
  const guides = renderGuideCards(content);
  const canonical = buildUrl(content.site.host, '/guides');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Noeis Guides for Thinking, Reading, and Knowledge Work</title>
    <meta
      name="description"
      content="Opinionated guides on reliable recall, concept formation, reading workflows, and AI-assisted synthesis for serious readers."
    />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(content.site.name)}" />
    <meta property="og:title" content="Noeis Guides for Thinking, Reading, and Knowledge Work" />
    <meta
      property="og:description"
      content="Opinionated guides on reliable recall, concept formation, reading workflows, and AI-assisted synthesis."
    />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary" />
    <link rel="stylesheet" href="/guides/styles.css" />
  </head>
  <body>
    <main class="seo-page">
      <article class="seo-shell">
        <header class="seo-hero">
          <p class="eyebrow">Guides</p>
          <h1>Practical Guides for Thinking, Reading, and Knowledge Work</h1>
          <p class="lede">
            These guides are built for founders, writers, researchers, analysts, and serious readers evaluating better workflows for recall, synthesis, and concept formation.
          </p>
          <div class="grid">
${guides}
          </div>
        </header>
      </article>
    </main>
  </body>
</html>`;
};

const renderGuidePage = (content, slug) => {
  const guide = content.guides.find((entry) => entry.slug === slug);
  if (!guide) {
    throw new Error(`Unknown guide slug: ${slug}`);
  }

  const canonical = buildUrl(content.site.host, `/${guide.slug}`);
  const schemaNodes = [
    buildArticleSchema(content, guide, canonical),
    buildSoftwareApplicationSchema(content, canonical)
  ];
  if (Array.isArray(guide.faq) && guide.faq.length > 0) {
    schemaNodes.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: guide.faq.map((entry) => ({
        '@type': 'Question',
        name: entry.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: entry.answer
        }
      }))
    });
  }
  const schemaMarkup = `<script type="application/ld+json">${JSON.stringify(schemaNodes)}</script>`;
  const directAnswer = guide.directAnswer ? `<section class="card answer-panel" aria-label="Direct answer">
          <p class="seo-structured-label">${escapeHtml(guide.directAnswer.label || 'Direct answer')}</p>
          <h2>${escapeHtml(guide.directAnswer.title)}</h2>
          <p class="answer-text">${escapeHtml(guide.directAnswer.text)}</p>
          ${Array.isArray(guide.directAnswer.points) && guide.directAnswer.points.length > 0 ? `<ul class="answer-points">
${guide.directAnswer.points.map((point) => `  <li>${escapeHtml(point)}</li>`).join('\n')}
</ul>` : ''}
        </section>` : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(guide.pageTitle)}</title>
    <meta
      name="description"
      content="${escapeHtml(guide.heroDescription)}"
    />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${escapeHtml(content.site.name)}" />
    <meta property="og:title" content="${escapeHtml(guide.pageTitle)}" />
    <meta
      property="og:description"
      content="${escapeHtml(guide.heroDescription)}"
    />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(guide.pageTitle)}" />
    <meta
      name="twitter:description"
      content="${escapeHtml(guide.heroDescription)}"
    />
    <link rel="stylesheet" href="/ai-second-brain/styles.css" />
    ${schemaMarkup}
  </head>
  <body>
    <main class="seo-page">
      <article class="seo-shell">
        <header class="seo-hero">
          <p class="eyebrow">${escapeHtml(guide.eyebrow || 'Guide')}</p>
          ${renderMetaPills(content)}
          <h1>${escapeHtml(guide.heroTitle)}</h1>
          ${renderParagraphs(guide.heroIntro)}
          ${renderCtas(guide.ctas, { entry: guide.slug, pageType: 'guide' })}
          ${Array.isArray(guide.toc) && guide.toc.length > 0 ? `<nav class="toc" aria-label="On-page sections">
${guide.toc.map((item) => `  <a href="#${escapeHtml(item.id)}">${escapeHtml(item.label)}</a>`).join('\n')}
</nav>` : ''}
          ${renderMethodology(content, guide)}
          ${directAnswer}
        </header>
${guide.sections.map((section) => {
  const tag = section.style === 'callout' ? 'aside' : section.style === 'footer' ? 'footer' : 'section';
  const className = section.style === 'callout' ? 'card callout' : section.style === 'footer' ? 'card footer-card' : 'card';
  return `        <${tag}${section.id ? ` id="${escapeHtml(section.id)}"` : ''} class="${className}">
          <h2>${escapeHtml(section.title)}</h2>
${renderBlocks(content, section.blocks, { entry: guide.slug, pageType: 'guide' })}
        </${tag}>`;
}).join('\n')}
      </article>
    </main>
  </body>
</html>`;
};

const renderSitemap = (content) => {
  const urls = [
    '/',
    '/guides',
    ...content.guides.map((guide) => `/${guide.slug}`)
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url>
    <loc>${buildUrl(content.site.host, path)}</loc>
    <lastmod>${escapeHtml(content.site.lastUpdated)}</lastmod>
  </url>`).join('\n')}
</urlset>`;
};

const renderPrerenderManifest = (content) => JSON.stringify({
  routes: getPrerenderRoutes(content),
  spaFallback: '/index.html'
}, null, 2);

const renderStaticRedirects = (content) => {
  const routeLines = getPrerenderRoutes(content)
    .filter((entry) => entry.route !== '/')
    .map((entry) => `${entry.route} ${entry.file} 200`);
  return `${routeLines.join('\n')}\n/* /index.html 200\n`;
};

const renderVercelConfig = (content) => JSON.stringify({
  cleanUrls: true,
  redirects: [
    {
      source: '/wiki/list',
      destination: '/wiki/workspace?view=list',
      permanent: false
    },
    {
      source: '/wiki/:id((?!workspace$)[^/]+)',
      destination: '/wiki/workspace?page=:id',
      permanent: false
    }
  ],
  rewrites: [
    ...getPrerenderRoutes(content)
      .filter((entry) => entry.route !== '/')
      .map((entry) => ({
        source: entry.route,
        destination: entry.file
      })),
    {
      source: '/(.*)',
      destination: '/'
    }
  ]
}, null, 2);

const renderBingSiteAuthXml = (token = '') => `<?xml version="1.0"?>\n<users>\n  <user>${escapeHtml(token)}</user>\n</users>\n`;

module.exports = {
  renderGuideHubPage,
  renderGuidePage,
  renderHomeFallback,
  renderSitemap,
  renderPrerenderManifest,
  renderStaticRedirects,
  renderVercelConfig,
  renderBingSiteAuthXml
};
