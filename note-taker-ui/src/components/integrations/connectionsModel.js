const SUPPORTED_HANDOFF_SCOPES = new Set(['read', 'agent-write']);

const count = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const plural = (value, singular, pluralValue = `${singular}s`) => (
  `${value} ${value === 1 ? singular : pluralValue}`
);

const providerName = (provider = '') => ({
  readwise: 'Readwise',
  notion: 'Notion',
  evernote: 'Evernote',
  files: 'File import'
}[String(provider || '').toLowerCase()] || 'Connection');

const resultFor = (connection = {}, session = null) => (
  connection.lastReceipt?.metrics
  || connection.lastSyncResult
  || session?.receipt?.metrics
  || session?.result
  || {}
);

const savedCountCopy = (provider, result) => {
  if (provider === 'readwise') {
    const sources = count(result.importedArticles);
    const highlights = count(result.importedHighlights);
    const parts = [];
    if (sources) parts.push(plural(sources, 'saved source'));
    if (highlights) parts.push(plural(highlights, 'highlight'));
    return parts.join(' · ');
  }
  const notes = count(result.importedNotes);
  return notes ? plural(notes, 'saved note') : '';
};

export const projectSourceConnection = ({
  provider = '',
  connection = null,
  session = null
} = {}) => {
  const safeProvider = String(provider || connection?.provider || session?.provider || '').toLowerCase();
  const result = resultFor(connection || {}, session);
  const hasSavedHistory = Boolean(
    connection?.lastSyncAt
    || session?.status === 'completed'
    || session?.status === 'completed_with_warnings'
    || count(result.importedArticles)
    || count(result.importedHighlights)
    || count(result.importedNotes)
  );
  const indexingFailures = count(result.indexingFailures);
  const currentStatus = String(connection?.status || '').toLowerCase();
  const access = currentStatus === 'revoked'
    ? 'revoked'
    : currentStatus === 'connected'
      ? 'connected'
      : currentStatus === 'error'
        ? 'error'
        : 'not_connected';
  const sessionStatus = String(session?.status || '').toLowerCase();
  const importState = sessionStatus === 'importing'
    ? 'running'
    : sessionStatus === 'failed'
      ? 'failed'
      : indexingFailures > 0
        ? 'partial'
        : hasSavedHistory
          ? (access === 'connected' ? 'saved' : 'saved_history')
          : 'none';
  const searchState = indexingFailures > 0
    ? 'needs_retry'
    : hasSavedHistory
      ? 'ready_or_queued'
      : 'not_started';
  const savedCopy = savedCountCopy(safeProvider, result);

  let stateLabel = 'Not connected';
  let detail = 'No current authorization or import is recorded.';
  let nextAction = 'Connect';
  let tone = 'off';

  if (access === 'revoked') {
    stateLabel = 'Access revoked';
    detail = savedCopy ? `${savedCopy} remain in NOEIS.` : 'Previously imported material remains in NOEIS.';
    nextAction = 'Reconnect';
    tone = 'warning';
  } else if (access === 'error') {
    stateLabel = 'Connection needs attention';
    detail = connection?.lastError || 'The latest access check failed.';
    nextAction = 'Inspect';
    tone = 'warning';
  } else if (importState === 'running') {
    stateLabel = 'Import in progress';
    detail = String(session?.progress?.stage || 'The durable import job is running.').replace(/_/g, ' ');
    nextAction = 'View progress';
    tone = 'working';
  } else if (importState === 'failed') {
    stateLabel = 'Import needs attention';
    detail = session?.lastError || connection?.lastError || 'The last import did not finish.';
    nextAction = 'Review failure';
    tone = 'warning';
  } else if (importState === 'partial') {
    stateLabel = 'Saved · search needs a retry';
    detail = `${plural(indexingFailures, 'saved item')} need search preparation.`;
    nextAction = 'Review import';
    tone = 'warning';
  } else if (access === 'connected' && hasSavedHistory) {
    stateLabel = 'Imported into NOEIS';
    detail = savedCopy || 'The latest import receipt is available.';
    nextAction = 'Review changes';
    tone = 'connected';
  } else if (access === 'connected') {
    stateLabel = 'Connected · nothing imported yet';
    detail = 'Authorization is current. Import remains a separate result.';
    nextAction = 'Review import';
    tone = 'warning';
  }

  return {
    id: String(connection?.id || connection?._id || `${safeProvider}-available`),
    provider: safeProvider,
    providerLabel: providerName(safeProvider),
    label: connection?.accountLabel || providerName(safeProvider),
    mode: connection?.mode || '',
    scopes: Array.isArray(connection?.scopes) ? connection.scopes : [],
    access,
    importState,
    searchState,
    stateLabel,
    detail,
    nextAction,
    tone,
    lastValidatedAt: connection?.lastValidatedAt || null,
    lastSyncAt: connection?.lastSyncAt || null,
    sessionId: session?.id || ''
  };
};

