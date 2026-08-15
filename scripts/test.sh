#!/usr/bin/env bash
# Testes do projeto: síntaxe + backend + pet (download sob demanda) + plasmoidviewer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${OPENCODE_ASSISTANT_PORT:-3171}"

echo "==> 1/5 Verificando sintaxe do backend"
node --check "$ROOT/backend/index.js"
node --check "$ROOT/backend/opencode.js"
node --check "$ROOT/backend/config.js"
node --check "$ROOT/backend/pets.js"
echo "    OK"

echo "==> 2/5 Verificando JSON do plasmoid"
node -e "JSON.parse(require('fs').readFileSync('$ROOT/package/metadata.json','utf8'))"
echo "    OK"

echo "==> 3/5 Testando backend"
DATA_DIR="$(mktemp -d)"
PORT="$PORT" OPENCODE_ASSISTANT_DATA_DIR="$DATA_DIR" node "$ROOT/backend/index.js" > "$DATA_DIR/backend.log" 2>&1 &
BACK_PID=$!
trap 'kill $BACK_PID 2>/dev/null || true; rm -rf "$DATA_DIR"' EXIT

for _ in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.3
done

HEALTH="$(curl -sf "http://127.0.0.1:$PORT/api/health" || echo '{"ok":false}')"
echo "    health: $HEALTH"
echo "    index:      $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")"
echo "    css:        $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/css/style.css")"
echo "    sessions:   $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/sessions")"

echo "==> 4/5 Pet padrão (Tux) — download sob demanda"
PET_IDS() { curl -s "http://127.0.0.1:$PORT/api/pets" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{console.log(JSON.parse(s).map(p=>p.id).join(",")||"(nenhum)")}catch(e){console.log("(invalido)")}})'; }
echo "    pets antes: $(PET_IDS)"
TUX_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/pets/tux/spritesheet")"
echo "    spritesheet tux: HTTP $TUX_CODE"
if [ "$TUX_CODE" != "200" ]; then
  echo "    AVISO: download do Tux falhou (verifique a rede)"
fi
echo "    pets depois: $(PET_IDS)"

kill "$BACK_PID" 2>/dev/null || true
wait "$BACK_PID" 2>/dev/null || true

echo "==> 5/5 Plasmoid (opcional) — use:"
echo "    plasmoidviewer -a '$ROOT/package' -l floating -f planar"
echo
echo "Teste concluído."