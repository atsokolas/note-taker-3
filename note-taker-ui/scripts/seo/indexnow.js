#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const publishingContent = require('../../src/seo/publishingContent.json');

const endpoint = String(process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow').trim();
const key = String(process.env.INDEXNOW_KEY || '').trim();
const dryRun = process.argv.includes('--dry-run');
const writeKeyFile = process.argv.includes('--write-key-file');

const buildUrl = (host, pathname = '/') => {
  const normalized = String(pathname || '/').startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalized, `${host}/`).toString();
};

const run = async () => {
  if (!key) {
    throw new Error('INDEXNOW_KEY is required.');
  }

  const hostUrl = new URL(publishingContent.site.host);
  const keyLocation = String(
    process.env.INDEXNOW_KEY_LOCATION || buildUrl(publishingContent.site.host, `/${key}.txt`)
  ).trim();
  const urlList = [
    buildUrl(publishingContent.site.host, '/'),
    buildUrl(publishingContent.site.host, '/guides'),
    ...publishingContent.guides.map((guide) => buildUrl(publishingContent.site.host, `/${guide.slug}`))
  ];

  const payload = {
    host: hostUrl.host,
    key,
    keyLocation,
    urlList
  };

  if (writeKeyFile) {
    const filePath = path.resolve(__dirname, '../../public', `${key}.txt`);
    await fs.writeFile(filePath, key, 'utf8');
    process.stdout.write(`Wrote IndexNow key file to ${filePath}\n`);
  }

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`IndexNow submission failed (${response.status}): ${body}`);
  }

  process.stdout.write(`Submitted ${urlList.length} URLs to ${endpoint}\n`);
};

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
