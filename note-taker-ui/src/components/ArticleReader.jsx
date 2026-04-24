import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { QuietButton } from './ui';
import { createHighlight } from '../api/highlights';
import useTextSelection from './reader/useTextSelection';
import SelectionMenu from './reader/SelectionMenu';
import MagneticReadingRail from './reader/MagneticReadingRail';
import { DEFAULT_HIGHLIGHT_COLOR } from '../constants/highlightColors';
import { renderArticleContentWithHighlights } from '../utils/highlightMarkup';
import ThoughtPartnerPanel from './agent/ThoughtPartnerPanel';
import AgentSkillDock from './agent/AgentSkillDock';
import { buildArticleAmbientContext } from '../utils/ambientAgentContext';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const parseTags = (value) => {
  const seen = new Set();
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag) return false;
      const normalized = tag.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
};

const ArticleReader = forwardRef(({
  article,
  highlights = [],
  onMove,
  onHighlightOptimistic,
  onHighlightReplace,
  onHighlightRemove,
  onOpenConcept,
  onOpenNotebook,
  onOpenQuestion,
  onDumpToWorkingMemory
}, ref) => {
  const contentRef = useRef(null);
  const readerRootRef = useRef(null);
  const menuRef = useRef(null);
  const [saveError, setSaveError] = useState('');
  const [draftColor, setDraftColor] = useState(DEFAULT_HIGHLIGHT_COLOR);
  const [draftTagsInput, setDraftTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [queuedPrompt, setQueuedPrompt] = useState(null);
  const html = useMemo(
    () => renderArticleContentWithHighlights(article, highlights),
    [article, highlights]
  );
  const contentMarkup = useMemo(() => ({ __html: html }), [html]);
  const { selectionState, clearSelection } = useTextSelection({
    containerRef: contentRef,
    menuRef
  });
  const articleContextMetadata = useMemo(() => (
    buildArticleAmbientContext({
      article,
      selectionText: selectionState.text || ''
    })
  ), [article, selectionState.text]);
  const selectionKey = `${selectionState.text || ''}:${selectionState.anchor?.startOffsetApprox ?? ''}`;

  useEffect(() => {
    if (!selectionState.isOpen) return;
    setDraftColor(DEFAULT_HIGHLIGHT_COLOR);
    setDraftTagsInput('');
    setSaveError('');
  }, [selectionKey, selectionState.isOpen]);

  useImperativeHandle(ref, () => ({
    scrollToHighlight: (highlightId) => {
      if (!contentRef.current) return;
      const target = contentRef.current.querySelector(`[data-highlight-id="highlight-${highlightId}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }));

  if (!article) {
    return (
      <div className="article-reader-empty">
        <p className="muted">Select an article to start reading.</p>
      </div>
    );
  }

  const persistHighlight = async (afterSave) => {
    if (!article || !selectionState.text) return;
    const highlightText = selectionState.text;
    const highlightAnchor = selectionState.anchor;
    const draftTags = parseTags(draftTagsInput);
    setSaveError('');
    setSaving(true);
    const tempId = `temp-${Date.now()}`;
    const optimisticHighlight = {
      _id: tempId,
      text: highlightText,
      tags: draftTags,
      color: draftColor,
      articleId: article._id,
      articleTitle: article.title,
      createdAt: new Date().toISOString(),
      anchor: highlightAnchor
    };
    onHighlightOptimistic?.(optimisticHighlight);
    clearSelection();
    try {
      const created = await createHighlight({
        articleId: article._id,
        text: highlightText,
        tags: draftTags,
        anchor: highlightAnchor,
        color: draftColor
      });
      if (created?._id) {
        const normalizedCreated = {
          ...optimisticHighlight,
          ...created,
          _id: created._id
        };
        onHighlightReplace?.(tempId, normalizedCreated);
        afterSave?.(normalizedCreated);
      } else {
        onHighlightRemove?.(tempId);
      }
    } catch (err) {
      onHighlightRemove?.(tempId);
      setSaveError(err.response?.data?.error || 'Failed to save highlight.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateHighlight = async () => {
    await persistHighlight();
  };

  const handleSaveAndOpen = async (callback, fallbackError) => {
    if (!callback) {
      setSaveError(fallbackError);
      return;
    }
    await persistHighlight(callback);
  };

  return (
    <div className="article-reader" ref={readerRootRef}>
      {selectionState.isOpen && (
        <SelectionMenu
          ref={menuRef}
          rect={selectionState.rect}
          color={draftColor}
          tagInput={draftTagsInput}
          saving={saving}
          onColorChange={setDraftColor}
          onTagInputChange={setDraftTagsInput}
          onHighlight={handleCreateHighlight}
          onAddNotebook={() => handleSaveAndOpen(onOpenNotebook, 'Add to Notebook is unavailable here.')}
          onAddConcept={() => handleSaveAndOpen(onOpenConcept, 'Add to Concept is unavailable here.')}
          onAddQuestion={() => handleSaveAndOpen(onOpenQuestion, 'Add to Question is unavailable here.')}
          onAddDump={() => handleSaveAndOpen(onDumpToWorkingMemory, 'Dump is unavailable here.')}
        />
      )}
      <div className="article-reader-header">
        <div>
          <div className="article-reader-title">{article.title || 'Untitled article'}</div>
          <div className="article-reader-meta">
            {article.createdAt && <span>{formatDate(article.createdAt)}</span>}
            {article.url && (
              <a href={article.url} target="_blank" rel="noopener noreferrer">Open source</a>
            )}
          </div>
        </div>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          {onMove && (
            <QuietButton onClick={onMove}>
              Move
            </QuietButton>
          )}
        </div>
      </div>
      <div className="article-reader-agent-band">
        <AgentSkillDock
          surface={selectionState.text ? 'selection' : 'article'}
          contextType={selectionState.text ? 'selection' : 'article'}
          contextId={article?._id}
          targetContextType="article"
          targetContextId={article?._id}
          contextTitle={article?.title || 'Article'}
          headline={selectionState.text ? 'Selection moves' : 'Draft-first article moves'}
          selectionText={selectionState.text || ''}
          title={selectionState.text ? 'Selection agent' : 'Article agent'}
          subtitle={selectionState.text
            ? 'Run a concrete move against the selected passage.'
            : 'Turn the current article into a sharper summary, critique, question set, or concept lead.'}
          className="article-reader-agent-band__skills agent-skill-dock--inline"
          onInvoke={(nextPrompt) => setQueuedPrompt(nextPrompt)}
        />
        <ThoughtPartnerPanel
          className="article-reader-agent-band__partner"
          variant="stream"
          title="Reading partner"
          subtitle={selectionState.text
            ? 'Working against the current selection.'
            : 'Ask against the full article and your connected workspace.'}
          contextType="article"
          contextId={article?._id || ''}
          contextTitle={article?.title || 'Article'}
          contextMetadata={articleContextMetadata}
          placeholder={selectionState.text
            ? 'Ask about the selected passage, or run one of the moves above.'
            : 'Ask about this article, connected notes, or what to do next.'}
          queuedPrompt={queuedPrompt}
          promptTemplates={[
            'Summarize what matters most in this article.',
            'Challenge the strongest claim in this article.',
            'Find related concepts or notes for this article.'
          ]}
          emptyStateText="Use the dock to trigger a concrete move, or ask directly."
          submitLabel="↗"
        />
      </div>
      <div className="article-reader-content reader" ref={contentRef} dangerouslySetInnerHTML={contentMarkup} />
      <MagneticReadingRail rootRef={readerRootRef} contentRef={contentRef} />
      {saveError && <p className="status-message error-message">{saveError}</p>}
    </div>
  );
});

export default ArticleReader;
