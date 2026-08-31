import React, { useMemo } from 'react';
import { SectionHeader, TagChip } from '../../ui';
import ReferencesPanel from '../../ReferencesPanel';
import { listNotebookHighlightReferences, resolveNotebookSource } from './notebookSourceModel';

const NotebookContext = ({ entry }) => {
  const notebookSource = useMemo(() => resolveNotebookSource(entry), [entry]);
  const highlightRefs = useMemo(() => listNotebookHighlightReferences(entry), [entry]);

  return (
    <>
      <section className="editorial-side-rail__section notebook-context__section">
        <SectionHeader title="Notebook source" subtitle="Where this draft started." />
        {notebookSource?.kind === 'library' ? (
          <div className="notebook-context__source notebook-context__source--library">
            <span className="notebook-context__source-kicker">{notebookSource.eyebrow}</span>
            <a className="notebook-context__source-link" href={notebookSource.href}>
              Return to {notebookSource.label}
            </a>
            <p className="muted small">
              This thread returns to the exact saved passage that entered the page.
            </p>
          </div>
        ) : notebookSource?.kind === 'concept' ? (
          <div className="notebook-context__source">
            <span className="notebook-context__source-kicker">
              {notebookSource.draftTemplateLabel
                ? `Concept handoff · ${notebookSource.draftTemplateLabel}`
                : 'Concept handoff'}
            </span>
            <a className="notebook-context__source-link" href={notebookSource.href}>
              Continue from {notebookSource.label}
            </a>
            <p className="muted small">
              {notebookSource.draftTemplateLabel
                ? `${notebookSource.draftTemplateLabel} spun out from the concept. `
                : ''}
              Bring the draft forward here, then return to the concept when the underlying idea changes.
              {notebookSource.importedAt ? ` Started from the concept on ${notebookSource.importedAt}.` : ''}
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
          <ReferencesPanel
            targetType="notebook"
            targetId={entry._id}
            label="Show backlinks"
            defaultOpen
            showToggle={false}
          />
        ) : (
          <p className="muted small">Select a note to see links.</p>
        )}
      </section>
    </>
  );
};

export default NotebookContext;
