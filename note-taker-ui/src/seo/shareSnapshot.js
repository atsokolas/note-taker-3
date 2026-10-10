/* What a crawler or an agent reads at a public wiki address.

   The app draws shared wikis in the browser, so a plain fetch used to get the
   homepage, canonical and all. This turns the same public payload the app
   reads into HTML the page can be read from without running any JavaScript:
   the title, the text with its citation marks, and the sources under it. The
   app still mounts over it as before. */

import { agentOf } from '../components/editions/editionAgent';

/* "Codex’s reading", or a plain one when the paper does not name its agent. */
const readingBy = ({ filedBy, filedByRuntime }, unnamed) => {
  const agent = agentOf({ runtime: filedByRuntime, label: filedBy });
  return agent ? `${agent.name}’s reading` : unnamed;
};

const HOST = 'https://www.noeis.io';

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const summaryOf = (text = '', limit = 158) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80))}…`;
};

const citationMarks = (indexes = []) => indexes
  .map((index) => `<sup><a href="#source-${index}">[${index}]</a></sup>`)
  .join('');

const renderText = (node) => {
  let html = escapeHtml(node.text || '');
  let cited = [];
  (node.marks || []).forEach((mark) => {
    if (mark?.type === 'bold') html = `<strong>${html}</strong>`;
    else if (mark?.type === 'italic') html = `<em>${html}</em>`;
    else if (mark?.type === 'link' && /^https?:\/\//.test(mark.attrs?.href || '')) {
      html = `<a href="${escapeHtml(mark.attrs.href)}" rel="nofollow noopener">${html}</a>`;
    } else if (mark?.type === 'claim') cited = mark.attrs?.citationIndexes || [];
  });
  return { html, cited };
};

/* Claim marks repeat across every text run of one sentence; the citation goes
   once, after the last run that carries it. */
const renderInline = (nodes = []) => {
  const runs = nodes.map((node) => (node?.type === 'text' ? renderText(node) : { html: renderNode(node), cited: [] }));
  return runs.map((run, index) => {
    const key = run.cited.join(',');
    const nextKey = (runs[index + 1]?.cited || []).join(',');
    return key && key !== nextKey ? `${run.html}${citationMarks(run.cited)}` : run.html;
  }).join('');
};

const BLOCKS = {
  paragraph: (node) => `<p>${renderInline(node.content)}</p>`,
  heading: (node) => {
    const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 2), 4);
    return `<h${level}>${renderInline(node.content)}</h${level}>`;
  },
  bulletList: (node) => `<ul>${renderBlocks(node.content)}</ul>`,
  orderedList: (node) => `<ol>${renderBlocks(node.content)}</ol>`,
  listItem: (node) => `<li>${renderBlocks(node.content)}</li>`,
  blockquote: (node) => `<blockquote>${renderBlocks(node.content)}</blockquote>`,
  hardBreak: () => '<br />'
};

function renderNode(node) {
  if (!node || typeof node !== 'object') return '';
  const block = BLOCKS[node.type];
  if (block) return block(node);
  return Array.isArray(node.content) ? renderBlocks(node.content) : '';
}

function renderBlocks(nodes = []) {
  return (Array.isArray(nodes) ? nodes : []).map(renderNode).join('');
}

/* Starter pages open with their own title as a heading; the card already shows it. */
const renderPageBody = (page = {}) => {
  const blocks = Array.isArray(page.body?.content) ? page.body.content : [];
  const [first, ...rest] = blocks;
  const leadText = first?.type === 'heading' ? (first.content || []).map((node) => node.text || '').join('').trim() : '';
  return renderBlocks(leadText && leadText === String(page.title || '').trim() ? rest : blocks)
    || `<p>${escapeHtml(page.plainText || '')}</p>`;
};

const renderSources =(sources = []) => (sources.length ? `
      <section class="card" id="sources">
        <h2>Sources</h2>
        <ol>${sources.map((source, index) => `
          <li id="source-${index + 1}">${source.url
            ? `<a href="${escapeHtml(source.url)}" rel="nofollow noopener">${escapeHtml(source.title || source.url)}</a>`
            : escapeHtml(source.title)}${source.snippet ? `<blockquote>${escapeHtml(source.snippet)}</blockquote>` : ''}</li>`).join('')}
        </ol>
      </section>` : '');

export const renderWikiPageSnapshot = (page = {}, path = '') => {
  const body = renderPageBody(page);
  const sources = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
  const description = summaryOf(page.plainText) || `A Noeis wiki page with ${sources.length} cited sources.`;
  return {
    title: `${page.title || 'Shared wiki page'} | Noeis`,
    description,
    canonical: `${HOST}${path}`,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.title || 'Shared wiki page',
      description,
      mainEntityOfPage: `${HOST}${path}`,
      ...(page.createdAt ? { datePublished: page.createdAt } : {}),
      ...(page.updatedAt ? { dateModified: page.updatedAt } : {}),
      citation: sources.filter((source) => source.url).map((source) => ({
        '@type': 'CreativeWork',
        name: source.title || source.url,
        url: source.url
      })),
      publisher: { '@type': 'Organization', name: 'Noeis', url: HOST }
    },
    html: `
    <main class="seo-page">
      <article class="seo-shell">
        <header class="seo-hero">
          <p class="eyebrow">Shared Noeis wiki</p>
          <h1>${escapeHtml(page.title || 'Shared wiki page')}</h1>
        </header>
        <section class="card">${body}</section>${renderSources(sources)}
      </article>
    </main>`
  };
};

export const renderWikiCollectionSnapshot = (collection = {}, path = '') => {
  const pages = Array.isArray(collection.pages) ? collection.pages : [];
  const description = summaryOf(collection.description)
    || `A shared Noeis wiki of ${pages.length} pages.`;
  return {
    title: `${collection.name || 'Shared wiki'} | Noeis`,
    description,
    canonical: `${HOST}${path}`,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: collection.name || 'Shared wiki',
      description,
      url: `${HOST}${path}`,
      hasPart: pages.map((page) => ({ '@type': 'Article', headline: page.title }))
    },
    html: `
    <main class="seo-page">
      <article class="seo-shell">
        <header class="seo-hero">
          <p class="eyebrow">Shared Noeis wiki</p>
          <h1>${escapeHtml(collection.name || 'Shared wiki')}</h1>
          ${collection.description ? `<p class="lede">${escapeHtml(collection.description)}</p>` : ''}
        </header>${pages.map((page) => `
        <section class="card">
          <h2>${escapeHtml(page.title)}</h2>
          ${renderPageBody(page)}
        </section>`).join('')}
      </article>
    </main>`
  };
};

export const renderEditionSnapshot = (edition = {}, path = '') => {
  const items = Array.isArray(edition.items) ? edition.items : [];
  const heading = [edition.title, edition.number ? `${edition.issueLabel || 'Issue'} ${edition.number}` : '']
    .filter(Boolean).join(', ') || 'Shared edition';
  const description = summaryOf(edition.standfirst || edition.throughLine)
    || `${items.length} findings, each with its source and what limits it.`;
  return {
    title: `${heading} | Noeis`,
    description,
    canonical: `${HOST}${path}`,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: heading,
      description,
      mainEntityOfPage: `${HOST}${path}`,
      ...(edition.windowEnd ? { datePublished: edition.windowEnd } : {}),
      citation: items.filter((item) => item.url).map((item) => ({
        '@type': 'CreativeWork',
        name: item.title || item.url,
        url: item.url
      })),
      publisher: { '@type': 'Organization', name: 'Noeis', url: HOST }
    },
    html: `
    <main class="seo-page">
      <article class="seo-shell">
        <header class="seo-hero">
          <p class="eyebrow">Shared Noeis edition${edition.windowStart && edition.windowEnd ? `, ${escapeHtml(edition.windowStart)} to ${escapeHtml(edition.windowEnd)}` : ''}</p>
          <h1>${escapeHtml(heading)}</h1>
          ${edition.standfirst ? `<p class="lede">${escapeHtml(edition.standfirst)}</p>` : ''}
          ${edition.writtenBy ? `<p>Filed by ${escapeHtml(agentOf({ runtime: edition.writtenByRuntime, label: edition.writtenBy }).name)}</p>` : ''}
        </header>${items.map((item) => `
        <section class="card">
          ${item.section ? `<p class="eyebrow">${escapeHtml(item.section)}</p>` : ''}
          <h2>${item.url ? `<a href="${escapeHtml(item.url)}" rel="nofollow noopener">${escapeHtml(item.title || item.url)}</a>` : escapeHtml(item.title)}</h2>
          ${item.readings?.length ? `<h3>${escapeHtml(readingBy(item, 'A reading'))}</h3>` : ''}
          <p>${escapeHtml(item.finding)}</p>
          ${item.boundary ? `<p><strong>What limits it:</strong> ${escapeHtml(item.boundary)}</p>` : ''}${(item.readings || []).map((reading) => `
          <h3>${escapeHtml(readingBy(reading, 'Another reading'))}</h3>
          <p>${escapeHtml(reading.finding)}</p>
          <p><strong>What limits it:</strong> ${escapeHtml(reading.boundary)}</p>`).join('')}
        </section>`).join('')}${edition.throughLine ? `
        <section class="card"><h2>Through line</h2><p>${escapeHtml(edition.throughLine)}</p></section>` : ''}${(edition.watchNext || []).length ? `
        <section class="card"><h2>Watch next</h2><ul>${edition.watchNext.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></section>` : ''}
      </article>
    </main>`
  };
};

const replaceMeta = (shell, attr, key, value) => shell.replace(
  new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`),
  `$1${escapeHtml(value)}$2`
);

