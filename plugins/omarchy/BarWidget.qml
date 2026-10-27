import QtQuick
import qs.Commons
import qs.Ui

// The Noeis mark in the bar, and the host for the panel under it. A click
// opens the panel; `omarchy-shell shell toggle io.noeis` does the same from
// the keyboard. The tooltip says how much waits on the nightstand. The
// widget hands the Service its settings, since only the bar holds them.
BarWidget {
  id: root
  moduleName: "io.noeis"

  property var service: null

  function resolveService() {
    var found = bar && bar.shell && typeof bar.shell.serviceFor === "function" ? bar.shell.serviceFor(moduleName) : null
    if (found) service = found
  }

  function injectPanel() {
    if (service) service.settings = root.settings
    var target = panelLoader.item
    if (!target) return
    target.bar = root.bar
    target.anchorItem = button
    target.hostWidget = root
    target.service = root.service
  }

  // The Service may come up after the bar does.
  Timer {
    interval: 500
    repeat: true
    running: root.service === null
    onTriggered: root.resolveService()
  }

  onServiceChanged: injectPanel()
  onSettingsChanged: injectPanel()
  Component.onCompleted: resolveService()

  // Shape contract for shell.summon/hide/toggle routing: the bar finds a
  // widget's panel through open/close/opened on the widget root.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property int waiting: service ? service.nightstandTotal : 0
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() { if (panelLoader.item) panelLoader.item.open() }
  function close() { if (panelLoader.item) panelLoader.item.close() }
  function closeForPopoutSwitch() { if (panelLoader.item) panelLoader.item.closeForPopoutSwitch() }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: {
    resolveService()
    injectPanel()
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    tooltipText: root.opened ? "" : root.waiting ? "Noeis · " + root.waiting + " on your nightstand" : "Noeis"
    iconComponent: Component {
      Item {
        NoeisMark {
          anchors.centerIn: parent
          size: Math.round(Style.bar.iconCanvas * 0.95)
          color: button.foreground
        }
      }
    }

    onPressed: function(b) {
      if (panelLoader.item) panelLoader.item.toggle()
    }
  }
}
