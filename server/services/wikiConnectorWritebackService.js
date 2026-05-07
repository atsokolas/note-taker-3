const toText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const truncateNotionText = (value = '', limit = 1900) => {
  const text = toText(value);
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
};

const textToRichText = (value = '') => {
  const text = truncateNotionText(value);
  if (!text) return [];
  return [{ type: 'text', text: { content: text } }];
};

const notionBlock = (type, value = '') => ({
  object: 'block',
  type,
  [type]: { rich_text: textToRichText(value) }
});

const tiptapToNotionBlocks = (node, blocks = []) => {
  if (!node) return blocks;
  if (Array.isArray(node)) {
    node.forEach(child => tiptapToNotionBlocks(child, blocks));
    return blocks;
  }
  if (typeof node !== 'object') return blocks;

  const text = toText([
    typeof node.text === 'string' ? node.text : '',
    Array.isArray(node.content) ? node.content.map(child => toText(child.text || '')).join(' ') : ''
  ].join(' '));

  if (node.type === 'heading' && text) {
    const level = Number(node.attrs?.level) || 2;
    blocks.push(notionBlock(level === 1 ? 'heading_1' : (level === 3 ? 'heading_3' : 'heading_2'), text));
    return blocks;
  }
  if ((node.type === 'paragraph' || node.type === 'blockquote') && text) {
    blocks.push(notionBlock('paragraph', text));
    return blocks;
  }
  if (node.type === 'bulletList' && Array.isArray(node.content)) {
    node.content.forEach(item => {
      const itemText = toText((item.content || []).map(child => (
        child.type === 'paragraph' && Array.isArray(child.content)
          ? child.content.map(grandchild => grandchild.text || '').join(' ')
          : ''
      )).join(' '));
      if (itemText) blocks.push(notionBlock('bulleted_list_item', itemText));
    });
    return blocks;
  }
  if (Array.isArray(node.content)) tiptapToNotionBlocks(node.content, blocks);
  return blocks;
};

const createConnectorLog = async ({
  ConnectorActionLog,
  userId,
  connector,
  action,
  direction = 'write',
  status = 'completed',
  targetType = '',
  targetId = '',
  summary = '',
  errorMessage = '',
  metadata = {}
} = {}) => {
  if (!ConnectorActionLog || !userId || !connector || !action) return null;
  const log = new ConnectorActionLog({
    userId,
    connector,
    action,
    direction,
    status,
    targetType,
    targetId,
    summary,
    errorMessage,
    metadata
  });
  await log.save();
  return log;
};

const writeWikiPageToConnector = async ({
  page,
  userId,
  connector,
  connectionId = '',
  parentPageId = '',
  notionPageId = '',
  models = {},
  createNotionPage,
  appendNotionBlockChildren,
  updateNotionPageTitle,
  decryptSecret
} = {}) => {
  const {
    IntegrationConnection,
    ConnectorActionLog
  } = models;
  const normalizedConnector = String(connector || '').trim().toLowerCase();
  if (!page || !userId) {
    const error = new Error('Wiki page and user are required for connector write-back.');
    error.code = 'WRITEBACK_INVALID_INPUT';
    throw error;
  }

  if (normalizedConnector !== 'notion') {
    await createConnectorLog({
      ConnectorActionLog,
      userId,
      connector: normalizedConnector || 'unknown',
      action: 'wiki_writeback',
      status: 'skipped',
      targetType: 'wiki_page',
      targetId: String(page._id || ''),
      summary: `${normalizedConnector || 'Connector'} write-back is not supported yet.`
    });
    const error = new Error('Only Notion wiki write-back is currently supported.');
    error.code = 'CONNECTOR_WRITEBACK_UNSUPPORTED';
    throw error;
  }

  if (!IntegrationConnection || !createNotionPage || !decryptSecret) {
    const error = new Error('Notion write-back is not configured.');
    error.code = 'CONNECTOR_WRITEBACK_NOT_CONFIGURED';
    throw error;
  }

  const connection = await IntegrationConnection.findOne({
    _id: connectionId,
    userId,
    provider: 'notion'
  });
  if (!connection) {
    const error = new Error('Notion connection not found.');
    error.code = 'CONNECTOR_CONNECTION_NOT_FOUND';
    throw error;
  }
  if (!connection.encryptedAccessToken) {
    const error = new Error('Notion access token is missing for this connection.');
    error.code = 'CONNECTOR_TOKEN_MISSING';
    throw error;
  }

  const bodyBlocks = tiptapToNotionBlocks(page.body).slice(0, 90);
  const syncStamp = new Date().toISOString();
  const children = [
    notionBlock('paragraph', `Synced from Noeis Wiki at ${syncStamp}. Status: ${page.status || 'draft'}.`),
    ...bodyBlocks
  ].filter(block => Array.isArray(block?.[block.type]?.rich_text) && block[block.type].rich_text.length > 0).slice(0, 100);

  try {
    const token = decryptSecret(connection.encryptedAccessToken);
    const explicitPageId = String(notionPageId || '').trim();
    let existingPageId = explicitPageId;
    if (!existingPageId && ConnectorActionLog?.findOne) {
      const previous = await ConnectorActionLog.findOne({
        userId,
        connector: 'notion',
        action: 'wiki_writeback',
        status: 'completed',
        targetType: 'wiki_page',
        targetId: String(page._id || ''),
        'metadata.notionPageId': { $nin: ['', null] }
      }).sort({ createdAt: -1 }).lean();
      existingPageId = String(previous?.metadata?.notionPageId || '').trim();
    }

    let notionPage = null;
    let writeMode = 'created';
    if (existingPageId && appendNotionBlockChildren) {
      if (updateNotionPageTitle) {
        await updateNotionPageTitle({ token, pageId: existingPageId, title: page.title || 'Untitled Wiki Page' });
      }
      await appendNotionBlockChildren({ token, blockId: existingPageId, children });
      notionPage = { id: existingPageId, url: `https://www.notion.so/${existingPageId.replace(/-/g, '')}` };
      writeMode = 'updated';
    } else {
      notionPage = await createNotionPage({
        token,
        title: page.title || 'Untitled Wiki Page',
        children,
        parentPageId
      });
    }
    connection.lastSyncAt = new Date();
    connection.health = 'healthy';
    connection.status = 'connected';
    connection.lastError = '';
    await connection.save();
    await createConnectorLog({
      ConnectorActionLog,
      userId,
      connector: 'notion',
      action: 'wiki_writeback',
      status: 'completed',
      targetType: 'wiki_page',
      targetId: String(page._id || ''),
      summary: `${writeMode === 'updated' ? 'Updated' : 'Wrote'} "${page.title || 'Untitled Wiki Page'}" in Notion.`,
      metadata: { notionPageId: notionPage?.id || '', notionUrl: notionPage?.url || '', writeMode }
    });
    return {
      ok: true,
      connector: 'notion',
      writeMode,
      page: {
        id: notionPage?.id || '',
        url: notionPage?.url || '',
        title: page.title || 'Untitled Wiki Page'
      }
    };
  } catch (error) {
    await createConnectorLog({
      ConnectorActionLog,
      userId,
      connector: 'notion',
      action: 'wiki_writeback',
      status: 'failed',
      targetType: 'wiki_page',
      targetId: String(page._id || ''),
      summary: `Failed writing "${page.title || 'Untitled Wiki Page'}" to Notion.`,
      errorMessage: error.message || 'Notion write-back failed.'
    });
    throw error;
  }
};

module.exports = {
  createConnectorLog,
  tiptapToNotionBlocks,
  writeWikiPageToConnector
};
