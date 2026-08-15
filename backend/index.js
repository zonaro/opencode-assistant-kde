'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')

const configStore = require('./config')
const pets = require('./pets')
const oc = require('./opencode')

const PORT = parseInt(process.env.PORT || '3171', 10)
const ROOT = path.join(__dirname, '..')
const WEBUI_DIR = path.join(ROOT, 'webui')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown',
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function sendError(res, code, message) {
  sendJson(res, code, { error: message })
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (maxBytes && size > maxBytes) {
        reject(new Error('payload muito grande'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const buf = Buffer.concat(chunks)
      if (!buf.length) return resolve({})
      try { resolve(JSON.parse(buf.toString('utf8'))) }
      catch (e) { reject(new Error('JSON inválido')) }
    })
    req.on('error', reject)
  })
}

function staticFile(req, res, urlPath) {
  if (urlPath.startsWith('/')) urlPath = urlPath.slice(1)
  let filePath = path.normalize(path.join(WEBUI_DIR, urlPath))
  if (!filePath.startsWith(WEBUI_DIR)) {
    return sendError(res, 403, 'Proibido')
  }
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (urlPath === '' || urlPath.endsWith('/')) {
        filePath = path.join(WEBUI_DIR, 'index.html')
      } else {
        return sendError(res, 404, 'Não encontrado')
      }
    }
    const ext = path.extname(filePath).toLowerCase()
    const data = fs.readFileSync(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    })
    res.end(data)
  } catch (e) {
    sendError(res, 500, 'Erro ao ler arquivo: ' + e.message)
  }
}

