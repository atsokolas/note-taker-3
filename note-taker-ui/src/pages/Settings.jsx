import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../styles/settings-redesign.css';
import SettingsShell from '../components/settings/SettingsShell';
import AppearanceSection from '../components/settings/AppearanceSection';
import DeliverySection from '../components/settings/DeliverySection';
import DataSection from '../components/settings/DataSection';
import AdvancedSection from '../components/settings/AdvancedSection';
import { normalizeUiSettings, UI_SETTINGS_STORAGE_KEY } from '../settings/uiPreferences';
import {
  appearanceDiffKeys,
  mergeRemoteIntoDraft,
  pickAppearancePatch
} from '../settings/appearanceFieldModel';
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
  onAppearanceUndo = async () => ({ ok: false })
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = parseSettingsLocation(location.search, location.hash);
  const [section, setSection] = useState(parsed.section);
  const [searchQuery, setSearchQuery] = useState('');
  const [committed, setCommitted] = useState(() => normalizeUiSettings(uiSettings));
  const [draft, setDraft] = useState(() => normalizeUiSettings(uiSettings));
  const [editBase, setEditBase] = useState(() => normalizeUiSettings(uiSettings));
  const [saveState, setSaveState] = useState('idle');
  const [lastReceipt, setLastReceipt] = useState(null);
  const [remoteBaseline, setRemoteBaseline] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const returnMeta = readSettingsReturnPath();
  const pendingSaveRef = useRef(0);

  useEffect(() => {
    const normalized = normalizeUiSettings(uiSettings);
    setCommitted(normalized);
    if (!appearanceDiffKeys(draft, editBase).length) {
      setDraft(normalized);
      setEditBase(normalized);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when server ack changes, not while editing
  }, [uiSettings]);

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

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== UI_SETTINGS_STORAGE_KEY || !event.newValue) return;
      try {
        const remote = normalizeUiSettings(JSON.parse(event.newValue));
        if (appearanceDiffKeys(draft, editBase).length) {
          setRemoteBaseline(remote);
        } else {
          setCommitted(remote);
          setDraft(remote);
          setEditBase(remote);
        }
      } catch (_error) {
        // ignore malformed cache
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [draft, editBase]);

  const handleApply = useCallback(async (_patch, nextDraft) => {
    const patch = pickAppearancePatch(committed, nextDraft);
    if (!Object.keys(patch).length) return;
    const opId = pendingSaveRef.current + 1;
    pendingSaveRef.current = opId;
    setSaveState('saving');
    const before = { ...committed };
    const result = await onAppearanceCommit(patch, nextDraft);
    if (pendingSaveRef.current !== opId) return;
    if (result?.ok) {
      const after = normalizeUiSettings(result.settings || nextDraft);
      setLastReceipt({ before, after, keys: Object.keys(patch) });
      setSaveState('saved');
      setEditBase(after);
      setDraft(after);
      setRemoteBaseline(null);
    } else {
      setSaveState('failed');
    }
  }, [committed, onAppearanceCommit]);

  const handleCancel = useCallback(() => {
    setDraft(committed);
    setEditBase(committed);
    setSaveState('idle');
    setRemoteBaseline(null);
  }, [committed]);

  const handleUndo = useCallback(async () => {
    if (!lastReceipt) return;
    const result = await onAppearanceUndo(lastReceipt);
    if (result?.ok) {
      setLastReceipt(null);
      setSaveState('idle');
    }
  }, [lastReceipt, onAppearanceUndo]);

  const handleAdoptRemote = useCallback(() => {
    if (!remoteBaseline) return;
    const merged = mergeRemoteIntoDraft(draft, editBase, remoteBaseline);
    setDraft(merged);
    setEditBase(remoteBaseline);
    setCommitted(remoteBaseline);
    setRemoteBaseline(null);
  }, [draft, editBase, remoteBaseline]);

  const sectionContent = useMemo(() => {
    if (section === 'appearance') {
      return (
        <AppearanceSection
          committed={committed}
          draft={draft}
          onDraftChange={setDraft}
          onApply={handleApply}
          onCancel={handleCancel}
          saveState={saveState}
          lastReceipt={lastReceipt}
          onUndo={handleUndo}
          remoteBaseline={remoteBaseline}
          onAdoptRemoteBaseline={handleAdoptRemote}
          onDismissRemote={() => setRemoteBaseline(null)}
        />
      );
    }
    if (section === 'delivery') return <DeliverySection />;
    if (section === 'data') return <DataSection />;
    return <AdvancedSection uiSettings={committed} section={section} />;
  }, [
    section,
    committed,
    draft,
    handleApply,
    handleCancel,
    saveState,
    lastReceipt,
    handleUndo,
    remoteBaseline,
    handleAdoptRemote
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
          <h2 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>A little help, not a reset</h2>
          <p className="settings-redesign__help">Use the search field to find a setting. Escape closes dialogs without discarding drafts.</p>
          <Link to="/how-to-use" className="settings-redesign__link" onClick={() => setHelpOpen(false)}>Open full help</Link>
          <div style={{ marginTop: '1rem' }}>
            <button type="button" className="settings-redesign__btn" onClick={() => setHelpOpen(false)}>Back to settings</button>
          </div>
        </dialog>
      ) : null}
    </div>
  );
};

export default Settings;
