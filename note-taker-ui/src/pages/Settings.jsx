import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const returnMeta = readSettingsReturnPath();

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

  /* Choices made while an earlier one is still saving ride along with the
     next save: each request carries every choice not yet saved, so a quick
     Large-then-Compact keeps both. */
  const inFlight = useRef(0);
  useEffect(() => {
    if (!inFlight.current) setShown(normalizeUiSettings(uiSettings));
  }, [uiSettings]);

  const save = useCallback(async (choice, from = shown) => {
    const before = normalizeUiSettings(uiSettings);
    const after = normalizeUiSettings({ ...from, ...choice });
    const patch = pickAppearancePatch(before, after);
    if (!Object.keys(patch).length) return;
    setShown(after);
    setSaveState('saving');
    inFlight.current += 1;
    const result = await onAppearanceCommit(patch, after);
    inFlight.current -= 1;
    if (result?.stale) return;
    if (result?.ok) {
      setLastReceipt({ before, after, keys: Object.keys(choice) });
      setFailedPatch(null);
      setSaveState('saved');
    } else {
      setShown(before);
      setFailedPatch(patch);
      setSaveState('failed');
    }
  }, [uiSettings, shown, onAppearanceCommit]);

  /* A field and its value, or (no field) a whole set such as the defaults. */
  const handleAppearanceChange = useCallback((key, value) => {
    save(key ? { [key]: value } : pickAppearancePatch(shown, value));
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
      >
        {sectionContent}
      </SettingsShell>
    </div>
  );
};

export default Settings;
