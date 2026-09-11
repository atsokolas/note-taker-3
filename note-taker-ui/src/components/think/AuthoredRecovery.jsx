import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import authoredExplorations, { libraryExplorations, authoredWorkError } from '../../api/authoredExplorations';
import AuthoredWorkList from '../wiki/open-sentence/AuthoredWorkList';
import AuthoredContinuityTools from '../wiki/open-sentence/AuthoredContinuityTools';
import '../wiki/open-sentence/open-sentence.css';

export default function AuthoredRecovery({ workId }) {
  const [work, setWork] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setWork(null);
    setError('');
    authoredExplorations.read(workId).then(({ exploration, userId }) => {
      if (active) setWork({ owner: userId, record: { revision: exploration.revision, draft: exploration.draft, saved: { ...exploration, sourceUnavailable: true } } });
    }).catch(failure => { if (active) setError(authoredWorkError(failure, 'Your writing could not be opened.')); });
    return () => { active = false; };
  }, [attempt, workId]);
  const record = work?.record;
  const saved = record?.saved;
  const scopeId = saved?.articleId || saved?.pageId;
  const itemId = saved?.highlightId || saved?.claimId;
  const api = saved?.articleId ? libraryExplorations : authoredExplorations;
  return <article className="noeis-editorial authored-recovery">
    <p><Link to="/think">Back to your writing</Link></p>
    <h1>{record?.draft.title || 'Your saved writing'}</h1>
    <p>This is your recorded work. Its original source may have moved or become unavailable. The quotation here is the copy you wrote against.</p>
    {error ? <p role="alert">{error} <button onClick={() => setAttempt(value => value + 1)}>Try again</button></p> : !work ? <p role="status">Opening your writing…</p> : null}
    {work && !record ? <p role="status">Exploration discarded. Your kept copies remain independent.</p> : null}
    {record ? <>
      <AuthoredWorkList records={{ [itemId]: record }} openedId={itemId}
        missingMessage="Your words and recorded source context are preserved. This does not restore access to the original source."
        onDiscard={async () => {
          setWork({ ...work, record: { ...record, saving: true } });
          try {
            await api.discard(scopeId, itemId, record.revision);
            setWork({ ...work, record: null });
          } catch (failure) {
            setWork({ ...work, record: { ...record, conflict: failure.response?.status === 409 ? failure.response.data?.current : null } });
            throw failure;
          }
        }}
        onKeep={async (_, destination) => { await api.keep(scopeId, itemId, { expectedRevision: record.revision, destination, mutationId: saved.keeps.find(keep => keep.destination === destination)?.mutationId }); setAttempt(value => value + 1); }}
        onResolveConflict={() => {
          const current = record.conflict;
          if (current) setWork({ ...work, record: { revision: current.revision, draft: current.draft, saved: { ...current, sourceUnavailable: true } } });
        }} />
      <AuthoredContinuityTools authorship={work} recovery />
    </> : null}
  </article>;
}
