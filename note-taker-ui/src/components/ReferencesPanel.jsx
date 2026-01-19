import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Button } from './ui';

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const endpointFor = ({ targetType, targetId, tagName }) => {
  if (targetType === 'highlight') return `/api/highlights/${targetId}/backlinks`;
  if (targetType === 'article') return `/api/articles/${targetId}/backlinks`;
  if (targetType === 'concept') return `/api/concepts/${encodeURIComponent(tagName || '')}/backlinks`;
  if (targetType === 'question') return `/api/questions/${targetId}/backlinks`;
  if (targetType === 'notebook') return `/api/references/for-notebook/${targetId}`;
  return null;
};

const ReferencesPanel = ({ targetType, targetId, tagName, label = 'Used in' }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    const endpoint = endpointFor({ targetType, targetId, tagName });
    if (!endpoint) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(endpoint, getAuthConfig());
      setData(res.data || { notebookBlocks: [], collections: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load references.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!open && !data) {
      load();
    }
    setOpen(prev => !prev);
  };

  const handleBlockClick = (entryId, blockId) => {
    if (!entryId) return;
    const params = new URLSearchParams();
    params.set('entryId', entryId);
    if (blockId) params.set('blockId', blockId);
    params.set('view', 'notebook');
    navigate(`/think?${params.toString()}`);
  };

  const handleConceptClick = (name) => {
    if (!name) return;
    const params = new URLSearchParams();
    params.set('view', 'concepts');
    params.set('concept', name);
    navigate(`/think?${params.toString()}`);
  };

  const handleQuestionClick = (questionId) => {
    if (!questionId) return;
    const params = new URLSearchParams();
    params.set('view', 'questions');
    params.set('questionId', questionId);
    navigate(`/think?${params.toString()}`);
  };

  const renderNotebookBlocks = () => {
    if (!data?.notebookBlocks || data.notebookBlocks.length === 0) {
      return <p className="muted small">No notebook references yet.</p>;
    }
    return (
      <div className="section-stack">
        {data.notebookBlocks.map((block, idx) => (
          <div key={`${block.notebookEntryId}-${block.blockId}-${idx}`} className="search-card">
            <div className="search-card-top">
              <span className="article-title-link">{block.notebookTitle || 'Untitled note'}</span>
              {block.updatedAt && <span className="muted small">{new Date(block.updatedAt).toLocaleDateString()}</span>}
            </div>
            <p className="muted small">{block.blockPreviewText || 'Referenced block'}</p>
            {targetType === 'notebook' && (block.targetType || block.targetTagName) && (
              <p className="muted small">Links to {block.targetType}{block.targetTagName ? `: #${block.targetTagName}` : ''}</p>
            )}
            <Button variant="secondary" onClick={() => handleBlockClick(block.notebookEntryId, block.blockId)}>
              Open note
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="references-panel">
      <Button variant="secondary" onClick={toggle}>{open ? 'Hide' : label}</Button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {loading && <p className="muted small">Loading references…</p>}
          {error && <p className="status-message error-message">{error}</p>}
          {!loading && !error && (
            <>
              {renderNotebookBlocks()}
              {data?.concepts && data.concepts.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p className="muted-label">Concepts</p>
                  <div className="section-stack">
                    {data.concepts.map((concept) => (
                      <button
                        key={concept._id || concept.name}
                        className="search-card"
                        onClick={() => handleConceptClick(concept.name)}
                      >
                        <div className="search-card-top">
                          <span className="article-title-link">{concept.name}</span>
                          {concept.updatedAt && (
                            <span className="muted small">
                              {new Date(concept.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {concept.description && <p className="muted small">{concept.description}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {data?.questions && data.questions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p className="muted-label">Questions</p>
                  <div className="section-stack">
                    {data.questions.map((question) => (
                      <button
                        key={question._id}
                        className="search-card"
                        onClick={() => handleQuestionClick(question._id)}
                      >
                        <div className="search-card-top">
                          <span className="article-title-link">{question.text}</span>
                          {question.updatedAt && (
                            <span className="muted small">
                              {new Date(question.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {(question.conceptName || question.linkedTagName) && (
                          <p className="muted small">
                            {question.conceptName || question.linkedTagName}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {data?.collections && data.collections.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p className="muted-label">Collections</p>
                  {data.collections.map((c) => (
                    <Link key={c._id} to={`/collections/${c.slug}`} className="article-title-link">
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ReferencesPanel;
