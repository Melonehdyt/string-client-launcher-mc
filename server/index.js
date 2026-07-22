import { randomUUID, createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { config } from 'dotenv'; import { fileURLToPath } from 'url'; import { dirname, join, extname } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '.env') })

const PORT = +process.env.PORT || 3001
const DB_PATH = join(__dirname, 'players.json')
const NEWS_PATH = join(__dirname, 'news.json')
const BLOG_PATH = join(__dirname, 'blog.json')
const BANNER_INDEX = join(__dirname, 'media', 'versions', 'index.json')
const VERSIONS_DIR = join(__dirname, 'media', 'versions')
const BLOG_IMAGES_DIR = join(__dirname, 'media', 'blog')
const VERSIONS_PATH = join(__dirname, 'versions.json')
const COSMETICS_PATH = join(__dirname, 'cosmetics.json')
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

function loadDB() {
  if (!existsSync(DB_PATH)) return {}
  try { return JSON.parse(readFileSync(DB_PATH, 'utf8')) } catch { return {} }
}
function saveDB(db) { writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8') }

function loadNews() {
  if (!existsSync(NEWS_PATH)) return []
  try { return JSON.parse(readFileSync(NEWS_PATH, 'utf8')) } catch { return [] }
}
function saveNews(n) { writeFileSync(NEWS_PATH, JSON.stringify(n, null, 2), 'utf8') }

function loadBlog() {
  if (!existsSync(BLOG_PATH)) return []
  try { return JSON.parse(readFileSync(BLOG_PATH, 'utf8')) } catch { return [] }
}
function saveBlog(b) { writeFileSync(BLOG_PATH, JSON.stringify(b, null, 2), 'utf8') }

function loadBannerIndex() {
  if (!existsSync(BANNER_INDEX)) return {}
  try { return JSON.parse(readFileSync(BANNER_INDEX, 'utf8')) } catch { return {} }
}
function saveBannerIndex(idx) {
  if (!existsSync(VERSIONS_DIR)) mkdirSync(VERSIONS_DIR, { recursive: true })
  writeFileSync(BANNER_INDEX, JSON.stringify(idx, null, 2), 'utf8')
}

const DEFAULT_VERSIONS = [
  { id:'1.21.4', label:'1.21.4', sub:'The Garden Awakens', color:'#4ade80' },
  { id:'1.21.3', label:'1.21.3', sub:'Bundles of Bravery', color:'#a78bfa' },
  { id:'1.21.1', label:'1.21.1', sub:'Tricky Trials', color:'#60a5fa' },
  { id:'1.21', label:'1.21', sub:'Tricky Trials', color:'#f59e0b' },
  { id:'1.20.6', label:'1.20.6', sub:'Armored Paws', color:'#f472b6' },
  { id:'1.20.4', label:'1.20.4', sub:'Trails & Tales', color:'#38bdf8' },
  { id:'1.20.1', label:'1.20.1', sub:'Trails & Tales', color:'#c084fc' },
  { id:'1.19.4', label:'1.19.4', sub:'Trails & Tales', color:'#34d399' },
  { id:'1.19.2', label:'1.19.2', sub:'Wild Update', color:'#fb923c' },
  { id:'1.18.2', label:'1.18.2', sub:'Caves & Cliffs', color:'#f472b6' },
  { id:'1.17.1', label:'1.17.1', sub:'Caves & Cliffs', color:'#38bdf8' },
  { id:'1.16.5', label:'1.16.5', sub:'Nether Update', color:'#ef4444' },
  { id:'1.15.2', label:'1.15.2', sub:'Buzzy Bees', color:'#fbbf24' },
  { id:'1.14.4', label:'1.14.4', sub:'Village & Pillage', color:'#f59e0b' },
  { id:'1.13.2', label:'1.13.2', sub:'Update Aquatic', color:'#2dd4bf' },
  { id:'1.12.2', label:'1.12.2', sub:'World of Color', color:'#c084fc' },
  { id:'1.11.2', label:'1.11.2', sub:'Exploration Update', color:'#4ade80' },
  { id:'1.10.2', label:'1.10.2', sub:'Frostburn Update', color:'#60a5fa' },
  { id:'1.9.4', label:'1.9.4', sub:'Combat Update', color:'#f472b6' },
  { id:'1.8.9', label:'1.8.9', sub:'Bountiful Update', color:'#ef4444' },
]
function loadVersions() {
  if (!existsSync(VERSIONS_PATH)) return [...DEFAULT_VERSIONS]
  try { return JSON.parse(readFileSync(VERSIONS_PATH, 'utf8')) } catch { return [...DEFAULT_VERSIONS] }
}
function saveVersions(v) { writeFileSync(VERSIONS_PATH, JSON.stringify(v, null, 2), 'utf8') }

const DEFAULT_COSMETICS = [
  { id:'cape_1', name:'Cape 1', type:'cape', value:'', desc:'First cape slot' },
  { id:'cape_2', name:'Cape 2', type:'cape', value:'', desc:'Second cape slot' },
  { id:'cape_3', name:'Cape 3', type:'cape', value:'', desc:'Third cape slot' },
]
function loadCosmeticsDef() {
  if (!existsSync(COSMETICS_PATH)) return [...DEFAULT_COSMETICS]
  try { return JSON.parse(readFileSync(COSMETICS_PATH, 'utf8')) } catch { return [...DEFAULT_COSMETICS] }
}
function saveCosmeticsDef(c) { writeFileSync(COSMETICS_PATH, JSON.stringify(c, null, 2), 'utf8') }

const db = loadDB()
const news = loadNews()
const blog = loadBlog()
const mutes = new Map() // playerId -> timeout (ms timestamp)
const bans = new Set()   // playerId strings
const rateLimits = new Map() // clientId -> { lastMsg, count, firstMsg, lastText, textCount }
let slowmodeSec = 0 // 0 = disabled
let lockdown = false // when true, only Owner/Admin can chat
const MAX_MSG_LENGTH = 500
const SPAM_INTERVAL = 1200 // ms between messages
const SPAM_WINDOW = 10000  // ms window for counting
const SPAM_MAX_MSGS = 6    // max msgs in window
const SPAM_MUTE_MINUTES = 10

const BOT_TOKEN = process.env.BOT_TOKEN || 'discord-bot-secret-2024'

// Discord OAuth2 admin auth
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || ''
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ''
const ADMIN_GUILD_ID = process.env.ADMIN_DISCORD_GUILD_ID || ''
const ADMIN_ROLE_IDS = (process.env.ADMIN_DISCORD_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
const OWNER_DISCORD_ROLE_IDS = (process.env.OWNER_DISCORD_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
const OAUTH_REDIRECT = `${process.env.API_URL || `http://localhost:${PORT}`}/api/admin/auth/callback`
const adminTokens = new Map()

function makeToken() { return createHash('sha256').update(randomUUID()).digest('hex').slice(0, 32) }

async function verifyDiscordGuild(userId) {
  const mr = await fetch(`https://discord.com/api/guilds/${ADMIN_GUILD_ID}/members/${userId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN || ''}` }
  })
  if (!mr.ok) return null
  const member = await mr.json()
  const roles = member.roles || []
  if (!ADMIN_ROLE_IDS.length) return { username: member.user?.username || 'Admin', guildId: ADMIN_GUILD_ID, roles }
  if (!roles.some(r => ADMIN_ROLE_IDS.includes(r))) return null
  return { username: member.user?.username || 'Admin', guildId: ADMIN_GUILD_ID, roles }
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(data))
}

