# Noeis for Omarchy

Noeis as the reader on [Omarchy](https://github.com/omacom/omarchy) 4
("Quattro"), whose desktop runs as one Quickshell process with every piece of
it a plugin. All of noeis.io (Library, Think, Wiki, Judgment, Editions) opens
as an app in a window Hyprland tiles beside your work, and your nightstand
has a reading window of its own, drawn by the shell; the Noeis mark in the bar opens a panel where one field
takes either a link or a search.

## The reading window

`omarchy-shell noeis read` (Super+Alt+R, or Noeis reader in the launcher) opens it:
your nightstand on the left, the piece on the right, in your theme's colours
and the system font. It is an ordinary window, titled "Noeis", so it tiles,
moves between workspaces and takes window rules like any app.

| Key | |
|---|---|
| `j` `k` | Next and previous paragraph; the one you are on is marked in the margin |
| `n` `p` | Next and previous piece in the list |
| `o` | Open the piece on noeis.io |
| `1`–`5` | Library, Think, Wiki, Judgment, Editions in the Noeis app |
| `q` `Esc` | Close |
| `?` | These keys |

The window follows a theme change at once.

## The panel

- **Paste a link** and press Enter to save it to read later. The receipt says
  where the piece actually landed: on your nightstand, on your desk, or
  already yours since the day you saved it. Click the receipt to read it.
- **Type words** and everything you keep answers as you type: the views you
  hold first, then Wiki pages, then sources, passages and notes. Each kind
  gets two rows before any kind gets more, so a search full of sources still
  shows the view it touches. Up and Down move; Enter reads the one you picked
  in the reading window, with the rest of what was found a keypress away. A
  passage opens at the passage.
- **Open the panel with a link on your clipboard** and it is already in the
  field, selected, so Enter saves it and typing replaces it.
- **With the field empty** it lists your nightstand, newest first, so Enter
  reads the next thing. The mark's tooltip says how many wait there.
- Library, Think, Wiki, Judgment and Editions on noeis.io are one click away
  at the foot. **Sign out** ends the connection on the server as well as
  forgetting it here.

Escape clears the field, and closes the panel when the field is empty.

## Saving from anywhere

Each answers with a notification; clicking it reads what was saved.

- `omarchy-shell noeis saveClipboard` (Super+Alt+Shift+N) saves the link on
  your clipboard. After Omarchy's Alt+Shift+L (copy this tab's address), that
  is two keys from a page to your nightstand.
- `omarchy-shell noeis saveSelection` (Super+Alt+T) saves the text you have
  highlighted in any app into your Library.
- `omarchy-shell noeis saveScreenText` (Super+Ctrl+Alt+Print) reads text off
  a part of the screen you pick, with Omarchy's own text capture, and saves it
  the same way.
- `noeis-open <link>` saves a link; `noeis-open <file>` brings an EPUB, PDF
  or Markdown file into your Library.

## What fits tonight

At an hour you choose (8 pm unless you say otherwise, in the widget's
settings), Noeis looks at your nightstand and, if short pieces wait there,
says so: "Two short pieces fit tonight. Notes on craft has waited longest,
12 min." Short is what noeis.io calls short, fifteen minutes or less. When
nothing short waits it says nothing. Clicking it opens that piece in the
reading window.

## Install

```bash
omarchy plugin add https://github.com/atsokolas/omarchy-noeis --enable
~/.config/omarchy/plugins/io.noeis/bin/noeis-setup
```

`omarchy-noeis` is this folder published on its own (with the browser
extension packed beside it) by `.github/workflows/omarchy-plugin.yml`, since
this repository's root is the Chrome extension and `omarchy plugin add`
cannot read it. From a checkout, `cp -r plugins/omarchy
~/.config/omarchy/plugins/io.noeis` does the same, without the extension.

`noeis-setup` makes Noeis the reader on the machine, and is safe to run again:

- **Noeis in the launcher** is all of noeis.io as an app in its own tiled
  window, wearing your Omarchy theme (`noeis-open --web` reads the theme's
  colours each time it opens, once you choose Omarchy in noeis.io's theme
  settings). Opening it again comes to the window already open. **Noeis
  reader** is the reading window, and opens EPUB, PDF and Markdown files into
  your Library.
- **The browser extension** loaded into Omarchy's Chromium, so Alt+Shift+N
  saves the tab you are reading.
- **Keys:** Super+Alt+N opens Noeis, Super+Alt+R reads, Super+Ctrl+Alt+N opens the panel,
  Super+Alt+Shift+N saves the clipboard's link, Super+Alt+T saves highlighted
  text, Super+Ctrl+Alt+Print saves text off the screen. A key Noeis bound
  before is moved to its new meaning; check the rest are free first with
  `omarchy menu keybindings --print`. By hand, a binding reads
  `o.bind("SUPER + ALT + N", "Noeis", "noeis-open --web")`.
- **Share → Noeis** (Super+Ctrl+S) saves the link on your clipboard.

The mark lands on the right of the bar; `omarchy bar move io.noeis --section
left` moves it.

## Connecting

The first time, the panel offers **Connect in your browser**. It opens
noeis.io, where you approve this desktop the way you approve the Noeis CLI,
and the token is kept in `~/.config/noeis/omarchy.json`. That directory is
created private (`0700`) and is the one the CLI uses; the CLI's own
`config.json` is left alone. The token may bring links, files and text in,
search and read what you keep, and see your nightstand, and nothing else. It
lasts until you sign out in the panel or revoke it under Connected agents on
noeis.io; then the panel asks to connect again. Requests are made from QML
with `XMLHttpRequest`, and `noeis-open` hands the token to `curl` on stdin, so
it never appears in a process's arguments.

`NOEIS_API_URL` and `NOEIS_APP_URL` point it at a local server, as they do
for the CLI.

## What it needs

Omarchy 4, and `wl-clipboard`, `curl` and `jq`, which Omarchy installs. Like
every Omarchy plugin it runs unsandboxed inside the shell, with your user's
permissions.

## Files

| File | What it is |
|---|---|
| `manifest.json` | The plugin's id (`io.noeis`), kinds (`service`, `bar-widget`), entry points and settings |
| `Service.qml` | Noeis for the whole shell: the connection, the API, the nightstand, saving, `omarchy-shell noeis …`, the evening note, the theme |
| `Reader.qml` | The reading window |
| `BarWidget.qml` | The mark in the bar; hosts the panel and hands the Service its settings |
| `Panel.qml` | The panel: connecting, the field, search results, the nightstand, receipts |
| `NoeisMark.qml` | The three-ring mark, drawn natively at bar size |
| `Model.js` | The decisions, tested in node by `scripts/omarchy_plugin.test.js` |
| `bin/noeis-open` | The reading window, links onto the nightstand, files into your Library, and noeis.io itself with `--web` |
| `bin/noeis-setup` | Makes Noeis the reader on this machine |

`omarchy plugin validate plugins/omarchy` checks the folder the way the shell
does before it loads it.
