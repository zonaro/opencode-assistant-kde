# Publicando o OpenCode Assistant na OpenDesktop / Pling

Guia completo, do zero até o widget aparecer no **Obter Novos Widgets** do Plasma.

---

## 0. Antes de tudo: escolha o site certo

`opendesktop.org`, `pling.com` e `store.kde.org` são **o mesmo sistema** (rede OCS
operada pela Pling) — a sua conta funciona nos três. O que muda é a **árvore de
categorias** de cada um.

E é aí que está a pegadinha mais importante:

> O Plasma 6, no diálogo **Adicionar Widgets → Obter Novos Widgets**, consulta
> **apenas** a categoria **`Plasma 6 Applets`**, que existe no **store.kde.org**.

Ou seja:

| Onde você publica | Aparece no navegador da loja | Aparece no "Obter Novos Widgets" do Plasma |
|---|---|---|
| store.kde.org → *Plasma 6 Applets* | sim | **sim** |
| opendesktop.org (categoria genérica) | sim | **não** |

**Recomendação:** cadastre o produto em **https://store.kde.org**, na categoria
**Plasma 6 Applets**. Ele continua visível e pesquisável pela OpenDesktop —
é o mesmo banco de dados — mas só assim ele fica instalável direto pelo Plasma,
que é o caminho por onde praticamente todo mundo vai te achar.

---

## 1. Gere o pacote

```bash
./scripts/build-release.sh
```

O script valida o pacote, gera o `.plasmoid`, **testa a instalação de verdade**
com `kpackagetool6` num diretório descartável, e monta a pasta de publicação:

```
dist/
├── opencode-assistant-0.1.0.plasmoid   ← o arquivo que você envia
└── opendesktop/                        ← a pasta pronta
    ├── opencode-assistant-0.1.0.plasmoid
    ├── store-description.md            ← texto pra colar no formulário
    ├── CHANGELOG.md
    ├── PUBLICANDO.md
    ├── LICENSE
    └── screenshots/
```

Se o script reclamar de alguma coisa, corrija **antes** de subir — ele checa
exatamente o que a loja e o Plasma cobram.

---

## 2. Prepare as screenshots

A loja exige **pelo menos uma**, e é o que mais pesa na hora de alguém decidir
instalar. O ideal são 3–4, em PNG, largura de 1000–1920 px:

1. O pet no desktop (widget sozinho, fundo real).
2. O popup aberto com a UI web do OpenCode carregada.
3. A janela de configurações (porta, pet, tamanho, FPS).
4. Opcional: o pet no painel / os pets alternativos (Tater, Lobby).

Jogue todas em `docs/images/` antes de rodar o build — o script copia
automaticamente pra `dist/opendesktop/screenshots/`.

Pra capturar: `Spectacle` → *Região retangular* → salvar como PNG.

---

## 3. Crie a conta

1. Vá em **https://store.kde.org** e clique em **Register** (ou faça login se já
   tiver conta na opendesktop.org / pling.com — é a mesma).
2. Confirme o e-mail.
3. Em **Settings → Profile**, preencha nome de exibição e avatar. Perfil vazio
   passa impressão de produto abandonado.

---

## 4. Cadastre o produto

**Add Product** (menu do topo) e preencha:

| Campo | O que colocar |
|---|---|
| **Category** | `Plasma 6 Add-Ons` → **`Plasma 6 Applets`** |
| **Title** | `OpenCode Assistant` |
| **Summary** | veja `store-description.md` (linha "Resumo") |
| **Description** | veja `store-description.md` (bloco "Descrição") |
| **Version** | `0.1.0` |
| **License** | `MIT` |
| **Homepage / Source** | `https://github.com/zonaro/opencode-assistant-kde` |
| **Tags** | `plasma6`, `plasmoid`, `applet`, `ai`, `opencode`, `pet`, `widget` |

A descrição aceita formatação básica. Cole a versão em inglês primeiro —
o público da loja é majoritariamente internacional — e deixe o português abaixo.

---

## 5. Envie os arquivos

Na aba **Files**:

1. **Upload** → `dist/opencode-assistant-0.1.0.plasmoid`
2. Marque o arquivo como **Install-file / primary** (é o que o Plasma baixa).
3. Confirme que a extensão ficou `.plasmoid`. Se o navegador renomear pra `.zip`,
   renomeie de volta no formulário — o Plasma decide o que fazer pela extensão.

Na aba **Gallery / Screenshots**: suba as imagens de
`dist/opendesktop/screenshots/`. A primeira vira a capa.

---

## 6. Publique

Clique em **Save / Publish**. O produto entra no ar na hora (não há fila de
revisão). Só reserve alguns minutos: o índice que o Plasma consulta tem cache.

Teste de verdade antes de divulgar:

- Desktop → clique direito → **Adicionar Widgets** → **Obter Novos Widgets** →
  **Baixar Novos Widgets do Plasma** → busque `OpenCode`.
- Instale **por ali**, não pelo `install.sh`, e confirme que o ícone aparece
  certo e que o widget carrega.

---

## 7. O aviso que você não pode esquecer na descrição

Quem instala pela loja recebe **só o `.plasmoid`**. O `scripts/install.sh` não
roda — então nada instala as dependências externas. O widget vai carregar, mas
fica quebrado se faltar:

- **`opencode` CLI** — sem ele o `opencode serve` nunca sobe e o popup fica vazio.
- **QtWebEngine (QML)** — sem ele o popup nem renderiza.
  Arch: `qt6-webengine` · Debian/Ubuntu: `qml6-module-qtwebengine` · Fedora: `qt6-qtwebengine`

Os pets (Tux, Tater, Lobby) **estão embutidos** no pacote, esses não são problema.

O `store-description.md` já traz esse bloco de requisitos no topo — não corte
ele na hora de colar, é a causa número um de review de 1 estrela em plasmoid
que depende de binário externo.

---

## 8. Publicando uma atualização

1. Bump da versão em **dois lugares** — eles têm que bater:
   - `package/metadata.json` → `KPlugin.Version`
   - `publish/CHANGELOG.md` → nova seção no topo
2. `./scripts/build-release.sh`
3. Na loja: abra o produto → **Edit** → aba **Files** → **Add file** com o novo
   `.plasmoid`.
4. **Não apague a versão anterior de imediato** — quem estiver no meio de um
   download quebra. Remova depois de uns dias, se quiser.
5. Atualize o campo **Version** e cole o changelog na descrição.

O Plasma detecta a atualização comparando a versão do arquivo publicado com a
do `metadata.json` instalado. Se você esquecer de bumpar o `metadata.json`,
**ninguém recebe a atualização** — esse é o erro mais comum.

---

## 9. Referência rápida

```bash
# gerar o pacote
./scripts/build-release.sh

# instalar localmente a partir do .plasmoid gerado (simula a loja)
kpackagetool6 --type Plasma/Applet --install dist/opencode-assistant-0.1.0.plasmoid

# atualizar uma instalação existente
kpackagetool6 --type Plasma/Applet --upgrade dist/opencode-assistant-0.1.0.plasmoid

# remover
kpackagetool6 --type Plasma/Applet --remove com.opencode.assistant

# listar o que está instalado
kpackagetool6 --type Plasma/Applet --list
```
