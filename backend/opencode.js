'use strict'

const http = require('http')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const HOSTNAME = process.env.OPENCODE_SERVER_HOSTNAME || '127.0.0.1'
const PORT = parseInt(process.env.OPENCODE_SERVER_PORT || '4096', 10)
const USERNAME = process.env.OPENCODE_SERVER_USERNAME || 'opencode'
const PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || ''
const BIN = process.env.OPENCODE_BIN || path.join(os.homedir(), '.opencode', 'bin', 'opencode')

let child = null
let spawnedByUs = false
let version = null
let booted = false
let bootPromise = Promise.resolve()

function authHeader() {
  if (!PASSWORD) return null
  const token = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')
  return `Basic ${token}`
}

function req(method, urlPath, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' }
    const auth = authHeader()
    if (auth) headers.Authorization = auth
    const u = new URL(urlPath, `http://${HOSTNAME}:${PORT}`)
    const opts = {
      hostname: HOSTNAME,
      port: PORT,
      path: u.pathname + u.search,
      method,
      headers,
      timeout: timeoutMs || 15000,
    }
    const r = http.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const ct = res.headers['content-type'] || ''
        let parsed = null
        if (ct.includes('application/json') && text) {
          try { parsed = JSON.parse(text) } catch (_) { parsed = text }
        } else if (text) {
          parsed = text
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: parsed })
        } else {
          const err = new Error(typeof parsed === 'string' ? parsed : (text || `HTTP ${res.statusCode}`))
          err.status = res.statusCode
          err.body = parsed
          reject(err)
        }
      })
    })
    r.on('timeout', () => r.destroy(new Error('Timeout')))
    r.on('error', (e) => {
      const err = new Error(`opencode inacessível em ${HOSTNAME}:${PORT}: ${e.message}`)
      err.status = 0
      reject(err)
    })
    if (body !== undefined) r.write(JSON.stringify(body))
    r.end()
  })
}

function findBin() {
  if (fs.existsSync(BIN)) return BIN
  return 'opencode'
}

async function readVersion() {
  try {
    const { execFile } = require('child_process')
    version = await new Promise((resolve, reject) => {
      execFile(findBin(), ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) return reject(err)
        resolve(String(stdout).trim().split('\n')[0])
      })
    })
  } catch (_) {
    version = null
  }
  return version
}

