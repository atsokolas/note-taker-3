import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import api from '../api';
import useSeoMetadata from '../hooks/useSeoMetadata';
import '../styles/shared-page-column.css';

/* Think no longer publishes. A link saved from when it did opens the wiki page
   the piece settled into, when that page is shared; otherwise one calm line. */
export const NO_LONGER_SHARED = 'This piece is no longer shared here.';

const RetiredShare = ({ kind }) => {
  const { slug = '' } = useParams();
  const [answer, setAnswer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setAnswer(null);
    api.get(`/api/public/retired/${kind}/${encodeURIComponent(slug)}`)
      .then(({ data }) => { if (!cancelled) setAnswer(data?.to ? data : {}); })
      .catch(() => { if (!cancelled) setAnswer({}); });
    return () => { cancelled = true; };
  }, [kind, slug]);

  useSeoMetadata({ title: 'Noeis', description: NO_LONGER_SHARED, robots: 'noindex,nofollow' });

  if (answer?.to) return <Navigate to={answer.to} replace />;
  if (!answer) return null;
  return (
    <main className="shared-concept-page shared-concept-page--error">
      <p className="muted">{NO_LONGER_SHARED}</p>
      <p><Link to="/" className="shared-concept-page__home-link">Noeis</Link></p>
    </main>
  );
};

export default RetiredShare;
