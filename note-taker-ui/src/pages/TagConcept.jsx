import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Page, Card, TagChip, Button } from '../components/ui';

const refsInitial = { data: null, loading: false, error: '' };

const TagConcept = () => {
  const { tagName } = useParams();
  const navigate = useNavigate();
  const [highlights, setHighlights] = useState([]);
  const [relatedTags, setRelatedTags] = useState([]);
  const [meta, setMeta] = useState({ description: '', pinnedHighlightIds: [] });
  const [pinnedHighlights, setPinnedHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [refs, setRefs] = useState({});
  const [notes, setNotes] = useState([]);
  const [noteError, setNoteError] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: '', content: '' });
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState({ title: '', content: '' });

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [metaRes, hlRes] = await Promise.all([
        api.get(`/api/tags/${encodeURIComponent(tagName)}/meta`, authHeaders()),
        api.get(`/api/tags/${encodeURIComponent(tagName)}/highlights`, authHeaders())
      ]);
      setMeta({
        description: metaRes.data?.description || '',
        pinnedHighlightIds: metaRes.data?.pinnedHighlightIds || [],
        allHighlightCount: metaRes.data?.allHighlightCount || 0
      });
      setPinnedHighlights(metaRes.data?.pinnedHighlights || []);
      setRelatedTags(metaRes.data?.relatedTags || []);
      setHighlights(hlRes.data || []);
    } catch (err) {
      console.error('Error loading tag concept:', err);
      setError(err.response?.data?.error || 'Failed to load concept.');
    } finally {
      setLoading(false);
    }
  }, [tagName]);

  const loadNotes = useCallback(async () => {
    try {
      const res = await api.get(`/api/concepts/${encodeURIComponent(tagName)}/notes`, authHeaders());
      setNotes(res.data || []);
    } catch (err) {
      console.error('Error loading concept notes:', err);
      setNoteError(err.response?.data?.error || 'Failed to load notes.');
    }
  }, [tagName]);

  const fetchRefs = async (id) => {
    setRefs(prev => ({ ...prev, [id]: { ...(prev[id] || refsInitial), loading: true, error: '' } }));
    try {
      const res = await api.get(`/api/highlights/${id}/references`, authHeaders());
      setRefs(prev => ({ ...prev, [id]: { data: res.data, loading: false, error: '' } }));
    } catch (err) {
      setRefs(prev => ({ ...prev, [id]: { data: null, loading: false, error: err.response?.data?.error || 'Failed to load references.' } }));
    }
  };

  const toggleRefs = (id) => {
    const current = refs[id];
    if (!current || (!current.data && !current.loading)) {
      fetchRefs(id);
    } else {
      setRefs(prev => ({ ...prev, [id]: { ...(prev[id] || refsInitial), data: current?.data, loading: false, error: current?.error, show: !current.show } }));
      setRefs(prev => ({ ...prev, [id]: { ...prev[id], show: !current?.show } }));
    }
  };

  useEffect(() => {
    loadData();
    loadNotes();
  }, [loadData, loadNotes]);

  const togglePin = (id) => {
    setMeta(prev => {
      const exists = prev.pinnedHighlightIds?.some(hid => String(hid) === String(id));
      const nextIds = exists
        ? prev.pinnedHighlightIds.filter(hid => String(hid) !== String(id))
        : [...(prev.pinnedHighlightIds || []), id];
      return { ...prev, pinnedHighlightIds: nextIds };
    });
  };

  const saveMeta = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/tags/${encodeURIComponent(tagName)}/meta`, {
        description: meta.description || '',
        pinnedHighlightIds: meta.pinnedHighlightIds || []
      }, authHeaders());
      await loadData();
    } catch (err) {
      console.error('Error saving meta:', err);
      setError(err.response?.data?.error || 'Failed to save concept.');
    } finally {
      setSaving(false);
    }
  };

  const isPinned = (id) => meta.pinnedHighlightIds?.some(hid => String(hid) === String(id));

  const submitNote = async () => {
    if (!noteForm.title.trim() && !noteForm.content.trim()) return;
    setNoteSaving(true);
    setNoteError('');
    try {
      await api.post(`/api/concepts/${encodeURIComponent(tagName)}/notes`, {
        title: noteForm.title.trim(),
        content: noteForm.content.trim()
      }, authHeaders());
      setNoteForm({ title: '', content: '' });
      await loadNotes();
    } catch (err) {
      setNoteError(err.response?.data?.error || 'Failed to save note.');
    } finally {
      setNoteSaving(false);
    }
  };

  const startEditNote = (note) => {
    setEditingNoteId(note._id);
    setEditingNoteDraft({ title: note.title || '', content: note.content || '' });
  };

  const saveEditNote = async () => {
    if (!editingNoteId) return;
    setNoteSaving(true);
    setNoteError('');
    try {
      await api.put(`/api/concepts/notes/${editingNoteId}`, {
        title: editingNoteDraft.title,
        content: editingNoteDraft.content
      }, authHeaders());
      setEditingNoteId(null);
      setEditingNoteDraft({ title: '', content: '' });
      await loadNotes();
    } catch (err) {
      setNoteError(err.response?.data?.error || 'Failed to update note.');
    } finally {
      setNoteSaving(false);
    }
  };

  const deleteNote = async (id) => {
    setNoteSaving(true);
    setNoteError('');
    try {
      await api.delete(`/api/concepts/notes/${id}`, authHeaders());
      if (editingNoteId === id) {
        setEditingNoteId(null);
        setEditingNoteDraft({ title: '', content: '' });
      }
      await loadNotes();
    } catch (err) {
      setNoteError(err.response?.data?.error || 'Failed to delete note.');
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Concept</p>
        <h1>{tagName}</h1>
        <p className="muted">A home for everything you know about this idea.</p>
      </div>
      {loading && <p className="status-message">Loading…</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {!loading && !error && (
        <div className="section-stack">
          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Overview</span>
              <span className="muted small">{meta.allHighlightCount || highlights.length} highlights total</span>
            </div>
            <label className="feedback-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={meta.description || ''}
                onChange={(e) => setMeta(prev => ({ ...prev, description: e.target.value }))}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={loadData}>Reset</Button>
              <Button onClick={saveMeta} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Pinned Highlights</span>
              <span className="muted small">{meta.pinnedHighlightIds?.length || 0} saved</span>
            </div>
            <div className="section-stack">
              {pinnedHighlights.length === 0 && <p className="muted small">Pin highlights below to feature them here.</p>}
              {pinnedHighlights.map(h => (
                <div key={h._id} className="search-card">
                  <div className="search-card-top">
                    <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                    <button className="icon-button" onClick={() => togglePin(h._id)}>×</button>
                  </div>
                  <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                  <div className="highlight-tag-chips">
                    {h.tags && h.tags.length > 0 ? h.tags.map(t => <TagChip key={t} to={`/tags/${encodeURIComponent(t)}`}>{t}</TagChip>) : <span className="muted small">No tags</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">All Highlights</span>
              <span className="muted small">{highlights.length} items</span>
            </div>
            <div className="section-stack">
              {highlights.map(h => (
                <div key={h._id} className="search-card">
                  <div className="search-card-top">
                    <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="secondary" onClick={() => togglePin(h._id)}>
                        {isPinned(h._id) ? 'Unpin' : 'Pin'}
                      </Button>
                      <Button variant="secondary" onClick={() => toggleRefs(h._id)}>References</Button>
                    </div>
                  </div>
                  <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                  <div className="highlight-tag-chips">
                    {h.tags && h.tags.length > 0 ? h.tags.map(t => <TagChip key={t} to={`/tags/${encodeURIComponent(t)}`}>{t}</TagChip>) : <span className="muted small">No tags</span>}
                  </div>
                  {refs[h._id]?.loading && <p className="muted small">Loading references…</p>}
                  {refs[h._id]?.error && <p className="status-message error-message">{refs[h._id].error}</p>}
                  {refs[h._id]?.data && (
                    <div className="muted small" style={{ marginTop: 6 }}>
                      {refs[h._id].data.notebookEntries.length === 0 && refs[h._id].data.collections.length === 0 && (
                        <p className="muted small">No references yet.</p>
                      )}
                      {refs[h._id].data.notebookEntries.length > 0 && (
                        <p>
                          Notebook: {refs[h._id].data.notebookEntries.map(n => (
                            <span key={n._id} style={{ marginRight: 6 }}>{n.title}</span>
                          ))}
                        </p>
                      )}
                      {refs[h._id].data.collections.length > 0 && (
                        <p>
                          Collections: {refs[h._id].data.collections.map(c => (
                            <span key={c._id} style={{ marginRight: 6 }}>{c.name}</span>
                          ))}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {highlights.length === 0 && <p className="muted small">No highlights yet for this tag.</p>}
            </div>
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Related tags</span>
            </div>
            <div className="highlight-tag-chips" style={{ flexWrap: 'wrap' }}>
              {relatedTags && relatedTags.length > 0 ? relatedTags.map(rt => (
                <TagChip key={rt.tag} to={`/tags/${encodeURIComponent(rt.tag)}`}>
                  {rt.tag} <span className="tag-count">{rt.count}</span>
                </TagChip>
              )) : <span className="muted small">No related tags yet.</span>}
            </div>
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Concept notes</span>
              <span className="muted small">{notes.length} notes</span>
            </div>
            {noteError && <p className="status-message error-message">{noteError}</p>}
            <div className="section-stack">
              <label className="feedback-field">
                <span>Title</span>
                <input
                  type="text"
                  value={noteForm.title}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </label>
              <label className="feedback-field">
                <span>Content</span>
                <textarea
                  rows={3}
                  value={noteForm.content}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, content: e.target.value }))}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button onClick={submitNote} disabled={noteSaving || (!noteForm.title.trim() && !noteForm.content.trim())}>
                  {noteSaving ? 'Saving…' : 'Add note'}
                </Button>
              </div>
            </div>
            <div className="section-stack" style={{ marginTop: 12 }}>
              {notes.length === 0 && <p className="muted small">No notes yet. Capture ideas about this concept.</p>}
              {notes.map(n => (
                <div key={n._id} className="search-card">
                  {editingNoteId === n._id ? (
                    <>
                      <label className="feedback-field">
                        <span>Title</span>
                        <input
                          type="text"
                          value={editingNoteDraft.title}
                          onChange={(e) => setEditingNoteDraft(prev => ({ ...prev, title: e.target.value }))}
                        />
                      </label>
                      <label className="feedback-field">
                        <span>Content</span>
                        <textarea
                          rows={3}
                          value={editingNoteDraft.content}
                          onChange={(e) => setEditingNoteDraft(prev => ({ ...prev, content: e.target.value }))}
                        />
                      </label>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <Button variant="secondary" onClick={() => { setEditingNoteId(null); setEditingNoteDraft({ title: '', content: '' }); }}>Cancel</Button>
                        <Button onClick={saveEditNote} disabled={noteSaving}>{noteSaving ? 'Saving…' : 'Save'}</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="search-card-top">
                        <span className="article-title-link">{n.title || 'Untitled note'}</span>
                        <span className="muted small">{n.updatedAt ? new Date(n.updatedAt).toLocaleDateString() : ''}</span>
                      </div>
                      <p className="muted small" style={{ whiteSpace: 'pre-wrap' }}>{n.content || 'No content'}</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button variant="secondary" onClick={() => startEditNote(n)}>Edit</Button>
                        <Button variant="secondary" onClick={() => deleteNote(n._id)}>Delete</Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
};

export default TagConcept;
