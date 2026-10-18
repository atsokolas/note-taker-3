import QtQuick

// The Noeis mark, drawn natively for a bar slot: three rings, each
// overlapping the next, as in the logo. Plain rectangles rather than an SVG
// so it stays crisp at the size of a bar icon and takes the bar's colour.
Item {
  id: root

  property real size: 16
  property color color: "white"

  // Ring centres sit 1.11 radii apart, as in the logo; three rings then span
  // 4.22 radii.
  readonly property real radius: size / 4.22
  readonly property real stroke: Math.max(1, Math.round(size / 14))

  implicitWidth: size
  implicitHeight: size

  Repeater {
    model: 3

    Rectangle {
      required property int index
      width: root.radius * 2
      height: width
      radius: width / 2
      x: index * root.radius * 1.11
      y: (root.size - height) / 2
      color: "transparent"
      border.width: root.stroke
      border.color: root.color
      antialiasing: true
    }
  }
}
