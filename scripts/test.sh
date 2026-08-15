#!/usr/bin/env bash
# Testes do projeto: validação do plasmoid + opencode serve.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${OPENCODE_ASSISTANT_PORT:-3171}"
PKG="$ROOT/package"

echo "==> 1/4 Validando estrutura do plasmoid"
node -e "JSON.parse(require('fs').readFileSync('$PKG/metadata.json','utf8'))"
echo "    metadata.json: OK"
for f in "$PKG/contents/ui/main.qml" "$PKG/contents/ui/PetSprite.qml" "$PKG/contents/config/main.xml"; do
  [ -f "$f" ] || { echo "    FALTA: $f"; exit 1; }
done
echo "    arquivos QML/XML: OK"
for pet in tux tater; do
  [ -f "$PKG/contents/ui/pets/$pet/spritesheet.webp" ] || { echo "    FALTA: spritesheet $pet"; exit 1; }
  [ -f "$PKG/contents/ui/pets/$pet/pet.json" ] || { echo "    FALTA: pet.json $pet"; exit 1; }
done
echo "    pets (tux, tater): OK"

echo "==> 2/4 Validando sintaxe QML (qmllint)"
if command -v qmllint >/dev/null 2>&1; then
  for f in "$PKG/contents/ui/main.qml" "$PKG/contents/ui/PetSprite.qml" "$PKG/contents/ui/configGeneral.qml"; do
    if qmllint "$f" >/dev/null 2>&1; then
      echo "    $(basename "$f"): OK"
    else
      echo "    $(basename "$f"): ERRO"
      qmllint "$f" 2>&1 | head -n 5
      exit 1
    fi
  done
else
  echo "    (qmllint não encontrado — pulando)"
fi

echo "==> 3/4 Testando opencode serve (env limpo)"
BIN="$(command -v opencode 2>/dev/null || echo "$HOME/.opencode/bin/opencode")"
if [ ! -x "$BIN" ]; then
  echo "    AVISO: opencode CLI não encontrado — pulando"
else
  env -u OPENCODE_SERVER_PASSWORD -u OPENCODE_SERVER_USERNAME \
      -u OPENCODE_DISABLE_EMBEDDED_WEB_UI -u OPENCODE_CLIENT -u XDG_STATE_HOME \
      setsid nohup "$BIN" serve --hostname 127.0.0.1 --port "$PORT" \
      > /tmp/opencode-assistant-kde-test.log 2>&1 &
  SRV_PID=$!
  trap 'kill $SRV_PID 2>/dev/null || true' EXIT

  for _ in $(seq 1 20); do
    if curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then break; fi
    sleep 0.3
  done

  echo "    /:         $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")"
  echo "    /session:  $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/session")"
  echo "    /config:   $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/config")"
  kill "$SRV_PID" 2>/dev/null || true
  wait "$SRV_PID" 2>/dev/null || true
fi

echo "==> 4/4 Plasmoid (visualização)"
echo "    plasmoidviewer -a '$PKG' -l floating -f planar"
echo
echo "Teste concluído."