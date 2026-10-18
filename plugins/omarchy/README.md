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
- Library, Think, Wiki, Judgment and Editions are one click away at the foot.

Escape clears the field, and closes the panel when the field is empty.

## Install

The plugin lives in this repository, whose root belongs to the Chrome
extension, so `omarchy plugin add` cannot clone it directly. Copy the folder
in instead:

```bash
git clone https://github.com/atsokolas/note-taker-3.git /tmp/noeis
cp -r /tmp/noeis/plugins/omarchy ~/.config/omarchy/plugins/io.noeis
omarchy-shell shell rescanPlugins
omarchy plugin enable io.noeis
```

It lands on the right of the bar; `omarchy bar move io.noeis --section left`
moves it. To open it from the keyboard, add a binding to
`~/.config/hypr/bindings.lua` (check the key is free with
`omarchy menu keybindings --print`):

```lua
o.bind("SUPER + ALT + N", "Noeis", { panel = "io.noeis" })
```

## Signing in

The panel signs in with your Noeis username and password, the way the iPhone
app does, and keeps the session token in `~/.config/noeis/omarchy.json`. That
directory is created private (`0700`) and is the one the Noeis CLI uses; the
CLI's own `config.json` is left alone. Requests are made from QML with
`XMLHttpRequest`, so the token never appears in a process's arguments. When
the server refuses the token, or it expires (after seven days), the panel
forgets it and asks you to sign in again.

`NOEIS_API_URL` and `NOEIS_APP_URL` point it at a local server, as they do
for the CLI.

## What it needs

Omarchy 4 and `wl-paste` (from `wl-clipboard`, which Omarchy installs) for
the clipboard offer. Like every Omarchy plugin it runs unsandboxed inside the
shell, with your user's permissions.

## Files

| File | What it is |
|---|---|
| `manifest.json` | The plugin's id (`io.noeis`), kind (`bar-widget`) and entry point |
| `BarWidget.qml` | The mark in the bar; hosts the panel |
| `Panel.qml` | The panel: sign in, the field, search results, receipts |
| `NoeisMark.qml` | The three-ring mark, drawn natively at bar size |
| `Model.js` | The panel's decisions, tested in node by `scripts/omarchy_plugin.test.js` |

`omarchy plugin validate plugins/omarchy` checks the folder the way the shell
does before it loads it.
