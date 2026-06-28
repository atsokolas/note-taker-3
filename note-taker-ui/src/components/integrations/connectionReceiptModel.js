const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatLoopDate = (value) => {
  const date = toValidDate(value);
  if (!date) return 'Never';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const pickResult = ({ durable, stats, session, provider }) => {
  if (durable && typeof durable === 'object') return durable;
  if (stats && typeof stats === 'object') return stats;
  if (session?.provider === provider && session?.result && typeof session.result === 'object') {
    return session.result;
  }
  return null;
};

const summarizeTouched = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '';
  const firstTitle = list.find((item) => item?.title)?.title;
  const suffix = list.length > 1 ? ` + ${list.length - 1} more` : '';
  return firstTitle ? `Touched ${firstTitle}${suffix}.` : `Touched ${list.length} item${list.length === 1 ? '' : 's'}.`;
};

const buildDurableReceiptCard = (receipt, providerLabel = 'Connection') => {
  if (!receipt || typeof receipt !== 'object') return null;
  const status = String(receipt.status || '').trim();
  const failed = status === 'failed';
  const warning = status === 'completed_with_warnings' || status === 'needs_review';
  const completedAt = receipt.completedAt || receipt.createdAt || '';
  return {
    statusLabel: failed
      ? 'Needs attention'
      : warning
        ? 'Synced with warnings'
        : 'Synced into Noeis',
    tone: failed || warning ? 'warning' : 'success',
    headline: completedAt
      ? `Last receipt ${formatLoopDate(completedAt)}.`
      : `${providerLabel} receipt saved.`,
    summary: receipt.summary || '',
    detail: summarizeTouched(receipt.touched)
      || 'This receipt is persisted and will feed the Morning Paper return loop.',
    failureStage: failed ? receipt.error?.stage || 'sync' : undefined,
    failureMessage: failed ? receipt.error?.message || receipt.summary || 'The last sync failed.' : undefined,
    nextAction: receipt.nextAction?.label ? { label: receipt.nextAction.label } : { label: 'Review latest changes' },
    isLive: failed,
    liveMessage: failed ? `${providerLabel} sync failed — ${receipt.error?.message || receipt.summary || 'needs attention'}` : undefined
  };
};

export const formatProviderSyncSummary = (result, provider = '') => {
  if (!result || typeof result !== 'object') return '';

  if (provider === 'readwise') {
    const articles = Number(result.importedArticles || 0);
    const highlights = Number(result.importedHighlights || 0);
    const skipped = Number(result.skippedRows || result.skipped || 0);
    const indexingFailures = Number(result.indexingFailures || 0);
    const pieces = [];
    if (highlights > 0 || articles > 0) {
      pieces.push(`Synced ${highlights} highlight${highlights === 1 ? '' : 's'} from ${articles} source${articles === 1 ? '' : 's'}`);
    } else {
      pieces.push('Sync completed with no new highlights');
    }
    if (skipped > 0) pieces.push(`${skipped} skipped`);
    if (indexingFailures > 0) {
      pieces.push(`${indexingFailures} indexing warning${indexingFailures === 1 ? '' : 's'}`);
    }
    return `${pieces.join(' · ')}.`;
  }

  if (provider === 'evernote') {
    const notes = Number(result.importedNotes || result.notes || 0);
    const duplicateSkips = Number(result.duplicateSkips || 0);
    const invalidSkips = Number(result.invalidSkips || 0);
    const indexingFailures = Number(result.indexingFailures || 0);
    const pieces = [`Imported ${notes} note${notes === 1 ? '' : 's'}`];
    if (duplicateSkips > 0) pieces.push(`${duplicateSkips} duplicate${duplicateSkips === 1 ? '' : 's'} skipped`);
    if (invalidSkips > 0) pieces.push(`${invalidSkips} invalid skipped`);
    if (indexingFailures > 0) {
      pieces.push(`${indexingFailures} indexing warning${indexingFailures === 1 ? '' : 's'}`);
    }
    return `${pieces.join(' · ')}.`;
  }

  const imported = Number(result.importedNotes || result.notes || 0);
  const skipped = Number(result.skippedRows || result.skipped || 0);
  const indexingQueued = Number(result.indexingQueued || 0);
  const indexingFailures = Number(result.indexingFailures || 0);
  const pieces = [`Synced ${imported} page${imported === 1 ? '' : 's'}`];
  if (skipped > 0) pieces.push(`${skipped} skipped`);
  if (indexingQueued > 0) pieces.push(`${indexingQueued} indexing`);
  if (indexingFailures > 0) {
    pieces.push(`${indexingFailures} indexing warning${indexingFailures === 1 ? '' : 's'}`);
  }
  return `${pieces.join(' · ')}.`;
};

