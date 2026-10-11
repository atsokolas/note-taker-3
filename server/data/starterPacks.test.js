const test = require('node:test');
const assert = require('assert');
const packs = require('./starterPacks.json');

/* The bar a ready-made wiki has to clear before anyone is offered it: every
   page reads as a page, every claim names its source, and every source is a
   public link the taker's Library can save and open. */
test('every ready-made wiki page is written, cited, and sourced from the open web', () => {
  assert.ok(packs.length >= 3);
  packs.forEach((pack) => {
    const titles = new Set(pack.pages.map(page => page.title));
    pack.pages.forEach((page) => {
      const where = `${pack.id} / ${page.title}`;
      assert.ok(page.paragraphs.length >= 2, `${where} is more than a line`);
      assert.ok(page.sources.length >= 2, `${where} has sources`);
      page.sources.forEach((source) => {
        assert.match(source.url, /^https:\/\//, `${where}: ${source.title}`);
        assert.ok(source.evidence, `${where}: ${source.title} carries the line that supports it`);
      });
      const cited = new Set();
      page.paragraphs.forEach(paragraph => [...paragraph.matchAll(/\{([\d,\s]+)\}/g)]
        .forEach(([, indexes]) => indexes.split(',').forEach(index => cited.add(Number(index)))));
      cited.forEach(index => assert.ok(index >= 1 && index <= page.sources.length, `${where}: [${index}] exists`));
      assert.strictEqual(cited.size, page.sources.length, `${where}: every source is cited`);
      assert.doesNotMatch(page.paragraphs.join(' '), /\bSample\b|feed me/, where);
      page.links.forEach(link => assert.ok(titles.has(link), `${where} links to ${link}, a page in the same wiki`));
    });
  });
});
