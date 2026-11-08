import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useDocumentTitle from '../hooks/useDocumentTitle';
import '../styles/settings-redesign.css';
import SettingsShell from '../components/settings/SettingsShell';
import AppearanceSection from '../components/settings/AppearanceSection';
import DeliverySection from '../components/settings/DeliverySection';
import DataSection from '../components/settings/DataSection';
import AdvancedSection from '../components/settings/AdvancedSection';
import AccountSection from '../components/settings/AccountSection';
import { normalizeUiSettings } from '../settings/uiPreferences';
import { pickAppearancePatch } from '../settings/appearanceFieldModel';
import { parseSettingsLocation } from '../settings/settingsRegistry';
import {
  captureSettingsReturnPath,
  clearSettingsReturnPath,
  readSettingsReturnPath,
  returnLinkLabel
} from '../settings/settingsReturnPath';
import { Button } from '../components/ui';

const Settings = ({
  uiSettings = normalizeUiSettings(),
  onAppearanceCommit = async () => ({ ok: false }),
  onAppearanceUndo = async () => ({ ok: false }),
  onOpenThemePicker,
  onLogout
}) => {
  useDocumentTitle('Settings');
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = parseSettingsLocation(location.search, location.hash);
  const [section, setSection] = useState(parsed.section);
  const [searchQuery, setSearchQuery] = useState('');
  /* What the page shows: the saved settings, or the choice just made while
     it saves. */
  const [shown, setShown] = useState(() => normalizeUiSettings(uiSettings));
  const [saveState, setSaveState] = useState('idle');
  const [lastReceipt, setLastReceipt] = useState(null);
  const [failedPatch, setFailedPatch] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const returnMeta = readSettingsReturnPath();

  useEffect(() => { setShown(normalizeUiSettings(uiSettings)); }, [uiSettings]);

  useEffect(() => {
    if (location.state?.returnTo) {
      captureSettingsReturnPath(location, { fromPath: location.state.returnTo, label: location.state.returnLabel });
    }
  }, [location]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const next = parseSettingsLocation(location.search, location.hash);
    setSection(next.section);
    const focus = params.get('focus');
    if (focus) {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(focus);
        if (target) {
          const fold = target.closest('details');
          if (fold) fold.open = true;
          target.classList.add('settings-redesign__anchor-flash');
          target.scrollIntoView({ block: 'center', behavior: 'auto' });
          const focusable = target.matches('input,textarea,select,button')
            ? target
            : target.querySelector('input,select,textarea,button');
          focusable?.focus({ preventScroll: true });
          window.setTimeout(() => target.classList.remove('settings-redesign__anchor-flash'), 2000);
        }
      });
    }
  }, [location.search, location.hash]);

  const save = useCallback(async (patch) => {
    const before = normalizeUiSettings(uiSettings);
    const after = normalizeUiSettings({ ...before, ...patch });
    setShown(after);
    setSaveState('saving');
    const result = await onAppearanceCommit(patch, after);
    if (result?.stale) return;
    if (result?.ok) {
      setLastReceipt({ before, after, keys: Object.keys(patch) });
      setFailedPatch(null);
      setSaveState('saved');
    } else {
      setShown(before);
      setFailedPatch(patch);
      setSaveState('failed');
    }
  }, [uiSettings, onAppearanceCommit]);

  /* A field and its value, or (no field) a whole set such as the defaults. */
  const handleAppearanceChange = useCallback((key, value) => {
    const patch = key ? { [key]: value } : pickAppearancePatch(shown, value);
    if (Object.keys(patch).length) save(patch);
  }, [shown, save]);

  const handleUndo = useCallback(async () => {
    if (!lastReceipt) return;
    const result = await onAppearanceUndo(lastReceipt);
    if (result?.ok) {
      setLastReceipt(null);
      setSaveState('idle');
    }
  }, [lastReceipt, onAppearanceUndo]);

  const sectionContent = useMemo(() => {
    if (section === 'appearance') {
      return (
        <AppearanceSection
          settings={shown}
          onChange={handleAppearanceChange}
          saveState={saveState}
          lastReceipt={lastReceipt}
          onUndo={handleUndo}
          onRetry={() => failedPatch && save(failedPatch)}
          onOpenThemePicker={onOpenThemePicker}
        />
      );
    }
    if (section === 'account') return <AccountSection onLogout={onLogout} />;
    if (section === 'delivery') return <DeliverySection />;
    if (section === 'data') return <DataSection />;
    return <AdvancedSection uiSettings={shown} section={section} />;
  }, [
    section,
    shown,
    handleAppearanceChange,
    saveState,
    lastReceipt,
    handleUndo,
    failedPatch,
    save,
    onOpenThemePicker,
    onLogout
  ]);

  const handleSearchSelect = (entry) => {
    if (entry.externalPath) {
      navigate(entry.externalPath);
      return;
    }
    if (entry.action === 'help') {
      setHelpOpen(true);
      setSearchQuery('');
      return;
    }
    setSearchQuery('');
    setSection(entry.section);
    navigate(`/settings?section=${entry.section}&focus=${entry.focusId || entry.id}`, { replace: true });
  };

  return (
    <div className="settings-redesign">
      {returnMeta ? (
        <div className="settings-return-link">
          <Link to={returnMeta.path} onClick={() => clearSettingsReturnPath()}>
            {returnLinkLabel(returnMeta)}
          </Link>
        </div>
      ) : null}
      <SettingsShell
        section={section}
        onSectionChange={(next) => {
          setSection(next);
          navigate(`/settings?section=${next}`, { replace: true });
        }}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearchSelect={handleSearchSelect}
        onHelp={() => setHelpOpen(true)}
      >
        {sectionContent}
      </SettingsShell>
      {helpOpen ? (
        <dialog className="settings-redesign__dialog" open>
          <h2>A little help, not a reset</h2>
          <p className="settings-redesign__help">Use the search field to find a setting. Escape closes dialogs.</p>
          <Link to="/how-to-use" className="settings-redesign__link" onClick={() => setHelpOpen(false)}>Open full help</Link>
          <div style={{ marginTop: '1rem' }}>
            <Button onClick={() => setHelpOpen(false)}>Back to settings</Button>
          </div>
        </dialog>
      ) : null}
    </div>
  );
};

export default Settings;