const resolveFailure = ({ session, provider, connection, fallbackMessage = '' }) => {
  if (session?.provider === provider && session?.status === 'failed') {
    const stage = session?.progress?.stage || 'import';
    const message = session?.lastError || fallbackMessage || `${provider} import failed.`;
    return { stage, message, retryable: true };
  }
  if (connection?.lastError) {
    return {
      stage: 'connection',
      message: connection.lastError,
      retryable: true
    };
  }
  return null;
};

const withWarnings = (result) => {
  if (!result) return false;
  const indexingFailures = Number(result.indexingFailures || 0);
  const warningCount = Array.isArray(result.warnings) ? result.warnings.length : 0;
  return indexingFailures > 0 || warningCount > 0;
};

export const buildNotionConnectionReceipt = ({
  connection = null,
  session = null,
  importStats = null,
  lastImportSourceLabel = '',
  syncing = false,
  previewing = false
} = {}) => {
  const provider = 'notion';
  const accountLabel = connection?.accountLabel || 'Notion';
  const sessionActive = session?.provider === provider;
  const sessionImporting = sessionActive && session?.status === 'importing';
  const failure = resolveFailure({ session, provider, connection });

  if (syncing || sessionImporting) {
    const stage = session?.progress?.stage || 'fetching_notion';
    return {
      statusLabel: 'Syncing into Noeis',
      tone: 'neutral',
      headline: `Import in progress — ${stage.replace(/_/g, ' ')}.`,
      summary: '',
      detail: 'Pages and database rows are being saved as notebook entries. This can take a minute for large workspaces.',
      nextAction: { label: 'Sync from Notion' },
      isLive: true,
      liveMessage: `Syncing Notion — ${stage.replace(/_/g, ' ')}`
    };
  }

  if (failure) {
    return {
      statusLabel: 'Sync failed',
      tone: 'warning',
      headline: `Failed during ${failure.stage.replace(/_/g, ' ')}.`,
      summary: '',
      detail: failure.message,
      failureStage: failure.stage,
      failureMessage: failure.message,
      nextAction: { label: connection?.id ? 'Sync from Notion' : 'Connect Notion' },
      isLive: true,
      liveMessage: `Notion sync failed — ${failure.message}`
    };
  }

  if (!connection?.id) {
    return {
      statusLabel: 'Not connected',
      tone: 'neutral',
      headline: 'Connect opens Notion in your browser.',
      summary: '',
      detail: 'After approval, Noeis returns here with the workspace connected. Then preview or sync the pages you shared with the integration.',
      nextAction: { label: 'Connect Notion' },
      isLive: false
    };
  }

  const result = pickResult({
    durable: connection.lastSyncResult,
    stats: lastImportSourceLabel === accountLabel ? importStats : null,
    session,
    provider
  });
  const summary = formatProviderSyncSummary(result, provider);
  const completedWithWarnings = sessionActive && session?.status === 'completed_with_warnings';

  if (connection.lastReceipt && connection.lastSyncAt) {
    return buildDurableReceiptCard(connection.lastReceipt, accountLabel);
  }

  if (connection.lastSyncAt) {
    const imported = Number(connection.lastSyncResult?.importedNotes || result?.importedNotes || 0);
    const pageSuffix = imported > 0 ? ` · ${imported} page${imported === 1 ? '' : 's'}` : '';
    return {
      statusLabel: completedWithWarnings || withWarnings(result) ? 'Synced with warnings' : 'Synced into Noeis',
      tone: completedWithWarnings || withWarnings(result) ? 'warning' : 'success',
      headline: `Last synced ${formatLoopDate(connection.lastSyncAt)}${pageSuffix}.`,
      summary,
      detail: 'Imported pages are available as notebook entries and source material for Library search, Think retrieval, and Morning Paper maintenance.',
      nextAction: { label: 'Sync again' },
      isLive: false
    };
  }

  if (connection.lastPreviewAt || previewing) {
    return {
      statusLabel: previewing ? 'Previewing scope' : 'Scope previewed',
      tone: 'warning',
      headline: previewing
        ? 'Sampling shared Notion pages and databases…'
        : `Previewed ${formatLoopDate(connection.lastPreviewAt)}.`,
      summary: '',
      detail: 'No pages have been imported yet. Run Sync from Notion to make the previewed workspace material retrievable in Noeis.',
      nextAction: { label: 'Sync from Notion' },
      isLive: previewing,
      liveMessage: previewing ? 'Previewing Notion scope' : undefined
    };
  }

  if (connection.lastValidatedAt || connection.status === 'connected') {
    return {
      statusLabel: 'Connected, not synced',
      tone: 'warning',
      headline: connection.lastValidatedAt
        ? `Connection checked ${formatLoopDate(connection.lastValidatedAt)}.`
        : 'OAuth is connected.',
      summary: '',
      detail: 'Share the pages or databases you want Noeis to read with the integration, then run Preview scope or Sync from Notion.',
      nextAction: { label: 'Preview or sync' },
      isLive: false
    };
  }

  return {
    statusLabel: connection.status || 'Needs attention',
    tone: 'warning',
    headline: 'Reconnect Notion if this looks stale.',
    summary: '',
    detail: connection.lastError || 'No successful validation, preview, or sync has been recorded yet.',
    nextAction: { label: 'Reconnect Notion' },
    isLive: false
  };
};