function jsonRoute(req, res, method, urlPath, query) {
  // /api/health
  if (method === 'GET' && urlPath === '/api/health') {
    oc.health().then(h => {
      sendJson(res, 200, { ok: h.ok, opencode: { version: null, serveRunning: h.serveRunning }, healthy: h.ok })
    }).catch(() => sendJson(res, 200, { ok: false, opencode: { version: null, serveRunning: false } }))
    return true
  }

  // /api/config
  if (urlPath === '/api/config') {
    if (method === 'GET') {
      sendJson(res, 200, configStore.loadConfig())
      return true
    }
    if (method === 'POST') {
      readBody(req).then(body => {
        const saved = configStore.saveConfig(body)
        sendJson(res, 200, saved)
      }).catch(e => sendError(res, 400, e.message))
      return true
    }
  }

  // /api/models
  if (method === 'GET' && urlPath === '/api/models') {
    oc.getModelList()
      .then(models => sendJson(res, 200, models))
      .catch(e => sendJson(res, 200, []))
    return true
  }

  // /api/agents
  if (method === 'GET' && urlPath === '/api/agents') {
    oc.getAgentList()
      .then(agents => sendJson(res, 200, agents))
      .catch(e => sendJson(res, 200, []))
    return true
  }

  // /api/sessions
  if (urlPath === '/api/sessions') {
    if (method === 'GET') {
      oc.listSessions()
        .then(list => sendJson(res, 200, list))
        .catch(e => sendError(res, 502, 'Falha ao listar sessões: ' + e.message))
      return true
    }
    if (method === 'POST') {
      readBody(req).then(body => {
        const cfg = configStore.loadConfig()
        const payload = {}
        if (body && body.title) payload.title = body.title
        if (cfg.secondaryAgent && cfg.secondaryAgent.enabled && cfg.secondaryAgent.agent) {
          payload.agent = cfg.secondaryAgent.agent
        }
        oc.createSession(payload)
          .then(s => sendJson(res, 200, s))
          .catch(e => sendError(res, 502, 'Falha ao criar sessão: ' + e.message))
      }).catch(e => sendError(res, 400, e.message))
      return true
    }
  }

  const m = urlPath.match(/^\/api\/sessions\/([^/]+)(?:\/(.*))?$/)
  if (m) {
    const sessionId = decodeURIComponent(m[1])
    const rest = m[2] || ''

    if ((method === 'DELETE') && rest === '') {
      oc.deleteSession(sessionId)
        .then(() => sendJson(res, 200, true))
        .catch(e => sendError(res, 502, e.message))
      return true
    }

    if ((method === 'GET') && rest === 'messages') {
      oc.getMessages(sessionId)
        .then(msgs => sendJson(res, 200, msgs))
        .catch(e => sendError(res, 502, 'Falha ao carregar mensagens: ' + e.message))
      return true
    }

    if ((method === 'POST') && rest === 'messages') {
      readBody(req).then(async body => {
        const cfg = configStore.loadConfig()
        const modelID = body && body.model
        let model = null
        if (modelID) {
          const models = await oc.getModelList().catch(() => [])
          const mm = models.find(x => x.id === modelID)
          if (mm && mm.providerID) model = { providerID: mm.providerID, modelID: mm.id }
        }
        const system = configStore.systemPromptFromConfig(cfg)
        await oc.sendPrompt(sessionId, {
          text: (body && body.text) || '',
          parts: buildFileParts(body && body.files, res),
          model,
          agent: cfg.secondaryAgent && cfg.secondaryAgent.enabled ? cfg.secondaryAgent.agent : undefined,
          system,
        })
        sendJson(res, 200, { messageID: null })
      }).catch(e => sendError(res, 400, e.message))
      return true
    }

    if ((method === 'POST') && rest === 'abort') {
      oc.abortSession(sessionId)
        .then(() => sendJson(res, 200, true))
        .catch(e => sendError(res, 502, e.message))
      return true
    }

    const pm = rest.match(/^permissions\/([^/]+)\/reply$/)
    if (pm && method === 'POST') {
      readBody(req).then(body => {
        const reply = body.reply
        if (reply !== 'once' && reply !== 'always' && reply !== 'reject') {
          return sendError(res, 400, 'reply deve ser once|always|reject')
        }
        oc.replyPermission(decodeURIComponent(pm[1]), reply, body.message)
          .then(() => sendJson(res, 200, true))
          .catch(e => sendError(res, 502, e.message))
      }).catch(e => sendError(res, 400, e.message))
      return true
    }
  }

  // /api/pets
  if (method === 'GET' && urlPath === '/api/pets') {
    sendJson(res, 200, pets.all())
    return true
  }

  const pm2 = urlPath.match(/^\/api\/pets\/([^/]+)\/spritesheet$/)
  if (pm2 && method === 'GET') {
    const petId = decodeURIComponent(pm2[1])
    pets.ensurePet(petId)
      .then((meta) => {
        if (!meta) return sendError(res, 404, 'Pet não encontrado')
        const file = path.join(pets.PETS_DIR, petId, meta.spritesheetPath || 'spritesheet.webp')
        try {
          const data = fs.readFileSync(file)
          res.writeHead(200, {
            'Content-Type': 'image/webp',
            'Content-Length': data.length,
            'Cache-Control': 'public, max-age=3600',
          })
          res.end(data)
        } catch (e) {
          sendError(res, 404, 'Spritesheet não encontrado')
        }
      })
      .catch((e) => sendError(res, 502, 'Falha ao obter pet: ' + e.message))
    return true
  }

  const pmMeta = urlPath.match(/^\/api\/pets\/([^/]+)$/)
  if (pmMeta && method === 'GET') {
    const petId = decodeURIComponent(pmMeta[1])
    pets.ensurePet(petId)
      .then((meta) => (meta ? sendJson(res, 200, meta) : sendError(res, 404, 'Pet não encontrado')))
      .catch((e) => sendError(res, 502, 'Falha ao obter pet: ' + e.message))
    return true
  }

  // /api/pet/state
  if (urlPath === '/api/pet/state') {
    if (method === 'GET') {
      sendJson(res, 200, configStore.loadPetState())
      return true
    }
    if (method === 'POST') {
      readBody(req).then(body => {
        sendJson(res, 200, configStore.savePetState(body))
      }).catch(e => sendError(res, 400, e.message))
      return true
    }
  }

  return false
}

function buildFileParts(files, res) {
  if (!Array.isArray(files) || !files.length) return []
  return files.map(f => ({
    type: 'file',
    mime: f.mediaType || 'application/octet-stream',
    filename: f.name || 'attachment',
    data: f.dataBase64 || '',
  }))
}