function body(req) {
  return new Promise(resolve => {
    let data = ''
    req.on('data', c => data += c)
    req.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
  })
}

function requireAdmin(req, res) {
  const auth = req.headers.authorization
  if (!auth) { json(res, 401, { error: 'unauthorized' }); return false }
  const token = auth.replace('Bearer ', '')
  if (!adminTokens.has(token)) { json(res, 401, { error: 'invalid token' }); return false }
  return adminTokens.get(token) || {}
}

// ── HTTP Server ──
const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { json(res, 204, ''); return }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname

  // Register Microsoft auth
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const { username, uuid } = await body(req)
    if (!username) { json(res, 400, { error: 'username required' }); return }
    const existing = Object.values(db).find(p => p.uuid === uuid)
    if (existing) {
      return json(res, 200, { playerId: existing.playerId, username: existing.username, role: existing.role || '', friends: existing.friends || [] })
    }
    const playerId = randomUUID()
    db[playerId] = { playerId, username, uuid, friends: [], cosmetics: {}, role: '', createdAt: new Date().toISOString() }
    saveDB(db)
    return json(res, 200, { playerId, username, role: '', friends: [] })
  }

  // Cosmetics: load (GET) and toggle (PUT) per player
  if (req.method === 'GET' && pathname === '/api/cosmetics') {
    const pid = url.searchParams.get('playerId')
    if (!pid || !db[pid]) return json(res, 400, { error: 'invalid player' })
    const defs = loadCosmeticsDef()
    const playerCos = db[pid].cosmetics || {}
    const merged = defs.map(d => ({ ...d, enabled: playerCos[d.id] === true }))
    return json(res, 200, merged)
  }

  if (req.method === 'PUT' && pathname === '/api/cosmetics') {
    const { playerId, cosmeticId, enabled } = await body(req)
    if (!playerId || !db[playerId]) return json(res, 400, { error: 'invalid player' })
    if (!cosmeticId) return json(res, 400, { error: 'cosmeticId required' })
    if (!db[playerId].cosmetics) db[playerId].cosmetics = {}
    db[playerId].cosmetics[cosmeticId] = !!enabled
    saveDB(db)
    return json(res, 200, { ok: true, cosmetics: db[playerId].cosmetics })
  }

  // Public: list all cosmetics definitions
  if (pathname === '/api/cosmetics-defs') return json(res, 200, loadCosmeticsDef())

  // Friends list (per-player)
  if (req.method === 'GET' && pathname === '/api/friends') {
    const pid = url.searchParams.get('playerId')
    if (!pid || !db[pid]) return json(res, 400, { error: 'invalid player' })
    const player = db[pid]
    const friendList = (player.friends || []).map(fid => {
      const f = db[fid]
      if (!f) return null
      return { id: f.playerId, name: f.username, role: f.role || '', online: wsClients.has(f.playerId), activity: wsClients.has(f.playerId) ? 'Online' : 'Offline' }
    }).filter(Boolean)
    return json(res, 200, friendList)
  }

  // Add friend
  if (req.method === 'POST' && pathname === '/api/friends/add') {
    const { playerId, friendId } = await body(req)
    if (!db[playerId] || !db[friendId]) return json(res, 400, { error: 'invalid player' })
    if (!db[playerId].friends) db[playerId].friends = []
    if (!db[playerId].friends.includes(friendId)) {
      db[playerId].friends.push(friendId)
      saveDB(db)
    }
    return json(res, 200, { ok: true })
  }

  // Remove friend
  if (req.method === 'POST' && pathname === '/api/friends/remove') {
    const { playerId, friendId } = await body(req)
    if (!db[playerId]) return json(res, 400, { error: 'invalid player' })
    db[playerId].friends = (db[playerId].friends || []).filter(f => f !== friendId)
    saveDB(db)
    return json(res, 200, { ok: true })
  }

  // Search players
  if (req.method === 'GET' && pathname === '/api/players/search') {
    const q = (url.searchParams.get('q') || '').toLowerCase()
    const results = Object.values(db).filter(p => p.username.toLowerCase().includes(q)).slice(0, 10)
    return json(res, 200, results.map(p => ({ id: p.playerId, name: p.username, role: p.role || '' })))
  }

  // News: GET public list
  if (req.method === 'GET' && pathname === '/api/news') {
    const sorted = [...news].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20)
    return json(res, 200, sorted)
  }

  // News: POST new entry (Discord bot)
  if (req.method === 'POST' && pathname === '/api/news') {
    const b = await body(req)
    if (b.token !== BOT_TOKEN) return json(res, 403, { error: 'forbidden' })
    const entry = {
      id: randomUUID().slice(0, 8),
      title: b.title || 'Untitled',
      text: b.text || '',
      image: b.image || '',
      tag: b.tag || 'Update',
      link: b.link || '',
      createdAt: new Date().toISOString(),
    }
    news.unshift(entry)
    saveNews(news)
    return json(res, 200, entry)
  }

  // News: DELETE entry (Discord bot)
  if (req.method === 'DELETE' && pathname === '/api/news') {
    const b = await body(req)
    if (b.token !== BOT_TOKEN) return json(res, 403, { error: 'forbidden' })
    const idx = news.findIndex(n => n.id === b.id)
    if (idx === -1) return json(res, 404, { error: 'not found' })
    news.splice(idx, 1)
    saveNews(news)
    return json(res, 200, { ok: true })
  }

  // Version banners index
  if (pathname === '/api/version-banners') {
    const indexFile = join(__dirname, 'media', 'versions', 'index.json')
    if (existsSync(indexFile)) {
      const data = JSON.parse(readFileSync(indexFile, 'utf8'))
      return json(res, 200, data)
    }
    return json(res, 200, {})
  }

  if (pathname === '/api/health') return json(res, 200, { status: 'ok', players: Object.keys(db).length })

  // Public: list all known versions with metadata
  if (pathname === '/api/versions') return json(res, 200, loadVersions())

  // LunarClient-style structured API endpoints
  if (pathname === '/api/launcher/metadata') {
    const versions = loadVersions()
    const announcements = loadNews()
    const cosmetics = loadCosmeticsDef()
    return json(res, 200, {
      version: '2.0.0',
      versions,
      announcements: Array.isArray(announcements) ? announcements.slice(0, 5) : [],
      servers: loadServers(),
      cosmetics: Array.isArray(cosmetics) ? cosmetics : [],
    })
  }
  if (pathname === '/api/launcher/servers') {
    return json(res, 200, loadServers())
  }
  if (pathname === '/api/launcher/status') {
    return json(res, 200, {
      online: true,
      players: Object.keys(db).length,
      version: '2.0.0',
    })
  }
  if (pathname === '/api/launcher/moderation/nsfw' && req.method === 'POST') {
    return json(res, 200, { flagged: false, categories: [] })
  }
  if (pathname === '/api/launcher/moderation/profanity' && req.method === 'POST') {
    return json(res, 200, { flagged: false, categories: [] })
  }
  if (pathname === '/api/index/cosmetics') {
    return json(res, 200, loadCosmeticsDef())
  }
  if (pathname === '/api/user/profile' && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const playerId = url.searchParams.get('playerId')
    if (!playerId) return json(res, 400, { error: 'playerId required' })
    const player = db[playerId]
    if (!player) return json(res, 404, { error: 'Player not found' })
    return json(res, 200, {
      username: player.username || '',
      uuid: player.uuid || '',
      playerId,
      role: player.role || null,
      skin: player.skin || null,
      cape: player.cape || null,
      cosmetics: player.cosmetics || [],
      friends: player.friends || [],
    })
  }
  if (req.method === 'GET' && pathname.startsWith('/api/server/player-info/')) {
    const lookupUuid = pathname.replace('/api/server/player-info/', '')
    const entry = Object.entries(db).find(([, p]) => p.uuid === lookupUuid)
    if (!entry) return json(res, 404, { error: 'Player not found' })
    const [pid, pdata] = entry
    const online = Array.from(wsClients.values()).some(c => c.playerId === pid)
    return json(res, 200, {
      uuid: lookupUuid,
      username: pdata.username || '',
      online,
      role: pdata.role || null,
      hasSubscription: !!pdata.subscription,
    })
  }
  if (pathname === '/api/game/crashReport' && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const report = { id: randomUUID(), ...data, createdAt: new Date().toISOString() }
        const reportsPath = join(__dirname, 'crash-reports.json')
        const reports = existsSync(reportsPath) ? JSON.parse(readFileSync(reportsPath, 'utf8')) : []
        reports.push(report)
        writeFileSync(reportsPath, JSON.stringify(reports, null, 2))
        return json(res, 200, { id: report.id, message: 'Crash report submitted' })
      } catch { return json(res, 400, { error: 'Invalid JSON' }) }
    })
    return
  }

  // Lanyard: get presence for a specific user
  if (pathname.startsWith('/api/lanyard/')) {
    const userId = pathname.replace('/api/lanyard/', '')
    const presPath = join(__dirname, 'presence.json')
    if (!existsSync(presPath)) return json(res, 404, { error: 'no presence data' })
    const all = JSON.parse(readFileSync(presPath, 'utf8'))
    if (!all[userId]) return json(res, 404, { error: 'user not found' })
    return json(res, 200, { data: all[userId] })
  }

  // Lanyard: list all tracked users' presence
  if (pathname === '/api/lanyard') {
    const presPath = join(__dirname, 'presence.json')
    if (!existsSync(presPath)) return json(res, 200, [])
    const all = JSON.parse(readFileSync(presPath, 'utf8'))
    return json(res, 200, Object.values(all).filter(Boolean))
  }

  // ── Admin Auth (Discord OAuth2) ──
  if (pathname === '/api/admin/auth/discord') {
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) return json(res, 500, { error: 'Discord OAuth2 not configured' })
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT,
      response_type: 'code',
      scope: 'identify guilds',
    })
    res.writeHead(302, { Location: `https://discord.com/api/oauth2/authorize?${params}` })
    res.end()
    return
  }

  if (pathname === '/api/admin/auth/callback') {
    const code = url.searchParams.get('code')
    if (!code) return json(res, 400, { error: 'no code' })
    // Exchange code for token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: OAUTH_REDIRECT,
      })
    })
    if (!tokenRes.ok) return json(res, 400, { error: 'failed to exchange code' })
    const tokens = await tokenRes.json()
    // Fetch user info to get their Discord ID
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    })
    if (!userRes.ok) return json(res, 400, { error: 'failed to fetch user' })
    const user = await userRes.json()
    const info = await verifyDiscordGuild(user.id)
    if (!info) return json(res, 403, { error: 'not authorized — you must be in the admin Discord server' })
    const canAssignOwner = !OWNER_DISCORD_ROLE_IDS.length || info.roles.some(r => OWNER_DISCORD_ROLE_IDS.includes(r))
    const token = makeToken()
    adminTokens.set(token, { type: 'discord', discordId: user.id, username: info.username || 'Admin', canAssignOwner })
    // Redirect back to admin panel with token in URL hash
    res.writeHead(302, { Location: `/admin#token=${token}` })
    res.end()
    return
  }

  if (req.method === 'POST' && pathname === '/api/admin/auth/check') {
    const admin = requireAdmin(req, res)
    if (!admin) return
    const isOwner = admin.type === 'password' || admin.canAssignOwner === true
    return json(res, 200, { ok: true, type: admin.type || 'password', discordId: admin.discordId || '', canAssignOwner: isOwner })
  }

  // Admin password fallback (for when Discord OAuth2 isn't configured)
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
    if (!ADMIN_PASSWORD) return json(res, 403, { error: 'password login not configured' })
    const { password } = await body(req)
    if (password !== ADMIN_PASSWORD) return json(res, 403, { error: 'wrong password' })
    const token = makeToken()
    adminTokens.set(token, { type: 'password', discordId: '' })
    return json(res, 200, { token })
  }

  // ── Admin: Banners ──
  if (pathname === '/api/admin/banners') {
    if (!requireAdmin(req, res)) return
    const index = loadBannerIndex()
    // List all versions with current image status
    const list = Object.keys(index).map(v => ({ version: v, image: index[v] }))
    return json(res, 200, list)
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/admin/banners/')) {
    if (!requireAdmin(req, res)) return
    const version = pathname.replace('/api/admin/banners/', '')
    const { image } = await body(req)
    if (!image) return json(res, 400, { error: 'image data required' })
    // image is base64: "data:image/png;base64,..."
    const matches = image.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) return json(res, 400, { error: 'invalid image data' })
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
    const data = Buffer.from(matches[2], 'base64')
    if (!existsSync(VERSIONS_DIR)) mkdirSync(VERSIONS_DIR, { recursive: true })
    const filename = `${version}.${ext}`
    const filepath = join(VERSIONS_DIR, filename)
    writeFileSync(filepath, data)
    const index = loadBannerIndex()
    index[version] = `/media/versions/${filename}`
    saveBannerIndex(index)
    return json(res, 200, { version, image: index[version] })
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/banners/')) {
    if (!requireAdmin(req, res)) return
    const version = pathname.replace('/api/admin/banners/', '')
    const index = loadBannerIndex()
    if (index[version]) {
      const oldPath = join(__dirname, index[version])
      if (existsSync(oldPath)) { try { writeFileSync(oldPath, '') } catch {} }
      delete index[version]
      saveBannerIndex(index)
    }
    return json(res, 200, { ok: true })
  }

  // ── Admin: Versions metadata CRUD ──
  if (req.method === 'GET' && pathname === '/api/admin/versions') {
    if (!requireAdmin(req, res)) return
    return json(res, 200, loadVersions())
  }

  if (req.method === 'POST' && pathname === '/api/admin/versions') {
    if (!requireAdmin(req, res)) return
    const data = await body(req)
    if (!data.id) return json(res, 400, { error: 'id required' })
    const versions = loadVersions()
    if (versions.find(v => v.id === data.id)) return json(res, 409, { error: 'version already exists' })
    const entry = { id: data.id, label: data.label || data.id, sub: data.sub || '', color: data.color || '#60a5fa' }
    versions.push(entry)
    saveVersions(versions)
    return json(res, 200, entry)
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/admin/versions/')) {
    if (!requireAdmin(req, res)) return
    const id = pathname.replace('/api/admin/versions/', '')
    const data = await body(req)
    const versions = loadVersions()
    const idx = versions.findIndex(v => v.id === id)
    if (idx === -1) return json(res, 404, { error: 'version not found' })
    if (data.label !== undefined) versions[idx].label = data.label
    if (data.sub !== undefined) versions[idx].sub = data.sub
    if (data.color !== undefined) versions[idx].color = data.color
    saveVersions(versions)
    return json(res, 200, versions[idx])
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/versions/')) {
    if (!requireAdmin(req, res)) return
    const id = pathname.replace('/api/admin/versions/', '')
    let versions = loadVersions()
    const idx = versions.findIndex(v => v.id === id)
    if (idx === -1) return json(res, 404, { error: 'version not found' })
    versions.splice(idx, 1)
    saveVersions(versions)
    return json(res, 200, { ok: true })
  }

  // ── Admin: Players / Cosmetics ──
  if (req.method === 'GET' && pathname === '/api/admin/players') {
    if (!requireAdmin(req, res)) return
    const q = (url.searchParams.get('q') || '').toLowerCase()
    const list = Object.values(db).map(p => ({
      playerId: p.playerId,
      username: p.username,
      uuid: p.uuid,
      createdAt: p.createdAt,
      cosmetics: p.cosmetics || {},
      role: p.role || '',
      friendsCount: (p.friends || []).length,
      online: wsClients.has(p.playerId),
    }))
    const filtered = q ? list.filter(p => p.username.toLowerCase().includes(q) || (p.uuid || '').toLowerCase().includes(q)) : list
    return json(res, 200, filtered)
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/admin/players/') && pathname.endsWith('/cosmetics')) {
    if (!requireAdmin(req, res)) return
    const playerId = pathname.replace('/api/admin/players/', '').replace('/cosmetics', '')
    if (!db[playerId]) return json(res, 404, { error: 'player not found' })
    const { cosmeticId, enabled } = await body(req)
    if (cosmeticId) {
      if (!db[playerId].cosmetics) db[playerId].cosmetics = {}
      db[playerId].cosmetics[cosmeticId] = !!enabled
    } else {
      const { cosmetics } = await body(req)
      db[playerId].cosmetics = cosmetics || {}
    }
    saveDB(db)
    return json(res, 200, db[playerId].cosmetics)
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/admin/players/') && pathname.endsWith('/role')) {
    const admin = requireAdmin(req, res)
    if (!admin) return
    const playerId = pathname.replace('/api/admin/players/', '').replace('/role', '')
    if (!db[playerId]) return json(res, 404, { error: 'player not found' })
    const { role } = await body(req)
    const validRoles = ['Owner', 'Admin', 'Developer', 'Tester', 'Partner', '']
    if (!validRoles.includes(role)) return json(res, 400, { error: 'invalid role' })
    // Only Owner-level admins can set the Owner role
    if (role === 'Owner') {
      const isOwner = admin.type === 'password' || admin.canAssignOwner === true
      if (!isOwner) {
        return json(res, 403, { error: 'Only designated Owners can grant the Owner role' })
      }
    }
    db[playerId].role = role
    saveDB(db)
    return json(res, 200, { playerId, role })
  }

  // Public: get a player's role
  if (req.method === 'GET' && pathname === '/api/player/role') {
    const pid = url.searchParams.get('playerId')
    if (!pid || !db[pid]) return json(res, 400, { error: 'invalid player' })
    return json(res, 200, { role: db[pid].role || '' })
  }

  // ── Admin: Cosmetics Definitions CRUD ──
  if (req.method === 'GET' && pathname === '/api/admin/cosmetics') {
    if (!requireAdmin(req, res)) return
    return json(res, 200, loadCosmeticsDef())
  }

  if (req.method === 'POST' && pathname === '/api/admin/cosmetics') {
    if (!requireAdmin(req, res)) return
    const d = await body(req)
    if (!d.name) return json(res, 400, { error: 'name required' })
    const defs = loadCosmeticsDef()
    const entry = { id: d.id || `cosm_${Date.now()}`, name: d.name, type: d.type || 'other', value: d.value || '', desc: d.desc || '' }
    defs.push(entry)
    saveCosmeticsDef(defs)
    return json(res, 200, entry)
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/admin/cosmetics/')) {
    if (!requireAdmin(req, res)) return
    const id = pathname.replace('/api/admin/cosmetics/', '')
    const d = await body(req)
    const defs = loadCosmeticsDef()
    const idx = defs.findIndex(c => c.id === id)
    if (idx === -1) return json(res, 404, { error: 'cosmetic not found' })
    if (d.name !== undefined) defs[idx].name = d.name
    if (d.type !== undefined) defs[idx].type = d.type
    if (d.value !== undefined) defs[idx].value = d.value
    if (d.desc !== undefined) defs[idx].desc = d.desc
    saveCosmeticsDef(defs)
    return json(res, 200, defs[idx])
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/cosmetics/')) {
    if (!requireAdmin(req, res)) return
    const id = pathname.replace('/api/admin/cosmetics/', '')
    let defs = loadCosmeticsDef()
    const idx = defs.findIndex(c => c.id === id)
    if (idx === -1) return json(res, 404, { error: 'cosmetic not found' })
    defs.splice(idx, 1)
    saveCosmeticsDef(defs)
    return json(res, 200, { ok: true })
  }

  // ── Admin: Blog ──
  if (req.method === 'GET' && pathname === '/api/admin/blog') {
    if (!requireAdmin(req, res)) return
    const all = loadBlog().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return json(res, 200, all)
  }
  if (req.method === 'POST' && pathname === '/api/admin/blog') {
    if (!requireAdmin(req, res)) return
    const b = await body(req)
    let imageUrl = b.image || ''
    // Handle uploaded image file
    if (b.imageFile && b.imageFile.startsWith('data:image/')) {
      const matches = b.imageFile.match(/^data:image\/(\w+);base64,(.+)$/)
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
        const data = Buffer.from(matches[2], 'base64')
        if (!existsSync(BLOG_IMAGES_DIR)) mkdirSync(BLOG_IMAGES_DIR, { recursive: true })
        const filename = `blog_${Date.now()}.${ext}`
        writeFileSync(join(BLOG_IMAGES_DIR, filename), data)
        imageUrl = `/media/blog/${filename}`
      }
    }
    const entry = {
      id: randomUUID().slice(0, 8),
      title: b.title || 'Untitled',
      content: b.content || '',
      excerpt: b.excerpt || '',
      image: imageUrl,
      tags: b.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const all = loadBlog()
    all.unshift(entry)
    saveBlog(all)
    return json(res, 200, entry)
  }
  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/blog/')) {
    if (!requireAdmin(req, res)) return
    const id = pathname.replace('/api/admin/blog/', '')
    const all = loadBlog()
    const idx = all.findIndex(e => e.id === id)
    if (idx === -1) return json(res, 404, { error: 'not found' })
    // Clean up associated image file
    const img = all[idx].image
    if (img && img.startsWith('/media/blog/')) {
      const imgPath = join(__dirname, img)
      if (existsSync(imgPath)) { try { writeFileSync(imgPath, '') } catch {} }
    }
    all.splice(idx, 1)
    saveBlog(all)
    return json(res, 200, { ok: true })
  }

  // Public blog list (for launcher/website)
  if (req.method === 'GET' && pathname === '/api/blog') {
    const all = loadBlog().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20)
    return json(res, 200, all)
  }

  // ── Admin: News ──
  if (req.method === 'GET' && pathname === '/api/admin/news') {
    if (!requireAdmin(req, res)) return
    const all = loadNews().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return json(res, 200, all)
  }
  if (req.method === 'POST' && pathname === '/api/admin/news') {
    if (!requireAdmin(req, res)) return
    const b = await body(req)
    const entry = {
      id: randomUUID().slice(0, 8),
      title: b.title || 'Untitled',
      text: b.text || '',
      image: b.image || '',
      tag: b.tag || 'Update',
      link: b.link || '',
      createdAt: new Date().toISOString(),
    }
    const all = loadNews()
    all.unshift(entry)
    saveNews(all)
    return json(res, 200, entry)
  }
  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/news/')) {
    if (!requireAdmin(req, res)) return
    const id = pathname.replace('/api/admin/news/', '')
    const all = loadNews()
    const idx = all.findIndex(e => e.id === id)
    if (idx === -1) return json(res, 404, { error: 'not found' })
    all.splice(idx, 1)
    saveNews(all)
    return json(res, 200, { ok: true })
  }

  // ── Admin: Dashboard stats ──
  if (pathname === '/api/admin/stats') {
    if (!requireAdmin(req, res)) return
    return json(res, 200, {
      players: Object.keys(db).length,
      news: loadNews().length,
      blog: loadBlog().length,
      banners: Object.keys(loadBannerIndex()).length,
      online: Array.from(wsClients.values()).filter(c => c.username && c.username !== 'Guest').length,
    })
  }

  // Serve admin panel
  if (pathname === '/admin') {
    const file = join(__dirname, 'admin', 'index.html')
    if (!existsSync(file)) { json(res, 404, { error: 'admin panel not found' }); return }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    const { createReadStream: rs } = await import('fs')
    rs(file).pipe(res)
    return
  }

  if (pathname === '/' || pathname === '/index.html') {
    const file = join(__dirname, 'public', 'index.html')
    if (!existsSync(file)) { json(res, 404, { error: 'not found' }); return }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    const { createReadStream: rs } = await import('fs')
    rs(file).pipe(res)
    return
  }

  if (pathname.startsWith('/logo.png')) {
    const file = join(__dirname, 'public', 'logo.png')
    if (!existsSync(file)) { json(res, 404, { error: 'not found' }); return }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' })
    const { createReadStream: rs } = await import('fs')
    rs(file).pipe(res)
    return
  }

  if (pathname.startsWith('/media/')) {
    const file = join(__dirname, '.' + pathname)
    if (!existsSync(file) || !statSync(file).isFile()) { json(res, 404, { error: 'not found' }); return }
    const stat = statSync(file)
    const types = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.mp3': 'audio/mpeg' }
    const contentType = types[extname(file)] || 'application/octet-stream'
    const range = req.headers.range
    if (range && stat.size > 0) {
      const parts = range.replace(/bytes=/, "").split("-")
      const s = parseInt(parts[0], 10)
      const e = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
      const chunk = e - s + 1
      const { createReadStream: rs } = await import('fs')
      res.writeHead(206, {
        'Content-Range': `bytes ${s}-${e}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunk,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      })
      rs(file, { start: s, end: e }).pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      })
      const { createReadStream: rs } = await import('fs')
      rs(file).pipe(res)
    }
    return
  }

  json(res, 404, { error: 'not found' })
})

// ── WebSocket Server ──
const wss = new WebSocketServer({ server })
const wsClients = new Map()

wss.on('connection', (ws, req) => {
  const clientId = randomUUID().slice(0, 8)
  wsClients.set(clientId, { ws, username: 'Guest', playerId: null })

  ws.send(JSON.stringify({ type: 'welcome', clientId }))

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString())

      switch (msg.type) {
        case 'identify':
          wsClients.set(clientId, { ws, username: msg.username, playerId: msg.playerId })
          broadcast({ type: 'system', text: `${msg.username} joined` })
          broadcastOnline()
          break

        case 'chat':
          const client = wsClients.get(clientId)
          if (!client) break
          // Check mute
          if (client.playerId && mutes.has(client.playerId)) {
            const until = mutes.get(client.playerId)
            if (until && Date.now() < until) {
              ws.send(JSON.stringify({ type: 'system', text: `You are muted for ${Math.ceil((until - Date.now()) / 60000)} more minute(s)` }))
              break
            }
            mutes.delete(client.playerId)
          }
          // Check ban
          if (client.playerId && bans.has(client.playerId)) {
            ws.send(JSON.stringify({ type: 'system', text: 'You are banned from global chat' }))
            break
          }
          // Handle commands
          if (msg.text.startsWith('/')) {
            handleCommand(client, msg.text, ws)
            break
          }
          // Lockdown check
          if (lockdown && !isMod(client.playerId)) {
            ws.send(JSON.stringify({ type: 'system', text: 'Chat is locked — only staff can speak' }))
            break
          }
          // Spam / rate-limit check
          if (!isMod(client.playerId)) {
            const text = msg.text || ''
            if (text.length > MAX_MSG_LENGTH) {
              ws.send(JSON.stringify({ type: 'system', text: `Message too long (max ${MAX_MSG_LENGTH} characters)` }))
              break
            }
            const now = Date.now()
            const rl = rateLimits.get(clientId) || { lastMsg: 0, count: 0, firstMsg: now, lastText: '', textCount: 0 }
            // Slowmode
            if (slowmodeSec > 0 && now - rl.lastMsg < slowmodeSec * 1000) {
              ws.send(JSON.stringify({ type: 'system', text: `Chat is in slowmode — wait ${slowmodeSec}s between messages` }))
              break
            }
            // Rate limit: too many messages in window
            if (now - rl.firstMsg > SPAM_WINDOW) {
              rl.firstMsg = now; rl.count = 0
            }
            rl.count++
            if (rl.count > SPAM_MAX_MSGS) {
              if (client.playerId) {
                mutes.set(client.playerId, now + SPAM_MUTE_MINUTES * 60 * 1000)
                broadcast({ type: 'system', text: `${client.username} was auto-muted for spam (${SPAM_MUTE_MINUTES} min)` })
              }
              ws.send(JSON.stringify({ type: 'system', text: `Spam detected — auto-muted for ${SPAM_MUTE_MINUTES} minutes` }))
              break
            }
            // Duplicate message
            if (text.toLowerCase() === rl.lastText.toLowerCase() && text.length > 2) {
              rl.textCount = (rl.textCount || 0) + 1
              if (rl.textCount > 2) {
                ws.send(JSON.stringify({ type: 'system', text: 'Stop spamming the same message' }))
                break
              }
            } else {
              rl.textCount = 0
            }
            rl.lastMsg = now; rl.lastText = text
            rateLimits.set(clientId, rl)
          }
          const playerRole = (client.playerId && db[client.playerId]?.role) || ''
          broadcast({ type: 'chat', id: randomUUID(), username: client.username, role: playerRole, text: msg.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
          break

        case 'chat:delete':
          const deleter = wsClients.get(clientId)
          if (deleter?.playerId && isMod(deleter.playerId) && msg.msgId) {
            broadcast({ type: 'chat:delete', msgId: msg.msgId })
          }
          break

        case 'private-chat':
          const sender = wsClients.get(clientId)
          if (sender && msg.to) {
            const target = Array.from(wsClients.values()).find(c => c.playerId === msg.to)
            if (target) {
              target.ws.send(JSON.stringify({ type: 'private-chat', from: sender.username, fromId: sender.playerId, text: msg.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }))
              ws.send(JSON.stringify({ type: 'private-chat', from: sender.username, fromId: sender.playerId, text: msg.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), sent: true }))
            } else {
              ws.send(JSON.stringify({ type: 'system', text: 'User is offline' }))
            }
          }
          break
      }
    } catch {}
  })

  ws.on('close', () => {
    const client = wsClients.get(clientId)
    if (client?.username && client.username !== 'Guest') {
      broadcast({ type: 'system', text: `${client.username} left` })
    }
    wsClients.delete(clientId)
    broadcastOnline()
  })
})

function findPlayer(username) {
  return Array.from(wsClients.values()).find(c => c.username?.toLowerCase() === username.toLowerCase())
}
function findPlayerId(username) {
  const p = Object.values(db).find(p => p.username?.toLowerCase() === username.toLowerCase())
  return p ? p.playerId : null
}
function sendToPlayer(username, data) {
  const target = findPlayer(username)
  if (target) { try { target.ws.send(JSON.stringify(data)) } catch {} }
}
function getRole(playerId) {
  return (playerId && db[playerId]?.role) || ''
}
function isMod(playerId) {
  const r = getRole(playerId)
  return r === 'Owner' || r === 'Admin'
}

function handleCommand(client, text, ws) {
  const parts = text.slice(1).split(' ').filter(Boolean)
  const cmd = parts[0]?.toLowerCase()
  const targetName = parts[1]
  if (!cmd) { ws.send(JSON.stringify({ type: 'system', text: 'Commands: /mute, /unmute, /kick, /ban, /unban, /warn, /clear, /lock, /slowmode, /say, /list' })); return }
  if (!client.playerId) { ws.send(JSON.stringify({ type: 'system', text: 'You must be logged in' })); return }
  const isStaff = isMod(client.playerId)

  // Commands that don't need a target
  if (cmd === 'clear') {
    if (!isStaff) { ws.send(JSON.stringify({ type: 'system', text: 'No permission' })); return }
    broadcast({ type: 'chat:clear' })
    broadcast({ type: 'system', text: 'Chat was cleared by ' + client.username })
    return
  }
  if (cmd === 'slowmode') {
    if (!isStaff) { ws.send(JSON.stringify({ type: 'system', text: 'No permission' })); return }
    const sec = parseInt(parts[1], 10)
    if (isNaN(sec) || sec < 0) { ws.send(JSON.stringify({ type: 'system', text: 'Usage: /slowmode <seconds>' })); return }
    slowmodeSec = sec
    broadcast({ type: 'system', text: `Slowmode set to ${sec > 0 ? sec + 's' : 'off'} by ${client.username}` })
    return
  }
  if (cmd === 'say') {
    if (!isStaff) { ws.send(JSON.stringify({ type: 'system', text: 'No permission' })); return }
    const announcement = parts.slice(1).join(' ')
    if (announcement) broadcast({ type: 'system', text: '📢 ' + announcement })
    return
  }
  if (cmd === 'lock') {
    if (!isStaff) { ws.send(JSON.stringify({ type: 'system', text: 'No permission' })); return }
    lockdown = !lockdown
    broadcast({ type: 'chat:lock', locked: lockdown })
    broadcast({ type: 'system', text: `Chat was ${lockdown ? 'locked 🔒' : 'unlocked 🔓'} by ${client.username}` })
    return
  }
  if (cmd === 'list') {
    if (!isStaff) { ws.send(JSON.stringify({ type: 'system', text: 'No permission' })); return }
    const online = Array.from(wsClients.values()).filter(c => c.username && c.username !== 'Guest')
      .map(c => `${c.username}${c.playerId && db[c.playerId]?.role ? ' [' + db[c.playerId].role + ']' : ''}`)
    ws.send(JSON.stringify({ type: 'system', text: 'Online (' + online.length + '): ' + (online.join(', ') || 'none') }))
    return
  }

  // Commands requiring a target
  if (!targetName) { ws.send(JSON.stringify({ type: 'system', text: 'Specify a player name' })); return }
  if (!isStaff) { ws.send(JSON.stringify({ type: 'system', text: 'You do not have permission to use moderation commands' })); return }

  const targetPlayerId = findPlayerId(targetName)
  if (!targetPlayerId) { ws.send(JSON.stringify({ type: 'system', text: `Player "${targetName}" not found` })); return }

  switch (cmd) {
    case 'mute': {
      const minutes = parseInt(parts[2], 10) || 5
      mutes.set(targetPlayerId, Date.now() + minutes * 60 * 1000)
      broadcast({ type: 'system', text: `${targetName} was muted for ${minutes} minute(s) by ${client.username}` })
      sendToPlayer(targetName, { type: 'system', text: `You were muted by ${client.username} for ${minutes} minute(s)` })
      break
    }
    case 'unmute': {
      if (mutes.has(targetPlayerId)) {
        mutes.delete(targetPlayerId)
        broadcast({ type: 'system', text: `${targetName} was unmuted by ${client.username}` })
        sendToPlayer(targetName, { type: 'system', text: `You were unmuted by ${client.username}` })
      } else {
        ws.send(JSON.stringify({ type: 'system', text: `${targetName} is not muted` }))
      }
      break
    }
    case 'warn': {
      const reason = parts.slice(2).join(' ') || 'No reason given'
      sendToPlayer(targetName, { type: 'system', text: `⚠️ Warning from ${client.username}: ${reason}` })
      ws.send(JSON.stringify({ type: 'system', text: `Warned ${targetName}: ${reason}` }))
      break
    }
    case 'kick': {
      sendToPlayer(targetName, { type: 'system', text: `You were kicked by ${client.username}` })
      const target = findPlayer(targetName)
      if (target) {
        broadcast({ type: 'system', text: `${targetName} was kicked by ${client.username}` })
        setTimeout(() => target.ws.close(), 500)
      }
      break
    }
    case 'ban': {
      bans.add(targetPlayerId)
      sendToPlayer(targetName, { type: 'system', text: `You were banned from global chat by ${client.username}` })
      broadcast({ type: 'system', text: `${targetName} was banned by ${client.username}` })
      const target = findPlayer(targetName)
      if (target) setTimeout(() => target.ws.close(), 500)
      break
    }
    case 'unban': {
      if (bans.has(targetPlayerId)) {
        bans.delete(targetPlayerId)
        broadcast({ type: 'system', text: `${targetName} was unbanned by ${client.username}` })
      } else {
        ws.send(JSON.stringify({ type: 'system', text: `${targetName} is not banned` }))
      }
      break
    }
    default:
      ws.send(JSON.stringify({ type: 'system', text: `Unknown command: /${cmd}` }))
  }
}

function broadcast(data) {
  const msg = JSON.stringify(data)
  wsClients.forEach(c => { try { c.ws.send(msg) } catch {} })
}

function broadcastOnline() {
  const online = Array.from(wsClients.values())
    .filter(c => c.username && c.username !== 'Guest')
    .map(c => ({ name: c.username, id: c.playerId, role: (c.playerId && db[c.playerId]?.role) || '' }))
  broadcast({ type: 'online-update', online })
}

function getOnlineFriends() {
  return Array.from(wsClients.values())
    .filter(c => c.username && c.username !== 'Guest')
    .map(c => ({ name: c.username, id: c.playerId, role: (c.playerId && db[c.playerId]?.role) || '', activity: 'Playing String Client' }))
}

function loadServers() {
  const p = join(__dirname, 'servers.json')
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  return [
    { name: 'String Client Hub', online: '127.0.0.1:25565', ip: '127.0.0.1', version: '1.21.x' }
  ]
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[String Client] HTTP + WS on http://localhost:${PORT}`)
  console.log(`[String Client] ${Object.keys(db).length} registered players`)

  // Auto-start Discord bot as child process
  if (!process.env.SKIP_BOT) {
    import('child_process').then(({ spawn }) => {
      const botPath = fileURLToPath(new URL('discord-bot.js', import.meta.url))
      const bot = spawn('node', [botPath], {
        stdio: 'inherit',
        env: { ...process.env }
      })
      bot.on('error', e => console.error('[Server] Bot spawn error:', e.message))
      bot.on('exit', code => console.log(`[Server] Bot exited with code ${code}`))
      console.log('[Server] Starting Discord bot...')
    })
  }
})
