import React, { useState } from 'react';
import api from '../api';
import { Button } from './ui';

const QuestionModal = ({ open, onClose, onCreated, defaults = {} }) => {
  const [text, setText] = useState(defaults.text || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const payload = {
        text: text.trim(),
        linkedTagName: defaults.linkedTagName || '',
        linkedHighlightId: defaults.linkedHighlightId || null,
        linkedNotebookEntryId: defaults.linkedNotebookEntryId || null
      };
      const res = await api.post('/api/questions', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onCreated?.(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create question.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>New Question</h3>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <label className="feedback-field">
          <span>Question</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {defaults.linkedTagName && (
          <p className="muted small">Linked to concept: {defaults.linkedTagName}</p>
        )}
        {error && <p className="status-message error-message">{error}</p>}
        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !text.trim()}>
            {saving ? 'Saving…' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuestionModal;
