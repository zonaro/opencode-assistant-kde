# Plano — Widget de Chat IA para KDE (opencode-assistant-KDE)

Widget (Plasmoid) para KDE Plasma 6 que conversa com IA usando o **opencode CLI** instalado no computador. O pet animado (Tux ou Tater) é o ícone do widget; clicar nele abre um painel popup com a UI web do OpenCode servida por `opencode serve`.

> Data: 15/08/2026 · Ambiente verificado: Plasma 6.7.4, Qt 6.11.1, kpackagetool6 2.0, opencode 1.18.18, QtWebEngine ✓
>
> **Pet padrão**: Tux — embutido no pacote (`package/contents/ui/pets/tux/`). **Tater** também embutido como alternativa.

---

## 1. Visão geral

| Recurso          | Descrição                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------- |
| **Forma**        | Plasmoid Plasma 6 (QML) — funciona na área de trabalho E como popup na barra de tarefas       |
| **Backend IA**   | opencode CLI (instalado em `~/.opencode/bin/opencode`) via servidor headless `opencode serve` |
| **UI do chat**   | WebEngineView carregando a UI web do próprio opencode (`http://127.0.0.1:<porta>/`)           |
| **Pet**          | Formato OpenPets (`pet.json` + `spritesheet.webp`, atlas 8×9) — embutido no pacote            |
| **Configuração** | Tela KConfig no widget (porta, hostname, pet, tamanho, dimensões do popup)                    |
| **Avatar**       | O próprio pet animado serve como ícone do widget                                              |

---

## 2. Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                     KDE Plasma 6 (plasmashell)                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Plasmoid (QML)                                          │  │
│  │  ├─ compactRepresentation → PetSprite (pet animado)      │  │
│  │  │   └─ clique → wave + expand popup                     │  │
│  │  └─ fullRepresentation → WebEngineView (UI do opencode) │  │
│  │      └─ carrega http://127.0.0.1:<porta>/                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ spawn (Plasma5Support.DataSource)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  opencode serve (headless, porta local)                          │
│  ├─ GET  /           → UI web do opencode (HTML/JS)             │
│  ├─ GET  /session    → lista de sessões                         │
│  ├─ GET  /session/:id/message → mensagens + parts              │
│  ├─ POST /session    → criar conversa                           │
│  ├─ POST /session/:id/message → enviar mensagem                │
│  ├─ GET  /event      → SSE (eventos em tempo real)              │
│  └─ GET  /config     → configuração do opencode                 │
└─────────────────────────────────────────────────────────────────┘
```

### Decisões de arquitetura

| Decisão                 | Escolha                                                       | Motivo                                                                                          |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Transporte com opencode | **`opencode serve` + API REST/SSE**                           | API oficial documentada, suporta múltiplas sessões, eventos em tempo real, responder permissões |
| Backend                 | **Nenhum** (plasmoid QML spawna `opencode serve` diretamente) | Elimina Node.js, proxy, CORS; o próprio opencode serve a UI web                                 |
| UI do chat              | **WebEngineView carregando a UI web do opencode**             | Sem backend intermediário; sem CORS; sem `file://` restrictions                                 |
| Spawn do servidor       | `Plasma5Support.DataSource` (engine `executable`)             | Padrão Plasma 6 para spawn de processos                                                         |
| Ambiente do servidor    | `env -u` para unset vars do desktop app                       | Evita auth forçada e `OPENCODE_DISABLE_EMBEDDED_WEB_UI`                                         |
| Pet                     | Formato OpenPets (atlas 8×9, células 192×208)                 | Embutido no pacote; Tux + Tater                                                                 |
| Config do plasmoid      | KConfig (main.xml)                                            | Porta, hostname, pet, tamanho, dimensões do popup                                               |

---

## 3. Estrutura de arquivos do projeto

