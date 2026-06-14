import React, { useEffect, useState } from 'react';
import Export from './Export';
import { Page, Card, Button } from '../components/ui';
import { Link } from 'react-router-dom';
import { ACCENT_OPTIONS } from '../settings/uiPreferences';
import { resetTourState } from '../api/tourApi';
import { getMarketingFunnelSnapshot } from '../api/marketingAnalytics';
import { getWikiSchema, revertWikiSchema, saveWikiSchema, suggestWikiSchemaUpdates } from '../api/wiki';
import ConnectedAgentsCard from '../components/integrations/ConnectedAgentsCard';
import useAgentTokens from '../hooks/integrations/useAgentTokens';
import { trackWikiSchemaSaved, trackWikiSchemaSuggested } from '../utils/wikiAnalytics';
import { isWikiReadModeV2Enabled } from '../utils/wikiFeatureFlags';
import { TOUR_CACHE_KEY } from '../tour/tourConfig';

const TYPOGRAPHY_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' }
];

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' }
];

const WIKI_SCHEMA_MAX_CHARS = 8000;

const formatEntryLabel = (value = '') => {
  const cleaned = String(value || '').trim();
  if (!cleaned || cleaned === '(unknown)') return 'Unknown entry';
  return cleaned
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const Settings = ({
  uiSettings = { typographyScale: 'default', density: 'comfortable', theme: 'dark', accent: 'electric', brandEnergy: true },
  uiSettingsSaving = false,
  onUiSettingsChange = () => {}
}) => {
  const [marketingFunnel, setMarketingFunnel] = useState(null);
  const [marketingLoading, setMarketingLoading] = useState(true);
  const [marketingError, setMarketingError] = useState('');
  const [wikiSchemaDraft, setWikiSchemaDraft] = useState('');
  const [wikiSchemaSnapshots, setWikiSchemaSnapshots] = useState([]);
  const [wikiSchemaSuggestion, setWikiSchemaSuggestion] = useState(null);
  const [wikiSchemaLoading, setWikiSchemaLoading] = useState(false);
  const [wikiSchemaSaving, setWikiSchemaSaving] = useState(false);
  const [wikiSchemaLoadPending, setWikiSchemaLoadPending] = useState(true);
  const [wikiSchemaError, setWikiSchemaError] = useState('');
  const [wikiSchemaStatus, setWikiSchemaStatus] = useState('');
  const wikiSchemaEnabled = isWikiReadModeV2Enabled();
  const agentTokensModel = useAgentTokens();

  useEffect(() => {
    let cancelled = false;
    const loadMarketingFunnel = async () => {
      setMarketingLoading(true);
      setMarketingError('');
      try {
        const snapshot = await getMarketingFunnelSnapshot({ days: 30 });
        if (!cancelled) {
          setMarketingFunnel(snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setMarketingError(error?.response?.data?.error || 'Failed to load funnel snapshot.');
        }
      } finally {
        if (!cancelled) {
          setMarketingLoading(false);
        }
      }
    };
    loadMarketingFunnel();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!wikiSchemaEnabled) {
      setWikiSchemaLoadPending(false);
      return undefined;
    }
    let cancelled = false;
    const loadWikiSchema = async () => {
      setWikiSchemaLoadPending(true);
      setWikiSchemaError('');
      try {
        const settings = await getWikiSchema();
        if (!cancelled) {
          setWikiSchemaDraft(settings.content || '');
          setWikiSchemaSnapshots(Array.isArray(settings.snapshots) ? settings.snapshots : []);
        }
      } catch (error) {
        if (!cancelled) {
          setWikiSchemaError(error?.response?.data?.error || 'Failed to load wiki schema.');
        }
      } finally {
        if (!cancelled) setWikiSchemaLoadPending(false);
      }
    };
    loadWikiSchema();
    return () => {
      cancelled = true;
    };
  }, [wikiSchemaEnabled]);

  const funnelTotals = marketingFunnel?.totals || {
    signupViewed: 0,
    signupStarted: 0,
    signupsCompleted: 0,
    activatedUsers: 0
  };

  const handleSuggestWikiSchemaUpdates = async () => {
    setWikiSchemaLoading(true);
    setWikiSchemaError('');
    try {
      const result = await suggestWikiSchemaUpdates({ currentSchema: wikiSchemaDraft });
      setWikiSchemaSuggestion(result);
      trackWikiSchemaSuggested({
        runId: result?.runId || '',
        suggestionCount: Array.isArray(result?.suggestions) ? result.suggestions.length : 0
      });
    } catch (error) {
      setWikiSchemaError(error?.response?.data?.error || 'Failed to suggest schema updates.');
    } finally {
      setWikiSchemaLoading(false);
    }
  };

  const handleWikiSchemaDraftChange = (event) => {
    const raw = event.target.value || '';
    if (raw.length > WIKI_SCHEMA_MAX_CHARS) {
      setWikiSchemaDraft(raw.slice(0, WIKI_SCHEMA_MAX_CHARS));
      setWikiSchemaStatus(`Schema is capped at ${WIKI_SCHEMA_MAX_CHARS.toLocaleString()} characters.`);
      return;
    }
    setWikiSchemaDraft(raw);
    setWikiSchemaStatus('');
  };

  const handleSaveWikiSchema = async () => {
    setWikiSchemaSaving(true);
    setWikiSchemaStatus('');
    setWikiSchemaError('');
    try {
      const settings = await saveWikiSchema(wikiSchemaDraft);
      setWikiSchemaDraft(settings.content || '');
      setWikiSchemaSnapshots(Array.isArray(settings.snapshots) ? settings.snapshots : []);
      setWikiSchemaStatus('Wiki schema saved.');
      trackWikiSchemaSaved({
        contentLength: String(settings.content || '').length,
        snapshotCount: Array.isArray(settings.snapshots) ? settings.snapshots.length : 0
      });
    } catch (error) {
      setWikiSchemaError(error?.response?.data?.error || 'Failed to save wiki schema.');
    } finally {
      setWikiSchemaSaving(false);
    }
  };

  const handleRevertWikiSchema = async (snapshotId) => {
    if (!snapshotId) return;
    setWikiSchemaSaving(true);
    setWikiSchemaStatus('');
    setWikiSchemaError('');
    try {
      const settings = await revertWikiSchema(snapshotId);
      setWikiSchemaDraft(settings.content || '');
      setWikiSchemaSnapshots(Array.isArray(settings.snapshots) ? settings.snapshots : []);
      setWikiSchemaStatus('Wiki schema reverted.');
    } catch (error) {
      setWikiSchemaError(error?.response?.data?.error || 'Failed to revert wiki schema.');
    } finally {
      setWikiSchemaSaving(false);
    }
  };

  return (
    <Page className="settings-page">
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Settings</h1>
        <p className="muted">Export your data and keep your workspace organized.</p>
      </div>
      <Card className="settings-card">
        <div className="settings-appearance-header">
          <div>
            <h2>Workspace appearance</h2>
            <p className="muted">Adjust typography scale, layout density, and color style.</p>
          </div>
          <p className="muted-label">{uiSettingsSaving ? 'Saving…' : 'Saved'}</p>
        </div>

        <div className="settings-option-group">
          <p className="muted-label">Typography</p>
          <div className="settings-option-row">
            {TYPOGRAPHY_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`settings-option-button${uiSettings.typographyScale === option.value ? ' is-active' : ''}`}
                onClick={() => onUiSettingsChange({ typographyScale: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-option-group">
          <p className="muted-label">Density</p>
          <div className="settings-option-row">
            {DENSITY_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`settings-option-button${uiSettings.density === option.value ? ' is-active' : ''}`}
                onClick={() => onUiSettingsChange({ density: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-option-group">
          <p className="muted-label">Theme</p>
          <div className="settings-option-row">
            <button
              type="button"
              className="settings-option-button is-active"
              onClick={() => onUiSettingsChange({ theme: 'dark' })}
            >
              Dark (Noeis)
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            The rebrand is tuned for deep-focus dark mode only.
          </p>
        </div>

        <div className="settings-option-group">
          <p className="muted-label">Accent color</p>
          <div className="settings-option-row">
            {ACCENT_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`settings-option-button settings-accent-button${uiSettings.accent === option.value ? ' is-active' : ''}`}
                onClick={() => onUiSettingsChange({ accent: option.value })}
              >
                <span className="settings-accent-swatch" style={{ background: option.color }} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-option-group">
          <p className="muted-label">Brand energy</p>
          <div className="settings-option-row">
            <button
              type="button"
              className={`settings-option-button${uiSettings.brandEnergy ? ' is-active' : ''}`}
              onClick={() => onUiSettingsChange({ brandEnergy: true })}
            >
              On
            </button>
            <button
              type="button"
              className={`settings-option-button${!uiSettings.brandEnergy ? ' is-active' : ''}`}
              onClick={() => onUiSettingsChange({ brandEnergy: false })}
            >
              Off
            </button>
          </div>
        </div>
      </Card>

      <Card className="settings-card">
        <h2>Onboarding</h2>
        <p className="muted">Need a refresher? Restart the onboarding guide.</p>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await resetTourState();
            } catch (error) {
              console.error('Failed to reset tour state:', error);
            }
            localStorage.removeItem(TOUR_CACHE_KEY);
          }}
        >
          Restart Onboarding
        </Button>
      </Card>
      <Card className="settings-card">
        <h2>Connections</h2>
        <p className="muted">Sources, agents, and advanced bridge settings live in one center.</p>
        <Link to="/connections" className="ui-button ui-button-secondary">
          Open connections
        </Link>
      </Card>
      <ConnectedAgentsCard tokenModel={agentTokensModel} />
      {wikiSchemaEnabled ? (
      <Card className="settings-card">
        <div className="settings-appearance-header">
          <div>
            <h2>Wiki schema</h2>
            <p className="muted">Free-form markdown instructions appended to wiki maintenance, ingest, and ask prompts.</p>
          </div>
          <p className="muted-label">
            {wikiSchemaSaving ? 'Saving…' : `${wikiSchemaDraft.length.toLocaleString()} / ${WIKI_SCHEMA_MAX_CHARS.toLocaleString()}`}
          </p>
        </div>
        {wikiSchemaLoadPending ? (
          <p className="muted">Loading wiki schema…</p>
        ) : (
          <textarea
            className="settings-wiki-schema-editor"
            value={wikiSchemaDraft}
            onChange={handleWikiSchemaDraftChange}
            placeholder="Paste the current wiki schema markdown here."
            aria-label="Current wiki schema"
            maxLength={WIKI_SCHEMA_MAX_CHARS}
            rows={12}
            style={{ width: '100%', marginTop: 12 }}
          />
        )}
        <div className="settings-option-row" style={{ marginTop: 12 }}>
          <Button
            variant="secondary"
            onClick={handleSaveWikiSchema}
            disabled={wikiSchemaSaving || wikiSchemaLoadPending}
          >
            Save wiki schema
          </Button>
          <Button
            variant="secondary"
            onClick={handleSuggestWikiSchemaUpdates}
            disabled={wikiSchemaLoading || wikiSchemaLoadPending}
          >
            {wikiSchemaLoading ? 'Suggesting...' : 'Suggest schema updates'}
          </Button>
        </div>
        {wikiSchemaStatus && <p className="status-message">{wikiSchemaStatus}</p>}
        {wikiSchemaError && <p className="status-message error-message">{wikiSchemaError}</p>}
        <div className="settings-option-group">
          <p className="muted-label">Snapshots</p>
          {wikiSchemaSnapshots.length === 0 ? (
            <p className="muted small">No saved snapshots yet.</p>
          ) : (
            <div className="settings-option-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {wikiSchemaSnapshots.slice(0, 5).map((snapshot) => (
                <button
                  key={snapshot.id}
                  type="button"
                  className="settings-option-button"
                  onClick={() => handleRevertWikiSchema(snapshot.id)}
                  disabled={wikiSchemaSaving}
                >
                  Revert to {snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'snapshot'}
                </button>
              ))}
            </div>
          )}
        </div>
        {wikiSchemaSuggestion?.summary && (
          <div className="settings-option-group">
            <p className="muted">{wikiSchemaSuggestion.summary}</p>
            <textarea
              readOnly
              aria-label="Suggested wiki schema patch"
              value={wikiSchemaSuggestion.proposedPatch || ''}
              rows={10}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </Card>
      ) : null}
      <Card className="settings-card">
        <h2>Organic funnel</h2>
        <p className="muted">Last 30 days of SEO/AEO traffic progressing from signup view to activated user.</p>
        {marketingLoading && <p className="muted">Loading funnel snapshot…</p>}
        {!marketingLoading && marketingError && <p className="status-message error-message">{marketingError}</p>}
        {!marketingLoading && !marketingError && (
          <>
            <div className="settings-option-row" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div className="settings-option-button is-active" style={{ minWidth: 140 }}>
                <span className="muted-label">Viewed</span>
                <div>{funnelTotals.signupViewed}</div>
              </div>
              <div className="settings-option-button is-active" style={{ minWidth: 140 }}>
                <span className="muted-label">Started</span>
                <div>{funnelTotals.signupStarted}</div>
              </div>
              <div className="settings-option-button is-active" style={{ minWidth: 140 }}>
                <span className="muted-label">Signed up</span>
                <div>{funnelTotals.signupsCompleted}</div>
              </div>
              <div className="settings-option-button is-active" style={{ minWidth: 140 }}>
                <span className="muted-label">Activated</span>
                <div>{funnelTotals.activatedUsers}</div>
              </div>
            </div>

            <div className="settings-option-group">
              <p className="muted-label">Top entry pages</p>
              {(marketingFunnel?.byEntry || []).length === 0 ? (
                <p className="muted small">No attributed marketing entries yet.</p>
              ) : (
                <div className="settings-option-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  {marketingFunnel.byEntry.slice(0, 5).map((row) => (
                    <div key={row.entry} className="settings-option-button" style={{ justifyContent: 'space-between' }}>
                      <span>{formatEntryLabel(row.entry)}</span>
                      <span className="muted small">
                        {row.signupsCompleted} signups · {row.activatedUsers} activated
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="settings-option-group">
              <p className="muted-label">Top sources</p>
              {(marketingFunnel?.bySource || []).length === 0 ? (
                <p className="muted small">No source data yet.</p>
              ) : (
                <div className="settings-option-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  {marketingFunnel.bySource.slice(0, 5).map((row) => (
                    <div key={`${row.utmSource}-${row.utmMedium}`} className="settings-option-button" style={{ justifyContent: 'space-between' }}>
                      <span>{`${row.utmSource} / ${row.utmMedium}`}</span>
                      <span className="muted small">
                        {row.activatedUsers} activated
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="settings-option-row" style={{ marginTop: 16 }}>
              <Link to="/marketing-analytics" className="ui-button ui-button-secondary">
                Open full analytics
              </Link>
              <Link to="/search-console-opportunities" className="ui-button ui-button-secondary">
                Open Search Console importer
              </Link>
            </div>
          </>
        )}
      </Card>
      <Card className="settings-card">
        <h2>Growth ops</h2>
        <p className="muted">Turn Search Console exports into concrete page actions and keep the editorial backlog query-driven.</p>
        <div className="settings-option-row">
          <Link to="/search-console-opportunities" className="ui-button ui-button-secondary">
            Review opportunities
          </Link>
          <Link to="/marketing-analytics" className="ui-button ui-button-secondary">
            Review funnel performance
          </Link>
        </div>
      </Card>
      <Export embedded />
    </Page>
  );
};

export default Settings;
