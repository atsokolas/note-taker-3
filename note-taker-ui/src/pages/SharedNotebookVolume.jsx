import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicVolume } from '../api/notebook';
import NotebookVolumePage from '../components/think/notebook/NotebookVolumePage';
import useSeoMetadata from '../hooks/useSeoMetadata';
import '../components/think/notebook/notebookShare.css';

const firstLine = (snapshot) => String(snapshot?.introduction || snapshot?.title || '').slice(0, 220);

const SharedNotebookVolume = () => {
  const { slug = '' } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    setSnapshot(null);
    getPublicVolume(slug)
      .then((found) => { if (!cancelled) setSnapshot(found); })
      .catch(() => {
        if (!cancelled) setError('This volume is not published.');
      });
    return () => { cancelled = true; };
  }, [slug]);

  const title = snapshot ? `${snapshot.title} · Noeis` : 'Noeis';
  const description = snapshot
    ? firstLine(snapshot)
    : 'This volume is not published.';

  useSeoMetadata({
    title,
    description,
    canonicalPath: `/share/volumes/${slug}`,
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
    <main className="shared-notebook-page" data-testid="shared-volume">
      <NotebookVolumePage snapshot={snapshot} />
    </main>
  );
};

export default SharedNotebookVolume;