```
/mnt/GIT/opencode-assistant-KDE/
├── PLANO.md                          ← este arquivo
├── package/                          ← pacote do plasmoid (instalável)
│   ├── metadata.json
│   └── contents/
│       ├── ui/
│       │   ├── main.qml              ← PlasmoidItem (compact pet + full WebEngineView)
│       │   ├── PetSprite.qml         ← componente de animação do pet (AnimatedSprite)
│       │   ├── configGeneral.qml     ← config KConfig (KCM.SimpleKCM) + pasta de pets
│       │   └── pets/                 ← pets embutidos (tux, tater) como fallback
│       ├── config/
│       │   ├── config.qml            ← ConfigModel (aponta páginas em ui/)
│       │   └── main.xml
│       └── images/
├── scripts/
│   ├── install.sh                    ← baixa pet padrão (Tux) + kpackagetool6 -i
│   ├── uninstall.sh
│   └── test.sh                       ← qmllint + opencode serve + plasmoidviewer
└── spec/
    └── opencode-openapi.json         ← spec da API do opencode serve
```

**Pets do usuário** ficam em `~/.local/share/opencode-assistant-kde/pets/` (cada pet = pasta com `pet.json` + `spritesheet.webp`). O install.sh baixa o Tux para lá; a tela de configuração tem um botão que abre essa pasta para o usuário adicionar pets manualmente.

---

## 4. Componentes detalhados

### 4.1 Plasmoid (QML)

**`metadata.json`** — Plasma 6 (JSON, obrigatório `X-Plasma-API-Minimum-Version: 6.0`):
```json
{
  "KPlugin": {
    "Id": "com.opencode.assistant",
    "Name": "OpenCode Assistant",
    "Description": "Chat com IA via opencode CLI",
    "Icon": "applications-internet",
    "Category": "Utilities",
    "Version": "0.1",
    "License": "GPL-2.0+"
  },
  "KPackageStructure": "Plasma/Applet",
  "X-Plasma-API-Minimum-Version": "6.0"
}
```

**`main.qml`** — raiz `PlasmoidItem`:
- `compactRepresentation`: `PetSprite` (pet animado) + dot de status — clicável, aciona `openWeb()` (wave + expand)
- `fullRepresentation`: `WebEngineView` carregando `http://127.0.0.1:<porta>/` (UI web do opencode)
- Spawn do servidor: `Plasma5Support.DataSource` (engine `executable`) com `env -u` para limpar vars do desktop app
- Health check: `curl -w "%{http_code}"` a cada 3 s; estado do pet via `GET /session`
- Pet carregado do data dir (`~/.local/share/opencode-assistant-kde/pets/<id>/`) com fallback pro pacote

**Config KConfig** (básica): porta, hostname, pet selecionado, tamanho do pet, dimensões do popup.

### 4.2 Servidor (`opencode serve`)

O plasmoid spawna `opencode serve --hostname <host> --port <port>` sob demanda (no clique), com ambiente limpo:
```bash
env -u OPENCODE_SERVER_PASSWORD -u OPENCODE_SERVER_USERNAME \
    -u OPENCODE_DISABLE_EMBEDDED_WEB_UI -u OPENCODE_CLIENT -u XDG_STATE_HOME \
    setsid nohup opencode serve --hostname 127.0.0.1 --port 3171 &
```
- **`GET /`** → UI web do opencode (HTML/JS) — carregada no WebEngineView
- **`GET /session`** → lista de sessões (usada para o estado do pet)
- **`GET /session/:id/message`** → mensagens + parts
- **`POST /session`**, **`POST /session/:id/message`**, **`GET /event`** (SSE), **`GET /config`**

### 4.3 UI do chat (UI web do opencode)

A UI do chat é a própria UI web do opencode, servida por `opencode serve` e carregada no `WebEngineView` do popup. Sem backend intermediário, sem CORS.

### 4.4 Configuração (KConfig)

Configuração via KConfig (`main.xml` + `configGeneral.qml`):
- **porta** (Int, padrão 3171)
- **hostname** (String, padrão 127.0.0.1)
- **petId** (String, padrão tux)
- **petSize** (Int, padrão 64)
- **popupWidth** (Int, padrão 760) e **popupHeight** (Int, padrão 600)

**Pets**: a tela de configuração lista os pets da pasta `~/.local/share/opencode-assistant-kde/pets/` e tem um botão **"Abrir pasta"** que abre essa pasta no gerenciador de arquivos — o usuário adiciona pets manualmente (cada pet = pasta com `pet.json` + `spritesheet.webp`).

**Permissões de pasta**: gerenciadas pelo próprio opencode (via `opencode.json` do projeto ou `OPENCODE_PERMISSION` env var) — o plasmoid não interfere.

