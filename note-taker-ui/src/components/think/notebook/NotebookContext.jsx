import React, { useMemo } from 'react';
import { SectionHeader, TagChip } from '../../ui';
import ReferencesPanel from '../../ReferencesPanel';
import HighlightCard from '../../blocks/HighlightCard';

const NotebookContext = ({ entry }) => {
  const highlightRefs = useMemo(() => {
    if (!entry?.blocks) return [];
    return entry.blocks.filter(block => block.type === 'highlight-ref').slice(0, 6);
  }, [entry]);

  return (
    <div className="section-stack">
      <SectionHeader title="Referenced concepts" subtitle="Tags on this note." />
      {entry?.tags?.length ? (
        <div className="concept-related-tags">
          {entry.tags.map(tag => (
            <TagChip key={tag} to={`/think?view=concepts&concept=${encodeURIComponent(tag)}`}>
              {tag}
            </TagChip>
          ))}
        </div>
      ) : (
        <p className="muted small">No tags yet.</p>
      )}

      <SectionHeader title="Recent highlights" subtitle="Linked from this note." />
      {highlightRefs.length ? (
        <div className="concept-note-grid">
          {highlightRefs.map(ref => (
            <HighlightCard
              key={ref.id || ref.highlightId}
              compact
              highlight={{
                id: ref.highlightId || ref.id,
                text: ref.text || 'Highlight reference',
                tags: entry?.tags || []
              }}
            />
          ))}
        </div>
      ) : (
        <p className="muted small">No highlight links yet.</p>
      )}

      <SectionHeader title="Links" subtitle="Where this note shows up." />
      {entry?._id ? (
        <ReferencesPanel targetType="notebook" targetId={entry._id} label="Links in this note" />
      ) : (
        <p className="muted small">Select a note to see links.</p>
      )}
    </div>
  );
};

export default NotebookContext;
