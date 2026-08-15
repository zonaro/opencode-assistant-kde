# OpenCode Assistant for KDE Plasma

<p align="center">
  <img src="docs/images/tux.png" alt="Tux pet" width="160">
</p>

An AI chat plasmoid for **KDE Plasma 6** that talks to AI using the [opencode CLI](https://opencode.ai) installed on your machine. It ships with an animated **Tux** pet (and **Tater** as an alternative), and clicking the pet opens a popup panel with the OpenCode web UI.

It works both on the desktop and as a panel popup widget.

---

## ✨ Features

- **Animated pet** — Tux (default) or Tater, shown as the widget icon. The pet reacts to the chat status (idle, thinking, streaming, success, error) and waves when clicked.
- **Walk-to-click** — click an empty area of the widget and the pet walks to that spot (left/right animation follows the direction).
- **Hover jump** — hovering the pet makes it jump; it returns to its state when the pointer leaves.
- **Scroll to resize** — scroll up/down over the widget grows/shrinks the pet (32–256 px).
- **Offline error animation** — when the server is offline the pet shows the error animation (and a small red dot appears).
- **Draggable pet** — drag the pet anywhere within the widget; it walks (left/right) following the drag direction and stops when released.
- **Offline status dot** — a small fixed red dot (10px) appears only while the server is offline; it fades out when the server comes online.
- **Popup anchored to the pet** — click the pet to open a `WebEngineView` popup that loads the OpenCode web UI served by `opencode serve` on localhost. The popup opens near the pet's head and follows it when the pet moves.
- **Resizable popup** — drag the bottom-right handle to resize the popup (width/height are remembered).
- **No browser** — the web UI runs embedded in the popup, not in an external browser.
- **Clean environment** — the server is spawned with a sanitized environment (desktop-app leftovers are unset) so it runs unauthenticated with the embedded web UI enabled.
- **Settings** — port, hostname, pet selection, pet size, animation speed (FPS), and popup dimensions.
- **Custom pets** — a button in the settings opens the pets folder (`~/.local/share/opencode-assistant-kde/pets/`); drop any OpenPets zip there (extracted as `pet.json` + `spritesheet.webp`) and refresh the list.

---

## 🖥 Requirements

- **KDE Plasma 6** (Qt 6, QtWebEngine)
- **opencode CLI** (installed automatically by the installer)
- **curl**
- **kpackagetool6** (part of `kpackage` and shipped with KDE Plasma 6)

---

## 📦 Installation

On any Linux machine with KDE Plasma 6, run:

```bash
curl -fsSL https://raw.githubusercontent.com/zonaro/opencode-assistant-kde/main/scripts/install.sh | bash
```

What it does:

1. Checks and installs **opencode CLI** if missing.
2. Downloads the default **Tux** pet to `~/.local/share/opencode-assistant-kde/pets/`.
3. Installs the plasmoid bundle with `kpackagetool6` (pets are bundled in the package as fallbacks).
4. Restarts `plasmashell`.

After installation, add the **OpenCode Assistant** widget to your desktop or panel:

- Right‑click the desktop → *Add Widgets…* → search for **OpenCode Assistant**.

### Manual installation

If you cloned the repository instead:

```bash
./scripts/install.sh
```

Or install just the plasmoid bundle:

```bash
kpackagetool6 --type Plasma/Applet --install package
```

---

## 🐳 Getting an API key for opencode

opencode uses several providers. Once installed, run:

```bash
opencode auth login
```

---

## 🏗 Architecture

```
KDE Plasma 6 (plasmashell)
└── Plasmoid (QML)
    ├── compactRepresentation → PetSprite (animated pet + status dot)
    │   ├── click on pet → wave + open popup
    │   ├── click on empty area → pet walks there
    │   ├── hover → jumping animation
    │   ├── scroll → resize pet
    │   └── drag → move pet + walking animation (left/right)
    └── PlasmaCore.Dialog → WebEngineView (OpenCode web UI)
        ├── anchored to the pet's head (follows the pet)
        └── resizable (bottom-right handle)
            └── loads http://127.0.0.1:<port>/  (served by `opencode serve`)
                └── spawned on-demand with clean env (no auth, web UI enabled)
```

- **Plasmoid**: pure QML (`main.qml` + `PetSprite.qml`). No Node.js backend.
- **Server**: `opencode serve --hostname 127.0.0.1 --port <port>` — spawned on-demand by the plasmoid with `env -u` to unset desktop-app leftovers (`OPENCODE_SERVER_PASSWORD`, `OPENCODE_DISABLE_EMBEDDED_WEB_UI`, `OPENCODE_CLIENT`, `XDG_STATE_HOME`).
- **Pets**: OpenPets format (`pet.json` + `spritesheet.webp`, 8×9 atlas, 192×208 cells). Bundled in `package/contents/ui/pets/` (Tux + Tater).
- **State polling**: the plasmoid polls `GET /session` every 3 s to detect active sessions and animate the pet accordingly.

---

## 🧪 Development

Test everything:

```bash
./scripts/test.sh
```

Preview the widget without installing it:

```bash
plasmoidviewer -a package -l floating -f planar   # desktop
plasmoidviewer -a package -l topedge -f horizontal # panel
```

---

## 📖 Documentation site

Check out the project website (EN / PT / ES):

- **https://zonaro.github.io/opencode-assistant-kde/**

---

## 📄 License

MIT — see [LICENSE](LICENSE).