/* Swap the homepage's head and fallback for the page's own. */
export const injectSnapshot = (shell = '', snapshot) => {
  let html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(snapshot.title)}</title>`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${escapeHtml(snapshot.canonical)}$2`);
  html = replaceMeta(html, 'name', 'description', snapshot.description);
  html = replaceMeta(html, 'property', 'og:title', snapshot.title);
  html = replaceMeta(html, 'property', 'og:description', snapshot.description);
  html = replaceMeta(html, 'property', 'og:url', snapshot.canonical);
  html = replaceMeta(html, 'property', 'og:type', 'article');
  html = replaceMeta(html, 'name', 'twitter:title', snapshot.title);
  html = replaceMeta(html, 'name', 'twitter:description', snapshot.description);
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(snapshot.schema).replace(/</g, '\\u003c')}</script>`
  );
  const open = html.indexOf('<div id="root">');
  const close = html.lastIndexOf('</div>', html.lastIndexOf('</body>'));
  if (open < 0 || close < open) return html;
  return `${html.slice(0, open)}<div id="root">${snapshot.html}${html.slice(close)}`;
};

export const SHARE_ROUTES = [
  {
    pattern: /^\/share\/editions\/([^/]+)\/?$/,
    api: (slug) => `/api/public/editions/${encodeURIComponent(slug)}`,
    render: (payload, path) => (payload?.items ? renderEditionSnapshot(payload, path) : null)
  },
  {
    pattern: /^\/share\/wiki\/collection\/([^/]+)\/?$/,
    api: (slug) => `/api/public/wiki/collections/${encodeURIComponent(slug)}`,
    render: (payload, path) => (payload?.collection ? renderWikiCollectionSnapshot(payload.collection, path) : null)
  },
  {
    pattern: /^\/share\/wiki\/([^/]+)\/?$/,
    api: (slug) => `/api/public/wiki/pages/${encodeURIComponent(slug)}`,
    render: (payload, path) => (payload?.page ? renderWikiPageSnapshot(payload.page, path) : null)
  }
];
