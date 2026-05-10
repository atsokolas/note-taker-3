import React, { useState } from 'react';

/**
 * WikiAskComposer — bottom-of-page composer that lets the reader ask a
 * question about the current wiki page. The agent answers with the page +
 * its sources as context, and the answer is appended to the page's
 * discussions (rendered above by WikiDiscussions).
 *
 * Submits with Cmd/Ctrl+Enter. Shows a busy state while the request is in
 * flight; surfaces a per-request error inline so the user can retry.
 */

const SUGGESTED_PROMPTS = [
  'Summarize this page in two sentences.',
  'Which claims are weakest?',
  'What contradicts the main argument?'
];

const WikiAskComposer = ({ onAsk, busy = false }) => {
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setError('');
    try {
      await onAsk?.(trimmed);
      setQuestion('');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to ask the page.');
    }
  };

  const handleKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      handleSubmit(event);
    }
  };

  const handleSuggestion = (text) => {
    setQuestion(text);
  };

  return (
    <form className="wiki-ask-composer" onSubmit={handleSubmit} aria-label="Ask this page">
      <div className="wiki-ask-composer__head">
        <span className="wiki-ask-composer__eyebrow">Ask this page</span>
        <span className="wiki-ask-composer__hint">⌘ + Enter to send</span>
      </div>
      <textarea
        className="wiki-ask-composer__input"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask the agent anything about this page — answers cite your attached sources."
        rows={3}
        aria-label="Question for this page"
        disabled={busy}
        // Backend rejects > 1000 chars. Cap the input client-side so the
        // composer never lets the user type past the limit and only
        // discover the rejection after submit.
        maxLength={1000}
        data-testid="wiki-ask-composer-input"
      />
      <div className="wiki-ask-composer__row">
        <div className="wiki-ask-composer__suggestions">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              type="button"
              key={prompt}
              className="wiki-ask-composer__suggestion"
              onClick={() => handleSuggestion(prompt)}
              disabled={busy}
            >
              {prompt}
            </button>
          ))}
        </div>
        <button
          type="submit"
          className="wiki-ask-composer__submit"
          disabled={busy || !question.trim()}
          data-testid="wiki-ask-composer-submit"
        >
          {busy ? 'Asking…' : 'Ask the agent'}
        </button>
      </div>
      {error ? <p className="wiki-ask-composer__error" role="alert">{error}</p> : null}
    </form>
  );
};

export default WikiAskComposer;
