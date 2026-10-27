import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { streamChatWithAgent } from '../../api/agent';
import { useAgentRail } from '../../agent/AgentRailContext';
import { buildAgentContext } from '../../agent/agentConversationModel';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import { buildPassagePath } from '../../utils/sourceRoutes';

/* The Partner, asked in the margin. One question about one paragraph, and
   the answer beside it. It is the same Partner as ⌘J: the same route, the
   same retrieval, the same check that every quotation is a source's own
   words. The turn is kept in this article's conversation, so continuing in
   the Partner carries it over. */

const QUOTATION = /“([^”]+)”|"([^"]+)"/g;
const sameWords = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const defaultQuestion = ({ highlight, selection } = {}) => {
  if (highlight) {
    return highlight.articleTitle
      ? `How does this paragraph bear on what I marked in ${highlight.articleTitle}?`
      : 'How does this paragraph bear on the passage I marked?';
  }
  return selection ? 'What in my library bears on this?' : 'What in my library bears on this paragraph?';
};

/* Asking is offered only when a model can read this piece and the Partner is
   looking at it. Otherwise `available` is false and nothing in the margin
   offers to ask. */
export const useMarginAsk = (articleId, modelReads) => {
  const { surface, threadId, adoptThread, canAsk } = useAgentRail();
  const available = Boolean(modelReads && canAsk && articleId && String(surface.objectId) === String(articleId));
  const [answer, setAnswer] = useState(null);
  const request = useRef(null);

  const close = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setAnswer(null);
  }, []);
  useEffect(() => close, [articleId, close]);

  const ask = useCallback(async (target, typed = '') => {
    if (!available) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const question = String(typed || '').trim() || defaultQuestion(target);
    setAnswer({ ...target, question, status: 'reading', reply: '', quotes: [], mode: '' });
    const current = () => request.current === controller;
    try {
      const result = await streamChatWithAgent({
        message: question,
        threadId: threadId || undefined,
        threadTitle: surface.subject || 'Noeis conversation',
        persistThread: true,
        context: {
          ...buildAgentContext(surface),
          margin: { paragraph: target.paragraph, selection: target.selection || '', highlightId: target.highlight?._id || '' }
        },
        limit: 6
      }, {
        signal: controller.signal,
        onDelta: (delta) => {
          if (current()) setAnswer(value => value && { ...value, reply: `${value.reply}${delta}` });
        }
      });
      if (!current()) return;
      if (result?.thread?.threadId) adoptThread(result.thread);
      const reply = String(result?.reply || '').trim();
      setAnswer(value => value && (reply
        ? { ...value, status: 'done', reply, quotes: Array.isArray(result.quotes) ? result.quotes : [], mode: String(result.mode || '') }
        : { ...value, status: 'error', reply: '' }));
    } catch (_error) {
      if (current()) setAnswer(value => value && { ...value, status: 'error', reply: '' });
    } finally {
      if (current()) request.current = null;
    }
  }, [adoptThread, available, surface, threadId]);

  const carryOver = useCallback(() => {
    window.dispatchEvent(new Event('noeis:open-agent'));
    close();
  }, [close]);

  return { available, answer, ask, close, carryOver };
};

/* Where a quotation lives: the passage the note points to when the words are
   its own, else the words in their source. */
const quoteHref = (found, highlight) => {
  if (found?.type !== 'article') return '';
  const marked = highlight && String(highlight.articleId) === String(found.id)
    && sameWords(highlight.text).includes(sameWords(found.quote));
  return buildPassagePath({ articleId: found.id, ...(marked ? { highlightId: highlight._id } : { text: found.quote }) });
};

const Reply = ({ text, quotes = [], highlight }) => {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(QUOTATION)) {
    const quote = match[1] || match[2];
    const found = quotes.find(item => item.quote === quote);
    const href = quoteHref(found, highlight);
    if (!href) continue;
    parts.push(text.slice(last, match.index));
    parts.push(<Link key={match.index} to={href} title={found.title}>{match[0]}</Link>);
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return <p className="margin-answer__reply">{parts}</p>;
};

/* The card. Paper, not glass: it opens beside the text, not over the page. */
export const MarginAnswer = ({ answer, onAsk, onClose, onContinue }) => {
  const [draft, setDraft] = useState('');
  const { status, reply } = answer;

  const submit = (event) => {
    event.preventDefault();
    onAsk(draft);
    setDraft('');
  };

  return (
    <section
      className="margin-answer"
      aria-label={`${AGENT_DISPLAY_NAME} on this paragraph`}
      data-reader-control
      onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
    >
      <p className="margin-answer__question">{answer.question}</p>
      <div aria-live="polite">
        {status === 'reading' && !reply ? <p className="margin-answer__status" role="status">Reading…</p> : null}
        {reply && status !== 'done' ? <p className="margin-answer__reply">{reply}</p> : null}
        {status === 'done' ? <Reply text={reply} quotes={answer.quotes} highlight={answer.highlight} /> : null}
        {status === 'done' && answer.mode === 'internal_only' ? (
          <small className="margin-answer__status">From your passages while the {AGENT_DISPLAY_NAME} rests.</small>
        ) : null}
        {status === 'error' ? <p className="margin-answer__status">The {AGENT_DISPLAY_NAME} could not answer this time.</p> : null}
      </div>
      <form className="margin-answer__ask" onSubmit={submit}>
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder="Ask your own"
          aria-label="Ask about this paragraph"
          autoComplete="off"
          maxLength={1000}
        />
      </form>
      <span className="margin-answer__actions">
        {status === 'done' ? <button type="button" onClick={onContinue}>Continue in {AGENT_DISPLAY_NAME}</button> : null}
        <button type="button" onClick={onClose}>Close</button>
      </span>
    </section>
  );
};
