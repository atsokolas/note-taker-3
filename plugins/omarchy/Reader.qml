import QtQuick
import Quickshell
import qs.Commons
import "Model.js" as Model

// The reading window: an ordinary app window, so Hyprland tiles it beside
// whatever else is open. The list you opened it from on the left (your
// nightstand, or what a search found), the piece on the right, in the
// theme's colours and the system font. The keyboard does the reading:
// j and k walk the paragraphs, n and p turn the list, o opens the piece on
// noeis.io, q closes, ? says so.
Scope {
  id: root

  property var service: null

  // The list being read: what a search found, or with nothing given, the
  // nightstand as it stands.
  property var list: null
  readonly property var rows: list || (service ? service.nightstand : [])
  property int index: 0
  readonly property var row: rows[index] || null

  property var piece: null
  property var shown: null
  property string line: ""
  property int cursor: 0
  property bool help: false
  property int loadSeq: 0

  readonly property var keys: [
    ["j  k", "Next and previous paragraph"],
    ["n  p", "Next and previous piece"],
    ["o", "Open it on noeis.io"],
    ["1–5", Model.PLACES.map(function(place) { return place[0] }).join(", ")],
    ["q  Esc", "Close"],
    ["?", "These keys"]
  ]

  readonly property var palette: service ? service.palette : Model.TOKYO_NIGHT
  readonly property color bg: palette.background
  readonly property color fg: palette.foreground
  readonly property color accent: palette.accent
  readonly property real muted: 0.62

  // Opens on `rows` at `at`; with no rows, on the nightstand, staying on the
  // piece already open if it is there.
  function open(rows, at) {
    list = rows
    index = at >= 0 ? at : Math.max(0, shown ? find(shown.id) : 0)
    window.visible = true
    if (!shown || !row || shown.id !== row.id || shown.kind !== row.kind) load()
    Qt.callLater(function() { page.forceActiveFocus() })
  }

  function find(id) {
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return i
    return -1
  }

  // A piece named by a notification: on the nightstand if it waits there,
  // else on its own.
  function openArticle(id) {
    list = null
    var at = find(id)
    if (at >= 0) open(null, at)
    else open([{ kind: "Source", id: id, title: "", detail: "", path: Model.articlePath(id) }], 0)
  }

  // A nightstand that reloads keeps the piece open where it now stands; one
  // that arrives after the window opened fills it.
  onRowsChanged: {
    var at = shown ? find(shown.id) : -1
    if (at >= 0) index = at
    else if (window.visible && !shown && row) load()
  }

  function load() {
    var asked = row
    var seq = ++loadSeq
    piece = null
    shown = asked
    help = false
    if (!service || !service.signedIn)
      return line = service && service.session.ended ? Model.problem(401) : "Connect this desktop from the Noeis mark on the bar, then read here."
    if (!asked) return line = list ? "" : "Your nightstand is empty. A link saved from the panel waits here."
    line = "Opening…"
    service.request("GET", Model.pieceSource(asked), null, function(status, reply) {
      if (seq !== root.loadSeq) return
      if (status !== 200) return root.line = Model.problem(status, reply, "read")
      root.line = ""
      root.piece = Model.pieceFrom(asked, reply)
      root.cursor = root.piece.cursor
      Qt.callLater(root.reveal)
    })
  }

  function step(by) {
    if (!piece || !piece.blocks.length) return
    cursor = Math.max(0, Math.min(piece.blocks.length - 1, cursor + by))
    reveal()
  }

  function turn(by) {
    var next = Math.max(0, Math.min(rows.length - 1, index + by))
    if (next === index) return
    index = next
    load()
  }

  // The paragraph you are on sits a third of the way down the page.
  function reveal() {
    var block = blocks.itemAt(cursor)
    if (!block) return flick.contentY = 0
    var top = block.y + article.y - flick.height / 3
    flick.contentY = Math.max(0, Math.min(flick.contentHeight - flick.height, top))
  }

  function close() { window.visible = false }

  function key(event) {
    var text = event.text
    if (text === "?") help = !help
    else if (event.key === Qt.Key_Escape && help) help = false
    else if (text === "q" || event.key === Qt.Key_Escape) close()
    else if (text === "j" || event.key === Qt.Key_Down) step(1)
    else if (text === "k" || event.key === Qt.Key_Up) step(-1)
    else if (text === "n") turn(1)
    else if (text === "p") turn(-1)
    else if (text === "o" && shown) service.visit(shown.path)
    else if (Model.PLACES[text - 1]) service.visit(Model.PLACES[text - 1][1])
    else return
    event.accepted = true
  }

  FloatingWindow {
    id: window
    title: "Noeis"
    visible: false
    color: root.bg
    implicitWidth: 1120
    implicitHeight: 780
    minimumSize: Qt.size(420, 320)

    Item {
      id: page
      anchors.fill: parent
      focus: true
      Keys.onPressed: function(event) { root.key(event) }

      readonly property bool wide: width >= 760
      readonly property real gutter: Style.space(24)

      // ---- The list, beside the piece when there is room.
      Column {
        id: listColumn
        visible: page.wide
        x: page.gutter
        y: page.gutter
        width: page.wide ? Style.space(260) : 0
        spacing: Style.space(4)

        Text {
          text: root.list ? "FOUND" : "NIGHTSTAND"
          textFormat: Text.PlainText
          color: root.fg
          opacity: root.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
          font.letterSpacing: 1.2
          bottomPadding: Style.space(6)
        }

        Repeater {
          model: root.rows

          Rectangle {
            id: listRow
            required property var modelData
            required property int index
            width: listColumn.width
            height: rowText.implicitHeight + Style.space(12)
            radius: Style.cornerRadius
            color: root.index === index ? root.palette.selection : "transparent"

            Column {
              id: rowText
              x: Style.space(8)
              width: parent.width - Style.space(16)
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(2)

              Text {
                width: parent.width
                text: listRow.modelData.title || (root.piece && root.shown === listRow.modelData ? root.piece.title : "")
                textFormat: Text.PlainText
                wrapMode: Text.Wrap
                maximumLineCount: 2
                elide: Text.ElideRight
                color: root.fg
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }

              Text {
                width: parent.width
                visible: text !== ""
                text: [listRow.modelData.kind === "Nightstand" ? "" : listRow.modelData.kind, listRow.modelData.detail,
                  listRow.modelData.minutes ? listRow.modelData.minutes + " min" : ""].filter(function(part) { return part }).join("  ·  ")
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: root.fg
                opacity: root.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
              }
            }

            MouseArea {
              anchors.fill: parent
              cursorShape: Qt.PointingHandCursor
              onClicked: {
                root.index = listRow.index
                root.load()
                page.forceActiveFocus()
              }
            }
          }
        }

        Text {
          text: "? for keys"
          textFormat: Text.PlainText
          color: root.fg
          opacity: root.muted * 0.8
          topPadding: Style.space(10)
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
      }

      // ---- The piece.
      Flickable {
        id: flick
        x: page.wide ? listColumn.x + listColumn.width + page.gutter : 0
        width: page.width - x
        height: page.height
        contentHeight: article.y + article.height + page.gutter * 2
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Behavior on contentY {
          NumberAnimation { duration: 160; easing.type: Easing.OutCubic }
        }

        Column {
          id: article
          // A line a reader's eye can follow, centred in what is left.
          width: Math.min(flick.width - page.gutter * 2, Style.space(680))
          x: (flick.width - width) / 2
          y: page.gutter
          spacing: Style.space(14)

          // Without the list beside it, where you are in it.
          Text {
            visible: !page.wide && root.rows.length > 0
            text: (root.list ? "Found" : "Nightstand") + "  ·  " + (root.index + 1) + " of " + root.rows.length + "  ·  n and p turn"
            textFormat: Text.PlainText
            color: root.fg
            opacity: root.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }

          Text {
            width: parent.width
            visible: text !== ""
            text: root.line
            textFormat: Text.PlainText
            wrapMode: Text.Wrap
            color: root.fg
            opacity: root.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.body
          }

          Text {
            width: parent.width
            visible: root.piece !== null
            text: root.piece ? root.piece.title : ""
            textFormat: Text.PlainText
            wrapMode: Text.Wrap
            color: root.fg
            font.family: Style.font.family
            font.pixelSize: Style.font.display
            font.weight: Font.DemiBold
          }

          Text {
            width: parent.width
            visible: root.piece !== null && text !== ""
            text: root.piece ? root.piece.byline : ""
            textFormat: Text.PlainText
            color: root.fg
            opacity: root.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Repeater {
            id: blocks
            model: root.piece ? root.piece.blocks : []

            Item {
              id: block
              required property var modelData
              required property int index
              readonly property bool quote: modelData.kind === "quote"
              width: article.width
              height: blockText.implicitHeight

              // The paragraph you are on, marked in the margin.
              Rectangle {
                x: -Style.space(14)
                width: 2
                height: parent.height
                radius: 1
                color: root.accent
                visible: root.cursor === block.index
              }

              Rectangle {
                visible: block.quote
                width: 2
                height: parent.height
                color: root.fg
                opacity: 0.25
              }

              Text {
                id: blockText
                x: block.quote ? Style.space(16) : 0
                width: parent.width - x
                text: (block.modelData.kind === "item" ? "•  " : "") + block.modelData.text
                textFormat: Text.PlainText
                wrapMode: Text.Wrap
                lineHeight: block.modelData.kind === "heading" ? 1.1 : 1.45
                color: root.fg
                font.family: Style.font.family
                font.pixelSize: block.modelData.kind === "heading" ? Math.round(Style.font.heading * 1.25) : Style.font.heading
                font.weight: block.modelData.kind === "heading" ? Font.DemiBold : Font.Normal
                font.italic: block.quote
                topPadding: block.modelData.kind === "heading" ? Style.space(10) : 0
              }

              MouseArea {
                anchors.fill: parent
                onClicked: {
                  root.cursor = block.index
                  page.forceActiveFocus()
                }
              }
            }
          }
        }
      }

      // ---- The keys, on ?.
      Rectangle {
        visible: root.help
        anchors.centerIn: parent
        width: sheet.implicitWidth + Style.space(40)
        height: sheet.implicitHeight + Style.space(32)
        radius: Style.cornerRadius
        color: root.palette.selection
        border.color: root.accent
        border.width: 1

        Grid {
          id: sheet
          anchors.centerIn: parent
          columns: 2
          columnSpacing: Style.space(24)
          rowSpacing: Style.space(8)

          Repeater {
            model: root.keys.length * 2

            Text {
              required property int index
              readonly property var pair: root.keys[Math.floor(index / 2)]
              text: pair[index % 2]
              textFormat: Text.PlainText
              color: index % 2 ? root.fg : root.accent
              font.family: Style.font.family
              font.pixelSize: Style.font.body
            }
          }
        }
      }
    }
  }
}
