import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Noeis from the bar: one field that takes a link or a search.
//
// Paste a link and Enter saves it, asked for the nightstand; the receipt
// says where the server actually put it. Type words and your Library
// answers as you type: sources, passages, notes, Wiki pages and views.
// Opened with a link on the clipboard, the panel offers that link already,
// selected, so typing replaces it. With the field empty it lists your
// nightstand. Enter on any row reads it in the reading window, with the
// rest of the list a keypress away.
//
// The connection, the API and the nightstand live in the Service; the panel
// is how you connect, search and save.
Panel {
  id: root
  moduleName: "io.noeis"
  manageIpc: false

  property var anchorItem: null
  // The bar tracks the widget in its slot, not this nested panel, so the
  // popout coordinator has to be handed that widget.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  property var service: null

  readonly property bool signedIn: !!service && service.signedIn

  property string query: ""
  readonly property string link: Model.linkFrom(query)
  readonly property string words: link ? "" : query.trim()
  property bool fromClipboard: false

  property var results: []
  readonly property var nightstand: service ? service.nightstand.slice(0, 6) : []
  // What the list shows: what a search found, or with nothing typed, the nightstand.
  readonly property var rows: link ? [] : words ? results : nightstand
  property string searched: ""
  property int cursor: 0
  property int searchSeq: 0

  property bool busy: false
  property string line: ""
  property bool lineIsProblem: false
  property string lineId: ""

  readonly property var palette: service ? service.palette : Model.TOKYO_NIGHT
  readonly property color foreground: palette.foreground
  readonly property real muted: 0.62

  function open() {
    controller.show()
    readClipboard()
    if (service) service.loadNightstand()
  }

  function close() { controller.hide() }
  function toggle() { opened ? close() : open() }

  function say(text, isProblem, id) {
    line = text
    lineIsProblem = !!isProblem
    lineId = id || ""
  }

  function visit(path) {
    service.visit(path)
    close()
  }

  // Reading happens in the window, on the list the row came from.
  function read(at) {
    service.reader.open(words ? results : null, at)
    close()
  }

  onSignedInChanged: {
    connection = null
    field.text = ""
    say("")
  }

  // ---- Connecting: ask, open the approval page, and wait for your yes.
  property var connection: null

  function connect() {
    if (busy || !service) return
    busy = true
    say("Opening noeis.io to approve…")
    service.request("POST", "/api/agent-connect/sessions", { runtime: "omarchy", label: "Omarchy desktop",
      scopes: ["read", "capture"], appUrl: service.appUrl }, function(status, reply) {
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
      root.service.request("POST", "/api/agent-connect/sessions/" + encodeURIComponent(c.id) + "/poll", { pollSecret: c.poll }, function(status, reply) {
        if (root.connection !== c) return
        var state = reply && reply.session ? reply.session.status : ""
        if (status === 200 && state === "approved" && reply.secret) {
          waiting.stop()
          root.connection = null
          root.service.keep(reply.secret)
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

  // ---- Saving a link, answered by a receipt whose title opens the piece.
  function save(url) {
    if (busy || !url) return
    busy = true
    say("Reading the page…")
    service.save(url, function(saved, text, id) {
      busy = false
      if (saved) field.text = ""
      if (root.signedIn) say(text, !saved, id)
    })
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
    service.request("GET", "/api/search?q=" + words, null, function(status, reply) { settle("library", status, reply) })
    service.request("GET", "/api/wiki/pages?summary=1&limit=8&q=" + words, null, function(status, reply) { settle("wiki", status, reply) })
  }

  function moveCursor(step) {
    if (rows.length) cursor = (cursor + step + rows.length) % rows.length
  }

  onRowsChanged: cursor = 0

  function accept() {
    if (link) save(link)
    else if (rows.length) read(cursor)
  }

  // ---- The clipboard, read once per opening. A link just saved is not
  //      offered again.
  function readClipboard() {
    if (!signedIn || field.text !== "" || busy) return
    service.paste(false, function(text) {
      var offered = Model.linkFrom(text.slice(0, 2048))
      if (!offered || offered === root.service.lastSaved || field.text !== "") return
      field.text = offered
      field.selectAll()
      root.fromClipboard = true
    })
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
            : root.query === "" && root.service && root.service.nightstandTotal ? "On your nightstand: " + root.service.nightstandTotal + ". Enter reads the newest."
            : ""
          problem: root.line !== "" && root.lineIsProblem
          articleId: root.line !== "" ? root.lineId : ""
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
            color: Style.controlFill(false, hot, root.foreground, root.palette.accent)

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
              onClicked: root.read(row.index)
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
            : root.service && root.service.session.ended ? Model.problem(401)
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
              ? Model.PLACES
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
          onClicked: root.service.signOut()
        }
      }
    }
  }

  // A line under the field: a hint, a receipt, or a problem. A receipt
  // opens the piece it names in the reading window.
  component Note: Text {
    property bool problem: false
    property string articleId: ""
    width: parent ? parent.width : 0
    visible: text !== ""
    wrapMode: Text.Wrap
    textFormat: Text.PlainText
    color: problem ? root.palette.urgent : root.foreground
    opacity: problem ? 1 : root.muted
    font.family: Style.font.family
    font.pixelSize: Style.font.bodySmall

    MouseArea {
      anchors.fill: parent
      enabled: parent.articleId !== ""
      cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
      onClicked: {
        root.service.reader.openArticle(parent.articleId)
        root.close()
      }
    }
  }

  component Place: Text {
    signal clicked()
    textFormat: Text.PlainText
    color: placeMouse.containsMouse ? root.palette.accent : root.foreground
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
