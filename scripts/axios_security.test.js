const assert = require('node:assert/strict');
const { test } = require('node:test');

const axios = require('axios');

test('Axios enforces maxContentLength before decoding a data URL', async () => {
  await assert.rejects(
    axios.get('data:text/plain;base64,aGVsbG8gd29ybGQ=', { maxContentLength: 4 }),
    /maxContentLength/
  );
});
