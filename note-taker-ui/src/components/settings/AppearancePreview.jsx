import React, { useMemo } from 'react';
import { ACCENT_OPTIONS, resolveActiveTheme } from '../../settings/uiPreferences';

const READER_SIZES = { small: '17px', default: '19px', large: '22px' };
const ROW_SPACES = { comfortable: '20px', compact: '10px' };

const accentColor = (accent, dark) => {
  const map = {
    electric: dark ? '#8bdbe8' : '#226a78',
    violet: dark ? '#c7b1ed' : '#73518e',
    indigo: dark ? '#aebbe9' : '#4c6199'
  };
  return map[accent] || ACCENT_OPTIONS[0].color;
};

const AppearancePreview = ({
  settings,
  mode = 'page',
  compare = false,
  onModeChange,
  onCompareToggle,
  canCompare = false
}) => {
  const dark = resolveActiveTheme(settings.theme) === 'dark';
  const style = useMemo(() => ({
    '--reader-size': READER_SIZES[settings.typographyScale] || READER_SIZES.default,
    '--row-space': ROW_SPACES[settings.density] || ROW_SPACES.comfortable,
    '--preview-accent': accentColor(settings.accent, dark)
  }), [settings, dark]);

  const themeLine = `${settings.theme === 'auto' ? 'Following this device · ' : ''}${dark ? 'Dark' : 'Light'}`;

  return (
    <aside className="settings-redesign__preview-wrap" aria-label="Live appearance preview">
      <div className="settings-redesign__pagehead" style={{ marginBottom: '0.75rem' }}>
        <span className="settings-redesign__eyebrow">
          {compare ? 'Current appearance' : 'Your preview'}
        </span>
        <button
          type="button"
          className="settings-redesign__link"
          onClick={onCompareToggle}
          disabled={!canCompare && !compare}
          aria-pressed={compare}
        >
          {compare ? 'Back to my preview' : 'Compare with current'}
        </button>
      </div>
      <div
        className={`settings-redesign__preview${dark ? ' is-dark' : ''}${settings.brandEnergy ? ' is-energy' : ''}`}
        style={{ ...style, '--preview-accent': accentColor(settings.accent, dark) }}
      >
        <div className="settings-redesign__preview-top">
          <span style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontStyle: 'italic' }}>Noeis</span>
          <div role="group" aria-label="Preview example" style={{ display: 'flex', gap: '0.85rem', fontSize: '0.6875rem' }}>
            <button
              type="button"
              className={`settings-redesign__link${mode === 'page' ? '' : ''}`}
              style={{ opacity: mode === 'page' ? 1 : 0.6 }}
              onClick={() => onModeChange('page')}
            >
              Page
            </button>
            <button
              type="button"
              className="settings-redesign__link"
              style={{ opacity: mode === 'list' ? 1 : 0.6 }}
              onClick={() => onModeChange('list')}
            >
              List
            </button>
          </div>
        </div>
        <div className="settings-redesign__preview-body">
          {mode === 'page' ? (
            <>
              <span className="settings-redesign__eyebrow">Reading example</span>
              <h3>The pleasure<br />of returning</h3>
              <p className="settings-redesign__prose">
                A useful place holds the sentence you were with, not only the document it belonged to.
              </p>
              <p className="settings-redesign__prose">
                You can leave a question unfinished without having to begin again.
              </p>
              <p className="settings-redesign__prose" style={{ fontStyle: 'italic', borderLeft: '2px solid var(--preview-accent)', paddingLeft: '0.85rem', color: 'var(--preview-muted, #6c7166)' }}>
                “I want to come back to the thought, not just the file.”
              </p>
            </>
          ) : (
            <>
              <span className="settings-redesign__eyebrow">Three sources in a collection</span>
              <div className="settings-redesign__minirow">
                <h4 style={{ margin: 0, fontFamily: 'var(--noeis-serif, Georgia, serif)' }}>The pleasure of returning</h4>
                <p style={{ fontSize: '0.6875rem', color: 'var(--preview-muted, #6c7166)', margin: '0.35rem 0 0' }}>Essay · Design</p>
              </div>
              <div className="settings-redesign__minirow">
                <h4 style={{ margin: 0, fontFamily: 'var(--noeis-serif, Georgia, serif)' }}>A question worth keeping</h4>
                <p style={{ fontSize: '0.6875rem', color: 'var(--preview-muted, #6c7166)', margin: '0.35rem 0 0' }}>Your thought · “Keep the point of return.”</p>
              </div>
              <div className="settings-redesign__minirow">
                <h4 style={{ margin: 0, fontFamily: 'var(--noeis-serif, Georgia, serif)' }}>What belongs beside a draft?</h4>
                <p style={{ fontSize: '0.6875rem', color: 'var(--preview-muted, #6c7166)', margin: '0.35rem 0 0' }}>Notebook · Working notes</p>
              </div>
            </>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--preview-rule, #e0e0d4)', padding: '0.75rem 1.35rem', fontSize: '0.625rem', color: 'var(--preview-muted, #6c7166)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{themeLine}</span>
          <span>Original sample text</span>
        </div>
      </div>
      <p style={{ fontSize: '0.6875rem', color: 'var(--settings-muted)', marginTop: '0.75rem', lineHeight: 1.65 }}>
        Preview only until you choose to keep it.
      </p>
    </aside>
  );
};

export default AppearancePreview;