// Normalizes opencode SSE events ({type, properties}) into flat events the webui expects
function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const { id, type, properties } = raw
  const p = (properties && typeof properties === 'object') ? properties : {}
  const sessionID = p.sessionID || p.session_id || null
  const out = { id, type, sessionID }

  switch (type) {
    case 'message.part.updated': {
      const part = p.part || {}
      out.part = part
      out.partType = part.type
      out.partID = part.id
      out.messageID = part.messageID
      out.sessionID = part.sessionID || sessionID
      out.text = typeof part.text === 'string' ? part.text : undefined
      out.state = p.state
      break
    }
    case 'message.part.delta': {
      out.partType = p.field === 'text' ? 'text' : p.field
      out.partID = p.partID
      out.messageID = p.messageID
      out.delta = p.delta
      break
    }
    case 'message.updated': {
      out.sessionID = p.sessionID || sessionID
      out.message = p.info || p.message || null
      break
    }
    case 'message.removed':
    case 'message.part.removed': {
      out.messageID = p.messageID
      out.partID = p.partID
      break
    }
    case 'permission.asked':
    case 'permission.v2.asked': {
      out.requestID = out.permissionID = p.id || p.permissionID
      out.sessionID = p.sessionID || sessionID
      out.action = p.action
      out.resources = p.resources || p.patterns || []
      out.description = p.permission ? `${p.permission}: ${(p.patterns || []).join(', ')}` : `Permissão: ${p.action || 'desconhecida'}`
      out.metadata = p.metadata
      break
    }
    case 'session.status':
    case 'session.idle':
    case 'session.error':
    case 'session.updated': {
      out.sessionID = p.sessionID || sessionID
      out.status = p.status
      out.error = p.error || (p.info && p.info.error)
      break
    }
    case 'step-start':
    case 'step-finish':
    case 'text':
    case 'busy':
    case 'idle': {
      out.sessionID = sessionID
      break
    }
    default: {
      Object.assign(out, p)
    }
  }
  return out
}

// SSE for the UI — multiplexes opencode /event to all connected clients
let sseClients = new Set()
let upstream = null

function ensureUpstream() {
  if (upstream) return
  upstream = oc.connect()
  upstream.subscribe((event) => {
    const frame = JSON.stringify(normalizeEvent(event))
    for (const client of sseClients) {
      try {
        client.res.write('data: ' + frame + '\n\n')
      } catch (_) {
        sseClients.delete(client)
        client.res.end()
      }
    }
  })
  upstream.close = upstream.close.bind(upstream)
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')
  const client = { req, res }
  sseClients.add(client)
  ensureUpstream()

  req.on('close', () => {
    sseClients.delete(client)
  })
  req.on('error', () => {
    sseClients.delete(client)
  })
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const urlPath = decodeURIComponent(u.pathname)
  const method = req.method

  if (urlPath === '/api/events') {
    if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
      return handleSSE(req, res)
    }
    return sendJson(res, 200, { ok: true, clients: sseClients.size })
  }

  if (urlPath.startsWith('/api/')) {
    if (!jsonRoute(req, res, method, urlPath, u.searchParams)) {
      sendError(res, 404, 'Endpoint não encontrado: ' + urlPath)
    }
    return
  }

  staticFile(req, res, urlPath)
})

server.on('error', (e) => {
  console.error('[backend] erro no servidor:', e.message)
})

function shutdown() {
  console.log('[backend] encerrando...')
  oc.stopServer()
  if (upstream) upstream.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[backend] assistente rodando em http://127.0.0.1:${PORT}`)
  oc.readVersion().then(v => {
    if (v) console.log('[backend] opencode versão:', v)
  })
  oc.ensureRunning().catch(e => console.error('[backend] opencode:', e.message))
})

setInterval(() => {
  // keep-alive para os clientes SSE
  for (const client of sseClients) {
    try { client.res.write(': ping\n\n') } catch (_) {}
  }
}, 25000).unref()

module.exports = { server }