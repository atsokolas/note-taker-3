import React, { useState } from 'react';
import { exportDecisionMemory, holdDecisionCase, importDecisionMemory } from '../../api/judgmentResolution';
import { useSystemStatusControls } from '../../system/SystemStatusContext';

const TakeThePaper = ({ pageId }) => {
  const systemStatus = useSystemStatusControls();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);

  const download = async () => {
    if (busy) return;
    setBusy('export');
    setError('');
    try {
      const bundle = await exportDecisionMemory();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'noeis-decision-memory.json';
      link.click();
      URL.revokeObjectURL(url);
      systemStatus.setLatestReceipt?.({
        id: bundle?.digest || 'export',
        title: 'The paper left with you',
        summary: 'A signed export with provenance.',
        completedAt: new Date().toISOString()
      });
    } catch (_exportError) {
      setError('The export could not be sealed.');
    } finally {
      setBusy('');
    }
  };

  const onImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy('import');
    setError('');
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const result = await importDecisionMemory(bundle);
      if (!result?.ok) throw new Error('invalid');
      systemStatus.setLatestReceipt?.({
        id: result.digest || 'import',
        title: 'The paper came home',
        summary: 'The seals matched.',
        completedAt: new Date().toISOString()
      });
    } catch (_importError) {
      setError('That file could not be read as a sealed export.');
    } finally {
      setBusy('');
      event.target.value = '';
    }
  };

  const hold = async () => {
    if (!pageId || busy) return;
    setBusy('hold');
    setError('');
    try {
      await holdDecisionCase({ pageId, kind: 'legal', note: 'Hold this case.' });
      systemStatus.setLatestReceipt?.({
        id: `hold:${pageId}`,
        title: 'A hold was placed',
        summary: 'This case will not be forgotten while the hold stands.',
        completedAt: new Date().toISOString()
      });
    } catch (_holdError) {
      setError('The hold could not be placed.');
    } finally {
      setBusy('');
    }
  };

  if (!open) {
    return (
      <section className="take-the-paper">
        <button type="button" className="take-the-paper__quiet" onClick={() => setOpen(true)}>
          Take the paper with you
        </button>
      </section>
    );
  }

  return (
    <section className="take-the-paper" aria-labelledby="take-the-paper-title">
      <h2 id="take-the-paper-title">Take the paper with you</h2>
      <p>A complete export with provenance. The seals still verify outside Noeis.</p>
      <button type="button" disabled={Boolean(busy)} onClick={download}>
        {busy === 'export' ? 'Sealing…' : 'Export'}
      </button>
      <label>
        Bring a sealed export back
        <input type="file" accept="application/json" onChange={onImport} disabled={Boolean(busy)} />
      </label>
      {pageId ? (
        <button type="button" disabled={Boolean(busy)} onClick={hold}>
          Place a legal hold
        </button>
      ) : null}
      {error ? <p className="take-the-paper__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default TakeThePaper;
