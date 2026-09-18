import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCENT_OPTIONS,
  DEFAULT_UI_SETTINGS,
  MOTION_OPTIONS,
  THEME_OPTIONS,
  effectiveReducedMotion
} from '../../settings/uiPreferences';
import {
  appearanceDiffKeys,
  appearanceFieldLabel,
  formatAppearanceValue,
  pickAppearancePatch
} from '../../settings/appearanceFieldModel';
import { useTemporaryAppearance } from '../../settings/TemporaryAppearanceContext';
import AppearancePreview from './AppearancePreview';

const TYPOGRAPHY_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Standard' },
  { value: 'large', label: 'Large' }
];

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' }
];

const Segmented = ({ name, value, options, onChange, id }) => (
  <div className="settings-redesign__segmented" id={id}>
    {options.map((option) => (
      <label key={option.value}>
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
        />
        <span>{option.label}</span>
      </label>
    ))}
  </div>
);

const AppearanceSection = ({
  committed,
  draft,
  onDraftChange,
  onApply,
  onCancel,
  saveState = 'idle',
  lastReceipt,
  onUndo,
  remoteBaseline,
  onAdoptRemoteBaseline,
  onDismissRemote
}) => {
  const [compare, setCompare] = useState(false);
  const [previewMode, setPreviewMode] = useState('page');
  const [motionReplay, setMotionReplay] = useState(false);
  const [motionDemoReduced, setMotionDemoReduced] = useState(false);
  const { startTemporary } = useTemporaryAppearance();
  const announceRef = useRef(null);

  const changedKeys = useMemo(() => appearanceDiffKeys(committed, draft), [committed, draft]);
  const previewSettings = compare ? committed : draft;
  const osReduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const setField = useCallback((key, value) => {
    onDraftChange({ ...draft, [key]: value });
    setCompare(false);
    if (key === 'density') setPreviewMode('list');
    if (key === 'typographyScale') setPreviewMode('page');
  }, [draft, onDraftChange]);

  const handleApply = async () => {
    const patch = pickAppearancePatch(committed, draft);
    if (!Object.keys(patch).length) return;
    await onApply(patch, draft);
  };

  const receiptLines = lastReceipt?.keys?.map(
    (key) => `${appearanceFieldLabel[key]}: ${formatAppearanceValue(key, lastReceipt.before[key])} → ${formatAppearanceValue(key, lastReceipt.after[key])}`
  ) ?? [];

  useEffect(() => {
    if (!motionReplay) return undefined;
    const timer = window.setTimeout(() => setMotionReplay(false), 600);
    return () => window.clearTimeout(timer);
  }, [motionReplay]);

  return (
    <section aria-label="Appearance preferences">
      <div className="settings-redesign__pagehead">
        <div>
          <h2>Appearance</h2>
          <p className="settings-redesign__help" style={{ marginTop: '0.45rem' }}>Make room for the way you read.</p>
        </div>
        <span className="settings-redesign__eyebrow">Personal preferences</span>
      </div>

      {remoteBaseline ? (
        <div className="settings-redesign__receipt" role="status">
          <span>Newer saved preferences are available. Your preview is still here.</span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="settings-redesign__link" onClick={onAdoptRemoteBaseline}>
              Use newer saved state
            </button>
            <button type="button" className="settings-redesign__link" onClick={onDismissRemote}>
              Keep my preview
            </button>
          </div>
        </div>
      ) : null}

      <div className="settings-redesign__appearance-grid">
        <div className="settings-redesign__controls">
          <fieldset id="reading-size">
            <legend className="settings-redesign__label">Reading size</legend>
            <p className="settings-redesign__help">Change the reading, not the size of every control.</p>
            <Segmented
              name="typographyScale"
              value={draft.typographyScale}
              options={TYPOGRAPHY_OPTIONS}
              onChange={(value) => setField('typographyScale', value)}
            />
          </fieldset>

          <fieldset id="list-spacing">
            <legend className="settings-redesign__label">List spacing</legend>
            <p className="settings-redesign__help">More breathing room, or more sources in view.</p>
            <Segmented
              name="density"
              value={draft.density}
              options={DENSITY_OPTIONS}
              onChange={(value) => setField('density', value)}
            />
          </fieldset>

          <fieldset id="theme">
            <legend className="settings-redesign__label">Page appearance</legend>
            <p className="settings-redesign__help">Follow this device, or choose a look to keep.</p>
            <Segmented
              name="theme"
              value={draft.theme}
              options={THEME_OPTIONS.map((o) => ({ value: o.value, label: o.shortLabel || o.label }))}
              onChange={(value) => setField('theme', value)}
            />
          </fieldset>

          <fieldset id="accent">
            <legend className="settings-redesign__label">Accent</legend>
            <p className="settings-redesign__help">A small point of color. The words stay readable.</p>
            <div className="settings-redesign__colors">
              {ACCENT_OPTIONS.map((option) => (
                <label key={option.value} className="settings-redesign__color" style={{ position: 'relative' }}>
                  <input
                    type="radio"
                    name="accent"
                    value={option.value}
                    checked={draft.accent === option.value}
                    onChange={() => setField('accent', option.value)}
                  />
                  <span>
                    <i className="settings-redesign__swatch" style={{ background: option.color }} aria-hidden="true" />
                    {option.label.replace(/^(Electric |Ion |Arc )/, '').split(' ')[0]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <details id="motion-decoration" style={{ borderTop: '1px solid var(--settings-rule)', paddingTop: '1rem' }}>
            <summary className="settings-redesign__label" style={{ cursor: 'pointer', listStyle: 'none' }}>
              Motion & decoration
            </summary>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.75rem 0' }} id="decoration">
              <div>
                <span className="settings-redesign__label">Decorative color</span>
                <p className="settings-redesign__help">A little color in the surrounding interface.</p>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(draft.brandEnergy)}
                  onChange={(event) => setField('brandEnergy', event.target.checked)}
                  aria-label="Decorative color"
                />
              </label>
            </div>
            <fieldset id="motion">
              <legend className="settings-redesign__label">Motion</legend>
              <p className="settings-redesign__help">The device’s Reduce Motion preference always wins.</p>
              <Segmented
                name="motion"
                value={draft.motion || 'system'}
                options={MOTION_OPTIONS}
                onChange={(value) => setField('motion', value)}
              />
              <p className="settings-redesign__help" style={{ marginTop: '0.5rem' }}>
                {osReduced
                  ? 'Reduce Motion is on for this device. Unnecessary movement stays off.'
                  : draft.motion === 'reduced'
                    ? 'Unnecessary movement stays off.'
                    : 'Following this device’s motion preference.'}
              </p>
            </fieldset>
            <div className="settings-redesign__motion-replay" aria-hidden="true">
              <div
                className={`settings-redesign__motion-card${motionReplay && !motionDemoReduced ? ' is-animated' : ''}`}
              >
                <strong>Source beside the sentence</strong>
                <br />
                <span style={{ fontSize: '0.625rem', color: 'var(--settings-muted)' }}>A contextual panel arrives from where it lives.</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="settings-redesign__btn"
                onClick={() => { setMotionDemoReduced(false); setMotionReplay(true); }}
              >
                Replay an example
              </button>
              <button
                type="button"
                className="settings-redesign__btn"
                onClick={() => {
                  setMotionDemoReduced(true);
                  setMotionReplay(!effectiveReducedMotion('reduced'));
                }}
              >
                Show reduced motion
              </button>
            </div>
          </details>

          <button
            type="button"
            className="settings-redesign__link"
            onClick={() => onDraftChange({ ...DEFAULT_UI_SETTINGS })}
          >
            Restore appearance defaults…
          </button>
          <button
            type="button"
            className="settings-redesign__link"
            onClick={() => startTemporary(draft)}
            style={{ marginLeft: '1rem' }}
          >
            Try across NOEIS briefly
          </button>
        </div>

        <AppearancePreview
          settings={previewSettings}
          mode={previewMode}
          compare={compare}
          canCompare={changedKeys.length > 0}
          onModeChange={setPreviewMode}
          onCompareToggle={() => setCompare((value) => !value)}
        />
      </div>

      {saveState === 'failed' ? (
        <div className="settings-redesign__receipt is-error" role="alert">
          <span><strong>Not saved.</strong> Your preview is still here. No stored preference changed.</span>
          <button type="button" className="settings-redesign__link" onClick={handleApply}>Retry</button>
        </div>
      ) : null}

      {lastReceipt && saveState === 'saved' ? (
        <div className="settings-redesign__receipt" role="status">
          <span>
            {receiptLines.join(' · ')}
            <br />
            <span style={{ color: 'var(--settings-muted)' }}>Delivery, instructions, and content were not changed.</span>
          </span>
          <button type="button" className="settings-redesign__link" onClick={onUndo}>Back to before this change</button>
        </div>
      ) : null}

      <div className="settings-redesign__commit">
        <div>
          <strong style={{ fontSize: '0.75rem' }}>
            {changedKeys.length
              ? `${changedKeys.length} appearance ${changedKeys.length === 1 ? 'change' : 'changes'}`
              : 'Saved'}
          </strong>
          <p className="settings-redesign__help" style={{ margin: '0.2rem 0 0' }}>
            {changedKeys.length
              ? 'Only appearance. No content, delivery, or access changes.'
              : 'You can try another combination without losing this one.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {changedKeys.length ? (
            <button type="button" className="settings-redesign__link" onClick={onCancel}>Cancel</button>
          ) : null}
          <button
            type="button"
            className="settings-redesign__btn is-primary"
            disabled={!changedKeys.length || saveState === 'saving'}
            onClick={handleApply}
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Retry saving' : 'Use this appearance'}
          </button>
        </div>
      </div>
      <span ref={announceRef} className="sr-only" aria-live="polite" />
    </section>
  );
};

export default AppearanceSection;
