const assert = require('assert');
const express = require('express');
const bookRoutes = require('./bookRoutes');

/* Twice is looked for once a day, and looked for again when either passage
   of the day's pair was rewritten or deleted, or while the day has none. */
const USER = '64f600000000000000000001';
const BOOK = '64f600000000000000000002';
const MARK = '64f600000000000000000003';
const OTHER = '64f600000000000000000004';
const ECHO = '64f600000000000000000005';

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const words = 'Whatever you think is true is mostly a picture you made of it.';
let echoText = 'What you think true is mostly a picture you made.';
let looks = 0;
const Article = {
  find: () => new Query([{ _id: BOOK, title: 'A book', highlights: [{ _id: MARK, text: words, createdAt: '2026-01-01' }] }]),
  findOne: () => new Query(echoText ? { highlights: [{ _id: ECHO, text: echoText }] } : null)
};

const router = express.Router();
bookRoutes(router, {
  Article,
  authenticateToken: (req, res, next) => { req.user = { id: USER }; next(); },
  echoOf: async () => {
    looks += 1;
    return echoText ? { _id: ECHO, text: echoText, articleId: OTHER, articleTitle: 'Notes', createdAt: '2024-01-01' } : null;
  }
});
const app = express();
app.use(router);

const server = app.listen(0, '127.0.0.1', async () => {
  try {
    const echo = async () => (await fetch(`http://127.0.0.1:${server.address().port}/api/books/echo?today=2026-11-25`)).json();
    assert.strictEqual((await echo()).echo.echo.text, echoText);
    assert.strictEqual((await echo()).echo.echo.text, echoText);
    assert.strictEqual(looks, 1, 'the same day asks once');

    echoText = 'Rewritten since.';
    assert.strictEqual((await echo()).echo.echo.text, 'Rewritten since.');
    assert.strictEqual(looks, 2, 'a rewritten passage is looked for again');

    echoText = '';
    assert.strictEqual((await echo()).echo, null, 'a deleted passage is never shown');

    echoText = 'Read since.';
    assert.strictEqual((await echo()).echo.echo.text, 'Read since.', 'a day with none yet keeps looking');
    console.log('bookEcho tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
