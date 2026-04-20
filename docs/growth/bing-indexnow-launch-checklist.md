# Bing + IndexNow Launch Checklist

## Goal
- Get `www.noeis.io` verified in Bing Webmaster Tools
- Turn on real IndexNow submissions
- Make the weekly SEO operator work from both Search Console and Bing signals

## 1. Verify the site in Bing Webmaster Tools
- Add `https://www.noeis.io` in Bing Webmaster Tools.
- Use the verification method that best fits deployment.
- If using XML file verification, set one of these before `npm run generate:seo`:
  - `BING_SITE_AUTH_TOKEN=your-token`
  - `BING_SITE_AUTH_XML='<full xml payload>'`
- The build will emit `note-taker-ui/public/BingSiteAuth.xml` automatically so it deploys at the site root.
- If using meta tag verification, add the tag to `note-taker-ui/public/index.html` and preserve it across future homepage changes.

## 2. Turn on a real IndexNow key
- Generate a real IndexNow key.
- Set `INDEXNOW_KEY` in the deployment environment for the frontend build/runtime where `npm run indexnow:submit` will execute.
- Run:

```bash
cd note-taker-ui
INDEXNOW_KEY=your-real-key npm run indexnow:submit
```

- Confirm the key file is reachable at `https://www.noeis.io/<key>.txt`.

## 3. Confirm the current URL set
- Validate that the sitemap contains the current public pages:
  - `/`
  - `/guides`
  - `/ai-second-brain`
  - `/second-brain-app`
  - `/ai-note-taking-workflow`
  - `/personal-knowledge-management-ai`
  - `/most-note-apps-solve-capture-not-recall`
  - `/readwise-is-not-a-second-brain`
  - `/highlights-into-concepts`
  - `/ai-reading-without-losing-judgment`
  - `/best-second-brain-app-for-founders`
  - `/best-second-brain-app-for-researchers`

## 4. Feed the operator with real exports
- Export recent query/page data from Google Search Console.
- Export Bing query/page performance data once available.
- Paste those exports into the in-app Search Console importer at `/search-console-opportunities`.
- Let the weekly operator use those exports to choose:
  - page refreshes
  - new page creation
  - low-value queries to ignore

## 5. Ongoing rhythm
- After shipping a new public page, run:

```bash
cd note-taker-ui
npm run generate:seo
INDEXNOW_KEY=your-real-key npm run indexnow:submit
```

- If Bing verification is file-based, keep `BING_SITE_AUTH_TOKEN` or `BING_SITE_AUTH_XML` present in the build environment so `BingSiteAuth.xml` keeps getting emitted.

- Review `Marketing analytics` and `Search Console Opportunities` weekly.
- Use the heartbeat to turn fresh exports into one concrete content or site action each cycle.
