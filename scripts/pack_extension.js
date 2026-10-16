#!/usr/bin/env node
/* Packs the Chrome extension for the Web Store.
 *
 * The manifest sits at the repository root so the save card can import the
 * app's placement rules without a build step. That makes zipping the folder
 * dangerous: it would ship the server, the docs and anything else lying
 * there. This copies exactly the files the extension runs into
 * dist/extension, and zips that. scripts/extension_smoke.js loads the result
 * in Chromium, so a file missing from this list fails CI, not a reader. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'manifest.json',
  'api.js',
  'background.js',
  'presence.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'save-card-switch.js',
  'margin.js',
  'Readability.js',
  'images/icon-16.png',
  'images/icon-32.png',
  'images/icon-48.png',
  'images/icon-128.png',
  // The placement switch's rules and looks, shared with the app.
  'note-taker-ui/src/pages/placementSwitchModel.js',
  'note-taker-ui/src/pages/placementModel.js',
  'note-taker-ui/src/utils/timeWord.js',
  'note-taker-ui/src/styles/placement-switch.css'
];

const pack = () => {
  const out = path.join(ROOT, 'dist', 'extension');
  fs.rmSync(out, { recursive: true, force: true });
  FILES.forEach((file) => {
    fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(out, file));
  });
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const zip = path.join(ROOT, 'dist', `noeis-extension-${version}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qrX', zip, '.'], { cwd: out });
  return { out, zip };
};

if (require.main === module) {
  const { zip } = pack();
  console.log(`Packed ${FILES.length} files into ${path.relative(ROOT, zip)} (${Math.round(fs.statSync(zip).size / 1024)} KB).`);
}

module.exports = { FILES, pack };
