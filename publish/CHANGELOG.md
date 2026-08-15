# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [0.1.0] — 2026-08-15

Primeira versão pública.

### Adicionado

- Pet animado em pixel art no desktop, com Tux (padrão), Tater e Lobby embutidos
  no pacote.
- O pet reage ao estado da sessão: parado, pensando, respondendo, sucesso, erro.
- Clique no pet abre um painel embutido (QtWebEngine) com a interface web do
  OpenCode, ancorado na cabeça do pet e acompanhando quando ele se move.
- Clique em área vazia faz o pet caminhar até o ponto, com a animação virada pra
  direção certa.
- Arrastar o pet o faz caminhar junto do cursor e parar ao soltar.
- Passar o mouse faz o pet pular.
- Scroll sobre o widget redimensiona o pet, de 32 a 256 px.
- Ponto vermelho e animação de erro enquanto o servidor local estiver offline.
- Painel redimensionável pelo canto inferior direito, com o tamanho lembrado
  entre sessões.
- Suporte a pets no formato OpenPets, com botão nas configurações que abre a
  pasta `~/.local/share/opencode-assistant-kde/pets/`.
- Configurações: porta, hostname, pet, tamanho do pet, FPS da animação e
  dimensões do painel.
- `opencode serve` é iniciado sob demanda com ambiente sanitizado, rodando sem
  autenticação e com a UI web embutida habilitada.
