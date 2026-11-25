import QtQuick
import QtQuick.Shapes

// The Noeis mark for a bar slot: the woven N, its rear strand fainter than the
// one in front. The paths are noeis-mark.svg's, drawn as shapes rather than
// loaded, so the mark takes the bar's colour, without the SVG's margin, so it
// fills its slot.
Item {
  id: root

  property real size: 16
  property color color: "white"

  readonly property real margin: 64
  readonly property real drawn: 512 - 2 * margin

  implicitWidth: size
  implicitHeight: size

  Shape {
    preferredRendererType: Shape.CurveRenderer
    transform: [
      Translate { x: -root.margin; y: -root.margin },
      Scale { xScale: root.size / root.drawn; yScale: xScale }
    ]

    ShapePath {
      strokeWidth: -1
      fillColor: Qt.alpha(root.color, 0.72)
      PathSvg { path: "M64 448V346c0-63 36-103 99-130l57 75c-47 16-69 39-69 75v82ZM285 171C326 100 371 64 448 64v112c0 67-36 109-99 134Z" }
    }

    ShapePath {
      strokeWidth: -1
      fillColor: root.color
      PathSvg { path: "M64 64c107 0 156 76 213 153 57 78 104 119 171 119v112c-107 0-163-76-219-153C174 219 132 176 64 176Z" }
    }
  }
}
