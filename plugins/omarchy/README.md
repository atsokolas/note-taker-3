# Noeis for Omarchy

A bar widget for [Omarchy](https://github.com/omacom/omarchy) 4 ("Quattro"), whose desktop
runs as one Quickshell process with every piece of it a plugin. The Noeis
mark sits in the bar; click it and one field takes either a link or a search.

- **Paste a link** and press Enter to save it to read later. The receipt says
  where the piece actually landed: on your nightstand, on your desk, or
  already yours since the day you saved it. Click the receipt to open it.
- **Type words** and everything you keep answers as you type: the views you
  hold first, then Wiki pages, then sources, passages and notes. Each kind
  gets two rows before any kind gets more, so a search full of sources still
  shows the view it touches. Up and Down move, Enter opens the one you picked
  on noeis.io: a view in Judgment, a page in the Wiki, a passage at the
  passage itself.
- **Open the panel with a link on your clipboard** and it is already in the
  field, selected, so Enter saves it and typing replaces it.
- **With the field empty** it lists your nightstand, newest first, so Enter
  opens the next thing to read. The mark's tooltip says how many wait there.
- **Save without opening anything:** `omarchy-shell noeis saveClipboard`
  saves the link on your clipboard and answers with a notification you can
  click. After Omarchy's Alt+Shift+L (copy this tab's address), that is two
  keys from a page to your nightstand.
- Library, Think, Wiki, Judgment and Editions are one click away at the foot.

Escape clears the field, and closes the panel when the field is empty.

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

- **Noeis in the launcher**, in its own window wearing your Omarchy theme
  (`noeis-open` reads the theme's colours each time it opens, once you
  choose Omarchy in noeis.io's theme settings).
- **Open with Noeis** for EPUB, PDF and Markdown files, which land in your
  Library. `noeis-open <link>` saves a link to the nightstand.
- **The browser extension** loaded into Omarchy's Chromium, so Alt+Shift+N
  saves the tab you are reading.
- **Super+Alt+N** opens the panel; **Super+Alt+Shift+N** saves the link on
  your clipboard. Check the keys are free first with
  `omarchy menu keybindings --print`. By hand, the binding is
  `o.bind("SUPER + ALT + N", "Noeis", "omarchy-shell shell toggle io.noeis")`.
- **Share → Noeis** (Super+Ctrl+S) saves the link on your clipboard.

The mark lands on the right of the bar; `omarchy bar move io.noeis --section
left` moves it.

## Connecting

The first time, the panel offers **Connect in your browser**. It opens
noeis.io, where you approve this desktop the way you approve the Noeis CLI,
and the panel keeps the token in `~/.config/noeis/omarchy.json`. That
directory is created private (`0700`) and is the one the CLI uses; the CLI's
own `config.json` is left alone. The token may save links, search, and see
your nightstand, and nothing else. It lasts until you revoke it under
Connected agents on noeis.io; then the panel asks to connect again. Requests
are made from QML with `XMLHttpRequest`, and `noeis-open` hands the token to
`curl` on stdin, so it never appears in a process's arguments.

`NOEIS_API_URL` and `NOEIS_APP_URL` point it at a local server, as they do
for the CLI.

## What it needs

Omarchy 4 and `wl-paste` (from `wl-clipboard`, which Omarchy installs) for
the clipboard offer; `noeis-open` uses `curl` and `jq`, which Omarchy also
installs. Like every Omarchy plugin it runs unsandboxed inside the
shell, with your user's permissions.

## Files

| File | What it is |
|---|---|
| `manifest.json` | The plugin's id (`io.noeis`), kind (`bar-widget`) and entry point |
| `BarWidget.qml` | The mark in the bar; hosts the panel |
| `Panel.qml` | The panel: connecting, the field, search results, the nightstand, receipts |
| `NoeisMark.qml` | The three-ring mark, drawn natively at bar size |
| `Model.js` | The panel's decisions, tested in node by `scripts/omarchy_plugin.test.js` |
| `bin/noeis-open` | The app in its own window, links onto the nightstand, and files into your Library |
| `bin/noeis-setup` | Makes Noeis the reader on this machine |

`omarchy plugin validate plugins/omarchy` checks the folder the way the shell
does before it loads it.
