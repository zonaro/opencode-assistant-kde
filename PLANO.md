# Plano — Widget de Chat IA para KDE (opencode-assistant-KDE)

Widget (Plasmoid) para KDE Plasma 6 que conversa com IA usando o **opencode CLI** instalado no computador, com pet animado, múltiplas conversas, anexos e tela de configuração completa.

> Data: 15/08/2026 · Ambiente verificado: Plasma 6.7.4, Qt 6.11.1, kpackagetool6 2.0, opencode 1.18.18, Node v24.19.0, Python 3.14.6, QtWebEngine ✓, QtWebSockets ✓
>
> **Pet padrão**: Ember (`ember-pup`) — baixado sob demanda na instalação de `https://zip.openpets.dev/pets/ember-pup-openpets/ember-pup.zip`. **Nome padrão do assistente**: Ember.

---

## 1. Visão geral

| Recurso | Descrição |
|---|---|
| **Forma** | Plasmoid Plasma 6 (QML) — funciona na área de trabalho E como popup na barra de tarefas |
| **Backend IA** | opencode CLI (instalado em `~/.opencode/bin/opencode`) via servidor headless `opencode serve` |
| **UI do chat** | WebView (QtWebEngine) com UI clássica de conversas |
| **Pet** | Formato Codex Pets / OpenPets (`pet.json` + `spritesheet.webp`, atlas 8×9) |
| **Configuração** | Tela própria no widget + arquivo JSON de configuração |
| **Avatar** | Imagem quadrada do usuário usada como ícone do widget |

---

## 2. Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                     KDE Plasma 6 (plasmashell)                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Plasmoid (QML)                                          │  │
│  │  ├─ compactRepresentation → avatar (ícone do widget)     │  │
│  │  └─ fullRepresentation → WebEngineView (UI do chat)      │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ spawn (QProcess)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Node.js (processo de longa duração, porta local)      │
│  ├─ Sobe/gerencia `opencode serve` (porta 4096)                │
│  ├─ Serve a UI web (chat) em http://127.0.0.1:<porta>/          │
│  ├─ Proxy REST + SSE para o opencode (evita CORS)              │
│  ├─ Gerencia configuração (pastas, personalidade, memórias)    │
│  └─ Gerencia pets (estado → animação)                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP (REST + SSE)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  opencode serve (headless)                                      │
│  ├─ POST /session → criar conversa                              │
│  ├─ POST /session/:id/message → enviar mensagem                 │
│  ├─ GET /event (SSE) → eventos em tempo real                    │
│  ├─ POST /session/:id/permissions/:id → responder permissões    │
│  └─ DELETE /session/:id → excluir conversa                      │
└─────────────────────────────────────────────────────────────────┘
```

### Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| Transporte com opencode | **`opencode serve` + API REST/SSE** | API oficial documentada, suporta múltiplas sessões, eventos em tempo real, responder permissões. `opencode run` é one-shot (sem streaming contínuo); ACP é mais complexo e sem necessidade |
| Backend | **Node.js** (sem dependências externas, só `node:http`) | Node 24 presente; evita `node_modules`; SSE nativo via `fetch`/`http` |
| UI do chat | **HTML/JS puro servido pelo backend** | WebEngineView carrega `http://127.0.0.1:<porta>/` — sem CORS, sem `file://` restrictions |
| Config do plasmoid | KConfig (main.xml) só para itens simples + **JSON próprio** para o resto | Permissões por pasta, personalidade e memórias são estruturas complexas demais para KConfig |
| Pet | Formato Codex (atlas 8×9, células 192×208) | Formato de facto (OpenAI + OpenPets + comunidade); centenas de pets prontos |

---

## 3. Estrutura de arquivos do projeto

