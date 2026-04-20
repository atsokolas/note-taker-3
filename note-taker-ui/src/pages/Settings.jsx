import React, { useEffect, useState } from 'react';
import Export from './Export';
import { Page, Card, Button } from '../components/ui';
import { Link } from 'react-router-dom';
import { ACCENT_OPTIONS } from '../settings/uiPreferences';
import { resetTourState } from '../api/tourApi';
import { getMarketingFunnelSnapshot } from '../api/marketingAnalytics';
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

  const funnelTotals = marketingFunnel?.totals || {
    signupViewed: 0,
    signupStarted: 0,
    signupsCompleted: 0,
    activatedUsers: 0
  };

  return (
    <Page>
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
        <h2>Agents & integrations</h2>
        <p className="muted">Set up your personal agent and connect BYO runtimes.</p>
        <Link to="/integrations" className="ui-button ui-button-secondary">
          Set up agents
        </Link>
      </Card>
      <Card className="settings-card">
        <h2>Data integrations</h2>
        <p className="muted">Import Readwise CSVs and markdown notes on a dedicated page.</p>
        <Link to="/data-integrations" className="ui-button ui-button-secondary">
          Open data integrations
        </Link>
      </Card>
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
      <Export />
    </Page>
  );
};

export default Settings;
