#!/usr/bin/env bash
# ============================================================
#  OpenCode Assistant for KDE Plasma — installer
#
#  Works both:
#    1. Piped from the web (recommended):
#         curl -fsSL https://raw.githubusercontent.com/zonaro/opencode-assistant-kde/main/scripts/install.sh | bash
#    2. Locally, from a checkout:
#         ./scripts/install.sh
#
#  Installs:
#    - opencode CLI (if missing), via: curl -fsSL https://opencode.ai/install | bash
#    - the plasmoid bundle (kpackagetool6) — pets are bundled in the package
# ============================================================
set -euo pipefail

REPO="${OPENCODE_ASSISTANT_REPO:-zonaro/opencode-assistant-kde}"
BRANCH="${OPENCODE_ASSISTANT_BRANCH:-main}"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
DATA_DIR="${OPENCODE_ASSISTANT_DATA_DIR:-$HOME/.local/share/opencode-assistant-kde}"

PY="$(command -v python3 || command -v python || true)"

need() {
  command -v "$1" >/dev/null 2>&1
}

# ------------------------------------------------------------
# 0) Find source directory (local checkout vs remote download)
# ------------------------------------------------------------
SRC_DIR=""
SCRIPT_PATH="${BASH_SOURCE[0]:-}"
if [ -n "$SCRIPT_PATH" ] && [ -f "$SCRIPT_PATH" ] && [ -d "$(dirname "$SCRIPT_PATH")/../package" ]; then
  # We are being executed from a local checkout.
  SRC_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
else
  echo "==> Baixando fontes do repositório: $REPO ($BRANCH)"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  TARBALL="$TMP/opencode-assistant.tar.gz"
  if ! curl -fsSL --retry 2 --max-time 120 -o "$TARBALL" "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz"; then
    echo "ERRO: não foi possível baixar https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" >&2
    exit 1
  fi
  tar -xzf "$TARBALL" -C "$TMP"
  SRC_DIR="$(find "$TMP" -maxdepth 1 -type d -name 'opencode-assistant-*' | head -n 1)"
  if [ -z "$SRC_DIR" ]; then
    echo "ERRO: arquivo de fontes inválido" >&2
    exit 1
  fi
fi
PKG_DIR="$SRC_DIR/package"

# ------------------------------------------------------------
# 1) Prerequisites
# ------------------------------------------------------------
echo "==> Verificando dependências"
MISSING=""
for t in node curl; do
  if ! need "$t"; then MISSING="$MISSING $t"; fi
done
for t in kpackagetool6 plasmashell; do
  if ! need "$t"; then MISSING="$MISSING $t"; fi
done
if [ -n "$MISSING" ]; then
  echo "AVISO: não encontrados:$MISSING" >&2
  echo "  Instale-os antes (ou depois) de continuar:" >&2
  echo "    Arch:    sudo pacman -S nodejs curl kpackage plasma-workspace" >&2
  echo "    Debian/Ubuntu: sudo apt install nodejs curl kpackage plasma-workspace" >&2
  echo "    Fedora:  sudo dnf install nodejs curl kpackage plasma-workspace" >&2
  if ! need node || ! need curl; then
    echo "ERRO: node e curl são obrigatórios." >&2
    exit 1
  fi
fi

# ------------------------------------------------------------
# 2) opencode CLI
# ------------------------------------------------------------
if need opencode; then
  echo "==> opencode já instalado: $(opencode --version 2>/dev/null | head -n1 || echo '?')"
else
  echo "==> Instalando opencode via https://opencode.ai/install"
  curl -fsSL https://opencode.ai/install | bash || {
    echo "ERRO: falha ao instalar opencode. Rode manualmente: curl -fsSL https://opencode.ai/install | bash" >&2
    exit 1
  }
  if [ -x "$BIN_DIR/opencode" ] && ! need opencode; then
    export PATH="$BIN_DIR:$PATH"
  fi
  command -v opencode >/dev/null 2>&1 || {
    echo "  opencode instalado em $BIN_DIR/opencode" >&2
    echo "  Adicione $BIN_DIR ao seu PATH ou use o caminho completo." >&2
  }
fi

# ------------------------------------------------------------
# 3) Data directory + default pet (Tux) download
# ------------------------------------------------------------
echo "==> Preparando diretório de dados: $DATA_DIR"
mkdir -p "$DATA_DIR/pets"

PET_URL="${OPENCODE_ASSISTANT_PET_URL:-https://zip.openpets.dev/pets/tux-de2f300f/tux.zip}"
PET_DIR="$DATA_DIR/pets/tux"
if [ -f "$PET_DIR/spritesheet.webp" ] && [ -f "$PET_DIR/pet.json" ]; then
  echo "==> Pet padrão (Tux) já presente, pulando download"
else
  echo "==> Baixando pet padrão (Tux) de $PET_URL"
  TMP_ZIP="$(mktemp --suffix=.zip)"
  if curl -fL --max-time 60 -o "$TMP_ZIP" "$PET_URL"; then
    mkdir -p "$PET_DIR"
    if need unzip; then
      unzip -j -o "$TMP_ZIP" -d "$PET_DIR" >/dev/null 2>&1 || {
        echo "    unzip falhou, tentando python3..."
        "$PY" - "$TMP_ZIP" "$PET_DIR" <<'EOF'
import sys, zipfile, os
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z:
    for name in z.namelist():
        if name.endswith('/'):
            continue
        base = os.path.basename(name)
        with z.open(name) as f, open(os.path.join(dst, base), 'wb') as out:
            out.write(f.read())
print("extraído OK")
EOF
      }
    elif [ -n "$PY" ]; then
      "$PY" - "$TMP_ZIP" "$PET_DIR" <<'EOF'
import sys, zipfile, os
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z:
    for name in z.namelist():
        if name.endswith('/'):
            continue
        base = os.path.basename(name)
        with z.open(name) as f, open(os.path.join(dst, base), 'wb') as out:
            out.write(f.read())
print("extraído OK")
EOF
    else
      echo "    AVISO: sem unzip/python3 para extrair o pet"
    fi
    echo "    pet instalado em $PET_DIR"
  else
    echo "    AVISO: falha ao baixar $PET_URL"
  fi
  rm -f "$TMP_ZIP"
fi

# ------------------------------------------------------------
# 4) Plasmoid (pets are bundled in package/contents/ui/pets/)
# ------------------------------------------------------------
if ! need kpackagetool6; then
  echo "ERRO: kpackagetool6 não encontrado. Instale kpackage (parte do KDE Plasma)." >&2
  exit 1
fi

echo "==> Instalando plasmoid (kpackagetool6)"
kpackagetool6 --type Plasma/Applet --install "$PKG_DIR" || {
  # --install replaces on KDE Plasma 5; on 6 the flag is replaced, try upgrade
  kpackagetool6 --type Plasma/Applet --upgrade "$PKG_DIR" 2>/dev/null && echo "  (atualizado)" || {
    echo "Falha ao instalar. Tente: kpackagetool6 --type Plasma/Applet --install $PKG_DIR" >&2
    exit 1
  }
}

# ------------------------------------------------------------
# 6) Restart shell
# ------------------------------------------------------------
echo "==> Reiniciando plasmashell para carregar o widget"
plasmashell --replace >/dev/null 2>&1 &

echo
echo "OK. Adicione o widget 'OpenCode Assistant' ao seu painel ou desktop."
echo "  Clique no pet para abrir o painel do OpenCode Web."
echo "  Log do servidor: $DATA_DIR/opencode-web.log"
echo
echo "Dica: se o opencode foi instalado agora, faça login:"
echo "  $BIN_DIR/opencode auth login"