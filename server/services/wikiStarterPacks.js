// Starter packs: ready-made wiki pages a new reader can adopt, cited to their sources.
const { slugify, paragraphNode, wikiLinkText, serializePublicWikiCollection } = require('./wikiPageShape');

const starterOriginId = (packId, title) => `starter:${packId}:${slugify(title)}`;
const STARTER_PACK_REVIEWED_AT = '2026-10-11T00:00:00.000Z';

/* A claim is the text before a {n} marker; n is a 1-based index into the
   page's sources, as the reader's footnotes count them. */
const citedParagraph = (text = '') => {
  const parts = String(text).split(/\{([\d,\s]+)\}/);
  const content = [];
  for (let index = 0; index < parts.length; index += 2) {
    const [, lead, claim] = parts[index].match(/^(\s*)([\s\S]*)$/);
    if (lead) content.push(lead);
    if (!claim) continue;
    if (index + 1 >= parts.length) {
      content.push(claim);
      continue;
    }
    content.push({
      type: 'text',
      text: claim,
      marks: [{
        type: 'claim',
        attrs: {
          support: 'supported',
          citationIndexes: parts[index + 1].split(',').map(Number),
          contradictionIndexes: []
        }
      }]
    });
  }
  return paragraphNode(content);
};

const buildStarterPage = ({ packId, title, pageType = 'overview', paragraphs = [], sources = [], links = [] }) => {
  const pageId = starterOriginId(packId, title);
  const linkedContent = [];
  links.forEach((link, index) => {
    if (index > 0) linkedContent.push(', ');
    linkedContent.push(wikiLinkText({
      text: link,
      title: link,
      pageId: starterOriginId(packId, link)
    }));
  });
  const body = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
      ...paragraphs.map(citedParagraph),
      ...(links.length ? [paragraphNode(['Read next: ', ...linkedContent, '.'])] : [])
    ]
  };
  return {
    _id: pageId,
    title,
    slug: slugify(title),
    pageType,
    status: 'published',
    visibility: 'shared',
    createdAt: STARTER_PACK_REVIEWED_AT,
    updatedAt: STARTER_PACK_REVIEWED_AT,
    lastReviewedAt: STARTER_PACK_REVIEWED_AT,
    plainText: [title, ...paragraphs.map(text => text.replace(/\{[\d,\s]+\}/g, ''))].join('\n'),
    body,
    sourceRefs: sources.map((source, index) => ({
      type: 'external',
      title: source.title,
      url: source.url,
      citationLabel: `[${index + 1}]`
    }))
  };
};

/* Ready-made wikis: every line cites a public source a newcomer can open,
   and taking one brings those sources into their Library. */
const STARTER_PACKS = require('../data/starterPacks.json').map(pack => ({
  ...pack,
  pages: pack.pages.map(page => buildStarterPage({ packId: pack.id, ...page }))
}));

const starterPackSummary = (pack) => ({
  id: pack.id,
  name: pack.name,
  tagline: pack.tagline,
  description: pack.description,
  hero: Boolean(pack.hero),
  pageCount: pack.pages.length,
  pages: pack.pages.map(page => ({
    id: page._id,
    title: page.title,
    slug: page.slug,
    pageType: page.pageType
  }))
});

const findStarterPack = (idOrSlug = '') => {
  const safe = String(idOrSlug || '').trim();
  if (!safe) return null;
  return STARTER_PACKS.find(pack => pack.id === safe || slugify(pack.name) === safe) || null;
};

const serializeStarterPackAsPublicCollection = (pack) => {
  if (!pack) return null;
  return serializePublicWikiCollection({
    collection: {
      _id: pack.id,
      name: pack.name,
      description: pack.description || pack.tagline || '',
      slug: pack.id,
      visibility: 'shared',
      sourceType: 'starter_pack',
      packId: pack.id
    },
    pages: pack.pages
  });
};

module.exports = {
  STARTER_PACKS,
  starterPackSummary,
  findStarterPack,
  serializeStarterPackAsPublicCollection
};
