import React, { useCallback, useMemo, useState } from 'react';
import { chatWithAgent } from '../../api/agent';
import { Button, QuietButton, SectionHeader, SurfaceCard } from '../ui';

const clean = (value) => String(value || '').trim();

const toContext = (contextType, contextId) => {
  const type = clean(contextType).toLowerCase();
  const id = clean(contextId);
  if (!type || !id) return null;
  return { type, id };
};

const toItemPath = (item = {}) => {
  const type = clean(item.type).toLowerCase();
  const id = clean(item.id);
  const title = clean(item.title);
  if (type === 'article' && id) return `/articles/${encodeURIComponent(id)}`;
  if ((type === 'notebook' || type === 'note') && id) return `/think?tab=notebook&entryId=${encodeURIComponent(id)}`;
  if (type === 'concept' && title) return `/think?tab=concepts&concept=${encodeURIComponent(title)}`;
  return '';
};

const buildPrompt = (template, contextTitle) => {
  const safeTitle = clean(contextTitle);
  if (!safeTitle) return template;
  return template.replace('{context}', safeTitle);
};

const ThoughtPartnerPanel = ({
  contextType = '',
  contextId = '',
  contextTitle = '',
  placeholder = 'Ask your thought partner…',
  className = ''
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);

  const context = useMemo(() => toContext(contextType, contextId), [contextType, contextId]);
  const promptTemplates = useMemo(() => ([
    'Summarize what matters most in {context}.',
    'Find related notes or concepts for this idea.',
    'Challenge my current thinking and point out weak spots.'
  ]), []);

  const submitMessage = useCallback(async (rawMessage) => {
    const message = clean(rawMessage);
    if (!message || loading) return;
    setError('');
    setLoading(true);
    setInput('');

    const userMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      text: message
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const result = await chatWithAgent({
        message,
        context,
        limit: 6
      });
      const assistantMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        text: clean(result?.reply) || 'No reply generated.',
        relatedItems: Array.isArray(result?.relatedItems) ? result.relatedItems : [],
        premiumWebResearchAvailable: Boolean(result?.premiumWebResearchAvailable)
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (chatError) {
      setError(chatError.response?.data?.error || 'Failed to ask agent.');
    } finally {
      setLoading(false);
    }
  }, [context, loading]);

  const lastAssistantMessage = useMemo(() => (
    [...messages].reverse().find(entry => entry.role === 'assistant') || null
  ), [messages]);

  return (
    <SurfaceCard className={`agent-thought-partner ${className}`.trim()} data-testid="thought-partner-panel">
      <SectionHeader
        title="Thought partner"
        subtitle={contextTitle ? `Context: ${contextTitle}` : 'Ask about your notes, concepts, and articles.'}
        action={(
          <QuietButton
            type="button"
            onClick={() => setMessages([])}
            disabled={loading || messages.length === 0}
          >
            Clear
          </QuietButton>
        )}
      />

      <div className="agent-thought-partner__quick-prompts">
        {promptTemplates.map((template) => {
          const prompt = buildPrompt(template, contextTitle || contextId);
          return (
            <QuietButton
              key={template}
              type="button"
              disabled={loading}
              onClick={() => submitMessage(prompt)}
            >
              {prompt}
            </QuietButton>
          );
        })}
      </div>

      <div className="agent-thought-partner__composer">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          rows={3}
          disabled={loading}
        />
        <Button
          variant="secondary"
          type="button"
          onClick={() => submitMessage(input)}
          disabled={loading || !clean(input)}
        >
          {loading ? 'Thinking…' : 'Ask'}
        </Button>
      </div>

      {error && <p className="status-message error-message">{error}</p>}
      {!error && messages.length === 0 && (
        <p className="muted small">Start with a question, or pick a prompt above.</p>
      )}

      <div className="agent-thought-partner__thread">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`agent-thought-partner__message ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}`}
          >
            <p className="agent-thought-partner__message-role">{message.role === 'assistant' ? 'Agent' : 'You'}</p>
            <p>{message.text}</p>
            {message.role === 'assistant' && Array.isArray(message.relatedItems) && message.relatedItems.length > 0 && (
              <div className="agent-thought-partner__related-items">
                {message.relatedItems.slice(0, 6).map((item) => {
                  const path = toItemPath(item);
                  const title = clean(item.title) || `${clean(item.type) || 'item'} ${clean(item.id)}`;
                  return path ? (
                    <a key={`${item.type}:${item.id}`} href={path} className="agent-thought-partner__related-link">
                      {title}
                    </a>
                  ) : (
                    <span key={`${item.type}:${item.id}`} className="agent-thought-partner__related-label">
                      {title}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {lastAssistantMessage && lastAssistantMessage.premiumWebResearchAvailable === false && (
        <p className="muted small">
          External web research is a premium capability and is not enabled yet.
        </p>
      )}
    </SurfaceCard>
  );
};

export default ThoughtPartnerPanel;
