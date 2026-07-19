import React, { useEffect, useMemo, useState } from 'react';
import renderTiptapDoc from './renderTiptapDoc';
import { repoSectionIdForHeading } from './wikiRepoDossierModel';

const plainHeading = (node) => {
  if (!node?.content) return '';
  return node.content.map(child => child?.text || '').join('').trim();
};

const splitDocIntoSections = (doc) => {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) {
    return [{ id: 'body', title: '', blocks: [], blockIndexes: [], canonicalId: 'overview', openByDefault: true }];
  }

  const sections = [];
  let current = {
    id: 'intro',
    title: '',
    blocks: [],
    blockIndexes: [],
    canonicalId: 'overview',
    openByDefault: true
  };

  doc.content.forEach((node, blockIndex) => {
    if (node?.type === 'heading' && Number(node.attrs?.level || 2) <= 3) {
      if (current.blocks.length) sections.push(current);
      const title = plainHeading(node);
      const canonicalId = repoSectionIdForHeading(title) || `section-${sections.length + 1}`;
      current = {
        id: `section-${blockIndex}`,
        title,
        blocks: [node],
        blockIndexes: [blockIndex],
        canonicalId,
        anchorId: node.attrs?.id || node.attrs?.anchorId || '',
        openByDefault: canonicalId === 'overview'
      };
      return;
    }
    current.blocks.push(node);
    current.blockIndexes.push(blockIndex);
  });

  if (current.blocks.length) sections.push(current);
  return sections.length
    ? sections
    : [{ id: 'body', title: '', blocks: doc.content, blockIndexes: doc.content.map((_, index) => index), canonicalId: 'overview', openByDefault: true }];
};

const WikiRepoDossierBody = ({
  doc,
  tocItems = [],
  collapseSections = false,
  expandAllSectionsByDefault = false,
  recentAnchorIds,
  wikiLinkPages,
  disableInternalWikiLinks = false
}) => {
  const sections = useMemo(() => splitDocIntoSections(doc), [doc]);
  const [openSectionIds, setOpenSectionIds] = useState(() => new Set(
    sections
      .filter(section => expandAllSectionsByDefault || section.openByDefault)
      .map(section => section.id)
  ));

  useEffect(() => {
    setOpenSectionIds(new Set(
      sections
        .filter(section => expandAllSectionsByDefault || section.openByDefault)
        .map(section => section.id)
    ));
  }, [expandAllSectionsByDefault, sections]);

  if (!collapseSections) {
    return (
      <div className="wiki-read__repo-dossier-body">
        {renderTiptapDoc(doc, { tocItems, recentAnchorIds, wikiLinkPages, disableInternalWikiLinks })}
      </div>
    );
  }

  return (
    <div className="wiki-read__repo-dossier-body wiki-read__repo-dossier-body--collapsible">
      {sections.map((section) => {
        const contentBlocks = section.title ? section.blocks.slice(1) : section.blocks;
        const contentBlockIndexes = section.title ? section.blockIndexes.slice(1) : section.blockIndexes;
        const sectionDoc = { type: 'doc', content: contentBlocks };
        const sectionToc = tocItems.filter(item => contentBlockIndexes.includes(item.blockIndex));
        if (!section.title) {
          return (
            <div key={section.id} className="wiki-read__repo-dossier-section is-open">
              {renderTiptapDoc(sectionDoc, { tocItems: sectionToc, recentAnchorIds, wikiLinkPages, disableInternalWikiLinks })}
            </div>
          );
        }
        const isOpen = openSectionIds.has(section.id);
        return (
          <details
            key={section.id}
            id={section.anchorId || undefined}
            className="wiki-read__repo-dossier-section"
            open={isOpen}
            data-repo-section={section.canonicalId}
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setOpenSectionIds(current => {
                const next = new Set(current);
                if (isOpen) next.add(section.id);
                else next.delete(section.id);
                return next;
              });
            }}
          >
            <summary>
              <span className="wiki-read__repo-dossier-section-title">{section.title}</span>
              <span className="wiki-read__repo-dossier-section-disclosure">
                <span className="wiki-read__repo-dossier-section-state">{isOpen ? 'Expanded' : 'Collapsed'}</span>
                <span className="wiki-read__repo-dossier-section-arrow" aria-hidden="true" />
              </span>
            </summary>
            <div className="wiki-read__repo-dossier-section-body">
              {renderTiptapDoc(sectionDoc, { tocItems: sectionToc, recentAnchorIds, wikiLinkPages, disableInternalWikiLinks })}
            </div>
          </details>
        );
      })}
    </div>
  );
};

export default WikiRepoDossierBody;