```
/mnt/GIT/opencode-assistant-KDE/
├── PLANO.md                          ← este arquivo
├── package/                          ← pacote do plasmoid (instalável)
│   ├── metadata.json
│   └── contents/
│       ├── ui/
│       │   ├── main.qml              ← PlasmoidItem (compact + full)
│       │   └── configGeneral.qml     ← config KConfig (KCM.SimpleKCM)
│       ├── config/
│       │   ├── config.qml            ← ConfigModel (aponta páginas em ui/)
│       │   └── main.xml
│       └── images/                   ← avatar padrão
├── backend/
│   ├── index.js                       ← backend Node (porta, proxy, config)
│   ├── opencode.js                   ← cliente da API do opencode serve
│   ├── config.js                     ← leitura/escrita de configuração
│   ├── pets.js                       ← pets embutidos + download on-demand (OpenPets)
│   └── package.json
├── webui/                            ← UI do chat (servida pelo backend)
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js                    ← estado da UI, navegação
│   │   ├── chat.js                   ← conversa, streaming SSE
│   │   ├── sessions.js               ← lista/cria/exclui conversas
│   │   ├── settings.js               ← tela de configuração
│   │   ├── pet.js                    ← renderizador do pet (atlas)
│   │   └── api.js                    ← cliente HTTP do backend
│   └── pets/                         ← pets embutidos (Tater fallback) + baixados sob demanda
├── config/
│   └── assistant.json                ← configuração do usuário (gerada)
└── scripts/
    ├── install.sh                    ← baixa pet padrão (Ember) + kpackagetool6 -i
    ├── uninstall.sh
    └── test.sh                       ← plasmoidviewer / testes backend
```

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
- `compactRepresentation`: avatar (imagem quadrada do usuário) — clicável, alterna `root.expanded`
- `fullRepresentation`: `WebEngineView` carregando `http://127.0.0.1:<porta>/`
- `Component.onCompleted`: spawna o backend Node via `Plasma5Support.DataSource` (engine `executable`) ou `QtProcess`; `Component.onDestruction`: encerra o backend
- Tamanho do popup via `Layout.preferredWidth/Height`

**Config KConfig** (básica): porta do backend, caminho do avatar, pet selecionado.

### 4.2 Backend Node.js (`backend/index.js`)

Responsabilidades:
1. **Gerenciar `opencode serve`**: spawna em porta fixa (4096) se não estiver rodando; mata ao encerrar
2. **Servir UI**: `http://127.0.0.1:<porta>/` → `webui/`
3. **Proxy API**: `/api/*` → opencode (`/session`, `/session/:id/message`, `/event` SSE, permissões, modelos, agentes)
4. **Config**: ler/gravar `config/assistant.json` (pastas, personalidade, memórias, modelo padrão)
5. **Pets**: expor estado do pet (`/api/pet/state`), lista de pets (`/api/pets`) e spawns com download **sob demanda** do pet Ember via `backend/pets.js` (formato OpenPets; Tater embutido como fallback offline)

**`backend/opencode.js`** — cliente:
- `createSession(title)` → `POST /session`
- `listSessions()` → `GET /session`
- `deleteSession(id)` → `DELETE /session/:id`
- `sendMessage(sessionId, parts, model, agent)` → `POST /session/:id/message` (bloqueante) ou `prompt_async`
- `streamEvents(sessionId)` → `GET /event` (SSE) com filtro por sessão
- `listModels()` → `GET /model` ou `opencode models`
- `listAgents()` → `GET /agent`
- `respondPermission(sessionId, permissionId, response)` → `POST /session/:id/permissions/:permissionID`
- `getMessages(sessionId)` → histórico

### 4.3 UI do chat (`webui/`)

**Tela principal** (UI clássica de conversas):
- Sidebar: lista de conversas (título, data) + botão "Nova conversa" + exclusão (com confirmação)
- Header: nome do assistente, seletor de modelo (dropdown), botão de configurações, botão de pet
- Área de mensagens: bolhas do usuário/assistente, streaming em tempo real (SSE), indicador "digitando/pensando"
- Input: campo de texto, botão de anexo (arquivos → `parts` com `type: file`), enviar
- Rodapé/overlay: **pet animado** reagindo ao status

**Tela de configuração** (aba/modal):
- **Pastas**: lista de pastas com permissão por pasta (ler / ler+escrever / negado) → gera `permission` no opencode.json do projeto ou regras `external_directory`/`edit`
- **Assistente**: nome, personalidade (prompt do agente), modelo padrão
- **Usuário**: nome, dados de contexto (idade, profissão, preferências)
- **Memórias**: lista de memórias (ler/editar/excluir) → persistidas em `AGENTS.md` do projeto ou arquivo de memória próprio
- **Pet**: seleção de pet, tamanho, posição

**`js/pet.js`** — renderizador do pet:
- Carrega o spritesheet do pet selecionado via `/api/pets/<id>/spritesheet` (padrão `ember-pup`; baixa sob demanda)
- Atlas: 8 colunas × 9 linhas, células 192×208, 9 animações (idle, running-right, running-left, waving, jumping, failed, waiting, running, review)
- Renderiza via canvas ou CSS `background-position` com `requestAnimationFrame`
- Mapeamento status → animação (padrão OpenPets):
  - `idle` → idle · `thinking` → review · `streaming` → running · `waiting` → waiting · `success` → jumping · `error` → failed
