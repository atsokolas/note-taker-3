import React from 'react';
import Export from './Export';
import { Page, Card, Button } from '../components/ui';
import { Link } from 'react-router-dom';
import { ACCENT_OPTIONS } from '../settings/uiPreferences';
import { resetTourState } from '../api/tourApi';
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

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
];

const Settings = ({
  uiSettings = { typographyScale: 'default', density: 'comfortable', theme: 'light', accent: 'blue', brandEnergy: true },
  uiSettingsSaving = false,
  onUiSettingsChange = () => {}
}) => {
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
            {THEME_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`settings-option-button${uiSettings.theme === option.value ? ' is-active' : ''}`}
                onClick={() => onUiSettingsChange({ theme: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
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
      <Export />
    </Page>
  );
};

export default Settings;
