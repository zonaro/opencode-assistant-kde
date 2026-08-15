'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const DATA_DIR = process.env.OPENCODE_ASSISTANT_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'opencode-assistant-kde')
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const PET_STATE_PATH = path.join(DATA_DIR, 'pet-state.json')

function dirOf() { return DATA_DIR }

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function defaults() {
  return {
    assistant: { name: 'Tux', personality: '' },
    user: { name: '', context: '' },
    folders: [],
    memories: [],
    pet: { id: 'tux', size: 120, position: 'bottom-right' },
    secondaryAgent: { enabled: true, agent: 'build' },
  }
}

function loadConfig() {
  ensureDir()
  let cfg = defaults()
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      cfg = deepMerge(cfg, raw)
    }
  } catch (err) {
    console.error('[config] erro ao ler config.json:', err.message)
  }
  return cfg
}

function saveConfig(cfg) {
  ensureDir()
  const merged = deepMerge(defaults(), cfg)
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

function loadPetState() {
  try {
    if (fs.existsSync(PET_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(PET_STATE_PATH, 'utf8'))
    }
  } catch (_) { /* ignore */ }
  return { animation: 'idle' }
}

function savePetState(state) {
  ensureDir()
  const s = state && typeof state === 'object' ? state : { animation: 'idle' }
  fs.writeFileSync(PET_STATE_PATH, JSON.stringify(s, null, 2), 'utf8')
  return s
}

function systemPromptFromConfig(cfg) {
  const lines = []
  const a = cfg.assistant || {}
  const u = cfg.user || {}
  if (a.name) lines.push(`Você é ${a.name}, assistente de IA integrado ao desktop KDE Plasma.`)
  if (a.personality) lines.push(`Personalidade: ${a.personality}`)
  if (u.name || u.context) {
    const up = []
    if (u.name) up.push(`nome: ${u.name}`)
    if (u.context) up.push(`contexto: ${u.context}`)
    if (up.length) lines.push(`Sobre o usuário: ${up.join('; ')}.`)
  }
  const mems = cfg.memories || []
  if (mems.length) {
    lines.push('Memórias do usuário (use-as quando relevante):')
    mems.forEach(m => lines.push(`- ${m.text}`))
  }
  const folders = (cfg.folders || []).filter(f => f && f.enabled)
  if (folders.length) {
    lines.push('Pastas que o usuário autorizou a trabalhar:')
    folders.forEach(f => lines.push(`- ${f.path} (permissão: ${f.permission})`))
  }
  return lines.join('\n')
}

function deepMerge(base, extra) {
  if (extra === null || typeof extra !== 'object') return extra === undefined ? base : extra
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const k of Object.keys(extra)) {
    const bv = base ? base[k] : undefined
    const ev = extra[k]
    if (typeof ev === 'object' && ev !== null && !Array.isArray(ev) && typeof bv === 'object' && bv !== null && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, ev)
    } else {
      out[k] = ev
    }
  }
  return out
}

module.exports = { loadConfig, saveConfig, loadPetState, savePetState, systemPromptFromConfig, dirOf }