'use strict'

const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')

const PETS_DIR = path.join(__dirname, '..', 'webui', 'pets')
const ZIP_BASE = process.env.OPENPETS_ZIP_BASE || 'https://zip.openpets.dev/pets'

// Known pets: exact source URLs (zip layout may vary per pet).
const PET_SOURCES = {
  tux: `${ZIP_BASE}/tux-de2f300f/tux.zip`,
  'ember-pup': `${ZIP_BASE}/ember-pup-openpets/ember-pup.zip`,
}

function all() {
  const out = []
  let entries = []
  try { entries = fs.readdirSync(PETS_DIR, { withFileTypes: true }) } catch (_) { return out }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const petDir = path.join(PETS_DIR, e.name)
    const jsonPath = path.join(petDir, 'pet.json')
    if (!fs.existsSync(jsonPath)) continue
    try {
      const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
      out.push({
        id: e.name,
        title: meta.displayName || meta.title || e.name,
        description: meta.description || meta.category || '',
        category: meta.category || '',
        spritesheetPath: meta.spritesheetPath || 'spritesheet.webp',
      })
    } catch (_) { /* skip corrupt */ }
  }
  return out
}

function find(id) {
  return all().find(p => p.id === id)
}

// Standard OpenPets zip URL patterns tried in order
function zipCandidates(id) {
  const custom = PET_SOURCES[id]
  const std = [
    `${ZIP_BASE}/${id}-openpets/${id}.zip`,
    `${ZIP_BASE}/${id}/${id}.zip`,
  ]
  return custom ? [custom, ...std] : std
}

function download(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    lib.get(url, { headers: { 'User-Agent': 'opencode-assistant-kde' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) {
        const loc = res.headers.location
        res.resume()
        if (!loc) return reject(new Error(`redirect sem destino (${res.statusCode})`))
        return download(new URL(loc, url).toString()).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} para ${url}`))
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function unzipBuffer(buf) {
  // minimal zip reader: local file headers only (no external deps)
  const files = []
  let i = 0
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  while (i + 30 <= buf.length) {
    const sig = view.getUint32(i, true)
    if (sig !== 0x04034b50) break
    const method = view.getUint16(i + 8, true)
    const compSize = view.getUint32(i + 18, true)
    const uncompSize = view.getUint32(i + 22, true)
    const nameLen = view.getUint16(i + 26, true)
    const extraLen = view.getUint16(i + 28, true)
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8')
    const dataStart = i + 30 + nameLen + extraLen
    let data = null
    if (method === 0) {
      data = buf.slice(dataStart, dataStart + uncompSize)
    } else if (method === 8) {
      try {
        data = require('zlib').inflateRawSync(buf.slice(dataStart, dataStart + compSize))
      } catch (e) {
        data = null
      }
    }
    files.push({ name, data })
    i = dataStart + compSize
    if (method === 8 && i >= buf.length) break
  }
  return files
}

let downloadInProgress = new Map()

async function ensurePet(id) {
  const existing = find(id)
  if (existing) return existing

  const target = path.join(PETS_DIR, id)
  fs.mkdirSync(target, { recursive: true })
  const info = `${target}/.download.json`

  if (!downloadInProgress.has(id)) {
    downloadInProgress.set(id, (async () => {
      let buf = null
      let lastErr = null
      for (const url of zipCandidates(id)) {
        try {
          buf = await download(url)
          lastErr = null
          break
        } catch (e) {
          lastErr = e
        }
      }
      if (!buf) {
        throw lastErr || new Error(`não foi possível baixar o pet ${id}`)
      }
      const files = await unzipBuffer(buf)
      let found = false
      for (const f of files) {
        if (f.name.endsWith('/')) continue  // directory entry
        if (f.data === null) continue
        const safe = path.basename(f.name)
        fs.writeFileSync(path.join(target, safe), f.data)
        if (safe.endsWith('.webp') || safe.endsWith('.png') || safe.endsWith('.gif')) found = true
      }
      fs.writeFileSync(info, JSON.stringify({ source: zipCandidates(id), downloaded: Date.now() }), 'utf8')
      return find(id)
    })())
    downloadInProgress.get(id).catch(() => {}).finally(() => downloadInProgress.delete(id))
  }
  return downloadInProgress.get(id)
}

module.exports = { all, find, ensurePet, PETS_DIR }