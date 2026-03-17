import { useEffect } from 'react';

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

const buildAbsoluteUrl = (canonicalPath = '/') => {
  if (typeof window === 'undefined') return canonicalPath;
  return new URL(canonicalPath, window.location.origin).toString();
};

const useSeoMetadata = ({
  title,
  description,
  canonicalPath = '/',
  schema = null
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
    const twitterCardMeta = ensureNamedMeta('twitter:card');
    const twitterTitleMeta = ensureNamedMeta('twitter:title');
    const twitterDescriptionMeta = ensureNamedMeta('twitter:description');
    const canonicalLink = ensureCanonicalLink();

    const managedNodes = [
      descriptionMeta,
      ogTitleMeta,
      ogDescriptionMeta,
      ogTypeMeta,
      ogUrlMeta,
      ogSiteNameMeta,
      twitterCardMeta,
      twitterTitleMeta,
      twitterDescriptionMeta,
      canonicalLink
    ];

    const snapshots = managedNodes.map(({ node, created }) => ({
      node,
      created,
      content: node.getAttribute('content'),
      href: node.getAttribute('href')
    }));

    const canonicalUrl = buildAbsoluteUrl(canonicalPath);

    descriptionMeta.node.setAttribute('content', description);
    ogTitleMeta.node.setAttribute('content', title);
    ogDescriptionMeta.node.setAttribute('content', description);
    ogTypeMeta.node.setAttribute('content', 'article');
    ogUrlMeta.node.setAttribute('content', canonicalUrl);
    ogSiteNameMeta.node.setAttribute('content', 'Note Taker');
    twitterCardMeta.node.setAttribute('content', 'summary');
    twitterTitleMeta.node.setAttribute('content', title);
    twitterDescriptionMeta.node.setAttribute('content', description);
    canonicalLink.node.setAttribute('href', canonicalUrl);

    let schemaNode = null;
    if (schema) {
      schemaNode = document.getElementById('seo-faq-schema');
      if (!schemaNode) {
        schemaNode = document.createElement('script');
        schemaNode.type = 'application/ld+json';
        schemaNode.id = 'seo-faq-schema';
        document.head.appendChild(schemaNode);
      }
      schemaNode.textContent = JSON.stringify(schema);
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
  }, [canonicalPath, description, schema, title]);
};

export default useSeoMetadata;
