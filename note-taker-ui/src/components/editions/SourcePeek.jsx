import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { getAuthHeaders } from '../../hooks/useAuthHeaders';
import { passageHref, sourceLine } from '../../pages/editionModel';
import EditionPanel from './EditionPanel';
import AgentMark from './AgentMark';
import { EditionBoundary } from './EditionFinding';
import { Passage } from './EditionLayer';
import ThoughtComposer from './ThoughtComposer';

// React renders text, never untrusted article markup. Preserve paragraph breaks.
export const articleParagraphs = (html) => {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script,style,iframe,object,noscript').forEach((node) => node.remove());
  const blocks = [...doc.querySelectorAll('p,h1,h2,h3,h4,li,blockquote')].filter(
    (node) => !node.querySelector('p,li,blockquote')
  );
  return (
    blocks.length ? blocks.map((node) => node.textContent.trim()) : [doc.body.textContent.trim()]
  ).filter(Boolean);
};
export default function SourcePeek({ item, view, origin, quote, onClose, thoughtProps }) {
  const [tab, setTab] = useState(view);
  const [source, setSource] = useState({ loading: Boolean(item.savedArticleId), paragraphs: [] });
  useEffect(() => {
    let active = true;
    if (item.savedArticleId) {
      api
        .get(`/articles/${encodeURIComponent(item.savedArticleId)}`, getAuthHeaders())
        .then(({ data }) => {
          if (active)
            setSource({
              loading: false,
              paragraphs: articleParagraphs(data?.content),
              title: data?.title
            });
        })
        .catch(() => {
          if (active) setSource({ loading: false, paragraphs: [], unavailable: true });
        });
    }
    return () => {
      active = false;
    };
  }, [item.savedArticleId]);
  const href = passageHref(item);
  const atPassage = item.passageCheck === 'found' && Boolean(item.passage);
  /* The paragraph the checked passage sits in is marked, and opened to. */
  const held = useRef(null);
  const squash = text => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const rests = paragraph => atPassage && squash(paragraph).includes(squash(item.passage).slice(0, 80));
  useEffect(() => {
    held.current?.scrollIntoView?.({ block: 'center' });
  }, [source.paragraphs, tab]);
  const tabs = ['finding', 'source', 'thought'];
  return (
    <EditionPanel title="Beside this reading" origin={origin} onClose={onClose}>
      <div className="edition-peek-tabs" role="tablist" aria-label="This reading">
        {tabs.map((name, index) => (
          <button
            key={name}
            id={`reading-tab-${name}`}
            role="tab"
            aria-selected={tab === name}
            aria-controls="reading-view"
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 2
                    : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
              setTab(tabs[next]);
              document.getElementById(`reading-tab-${tabs[next]}`)?.focus();
            }}
          >
            {name === 'thought' ? 'Your thought' : name === 'source' ? 'Source' : 'Finding'}
          </button>
        ))}
      </div>
      <section id="reading-view" role="tabpanel" aria-labelledby={`reading-tab-${tab}`}>
        <h2>{item.title}</h2>
        {tab === 'finding' ? (
          <>
            <p className="reading-prose">{item.finding}</p>
            <EditionBoundary>{item.boundary}</EditionBoundary>
            {item.filedBy ? <p>Filed by <AgentMark runtime={item.filedByRuntime} label={item.filedBy} /></p> : null}
          </>
        ) : null}
        {tab === 'source' ? (
          <>
            <p className="reading-source">{sourceLine(item)}</p>
            <Passage item={item} />
            {source.loading ? (
              <p role="status">Opening your saved source…</p>
            ) : source.paragraphs.length ? (
              <div className="reading-source-text">
                {source.paragraphs.map((p, i) => (
                  rests(p) ? <p key={i} ref={held} className="is-passage"><mark>{p}</mark></p> : <p key={i}>{p}</p>
                ))}
              </div>
            ) : (
              <p>
                {source.unavailable
                  ? 'Your saved source could not be opened.'
                  : 'Readable article text is not available here.'}{' '}
                The finding above is the filed research, not an article excerpt.
              </p>
            )}
            {href ? (
              <p>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {atPassage ? 'At the passage ↗' : 'Open original ↗'}
                </a>
                <small className="reading-url">{href}</small>
              </p>
            ) : (
              <p>No safe original link is available.</p>
            )}
            {item.savedArticleId ? (
              <Link to={`/articles/${encodeURIComponent(item.savedArticleId)}`}>
                Open in Library →
              </Link>
            ) : null}
          </>
        ) : null}
        {tab === 'thought' ? (
          <ThoughtComposer
            {...thoughtProps}
            itemId={item.itemId}
            quote={quote}
            label="Your thought"
          />
        ) : null}
      </section>
    </EditionPanel>
  );
}
