import { useEffect } from 'react';
import {
  DEFAULT_SOCIAL_IMAGE_PATH,
  SITE_NAME,
  buildCanonicalUrl
} from '../seo/siteMetadata';

const ensureMetaTag = (selector, createTag) => {
  let node = document.head.querySelector(selector);
  let created = false;
  if (!node) {
    node = createTag();
    document.head.appendChild(node);
    created = true;
  }
  return { node, created };
};

const ensureNamedMeta = (name) => ensureMetaTag(
  `meta[name="${name}"]`,
  () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    return meta;
  }
);

const ensurePropertyMeta = (property) => ensureMetaTag(
  `meta[property="${property}"]`,
  () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', property);
    return meta;
  }
);

const ensureCanonicalLink = () => ensureMetaTag(
  'link[rel="canonical"]',
  () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    return link;
  }
);

const useSeoMetadata = ({
  title,
  description,
  canonicalPath = '/',
  schema = null,
  ogType = 'article'
}) => {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const previousTitle = document.title;
    document.title = title;

    const descriptionMeta = ensureNamedMeta('description');
    const ogTitleMeta = ensurePropertyMeta('og:title');
    const ogDescriptionMeta = ensurePropertyMeta('og:description');
    const ogTypeMeta = ensurePropertyMeta('og:type');
    const ogUrlMeta = ensurePropertyMeta('og:url');
    const ogSiteNameMeta = ensurePropertyMeta('og:site_name');
    const ogImageMeta = ensurePropertyMeta('og:image');
    const twitterCardMeta = ensureNamedMeta('twitter:card');
    const twitterTitleMeta = ensureNamedMeta('twitter:title');
    const twitterDescriptionMeta = ensureNamedMeta('twitter:description');
    const twitterImageMeta = ensureNamedMeta('twitter:image');
    const robotsMeta = ensureNamedMeta('robots');
    const canonicalLink = ensureCanonicalLink();

    const managedNodes = [
      descriptionMeta,
      ogTitleMeta,
      ogDescriptionMeta,
      ogTypeMeta,
      ogUrlMeta,
      ogSiteNameMeta,
      ogImageMeta,
      twitterCardMeta,
      twitterTitleMeta,
      twitterDescriptionMeta,
      twitterImageMeta,
      robotsMeta,
      canonicalLink
    ];

    const snapshots = managedNodes.map(({ node, created }) => ({
      node,
      created,
      content: node.getAttribute('content'),
      href: node.getAttribute('href')
    }));

    const canonicalUrl = buildCanonicalUrl(canonicalPath);
    const socialImageUrl = buildCanonicalUrl(DEFAULT_SOCIAL_IMAGE_PATH);

    descriptionMeta.node.setAttribute('content', description);
    ogTitleMeta.node.setAttribute('content', title);
    ogDescriptionMeta.node.setAttribute('content', description);
    ogTypeMeta.node.setAttribute('content', ogType);
    ogUrlMeta.node.setAttribute('content', canonicalUrl);
    ogSiteNameMeta.node.setAttribute('content', SITE_NAME);
    ogImageMeta.node.setAttribute('content', socialImageUrl);
    twitterCardMeta.node.setAttribute('content', 'summary');
    twitterTitleMeta.node.setAttribute('content', title);
    twitterDescriptionMeta.node.setAttribute('content', description);
    twitterImageMeta.node.setAttribute('content', socialImageUrl);
    robotsMeta.node.setAttribute('content', 'index,follow');
    canonicalLink.node.setAttribute('href', canonicalUrl);

    let schemaNode = null;
    if (schema) {
      schemaNode = document.getElementById('seo-schema');
      if (!schemaNode) {
        schemaNode = document.createElement('script');
        schemaNode.type = 'application/ld+json';
        schemaNode.id = 'seo-schema';
        document.head.appendChild(schemaNode);
      }
      schemaNode.textContent = JSON.stringify(
        Array.isArray(schema)
          ? { '@context': 'https://schema.org', '@graph': schema.map(({ '@context': _context, ...entry }) => entry) }
          : schema
      );
    }

    return () => {
      document.title = previousTitle;
      snapshots.forEach(({ node, created, content, href }) => {
        if (created) {
          node.remove();
          return;
        }
        if (content === null) {
          node.removeAttribute('content');
        } else {
          node.setAttribute('content', content);
        }
        if (href === null) {
          node.removeAttribute('href');
        } else {
          node.setAttribute('href', href);
        }
      });
      if (schemaNode) {
        schemaNode.remove();
      }
    };
  }, [canonicalPath, description, ogType, schema, title]);
};

export default useSeoMetadata;
