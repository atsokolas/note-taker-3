const axios = require('axios');

const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const NOTION_SEARCH_URL = 'https://api.notion.com/v1/search';
const NOTION_BLOCK_CHILDREN_BASE_URL = 'https://api.notion.com/v1/blocks';
const NOTION_DATA_SOURCE_BASE_URL = 'https://api.notion.com/v1/data_sources';
const NOTION_PAGES_URL = 'https://api.notion.com/v1/pages';
const NOTION_VERSION = '2025-09-03';

const toTrimmedString = (value = '') => String(value || '').trim();

const notionHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'Notion-Version': NOTION_VERSION
});

const notionBasicHeaders = () => {
  const clientId = toTrimmedString(process.env.NOTION_CLIENT_ID);
  const clientSecret = toTrimmedString(process.env.NOTION_CLIENT_SECRET);
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/json'
  };
};

const exchangeNotionCode = async ({ code, redirectUri }) => {
  const response = await axios.post(NOTION_TOKEN_URL, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  }, {
    headers: notionBasicHeaders(),
    timeout: 20000
  });
  return response.data || {};
};

const fetchNotionBlockChildren = async ({ token, blockId, blockToPlainText, depth = 0, maxDepth = 4 }) => {
  if (!blockId || depth > maxDepth) return [];
  const blocks = [];
  let cursor = '';
  do {
    const response = await axios.get(`${NOTION_BLOCK_CHILDREN_BASE_URL}/${encodeURIComponent(blockId)}/children`, {
      headers: notionHeaders(token),
      params: cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 },
      timeout: 20000
    });
    const payload = response.data || {};
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const block of results) {
      const text = blockToPlainText(block);
      if (text) blocks.push(text);
      if (block?.has_children) {
        const childBlocks = await fetchNotionBlockChildren({
          token,
          blockId: block.id,
          blockToPlainText,
          depth: depth + 1,
          maxDepth
        });
        blocks.push(...childBlocks);
      }
    }
    cursor = payload.has_more ? toTrimmedString(payload.next_cursor) : '';
  } while (cursor);
  return blocks;
};

const searchNotionItems = async ({ token, filterValue = '', pageSize = 100 }) => {
  const results = [];
  let nextCursor = '';
  do {
    const body = { page_size: pageSize };
    if (filterValue) {
      body.filter = { property: 'object', value: filterValue };
    }
    if (nextCursor) body.start_cursor = nextCursor;
    const response = await axios.post(NOTION_SEARCH_URL, body, {
      headers: notionHeaders(token),
      timeout: 20000
    });
    const payload = response.data || {};
    results.push(...(Array.isArray(payload.results) ? payload.results : []));
    nextCursor = payload.has_more ? toTrimmedString(payload.next_cursor) : '';
  } while (nextCursor);
  return results;
};

const searchNotionPreviewItems = async ({ token, filterValue = '', pageSize = 25 }) => {
  const body = {
    page_size: Math.min(Math.max(Number(pageSize) || 25, 1), 100)
  };
  if (filterValue) {
    body.filter = { property: 'object', value: filterValue };
  }
  const response = await axios.post(NOTION_SEARCH_URL, body, {
    headers: notionHeaders(token),
    timeout: 20000
  });
  const payload = response.data || {};
  return {
    results: Array.isArray(payload.results) ? payload.results : [],
    hasMore: Boolean(payload.has_more),
    nextCursor: toTrimmedString(payload.next_cursor)
  };
};

const queryNotionDataSourcePages = async ({ token, dataSourceId }) => {
  const results = [];
  let nextCursor = '';
  do {
    const body = { page_size: 100 };
    if (nextCursor) body.start_cursor = nextCursor;
    const response = await axios.post(`${NOTION_DATA_SOURCE_BASE_URL}/${encodeURIComponent(dataSourceId)}/query`, body, {
      headers: notionHeaders(token),
      timeout: 20000
    });
    const payload = response.data || {};
    results.push(...(Array.isArray(payload.results) ? payload.results : []));
    nextCursor = payload.has_more ? toTrimmedString(payload.next_cursor) : '';
  } while (nextCursor);
  return results;
};

const queryNotionDataSourcePreviewPages = async ({ token, dataSourceId, pageSize = 10 }) => {
  const response = await axios.post(`${NOTION_DATA_SOURCE_BASE_URL}/${encodeURIComponent(dataSourceId)}/query`, {
    page_size: Math.min(Math.max(Number(pageSize) || 10, 1), 100)
  }, {
    headers: notionHeaders(token),
    timeout: 20000
  });
  const payload = response.data || {};
  return {
    results: Array.isArray(payload.results) ? payload.results : [],
    hasMore: Boolean(payload.has_more),
    nextCursor: toTrimmedString(payload.next_cursor)
  };
};

const createNotionPage = async ({
  token,
  title,
  children = [],
  parentPageId = ''
}) => {
  const safeChildren = Array.isArray(children) ? children.slice(0, 100) : [];
  const response = await axios.post(NOTION_PAGES_URL, {
    parent: toTrimmedString(parentPageId)
      ? { type: 'page_id', page_id: toTrimmedString(parentPageId) }
      : { type: 'workspace', workspace: true },
    properties: {
      title: {
        title: [{
          type: 'text',
          text: {
            content: toTrimmedString(title) || 'Untitled'
          }
        }]
      }
    },
    children: safeChildren
  }, {
    headers: notionHeaders(token),
    timeout: 20000
  });
  return response.data || {};
};

const updateNotionPageTitle = async ({ token, pageId, title }) => {
  const safePageId = toTrimmedString(pageId);
  if (!safePageId) return {};
  const response = await axios.patch(`${NOTION_PAGES_URL}/${encodeURIComponent(safePageId)}`, {
    properties: {
      title: {
        title: [{
          type: 'text',
          text: {
            content: toTrimmedString(title) || 'Untitled'
          }
        }]
      }
    }
  }, {
    headers: notionHeaders(token),
    timeout: 20000
  });
  return response.data || {};
};

const appendNotionBlockChildren = async ({ token, blockId, children = [] }) => {
  const safeBlockId = toTrimmedString(blockId);
  if (!safeBlockId) return {};
  const safeChildren = Array.isArray(children) ? children.slice(0, 100) : [];
  const response = await axios.patch(`${NOTION_BLOCK_CHILDREN_BASE_URL}/${encodeURIComponent(safeBlockId)}/children`, {
    children: safeChildren
  }, {
    headers: notionHeaders(token),
    timeout: 20000
  });
  return response.data || {};
};

module.exports = {
  NOTION_AUTHORIZE_URL,
  appendNotionBlockChildren,
  createNotionPage,
  exchangeNotionCode,
  fetchNotionBlockChildren,
  queryNotionDataSourcePages,
  queryNotionDataSourcePreviewPages,
  searchNotionItems,
  searchNotionPreviewItems,
  updateNotionPageTitle
};
