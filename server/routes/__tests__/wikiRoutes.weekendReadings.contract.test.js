const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'wikiRoutes.js'), 'utf8');

assert.match(source, /buildWeekendReadingsRouter/);
assert.match(source, /router\.use\(buildWeekendReadingsRouter\(\{/);
assert.match(source, /invalidatePublicPageCache:\s*\(\.\.\.keys\)\s*=>\s*publicPageCache\.invalidate\(keys\)/);
assert.match(source, /pageQuery\.select\('_id userId title slug pageType status visibility createdFrom/);
assert.match(source, /loadPublishedWeekendReadingsArtifact\(\{ NoeisReceipt, page, ownerUserId: page\.userId \}\)/);
assert.match(source, /Weekend Readings must be reviewed, approved, and published through its revision-bound publication controls/);
assert.match(source, /Published Weekend Readings editions are immutable public artifacts and cannot be adopted from the private draft/);
assert.match(source, /publicPages = pages\.filter\(page => !String\(page\?\.createdFrom\?\.label/);
assert.match(source, /const snapshots = \(Array\.isArray\(pages\) \? pages : \[\]\)[\s\S]*?filter\(page => !String\(page\?\.createdFrom\?\.label/);
assert.match(source, /publicPageCache\.invalidate\(serializeId\(page\._id\), before\?\.slug, page\.slug\)/);

console.log('wikiRoutes Weekend Readings integration contract tests passed');
