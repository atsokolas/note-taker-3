#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <approved-public-weekend-readings-url> [output-directory]" >&2
  exit 2
fi

ARTIFACT_URL="$1"
QA_OUTPUT_DIR="${2:-$(pwd)/output/weekend-readings-responsive-qa}"
PWCLI="${PLAYWRIGHT_CLI_WRAPPER:-/Users/athantsokolas/.codex/skills/playwright/scripts/playwright_cli.sh}"

if [[ ! "$ARTIFACT_URL" =~ ^https?:// ]]; then
  echo "Artifact URL must be an explicit http(s) URL." >&2
  exit 2
fi
if [[ ! -x "$PWCLI" ]]; then
  echo "Playwright CLI wrapper is unavailable at $PWCLI" >&2
  exit 2
fi

mkdir -p "$QA_OUTPUT_DIR"

check_viewport() {
  local session="$1"
  local browser="$2"
  local width="$3"
  local height="$4"
  local label="$5"

  "$PWCLI" --session "$session" open "$ARTIFACT_URL" --browser "$browser"
  "$PWCLI" --session "$session" resize "$width" "$height"
  "$PWCLI" --session "$session" reload
  "$PWCLI" --session "$session" eval "async () => { for (let attempt = 0; attempt < 100; attempt += 1) { const artifact = document.querySelector('main.shared-wiki-page.is-weekend-readings'); const title = artifact?.querySelector('h1')?.textContent?.trim(); if (artifact && /^Weekend Readings/.test(title || '')) return { ready: true, title }; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Weekend Readings artifact did not become ready within 10 seconds.'); }" > "$QA_OUTPUT_DIR/$label-ready.txt"
  "$PWCLI" --session "$session" snapshot > "$QA_OUTPUT_DIR/$label-snapshot.txt"
  "$PWCLI" --session "$session" screenshot --filename "$QA_OUTPUT_DIR/$label.png" --full-page
  "$PWCLI" --session "$session" eval "() => { const root = document.documentElement; const artifact = document.querySelector('main.shared-wiki-page.is-weekend-readings'); const text = artifact?.innerText || ''; const h1s = [...(artifact?.querySelectorAll('h1') || [])].map(node => node.textContent.trim()).filter(Boolean); const sourceLinks = [...(artifact?.querySelectorAll('a[href^=\"http\"]') || [])]; const result = { url: location.href, width: innerWidth, artifactMode: Boolean(artifact), h1s, hScroll: root.scrollWidth > root.clientWidth + 2, sourceLinkCount: sourceLinks.length, hasPrivateStatusCopy: /Private draft|Review requested|Approved revision|reapproval required/i.test(text), hasFatalError: /Cannot read|TypeError|Application error|Something went wrong/i.test(text), emptyLinks: sourceLinks.filter(link => !link.textContent.trim()).length }; if (!result.artifactMode) throw new Error('Weekend Readings artifact mode is absent.'); if (result.h1s.length !== 1 || !/^Weekend Readings/.test(result.h1s[0])) throw new Error('Weekend Readings public artifact must render exactly one edition h1.'); if (result.sourceLinkCount < 1) throw new Error('Weekend Readings artifact must retain at least one direct source link.'); if (result.hScroll) throw new Error('Weekend Readings artifact has horizontal clipping.'); if (result.hasPrivateStatusCopy) throw new Error('Public artifact leaked private approval-state copy.'); if (result.hasFatalError) throw new Error('Public artifact contains fatal error text.'); if (result.emptyLinks) throw new Error('Public artifact contains unlabeled source links.'); return result; }" > "$QA_OUTPUT_DIR/$label-contract.txt"
  "$PWCLI" --session "$session" console error > "$QA_OUTPUT_DIR/$label-console-errors.txt"
  "$PWCLI" --session "$session" close
}

check_viewport "weekend-readings-desktop" "chrome" 1440 900 "desktop-1440"
check_viewport "weekend-readings-sidebar" "webkit" 1366 860 "webkit-1366"
check_viewport "weekend-readings-mobile" "webkit" 430 932 "mobile-430"

echo "Weekend Readings responsive evidence written to $QA_OUTPUT_DIR"
