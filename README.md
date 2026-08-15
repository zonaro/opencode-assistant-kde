# OpenCode Assistant for KDE Plasma

<p align="center">
  <img src="docs/images/tux.png" alt="Tux pet" width="160">
</p>

An AI chat plasmoid for **KDE Plasma 6** that talks to AI using the [opencode CLI](https://opencode.ai) installed on your machine. It ships with an animated **Tux** pet, multiple conversations, file attachments, and a full settings screen.

It works both on the desktop and as a panel popup widget.

---

## ✨ Features

- **Tux pet** — animated desktop companion that reacts to the chat status (idle, thinking, streaming, success, error). The default pet, **Tux**, is downloaded on demand during installation.
- **Chat** — classic conversation UI with streaming responses, a model picker, and file attachments.
- **Multiple sessions** — create, switch, and delete conversations.
- **Settings** — assistant name/personality, user context, per-folder permissions, memories, pet options, and a secondary agent toggle.
- **Works everywhere** — desktop widget *and* panel popup (uses `WebEngineView`).

---

## 🖥 Requirements

- **KDE Plasma 6** (Qt 6, QtWebEngine)
- **Node.js ≥ 20**
- **curl**
- **kpackagetool6** (part of `kpackage` and shipped with KDE Plasma 6)

The installer will set up [opencode](https://opencode.ai) automatically if it is not already installed.

---

## 📦 Installation

On any Linux machine with KDE Plasma 6, run:

```bash
curl -fsSL https://raw.githubusercontent.com/zonaro/opencode-assistant-kde/main/scripts/install.sh | bash
```

What it does:

1. Checks and installs **opencode CLI** if missing.
2. Downloads the widget sources from this repository.
3. Copies the backend and web UI to `~/.local/share/opencode-assistant-kde/`.
4. Downloads the default **Tux** pet on demand.
5. Installs the plasmoid with `kpackagetool6`.
6. Restarts `plasmashell`.

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

(Or `opencode models` to list what is available.) The first time you chat you may also be asked to grant access from inside the widget — replies flow through the same interface.

---

## 🏗 Architecture

```
KDE Plasma 6 (plasmashell)
├── Plasmoid (QML)
│   ├── compactRepresentation → avatar (widget icon)
│   └── fullRepresentation    → WebEngineView (chat UI)
└── (hatches) Backend Node.js on 127.0.0.1:<port>
    ├── spawns / manages  `opencode serve`  (port 4096)
    ├── serves the chat UI  (http://127.0.0.1:<port>/)
    ├── proxies REST + SSE  (no CORS issues)
    ├── manages configuration & memories
    └── manages pets (state → animation, on-demand download)
        └── opencode serve (headless)
            ├── POST /session
            ├── POST /session/:id/message
            ├── GET  /event       (SSE)
            └── POST /session/:id/permissions/:id
```

- **Backend**: pure Node.js, zero external dependencies (`node:http` only).
- **UI**: plain HTML/CSS/JS served by the backend — no CORS, no `file://` restrictions.
- **Pets**: OpenPets format (`pet.json` + `spritesheet.webp`, 8×9 atlas). The default **Tux** is fetched from `https://zip.openpets.dev/pets/tux-de2f300f/tux.zip` on demand; **Tater** is bundled offline as a fallback.

Config is stored in `~/.local/share/opencode-assistant-kde/config.json`.

---

## 🧪 Development

Run the backend locally (serves the web UI at `http://127.0.0.1:3171/`):

```bash
node backend/index.js
```

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