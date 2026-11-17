import React from 'react';
import { DEFAULT_UI_SETTINGS, MOTION_OPTIONS } from '../../settings/uiPreferences';
import { appearanceFieldLabel, formatAppearanceValue } from '../../settings/appearanceFieldModel';
import { ThemeSwatch } from './ThemePicker';

const TYPOGRAPHY_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Standard' },
  { value: 'large', label: 'Large' }
];

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' }
];

const Choice = ({ name, value, options, onChange }) => (
  <div className="settings-redesign__segmented">
    {options.map((option) => (
      <label key={option.value}>
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={value === option.value}
          onChange={() => onChange(name, option.value)}
        />
        <span>{option.label}</span>
      </label>
    ))}
  </div>
);

const Field = ({ id, label, help, children }) => (
  <fieldset id={id}>
    <legend className="settings-redesign__label">{label}</legend>
    <p className="settings-redesign__help">{help}</p>
    {children}
  </fieldset>
);

/* What changed, said once, with the way back. */
const Receipt = ({ receipt, onUndo }) => (
  <p className="settings-redesign__receipt" role="status">
    <span>
      {receipt.keys.map(key => `${appearanceFieldLabel[key]}: ${formatAppearanceValue(key, receipt.after[key])}`).join(' · ')}
    </span>
    <button type="button" className="settings-redesign__link" onClick={onUndo}>Undo</button>
  </p>
);

/* Every choice takes effect as it is made, across Noeis, and the line under
   it offers Undo. There is nothing to apply and nothing to preview: the page
   you are on is the preview. */
const AppearanceSection = ({ settings, onChange, saveState, lastReceipt, onUndo, onRetry, onOpenThemePicker }) => (
  <section aria-label="Appearance preferences">
    <div className="settings-redesign__pagehead">
      <h2>Appearance</h2>
    </div>

    <div className="settings-redesign__controls">
      <Field id="reading-size" label="Reading size" help="Change the reading, not the size of every control.">
        <Choice name="typographyScale" value={settings.typographyScale} options={TYPOGRAPHY_OPTIONS} onChange={onChange} />
      </Field>

      <Field id="list-spacing" label="List spacing" help="More breathing room, or more sources in view.">
        <Choice name="density" value={settings.density} options={DENSITY_OPTIONS} onChange={onChange} />
      </Field>

      <Field id="theme" label="Page appearance" help="Follow this device, or choose a look to keep.">
        <button type="button" className="theme-picker-trigger" aria-haspopup="dialog" onClick={onOpenThemePicker}>
          <ThemeSwatch id={settings.theme} />
          <span className="theme-picker-trigger__label">{formatAppearanceValue('theme', settings.theme)}</span>
          <span className="theme-picker-trigger__caret" aria-hidden="true">▾</span>
        </button>
      </Field>

      <Field id="motion" label="Motion" help="The device’s Reduce Motion setting always wins.">
        <Choice name="motion" value={settings.motion || 'system'} options={MOTION_OPTIONS} onChange={onChange} />
      </Field>

      {saveState === 'failed' ? (
        <p className="settings-redesign__receipt is-error" role="alert">
          <span>That did not save, so your appearance is as it was.</span>
          <button type="button" className="settings-redesign__link" onClick={onRetry}>Try again</button>
        </p>
      ) : lastReceipt ? <Receipt receipt={lastReceipt} onUndo={onUndo} /> : null}

      <button
        type="button"
        className="settings-redesign__link"
        onClick={() => onChange(null, DEFAULT_UI_SETTINGS)}
      >
        Restore the defaults
      </button>
    </div>
  </section>
);

export default AppearanceSection;
