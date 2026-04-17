import React, { useMemo } from 'react';
import { SectionHeader, TagChip } from '../../ui';
import ReferencesPanel from '../../ReferencesPanel';

const NotebookContext = ({ entry }) => {
  const conceptSource = useMemo(() => {
    const sourceType = String(entry?.importMeta?.sourceType || '').trim().toLowerCase();
    if (sourceType !== 'concept') return null;
    const sourceLabel = String(entry?.importMeta?.sourceLabel || '').trim() || 'Source concept';
    const sourceUrl = String(entry?.importMeta?.sourceUrl || '').trim()
      || `/think?tab=concepts&concept=${encodeURIComponent(sourceLabel)}`;
    const draftTemplateLabel = String(entry?.importMeta?.draftTemplateLabel || '').trim();
    const importedAt = entry?.importMeta?.importedAt ? new Date(entry.importMeta.importedAt) : null;
    return {
      label: sourceLabel,
      href: sourceUrl,
      draftTemplateLabel,
      importedAt: importedAt && !Number.isNaN(importedAt.getTime())
        ? importedAt.toLocaleDateString()
        : ''
    };
  }, [entry]);
  const highlightRefs = useMemo(() => {
    if (!entry?.blocks) return [];
    return entry.blocks.filter(block => (
      block.type === 'highlight-ref' || block.type === 'highlight_embed'
    )).slice(0, 6);
  }, [entry]);

  return (
    <>
      <section className="editorial-side-rail__section notebook-context__section">
        <SectionHeader title="Notebook source" subtitle="Where this draft started." />
        {conceptSource ? (
          <div className="notebook-context__source">
            <span className="notebook-context__source-kicker">
              {conceptSource.draftTemplateLabel
                ? `Concept handoff · ${conceptSource.draftTemplateLabel}`
                : 'Concept handoff'}
            </span>
            <a className="notebook-context__source-link" href={conceptSource.href}>
              Continue from {conceptSource.label}
            </a>
            <p className="muted small">
              {conceptSource.draftTemplateLabel
                ? `${conceptSource.draftTemplateLabel} spun out from the concept. `
                : ''}
              Bring the draft forward here, then return to the concept when the underlying idea changes.
              {conceptSource.importedAt ? ` Started from the concept on ${conceptSource.importedAt}.` : ''}
            </p>
          </div>
        ) : (
          <p className="muted small">This page was started directly in notebook.</p>
        )}
      </section>

      <section className="editorial-side-rail__section notebook-context__section">
        <SectionHeader title="Notebook context" subtitle="Referenced concepts on this page." />
        {entry?.tags?.length ? (
          <div className="concept-related-tags notebook-context__tags">
            {entry.tags.map(tag => (
              <TagChip key={tag} to={`/think?tab=concepts&concept=${encodeURIComponent(tag)}`}>
                {tag}
              </TagChip>
            ))}
          </div>
        ) : (
          <p className="muted small">No concepts linked yet.</p>
        )}
      </section>

      <section className="editorial-side-rail__section notebook-context__section">
        <SectionHeader title="Embedded highlights" subtitle="Fragments already in use." />
        {highlightRefs.length ? (
          <div className="related-embed-list notebook-context__highlights">
            {highlightRefs.map(ref => (
              <div key={ref.id || ref.highlightId} className="related-embed-row notebook-context__highlight-row">
                <div>
                  <div className="related-embed-title">
                    {(ref.text || 'Highlight reference').slice(0, 88)}
                  </div>
                  <div className="muted small">
                    {entry?.tags?.length ? entry.tags.join(' · ') : 'Notebook fragment'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">No highlight links yet.</p>
        )}
      </section>

      <section className="editorial-side-rail__section notebook-context__section">
        <SectionHeader title="Used in" subtitle="Where this page echoes." />
        {entry?._id ? (
          <ReferencesPanel targetType="notebook" targetId={entry._id} label="Show backlinks" />
        ) : (
          <p className="muted small">Select a note to see links.</p>
        )}
      </section>
    </>
  );
};

export default NotebookContext;
