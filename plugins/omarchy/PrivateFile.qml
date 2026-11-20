import QtQuick
import Quickshell.Io

// A file only you can read, holding one line. The directory is made private
// (0700) whatever it was before. The line goes into a new 0600 file beside
// the old one, from stdin so it is in no process's arguments, and is renamed
// over it: nothing enters a file someone may already hold open. A write asked
// for while one runs follows it.
Process {
  id: root

  property string dir
  property string name
  property string pending: ""

  // `write` is the Process's own, to stdin.
  function save(line) {
    pending = line
    running = true
  }

  command: ["sh", "-c", "umask 077 && mkdir -p \"$1\" && chmod 700 \"$1\" && tmp=$(mktemp \"$1/.$2.XXXXXX\") && chmod 600 \"$tmp\" && IFS= read -r line && printf '%s\\n' \"$line\" >\"$tmp\" && mv -f \"$tmp\" \"$1/$2\" || { rm -f \"$tmp\"; exit 1; }", "noeis-private", dir, name]
  stdinEnabled: true
  onStarted: {
    write(pending + "\n")
    pending = ""
  }
  onExited: if (pending) running = true
}