- Respeita `prefers-reduced-motion` (frame estático)

### 4.4 Configuração (`config/assistant.json`)

```json
{
  "assistant": {
    "name": "Assistente",
    "personality": "Você é um assistente amigável...",
    "defaultModel": "opencode/deepseek-v4-flash-free"
  },
  "user": {
    "name": "Usuário",
    "context": "Desenvolvedor, usa Linux..."
  },
  "folders": [
    { "path": "/mnt/GIT", "permission": "read-write" },
    { "path": "/home/user/Documents", "permission": "read" },
    { "path": "/etc", "permission": "deny" }
  ],
  "memories": [
    { "id": "m1", "text": "O usuário prefere TypeScript", "created": 1786749800000 }
  ],
  "pet": { "id": "ember-pup", "size": 120, "position": "bottom-right" },
  "avatar": "/path/to/avatar.png"
}
```

**Como as permissões de pasta chegam ao opencode**: o backend gera/atualiza o `opencode.json` do projeto de trabalho (ou usa `OPENCODE_PERMISSION` env var) com regras:
```json
{
  "permission": {
    "edit": { "*": "deny", "/mnt/GIT/**": "allow" },
    "external_directory": { "/mnt/GIT/**": "allow" }
  }
}
```

**Memórias**: persistidas em `AGENTS.md` do projeto de trabalho (mecanismo oficial de regras do opencode) + arquivo JSON para edição pela UI.

---

## 5. Fases de implementação

| Fase | Escopo | Dependência |
|---|---|---|
| **F1** | Esqueleto do plasmoid (metadata.json, main.qml com avatar + WebEngineView, instalação via kpackagetool6) | — |
| **F2** | Backend Node: spawn `opencode serve`, servir UI, proxy REST/SSE | — |
| **F3** | UI do chat: sessões (listar/criar/excluir), conversa com streaming, seletor de modelo, anexos | F2 |
| **F4** | Pet: renderizador de atlas + pets embutidos + mapeamento de status | F3 |
| **F5** | Configuração: tela de configuração (pastas, personalidade, usuário, memórias) + persistência + aplicação ao opencode | F3 |
| **F6** | Integração final: avatar como ícone, popup na barra, testes no Plasma real, empacotamento `.plasmoid` | F1–F5 |

---

## 6. Verificação e testes

| Nível | Como |
|---|---|
| Backend | `node backend/index.js` + curl nos endpoints (`/api/health`, `/api/sessions`, `/api/pets/<id>/spritesheet`) |
| API opencode | Teste real: criar sessão, enviar mensagem, receber streaming |
| UI | Abrir `http://127.0.0.1:<porta>/` no navegador para iterar rápido |
| Plasmoid | `plasmoidviewer -a package -l floating -f planar` (desktop) e `-l topedge -f horizontal` (painel) |
| Plasma real | `kpackagetool6 -i package` + `plasmashell --replace` |
| Pet | Verificar animações em todos os estados (idle/thinking/streaming/success/error) |

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| QtWebEngine sem GPU no plasmashell (sem WebGL) | UI em HTML/CSS/JS simples (sem WebGL); canvas 2D funciona |
| CORS entre WebEngineView e backend | UI servida pelo próprio backend (mesmo origin) — sem CORS |
| `opencode serve` já em uso por outra instância | Backend detecta porta ocupada e usa porta alternativa; ou reutiliza servidor existente |
| Permissões de pasta não respeitadas | Testar com regras `edit`/`external_directory`; modo `--auto` como fallback configurável |
| Pets da comunidade com licenças próprias | Embutir apenas pets com licença permissiva (MIT/Apache); documentar origem |
| Backend morto após suspensão | Plasmoid monitora health e respawna o backend |

---

## 8. Fontes da pesquisa

- Plasmoid Plasma 6: develop.kde.org/docs/plasma/widget/ (setup, properties, configuration, testing)
- Exemplo real: github.com/samirgaire10/com.samirgaire10.chatgpt-plasma6
- opencode server/API: opencode.ai/docs/server/ · SDK: opencode.ai/docs/sdk/
- opencode CLI: opencode.ai/docs/cli/ · Permissões: opencode.ai/docs/permissions/ · Regras/AGENTS.md: opencode.ai/docs/rules/ · Agentes: opencode.ai/docs/agents/
- Pets: learn.chatgpt.com/docs/pets · github.com/openai/codex (codex-rs/tui/src/pets/) · github.com/alvinunreal/openpets · github.com/FroeMic/codex-pets-web · github.com/backnotprop/codex-pets-react