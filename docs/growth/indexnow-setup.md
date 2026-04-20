# IndexNow Setup

Noeis now includes a submission helper at [note-taker-ui/scripts/seo/indexnow.js](/Users/athantsokolas/Documents/GitHub/note-taker-3-1/note-taker-ui/scripts/seo/indexnow.js:1).

Use it after you have an IndexNow key for `www.noeis.io`.

If you are also doing Bing XML verification, `npm run generate:seo` now supports:

- `BING_SITE_AUTH_TOKEN=your-token`
- `BING_SITE_AUTH_XML='<full xml payload>'`

That writes `public/BingSiteAuth.xml` at build time.

## Dry Run

```bash
cd /Users/athantsokolas/Documents/GitHub/note-taker-3-1/note-taker-ui
INDEXNOW_KEY=your-key npm run indexnow:submit -- --dry-run
```

## Write The Key File

This writes `public/<key>.txt` so the site can serve the ownership file.

```bash
cd /Users/athantsokolas/Documents/GitHub/note-taker-3-1/note-taker-ui
INDEXNOW_KEY=your-key npm run indexnow:submit -- --write-key-file --dry-run
```

## Submit The Current Public URL Set

```bash
cd /Users/athantsokolas/Documents/GitHub/note-taker-3-1/note-taker-ui
INDEXNOW_KEY=your-key npm run indexnow:submit
```

The script submits:

- `/`
- `/guides`
- every guide slug in `src/seo/publishingContent.json`

If you host the key file somewhere other than `https://www.noeis.io/<key>.txt`, set `INDEXNOW_KEY_LOCATION`.
