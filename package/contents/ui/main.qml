import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import QtCore
import QtWebEngine
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as Plasma5Support
import org.kde.plasma.plasmoid

PlasmoidItem {
    id: root

    preferredRepresentation: compactRepresentation
    Plasmoid.backgroundHints: PlasmaCore.Types.ShadowBackground

    // ---- config ----
    readonly property string serverHost: Plasmoid.configuration.hostname
    readonly property int serverPort: Plasmoid.configuration.port
    readonly property string serverUrl: `http://${serverHost}:${serverPort}`

    // ---- runtime state ----
    property bool serverAlive: false
    property bool spawnAttempted: false
    property string petState: "idle"

    // ---- data dir (for logs + pets) — resolved from home (matches install.sh) ----
    // StandardPaths.writableLocation returns a QUrl in QML, so strip the file:// prefix.
    property string dataDir: {
        const p = StandardPaths.writableLocation(StandardPaths.GenericDataLocation).toString()
        const path = p.startsWith("file://") ? p.substring(7) : p
        return path + "/opencode-assistant-kde"
    }

    // ---- pet source: data dir first, package fallback ----
    property url petSource: Qt.resolvedUrl("pets/" + Plasmoid.configuration.petId + "/spritesheet.webp")

    // Hidden Image to probe whether the data-dir spritesheet exists
    Image {
        id: petChecker
        source: "file://" + root.dataDir + "/pets/" + Plasmoid.configuration.petId + "/spritesheet.webp"
        visible: false
        cache: false
        onStatusChanged: {
            if (status === Image.Ready) {
                root.petSource = source
            } else if (status === Image.Error) {
                root.petSource = Qt.resolvedUrl("pets/" + Plasmoid.configuration.petId + "/spritesheet.webp")
            }
        }
    }

    // ---- DataSource: spawn / kill commands ----
    Plasma5Support.DataSource {
        id: execSource
        engine: "executable"
        connectedSources: []
        onNewData: (source, data) => {
            disconnectSource(source)
        }
    }

    // ---- DataSource: health check ----
    Plasma5Support.DataSource {
        id: healthSource
        engine: "executable"
        connectedSources: []
        onNewData: (source, data) => {
            disconnectSource(source)
            const code = typeof data["stdout"] === "string" ? data["stdout"].trim() : ""
            root.serverAlive = (code === "200")
        }
    }

    // ---- DataSource: pet state polling ----
    Plasma5Support.DataSource {
        id: stateSource
        engine: "executable"
        connectedSources: []
        onNewData: (source, data) => {
            disconnectSource(source)
            const body = typeof data["stdout"] === "string" ? data["stdout"] : ""
            root.petState = parseState(body)
        }
    }

    // ---- timers ----
    Timer {
        id: healthTimer
        interval: 3000
        repeat: true
        onTriggered: pollHealth()
    }

    Timer {
        id: stateTimer
        interval: 3000
        repeat: true
        onTriggered: pollState()
    }

    // ---- helpers ----
    function homeDir() {
        const p = StandardPaths.writableLocation(StandardPaths.HomeLocation).toString()
        return p.startsWith("file://") ? p.substring(7) : p
    }

    function opencodeBin() {
        const home = homeDir()
        return `${home}/.opencode/bin/opencode`
    }

    function spawnServer() {
        if (spawnAttempted) return
        spawnAttempted = true

        const home = homeDir()
        const port = Plasmoid.configuration.port
        const host = Plasmoid.configuration.hostname
        const logPath = dataDir + "/opencode-web.log"
        const bin = opencodeBin()

        // Clean environment: unset desktop-app leftovers that force auth / disable web UI
        const cmd = `BIN="${bin}"; [ -x "$BIN" ] || BIN="${home}/.local/bin/opencode"; [ -x "$BIN" ] || BIN="$(command -v opencode || echo opencode)"; env -u OPENCODE_SERVER_PASSWORD -u OPENCODE_SERVER_USERNAME -u OPENCODE_DISABLE_EMBEDDED_WEB_UI -u OPENCODE_CLIENT -u XDG_STATE_HOME setsid nohup "$BIN" serve --hostname ${host} --port ${port} > "${logPath}" 2>&1 &`
        execSource.connectSource(cmd)
        console.log("[assistant] spawn:", cmd)
    }

    function pollHealth() {
        const cmd = `curl -s -o /dev/null -w "%{http_code}" --max-time 2 "${serverUrl}/"`
        healthSource.connectSource(cmd)
    }

    function pollState() {
        if (!serverAlive) return
        const cmd = `curl -s --max-time 2 "${serverUrl}/session"`
        stateSource.connectSource(cmd)
    }

    function parseState(body) {
        try {
            const sessions = JSON.parse(body)
            if (!Array.isArray(sessions) || sessions.length === 0) return "idle"
            const now = Date.now()
            let latest = 0
            for (const s of sessions) {
                const t = s.time && s.time.updated ? s.time.updated : 0
                if (t > latest) latest = t
            }
            if (latest > 0 && (now - latest) < 3000) return "streaming"
            return "idle"
        } catch (e) {
            return "idle"
        }
    }

    function openWeb() {
        positionDialogAtPet()
        chatDialog.visible = true
        if (!serverAlive && !spawnAttempted) {
            spawnServer()
        }
    }

    // position the chat dialog near the pet's head (screen coordinates)
    function positionDialogAtPet() {
        const head = compactItem.petHeadGlobal()
        const scr = root.screenGeometry
        // dialog window size = content + themed margins (dialog may be hidden,
        // so chatDialog.width isn't synced yet — compute it explicitly)
        const m = chatDialog.margins
        const w = chatContent.width + m.left + m.right
        const h = chatContent.height + m.top + m.bottom
        let x = Math.round(head.x - w / 2)
        let y = Math.round(head.y - h - 8) // above the head, like a speech bubble
        x = Math.max(scr.x + 4, Math.min(x, scr.x + scr.width - w - 4))
        if (y < scr.y + 4) {
            y = Math.round(head.y + 8) // not enough room above — open below
        }
        y = Math.max(scr.y + 4, Math.min(y, scr.y + scr.height - h - 4))
        chatDialog.x = x
        chatDialog.y = y
    }

    // ---- lifecycle ----
    Component.onCompleted: {
        healthTimer.start()
        pollHealth()
    }

    Component.onDestruction: {
        healthTimer.stop()
        stateTimer.stop()
    }

    onServerAliveChanged: {
        if (serverAlive) {
            stateTimer.start()
        } else {
            stateTimer.stop()
            root.petState = "error"
        }
    }

    // ---- compact: animated pet (draggable within the widget) ----
    compactRepresentation: Item {
        id: compactItem

        // A bit bigger than the pet so there's room to drag it around.
        Layout.minimumWidth: Plasmoid.configuration.petSize
        Layout.minimumHeight: Plasmoid.configuration.petSize * (208 / 192)
        Layout.preferredWidth: Plasmoid.configuration.petSize * 1.5
        Layout.preferredHeight: Plasmoid.configuration.petSize * (208 / 192) * 1.5

        // pet top-left position inside the widget
        property real petPosX: 0
        property real petPosY: 0
        property bool petInitialized: false
        property string dragDir: ""

        // walking to a clicked spot
        property bool walking: false
        property real walkTargetX: 0
        property real walkTargetY: 0

        Timer {
            id: walkTimer
            interval: 30
            repeat: true
            onTriggered: {
                const dx = compactItem.walkTargetX - compactItem.petPosX
                const dy = compactItem.walkTargetY - compactItem.petPosY
                const dist = Math.sqrt(dx * dx + dy * dy)
                const speed = 3 // px per tick
                if (dist <= speed) {
                    compactItem.petPosX = compactItem.walkTargetX
                    compactItem.petPosY = compactItem.walkTargetY
                    compactItem.stopWalking()
                    return
                }
                compactItem.petPosX += (dx / dist) * speed
                compactItem.petPosY += (dy / dist) * speed
                // walking animation follows the horizontal direction
                if (Math.abs(dx) > 0.5) {
                    const dir = dx > 0 ? "right" : "left"
                    if (dir !== compactItem.dragDir) {
                        compactItem.dragDir = dir
                        pet.startDragging(dir)
                    }
                }
                // keep the popup anchored while the pet walks
                if (root.chatDialog.visible) {
                    root.positionDialogAtPet()
                }
            }
        }

        // make the pet walk to a widget-local position (centered on the click)
        function walkTo(x, y) {
            const maxX = Math.max(0, compactItem.width - pet.width)
            const maxY = Math.max(0, compactItem.height - pet.height)
            compactItem.walkTargetX = Math.max(0, Math.min(maxX, x - pet.width / 2))
            compactItem.walkTargetY = Math.max(0, Math.min(maxY, y - pet.height / 2))
            compactItem.walking = true
            walkTimer.start()
        }

        function stopWalking() {
            compactItem.walking = false
            walkTimer.stop()
            compactItem.dragDir = ""
            pet.stopDragging()
            // if the pointer ended up over the pet (and we're not mid-press), let it jump
            if (!petArea.pressedActive && petArea.containsMouse &&
                petArea.mouseX >= pet.x && petArea.mouseX <= pet.x + pet.width &&
                petArea.mouseY >= pet.y && petArea.mouseY <= pet.y + pet.height) {
                pet.startHover()
            }
        }

        // center the pet on first layout, clamp it on every resize
        function handleSizeChanged() {
            const maxX = Math.max(0, compactItem.width - pet.width)
            const maxY = Math.max(0, compactItem.height - pet.height)
            if (!compactItem.petInitialized && compactItem.width > 0 && compactItem.height > 0) {
                compactItem.petInitialized = true
                compactItem.petPosX = maxX / 2
                compactItem.petPosY = maxY / 2
            } else {
                compactItem.petPosX = Math.min(compactItem.petPosX, maxX)
                compactItem.petPosY = Math.min(compactItem.petPosY, maxY)
            }
        }

        // pet head position in screen coordinates (anchors the chat popup)
        function petHeadGlobal() {
            const p = pet.mapToGlobal(pet.width / 2, 0)
            return Qt.point(p.x, p.y)
        }

        onWidthChanged: handleSizeChanged()
        onHeightChanged: handleSizeChanged()

        PetSprite {
            id: pet
            x: compactItem.petPosX
            y: compactItem.petPosY
            size: Plasmoid.configuration.petSize
            fps: Plasmoid.configuration.petFps
            source: root.petSource
            state: root.petState
        }

        // status dot: fixed small red dot, only visible while offline
        Rectangle {
            anchors.bottom: parent.bottom
            anchors.right: parent.right
            width: 10
            height: 10
            radius: 5
            color: "#e53935"
            border.color: "#ffffff"
            border.width: 1
            opacity: root.serverAlive ? 0 : 1
            Behavior on opacity { NumberAnimation { duration: 200 } }
        }

        MouseArea {
            id: petArea
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor

            property bool pressedActive: false
            property bool moved: false
            property real pressX: 0
            property real pressY: 0
            property real lastX: 0
            property real lastY: 0

            onPressed: (mouse) => {
                pressedActive = true
                moved = false
                pressX = mouse.x
                pressY = mouse.y
                lastX = mouse.x
                lastY = mouse.y
                // stop the hover jump and any walk in progress
                pet.stopHover()
                compactItem.stopWalking()
            }

            onEntered: {
                if (!pressedActive && !compactItem.walking) {
                    pet.startHover()
                }
            }

            onExited: {
                pet.stopHover()
            }

            onWheel: (wheel) => {
                // scroll up = bigger pet, scroll down = smaller pet
                const step = 8
                const delta = wheel.angleDelta.y > 0 ? step : -step
                const newSize = Math.max(32, Math.min(256, Plasmoid.configuration.petSize + delta))
                Plasmoid.configuration.petSize = newSize
            }

            onPositionChanged: (mouse) => {
                if (!pressedActive) return
                const dx = mouse.x - lastX
                const dy = mouse.y - lastY
                if (Math.abs(mouse.x - pressX) > 4 || Math.abs(mouse.y - pressY) > 4) {
                    moved = true
                }
                const maxX = Math.max(0, compactItem.width - pet.width)
                const maxY = Math.max(0, compactItem.height - pet.height)
                compactItem.petPosX = Math.max(0, Math.min(maxX, compactItem.petPosX + dx))
                compactItem.petPosY = Math.max(0, Math.min(maxY, compactItem.petPosY + dy))
                lastX = mouse.x
                lastY = mouse.y

                // keep the popup anchored to the pet's head while dragging
                if (root.chatDialog.visible) {
                    root.positionDialogAtPet()
                }

                // walking animation follows the horizontal drag direction
                if (Math.abs(dx) > 0.5) {
                    const dir = dx > 0 ? "right" : "left"
                    if (dir !== compactItem.dragDir) {
                        compactItem.dragDir = dir
                        pet.startDragging(dir)
                    }
                }
            }

            onReleased: (mouse) => {
                if (!pressedActive) return
                pressedActive = false
                compactItem.dragDir = ""
                if (moved) {
                    // it was a drag — stop walking
                    pet.stopDragging()
                } else {
                    // plain click — pet or empty area?
                    const onPet = mouse.x >= pet.x && mouse.x <= pet.x + pet.width &&
                                  mouse.y >= pet.y && mouse.y <= pet.y + pet.height
                    if (onPet) {
                        // click on the pet — wave and toggle the opencode popup
                        pet.wave()
                        if (root.chatDialog.visible) {
                            root.chatDialog.visible = false
                        } else {
                            root.openWeb()
                        }
                    } else {
                        // click on empty area — the pet walks there
                        compactItem.walkTo(mouse.x, mouse.y)
                    }
                }
            }

            onCanceled: {
                if (!pressedActive) return
                pressedActive = false
                compactItem.dragDir = ""
                if (moved) {
                    pet.stopDragging()
                }
            }
        }
    }

    // ---- chat popup: custom dialog anchored to the pet's head ----
    PlasmaCore.Dialog {
        id: chatDialog
        location: PlasmaCore.Types.Floating
        type: PlasmaCore.Dialog.AppletPopup
        hideOnWindowDeactivate: false
        backgroundHints: PlasmaCore.Dialog.SolidBackground
        visible: false

        mainItem: Item {
            id: chatContent
            width: Plasmoid.configuration.popupWidth
            height: Plasmoid.configuration.popupHeight
            clip: true

            // slim header: title + status + close
            Rectangle {
                id: headerBar
                anchors.top: parent.top
                anchors.left: parent.left
                anchors.right: parent.right
                height: 34
                color: "#181825"
                z: 30

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 12
                    anchors.rightMargin: 6
                    spacing: 8

                    Text {
                        text: "OpenCode"
                        color: "#cdd6f4"
                        font.pixelSize: 13
                        font.bold: true
                        Layout.fillWidth: true
                    }

                    Rectangle {
                        width: 8
                        height: 8
                        radius: 4
                        color: root.serverAlive ? "#a6e3a1" : "#f38ba8"
                        Layout.alignment: Qt.AlignVCenter
                    }

                    Rectangle {
                        width: 24
                        height: 24
                        radius: 4
                        color: "#00000000"
                        Layout.alignment: Qt.AlignVCenter

                        Text {
                            anchors.centerIn: parent
                            text: "✕"
                            color: "#cdd6f4"
                            font.pixelSize: 12
                        }
                        MouseArea {
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: chatDialog.visible = false
                            onEntered: parent.color = "#313244"
                            onExited: parent.color = "#00000000"
                        }
                    }
                }
            }

            // opencode web UI
            WebEngineView {
                id: webView
                anchors.top: headerBar.bottom
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                url: root.serverAlive ? root.serverUrl : "about:blank"
                visible: root.serverAlive
                backgroundColor: "#1e1e2e"

                onNewWindowRequested: (request) => {
                    Qt.openUrlExternally(request.url)
                }
            }

            // loading overlay
            Rectangle {
                anchors.top: headerBar.bottom
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                visible: !root.serverAlive
                color: "#1e1e2e"
                z: 10

                ColumnLayout {
                    anchors.centerIn: parent
                    spacing: 12

                    Text {
                        text: "Conectando ao OpenCode..."
                        color: "#ffffff"
                        font.pixelSize: 16
                        font.bold: true
                        Layout.alignment: Qt.AlignHCenter
                    }
                    Text {
                        text: "Iniciando o servidor..."
                        color: "#a0a0b8"
                        font.pixelSize: 13
                        Layout.alignment: Qt.AlignHCenter
                    }
                    BusyIndicator {
                        running: true
                        Layout.alignment: Qt.AlignHCenter
                    }
                }
            }

            // resize handle (bottom-right corner)
            MouseArea {
                id: resizeHandle
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                width: 28
                height: 28
                cursorShape: Qt.SizeFDiagCursor
                z: 40

                property bool resizing: false
                property real startW: 0
                property real startH: 0
                property real startGX: 0
                property real startGY: 0

                onPressed: (mouse) => {
                    resizing = true
                    startW = chatContent.width
                    startH = chatContent.height
                    startGX = mouse.globalX
                    startGY = mouse.globalY
                }
                onPositionChanged: (mouse) => {
                    if (!resizing) return
                    chatContent.width = Math.max(320, startW + (mouse.globalX - startGX))
                    chatContent.height = Math.max(240, startH + (mouse.globalY - startGY))
                }
                onReleased: {
                    resizing = false
                    Plasmoid.configuration.popupWidth = Math.round(chatContent.width)
                    Plasmoid.configuration.popupHeight = Math.round(chatContent.height)
                }

                // grip indicator
                Rectangle {
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    width: 10
                    height: 10
                    color: "#66ffffff"
                }
            }
        }
    }
}