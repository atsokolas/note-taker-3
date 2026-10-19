import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

// Noeis from the bar: one field that takes a link or a search.
//
// Paste a link and Enter saves it, asked for the nightstand; the receipt
// says where the server actually put it. Type words and your Library
// answers as you type: sources, passages and notes, each opening at its own
// place on noeis.io. Opened with a link on the clipboard, the panel offers
// that link already, selected, so typing replaces it. With the field empty
// it lists your nightstand, so Enter opens the next thing to read.
//
// `omarchy-shell noeis saveClipboard` saves the clipboard's link without
// opening anything, and says where it landed in a notification.
//
// Connecting is the same as the Noeis CLI: the panel asks for a connection,
// you approve it at noeis.io in your browser, and the panel keeps the token
// in ~/.config/noeis/omarchy.json (the directory the CLI keeps private).
// The token can save links, search, and see the nightstand, nothing more,
// and lasts until you revoke it under Connected agents. Requests go through
// XMLHttpRequest, so the token never sits in a process's arguments.
Panel {
  id: root
  moduleName: "io.noeis"
  manageIpc: false

  property var anchorItem: null
  // The bar tracks the widget in its slot, not this nested panel, so the
  // popout coordinator has to be handed that widget.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property string apiUrl: String(Quickshell.env("NOEIS_API_URL") || Model.API).replace(/\/+$/, "")
  readonly property string appUrl: String(Quickshell.env("NOEIS_APP_URL") || Model.APP).replace(/\/+$/, "")
  readonly property string sessionDir: (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config") + "/noeis"

  property var session: Model.sessionFrom("", Date.now())
  readonly property bool signedIn: session.token !== ""

  property string query: ""
  readonly property string link: Model.linkFrom(query)
  readonly property string words: link ? "" : query.trim()
  property bool fromClipboard: false
  property string lastSaved: ""

  property var results: []
  property var nightstand: []
  property int nightstandTotal: 0
  // What the list shows: what a search found, or with nothing typed, the nightstand.
  readonly property var rows: link ? [] : words ? results : nightstand
  property string searched: ""
  property int cursor: 0
  property int searchSeq: 0

  property bool busy: false
  property string line: ""
  property bool lineIsProblem: false
  property string lineUrl: ""

  readonly property color foreground: Commons.Color.popups.text
  readonly property real muted: 0.62

  function open() {
    controller.show()
    readClipboard()
    loadNightstand()
  }

  function close() { controller.hide() }
  function toggle() { opened ? close() : open() }

  function say(text, isProblem, url) {
    line = text
    lineIsProblem = !!isProblem
    lineUrl = url || ""
  }

  // A line for when the panel is closed, whose click opens what it names.
  function notify(text, path, isProblem) {
    Quickshell.execDetached(["omarchy-notification-send", "--app-name", "Noeis", "-u", isProblem ? "normal" : "low", "Noeis", text]
      .concat(path ? ["--exec", "xdg-open", appUrl + path] : []))
  }

  function visit(path) {
    Qt.openUrlExternally(path.indexOf("http") === 0 ? path : appUrl + path)
    close()
  }

  // ---- The one door to the API. Every answer comes back as (status, body);
  //      a refused token ends the session here, once, for every caller.
  function request(method, path, body, done) {
    var xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== XMLHttpRequest.DONE) return
      var reply = null
      try { reply = JSON.parse(xhr.responseText) } catch (e) { reply = null }
      if (xhr.status === 401 && root.signedIn) root.forget(true)
      done(xhr.status, reply)
    }
    xhr.open(method, apiUrl + path)
    xhr.setRequestHeader("Accept", "application/json")
    if (signedIn) xhr.setRequestHeader("Authorization", "Bearer " + session.token)
    if (body !== null) xhr.setRequestHeader("Content-Type", "application/json")
    xhr.send(body === null ? null : JSON.stringify(body))
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
    connection = null
    session = { token: "", ended: !!ended }
    field.text = ""
    say("")
    write()
  }

  // ---- Connecting: ask, open the approval page, and wait for your yes.
  property var connection: null

  function connect() {
    if (busy) return
    busy = true
    say("Opening noeis.io to approve…")
    request("POST", "/api/agent-connect/sessions", { runtime: "omarchy", label: "Omarchy desktop",
      scopes: ["read", "capture"], appUrl: appUrl }, function(status, reply) {
      busy = false
      if (status !== 201 || !reply || !reply.authorizeUrl) return say(Model.problem(status, reply, "connect"), true)
      root.connection = { id: reply.session.sessionId, poll: reply.pollSecret, code: reply.session.deviceCode }
      say("Approve Noeis for this desktop in your browser. Its code is " + reply.session.deviceCode + ".")
      Qt.openUrlExternally(reply.authorizeUrl)
      waiting.interval = Math.max(1, Number(reply.pollIntervalSec || 2)) * 1000
      waiting.start()
    })
  }

  Timer {
    id: waiting
    repeat: true
    onTriggered: {
      var c = root.connection
      if (!c) return stop()
      root.request("POST", "/api/agent-connect/sessions/" + encodeURIComponent(c.id) + "/poll", { pollSecret: c.poll }, function(status, reply) {
        if (root.connection !== c) return
        var state = reply && reply.session ? reply.session.status : ""
        if (status === 200 && state === "approved" && reply.secret) {
          waiting.stop()
          root.connection = null
          root.keep(reply.secret)
          root.say("")
          Qt.callLater(function() { field.forceActiveFocus() })
        } else if (status !== 200 || state === "expired" || state === "cancelled") {
          waiting.stop()
          root.connection = null
          root.say(Model.problem(status === 200 ? 410 : status, reply, "connect"), true)
        }
      })
    }
  }

  // ---- Saving a link: in the panel, or quietly, answered by a notification.
  function save(url, quiet) {
    if (busy || !url) return
    busy = true
    if (!quiet) say("Reading the page…")
    request("POST", "/api/import/url", { url: url, placement: "later" }, function(status, reply) {
      busy = false
      var saved = (status === 200 || status === 201) && reply && reply.article
      var text = saved ? Model.saveReceipt(reply) : Model.problem(status, reply, "save")
      var path = saved ? "/library?articleId=" + encodeURIComponent(reply.article._id) : ""
      if (saved) {
        root.lastSaved = url
        root.loadNightstand()
      }
      if (quiet) return root.notify(text, path, !saved)
      if (saved) field.text = ""
      if (saved || status !== 401) say(text, !saved, path)
    })
  }

  // ---- The nightstand, newest first; its count rides on the bar's tooltip.
  function loadNightstand() {
    if (!signedIn) return
    request("GET", "/api/library/collection?scope=later&limit=6", null, function(status, reply) {
      if (status !== 200) return
      root.nightstand = Model.nightstandRows(reply, 6)
      root.nightstandTotal = Number(reply.total || 0)
    })
  }

  onSignedInChanged: {
    nightstand = []
    nightstandTotal = 0
    loadNightstand()
  }

  // ---- Searching, as you type. Only the newest answer is shown.
  Timer {
    id: searchDelay
    interval: 250
    onTriggered: root.search(root.words)
  }

  onWordsChanged: {
    if (words.length >= 2 && signedIn) searchDelay.restart()
    else {
      searchDelay.stop()
      searchSeq++
      results = []
      searched = ""
    }
  }

  // The Library and the Wiki answer separately; the list appears once both
  // have, so rows never shift under the cursor. One side failing still shows
  // what the other found.
  function search(q) {
    var seq = ++searchSeq
    var answers = {}
    function found(answer) { return answer.status === 200 ? answer.reply : null }
    function settle(side, status, reply) {
      if (seq !== root.searchSeq) return
      answers[side] = { status: status, reply: reply }
      if (!answers.library || !answers.wiki) return
      var rows = Model.searchResults(found(answers.library), found(answers.wiki), 8)
      var failed = [answers.library, answers.wiki].filter(function(a) { return a.status !== 200 && a.status !== 401 })[0]
      if (failed && !rows.length) return say(Model.problem(failed.status, failed.reply, "search"), true)
      root.results = rows
      root.searched = q
    }
    var words = encodeURIComponent(q)
    request("GET", "/api/search?q=" + words, null, function(status, reply) { settle("library", status, reply) })
    request("GET", "/api/wiki/pages?summary=1&limit=8&q=" + words, null, function(status, reply) { settle("wiki", status, reply) })
  }

  function moveCursor(step) {
    if (rows.length) cursor = (cursor + step + rows.length) % rows.length
  }

  onRowsChanged: cursor = 0

  function accept() {
    if (link) save(link, false)
    else if (rows.length) visit(rows[cursor].path)
  }

  // ---- The clipboard, read once per opening, or for a quiet save. A link
  //      just saved is not offered again.
  property bool quietSave: false

  IpcHandler {
    target: "noeis"
    function saveClipboard(): void {
      if (!root.signedIn) return root.notify(Model.problem(401), "/", true)
      root.quietSave = true
      clipboardProc.running = true
    }
  }

  Process {
    id: clipboardProc
    command: ["wl-paste", "--no-newline", "--type", "text"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var offered = Model.linkFrom(String(text || "").slice(0, 2048))
        if (root.quietSave) {
          root.quietSave = false
          return offered ? root.save(offered, true) : root.notify("There is no link on your clipboard to save.", "", true)
        }
        if (!offered || offered === root.lastSaved || field.text !== "") return
        field.text = offered
        field.selectAll()
        root.fromClipboard = true
      }
    }
  }

  function readClipboard() {
    if (signedIn && field.text === "" && !busy) clipboardProc.running = true
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: root.signedIn ? field : connectButton
    contentWidth: panel.fittedContentWidth(Style.space(420))
    contentHeight: panel.fittedContentHeight(body.implicitHeight)

    Column {
      id: body
      width: parent.width
      spacing: Style.spacing.panelGap

      PanelSectionHeader {
        text: "NOEIS"
        foreground: root.foreground
      }

      // ---- Signed in: the field, its hint or receipt, and what it found.
      Column {
        visible: root.signedIn
        width: parent.width
        spacing: Style.spacing.rowGap

        TextField {
          id: field
          width: parent.width
          foreground: root.foreground
          placeholderText: "Paste a link, or search what you keep"
          enabled: !root.busy
          inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText
          // A receipt answers the last thing typed, so the next one clears it.
          onTextChanged: {
            root.query = text
            root.say("")
          }
          onTextEdited: root.fromClipboard = false
          onAccepted: root.accept()
          Keys.onUpPressed: root.moveCursor(-1)
          Keys.onDownPressed: root.moveCursor(1)
          Keys.onEscapePressed: function(event) {
            if (text !== "") text = ""
            else root.close()
          }
        }

        Note {
          text: root.line !== "" ? root.line
            : root.link ? (root.fromClipboard ? "From your clipboard. Enter saves it to Noeis." : "Enter saves it to Noeis.")
            : root.searched !== "" && root.searched === root.words && root.results.length === 0 ? "Nothing you keep matches that."
            : root.query === "" && root.nightstandTotal ? "On your nightstand: " + root.nightstandTotal + ". Enter opens the newest."
            : ""
          problem: root.line !== "" && root.lineIsProblem
          url: root.line !== "" ? root.lineUrl : ""
        }

        Repeater {
          model: root.rows

          Rectangle {
            id: row
            required property var modelData
            required property int index
            readonly property bool hot: rowMouse.containsMouse || root.cursor === index
            width: body.width
            height: rowText.implicitHeight + Style.space(10)
            radius: Style.cornerRadius
            color: Style.controlFill(false, hot, root.foreground, Commons.Color.accent)

            Column {
              id: rowText
              x: Style.space(8)
              width: parent.width - Style.space(16)
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.spacing.labelGap

              Text {
                width: parent.width
                text: row.modelData.title
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: root.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }

              Text {
                width: parent.width
                text: row.modelData.kind + (row.modelData.detail ? "  ·  " + row.modelData.detail : "")
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: root.foreground
                opacity: root.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }
            }

            MouseArea {
              id: rowMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onEntered: root.cursor = row.index
              onClicked: root.visit(row.modelData.path)
            }
          }
        }
      }

      // ---- Signed out.
      Column {
        visible: !root.signedIn
        width: parent.width
        spacing: Style.spacing.rowGap

        Note {
          text: root.line !== "" ? root.line
            : root.session.ended ? Model.problem(401)
            : "Connect this desktop to save links and search what you keep from here."
          problem: root.lineIsProblem
        }

        Button {
          id: connectButton
          text: root.connection ? "Open the approval page again" : "Connect in your browser"
          foreground: root.foreground
          bordered: true
          focusable: true
          Keys.onEscapePressed: root.close()
          onClicked: root.connect()
        }
      }

      // ---- Where to go next.
      Item {
        width: parent.width
        height: places.implicitHeight

        Row {
          id: places
          spacing: Style.space(14)

          Repeater {
            model: root.signedIn
              ? [["Library", "/library"], ["Think", "/think"], ["Wiki", "/wiki"], ["Judgment", "/judgment"], ["Editions", "/editions"]]
              : [["Make an account at noeis.io", "/"]]

            Place {
              required property var modelData
              text: modelData[0]
              onClicked: root.visit(modelData[1])
            }
          }
        }

        Place {
          anchors.right: parent.right
          visible: root.signedIn
          text: "Sign out"
          onClicked: root.forget(false)
        }
      }
    }
  }

  // A line under the field: a hint, a receipt, or a problem. A receipt's
  // title opens the piece it names.
  component Note: Text {
    property bool problem: false
    property string url: ""
    width: parent ? parent.width : 0
    visible: text !== ""
    wrapMode: Text.Wrap
    textFormat: Text.PlainText
    color: problem ? Commons.Color.urgent : root.foreground
    opacity: problem ? 1 : root.muted
    font.family: Style.font.family
    font.pixelSize: Style.font.bodySmall

    MouseArea {
      anchors.fill: parent
      enabled: parent.url !== ""
      cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
      onClicked: root.visit(parent.url)
    }
  }

  component Place: Text {
    signal clicked()
    textFormat: Text.PlainText
    color: placeMouse.containsMouse ? Commons.Color.accent : root.foreground
    opacity: placeMouse.containsMouse ? 1 : root.muted
    font.family: Style.font.family
    font.pixelSize: Style.font.caption

    MouseArea {
      id: placeMouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: parent.clicked()
    }
  }
}
