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
        pet.wave()
        root.expanded = true
        if (!serverAlive && !spawnAttempted) {
            spawnServer()
        }
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

    onExpandedChanged: {
        if (root.expanded && !serverAlive && !spawnAttempted) {
            spawnServer()
        }
    }

    onServerAliveChanged: {
        if (serverAlive) {
            stateTimer.start()
        } else {
            stateTimer.stop()
            root.petState = "idle"
        }
    }

    // ---- compact: animated pet ----
    compactRepresentation: Item {
        id: compactItem
        Layout.preferredWidth: Plasmoid.configuration.petSize
        Layout.preferredHeight: Plasmoid.configuration.petSize * (208 / 192)

        PetSprite {
            id: pet
            anchors.centerIn: parent
            size: Plasmoid.configuration.petSize
            source: root.petSource
            state: root.petState
        }

        // status dot
        Rectangle {
            anchors.bottom: parent.bottom
            anchors.right: parent.right
            width: Math.max(6, parent.width * 0.22)
            height: width
            radius: width / 2
            color: root.serverAlive ? "#4caf50" : "#b0bec5"
            border.color: "#ffffff"
            border.width: 1
            Behavior on color { ColorAnimation { duration: 300 } }
        }

        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            onClicked: root.openWeb()
            cursorShape: Qt.PointingHandCursor
        }
    }

    // ---- full: opencode web UI ----
    fullRepresentation: Item {
        id: fullItem
        Layout.preferredWidth: Plasmoid.configuration.popupWidth
        Layout.preferredHeight: Plasmoid.configuration.popupHeight

        WebEngineView {
            id: webView
            anchors.fill: parent
            url: root.serverAlive ? root.serverUrl : "about:blank"
            visible: root.serverAlive
            backgroundColor: "#1e1e2e"

            onNewWindowRequested: (request) => {
                Qt.openUrlExternally(request.url)
            }
        }

        // loading overlay
        Rectangle {
            anchors.fill: parent
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
    }
}