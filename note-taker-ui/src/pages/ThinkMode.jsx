import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, SectionHeader, QuietButton, Button, TagChip } from '../components/ui';
import WorkspaceShell from '../layouts/WorkspaceShell';
import useConcepts from '../hooks/useConcepts';
import useConcept from '../hooks/useConcept';
import useConceptRelated from '../hooks/useConceptRelated';
import useConceptReferences from '../hooks/useConceptReferences';
import { updateConcept } from '../api/concepts';
import NotebookView from '../components/think/notebook/NotebookView';
import NotebookContext from '../components/think/notebook/NotebookContext';
import useQuestions from '../hooks/useQuestions';
import { createQuestion, updateQuestion } from '../api/questions';
import QuestionInput from '../components/think/questions/QuestionInput';
import QuestionList from '../components/think/questions/QuestionList';
import AllQuestionsView from '../components/think/questions/AllQuestionsView';
import HighlightBlock from '../components/blocks/HighlightBlock';

const ThinkMode = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view') || '';
  const queryConcept = searchParams.get('concept') || '';
  const allowedViews = ['notebook', 'concepts', 'questions'];
  const activeView = allowedViews.includes(viewParam)
    ? viewParam
    : (searchParams.get('entryId') ? 'notebook' : 'concepts');
  const [search, setSearch] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const [conceptError, setConceptError] = useState('');
  const [highlightOffset, setHighlightOffset] = useState(0);
  const [recentHighlights, setRecentHighlights] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeNotebookEntry, setActiveNotebookEntry] = useState(null);

  const { concepts, loading: conceptsLoading, error: conceptsError } = useConcepts();
  const selectedName = queryConcept || concepts[0]?.name || '';
  const { concept, loading: conceptLoading, error: conceptLoadError, refresh, setConcept } = useConcept(selectedName, {
    enabled: activeView === 'concepts' && Boolean(selectedName)
  });
  const { related, loading: relatedLoading, error: relatedError } = useConceptRelated(selectedName, {
    enabled: activeView === 'concepts' && Boolean(selectedName),
    limit: 20,
    offset: highlightOffset
  });
  const { references, loading: refLoading, error: refError } = useConceptReferences(selectedName, {
    enabled: activeView === 'concepts' && Boolean(selectedName)
  });
  const {
    questions: conceptQuestions,
    loading: questionsLoading,
    error: questionsError,
    setQuestions: setConceptQuestions
  } = useQuestions({
    conceptName: selectedName,
    status: 'open',
    enabled: activeView === 'concepts' && Boolean(selectedName)
  });
  const {
    questions: allQuestions,
    loading: allQuestionsLoading,
    error: allQuestionsError,
    setQuestions: setAllQuestions
  } = useQuestions({
    status: 'open',
    enabled: activeView === 'questions'
  });

  const filteredConcepts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return concepts;
    return concepts.filter(c => c.name.toLowerCase().includes(q));
  }, [concepts, search]);

  const pinnedHighlightIds = concept?.pinnedHighlightIds || [];
  const pinnedHighlights = concept?.pinnedHighlights || [];
  const pinnedNotes = concept?.pinnedNotes || [];

  React.useEffect(() => {
    setDescriptionDraft(concept?.description || '');
  }, [concept?.description]);

  React.useEffect(() => {
    setHighlightOffset(0);
    setRecentHighlights([]);
  }, [selectedName]);

  React.useEffect(() => {
    if (!related?.highlights) return;
    setRecentHighlights(prev => {
      const map = new Map(prev.map(h => [String(h._id), h]));
      related.highlights.forEach(h => {
        map.set(String(h._id), h);
      });
      return Array.from(map.values());
    });
  }, [related]);

  const handleSelectConcept = (name) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', 'concepts');
    params.set('concept', name);
    setSearchParams(params);
  };

  const handleSelectView = (view) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', view);
    setSearchParams(params);
  };

  const handleSaveDescription = async () => {
    if (!concept) return;
    setSavingDescription(true);
    setConceptError('');
    try {
      const updated = await updateConcept(concept.name, {
        description: descriptionDraft,
        pinnedHighlightIds,
        pinnedNoteIds: concept.pinnedNoteIds || []
      });
      setConcept({ ...concept, description: updated.description || '' });
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to save description.');
    } finally {
      setSavingDescription(false);
    }
  };

  const togglePinHighlight = async (highlightId) => {
    if (!concept) return;
    const exists = pinnedHighlightIds.some(id => String(id) === String(highlightId));
    const nextIds = exists
      ? pinnedHighlightIds.filter(id => String(id) !== String(highlightId))
      : [...pinnedHighlightIds, highlightId];
    try {
      const updated = await updateConcept(concept.name, {
        description: concept.description || '',
        pinnedHighlightIds: nextIds,
        pinnedNoteIds: concept.pinnedNoteIds || []
      });
      setConcept({ ...concept, pinnedHighlightIds: updated.pinnedHighlightIds || nextIds });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update pins.');
    }
  };

  const togglePinNote = async (noteId) => {
    if (!concept) return;
    const current = concept.pinnedNoteIds || [];
    const exists = current.some(id => String(id) === String(noteId));
    const nextIds = exists
      ? current.filter(id => String(id) !== String(noteId))
      : [...current, noteId];
    try {
      const updated = await updateConcept(concept.name, {
        description: concept.description || '',
        pinnedHighlightIds,
        pinnedNoteIds: nextIds
      });
      setConcept({ ...concept, pinnedNoteIds: updated.pinnedNoteIds || nextIds });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update pins.');
    }
  };

  const loadMoreHighlights = async () => {
    setLoadingMore(true);
    setHighlightOffset(prev => prev + 20);
    setLoadingMore(false);
  };

  const handleAddQuestion = async (text) => {
    if (!selectedName) return;
    try {
      const created = await createQuestion({ text, conceptName: selectedName });
      setConceptQuestions(prev => [created, ...prev]);
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to add question.');
    }
  };

  const handleMarkAnswered = async (question) => {
    try {
      await updateQuestion(question._id, { status: 'answered' });
      setConceptQuestions(prev => prev.filter(item => item._id !== question._id));
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update question.');
    }
  };

  const handleMarkAnsweredGlobal = async (question) => {
    try {
      await updateQuestion(question._id, { status: 'answered' });
      setAllQuestions(prev => prev.filter(item => item._id !== question._id));
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update question.');
    }
  };

  const leftPanel = (
    <div className="section-stack">
      <SectionHeader title="Think" subtitle="Choose your space." />
      <div className="think-tabs">
        <QuietButton
          className={activeView === 'notebook' ? 'is-active' : ''}
          onClick={() => handleSelectView('notebook')}
        >
          Notebook
        </QuietButton>
        <QuietButton
          className={activeView === 'concepts' ? 'is-active' : ''}
          onClick={() => handleSelectView('concepts')}
        >
          Concepts
        </QuietButton>
        <QuietButton
          className={activeView === 'questions' ? 'is-active' : ''}
          onClick={() => handleSelectView('questions')}
        >
          Questions
        </QuietButton>
      </div>
      {activeView === 'concepts' && (
        <>
          <SectionHeader title="Concepts" subtitle="Structured pages." />
          <label className="feedback-field" style={{ margin: 0 }}>
            <span>Search</span>
            <input
              type="text"
              value={search}
              placeholder="Find a concept"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {conceptsLoading && <p className="muted small">Loading concepts…</p>}
          {conceptsError && <p className="status-message error-message">{conceptsError}</p>}
          <div className="concept-list">
            {filteredConcepts.map(conceptItem => (
              <QuietButton
                key={conceptItem.name}
                className={conceptItem.name === selectedName ? 'is-active' : ''}
                onClick={() => handleSelectConcept(conceptItem.name)}
              >
                <span>{conceptItem.name}</span>
                {typeof conceptItem.count === 'number' && (
                  <span className="concept-count">{conceptItem.count}</span>
                )}
              </QuietButton>
            ))}
            {!conceptsLoading && filteredConcepts.length === 0 && (
              <p className="muted small">No concepts found.</p>
            )}
          </div>
        </>
      )}
    </div>
  );

  const mainPanel = activeView === 'notebook' ? (
    <NotebookView onActiveEntryChange={setActiveNotebookEntry} />
  ) : activeView === 'questions' ? (
    <AllQuestionsView
      questions={allQuestions}
      loading={allQuestionsLoading}
      error={allQuestionsError}
      onMarkAnswered={handleMarkAnsweredGlobal}
    />
  ) : (
    <div className="section-stack">
      {conceptLoadError && <p className="status-message error-message">{conceptLoadError}</p>}
      {conceptError && <p className="status-message error-message">{conceptError}</p>}
      {relatedError && <p className="status-message error-message">{relatedError}</p>}
      {conceptLoading && <p className="muted small">Loading concept…</p>}
      {!conceptLoading && concept && (
        <>
          <div className="concept-header">
            <h1>{concept.name}</h1>
          </div>
          <SectionHeader title="Definition" subtitle="Write the summary in your own words." />
          <textarea
            className="concept-description"
            rows={4}
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
            placeholder="What is this concept? Why does it matter?"
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleSaveDescription} disabled={savingDescription}>
              {savingDescription ? 'Saving…' : 'Save summary'}
            </Button>
          </div>

          <SectionHeader title="Pinned Highlights" subtitle="Anchor ideas." />
          {pinnedHighlights.length === 0 && <p className="muted small">No pinned highlights yet.</p>}
          <div className="concept-highlight-grid">
            {pinnedHighlights.map(h => (
              <div key={h._id} className="concept-highlight-card">
                <HighlightBlock
                  highlight={h}
                  compact
                  onRemove={() => togglePinHighlight(h._id)}
                />
              </div>
            ))}
          </div>

          <SectionHeader title="Recent Highlights" subtitle="Newest signals." />
          <div className="concept-highlight-grid">
            {recentHighlights.map(h => (
              <div key={h._id} className="concept-highlight-card">
                <HighlightBlock
                  highlight={h}
                  compact
                  onRemove={() => togglePinHighlight(h._id)}
                />
              </div>
            ))}
            {!relatedLoading && recentHighlights.length === 0 && (
              <p className="muted small">No highlights yet for this concept.</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={loadMoreHighlights} disabled={loadingMore || relatedLoading}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>

          <SectionHeader title="Notes referencing this concept" subtitle="Embedded fragments." />
          {related.notes.length === 0 && !relatedLoading && (
            <p className="muted small">No linked notes yet.</p>
          )}
          <div className="concept-note-grid">
            {related.notes.map((note, idx) => (
              <div key={`${note.notebookEntryId}-${idx}`} className="concept-note-card">
                <div className="concept-note-title">{note.notebookTitle || 'Untitled note'}</div>
                <p className="muted small">{note.blockPreviewText || 'No preview available.'}</p>
                <div className="concept-note-actions">
                  <QuietButton onClick={() => togglePinNote(note.notebookEntryId)}>
                    {(concept.pinnedNoteIds || []).some(id => String(id) === String(note.notebookEntryId))
                      ? 'Unpin'
                      : 'Pin'}
                  </QuietButton>
                  <Link to={`/notebook?entryId=${note.notebookEntryId}`} className="muted small">Open note</Link>
                </div>
              </div>
            ))}
            {pinnedNotes.map(note => (
              <div key={note._id} className="concept-note-card pinned">
                <div className="concept-note-title">{note.title || 'Untitled note'}</div>
                <p className="muted small">{(note.content || '').slice(0, 120)}{(note.content || '').length > 120 ? '…' : ''}</p>
                <div className="concept-note-actions">
                  <QuietButton onClick={() => togglePinNote(note._id)}>Unpin</QuietButton>
                  <Link to={`/notebook?entryId=${note._id}`} className="muted small">Open note</Link>
                </div>
              </div>
            ))}
          </div>

          <SectionHeader title="Source articles" subtitle="Where the highlights live." />
          {related.articles.length === 0 && !relatedLoading && (
            <p className="muted small">No source articles yet.</p>
          )}
          <div className="concept-source-list">
            {related.articles.map(article => (
              <div key={article._id} className="concept-source-row">
                <div>
                  <div className="concept-source-title">{article.title || 'Untitled article'}</div>
                  <p className="muted small">{article.highlightCount} highlights</p>
                </div>
                <Link to={`/articles/${article._id}`} className="muted small">Open</Link>
              </div>
            ))}
          </div>
          <SectionHeader title="Questions" subtitle="Open loops tied to this concept." />
          {questionsError && <p className="status-message error-message">{questionsError}</p>}
          {questionsLoading && <p className="muted small">Loading questions…</p>}
          {!questionsLoading && (
            <>
              <QuestionInput onSubmit={handleAddQuestion} />
              <QuestionList questions={conceptQuestions} onMarkAnswered={handleMarkAnswered} />
            </>
          )}
        </>
      )}
    </div>
  );

  const rightPanel = activeView === 'notebook' ? (
    <NotebookContext entry={activeNotebookEntry} />
  ) : activeView === 'questions' ? (
    <div className="section-stack">
      <SectionHeader title="Context" subtitle="Open loops." />
      <p className="muted small">Questions will surface related concepts here.</p>
    </div>
  ) : (
    <div className="section-stack">
      <SectionHeader title="Related concepts" subtitle="Neighbors and cousins." />
      {concept?.relatedTags?.length > 0 ? (
        <div className="concept-related-tags">
          {concept.relatedTags.slice(0, 8).map(tag => (
            <TagChip key={tag.tag} to={`/think?concept=${encodeURIComponent(tag.tag)}`}>
              {tag.tag}
            </TagChip>
          ))}
        </div>
      ) : (
        <p className="muted small">No related concepts yet.</p>
      )}
      <SectionHeader title="Tag correlations" subtitle="Co-occuring themes." />
      {concept?.relatedTags?.length > 0 ? (
        <div className="concept-related-tags">
          {concept.relatedTags.slice(0, 8).map(tag => (
            <TagChip key={`corr-${tag.tag}`} to={`/think?concept=${encodeURIComponent(tag.tag)}`}>
              {tag.tag}
            </TagChip>
          ))}
        </div>
      ) : (
        <p className="muted small">No correlations yet.</p>
      )}
      <SectionHeader title="Used in" subtitle="References and collections." />
      {refLoading && <p className="muted small">Loading references…</p>}
      {refError && <p className="status-message error-message">{refError}</p>}
      {!refLoading && !refError && (
        <div className="concept-used-list">
          {references.notebookBlocks.length === 0 ? (
            <p className="muted small">No references yet.</p>
          ) : (
            references.notebookBlocks.slice(0, 6).map((block, idx) => (
              <Link
                key={`${block.notebookEntryId}-${block.blockId}-${idx}`}
                to={`/notebook?entryId=${block.notebookEntryId}`}
                className="concept-used-link"
              >
                {block.notebookTitle || 'Untitled note'}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <Page>
      <WorkspaceShell
        title="Think"
        subtitle="Concepts as structured pages you can return to."
        eyebrow="Mode"
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle="Context"
        defaultRightOpen
      />
    </Page>
  );
};

export default ThinkMode;
