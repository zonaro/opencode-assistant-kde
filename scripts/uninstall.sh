#!/usr/bin/env bash
# Remove o plasmoid OpenCode Assistant (mantém configuração e backend).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT/package"

echo "==> Desinstalando plasmoid"
kpackagetool6 --type Plasma/Applet --remove com.opencode.assistant || {
  echo "Plasmoid não estava instalado (ou falha ao remover)."
}

echo "==> Tentando parar o backend (se estiver sendo executado)"
pkill -f "opencode-assistant-kde/backend/index.js" 2>/dev/null || true
pkill -f "osascript.*opencode" 2>/dev/null || true

echo "==> Reiniciando plasmashell"
plasmashell --replace >/dev/null 2>&1 &

echo "OK. Configuração mantida em:"
echo "  \$HOME/.local/share/opencode-assistant-kde/"
echo "Para remover também a configuração, apague essa pasta."