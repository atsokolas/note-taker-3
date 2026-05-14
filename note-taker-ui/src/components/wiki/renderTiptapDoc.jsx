import React from 'react';
import { Link } from 'react-router-dom';

/**
 * renderTiptapDoc — minimal read-only renderer that walks a TipTap JSON
 * doc and returns React elements. Recognizes the small subset emitted by
 * the wiki maintenance / ask services: doc, paragraph, heading, bullet
 * list, list item, text, plus the `claim` mark with claimId / support /
 * citationIndexes attributes.
 *
 * Why not @tiptap/html: it's another dependency, and the doc shapes here
 * are tiny and well-known. Keeping the renderer in-tree means the same
 * Claim mark output renders in the editor (via TipTap's renderHTML) and
 * in static contexts (via this walker), with one source of truth for the
 * data attributes the citation popover hover handler reads.
 */

const claimAttrs = (mark) => {
  const attrs = mark?.attrs || {};
  const indexes = Array.isArray(attrs.citationIndexes)
    ? attrs.citationIndexes.filter(value => Number.isFinite(Number(value)))
    : [];
  const contradictionIndexes = Array.isArray(attrs.contradictionIndexes)
    ? attrs.contradictionIndexes.filter(value => Number.isFinite(Number(value)))
    : [];
  return {
    'data-claim-id': attrs.claimId || '',
    'data-support': attrs.support || 'supported',
    'data-citation-indexes': indexes.join(','),
    'data-contradiction-indexes': contradictionIndexes.join(',')
  };
};

const citationText = (indexes = []) => `[${indexes.join(',')}]`;

const plainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (typeof node !== 'object') return '';
  return [node.text || '', plainText(node.content)].join('');
};

const slugifyHeading = (value = '') => {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
};

export const extractTocItems = (doc) => {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) return [];
  const seen = new Map();
  return doc.content
    .map((node, blockIndex) => {
      if (node?.type !== 'heading') return null;
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level) || 2));
      if (level !== 2 && level !== 3) return null;
      const title = plainText(node.content).trim();
      if (!title) return null;
      const base = slugifyHeading(title);
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return {
        id: count ? `${base}-${count + 1}` : base,
        title,
        level,
        blockIndex
      };
    })
    .filter(Boolean);
};

export const firstParagraphText = (doc) => {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) return '';
  const paragraph = doc.content.find(node => node?.type === 'paragraph' && plainText(node.content).trim());
  return paragraph ? plainText(paragraph.content).replace(/\s+/g, ' ').trim() : '';
};

const renderTextNode = (node, key) => {
  const text = node?.text || '';
  if (!text) return null;
  const wikiLinkMark = Array.isArray(node.marks)
    ? node.marks.find(mark => mark?.type === 'wikiLink')
    : null;
  const wikiLinkedText = wikiLinkMark?.attrs?.pageId ? (
    <Link
      key={`${key}-wiki-link`}
      className="wiki-internal-link"
      to={`/wiki/${wikiLinkMark.attrs.pageId}`}
      data-wiki-page-id={wikiLinkMark.attrs.pageId}
      data-wiki-title={wikiLinkMark.attrs.title || ''}
    >
      {text}
    </Link>
  ) : text;
  const claimMark = Array.isArray(node.marks)
    ? node.marks.find(mark => mark?.type === 'claim')
    : null;
  if (claimMark) {
    const attrs = claimAttrs(claimMark);
    const indexes = attrs['data-citation-indexes'];
    const contradictionIndexes = attrs['data-contradiction-indexes'];
    const visibleIndexes = indexes || contradictionIndexes;
    return (
      <React.Fragment key={key}>
        <span className="wiki-claim" {...attrs}>
          {wikiLinkedText}
        </span>
        {visibleIndexes ? (
          <button
            type="button"
            className="wiki-claim-citation"
            data-claim-id={attrs['data-claim-id']}
            data-support={attrs['data-support']}
            data-citation-indexes={indexes}
            data-contradiction-indexes={contradictionIndexes}
            aria-label={`Backlink to source${visibleIndexes.includes(',') ? 's' : ''} ${visibleIndexes.split(',').join(', ')}`}
          >
            {citationText(visibleIndexes.split(','))}
          </button>
        ) : null}
      </React.Fragment>
    );
  }
  return <React.Fragment key={key}>{wikiLinkedText}</React.Fragment>;
};

const renderInline = (content = []) => content
  .map((child, index) => {
    if (!child) return null;
    if (child.type === 'text') return renderTextNode(child, index);
    return null;
  })
  .filter(Boolean);

const renderBlock = (node, key, options = {}) => {
  if (!node || typeof node !== 'object') return null;
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{renderInline(node.content)}</p>;
    case 'heading': {
      const level = Math.max(1, Math.min(6, node.attrs?.level || 2));
      const HeadingTag = `h${level}`;
      const tocItem = options.tocByBlockIndex?.get?.(key);
      return <HeadingTag key={key} id={tocItem?.id}>{renderInline(node.content)}</HeadingTag>;
    }
    case 'bulletList':
      return (
        <ul key={key}>
          {(node.content || []).map((item, index) => renderBlock(item, index, options))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key}>
          {(node.content || []).map((item, index) => renderBlock(item, index, options))}
        </ol>
      );
    case 'listItem':
      return (
        <li key={key}>
          {(node.content || []).map((child, index) => renderBlock(child, index, options))}
        </li>
      );
    default:
      return null;
  }
};

const renderTiptapDoc = (doc, options = {}) => {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) return null;
  const tocItems = Array.isArray(options.tocItems) ? options.tocItems : [];
  const tocByBlockIndex = new Map(tocItems.map(item => [item.blockIndex, item]));
  return doc.content.map((block, index) => renderBlock(block, index, { ...options, tocByBlockIndex })).filter(Boolean);
};

export default renderTiptapDoc;
