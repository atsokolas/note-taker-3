import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicNotebook } from '../api/notebook';
import NotebookEssay from '../components/think/notebook/NotebookEssay';
import useSeoMetadata from '../hooks/useSeoMetadata';
import '../components/think/notebook/notebookShare.css';

const firstLine = (snapshot) => {
  const block = (snapshot?.blocks || []).find((item) => String(item?.text || '').trim());
  return String(block?.text || snapshot?.title || '').slice(0, 220);
};

const SharedNotebook = () => {
  const { slug = '' } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    setSnapshot(null);
    getPublicNotebook(slug)
      .then((found) => { if (!cancelled) setSnapshot(found); })
      .catch(() => {
        if (!cancelled) setError('This note is not published.');
      });
    return () => { cancelled = true; };
  }, [slug]);

  const title = snapshot ? `${snapshot.title} · Noeis` : 'Noeis';
  const description = snapshot
    ? firstLine(snapshot)
    : 'This note is not published.';

  useSeoMetadata({
    title,
    description,
    canonicalPath: `/share/notebooks/${slug}`,
    robots: 'noindex,nofollow'
  });

  if (error) {
    return (
      <main className="shared-notebook-page">
        <p className="shared-notebook-page__quiet">{error}</p>
        <Link to="/" className="shared-notebook-page__home">Noeis</Link>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="shared-notebook-page">
        <p className="shared-notebook-page__quiet" role="status">Opening…</p>
      </main>
    );
  }

  return (
    <main className="shared-notebook-page" data-testid="shared-notebook">
      <div className="shared-notebook-page__inner">
        <Link to="/" className="shared-notebook-page__home">Noeis</Link>
        <NotebookEssay snapshot={snapshot} />
        <p className="shared-notebook-page__colophon">
          This is the version that was published. Later private edits do not
          change it. Ordinary copy of the visible text is allowed.
        </p>
      </div>
    </main>
  );
};

export default SharedNotebook;