export const projectConnectionActivity = ({ sessions = [] } = {}) => (
  (Array.isArray(sessions) ? sessions : [])
    .map((session) => {
      const result = resultFor({}, session);
      const additions = count(result.importedArticles) + count(result.importedNotes);
      const highlights = count(result.importedHighlights);
      const skipped = count(result.skippedRows) + count(result.duplicateSkips) + count(result.invalidSkips);
      const indexingFailures = count(result.indexingFailures);
      const failed = session?.status === 'failed';
      const partial = session?.status === 'completed_with_warnings' || indexingFailures > 0;
      const zeroChange = !failed && !additions && !highlights;
      const pieces = [];
      if (additions) pieces.push(plural(additions, session?.provider === 'readwise' ? 'source' : 'note'));
      if (highlights) pieces.push(plural(highlights, 'highlight'));
      if (skipped) pieces.push(`${plural(skipped, 'unchanged or skipped item')}`);
      if (indexingFailures) pieces.push(`${plural(indexingFailures, 'search retry')} needed`);

      return {
        id: String(session?.id || session?._id || ''),
        provider: String(session?.provider || ''),
        title: `${providerName(session?.provider)} ${session?.mode === 'manual' ? 'operation' : 'import'}`,
        outcome: failed
          ? 'Import failed'
          : partial
            ? 'Saved with follow-up needed'
            : zeroChange
              ? 'No new material'
              : 'Import complete',
        detail: pieces.join(' · ') || session?.receipt?.summary || session?.lastError || 'Receipt saved.',
        tone: failed || partial ? 'warning' : zeroChange ? 'quiet' : 'connected',
        at: session?.updatedAt || session?.createdAt || null,
        receipt: session?.receipt || null
      };
    })
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
);

export const projectAgentGrant = (token = {}, now = new Date()) => {
  const scopes = Array.isArray(token.scopes) ? token.scopes : [];
  const revoked = token.status === 'revoked' || Boolean(token.revokedAt);
  const expired = Boolean(token.expiresAt && new Date(token.expiresAt).getTime() <= now.getTime());
  const observed = Boolean(token.lastUsedAt);
  const scopeLabel = scopes.includes('agent-write') ? 'Read and write' : 'Read only';

  return {
    id: String(token.id || token._id || ''),
    label: token.label || 'Agent connection',
    runtime: token.runtime || '',
    scopes,
    scopeLabel,
    status: revoked ? 'revoked' : expired ? 'expired' : 'active',
    stateLabel: revoked
      ? 'Access revoked'
      : expired
        ? 'Access expired'
        : observed
          ? 'A request was received'
          : 'Approved · waiting for first request',
    detail: revoked
      ? 'Future requests are blocked. Completed work remains.'
      : expired
        ? 'A fresh human authorization is required.'
        : observed
          ? `Last request ${new Date(token.lastUsedAt).toLocaleString()}`
          : 'No successful request has been recorded yet.',
    ready: !revoked && !expired && observed,
    tone: revoked || expired ? 'off' : observed ? 'connected' : 'waiting',
    lastUsedAt: token.lastUsedAt || null,
    createdAt: token.createdAt || null,
    expiresAt: token.expiresAt || null
  };
};

