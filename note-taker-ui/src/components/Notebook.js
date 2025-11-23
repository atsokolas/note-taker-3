import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';

const EMPTY_NOTE = { title: 'New note', content: '', checklist: [] };

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const buildDraft = (note = {}) => ({
  title: note.title || 'Untitled note',
  content: note.content || '',
  checklist: Array.isArray(note.checklist) ? note.checklist.map(item => ({ ...item })) : []
});

const Notebook = () => {
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [draft, setDraft] = useState(buildDraft(EMPTY_NOTE));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return { headers: { 'Authorization': `Bearer ${token}` } };
  }, []);

  const activeNote = useMemo(
    () => notes.find(note => note._id === activeNoteId),
    [notes, activeNoteId]
  );

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/notes', getAuthHeaders());
      const noteList = response.data || [];
      setNotes(noteList);

      if (noteList.length > 0) {
        setActiveNoteId(noteList[0]._id);
        setDraft(buildDraft(noteList[0]));
      } else {
        setActiveNoteId(null);
        setDraft(buildDraft(EMPTY_NOTE));
      }
    } catch (err) {
      console.error("Error loading notes:", err);
      setError(err.response?.data?.error || "Failed to load notes.");
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (!activeNoteId) return;
    const nextNote = notes.find(note => note._id === activeNoteId);
    if (nextNote) {
      setDraft(buildDraft(nextNote));
    }
  }, [activeNoteId, notes]);

  const handleCreateNote = async () => {
    setSaving(true);
    setStatusMessage('');
    try {
      const response = await api.post('/api/notes', EMPTY_NOTE, getAuthHeaders());
      const newNote = response.data;
      setNotes(prev => [newNote, ...prev]);
      setActiveNoteId(newNote._id);
      setDraft(buildDraft(newNote));
      setStatusMessage('New note created');
    } catch (err) {
      console.error("Error creating note:", err);
      setStatusMessage(err.response?.data?.error || "Could not create note.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!activeNoteId) return;
    setSaving(true);
    setStatusMessage('');
    try {
      const payload = {
        title: draft.title.trim() || 'Untitled note',
        content: draft.content,
        checklist: (draft.checklist || []).map(item => ({
          text: (item.text || '').trim(),
          checked: !!item.checked
        }))
      };

      const response = await api.patch(`/api/notes/${activeNoteId}`, payload, getAuthHeaders());
      const updated = response.data;

      setNotes(prev => {
        const filtered = prev.filter(note => note._id !== activeNoteId);
        return [updated, ...filtered];
      });
      setDraft(buildDraft(updated));
      setStatusMessage('Saved');
    } catch (err) {
      console.error("Error saving note:", err);
      setStatusMessage(err.response?.data?.error || "Could not save note.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeNoteId) return;
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    setSaving(true);
    setStatusMessage('');
    try {
      await api.delete(`/api/notes/${activeNoteId}`, getAuthHeaders());
      const remaining = notes.filter(note => note._id !== activeNoteId);
      setNotes(remaining);
      if (remaining.length > 0) {
        setActiveNoteId(remaining[0]._id);
        setDraft(buildDraft(remaining[0]));
      } else {
        setActiveNoteId(null);
        setDraft(buildDraft(EMPTY_NOTE));
      }
      setStatusMessage('Note deleted');
    } catch (err) {
      console.error("Error deleting note:", err);
      setStatusMessage(err.response?.data?.error || "Could not delete note.");
    } finally {
      setSaving(false);
    }
  };

  const handleChecklistToggle = (index) => {
    setDraft(prev => {
      const updatedChecklist = prev.checklist.map((item, idx) => idx === index ? { ...item, checked: !item.checked } : item);
      return { ...prev, checklist: updatedChecklist };
    });
  };

  const handleChecklistTextChange = (index, text) => {
    setDraft(prev => {
      const updatedChecklist = prev.checklist.map((item, idx) => idx === index ? { ...item, text } : item);
      return { ...prev, checklist: updatedChecklist };
    });
  };

  const handleChecklistDelete = (index) => {
    setDraft(prev => ({ ...prev, checklist: prev.checklist.filter((_, idx) => idx !== index) }));
  };

  const handleAddChecklistItem = () => {
    const trimmed = newChecklistText.trim();
    if (!trimmed) return;
    setDraft(prev => ({ ...prev, checklist: [...prev.checklist, { text: trimmed, checked: false }] }));
    setNewChecklistText('');
  };

  return (
    <div className="notebook-wrapper">
      <aside className="notebook-sidebar">
        <div className="notebook-sidebar-header">
          <div>
            <p className="eyebrow">Notebook</p>
            <h2>Capture ideas like Notion</h2>
            <p className="muted">Create pages, jot thoughts, and keep living checklists.</p>
          </div>
          <button className="notebook-button primary" onClick={handleCreateNote} disabled={saving}>
            + New note
          </button>
        </div>

        {loading && <p className="status-message">Loading your notebook...</p>}
        {error && <p className="status-message error-message">{error}</p>}

        {!loading && notes.length === 0 && (
          <div className="notebook-empty">
            <p>Start your first page.</p>
            <button className="notebook-button" onClick={handleCreateNote} disabled={saving}>Create note</button>
          </div>
        )}

        <ul className="notebook-list">
          {notes.map(note => (
            <li
              key={note._id}
              className={`notebook-list-item ${activeNoteId === note._id ? 'active' : ''}`}
              onClick={() => setActiveNoteId(note._id)}
            >
              <div className="notebook-list-title">{note.title || 'Untitled note'}</div>
              <div className="notebook-list-meta">
                <span>{formatDate(note.updatedAt)}</span>
                <span>{(note.checklist?.filter(item => item.checked)?.length || 0)}/{note.checklist?.length || 0} tasks</span>
              </div>
              <p className="notebook-list-preview">{(note.content || '').slice(0, 120) || 'Add details to this page...'}</p>
            </li>
          ))}
        </ul>
      </aside>

      <section className="notebook-editor">
        {activeNote ? (
          <>
            <div className="notebook-editor-bar">
              <input
                type="text"
                className="notebook-title-input"
                value={draft.title}
                onChange={(e) => setDraft(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Untitled"
              />
              <div className="notebook-actions">
                {statusMessage && <span className="notebook-status">{statusMessage}</span>}
                {activeNote?.updatedAt && <span className="notebook-updated">Last updated {formatDate(activeNote.updatedAt)}</span>}
                <button className="notebook-button subtle" onClick={handleDelete} disabled={saving}>Delete</button>
                <button className="notebook-button primary" onClick={handleSave} disabled={saving}>Save</button>
              </div>
            </div>

            <div className="notebook-panels">
              <div className="notebook-content">
                <label className="eyebrow">Notes</label>
                <textarea
                  className="notebook-textarea"
                  value={draft.content}
                  onChange={(e) => setDraft(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Write freely, add meeting notes, ideas, or plans..."
                />
              </div>

              <div className="notebook-checklist-card">
                <div className="checklist-header">
                  <div>
                    <p className="eyebrow">Lists</p>
                    <h3>Todos & decisions</h3>
                  </div>
                  <div className="checklist-add">
                    <input
                      type="text"
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddChecklistItem(); }}
                      placeholder="Add a checklist item"
                    />
                    <button className="notebook-button" onClick={handleAddChecklistItem}>Add</button>
                  </div>
                </div>

                <ul className="checklist-list">
                  {draft.checklist.map((item, index) => (
                    <li key={index} className="checklist-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={!!item.checked}
                          onChange={() => handleChecklistToggle(index)}
                        />
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) => handleChecklistTextChange(index, e.target.value)}
                          className={item.checked ? 'completed' : ''}
                        />
                      </label>
                      <button className="icon-button" onClick={() => handleChecklistDelete(index)} title="Remove item">×</button>
                    </li>
                  ))}
                </ul>

                {draft.checklist.length === 0 && (
                  <p className="muted small">No checklist items yet. Add action items to keep this page moving.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="notebook-empty-editor">
            <p>Create a note to start typing.</p>
            <button className="notebook-button primary" onClick={handleCreateNote} disabled={saving}>New note</button>
          </div>
        )}
      </section>
    </div>
  );
};

export default Notebook;