export const buildReadwiseConnectionReceipt = ({
  readwiseAgentConnection = null,
  readwiseSyncConnection = null,
  connection = null,
  session = null,
  importStats = null,
  lastImportSourceLabel = '',
  syncing = false,
  previewing = false,
  checking = false
} = {}) => {
  const provider = 'readwise';
  const syncConnection = readwiseSyncConnection || (connection?.mode !== 'mcp_remote' ? connection : null);
  const agentConnection = readwiseAgentConnection || (connection?.mode === 'mcp_remote' ? connection : null);
  const accountLabel = syncConnection?.accountLabel || agentConnection?.accountLabel || 'Readwise';
  const sessionActive = session?.provider === provider;
  const sessionImporting = sessionActive && session?.status === 'importing';
  const failure = resolveFailure({ session, provider, connection: syncConnection || agentConnection });

  if (syncing || sessionImporting) {
    const stage = session?.progress?.stage || 'fetching_readwise';
    return {
      statusLabel: 'Syncing into Noeis',
      tone: 'neutral',
      headline: `Import in progress — ${stage.replace(/_/g, ' ')}.`,
      summary: '',
      detail: 'Highlights and articles are being saved for Library search and Think retrieval.',
      nextAction: { label: 'Sync from Readwise' },
      isLive: true,
      liveMessage: `Syncing Readwise — ${stage.replace(/_/g, ' ')}`
    };
  }

  if (checking) {
    return {
      statusLabel: 'Checking connection',
      tone: 'neutral',
      headline: 'Validating Readwise access…',
      summary: '',
      detail: 'Confirming the saved token or OAuth connection is still healthy.',
      nextAction: { label: 'Check connection' },
      isLive: true,
      liveMessage: 'Checking Readwise connection'
    };
  }

  if (failure) {
    return {
      statusLabel: 'Sync failed',
      tone: 'warning',
      headline: `Failed during ${failure.stage.replace(/_/g, ' ')}.`,
      summary: '',
      detail: failure.message,
      failureStage: failure.stage,
      failureMessage: failure.message,
      nextAction: { label: syncConnection?.id ? 'Sync from Readwise' : 'Connect with Readwise' },
      isLive: true,
      liveMessage: `Readwise sync failed — ${failure.message}`
    };
  }

  if (!syncConnection?.id && !agentConnection?.id) {
    return {
      statusLabel: 'Not connected',
      tone: 'neutral',
      headline: 'Connect through browser approval first.',
      summary: '',
      detail: 'Readwise opens in your browser for approval, then agents can retrieve highlights. Add an API token when you want direct Library sync.',
      nextAction: { label: 'Connect with Readwise' },
      isLive: false
    };
  }

  const result = pickResult({
    durable: syncConnection?.lastSyncResult,
    stats: lastImportSourceLabel === accountLabel ? importStats : null,
    session,
    provider
  });
  const summary = formatProviderSyncSummary(result, provider);
  const completedWithWarnings = sessionActive && session?.status === 'completed_with_warnings';

  if (syncConnection?.lastReceipt && syncConnection?.lastSyncAt) {
    return buildDurableReceiptCard(syncConnection.lastReceipt, accountLabel);
  }

  if (syncConnection?.lastSyncAt) {
    return {
      statusLabel: completedWithWarnings || withWarnings(result) ? 'Synced with warnings' : 'Synced into Noeis',
      tone: completedWithWarnings || withWarnings(result) ? 'warning' : 'success',
      headline: `Last synced ${formatLoopDate(syncConnection.lastSyncAt)}.`,
      summary,
      detail: 'Imported highlights feed Library search, Think retrieval, and Morning Paper source maintenance.',
      nextAction: { label: 'Sync again' },
      isLive: false
    };
  }

  if (syncConnection?.lastPreviewAt || previewing) {
    return {
      statusLabel: previewing ? 'Previewing scope' : 'Scope previewed',
      tone: 'warning',
      headline: previewing
        ? 'Sampling Readwise highlights and articles…'
        : `Previewed ${formatLoopDate(syncConnection.lastPreviewAt)}.`,
      summary: '',
      detail: 'Review the preview snapshot, then run Sync from Readwise to import new highlights into Noeis.',
      nextAction: { label: 'Sync from Readwise' },
      isLive: previewing,
      liveMessage: previewing ? 'Previewing Readwise scope' : undefined
    };
  }

  if (agentConnection?.id && !syncConnection?.id) {
    return {
      statusLabel: 'Agent access connected',
      tone: 'warning',
      headline: 'Browser approval is ready for agents.',
      summary: '',
      detail: 'Direct Library refresh still needs the advanced API-token connection or a Readwise CSV upload.',
      nextAction: { label: 'Add API token' },
      isLive: false
    };
  }

  if (syncConnection?.lastValidatedAt || syncConnection?.status === 'connected') {
    return {
      statusLabel: 'Connected, not synced',
      tone: 'warning',
      headline: syncConnection.lastValidatedAt
        ? `Connection checked ${formatLoopDate(syncConnection.lastValidatedAt)}.`
        : 'Token connection is ready.',
      summary: '',
      detail: 'Run Preview scope or Sync from Readwise to move highlights into the Library and return loop.',
      nextAction: { label: 'Preview or sync' },
      isLive: false
    };
  }

  return {
    statusLabel: syncConnection?.status || 'Needs attention',
    tone: 'warning',
    headline: 'Reconnect Readwise if this looks stale.',
    summary: '',
    detail: syncConnection?.lastError || 'No successful validation, preview, or sync has been recorded yet.',
    nextAction: { label: 'Connect with Readwise' },
    isLive: false
  };
};

