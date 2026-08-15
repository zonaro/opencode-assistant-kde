# Texto pronto pra loja

Cole os blocos abaixo nos campos do formulário da store.kde.org / OpenDesktop.

---

## Resumo (campo "Summary" — 1 linha)

```
An animated desktop pet that opens an embedded OpenCode AI panel when you click it.
```

---

## Descrição (campo "Description")

Cole tudo daqui pra baixo, até o fim do bloco.

```
⚠️ REQUIREMENTS — please read before installing

This widget drives the OpenCode CLI running on your own machine. Installing from
the store gives you the widget only, so you need two things already present:

  1. opencode CLI    →  curl -fsSL https://opencode.ai/install | bash
                        then log in once:  opencode auth login
  2. QtWebEngine (QML)  →  Arch:   sudo pacman -S qt6-webengine
                           Debian/Ubuntu: sudo apt install qml6-module-qtwebengine
                           Fedora: sudo dnf install qt6-qtwebengine

Without the opencode CLI the panel stays empty. Without QtWebEngine the panel
does not render at all. The pets themselves are bundled — nothing else to fetch.

──────────────────────────────────────────

OpenCode Assistant puts an animated pixel-art pet on your desktop. Click it and a
panel opens right above its head with the full OpenCode web UI — the same AI
coding assistant you use in the terminal, embedded in Plasma, no browser window
involved.

The server runs locally. Nothing is sent anywhere except to whatever AI provider
you configured in opencode itself.

FEATURES

  • Animated pet — Tux (default), Tater or Lobby, all bundled. The pet reacts to
    what the assistant is doing: idle, thinking, streaming, success, error.
  • Click the pet — opens an embedded panel with the OpenCode web UI, anchored to
    the pet's head and following it as it moves.
  • Click empty space — the pet walks over there, facing the right direction.
  • Drag it — the pet walks along with your cursor and stops when you let go.
  • Hover — it jumps.
  • Scroll — resizes the pet, 32 to 256 px.
  • Offline indicator — a small red dot plus the error animation whenever the
    local server is down.
  • Resizable panel — drag the bottom-right corner; the size is remembered.
  • Custom pets — any pet in the OpenPets format works. A button in the settings
    opens the pets folder; drop a pet in and refresh the list.

SETTINGS

Port, hostname, which pet, pet size, animation speed (FPS) and panel dimensions.

HOW IT WORKS

The widget spawns `opencode serve` on 127.0.0.1 on demand, with a sanitized
environment so it runs unauthenticated with the embedded web UI enabled, and
polls it to keep the pet's animation in sync with the session state. It is pure
QML — no extra daemon, no Node.js backend.

Works on the desktop and inside a panel.

LINKS

  Source & issues: https://github.com/zonaro/opencode-assistant-kde
  OpenCode:        https://opencode.ai

License: MIT
```

---

## Descrição em português (opcional — cole abaixo da inglesa)

```
──────────────────────────────────────────
PORTUGUÊS

⚠️ REQUISITOS — leia antes de instalar

Este widget controla o OpenCode CLI rodando na sua própria máquina. Instalar pela
loja traz só o widget, então duas coisas precisam já estar presentes:

  1. opencode CLI    →  curl -fsSL https://opencode.ai/install | bash
                        depois faça login uma vez:  opencode auth login
  2. QtWebEngine (QML)  →  Arch:   sudo pacman -S qt6-webengine
                           Debian/Ubuntu: sudo apt install qml6-module-qtwebengine
                           Fedora: sudo dnf install qt6-qtwebengine

Sem o opencode CLI o painel fica vazio. Sem o QtWebEngine o painel nem renderiza.
Os pets já vêm embutidos — nada mais pra baixar.

O OpenCode Assistant coloca um pet animado em pixel art no seu desktop. Clique
nele e um painel abre logo acima da cabeça dele com a interface web completa do
OpenCode — o mesmo assistente de IA que você usa no terminal, embutido no Plasma,
sem abrir navegador.

O servidor roda localmente. Nada é enviado pra lugar nenhum além do provedor de
IA que você mesmo configurou no opencode.

RECURSOS

  • Pet animado — Tux (padrão), Tater ou Lobby, todos embutidos. O pet reage ao
    que o assistente está fazendo: parado, pensando, respondendo, sucesso, erro.
  • Clique no pet — abre o painel embutido com a UI web do OpenCode, ancorado na
    cabeça dele e acompanhando quando ele se move.
  • Clique num espaço vazio — o pet caminha até lá, virado pro lado certo.
  • Arraste — o pet caminha junto e para quando você solta.
  • Passe o mouse — ele pula.
  • Role o scroll — redimensiona o pet, de 32 a 256 px.
  • Indicador offline — um pontinho vermelho e a animação de erro sempre que o
    servidor local estiver fora.
  • Painel redimensionável — arraste o canto inferior direito; o tamanho fica
    salvo.
  • Pets personalizados — qualquer pet no formato OpenPets funciona. Um botão nas
    configurações abre a pasta de pets; solte o pet lá e atualize a lista.

CONFIGURAÇÕES

Porta, hostname, qual pet, tamanho do pet, velocidade da animação (FPS) e
dimensões do painel.

Funciona no desktop e dentro do painel.

Código-fonte: https://github.com/zonaro/opencode-assistant-kde
Licença: MIT
```

---

## Tags

```
plasma6, plasmoid, applet, widget, ai, opencode, assistant, pet, desktop-pet, qml
```

---

## Campos curtos

| Campo | Valor |
|---|---|
| Title | `OpenCode Assistant` |
| Version | `0.1.0` |
| License | `MIT` |
| Category | `Plasma 6 Add-Ons` → `Plasma 6 Applets` |
| Homepage | `https://github.com/zonaro/opencode-assistant-kde` |
