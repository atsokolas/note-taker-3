import React, { useEffect, useState } from 'react';
import api from '../api';
import { Button, QuietButton } from './ui';

const OPTIONS = [
  { value: 'feature', label: 'Feature request' },
  { value: 'bug', label: 'Bug report' },
  { value: 'feedback', label: 'General feedback' }
];

const ProductFeedbackModal = ({ open, onClose }) => {
  const [kind, setKind] = useState('feature');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind('feature');
    setTitle('');
    setMessage('');
    setEmail('');
    setStatus('');
    setError('');
    setSaving(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setError('Add a few details before submitting.');
      return;
    }
    setSaving(true);
    setError('');
    setStatus('');
    try {
      await api.post('/api/feedback', {
        kind,
        title: title.trim(),
        message: trimmedMessage,
        email: email.trim(),
        source: 'web-app-product-feedback',
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
      });
      setStatus('Sent. It will be included in the weekly product review.');
      setTitle('');
      setMessage('');
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send feedback.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="product-feedback-modal" role="presentation" onMouseDown={onClose}>
      <form
        className="product-feedback-modal__dialog"
        aria-label="Request a feature or report a bug"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="product-feedback-modal__header">
          <div>
            <h2>Product feedback</h2>
            <p>Request a feature, report a bug, or leave a note for review.</p>
          </div>
          <QuietButton type="button" onClick={onClose}>Close</QuietButton>
        </div>

        <div className="product-feedback-modal__type" role="radiogroup" aria-label="Feedback type">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`product-feedback-modal__type-button ${kind === option.value ? 'is-active' : ''}`.trim()}
              onClick={() => setKind(option.value)}
              role="radio"
              aria-checked={kind === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="feedback-field">
          <span>Short title</span>
          <input
            type="text"
            value={title}
            maxLength={180}
            placeholder="What should change?"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="feedback-field">
          <span>Details</span>
          <textarea
            value={message}
            rows={6}
            placeholder={kind === 'bug' ? 'What happened, what did you expect, and where?' : 'What would this help you do?'}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <label className="feedback-field">
          <span>Email, optional</span>
          <input
            type="email"
            value={email}
            placeholder="For follow-up questions"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {error && <p className="status-message error-message">{error}</p>}
        {status && <p className="status-message success-message">{status}</p>}

        <div className="product-feedback-modal__actions">
          <Button type="submit" disabled={saving}>{saving ? 'Sending...' : 'Send feedback'}</Button>
        </div>
      </form>
    </div>
  );
};

export default ProductFeedbackModal;
