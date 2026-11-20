import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildCanonicalArticlePath, buildCanonicalHighlightPath } from '../../../utils/sourceRoutes';

export function argumentContext(piece, highlights) {
  const nodes = piece?.nodes || [];
  const question = nodes.find(node => node.type === 'questionRef' && node.attrs?.questionId)?.attrs;
  const source = nodes.find(node => ['highlightRef', 'articleRef', 'blockquote'].includes(node.type) && (
    node.attrs?.articleId || node.attrs?.highlightId || node.attrs?.sourcePath
  ));
  const attrs = source?.attrs || {};
  const highlight = attrs.highlightId ? highlights.get(String(attrs.highlightId)) : null;
  const articleId = attrs.articleId || highlight?.articleId;
  const title = attrs.articleTitle || highlight?.articleTitle || 'Saved passage';
  const quote = attrs.highlightText || highlight?.text
    || (source?.type === 'blockquote' ? source.content?.flatMap(node => node.content || []).map(node => node.text || '').join(' ') : '');
  const href = articleId && (attrs.highlightId
    ? buildCanonicalHighlightPath({ articleId, highlightId: attrs.highlightId }) : buildCanonicalArticlePath(articleId));

  return { question, quote, href, title };
}

export function ArgumentReturn({ line, context, onResume, sourceAction }) {
  const { question, quote, href, title } = context;
  return (
    <section className="think-argument" aria-label="Where you left off">
      <div className="think-argument__return">
        <small>Where you left off</small>
        <p className="think-argument__line">{line.text}</p>
        <button type="button" onClick={onResume}>Continue writing</button>
      </div>
      {question?.questionText || quote || href ? <details key={line.target?.blockId}>
        <summary>{question?.questionText && (quote || href) ? 'Question and source' : question?.questionText ? 'Question' : 'Source'}</summary>
        {question?.questionText ? <p><Link to={`/think?tab=questions&questionId=${encodeURIComponent(question.questionId)}`}>{question.questionText}</Link></p> : null}
        {quote ? <blockquote>{quote}</blockquote> : null}
        {href ? <div className="think-argument__source"><Link to={href}>{title}</Link>{sourceAction}</div> : null}
      </details> : null}
    </section>
  );
}

/* Hemingway stopped mid-sentence so the next day began itself. At the foot of
   the page: where the next sentence goes. Saved on Enter or on leaving the
   field, at the place your caret last was; empty clears it. */
const NextSentence = ({ line = '', onSave }) => {
  const [draft, setDraft] = useState(line);
  useEffect(() => { setDraft(line); }, [line]);
  const save = () => { if (draft.trim() !== line.trim()) onSave(draft); };

  return (
    <label className="next-sentence">
      <span>Where does the next sentence go?</span>
      <input
        value={draft}
        maxLength={500}
        placeholder="Leave yourself the start of it."
        onChange={event => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === 'Escape') setDraft(line);
        }}
      />
    </label>
  );
};

export default NextSentence;
