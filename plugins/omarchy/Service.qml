import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Noeis for the whole shell, once: the connection, the one door to the API,
// the nightstand, saving, the reading window and the evening note. The bar's
// panel and the reading window both read this instance, and
// `omarchy-shell noeis …` reaches it whether or not the mark is on the bar.
//
// Connecting is the same as the Noeis CLI: the panel asks for a connection,
// you approve it at noeis.io in your browser, and the token is kept in
// ~/.config/noeis/omarchy.json (the directory the CLI keeps private). It can
// bring links, files and text in, search, read, and see the nightstand,
// nothing more, and lasts until you sign out here or revoke it under
// Connected agents. Requests go through XMLHttpRequest, so the token never
// sits in a process's arguments.
Item {
  id: root

  property var shell: null
  // The bar widget's settings, handed over by the widget.
  property var settings: ({})

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  readonly property string apiUrl: String(Quickshell.env("NOEIS_API_URL") || Model.API).replace(/\/+$/, "")
  readonly property string appUrl: String(Quickshell.env("NOEIS_APP_URL") || Model.APP).replace(/\/+$/, "")
  readonly property string home: Quickshell.env("HOME") || ""
  readonly property string sessionDir: (Quickshell.env("XDG_CONFIG_HOME") || home + "/.config") + "/noeis"

  property var session: Model.sessionFrom("", Date.now())
  readonly property bool signedIn: session.token !== ""

  property var nightstand: []
  property int nightstandTotal: 0
  property string lastSaved: ""

  // ---- The one door to the API. Every answer comes back as (status, body);
  //      a refused token ends the session here, once, for every caller.
  function request(method, path, body, done) {
    var xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== XMLHttpRequest.DONE) return
      var reply = null
      try { reply = JSON.parse(xhr.responseText) } catch (e) { reply = null }
      if (xhr.status === 401 && root.signedIn) root.forget(true)
      if (done) done(xhr.status, reply)
    }
    xhr.open(method, apiUrl + path)
    xhr.setRequestHeader("Accept", "application/json")
    if (signedIn) xhr.setRequestHeader("Authorization", "Bearer " + session.token)
    if (body !== null) xhr.setRequestHeader("Content-Type", "application/json")
    xhr.send(body === null ? null : JSON.stringify(body))
  }

  // A line for when nothing of Noeis is open. Its click runs `click`: the
  // reading window at the piece it names, or the panel to connect again.
  function notify(text, click, isProblem) {
    Quickshell.execDetached(["omarchy-notification-send", "--app-name", "Noeis", "-u", isProblem ? "normal" : "low", "Noeis", text]
      .concat(click ? ["--exec"].concat(click) : []))
  }

  function readAt(id) { return ["omarchy-shell", "noeis", "readArticle", String(id)] }
  readonly property var connectAgain: ["omarchy-shell", "shell", "toggle", "io.noeis"]

  // noeis.io itself, only when asked for by name: in its own window, wearing
  // the theme (bin/noeis-open --web).
  readonly property string noeisOpen: decodeURIComponent(String(Qt.resolvedUrl("bin/noeis-open")).replace(/^file:\/\//, ""))

  function visit(path) {
    Quickshell.execDetached([noeisOpen, "--web", path])
  }

  // ---- Session.
  FileView {
    id: sessionFile
    path: root.sessionDir + "/omarchy.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.session = Model.sessionFrom(text(), Date.now())
    onLoadFailed: root.session = Model.sessionFrom("", Date.now())
  }

  // The directory is made private before the token is written into it.
  Process {
    id: sessionDirProc
    command: ["mkdir", "-p", "-m", "700", root.sessionDir]
    onExited: root.write()
  }

  function write() {
    sessionFile.setText(JSON.stringify(signedIn ? { token: session.token } : {}) + "\n")
  }

  function keep(token) {
    session = { token: token, ended: false }
    sessionDirProc.running = true
  }

  function forget(ended) {
    session = { token: "", ended: !!ended }
    write()
  }

  // Signing out ends the connection on the server too, then here, whether or
  // not the server could be reached: a token you meant to give up is not
  // kept for a retry.
  function signOut() {
    request("DELETE", "/api/agent-connection", null, null)
    forget(false)
  }

  onSignedInChanged: {
    nightstand = []
    nightstandTotal = 0
    loadNightstand()
  }

  // ---- The nightstand, newest first; its count rides on the bar's tooltip.
  function loadNightstand(then) {
    if (!signedIn) return
    request("GET", "/api/library/collection?scope=later&limit=40", null, function(status, reply) {
      if (status !== 200) return
      root.nightstand = Model.nightstandRows(reply)
      root.nightstandTotal = Number(reply.total || 0)
      if (then) then()
    })
  }

  // ---- Bringing things in. `done(saved, line, id)` hears the receipt.
  function save(url, done) {
    request("POST", "/api/import/url", { url: url, placement: "later" }, function(status, reply) {
      var saved = (status === 200 || status === 201) && reply && reply.article
      if (saved) {
        root.lastSaved = url
        root.loadNightstand()
      }
      done(saved, saved ? Model.saveReceipt(reply) : Model.problem(status, reply, "save"), saved ? reply.article._id : "")
    })
  }

  // Text from anywhere lands in the Library as a source of its own, and the
  // notification opens it in the reading window.
  function bring(text, nothing) {
    if (!signedIn) return notify(Model.problem(401), connectAgain, true)
    if (!text.trim()) return notify(nothing, null, true)
    request("POST", "/api/import/text", { text: text }, function(status, reply) {
      var saved = (status === 200 || status === 201) && reply && reply.article
      root.told(saved, saved ? Model.saveReceipt(reply) : Model.problem(status, reply, "bring"), saved ? reply.article._id : "")
    })
  }

  function told(saved, line, id) { notify(line, saved ? readAt(id) : signedIn ? null : connectAgain, !saved) }

  // A link saved without opening anything, answered by a notification.
  function saveQuietly(text, nothing) {
    if (!signedIn) return notify(Model.problem(401), connectAgain, true)
    var link = Model.linkFrom(text.slice(0, 2048))
    if (link) save(link, told)
    else notify(nothing, null, true)
  }

  // ---- The clipboard, or the text highlighted in any app, read once per ask.
  property var pasted: null

  function paste(primary, done) {
    if (pasteProc.running) return
    pasted = done
    pasteProc.command = ["wl-paste", "--no-newline", "--type", "text"].concat(primary ? ["--primary"] : [])
    pasteProc.running = true
  }

  Process {
    id: pasteProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.pasted(String(text || ""))
    }
  }

  // Text read off the screen. Omarchy's capture puts what it read on the
  // clipboard; a clipboard that did not change means the region was let go.
  Process {
    id: screenTextProc
    property string before: ""
    command: ["omarchy-capture-text"]
    onExited: function(code) {
      if (code !== 0) return root.notify("No text could be read there.", null, true)
      root.paste(false, function(after) { if (after !== screenTextProc.before) root.bring(after, "") })
    }
  }

  IpcHandler {
    target: "noeis"

    function read(): void { root.reader.open(null, -1) }

    function readArticle(id: string): void { root.reader.openArticle(id) }

    function save(url: string): void { root.saveQuietly(url, "That is not a link Noeis can save.") }

    function saveClipboard(): void {
      root.paste(false, function(text) { root.saveQuietly(text, "There is no link on your clipboard to save.") })
    }

    function saveSelection(): void {
      root.paste(true, function(text) { root.bring(text, "Highlight some text first, then save it.") })
    }

    function saveScreenText(): void {
      if (!root.signedIn) return root.notify(Model.problem(401), root.connectAgain, true)
      root.paste(false, function(before) {
        screenTextProc.before = before
        screenTextProc.running = true
      })
    }
  }

  // ---- The reading window, tiled like any app's.
  readonly property Reader reader: Reader { service: root }

  // ---- The evening: at the hour you chose, what fits tonight, if anything
  //      short waits. The click opens it in the reading window.
  readonly property bool evening: setting("evening", true) !== false
  readonly property int hour: Math.max(0, Math.min(23, Number(setting("hour", 20)) || 0))

  onHourChanged: eveningTimer.arm()

  Timer {
    id: eveningTimer
    repeat: true
    running: root.evening && root.signedIn
    function arm() { interval = Model.untilHour(root.hour, Date.now() + 1000) }
    onRunningChanged: arm()
    onTriggered: {
      arm()
      root.loadNightstand(function() {
        var note = Model.tonight(root.nightstand)
        if (note) root.notify(note.text, root.readAt(note.id), false)
      })
    }
  }

  // ---- The theme's palette, read from colors.toml and kept current: the
  //      shell's Color singleton is not visible to plugins.
  property var palette: Model.TOKYO_NIGHT

  FileView {
    path: (Quickshell.env("XDG_STATE_HOME") || root.home + "/.local/state") + "/omarchy/current/theme/colors.toml"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.palette = Model.parseColors(text())
    onLoadFailed: root.palette = Model.TOKYO_NIGHT
  }
}
