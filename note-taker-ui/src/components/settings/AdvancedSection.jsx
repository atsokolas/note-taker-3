import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWikiSchema, revertWikiSchema, saveWikiSchema, suggestWikiSchemaUpdates } from '../../api/wiki';
import { resetTourState } from '../../api/tourApi';
import { TOUR_CACHE_KEY } from '../../tour/tourConfig';
import { isWikiReadModeV2Enabled } from '../../utils/wikiFeatureFlags';
import { trackWikiSchemaSaved, trackWikiSchemaSuggested } from '../../utils/wikiAnalytics';
import SystemInventoryCard from './SystemInventoryCard';
import { Card } from '../ui';
import { buildSettingsDiagnosticReport } from '../../settings/settingsDiagnostics';

const WIKI_SCHEMA_MAX_CHARS = 8000;

const AdvancedSection = ({ uiSettings = {}, section = 'advanced' }) => {
  const wikiEnabled = isWikiReadModeV2Enabled();
  const [wikiDraft, setWikiDraft] = useState('');
  const [wikiBaseline, setWikiBaseline] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [wikiLoading, setWikiLoading] = useState(wikiEnabled);
  const [wikiSaving, setWikiSaving] = useState(false);
  const [wikiError, setWikiError] = useState('');
  const [wikiStatus, setWikiStatus] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [inspectSnapshot, setInspectSnapshot] = useState(null);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!wikiEnabled) {
      setWikiLoading(false);
      return undefined;
    }
    let cancelled = false;
    getWikiSchema()
      .then((settings) => {
        if (cancelled) return;
        const content = settings.content || '';
        setWikiDraft(content);
        setWikiBaseline(content);
        setSnapshots(Array.isArray(settings.snapshots) ? settings.snapshots : []);
      })
      .catch((error) => {
        if (!cancelled) setWikiError(error?.response?.data?.error || 'Failed to load wiki instructions.');
      })
      .finally(() => { if (!cancelled) setWikiLoading(false); });
    return () => { cancelled = true; };
  }, [wikiEnabled]);

  const overLimit = wikiDraft.length > WIKI_SCHEMA_MAX_CHARS;

  const saveInstructions = async () => {
    if (overLimit || wikiDraft === wikiBaseline) return;
    setWikiSaving(true);
    setWikiError('');
    try {
      const settings = await saveWikiSchema(wikiDraft);
      setWikiBaseline(settings.content || '');
      setWikiDraft(settings.content || '');
      setSnapshots(Array.isArray(settings.snapshots) ? settings.snapshots : []);
      setWikiStatus('Wiki instructions saved.');
      setReviewOpen(false);
      trackWikiSchemaSaved({
        contentLength: String(settings.content || '').length,
        snapshotCount: Array.isArray(settings.snapshots) ? settings.snapshots.length : 0
      });
    } catch (error) {
      setWikiError(error?.response?.data?.error || 'Failed to save wiki instructions.');
    } finally {
      setWikiSaving(false);
    }
  };

  const loadSnapshotIntoDraft = (snapshot) => {
    setWikiDraft(snapshot.content || '');
    setWikiStatus('Earlier instructions loaded as a draft. Review before saving.');
    setInspectSnapshot(null);
  };

  const restoreSnapshot = async (snapshotId) => {
    if (!snapshotId) return;
    setWikiSaving(true);
    try {
      const settings = await revertWikiSchema(snapshotId);
      setWikiBaseline(settings.content || '');
      setWikiDraft(settings.content || '');
      setSnapshots(Array.isArray(settings.snapshots) ? settings.snapshots : []);
      setWikiStatus('Restored as a new current version.');
    } catch (error) {
      setWikiError(error?.response?.data?.error || 'Failed to restore instructions.');
    } finally {
      setWikiSaving(false);
    }
  };

  const suggestUpdates = async () => {
    setWikiSaving(true);
    try {
      const result = await suggestWikiSchemaUpdates({ currentSchema: wikiDraft });
      setSuggestion(result);
      trackWikiSchemaSuggested({
        runId: result?.runId || '',
        suggestionCount: Array.isArray(result?.suggestions) ? result.suggestions.length : 0
      });
    } catch (error) {
      setWikiError(error?.response?.data?.error || 'Failed to suggest updates.');
    } finally {
      setWikiSaving(false);
    }
  };

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

      {wikiEnabled ? (
        <div className="settings-redesign__panel-columns" style={{ marginBottom: '2rem' }}>
          <div>
            <h3 id="wiki-instructions" style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Wiki instructions</h3>
            <p className="settings-redesign__help">Guidance used when working on Wiki pages. It is not a permission policy.</p>
            {wikiLoading ? <p className="settings-redesign__help">Loading…</p> : (
              <>
                <textarea
                  className="noeis-form-control"
                  value={wikiDraft}
                  onChange={(event) => setWikiDraft(event.target.value)}
                  aria-label="Wiki instructions"
                  rows={12}
                  style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <span className="settings-redesign__help">{wikiDraft !== wikiBaseline ? 'Draft changes' : 'Current saved instructions'}</span>
                  <span className="settings-redesign__help">{wikiDraft.length.toLocaleString()} / {WIKI_SCHEMA_MAX_CHARS.toLocaleString()}</span>
                </div>
                {overLimit ? (
                  <p className="settings-redesign__help" role="status" style={{ color: 'var(--noeis-error, #974d3c)' }}>
                    Over the limit. Your text is intact; shorten it before saving.
                  </p>
                ) : null}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="settings-redesign__btn is-primary"
                    disabled={wikiDraft === wikiBaseline || overLimit || wikiSaving}
                    onClick={() => setReviewOpen(true)}
                  >
                    Review changes
                  </button>
                  <button type="button" className="settings-redesign__link" onClick={() => setWikiDraft(wikiBaseline)}>Discard draft</button>
                  <button type="button" className="settings-redesign__link" onClick={suggestUpdates} disabled={wikiSaving}>Suggest updates</button>
                </div>
              </>
            )}
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Earlier instructions</h4>
              {snapshots.length === 0 ? (
                <p className="settings-redesign__help">No earlier versions yet.</p>
              ) : snapshots.slice(0, 8).map((snapshot) => (
                <div key={snapshot.id} className="settings-redesign__fact">
                  <span>{snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'Version'}</span>
                  <button type="button" className="settings-redesign__link" onClick={() => setInspectSnapshot(snapshot)}>Inspect →</button>
                </div>
              ))}
            </div>
          </div>
          <aside className="settings-redesign__quiet">
            <span className="settings-redesign__eyebrow">Before you apply</span>
            <h3 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Instructions,<br />not permission.</h3>
            <p className="settings-redesign__help">Saving this text does not grant access or rewrite existing pages.</p>
            <details>
              <summary className="settings-redesign__link">Used by</summary>
              <p className="settings-redesign__help">Wiki maintenance, ingest, and ask flows when enabled.</p>
            </details>
            <Link to="/connections" className="settings-redesign__link">Manage agent access ↗</Link>
          </aside>
        </div>
      ) : null}

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
            setWikiStatus('Onboarding guide reset for this account.');
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

      {wikiStatus ? <div className="settings-redesign__receipt" role="status">{wikiStatus}</div> : null}
      {wikiError ? <div className="settings-redesign__receipt is-error" role="alert">{wikiError}</div> : null}
      {suggestion?.summary ? <p className="settings-redesign__help">{suggestion.summary}</p> : null}

      {reviewOpen ? (
        <dialog className="settings-redesign__dialog" open>
          <h2 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Review these instructions</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div><h3 className="settings-redesign__eyebrow">Current</h3><pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>{wikiBaseline}</pre></div>
            <div><h3 className="settings-redesign__eyebrow">Proposed</h3><pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>{wikiDraft}</pre></div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="settings-redesign__btn is-primary" onClick={saveInstructions} disabled={wikiSaving}>Save instructions</button>
            <button type="button" className="settings-redesign__link" onClick={() => setReviewOpen(false)}>Keep editing</button>
          </div>
        </dialog>
      ) : null}

      {inspectSnapshot ? (
        <dialog className="settings-redesign__dialog" open>
          <h2 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Earlier instructions</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>{inspectSnapshot.content}</pre>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="settings-redesign__btn" onClick={() => loadSnapshotIntoDraft(inspectSnapshot)}>Load into draft</button>
            <button type="button" className="settings-redesign__btn" onClick={() => restoreSnapshot(inspectSnapshot.id)}>Restore as current</button>
            <button type="button" className="settings-redesign__link" onClick={() => setInspectSnapshot(null)}>Close</button>
          </div>
        </dialog>
      ) : null}

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
