# Market Scout Rules v1

## Purpose
Turn public X posts from selected signal sources into structured items for:
- watchlists
- research alerts
- execution alert candidates
- shadow-trade tracking

Initial source: KawzInvests

## Data source
- Primary path is the Hermes-backed direct X API.
- On this machine, source X credentials from `/Users/athantsokolas/.hermes/.env`.
- Do not use `xurl` as the operating read path unless it is explicitly re-authenticated and verified working.
- Market Scout should not depend on MCP/XMCP for normal monitoring.

## Classification ladder
### 1. Ignore
Use when the post is:
- pure banter
- geopolitical or macro chatter without tradable framing
- a reply with no clear thesis or ticker relevance
- too ambiguous to be useful

### 2. Watchlist
Use when the post has:
- sector relevance
- company relevance without clear action
- interesting thesis fragments
- vague directional interest

These belong in reports, not execution alerts.

### 3. Research alert
Use when the post has:
- explicit tickers or clear company references
- meaningful thesis updates
- evidence that could matter for positioning
- directional language, but not a clean enough instruction to trade immediately

These should be surfaced to Athan and tracked in shadow mode.

### 4. Execution alert candidate
Use only when the post has:
- explicit actionable language such as buy, add, starter, trim, sell, exit, or equivalent conviction phrasing
- identifiable ticker or asset
- usable interpretation without guesswork
- enough clarity to map into a position rule

If any of those are missing, downgrade to research alert.

## Current lessons from first live batch
1. KawzInvests often produces strong thesis content before producing clean execution language.
2. Ticker-bearing posts are not automatically execution signals.
3. Replies can still matter if they contain major thesis updates, but they should default to research alert unless very explicit.
4. Strong thematic posts around optical infrastructure, photonics, or supplier networks may matter even when the action cue is indirect.

## Translation rule
When in doubt:
- do not force an execution signal
- preserve the post as a research alert
- track whether later posts increase clarity

## Next refinement targets
- identify recurring phrases that historically precede stronger conviction
- separate original tweets from replies/quotes in scoring
- compare signal quality by post format
- add shadow-entry rules only after a larger sample
