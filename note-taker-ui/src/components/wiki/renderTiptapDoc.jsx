import React from 'react';

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
  return {
    'data-claim-id': attrs.claimId || '',
    'data-support': attrs.support || 'supported',
    'data-citation-indexes': indexes.join(',')
  };
};

const renderTextNode = (node, key) => {
  const text = node?.text || '';
  if (!text) return null;
  const claimMark = Array.isArray(node.marks)
    ? node.marks.find(mark => mark?.type === 'claim')
    : null;
  if (claimMark) {
    return (
      <span key={key} className="wiki-claim" {...claimAttrs(claimMark)}>
        {text}
      </span>
    );
  }
  return <React.Fragment key={key}>{text}</React.Fragment>;
};

const renderInline = (content = []) => content
  .map((child, index) => {
    if (!child) return null;
    if (child.type === 'text') return renderTextNode(child, index);
    return null;
  })
  .filter(Boolean);

const renderBlock = (node, key) => {
  if (!node || typeof node !== 'object') return null;
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{renderInline(node.content)}</p>;
    case 'heading': {
      const level = Math.max(1, Math.min(6, node.attrs?.level || 2));
      const HeadingTag = `h${level}`;
      return <HeadingTag key={key}>{renderInline(node.content)}</HeadingTag>;
    }
    case 'bulletList':
      return (
        <ul key={key}>
          {(node.content || []).map((item, index) => renderBlock(item, index))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key}>
          {(node.content || []).map((item, index) => renderBlock(item, index))}
        </ol>
      );
    case 'listItem':
      return (
        <li key={key}>
          {(node.content || []).map((child, index) => renderBlock(child, index))}
        </li>
      );
    default:
      return null;
  }
};

const renderTiptapDoc = (doc) => {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) return null;
  return doc.content.map((block, index) => renderBlock(block, index)).filter(Boolean);
};

export default renderTiptapDoc;
