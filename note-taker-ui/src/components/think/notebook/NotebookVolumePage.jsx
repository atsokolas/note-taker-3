import React from 'react';
import { Link } from 'react-router-dom';
import NotebookEssay from './NotebookEssay';
import { VOLUME_SHARE_COLOPHON } from './notebookShareFixture';
import './notebookShare.css';

const pieceKey = (piece, index) => piece?.id || `${piece?.title || 'piece'}-${index}`;

const PrintVolume = () => (
  <p className="shared-notebook-page__print">
    <button type="button" onClick={() => window.print()}>
      Print this volume
    </button>
  </p>
);

export default function NotebookVolumePage({ snapshot, compact = false }) {
  if (!snapshot) return null;
  const contents = Array.isArray(snapshot.contents) ? snapshot.contents : [];
  const sources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
  const pieces = Array.isArray(snapshot.pieces) ? snapshot.pieces : [];
  const when = snapshot.publishedAt
    ? new Date(snapshot.publishedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
    : '';
  const by = snapshot.ownerDisplayName
    ? (when ? `Collected by ${snapshot.ownerDisplayName} · ${when}` : `Collected by ${snapshot.ownerDisplayName}`)
    : when;

  return (
    <div className="shared-notebook-page__inner notebook-volume-page">
      {compact ? null : <Link to="/" className="shared-notebook-page__home">Noeis</Link>}
      <header className="notebook-essay__header">
        <p className="notebook-essay__eyebrow">Collected volume</p>
        <h1 className="notebook-essay__title">{snapshot.title || 'Untitled'}</h1>
        {by ? <p className="notebook-essay__by">{by}</p> : null}
        {snapshot.revisedAt ? (
          <p className="notebook-essay__revised">
            Updated {new Date(snapshot.revisedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
        ) : null}
        {snapshot.correction ? (
          <p className="notebook-essay__correction">{snapshot.correction}</p>
        ) : null}
      </header>
      {snapshot.introduction ? (
        <p className="notebook-volume-page__intro">{snapshot.introduction}</p>
      ) : null}
      {contents.length ? (
        <nav className="notebook-volume-page__contents" aria-label="Reading order">
          <p className="notebook-essay__eyebrow">Contents</p>
          <ol>
            {contents.map((entry, index) => (
              <li key={pieceKey(entry, index)}>
                <span>{entry.title}</span>
                {Array.isArray(entry.ideas) && entry.ideas.length ? (
                  <span className="notebook-volume-page__ideas">{entry.ideas.join(' · ')}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {compact ? null : pieces.map((piece, index) => (
        <NotebookEssay
          key={pieceKey(piece, index)}
          snapshot={piece}
          chapter
        />
      ))}
      {sources.length ? (
        <section className="notebook-volume-page__sources" aria-label="Sources">
          <p className="notebook-essay__eyebrow">Sources</p>
          <ul>
            {sources.map((source) => (
              <li key={source.href || source.title}>
                {source.href ? (
                  <a href={source.href} rel="noopener noreferrer">{source.title || source.href}</a>
                ) : source.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="shared-notebook-page__colophon">{VOLUME_SHARE_COLOPHON}</p>
      {compact ? null : <PrintVolume />}
    </div>
  );
}
