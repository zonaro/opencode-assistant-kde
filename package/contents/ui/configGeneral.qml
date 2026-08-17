import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

import org.kde.kcmutils as KCM
import org.kde.kirigami as Kirigami
import org.kde.plasma.plasma5support as Plasma5Support

KCM.SimpleKCM {
    id: page

    property alias cfg_port: spinPort.value
    property alias cfg_hostname: textHostname.text
    property alias cfg_username: textUsername.text
    property alias cfg_password: textPassword.text
    property alias cfg_popupWidth: spinPopupWidth.value
    property alias cfg_popupHeight: spinPopupHeight.value
    property alias cfg_petId: page.selectedPet
    property alias cfg_petSize: spinPetSize.value
    property alias cfg_petFps: spinPetFps.value

    property string selectedPet: "tux"

    ListModel {
        id: petModel
    }

    Plasma5Support.DataSource {
        id: petsSource
        engine: "executable"
        connectedSources: []
        onNewData: (source, data) => {
            disconnectSource(source)
            const out = typeof data["stdout"] === "string" ? data["stdout"] : ""
            console.log("[assistant-config] onNewData stdout=", JSON.stringify(out))
            petModel.clear()
            const lines = out.split("\n")
            for (const line of lines) {
                const id = line.trim()
                if (id !== "") {
                    petModel.append({ petId: id })
                }
            }
        }
    }

    // Separate DataSource for opening the folder — its output must NOT touch the pet model.
    Plasma5Support.DataSource {
        id: openSource
        engine: "executable"
        connectedSources: []
        onNewData: (source, data) => {
            disconnectSource(source)
            // ignore output — just opening a folder
        }
    }

    function refreshPets() {
        // list pet folders that have a spritesheet, using $HOME (reliable in KCM)
        const cmd = `PETS_DIR="$HOME/.local/share/opencode-assistant-kde/pets"; mkdir -p "$PETS_DIR"; for d in "$PETS_DIR"/*/; do [ -f "$d/spritesheet.webp" ] && echo "$(basename "$d")"; done`
        console.log("[assistant-config] refreshPets cmd=", cmd)
        petsSource.connectSource(cmd)
    }

    function openPetsFolder() {
        // open the pets folder in the file manager via the executable engine (proven to work in KCM)
        console.log("[assistant-config] openPetsFolder")
        openSource.connectSource(`xdg-open "$HOME/.local/share/opencode-assistant-kde/pets" >/dev/null 2>&1`)
    }

    Component.onCompleted: {
        console.log("[assistant-config] page loaded, petsDir=", page.petsDir)
        refreshPets()
    }

    Kirigami.FormLayout {

        RowLayout {
            Kirigami.FormData.label: i18n("Porta local:")

            QQC2.SpinBox {
                id: spinPort
                from: 1024
                to: 65535
                Layout.fillWidth: true
            }
        }

        RowLayout {
            Kirigami.FormData.label: i18n("Hostname:")

            QQC2.TextField {
                id: textHostname
                Layout.fillWidth: true
                placeholderText: i18n("127.0.0.1")
            }
        }

        RowLayout {
            Kirigami.FormData.label: i18n("Usuário do OpenCode:")

            QQC2.TextField {
                id: textUsername
                Layout.fillWidth: true
                placeholderText: i18n("opencode")
            }
        }

        RowLayout {
            Kirigami.FormData.label: i18n("Senha do OpenCode:")

            QQC2.TextField {
                id: textPassword
                Layout.fillWidth: true
                placeholderText: i18n("Opcional")
                echoMode: QQC2.TextField.Password
            }
        }

        RowLayout {
            Kirigami.FormData.label: i18n("Largura do pop-up:")

            QQC2.SpinBox {
                id: spinPopupWidth
                from: 320
                to: 2000
                stepSize: 20
            }
        }

        RowLayout {
            Kirigami.FormData.label: i18n("Altura do pop-up:")

            QQC2.SpinBox {
                id: spinPopupHeight
                from: 240
                to: 2000
                stepSize: 20
            }
        }

        RowLayout {
            Kirigami.FormData.label: i18n("Pet:")

            QQC2.ComboBox {
                id: comboPet
                model: petModel
                textRole: "petId"
                currentIndex: {
                    for (let i = 0; i < petModel.count; i++) {
                        if (petModel.get(i).petId === page.selectedPet) return i
                    }
                    return 0
                }
                onActivated: page.selectedPet = currentText
                Layout.fillWidth: true
            }

            QQC2.Button {
                text: i18n("Abrir pasta")
                onClicked: page.openPetsFolder()
            }

            QQC2.Button {
                text: i18n("Atualizar")
                onClicked: page.refreshPets()
            }
        }

        RowLayout {
            Kirigami.FormData.label: i18n("Tamanho do pet:")

            QQC2.SpinBox {
                id: spinPetSize
                from: 32
                to: 256
                stepSize: 8
            }
        }

        RowLayout {
            Kirigami.FormData.label: i18n("Velocidade da animação (FPS):")

            QQC2.SpinBox {
                id: spinPetFps
                from: 1
                to: 30
                stepSize: 1
            }
        }
    }
}