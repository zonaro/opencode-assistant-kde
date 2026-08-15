import QtQuick
import QtQuick.Layouts
import QtWebEngine
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid

PlasmoidItem {
    id: root

    Plasmoid.preferredRepresentation: Plasmoid.compactRepresentation
    Plasmoid.backgroundHints: "Shadow"
    Layout.minimumWidth: root.config.avatarSize + 8
    Layout.minimumHeight: root.config.avatarSize + 8

    readonly property string backendHost: "127.0.0.1"
    readonly property string backendUrl: `http://${backendHost}:${root.config.port}`
    property bool backendAlive: false
    property bool spawnAttempted: false

    // ---------- backend: spawn + health ----------
    PlasmaCore.DataSource {
        id: execSource
        engine: "executable"
        connectedSources: []
        onNewData: (source, data) => {
            disconnectSource(source)
        }
    }

    PlasmaCore.DataSource {
        id: healthSource
        engine: "http"
        connectedSources: []

        property string lastBody: ""

        onNewData: (source, data) => {
            lastBody = typeof data["body"] === "string" ? data["body"] : ""
            try {
                const obj = JSON.parse(lastBody)
                root.backendAlive = !!(obj.ok || obj.healthy)
            } catch (e) {
                root.backendAlive = false
            }
        }
    }

    function backendScriptPath() {
        return `${root.dataDir}/backend/index.js`
    }

    property string dataDir: {
        try {
            const base = Qt.StandardPaths.writableLocation(Qt.StandardPaths.GenericDataLocation)
            return base !== "" ? base + "/opencode-assistant-kde" : "/tmp/opencode-assistant-kde"
        } catch (e) {
            return "/tmp/opencode-assistant-kde"
        }
    }

    function backendDir() {
        const p = backendScriptPath()
        return p.substring(0, p.length - "index.js".length)
    }

    function spawnBackend() {
        if (spawnAttempted) return
        spawnAttempted = true

        const script = backendScriptPath()
        const logPath = "/tmp/opencode-assistant-kde-backend.log"
        // detach with setsid so the backend survives plasmashell restart
        const cmd = `setsid nohup node "${script}" > "${logPath}" 2>&1 &`
        execSource.connectSource(cmd)
        console.log("[assistant] spawn:", cmd)

        pollTimer.start()
    }

    function pollHealth() {
        const url = `${backendUrl}/api/health`
        try {
            healthSource.connectSource(url)
        } catch (e) {
            console.warn("[assistant] erro no poll de health:", e)
        }
    }

    Timer {
        id: pollTimer
        interval: 3000
        repeat: true
        onTriggered: root.pollHealth()
    }

    function killBackend() {
        execSource.connectSource(`pkill -f "node ${backendScriptPath()}" || true`)
    }

    Component.onCompleted: {
        pollTimer.triggered()     // probe once immediately
        pollTimer.start()
        Qt.callLater(root.spawnBackend)
    }

    Component.onDestruction: {
        pollTimer.stop()
        // do not kill forcibly here: relied-upon long-running backend survives widget removal
    }

    // ---------- compact: avatar ----------
    compactRepresentation: Item {
        id: compactItem
        Layout.preferredWidth: root.config.avatarSize
        Layout.preferredHeight: root.config.avatarSize

        Rectangle {
            id: avatarClip
            anchors.fill: parent
            radius: Math.min(width, height) * 0.2
            clip: true
            color: "#2a2a3a"

            Image {
                anchors.fill: parent
                source: root.config.avatar && root.config.avatar !== "" ? root.config.avatar : Qt.resolvedUrl("../images/avatar.svg")
                fillMode: Image.PreserveAspectCrop
                mipmap: true
                smooth: true
            }

            Rectangle {
                id: statusDot
                anchors.bottom: parent.bottom
                anchors.right: parent.right
                width: Math.max(6, parent.width * 0.22)
                height: width
                radius: width / 2
                color: root.backendAlive ? "#4caf50" : "#b0bec5"
                border.color: "#ffffff"
                border.width: 1
                Behavior on color { ColorAnimation { duration: 300 } }
            }
        }

        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            onClicked: root.expanded = !root.expanded
            cursorShape: Qt.PointingHandCursor
        }
    }

    // ---------- full: chat webview ----------
    fullRepresentation: Item {
        id: fullItem
        Layout.preferredWidth: root.config.popupWidth
        Layout.preferredHeight: root.config.popupHeight

        WebEngineView {
            id: webView
            anchors.fill: parent
            url: root.backendAlive ? `${root.backendUrl}/` : "about:blank"
            onComponentCompleted: {
                backgroundColor = "#1e1e2e"
            }
        }

        Rectangle {
            id: offlineOverlay
            anchors.fill: parent
            visible: !root.backendAlive
            color: "#1e1e2e"
            z: 10

            ColumnLayout {
                anchors.centerIn: parent
                spacing: 12

                Text {
                    text: root.backendAlive ? "" : "Assistente offline"
                    color: "#ffffff"
                    font.pixelSize: 18
                    font.bold: true
                    visible: text !== ""
                    Layout.alignment: Qt.AlignHCenter
                }
                Text {
                    text: "Ligando o backend..."
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

        BusyIndicator {
            anchors.centerIn: parent
            running: root.backendAlive && webView.url !== `${root.backendUrl}/`
            z: 20
        }
    }
}