export const buildEvernoteConnectionReceipt = ({
  session = null,
  importStats = null,
  lastImportSourceLabel = '',
  importing = false,
  previewing = false
} = {}) => {
  const provider = 'evernote';
  const sessionActive = session?.provider === provider;
  const sessionImporting = sessionActive && session?.status === 'importing';
  const failure = resolveFailure({
    session,
    provider,
    fallbackMessage: 'Evernote ENEX import failed. Your file selection is preserved.'
  });

  if (importing || sessionImporting) {
    const stage = session?.progress?.stage || 'importing_enex';
    return {
      statusLabel: 'Importing into Noeis',
      tone: 'neutral',
      headline: `Import in progress — ${stage.replace(/_/g, ' ')}.`,
      summary: '',
      detail: 'Parsed notes are being saved into Think with tags, dates, and semantic indexing queued behind the import.',
      nextAction: { label: 'Import ENEX' },
      isLive: true,
      liveMessage: `Importing Evernote — ${stage.replace(/_/g, ' ')}`
    };
  }

  if (previewing) {
    return {
      statusLabel: 'Previewing ENEX',
      tone: 'neutral',
      headline: 'Parsing the selected Evernote export…',
      summary: '',
      detail: 'Review note counts, titles, and tags before importing into Think.',
      nextAction: { label: 'Preview ENEX' },
      isLive: true,
      liveMessage: 'Previewing Evernote ENEX'
    };
  }

  if (failure) {
    return {
      statusLabel: 'Import failed',
      tone: 'warning',
      headline: `Failed during ${failure.stage.replace(/_/g, ' ')}.`,
      summary: '',
      detail: failure.message,
      failureStage: failure.stage,
      failureMessage: failure.message,
      nextAction: { label: 'Import ENEX' },
      isLive: true,
      liveMessage: `Evernote import failed — ${failure.message}`
    };
  }

  const label = lastImportSourceLabel || session?.sourceLabel || '';
  const durableReceipt = sessionActive ? session?.receipt : null;
  const result = pickResult({
    durable: durableReceipt?.metrics,
    stats: importStats,
    session,
    provider
  });
  const summary = formatProviderSyncSummary(result, provider);
  const completed = sessionActive && ['completed', 'completed_with_warnings'].includes(session?.status);
  const hasImport = Boolean(result && Number(result.importedNotes || 0) > 0);

  if (completed || hasImport) {
    if (durableReceipt) {
      return buildDurableReceiptCard(durableReceipt, 'Evernote');
    }
    const folderLabel = label.replace(/\.[^./\\]+$/, '').trim() || 'Evernote import';
    return {
      statusLabel: session?.status === 'completed_with_warnings' || withWarnings(result)
        ? 'Imported with warnings'
        : 'Imported into Noeis',
      tone: session?.status === 'completed_with_warnings' || withWarnings(result) ? 'warning' : 'success',
      headline: `Last import ${formatLoopDate(session?.updatedAt || session?.completedAt)} — mirrored "${folderLabel}" folder.`,
      summary,
      detail: 'Imported notes live in Think under the mirrored notebook folder and feed downstream retrieval.',
      nextAction: { label: 'Import another ENEX' },
      isLive: false
    };
  }

  return {
    statusLabel: 'Ready to import',
    tone: 'neutral',
    headline: 'Export a notebook as ENEX, then drop it here.',
    summary: '',
    detail: 'ENEX is the reliable self-serve path today. Browser OAuth sync waits on Evernote API approval.',
    nextAction: { label: 'Choose ENEX' },
    isLive: false
  };
};