**Memórias**: gerenciadas pelo próprio opencode (via `AGENTS.md` do projeto) — o plasmoid não interfere.

---

## 5. Fases de implementação

| Fase   | Escopo                                                                                                | Dependência |
| ------ | ----------------------------------------------------------------------------------------------------- | ----------- |
| **F1** | Esqueleto do plasmoid (metadata.json, main.qml com pet + WebEngineView, instalação via kpackagetool6) | —           |
| **F2** | Pet animado: PetSprite.qml (AnimatedSprite, atlas 8×9) + mapeamento de status                         | F1          |
| **F3** | Servidor: spawn `opencode serve` com env limpo + health check + estado do pet via `/session`          | F1          |
| **F4** | Configuração: KConfig (porta, hostname, pet, tamanho, popup) + pasta de pets                          | F1          |
| **F5** | Integração final: testes no Plasma real, empacotamento `.plasmoid`                                    | F1–F4       |

---

## 6. Verificação e testes

| Nível        | Como                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- |
| QML          | `qmllint package/contents/ui/*.qml`                                                               |
| API opencode | `./scripts/test.sh` — sobe `opencode serve` com env limpo e testa `/`, `/session`, `/config`      |
| Plasmoid     | `plasmoidviewer -a package -l floating -f planar` (desktop) e `-l topedge -f horizontal` (painel) |
| Plasma real  | `kpackagetool6 -i package` + `plasmashell --replace`                                              |
| Pet          | Verificar animações em todos os estados (idle/thinking/streaming/success/error)                   |

---

## 7. Riscos e mitigações

| Risco                                          | Mitigação                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| QtWebEngine sem GPU no plasmashell (sem WebGL) | UI web do opencode em HTML/CSS/JS simples (sem WebGL); canvas 2D funciona                   |
| CORS entre WebEngineView e servidor            | UI servida pelo próprio `opencode serve` (mesmo origin) — sem CORS                          |
| `opencode serve` já em uso por outra instância | Health check detecta servidor ativo na porta e não spawna duplicado                         |
| Vars de ambiente do desktop app                | `env -u` para unset de `OPENCODE_SERVER_PASSWORD`, `OPENCODE_DISABLE_EMBEDDED_WEB_UI`, etc. |
| Pets da comunidade com licenças próprias       | Embutir apenas pets com licença permissiva (MIT/Apache); documentar origem                  |
| Servidor morto após suspensão                  | Plasmoid monitora health e respawna o servidor                                              |

---

## 8. Fontes da pesquisa

- Plasmoid Plasma 6: develop.kde.org/docs/plasma/widget/ (setup, properties, configuration, testing)
- Exemplo real: github.com/samirgaire10/com.samirgaire10.chatgpt-plasma6
- opencode server/API: opencode.ai/docs/server/ · SDK: opencode.ai/docs/sdk/
- opencode CLI: opencode.ai/docs/cli/ · Permissões: opencode.ai/docs/permissions/ · Regras/AGENTS.md: opencode.ai/docs/rules/ · Agentes: opencode.ai/docs/agents/
- Pets: learn.chatgpt.com/docs/pets · github.com/openai/codex (codex-rs/tui/src/pets/) · github.com/alvinunreal/openpets · github.com/FroeMic/codex-pets-web · github.com/backnotprop/codex-pets-react
---

## 9. Distribuição

- **Repositório**: https://github.com/zonaro/opencode-assistant-kde (público, MIT)
- **Instalação via curl**: `curl -fsSL https://raw.githubusercontent.com/zonaro/opencode-assistant-kde/main/scripts/install.sh | bash`
  - Instala o opencode CLI (via `https://opencode.ai/install`) se ausente
  - Baixa as fontes do tarball da branch `main`
  - Baixa o pet padrão **Tux** (zip.openpets.dev) para `~/.local/share/opencode-assistant-kde/pets/`
  - Instala o plasmoid via `kpackagetool6` e reinicia `plasmashell`
- **Site /docs (GitHub Pages)**: https://zonaro.github.io/opencode-assistant-kde/ — i18n PT/EN/ES (detecção automática de idioma + `/pt/`, `/en/`, `/es/`)
