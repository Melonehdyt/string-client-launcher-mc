import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { config } from 'dotenv'; import { fileURLToPath } from 'url'; import { dirname, join, extname } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '.env') })

const PORT = +process.env.PORT || 3001
const DB_PATH = './players.json'
const NEWS_PATH = './news.json'

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

const db = loadDB()
const news = loadNews()

const BOT_TOKEN = process.env.BOT_TOKEN || 'discord-bot-secret-2024'

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

  if (pathname === '/api/health') return json(res, 200, { status: 'ok', players: Object.keys(db).length })

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
