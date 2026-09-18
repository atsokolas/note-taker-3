import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { applyUiSettingsToRoot, normalizeUiSettings } from './uiPreferences';

const DEFAULT_DURATION_MS = 30_000;
const TemporaryAppearanceContext = createContext(null);

export const TemporaryAppearanceProvider = ({
  children,
  committedSettings,
  onKeepTemporary
}) => {
  const [previewSettings, setPreviewSettings] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const committedRef = useRef(committedSettings);

  useEffect(() => {
    committedRef.current = committedSettings;
  }, [committedSettings]);

  const clearTemporary = useCallback(() => {
    setPreviewSettings(null);
    setExpiresAt(null);
    setRemainingSeconds(0);
    applyUiSettingsToRoot(document.documentElement, committedRef.current);
  }, []);

  const startTemporary = useCallback((draft, durationMs = DEFAULT_DURATION_MS) => {
    const normalized = normalizeUiSettings(draft);
    setPreviewSettings(normalized);
    const deadline = Date.now() + durationMs;
    setExpiresAt(deadline);
    setRemainingSeconds(Math.ceil(durationMs / 1000));
    applyUiSettingsToRoot(document.documentElement, normalized);
  }, []);

  const extendTemporary = useCallback((durationMs = DEFAULT_DURATION_MS) => {
    if (!previewSettings) return;
    const deadline = Date.now() + durationMs;
    setExpiresAt(deadline);
    setRemainingSeconds(Math.ceil(durationMs / 1000));
  }, [previewSettings]);

  const keepTemporary = useCallback(async () => {
    if (!previewSettings) return { ok: false };
    const result = await onKeepTemporary(previewSettings);
    if (result?.ok) {
      setPreviewSettings(null);
      setExpiresAt(null);
      setRemainingSeconds(0);
    }
    return result;
  }, [onKeepTemporary, previewSettings]);

  useEffect(() => {
    if (!previewSettings) return undefined;
    applyUiSettingsToRoot(document.documentElement, previewSettings);
    return () => {
      if (committedRef.current) {
        applyUiSettingsToRoot(document.documentElement, committedRef.current);
      }
    };
  }, [previewSettings]);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0) {
        clearTemporary();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    const onVisibility = () => tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [expiresAt, clearTemporary]);

  const value = useMemo(() => ({
    active: Boolean(previewSettings),
    previewSettings,
    remainingSeconds,
    startTemporary,
    extendTemporary,
    clearTemporary,
    keepTemporary
  }), [
    previewSettings,
    remainingSeconds,
    startTemporary,
    extendTemporary,
    clearTemporary,
    keepTemporary
  ]);

  return (
    <TemporaryAppearanceContext.Provider value={value}>
      {children}
    </TemporaryAppearanceContext.Provider>
  );
};

export const useTemporaryAppearance = () => {
  const ctx = useContext(TemporaryAppearanceContext);
  if (!ctx) {
    throw new Error('useTemporaryAppearance requires TemporaryAppearanceProvider');
  }
  return ctx;
};

export const TemporaryAppearanceBar = () => {
  const {
    active,
    remainingSeconds,
    clearTemporary,
    keepTemporary,
    extendTemporary
  } = useTemporaryAppearance();
  const [keeping, setKeeping] = useState(false);

  if (!active) return null;

  const handleKeep = async () => {
    setKeeping(true);
    try {
      await keepTemporary();
    } finally {
      setKeeping(false);
    }
  };

  return (
    <div className="settings-temp-bar" role="status" aria-live="polite">
      <div className="settings-temp-bar__copy">
        <strong>Temporary appearance preview</strong>
        <span className="settings-temp-bar__sub">
          Reverts automatically in {remainingSeconds}s unless you keep it.
        </span>
      </div>
      <button type="button" className="settings-temp-bar__action" onClick={clearTemporary}>
        Revert now
      </button>
      <button
        type="button"
        className="settings-temp-bar__action settings-temp-bar__keep"
        onClick={handleKeep}
        disabled={keeping}
      >
        Keep this appearance
      </button>
      <button
        type="button"
        className="settings-temp-bar__extend"
        onClick={() => extendTemporary()}
        aria-label="Extend temporary preview by 30 seconds"
      >
        +30s
      </button>
    </div>
  );
};
