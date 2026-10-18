import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getLibraryTrail } from '../api/libraryCollection';
import { createNotebookEntry } from '../api/notebook';
import { buildPassagePath } from '../utils/sourceRoutes';
import { takeFirstPaint } from '../motion/columnMotion';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/ui';
import '../styles/library-trail.css';

/* A trail: what to read next on a subject, from foundations to the frontier.

   It starts from what you saved, each piece open at the passage that put it
   on the path. Where the path runs past your Library, the gap is named and
   the works that fill it are named by title and author. Nothing here can
   search the web, so a work from outside links a search for itself, never
   an address someone made up. Kept, a trail is a note in your notebook. */

export const outsideSearchHref = ({ title = '', author = '' }) => (
  `https://duckduckgo.com/?q=${encodeURIComponent(`"${title}" ${author}`.trim())}`
);

const ORDER_LEDE = {
  path: 'Foundations first, the frontier last.',
  date: 'What you have saved on it, oldest first.'
};

const ledeFor = ({ subject, trail }) => {
  if (!subject) return 'Name a subject. The trail starts from what you have saved.';
  if (!trail) return 'Laying the trail…';
  if (trail.empty) {
    const quiet = `Nothing in your Library is on ${subject} yet.`;
    return trail.steps.length ? `${quiet} These would start it.` : quiet;
  }
  return ORDER_LEDE[trail.ordered];
};

const byline = step => [step.title, step.author].filter(Boolean).join(' — ');

/* The trail as a note: each piece in order, your passages as quotations that
   open where they came from, the gap where it falls. */
export const trailNoteBlocks = ({ subject, trail }) => {
  const gap = trail.gap ? [{ type: 'paragraph', text: `The gap: ${trail.gap}` }] : [];
  const firstOutside = trail.steps.findIndex(step => step.kind === 'outside');
  return [
    { type: 'paragraph', text: ledeFor({ subject, trail }) },
    ...trail.steps.flatMap((step, index) => [
      ...(index === firstOutside ? gap : []),
      {
        type: 'paragraph',
        text: `${index + 1}. ${byline(step)}${step.kind === 'outside' ? ', from outside your library' : ''}.${step.why ? ` ${step.why}` : ''}`
      },
      ...(step.kind === 'mine' && step.passage ? [{
        type: step.highlightId ? 'highlight_embed' : 'quote',
        text: step.passage,
        articleId: step.articleId,
        articleTitle: step.title,
        sourcePath: buildPassagePath({ articleId: step.articleId, highlightId: step.highlightId, text: step.passage }),
        ...(step.highlightId ? { highlightId: step.highlightId } : {})
      }] : [])
    ]),
    ...(firstOutside < 0 ? gap : [])
  ];
};

const Step = ({ step, number }) => (
  <li className={`library-trail__step library-trail__step--${step.kind}`}>
    <span className="library-trail__number" aria-hidden="true">{number}</span>
    <div>
      {step.kind === 'outside' ? <p className="library-trail__from">From outside your library</p> : null}
      <h2 className="library-trail__title">
        {step.kind === 'mine'
          ? <Link to={buildPassagePath({ articleId: step.articleId, highlightId: step.highlightId, text: step.passage })}>{step.title}</Link>
          : step.title}
      </h2>
      {step.author ? <p className="library-trail__author">{step.author}</p> : null}
      {step.why ? <p className="library-trail__why">{step.why}</p> : null}
      {step.kind === 'mine' && step.passage ? (
        <blockquote className="library-trail__passage">
          <span>{step.marked ? 'You marked' : 'From the text'}</span>
          {step.passage}
        </blockquote>
      ) : null}
      {step.kind === 'outside' ? (
        <a className="library-trail__search" href={outsideSearchHref(step)} target="_blank" rel="noreferrer">
          Search for it ↗
        </a>
      ) : null}
    </div>
  </li>
);

const Gap = ({ text }) => <li className="library-trail__gap"><span>The gap</span> {text}</li>;

const LibraryTrail = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const subject = (searchParams.get('subject') || '').trim();
  useDocumentTitle(subject || 'Trail', 'Library');
  const [draft, setDraft] = useState(subject);
  const [trail, setTrail] = useState(null);
  const [error, setError] = useState('');
  const [kept, setKept] = useState({ status: 'idle', id: '' });
  const arriving = useMemo(() => takeFirstPaint('library-trail'), []);
  const step = n => (arriving ? `wfp-anim wfp-anim--${n}` : '');

  useEffect(() => {
    setDraft(subject);
    setTrail(null);
    setError('');
    setKept({ status: 'idle', id: '' });
    if (!subject) return undefined;
    let cancelled = false;
    getLibraryTrail(subject)
      .then(found => { if (!cancelled) setTrail(found); })
      .catch(failure => { if (!cancelled) setError(failure?.response?.data?.error || 'The trail could not be laid just now.'); });
    return () => { cancelled = true; };
  }, [subject]);

  const keep = async () => {
    setKept({ status: 'keeping', id: '' });
    try {
      const note = await createNotebookEntry({ title: `Trail: ${subject}`, blocks: trailNoteBlocks({ subject, trail }) });
      setKept({ status: 'kept', id: String(note?._id || '') });
    } catch (_failure) {
      setKept({ status: 'failed', id: '' });
    }
  };

  const firstOutside = trail ? trail.steps.findIndex(item => item.kind === 'outside') : -1;

  return (
    <main className="library-trail" aria-labelledby="library-trail-title" aria-busy={Boolean(subject && !trail && !error)}>
      <PageHeader
        className={step(1)}
        eyebrow={<Link to="/library">← Library</Link>}
        titleId="library-trail-title"
        title={subject ? `A trail through ${subject}` : 'A trail'}
        lede={error ? null : ledeFor({ subject, trail })}
      />
      <form
        className={`library-trail__ask ${step(2)}`.trim()}
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim();
          if (next) setSearchParams({ subject: next });
        }}
      >
        <input
          type="search"
          aria-label="Subject"
          value={draft}
          maxLength={120}
          placeholder="A subject, like attention or the French Revolution"
          onChange={event => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim() || draft.trim() === subject}>Lay the trail</button>
      </form>

      {error ? <p className="library-trail__quiet" role="alert">{error}</p> : null}

      {trail?.steps.length ? (
        <>
          <ol className={`library-trail__steps ${step(3)}`.trim()}>
            {trail.steps.map((item, index) => (
              <React.Fragment key={`${item.kind}:${item.articleId || item.title}`}>
                {index === firstOutside && trail.gap ? <Gap text={trail.gap} /> : null}
                <Step step={item} number={index + 1} />
              </React.Fragment>
            ))}
            {firstOutside < 0 && trail.gap ? <Gap text={trail.gap} /> : null}
          </ol>
          <p className="library-trail__keep" role="status">
            {kept.status === 'kept' ? (
              <>Kept in your notebook. <Link to={`/think?tab=notebook&entryId=${encodeURIComponent(kept.id)}`}>Open it →</Link></>
            ) : (
              <>
                <button type="button" onClick={keep} disabled={kept.status === 'keeping'}>
                  {kept.status === 'keeping' ? 'Keeping…' : 'Keep this trail'}
                </button>
                {kept.status === 'failed' ? ' It could not be kept just now. Try again.' : null}
              </>
            )}
          </p>
        </>
      ) : null}
    </main>
  );
};

export default LibraryTrail;
