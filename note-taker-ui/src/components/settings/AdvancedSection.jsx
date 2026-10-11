import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetTourState } from '../../api/tourApi';
import { TOUR_CACHE_KEY } from '../../tour/tourConfig';
import SystemInventoryCard from './SystemInventoryCard';
import { Card } from '../ui';
import { buildSettingsDiagnosticReport } from '../../settings/settingsDiagnostics';

const AdvancedSection = ({ uiSettings = {}, section = 'advanced' }) => {
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [status, setStatus] = useState('');

  const diagnosticReport = buildSettingsDiagnosticReport({
    section,
    uiSettings,
    saveStage: 'idle'
  });

  const copyDiagnostic = async () => {
    const text = JSON.stringify(diagnosticReport, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Diagnostic copied.');
    } catch (_error) {
      setCopyStatus('Clipboard unavailable. Select the report below.');
    }
  };

  return (
    <section>
      <div className="settings-redesign__pagehead">
        <div>
          <h2>Advanced</h2>
          <p className="settings-redesign__help" style={{ marginTop: '0.45rem' }}>Tools that deserve a deliberate visit.</p>
        </div>
      </div>

      <div id="settings-diagnostics" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Diagnostics</h3>
        <p className="settings-redesign__help">A small redacted report for support. No reading text or credentials.</p>
        <button type="button" className="settings-redesign__btn" onClick={() => setDiagnosticOpen(true)}>Review diagnostic report</button>
      </div>

      <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--settings-rule)', paddingTop: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Help & onboarding</h3>
        <p className="settings-redesign__help">Open keyboard help from the top bar. A refresher does not erase drafts or imports.</p>
        <Link to="/how-to-use" className="settings-redesign__link">Help & shortcuts</Link>
        <button
          type="button"
          className="settings-redesign__btn"
          style={{ marginLeft: '1rem' }}
          onClick={async () => {
            try {
              await resetTourState();
            } catch (error) {
              console.error('Failed to reset tour state:', error);
            }
            localStorage.removeItem(TOUR_CACHE_KEY);
            setStatus('Onboarding guide reset for this account.');
          }}
        >
          Show the guide again
        </button>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Product administration</h3>
        <p className="settings-redesign__help">Operator analytics and growth tools stay on their own routes.</p>
        <Link to="/marketing-analytics" className="settings-redesign__link">Marketing analytics ↗</Link>
        {' · '}
        <Link to="/search-console-opportunities" className="settings-redesign__link">Search Console importer ↗</Link>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <SystemInventoryCard Card={Card} theme={uiSettings.theme} />
      </div>

      {status ? <div className="settings-redesign__receipt" role="status">{status}</div> : null}

      {diagnosticOpen ? (
        <dialog className="settings-redesign__dialog" open>
          <h2 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Diagnostic report</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.6875rem' }}>{JSON.stringify(diagnosticReport, null, 2)}</pre>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="settings-redesign__btn is-primary" onClick={copyDiagnostic}>Copy report</button>
            <button type="button" className="settings-redesign__link" onClick={() => setDiagnosticOpen(false)}>Close</button>
          </div>
          {copyStatus ? <p className="settings-redesign__help" role="status">{copyStatus}</p> : null}
        </dialog>
      ) : null}
    </section>
  );
};

export default AdvancedSection;
