import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

import org.kde.kcmutils as KCM
import org.kde.kirigami as Kirigami

KCM.SimpleKCM {
    id: page

    property alias cfg_port: spinPort.value
    property alias cfg_avatar: textAvatar.text
    property alias cfg_avatarSize: spinAvatarSize.value
    property alias cfg_popupWidth: spinPopupWidth.value
    property alias cfg_popupHeight: spinPopupHeight.value
    property alias cfg_petId: comboPet.currentText

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
            Kirigami.FormData.label: i18n("Avatar:")

            QQC2.TextField {
                id: textAvatar
                Layout.fillWidth: true
                placeholderText: i18n("Caminho para PNG/JPG/SVG (vazio = padrão)")
            }
        }

        RowLayout {
            Kirigami.FormData.label: i18n("Tamanho do ícone:")

            QQC2.SpinBox {
                id: spinAvatarSize
                from: 24
                to: 256
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
                model: ["tux"]
                Layout.fillWidth: true
            }
        }
    }
}