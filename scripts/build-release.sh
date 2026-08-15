#!/usr/bin/env bash
# ============================================================
#  OpenCode Assistant for KDE Plasma — build de release
#
#  Gera, em dist/:
#    - opencode-assistant-<versao>.plasmoid   (arquivo que se envia à loja)
#    - opendesktop/                           (pasta pronta pra publicação)
#
#  Uso:
#    ./scripts/build-release.sh
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$ROOT/package"
DIST="$ROOT/dist"

die() { echo "ERRO: $*" >&2; exit 1; }
warn() { echo "AVISO: $*" >&2; }

# ------------------------------------------------------------
# 1) Ler versão / id do metadata.json
# ------------------------------------------------------------
[ -f "$PKG/metadata.json" ] || die "não achei $PKG/metadata.json"

PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || die "python3 é necessário para ler o metadata.json"

read -r PLUGIN_ID VERSION < <("$PY" - "$PKG/metadata.json" <<'EOF'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    kp = json.load(f)["KPlugin"]
print(kp["Id"], kp["Version"])
EOF
)

echo "==> Empacotando $PLUGIN_ID versão $VERSION"

# ------------------------------------------------------------
# 2) Validações que a loja / o Plasma cobram
# ------------------------------------------------------------
echo "==> Validando o pacote"

for f in \
  "$PKG/contents/ui/main.qml" \
  "$PKG/contents/ui/PetSprite.qml" \
  "$PKG/contents/ui/configGeneral.qml" \
  "$PKG/contents/config/main.xml"
do
  [ -f "$f" ] || die "arquivo obrigatório ausente: ${f#$ROOT/}"
done
echo "    QML + config: OK"

for pet in tux tater lobby; do
  [ -f "$PKG/contents/ui/pets/$pet/spritesheet.webp" ] || die "falta spritesheet do pet '$pet'"
  [ -f "$PKG/contents/ui/pets/$pet/pet.json" ] || die "falta pet.json do pet '$pet'"
done
echo "    pets embutidos: OK"

# O ícone PRECISA estar dentro do pacote. Quem instala pela loja (Obter Novos
# Widgets) recebe só o .plasmoid — o scripts/install.sh não roda, então nada
# copia icons/hicolor/ pro tema do usuário. Sem o ícone aqui dentro, o widget
# aparece com o ícone genérico na lista de widgets.
ICON_FOUND=""
for ext in svg svgz png; do
  if [ -f "$PKG/contents/icons/opencode-assistant.$ext" ]; then
    ICON_FOUND="opencode-assistant.$ext"
    break
  fi
done
if [ -n "$ICON_FOUND" ]; then
  echo "    ícone embutido: contents/icons/$ICON_FOUND"
else
  warn "não há contents/icons/opencode-assistant.{svg,png} — na loja o widget vai"
  warn "aparecer com ícone genérico. Copie o ícone pra lá antes de publicar:"
  warn "  mkdir -p package/contents/icons"
  warn "  cp icons/hicolor/scalable/apps/opencode-assistant.svg package/contents/icons/"
fi