const normalizeRuntime = (value = '') => {
  const runtime = String(value || '').trim().toLowerCase();
  const aliases = {
    'claude code': 'claude-code',
    claude: 'claude-code',
    codex: 'codex',
    hermes: 'hermes',
    openclaw: 'openclaw',
    opencode: 'opencode'
  };
  return aliases[runtime] || runtime || 'openclaw';
};

const slugify = (value = '') => (
  String(value || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 54)
  || 'agent'
);

const quoteShellArgument = (value = '') => (
  `'${String(value).replace(/'/g, "'\\''")}'`
);

export const createConnectionHandoff = ({
  label = 'Research companion',
  runtime = 'openclaw',
  scope = 'read',
  task = 'Connect and verify only',
  target = ''
} = {}) => {
  if (!SUPPORTED_HANDOFF_SCOPES.has(scope)) {
    throw new Error(`Unsupported connection scope: ${scope}`);
  }
  const safeLabel = String(label || '').trim() || 'Research companion';
  const safeRuntime = normalizeRuntime(runtime);
  const safeTask = String(task || '').trim() || 'Connect and verify only';
  const safeTarget = String(target || '').trim();
  const requestedScopes = scope === 'agent-write' ? ['read', 'agent-write'] : ['read'];
  const intent = {
    format: 'noeis.connection-handoff',
    version: 1,
    kind: 'instructions_not_authorization',
    applicationOrigin: 'https://www.noeis.io',
    setupGuide: 'https://www.noeis.io/skill.md',
    discoveryDocument: 'https://www.noeis.io/.well-known/noeis-agent.json',
    connectionLabel: safeLabel,
    runtimeHint: safeRuntime,
    requestedScopes,
    purpose: safeTask,
    target: safeTarget || null,
    runTaskAfterConnection: false,
    includedPrivateMaterial: Boolean(safeTarget),
    containsCredential: false,
    readiness: [
      'Human approval is recorded for the intended account and exact scope.',
      'The intended runtime reports that it loaded the NOEIS tools.',
      'connection_info returns the intended workspace and issued grant.'
    ],
    repairPolicy: 'Continue the failed stage on the existing grant. Do not reconnect or widen access unless authorization itself failed.'
  };
  const requestedAccess = scope === 'read' ? 'read only' : 'read and agent-write';
  const targetLine = safeTarget ? `\nSelected target: ${safeTarget}` : '';
  const markdown = `# Connect my agent to NOEIS

Connection name: ${safeLabel}
Runtime hint: ${safeRuntime}
Requested access: ${requestedAccess}
Purpose after setup: ${safeTask}${targetLine}

This is an instruction brief, not a credential or authorization. Do not start the task or schedule recurring work while connecting.

1. Check for an existing correct NOEIS connection and preserve every unrelated runtime setting.
2. Read ${intent.setupGuide} and the installed \`noeis connect --help\`. Confirm the installed version supports the requested scope.
3. Show a minimal, redacted setup plan before installing software or changing runtime configuration.
4. Request exactly this access:

   \`noeis connect ${safeRuntime} --scope ${scope} --label ${quoteShellArgument(safeLabel)}\`

   Stop if the client requests broader access, the account is ambiguous, or the option is unsupported.
5. Let the human approve on the official NOEIS surface. Do not automate browser approval or place reusable secrets in chat, logs, or runtime snippets.
6. Load the tools in this runtime, discover their actual schemas, and call \`connection_info\`. This metadata-only read must return the intended workspace and actual grant without creating or reading user content.
7. Report separately: approval recorded, tools loaded (client-reported), and authenticated read verified (server-observed). Then stop.

If one step fails, preserve completed steps and return one safe next action. Do not mint another grant to repair an unloaded runtime, and never silently broaden access.
`;

  return {
    intent,
    markdown,
    json: JSON.stringify(intent, null, 2),
    filename: `connect-${slugify(safeLabel)}.md`
  };
};
