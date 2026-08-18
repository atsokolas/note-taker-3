- Added dev-only perf timing logs for `library.list.load`, `concept.page.load`, `concept.page.first-render`, `studio.board.load`, and `studio.board.first-render`.
- Added React Profiler markers for heavy trees: library articles/highlights/context, concept page tree, and studio board tree.
- Virtualized long Library lists with a reusable `VirtualList` and dynamic row-height support for expandable highlight cards.
- Debounced network-driven search calls in `useHighlightsQuery` and `useArticles` (260ms in search UIs) and kept board drag persistence debounced (500ms bulk update).
- Applied lazy media handling for article content (`img`, `video`, `iframe`) and image decoding hints for auth/landing logos.

## Where the cold-load seconds actually go (2026-08-18)

The nine- and fifteen-second waits seen on production are the API waking up,
not the app arriving. Measured rather than assumed, so this does not get
re-litigated.

### The app arriving

Production build, gzipped, one route per browser context, `/wiki` cold:

| link                        | HTML | CSS done | JS done | DOMContentLoaded |
|-----------------------------|------|----------|---------|------------------|
| 20 Mbps / 40ms (broadband)  |  45  |   145    |   187   | **215ms**        |
| 5 Mbps / 80ms (good 4G)     |  91  |   349    |   485   | **492ms**        |
| 1.6 Mbps / 150ms (Fast 3G)  | 175  |   832    |  1239   | **1282ms**       |

The 1.1–1.3s "chrome" figure quoted earlier was the Fast-3G row. On any link
a person actually reads on, the chrome is already well inside the one-second
target, and the entry bundle is not what anybody is waiting for.

Entry chunk, for the record: 178kB JS and 99kB CSS gzipped. Of the 1.65MB of
source behind that JS, 1.0MB is react-dom, react-router, and axios — a floor
that no amount of splitting moves. The remaining app code in the entry is
about 580kB of source, and shaving all of it would be worth roughly sixty
milliseconds on the slowest row above. The CSS is render-blocking but lands
400ms *before* the JS, so it is not the gate either.

### The API waking up

`note-taker-3` (srv-cu084j1u0jms73ct6pe0) runs on Render's **free plan**,
which spins the instance down after about fifteen idle minutes and cold-starts
it on the next request. Its CPU limit is 0.15 of a core.

Between 12:00 and 20:30 on 2026-08-18 the service logged eighteen boots:

    12:05  12:22  12:29  13:03  14:14  14:26  14:49  15:36  16:14
    16:31  18:19  18:47  18:56  19:01  19:10  19:12  19:34  19:44

Eight of those match a deploy. The other ten had no deploy behind them, so
they are the instance being restarted from cold — roughly one an hour, and
every one of them is a person waiting on a blank surface.

Timed directly against production. Seventeen minutes of deliberate silence,
then one request to `/api/public/wiki/proof`:

    COLD  total 32.08s   ttfb 32.05s   200
    WARM  total  2.60s   ttfb  2.56s   200   (the very next request)

Fully warm, the same endpoint answers in 320–820ms. So the first person
through the door after an idle spell waits half a minute, the next one waits
two and a half seconds, and everybody after that is fine. That is the nine and
fifteen seconds — those were partial waits, caught somewhere inside a boot
already in progress.

Idle CPU sits at 0.001–0.002 of a core and memory at 90–134MB of 512MB, so
nothing here is a code-efficiency problem: it is the plan.

The AI service (srv-d5si8k63jp1c738a1bg0) is also on the free plan and logged
nothing at all that day, so it is fully cold and will pay its own uvicorn
start the first time an agent operation reaches it. It is not on the
page-load path.

### What this means

Front-end work on cold load is finished; there is nothing left there worth the
risk. Getting rid of the nine seconds is a hosting decision — a paid instance
that does not spin down — not a code change.
