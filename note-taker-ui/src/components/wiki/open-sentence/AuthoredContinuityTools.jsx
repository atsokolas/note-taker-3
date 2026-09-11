import React, { useState } from 'react';
import authoredExplorations, { authoredWorkError } from '../../../api/authoredExplorations';
import { downloadAuthoredFile, fieldKitChanges, fieldKitDocument, readFieldKit } from '../../../utils/authoredFieldKit';

// Chosen checkpoints and portable writing share the existing save contract.
export default function AuthoredContinuityTools({ authorship, recovery = false }) {
  const { record, owner } = authorship;
  const [versions, setVersions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!record?.saved?.id || !owner) return null;
  const ready = !record.dirty && !record.saving && !record.error && !record.conflict && !busy;
  const run = async action => {
    setBusy(true);
    setMessage('');
    try { await action(); }
    catch (error) { setMessage(authoredWorkError(error, 'This could not finish. Your writing is still here.')); }
    finally { setBusy(false); }
  };
  return <>
    <details className="open-sentence-continuity" onToggle={event => {
      if (event.currentTarget.open && versions === null && !busy) run(async () => {
        setVersions((await authoredExplorations.read(record.saved.id)).versions);
      });
    }}>
      <summary>Saved versions</summary>
      <p className="open-sentence-pocket__save">Keep up to 12 chosen versions. Saving another beyond that replaces the oldest. Discard removes this history too.</p>
      {!recovery ? <button type="button" disabled={!ready} onClick={() => run(async () => {
        setVersions(await authoredExplorations.saveVersion(record.saved.id, record.revision));
        setMessage('This version is saved. Your writing can keep growing.');
      })}>Save this version</button> : null}
      {versions?.length === 0 ? <p>No chosen versions yet.</p> : null}
      {versions?.slice().reverse().map(version => <details key={version.revision}>
        <summary>{version.draft.title || 'Untitled'} · {new Date(version.savedAt).toLocaleString()}</summary>
        {Object.entries(fieldKitChanges(version.draft)).filter(([, text]) => text).map(([key, text]) => <div key={key}><small>{{ title: 'Title', writing: 'Your writing', question: 'Question', returnNote: 'Return note' }[key]}</small><p className="open-sentence-pocket__prior-writing">{text}</p></div>)}
        {version.origin?.claimText || version.draft.originalText ? <blockquote><cite>{version.origin?.pageTitle}</cite><p>{version.origin?.claimText || version.draft.originalText}</p></blockquote> : null}
        {version.draft.selectedSource?.passage ? <blockquote>{version.draft.selectedSource.passage}</blockquote> : null}
        {!recovery ? <button type="button" disabled={!ready} onClick={() => run(async () => {
          authorship.restoreWriting({ revision: record.revision, fields: fieldKitChanges(version.draft) });
          setMessage('Earlier writing restored for saving. Its sources and experiments remain in the saved version.');
        })}>Use this writing</button> : null}
      </details>)}
    </details>
    <details className="open-sentence-continuity">
      <summary>Take this work offline</summary>
      <p className="open-sentence-pocket__save">Download your writing and its recorded source excerpts. Open the file without a connection; save a changes file and bring it back here. Downloads remain on your device after sign-out.</p>
      <button type="button" disabled={!ready} onClick={() => run(async () => {
        downloadAuthoredFile(fieldKitDocument({ owner, record }), 'noeis-field-kit.html', 'text/html');
        setMessage('Field kit download requested. Keep the file where you can find it.');
      })}>Download field kit</button>
      {!recovery ? <label className="open-sentence-pocket__label">
        Bring back offline changes
        <input type="file" accept=".json,application/json" disabled={!ready} onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          run(async () => {
            if (file.size > 150000) throw new Error('This changes file is too large.');
            authorship.restoreWriting(readFieldKit(await file.text(), { owner, record }));
            setMessage('Your offline writing is here. Review any changed version before saving.');
          });
        }} />
      </label> : <p>The original source is unavailable. This file preserves your words; it cannot send changes to that source.</p>}
    </details>
    {message ? <p className="open-sentence-pocket__save" role="status">{message}</p> : null}
  </>;
}