if command -v qmllint >/dev/null 2>&1; then
  for f in "$PKG/contents/ui"/*.qml; do
    qmllint "$f" >/dev/null 2>&1 || warn "qmllint reclamou de $(basename "$f")"
  done
  echo "    qmllint: OK"
else
  echo "    (qmllint não encontrado — pulando)"
fi

# ------------------------------------------------------------
# 3) Área de montagem (cópia limpa do package/)
# ------------------------------------------------------------
STAGE="$DIST/.stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -a "$PKG/." "$STAGE/"

# Lixo que não pode ir pro pacote publicado
find "$STAGE" \( \
  -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*~' -o \
  -name '*.orig' -o -name '*.rej' -o -name '.gitignore' -o \
  -name '.gitkeep' -o -name '*.qmlc' -o -name '*.jsc' \
\) -delete 2>/dev/null || true
find "$STAGE" -type d -name '.git' -prune -exec rm -rf {} + 2>/dev/null || true

# ------------------------------------------------------------
# 4) Gerar o .plasmoid
#    metadata.json TEM que ficar na raiz do zip — não dentro de uma subpasta.
# ------------------------------------------------------------
PLASMOID="$DIST/opencode-assistant-$VERSION.plasmoid"
rm -f "$PLASMOID"

if command -v zip >/dev/null 2>&1; then
  ( cd "$STAGE" && zip -r -q -X "$PLASMOID" . )
else
  # Sem o 'zip' instalado — o python3 que já exigimos acima resolve.
  "$PY" - "$STAGE" "$PLASMOID" <<'EOF'
import os, sys, zipfile
stage, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(stage):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            z.write(full, os.path.relpath(full, stage))
EOF
fi
rm -rf "$STAGE"

echo "==> Gerado: ${PLASMOID#$ROOT/}"

# ------------------------------------------------------------
# 5) Conferir que o .plasmoid é instalável de verdade
#    (instala num KDE_HOME descartável, sem tocar na instalação real)
# ------------------------------------------------------------
if command -v kpackagetool6 >/dev/null 2>&1; then
  echo "==> Teste de instalação (sandbox descartável)"
  # Sandbox dentro de dist/, não em /tmp: o pacote tem alguns MB de spritesheet
  # e em muita máquina o /tmp é tmpfs pequeno — ENOSPC ali faz o kpackagetool6
  # falhar e parecer que o pacote está quebrado.
  TESTHOME="$DIST/.testhome"
  rm -rf "$TESTHOME"
  mkdir -p "$TESTHOME"
  if OUT="$(XDG_DATA_HOME="$TESTHOME" kpackagetool6 --type Plasma/Applet \
             --install "$PLASMOID" 2>&1)"; then
    echo "    kpackagetool6 instalou o .plasmoid: OK"
    rm -rf "$TESTHOME"
  else
    rm -rf "$TESTHOME"
    echo "$OUT" >&2
    die "kpackagetool6 recusou o .plasmoid — o pacote não serve pra loja"
  fi
else
  warn "kpackagetool6 não encontrado — pulei o teste de instalação"
fi

# ------------------------------------------------------------
# 6) Pasta pronta pra publicação
# ------------------------------------------------------------
OD="$DIST/opendesktop"
rm -rf "$OD"
mkdir -p "$OD/screenshots"

cp -f "$PLASMOID" "$OD/"
[ -f "$ROOT/LICENSE" ] && cp -f "$ROOT/LICENSE" "$OD/"
[ -f "$ROOT/publish/store-description.md" ] && cp -f "$ROOT/publish/store-description.md" "$OD/"
[ -f "$ROOT/publish/CHANGELOG.md" ] && cp -f "$ROOT/publish/CHANGELOG.md" "$OD/"
[ -f "$ROOT/publish/PUBLICANDO.md" ] && cp -f "$ROOT/publish/PUBLICANDO.md" "$OD/"

# Screenshots: tudo que existir em docs/images/ + o print do widget
SHOTS=0
if [ -d "$ROOT/docs/images" ]; then
  for img in "$ROOT/docs/images"/*.png "$ROOT/docs/images"/*.jpg "$ROOT/docs/images"/*.webp; do
    [ -f "$img" ] || continue
    cp -f "$img" "$OD/screenshots/"
    SHOTS=$((SHOTS + 1))
  done
fi
if [ -f "$ROOT/widget_debug.png" ]; then
  cp -f "$ROOT/widget_debug.png" "$OD/screenshots/01-widget.png"
  SHOTS=$((SHOTS + 1))
fi
[ "$SHOTS" -gt 0 ] || warn "nenhuma screenshot em dist/opendesktop/screenshots/ — a loja exige ao menos 1"

echo
echo "Pronto."
echo "  Pacote:  ${PLASMOID#$ROOT/}"
echo "  Pasta:   ${OD#$ROOT/}/   ($SHOTS screenshot(s))"
echo
echo "Siga publish/PUBLICANDO.md pra subir na loja."
