import QtQuick
import "Model.js" as Model

// A moment once a day, when the clock reads `hour`:00, while it runs.
Timer {
  id: root

  property int hour: 0
  signal came()

  repeat: true
  function arm() { interval = Model.untilHour(hour, Date.now() + 1000) }
  onHourChanged: arm()
  onRunningChanged: arm()
  onTriggered: {
    arm()
    came()
  }
}