async function spawnServer() {
  if (spawnedByUs && child) return true
  const bin = findBin()
  if (PASSWORD && fs.existsSync(bin)) {
    try {
      child = spawn(bin, ['serve', '--hostname', HOSTNAME, '--port', String(PORT)], {
        env: {
          ...process.env,
          OPENCODE_SERVER_USERNAME: USERNAME,
          OPENCODE_SERVER_PASSWORD: PASSWORD,
          ALLOWED_PROJECTS: '*',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      spawnedByUs = true
      child.stdout.on('data', () => {})
      child.stderr.on('data', () => {})
      child.on('exit', (code) => {
        console.error(`[opencode] processo encerrou (código ${code})`)
        child = null
        spawnedByUs = false
      })
      return true
    } catch (err) {
      console.error('[opencode] falha ao spawnar:', err.message)
      return false
    }
  }
  return false
}

async function ensureRunning() {
  if (booted) return
  booted = true
  if (!PASSWORD) {
    console.warn('[opencode] OPENCODE_SERVER_PASSWORD não definida; mode offline')
    return
  }
  bootPromise = (async () => {
    try {
      await req('GET', '/api/health', undefined, 1500)
      return
    } catch (_) { /* not running */ }
    await spawnServer()
    for (let i = 0; i < 40; i++) {
      try {
        const h = await req('GET', '/api/health', undefined, 1000)
        if (h.body && h.body.healthy) return
      } catch (_) { /* retry */ }
      await new Promise(r => setTimeout(r, 250))
    }
    console.warn('[opencode] servidor não ficou pronto a tempo')
  })()
  return bootPromise
}

async function stopServer() {
  if (child && spawnedByUs) {
    child.kill('SIGTERM')
    child = null
    spawnedByUs = false
  }
}

// ---------- API de alto nível ----------

async function health() {
  await ensureRunning()
  try {
    const h = await req('GET', '/api/health', undefined, 3000)
    return { ok: !!(h.body && h.body.healthy), serveRunning: true, healthy: !!(h.body && h.body.healthy) }
  } catch (e) {
    return { ok: false, serveRunning: false, healthy: false, error: e.message }
  }
}

async function getModelList() {
  await ensureRunning()
  const h = await req('GET', '/api/model', undefined, 10000)
  const data = (h.body && h.body.data) || []
  return data.map(m => ({
    id: m.id,
    label: m.name || m.id,
    providerID: m.providerID,
    enabled: m.enabled !== false,
  }))
}

async function getAgentList() {
  await ensureRunning()
  const h = await req('GET', '/agent', undefined, 10000)
  const data = Array.isArray(h.body) ? h.body : (h.body && h.body.data) || []
  return data.map(a => ({
    name: a.name,
    description: a.description || '',
    mode: a.mode || 'subagent',
    hidden: !!a.hidden,
  }))
}

async function listSessions() {
  await ensureRunning()
  const h = await req('GET', '/session', undefined, 10000)
  const raw = Array.isArray(h.body) ? h.body : (h.body && h.body.data) || []
  return raw.map(s => ({
    id: s.id || s.ID,
    title: s.title || 'Sem título',
    time: s.time || { created: Date.now(), updated: Date.now() },
    agent: s.agent || null,
    model: s.model || null,
  }))
}

async function createSession(payload) {
  await ensureRunning()
  const h = await req('POST', '/session', payload || {}, 20000)
  const s = h.body
  return {
    id: s.id || s.ID,
    title: s.title || 'Nova conversa',
    time: s.time || { created: Date.now(), updated: Date.now() },
  }
}

async function deleteSession(id) {
  await ensureRunning()
  await req('DELETE', `/session/${encodeURIComponent(id)}`, undefined, 15000)
  return true
}

async function getMessages(id) {
  await ensureRunning()
  const h = await req('GET', `/session/${encodeURIComponent(id)}/message`, undefined, 15000)
  const raw = Array.isArray(h.body) ? h.body : []
  return raw.map(({ info, parts }) => {
    const role = (info && info.role) || 'assistant'
    const textParts = (parts || [])
      .filter(p => p && p.type === 'text' && typeof p.text === 'string')
      .map(p => p.text)
    const content = textParts.join('')
    return {
      id: info && (info.id || info.ID),
      role,
      content,
      time: info && (info.time || info.created || info.timestamp),
      error: info && info.error,
    }
  })
}

async function sendPrompt(sessionId, { text, parts, model, agent, system }) {
  await ensureRunning()
  const partsArr = []
  if (text) partsArr.push({ type: 'text', text })
  for (const p of parts || []) partsArr.push(p)

  const payload = { parts: partsArr }
  if (model && model.providerID && model.modelID) payload.model = model
  if (agent) payload.agent = agent
  if (system) payload.system = system

  await req('POST', `/session/${encodeURIComponent(sessionId)}/prompt_async`, payload, 15000)
  return true
}

async function abortSession(id) {
  await ensureRunning()
  const h = await req('POST', `/session/${encodeURIComponent(id)}/abort`, undefined, 10000)
  return !!(h.body === true || (h.body && h.body === true))
}

async function replyPermission(requestID, reply, message) {
  await ensureRunning()
  const body = { reply }
  if (message) body.message = message
  await req('POST', `/permission/${encodeURIComponent(requestID)}/reply`, body, 10000)
  return true
}

// ---------- SSE (fan-out) ----------

function connect() {
  const watchers = new Set()
  let alive = true
  let attempt = 0
  let currentReq = null

  const connectOnce = () => {
    if (!alive) return
    const headers = {}
    const auth = authHeader()
    if (auth) headers.Authorization = auth
    const r = http.request({ hostname: HOSTNAME, port: PORT, path: '/event', method: 'GET', headers })
    currentReq = r
    r.on('response', (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        scheduleReconnect()
        return
      }
      attempt = 0
      let buf = ''
      res.on('data', (chunk) => {
        buf += chunk.toString('utf8')
        const frames = buf.split('\n\n')
        buf = frames.pop()
        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue
            const d = line.slice(5).trimStart()
            try {
              const ev = JSON.parse(d)
              for (const w of watchers) w(ev)
            } catch (_) { /* ignore */ }
          }
        }
      })
      res.on('close', () => scheduleReconnect())
      res.on('error', () => scheduleReconnect())
    })
    r.on('error', () => scheduleReconnect())
    r.end()
  }

  const scheduleReconnect = () => {
    if (!alive) return
    attempt++
    if (attempt > 500) return
    setTimeout(connectOnce, Math.min(500 * attempt, 8000))
  }

  connectOnce()

  return {
    subscribe(fn) {
      watchers.add(fn)
      return () => watchers.delete(fn)
    },
    close() {
      alive = false
      if (currentReq) currentReq.destroy()
      watchers.clear()
    },
  }
}

module.exports = {
  ensureRunning,
  stopServer,
  health,
  getModelList,
  getAgentList,
  listSessions,
  createSession,
  deleteSession,
  getMessages,
  sendPrompt,
  abortSession,
  replyPermission,
  connect,
  readVersion,
}