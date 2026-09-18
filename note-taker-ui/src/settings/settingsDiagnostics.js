import { resolveActiveTheme } from './uiPreferences';

export const buildSettingsDiagnosticReport = ({
  section = 'appearance',
  uiSettings = {},
  saveStage = 'idle',
  operationId = ''
} = {}) => ({
  kind: 'noeis-settings-diagnostic',
  version: 1,
  section,
  appearance: {
    themePreference: uiSettings.theme,
    resolvedTheme: resolveActiveTheme(uiSettings.theme),
    motion: uiSettings.motion || 'system'
  },
  saveStage,
  operationId: operationId || undefined,
  includesPrivateText: false,
  includesCredentials: false
});
