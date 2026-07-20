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

const db = loadDB()
const news = loadNews()
const blog = loadBlog()

const BOT_TOKEN = process.env.BOT_TOKEN || 'discord-bot-secret-2024'

// Discord OAuth2 admin auth
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || ''
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ''
const ADMIN_GUILD_ID = process.env.ADMIN_DISCORD_GUILD_ID || ''
const ADMIN_ROLE_IDS = (process.env.ADMIN_DISCORD_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
const OAUTH_REDIRECT = `${process.env.API_URL || `http://localhost:${PORT}`}/api/admin/auth/callback`
const adminTokens = new Set()

function makeToken() { return createHash('sha256').update(randomUUID()).digest('hex').slice(0, 32) }

async function verifyDiscordGuild(userId) {
  const mr = await fetch(`https://discord.com/api/guilds/${ADMIN_GUILD_ID}/members/${userId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN || ''}` }
  })
  if (!mr.ok) return null
  const member = await mr.json()
  if (!ADMIN_ROLE_IDS.length) return { username: member.user?.username || 'Admin', guildId: ADMIN_GUILD_ID }
  if (!member.roles || !member.roles.some(r => ADMIN_ROLE_IDS.includes(r))) return null
  return { username: member.user?.username || 'Admin', guildId: ADMIN_GUILD_ID }
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
  return true
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
      return json(res, 200, { playerId: existing.playerId, username: existing.username, friends: existing.friends || [] })
    }
    const playerId = randomUUID()
    db[playerId] = { playerId, username, uuid, friends: [], createdAt: new Date().toISOString() }
    saveDB(db)
    return json(res, 200, { playerId, username, friends: [] })
  }

  // Friends list (per-player)
  if (req.method === 'GET' && pathname === '/api/friends') {
    const pid = url.searchParams.get('playerId')
    if (!pid || !db[pid]) return json(res, 400, { error: 'invalid player' })
    const player = db[pid]
    const friendList = (player.friends || []).map(fid => {
      const f = db[fid]
      if (!f) return null
      return { id: f.playerId, name: f.username, online: wsClients.has(f.playerId), activity: wsClients.has(f.playerId) ? 'Online' : 'Offline' }
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
    return json(res, 200, results.map(p => ({ id: p.playerId, name: p.username })))
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
    const token = makeToken()
    adminTokens.add(token)
    // Redirect back to admin panel with token in URL hash
    res.writeHead(302, { Location: `/admin#token=${token}` })
    res.end()
    return
  }

  if (req.method === 'POST' && pathname === '/api/admin/auth/check') {
    if (!requireAdmin(req, res)) return
    return json(res, 200, { ok: true })
  }

  // Admin password fallback (for when Discord OAuth2 isn't configured)
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
    if (!ADMIN_PASSWORD) return json(res, 403, { error: 'password login not configured' })
    const { password } = await body(req)
    if (password !== ADMIN_PASSWORD) return json(res, 403, { error: 'wrong password' })
    const token = makeToken()
    adminTokens.add(token)
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

  // ── Admin: Blog ──
  if (req.method === 'GET' && pathname === '/api/admin/blog') {
    if (!requireAdmin(req, res)) return
    const all = loadBlog().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return json(res, 200, all)
  }
  if (req.method === 'POST' && pathname === '/api/admin/blog') {
    if (!requireAdmin(req, res)) return
    const b = await body(req)
    const entry = {
      id: randomUUID().slice(0, 8),
      title: b.title || 'Untitled',
      content: b.content || '',
      excerpt: b.excerpt || '',
      image: b.image || '',
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
    const file = join(__dirname, pathname)
    if (!existsSync(file) || !statSync(file).isFile()) { json(res, 404, { error: 'not found' }); return }
    const stat = statSync(file)
    const types = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.mp3': 'audio/mpeg' }
    const contentType = types[extname(file)] || 'application/octet-stream'
    const range = req.headers.range
    if (range) {
      const [start, end] = range.replace('bytes=', '').split('-').map(Number)
      const s = start || 0, e = end || stat.size - 1
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
          if (client) {
            broadcast({ type: 'chat', username: client.username, text: msg.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
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

function broadcast(data) {
  const msg = JSON.stringify(data)
  wsClients.forEach(c => { try { c.ws.send(msg) } catch {} })
}

function broadcastOnline() {
  const online = Array.from(wsClients.values())
    .filter(c => c.username && c.username !== 'Guest')
    .map(c => ({ name: c.username, id: c.playerId }))
  broadcast({ type: 'online-update', online })
}

function getOnlineFriends() {
  return Array.from(wsClients.values())
    .filter(c => c.username && c.username !== 'Guest')
    .map(c => ({ name: c.username, id: c.playerId, activity: 'Playing String Client' }))
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
