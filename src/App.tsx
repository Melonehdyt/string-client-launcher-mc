import { useState, useRef, useEffect, useCallback } from 'react'
import { SkinViewer } from 'skinview3d'
import logo from './assets/logo.png'

const API = 'https://stringclient.com'
const WS = 'wss://stringclient.com'

type Tab = 'home' | 'instances' | 'mods' | 'chat' | 'friends' | 'profile' | 'settings'

const DEFAULT_BG = `${API}/media/launcherbackground.mp4`
const MR_API = 'https://api.modrinth.com/v2'
async function fetchMojangCape(uuid: string): Promise<string> {
  try {
    const r = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`)
    const d = await r.json()
    const tex = d.properties?.find((p: any) => p.name === 'textures')
    if (tex) {
      const decoded = JSON.parse(atob(tex.value))
      if (decoded.textures?.CAPE?.url) return decoded.textures.CAPE.url
    }
  } catch {}
  return ''
}
function fetchSessionServerCape(uuid: string, setCapeUrl: (u: string) => void) {
  fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`)
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (!d) return
      const tex = d?.properties?.find((p: any) => p.name === 'textures')
      if (!tex) return
      try {
        const decoded = JSON.parse(atob(tex.value))
        if (decoded.textures?.CAPE?.url) setCapeUrl(decoded.textures.CAPE.url)
      } catch {}
    })
    .catch(e => console.error('Cape fetch error:', e))
}
const DEFAULT_VERSIONS = [
  { id: '1.21.4', label: '1.21.4', sub: 'The Garden Awakens', color: '#4ade80' },
  { id: '1.21.3', label: '1.21.3', sub: 'Bundles of Bravery', color: '#a78bfa' },
  { id: '1.21.1', label: '1.21.1', sub: 'Tricky Trials', color: '#60a5fa' },
  { id: '1.21', label: '1.21', sub: 'Tricky Trials', color: '#f59e0b' },
  { id: '1.20.6', label: '1.20.6', sub: 'Armored Paws', color: '#f472b6' },
  { id: '1.20.4', label: '1.20.4', sub: 'Trails & Tales', color: '#38bdf8' },
  { id: '1.20.1', label: '1.20.1', sub: 'Trails & Tales', color: '#c084fc' },
  { id: '1.19.4', label: '1.19.4', sub: 'Trails & Tales', color: '#34d399' },
  { id: '1.19.2', label: '1.19.2', sub: 'Wild Update', color: '#fb923c' },
  { id: '1.18.2', label: '1.18.2', sub: 'Caves & Cliffs', color: '#f472b6' },
  { id: '1.17.1', label: '1.17.1', sub: 'Caves & Cliffs', color: '#38bdf8' },
  { id: '1.16.5', label: '1.16.5', sub: 'Nether Update', color: '#ef4444' },
  { id: '1.15.2', label: '1.15.2', sub: 'Buzzy Bees', color: '#fbbf24' },
  { id: '1.14.4', label: '1.14.4', sub: 'Village & Pillage', color: '#f59e0b' },
  { id: '1.13.2', label: '1.13.2', sub: 'Update Aquatic', color: '#2dd4bf' },
  { id: '1.12.2', label: '1.12.2', sub: 'World of Color', color: '#c084fc' },
  { id: '1.11.2', label: '1.11.2', sub: 'Exploration Update', color: '#4ade80' },
  { id: '1.10.2', label: '1.10.2', sub: 'Frostburn Update', color: '#60a5fa' },
  { id: '1.9.4', label: '1.9.4', sub: 'Combat Update', color: '#f472b6' },
  { id: '1.8.9', label: '1.8.9', sub: 'Bountiful Update', color: '#ef4444' },
]
let VERSIONS = [...DEFAULT_VERSIONS]

// Fetch version metadata from server (silent fallback to defaults)
fetch(`${API}/api/launcher/metadata`).then(r => r.json()).then(d => {
  if (Array.isArray(d.versions) && d.versions.length) VERSIONS = d.versions
}).catch(() => {})
const INSTANCE_COLORS = ['#4ade80','#60a5fa','#f59e0b','#c084fc','#f472b6','#38bdf8','#ef4444','#fb923c','#a78bfa','#2dd4bf','#fbbf24','#818cf8']
const VERSION_BANNERS_API = `${API}/api/version-banners`
const isVideo = (u: string) =>
  u.startsWith('blob:') ||
  u.startsWith('file://') ||
  /\.(mp4|webm|mov|gif|avi|mkv)(\?.*)?$/i.test(u)

function getEmbedUrl(u: string): string | null {
  try {
    const p = new URL(u.startsWith('http') ? u : `https://${u}`)
    if (/youtube|youtu\.be/i.test(p.hostname)) {
      const v = p.searchParams.get('v')
      const list = p.searchParams.get('list')
      const t = p.searchParams.get('t')
      const params = new URLSearchParams({ autoplay: '1', mute: '0', controls: '0', modestbranding: '1', rel: '0', enablejsapi: '1', loop: '1' })
      if (t) {
        let sec = 0; const m = t.match(/(\d+)([hms])/g)
        if (m) m.forEach(x => { const n = parseInt(x); if (x.includes('h')) sec += n*3600; else if (x.includes('m')) sec += n*60; else sec += n })
        else sec = parseInt(t) || 0
        if (sec > 0) params.set('start', String(sec))
      }
      if (list) params.set('list', list)
      if (v) {
        params.set('playlist', v)
        return `https://www.youtube.com/embed/${v}?${params.toString()}`
      }
      if (list) return `https://www.youtube.com/embed/videoseries?${params.toString()}`
      if (p.pathname.startsWith('/embed/')) return u.includes('?') ? u.replace('?', '?autoplay=1&mute=0&loop=1&') : u + '?autoplay=1&mute=0&loop=1'
    }
    if (/vimeo/i.test(p.hostname)) {
      const id = p.pathname.split('/').filter(Boolean).pop()
      if (id) return `https://player.vimeo.com/video/${id}?autoplay=1&muted=0&loop=1`
    }
    const path = p.pathname
    if (/\.(mp4|webm|mov|gif|avi|mkv|png|jpg|jpeg|webp)(\?.*)?$/i.test(path)) return null
    return u
  } catch {}
  return null
}

const THEMES = [
  { id: 'dark', label: 'Dark', color: '#1a1a2e' },
  { id: 'amoled', label: 'AMOLED', color: '#000000' },
  { id: 'mocha', label: 'Mocha', color: '#1e1e32' },
]

function BgIframe({ src, preview, volume, playing }: { src: string; preview?: boolean; volume?: number; playing?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const post = (msg: object) => { try { ref.current?.contentWindow?.postMessage(JSON.stringify(msg), '*') } catch {} }
  const isYT = /youtube|youtu\.be/i.test(src)
  const isVimeo = /vimeo/i.test(src)
  useEffect(() => {
    if (preview) return
    if (isYT) post({ event: 'command', func: playing ? 'playVideo' : 'pauseVideo', args: [] })
    else if (isVimeo) post({ method: playing ? 'play' : 'pause' })
  }, [playing])
  useEffect(() => {
    if (preview) return
    const v = Math.round((volume ?? 1) * 100)
    if (isYT) post({ event: 'command', func: 'setVolume', args: [v] })
    else if (isVimeo) post({ method: 'setVolume', value: volume ?? 1 })
  }, [volume])
  return <iframe ref={ref} src={src} className={preview ? 'bg-preview-webview' : 'bg-layer-webview'} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
}

function BgWebview({ src, preview, muted, volume, playing }: { src: string; preview?: boolean; muted?: boolean; volume?: number; playing?: boolean }) {
  const ref = useRef<any>(null)
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const inject = useCallback((wv: any, m: boolean, v: number, p: boolean) => {
    try {
      wv.executeJavaScript(`
        (function(){
          try {
            var s = document.getElementById('__sc_fs') || document.createElement('style');
            s.id = '__sc_fs';
            s.textContent = 'html,body{overflow:hidden}video,iframe[src*="player"],iframe[src*="embed"],iframe[src*="video"],iframe[src*="stream"]{position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;object-fit:cover!important;z-index:999999!important;border:none!important;margin:0!important;max-width:none!important;max-height:none!important}';
            document.head.appendChild(s);
            var all = document.querySelectorAll('video, audio');
            for (var i = 0; i < all.length; i++) { try { all[i].muted = ${m}; all[i].volume = ${v}; if (!${m} && ${p}) { all[i].play().catch(function(){}); } } catch(e){} }
            if (!document.getElementById('__sc_obs')) {
              var obs = new MutationObserver(function(){ try {
                var all2 = document.querySelectorAll('video, audio');
                for (var i = 0; i < all2.length; i++) { try { all2[i].muted = ${m}; all2[i].volume = ${v}; if (!${m} && ${p}) { all2[i].play().catch(function(){}); } } catch(e){} }
              } catch(e){} });
              obs.observe(document.body, { childList: true, subtree: true });
              var m2 = document.createElement('span'); m2.id = '__sc_obs'; m2.style.display = 'none'; document.body.appendChild(m2);
            }
          } catch(e) {}
        })()
      `)
    } catch {}
  }, [])
  useEffect(() => {
    const wv = ref.current
    if (!wv) return
    const onload = () => inject(wv, !!muted, volume ?? 1, !!playing)
    const onnav = () => setTimeout(function(){ inject(wv, !!muted, volume ?? 1, !!playing) }, 500)
    wv.addEventListener('did-finish-load', onload)
    wv.addEventListener('did-navigate', onnav)
    wv.addEventListener('did-navigate-in-page', onnav)
    return () => {
      try { wv.removeEventListener('did-finish-load', onload) } catch {}
      try { wv.removeEventListener('did-navigate', onnav) } catch {}
      try { wv.removeEventListener('did-navigate-in-page', onnav) } catch {}
    }
  }, [src, muted, volume, playing, inject])
  return <webview ref={ref} src={src} useragent={ua} className={preview ? 'bg-preview-webview' : 'bg-layer-webview'} />
}

const isEmbedIframe = (u: string) => { try { return /youtube|youtu\.be|vimeo/i.test(new URL(u.startsWith('http')?u:`https://${u}`).hostname) } catch { return false } }
const muteEmbedUrl = (url: string) => url.replace(/mute[d]?=0/, m => m.replace('0', '1'))

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [loggedIn, setLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [uuid, setUuid] = useState('')
  const [skinUrl, setSkinUrl] = useState('')
  const [capeUrl, setCapeUrl] = useState('')
  const [mcToken, setMcToken] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [theme, setTheme] = useState('dark')
  const [bgUrl, setBgUrl] = useState(DEFAULT_BG)
  const [friends, setFriends] = useState<any[]>([])
  const [wsConnected, setWsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const [chatMsgs, setChatMsgs] = useState<any[]>([])
  const [onlineList, setOnlineList] = useState<string[]>([])
  const [privateChatMsgs, setPrivateChatMsgs] = useState<any[]>([])
  const [privateChatPartner, setPrivateChatPartner] = useState<string | null>(null)
  const [chatLocked, setChatLocked] = useState(false)
  const [selectedVer, setSelectedVer] = useState('1.21.4')
  const [ram, setRam] = useState(4)
  const [jvm, setJvm] = useState('-XX:+UseG1GC -Xss1M')
  const [mcPath, setMcPath] = useState('')
  const [instances, setInstances] = useState<any[]>([])
  const [servers, setServers] = useState<any[]>([])
  const [launching, setLaunching] = useState(false)
  const [launchPid, setLaunchPid] = useState<number | null>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [showAccountPicker, setShowAccountPicker] = useState(false)
  const [privacy, setPrivacy] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sc_privacy') || '{"online":true,"friendRequests":true,"activity":true,"notifications":true}') } catch { return { online: true, friendRequests: true, activity: true, notifications: true } }
  })
  const [bgVolume, setBgVolume] = useState(1)
  const [bgPlaying, setBgPlaying] = useState(true)
  const [showVolumePopover, setShowVolumePopover] = useState(false)
  const [bgOverlayColor, setBgOverlayColor] = useState('')
  const [notifications, setNotifications] = useState<any[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [role, setRole] = useState(() => { try { const s = localStorage.getItem('sc'); if (s) { const d = JSON.parse(s); return d.role || '' } return '' } catch { return '' } })
  const [hasSubscription, setHasSubscription] = useState(() => { try { return localStorage.getItem('sc_subscribed') === 'true' } catch { return false } })
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const notificationsEnabledRef = useRef(privacy.notifications)

  // Load session
  useEffect(() => {
    const api = (window as any).electronAPI
    const loadAccounts = async () => {
      if (api?.loadAccounts) {
        try { const d = await api.loadAccounts(); if (d.length) setAccounts(d); return } catch {}
      }
      const a = localStorage.getItem('sc_accounts')
      if (a) { try { setAccounts(JSON.parse(a)) } catch {} }
    }
    loadAccounts()
    const s = localStorage.getItem('sc')
    if (s) { try {
      const d = JSON.parse(s)
      setUsername(d.u || ''); setPlayerId(d.id || ''); setUuid(d.uuid || '')
      setSkinUrl(d.skin || ''); setCapeUrl(d.cape || ''); setMcToken(d.token || localStorage.getItem('sc_mc_token') || '')
      setRole(d.role || '')
      const validBg = d.bg && (d.bg.startsWith('http://') || d.bg.startsWith('https://')) ? d.bg : DEFAULT_BG
      setTheme(d.theme || 'dark'); setBgUrl(validBg); setBgOverlayColor(d.overlay || ''); setRam(d.ram || 4)
      setJvm(d.jvm || '-XX:+UseG1GC -Xss1M'); setMcPath(d.mcPath || '')
      setInstances(d.instances || []); setServers(d.servers || [])
      if (d.u) setLoggedIn(true)
      // Load cosmetics from server (merge with local)
      if (d.id) {
        fetch(`${API}/api/cosmetics?playerId=${d.id}`).then(r => r.json()).then(list => {
          if (Array.isArray(list)) {
            list.forEach(item => {
              if (!item.enabled) return
              if (item.type === 'theme' && item.value) setTheme(item.value)
              if (item.type === 'cape' && item.value) setCapeUrl(item.value)
              if (item.type === 'bg' && item.value) setBgUrl(item.value)
              if (item.type === 'overlay' && item.value) setBgOverlayColor(item.value)
            })
          }
        }).catch(() => {})
      }
    } catch {} }
  }, [])

  const save = useCallback(() => {
    localStorage.setItem('sc', JSON.stringify({ u: username, id: playerId, uuid, skin: skinUrl, cape: capeUrl, token: mcToken, theme, bg: bgUrl, overlay: bgOverlayColor, ram, jvm, mcPath, instances, servers, role }))
    localStorage.setItem('sc_privacy', JSON.stringify(privacy))
  }, [username, playerId, uuid, skinUrl, capeUrl, mcToken, theme, bgUrl, bgOverlayColor, ram, jvm, mcPath, instances, servers, privacy])

  useEffect(() => { save() }, [save])
  useEffect(() => { localStorage.setItem('sc_subscribed', hasSubscription ? 'true' : '') }, [hasSubscription])

  // WebSocket
  useEffect(() => {
    if (!loggedIn) return
    try {
      const ws = new WebSocket(WS)
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'identify', username, playerId }))
        setWsConnected(true)
      }
      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'chat') setChatMsgs(prev => [...prev, msg])
          else if (msg.type === 'system') setChatMsgs(prev => [...prev, { type: 'system', text: msg.text, time: '' }])
          else if (msg.type === 'online-update') setOnlineList(Array.isArray(msg.online) ? msg.online : [])
          else if (msg.type === 'private-chat') setPrivateChatMsgs(prev => [...prev, { ...msg, time: msg.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
          else if (msg.type === 'notification') { if (notificationsEnabledRef.current) { setNotifications(prev => [{ id: Date.now(), ...msg, time: msg.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), read: false }, ...prev]); setNotifications(prev => { if (prev.length > 50) return prev.slice(0, 50); return prev }) } }
          else if (msg.type === 'chat:clear') setChatMsgs([])
          else if (msg.type === 'chat:delete') setChatMsgs(prev => prev.filter(m => m.id !== msg.msgId))
          else if (msg.type === 'chat:lock') setChatLocked(msg.locked)
        } catch {}
      }
      ws.onclose = () => setWsConnected(false)
      wsRef.current = ws
      return () => ws.close()
    } catch {}
  }, [loggedIn, username, playerId])
  useEffect(() => { notificationsEnabledRef.current = privacy.notifications }, [privacy.notifications])

  // Fetch initial friends (filter out self on server side already, but double-check)
  useEffect(() => {
    if (!loggedIn || !playerId) return
    fetch(`${API}/api/friends?playerId=${playerId}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setFriends(d.filter((f: any) => f.id !== playerId)) }).catch(() => {})
  }, [loggedIn, playerId])

  // Fetch server list from API (merges with local defaults)
  useEffect(() => {
    fetch(`${API}/api/launcher/servers`).then(r => r.json()).then(list => {
      if (Array.isArray(list) && list.length) setServers(list)
    }).catch(() => {})
  }, [])

  // Login
  const handleMsLogin = async () => {
    setAuthLoading(true); setAuthError('')
    try {
      const api = (window as any).electronAPI
      if (!api?.login) throw new Error('No Electron API')
      const result = await api.login()
      if (result?.error) throw new Error(result.error)
      if (result?.username) {
        const res = await fetch(`${API}/api/auth/register`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: result.username, uuid: result.uuid })
        })
        const data = await res.json()
        setUsername(data.username); setPlayerId(data.playerId); setUuid(result.uuid)
        setSkinUrl(`https://mineskin.eu/skin/${result.username}`)
        setMcToken(result.accessToken || '')
        localStorage.setItem('sc_mc_token', result.accessToken || '')
        setRole(data.role || '')
        setLoggedIn(true)
        fetchMojangCape(result.uuid).then(url => { if (url) setCapeUrl(url) })
        // Save to accounts list
        const acc = { u: data.username, id: data.playerId, uuid: result.uuid, token: result.accessToken || '', skin: `https://mineskin.eu/skin/${result.username}` }
        setAccounts(prev => {
          const filtered = prev.filter(x => x.u !== acc.u)
          const next = [...filtered, acc]
          localStorage.setItem('sc_accounts', JSON.stringify(next))
          const api = (window as any).electronAPI
          if (api?.saveAccounts) api.saveAccounts(next)
          return next
        })
      }
    } catch (e: any) { setAuthError(e.message || 'Login failed') }
    setAuthLoading(false)
  }

  const handleLogout = () => { localStorage.removeItem('sc'); setLoggedIn(false) }

  const switchAccount = (acc: any) => {
    setUsername(acc.u); setPlayerId(acc.id); setUuid(acc.uuid); setMcToken(acc.token || '')
    setSkinUrl(acc.skin || `https://mineskin.eu/skin/${acc.u}`); setCapeUrl('')
    setShowAccountPicker(false); setLoggedIn(true)
    fetchMojangCape(acc.uuid).then(url => { if (url) setCapeUrl(url) })
    fetch(`${API}/api/user/profile?playerId=${acc.id}`).then(r => r.json()).then(d => { if (d.role !== undefined) setRole(d.role) }).catch(() => {})
  }

  const sendChat = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat', text }))
    }
  }, [])

  const sendPrivateChat = useCallback((to: string, text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'private-chat', to, text }))
    }
  }, [])

  const sendDelete = useCallback((msgId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat:delete', msgId }))
    }
  }, [])

  const handleLaunch = useCallback(async (version: string, instSettings?: { resolution?: string; loader?: string }) => {
    const api = (window as any).electronAPI
    if (!api?.launchMinecraft) return
    setLaunching(true)
    try {
      const result = await api.launchMinecraft({
        username, version, ram: ram * 1024, javaPath: undefined,
        mcPath: mcPath || undefined,
        resolution: instSettings?.resolution,
        loader: instSettings?.loader,
      })
      if (result?.pid) setLaunchPid(result.pid)
    } catch (e: any) {
      console.error('Launch failed', e)
    }
    setLaunching(false)
  }, [username, ram, mcPath])

  const handleKill = useCallback(async () => {
    const api = (window as any).electronAPI
    if (api?.killMinecraft) {
      await api.killMinecraft()
      setLaunchPid(null)
    }
  }, [])

  const addInstance = useCallback((inst: any) => {
    setInstances(prev => [...prev, { ...inst, id: Date.now() }])
  }, [])

  const removeInstance = useCallback((id: number) => {
    setInstances(prev => prev.filter(i => i.id !== id))
  }, [])

  const updateInstance = useCallback((id: number, updates: any) => {
    setInstances(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
  }, [])

  // Apply theme
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    const el = document.documentElement
    if (!bgUrl) {
      el.style.removeProperty('--bg-url'); el.style.removeProperty('--bg-color')
    } else {
      el.style.setProperty('--bg-url', `url(${bgUrl})`); el.style.removeProperty('--bg-color')
    }
  }, [bgUrl])
  useEffect(() => {
    const el = document.documentElement
    if (bgOverlayColor) {
      const r = parseInt(bgOverlayColor.slice(1,3), 16)
      const g = parseInt(bgOverlayColor.slice(3,5), 16)
      const b = parseInt(bgOverlayColor.slice(5,7), 16)
      el.style.setProperty('--glass-bg', `rgba(${r},${g},${b},0.15)`)
      el.style.setProperty('--glass-border', `rgba(${r},${g},${b},0.25)`)
      el.style.setProperty('--glass-hover', `rgba(${r},${g},${b},0.2)`)
    } else {
      el.style.removeProperty('--glass-bg')
      el.style.removeProperty('--glass-border')
      el.style.removeProperty('--glass-hover')
    }
  }, [bgOverlayColor])

  // Sync bg volume — also re-apply when bgUrl changes (new video element)
  useEffect(() => {
    const v = bgVideoRef.current
    if (v) v.volume = bgVolume
  }, [bgVolume, bgUrl])
  // Sync bg play state — re-apply when bgUrl changes
  useEffect(() => {
    const v = bgVideoRef.current
    if (v) {
      if (bgPlaying) {
        v.muted = false
        v.play().catch(() => {})
      } else {
        v.pause()
      }
    }
  }, [bgPlaying, bgUrl])
  // Media Session — Windows taskbar play/pause/volume controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const v = bgVideoRef.current
    if (!v || !isVideo(bgUrl || '')) { navigator.mediaSession.setActionHandler?.('play', null); navigator.mediaSession.setActionHandler?.('pause', null); return }
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'String Client Background', artist: 'Background Video' })
    navigator.mediaSession.setActionHandler('play', () => { setBgPlaying(true) })
    navigator.mediaSession.setActionHandler('pause', () => { setBgPlaying(false) })
    navigator.mediaSession.setActionHandler('previoustrack', null)
    navigator.mediaSession.setActionHandler('nexttrack', null)
    navigator.mediaSession.playbackState = bgPlaying ? 'playing' : 'paused'
    return () => {
      try { navigator.mediaSession.setActionHandler('play', null) } catch {}
      try { navigator.mediaSession.setActionHandler('pause', null) } catch {}
    }
  }, [bgPlaying, bgUrl])

  if (!loggedIn) {
    return (
      <div className="root">
        <div className="bg-layer">{!bgUrl ? <div className="bg-layer-img" /> : (() => { const e = getEmbedUrl(bgUrl); if (e) return isEmbedIframe(bgUrl) ? <BgIframe src={e} volume={bgVolume} playing={bgPlaying} /> : <BgWebview src={e} volume={bgVolume} playing={bgPlaying} />; if (isVideo(bgUrl)) return <video ref={bgVideoRef} src={bgUrl} autoPlay loop playsInline className="bg-layer-video" />; return <div className="bg-layer-img" /> })()}<div className="bg-layer-overlay" /></div><div className="bg-noise" />
        <div className="bg-glow bg-glow-1" /><div className="bg-glow bg-glow-2" />
        <div className="login-wrap">
          <div className="glass login-card">
            <div className="login-logo">
              <img src={logo} alt="Logo" style={{ width: 280, height: 280, borderRadius: '50%', opacity: 0.75, objectFit: 'cover', objectPosition: 'center', border: '2px solid rgba(255,255,255,0.12)', boxShadow: '0 0 16px rgba(255,255,255,0.06)' }} />
            </div>
            <h1 className="login-title">String Client</h1>
            <p className="login-sub">Lightweight Minecraft Launcher</p>
            <button className="login-btn" onClick={handleMsLogin} disabled={authLoading}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              {authLoading ? 'Signing in...' : 'Sign in with Microsoft'}
            </button>
            {authError && <p className="login-error">{authError}</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="root">
      <div className="bg-layer">{!bgUrl ? <div className="bg-layer-img" /> : (() => { const e = getEmbedUrl(bgUrl);       if (e) return isEmbedIframe(bgUrl) ? <BgIframe src={e} volume={bgVolume} playing={bgPlaying} /> : <BgWebview src={e} volume={bgVolume} playing={bgPlaying} />; if (isVideo(bgUrl)) return <video ref={bgVideoRef} src={bgUrl} autoPlay loop playsInline className="bg-layer-video" />; return <div className="bg-layer-img" /> })()}<div className="bg-layer-overlay" /></div><div className="bg-noise" />
      <div className="bg-glow bg-glow-1" /><div className="bg-glow bg-glow-2" /><div className="bg-glow bg-glow-3" />

      <div className="shell">
        {/* Sidebar */}
        <nav className="sidebar">
          <div className="sidebar-logo" onClick={() => setTab('home')}>
            <img src={logo} alt="Logo" style={{ width: 72, height: 72, borderRadius: '50%', opacity: 0.85, objectFit: 'cover', objectPosition: 'center', border: '2px solid rgba(255,255,255,0.12)', boxShadow: '0 0 12px rgba(255,255,255,0.06)' }} />
          </div>
          <div className="sidebar-nav">
            <SideBtn id="home" icon="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M9 22V12h6v10" tab={tab} setTab={setTab} />
            <SideBtn id="instances" icon="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" tab={tab} setTab={setTab} />
            <SideBtn id="mods" icon="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z M9 12l2 2 4-4" tab={tab} setTab={setTab} />
            <SideBtn id="chat" icon="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" tab={tab} setTab={setTab} />
            <SideBtn id="friends" icon="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" tab={tab} setTab={setTab} />
            <SideBtn id="profile" icon="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z" tab={tab} setTab={setTab} />
          </div>
          <div className="sidebar-bottom">
            <SideBtn id="settings" icon="M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" tab={tab} setTab={setTab} />
          </div>
        </nav>

        {/* Main */}
        <div className="main-area">
          {/* Top Bar */}
          <header className="topbar">
            <div className="topbar-left">
              <span className="topbar-title">String Client</span>
              <span className="topbar-badge"><span className="dot" />{wsConnected ? 'Connected' : 'Offline'}</span>
              <span className="topbar-badge" style={{ marginLeft: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', display: 'inline-block' }} /> {onlineList.length} online</span>
              <span className="topbar-tab">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
            </div>
            <div className="topbar-right" style={{ position: 'relative' }}>
              <button className="topbar-icon" title="Audio" onClick={() => setShowVolumePopover(v => !v)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
              </button>
              {showVolumePopover && (
                <div style={{ position: 'absolute', top: '100%', right: 220, zIndex: 100, minWidth: 180, padding: 12, borderRadius: 10, background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                  {(() => { const e = bgUrl ? getEmbedUrl(bgUrl) : null; const isNative = bgUrl && isVideo(bgUrl); const isWebview = bgUrl && e && !isEmbedIframe(bgUrl); const isEmbed = bgUrl && e && isEmbedIframe(bgUrl); const controllable = isNative || isWebview || isEmbed; return <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <button onClick={() => { if (controllable) { setBgPlaying(p => !p) } }} style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: controllable ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)', cursor: controllable ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {bgPlaying
                          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>}
                      </button>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flex: 1 }}>{controllable ? 'Volume' : 'Player'}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{controllable ? `${Math.round(bgVolume * 100)}%` : '---'}</span>
                    </div>
                    {controllable ? (
                      <input type="range" min={0} max={1} step={0.05} value={bgVolume} onChange={e => { const v = +e.target.value; setBgVolume(v) }} style={{ width: '100%' }} />
                    ) : (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '4px 0' }}>No video background</div>
                    )}
                  </> })()}
                </div>
              )}
              <button className="topbar-icon" title="Notifications" style={{ position: 'relative' }} onClick={() => { setShowNotifications(v => !v); setShowVolumePopover(false) }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
                {notifications.filter(n => !n.read).length > 0 && <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 14, height: 14, borderRadius: 7, background: 'rgba(255,80,80,0.9)', color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>{notifications.filter(n => !n.read).length > 99 ? '99+' : notifications.filter(n => !n.read).length}</span>}
              </button>
              {showNotifications && (
                <div style={{ position: 'absolute', top: '100%', right: 170, zIndex: 100, width: 300, maxHeight: 360, overflow: 'hidden', borderRadius: 10, background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Notifications</span>
                    {notifications.some(n => !n.read) && <button onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))} style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Mark all read</button>}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                    {notifications.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', textAlign: 'center', padding: '20px 0' }}>No notifications yet</div>
                    ) : notifications.map((n: any) => (
                      <div key={n.id} onClick={() => setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))} style={{ padding: '8px 10px', borderRadius: 8, marginBottom: 4, cursor: 'pointer', background: n.read ? 'transparent' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>{n.title || n.type}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', lineHeight: 1.3 }}>{n.text}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', marginTop: 3 }}>{n.time}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="topbar-profile" onClick={() => { setShowAccountPicker(true) }} title="Accounts" style={{ cursor: 'pointer' }}>
                <div className="topbar-avatar">
                  {uuid ? <img src={`https://mineskin.eu/helm/${username}/100`} alt="" style={{ width: 32, height: 32, borderRadius: 8 }} /> : username[0]}
                </div>
                <span className="topbar-name">{username}</span>
                <span className="topbar-dot" />
              </div>
              <span className="win-btn" style={{ marginLeft: 4 }} onClick={() => (window as any).electronAPI?.minimize()}>&#x2014;</span>
              <span className="win-btn" onClick={() => (window as any).electronAPI?.maximize()}>&#x25A1;</span>
              <span className="win-btn" style={{ color: 'rgba(255,255,255,0.25)' }} onClick={() => (window as any).electronAPI?.close()}>&#x2715;</span>
            </div>
          </header>

          {/* Content */}
          <div className="content-body">
            {tab === 'home' && (
              <HomeTab
                username={username}
                selectedVer={selectedVer}
                servers={servers}
                launching={launching}
                launchPid={launchPid}
                onLaunch={handleLaunch}
                onKill={handleKill}
                friends={friends}
                onlineList={onlineList}
                hasSubscription={hasSubscription}
              />
            )}
            {tab === 'instances' && (
              <InstancesTab
                selectedVer={selectedVer} setSelectedVer={setSelectedVer}
                jvm={jvm} instances={instances}
                onAdd={addInstance} onRemove={removeInstance} onUpdate={updateInstance}
                onLaunch={handleLaunch} launching={launching} launchPid={launchPid} onKill={handleKill}
              />
            )}
            {tab === 'mods' && <ModrinthTab instances={instances} />}
            {tab === 'chat' && (
              <ChatTab
                chatMsgs={chatMsgs}
                onSend={sendChat}
                onlineList={onlineList}
                username={username}
                privateChatMsgs={privateChatMsgs}
                onSendPrivate={sendPrivateChat}
                partner={privateChatPartner}
                playerId={playerId}
                onClosePrivate={() => setPrivateChatPartner(null)}
                role={role}
                onDeleteMsg={sendDelete}
                chatLocked={chatLocked}
              />
            )}
            {tab === 'friends' && (
              <FriendsTab
                username={username} playerId={playerId}
                friends={friends} setFriends={setFriends}
                onStartPrivateChat={setPrivateChatPartner}
                onSwitchTab={setTab}
              />
            )}
            {tab === 'profile' && (
              <ProfileTab
                username={username} playerId={playerId} uuid={uuid}
                skinUrl={skinUrl} setSkinUrl={setSkinUrl}
                capeUrl={capeUrl} setCapeUrl={setCapeUrl}
                mcToken={mcToken} setMcToken={setMcToken} role={role}
              />
            )}
            {tab === 'settings' && (
              <SettingsTab
                username={username} playerId={playerId} skinUrl={skinUrl}
                theme={theme} setTheme={setTheme}
                bgUrl={bgUrl} setBgUrl={setBgUrl}
                bgOverlayColor={bgOverlayColor} setBgOverlayColor={setBgOverlayColor}
                ram={ram} setRam={setRam}
                jvm={jvm} setJvm={setJvm}
                mcPath={mcPath} setMcPath={setMcPath}
                servers={servers} setServers={setServers}
                privacy={privacy} setPrivacy={setPrivacy}
                hasSubscription={hasSubscription} setHasSubscription={setHasSubscription}
                onLogout={handleLogout}
              />
            )}
          </div>
        </div>

        {/* Account Drawer */}
        <div className={`account-drawer-overlay ${showAccountPicker ? 'open' : ''}`} onClick={() => setShowAccountPicker(false)} />
        <div className={`account-drawer ${showAccountPicker ? 'open' : ''}`}>
          <div className="account-drawer-header">
            <span>Accounts</span>
            <button className="account-drawer-close" onClick={() => setShowAccountPicker(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="account-drawer-list">
            <div className="account-drawer-item current" onClick={() => { setShowAccountPicker(false); setTab('profile') }}>
              <img src={`https://mineskin.eu/helm/${username}/100`} alt="" className="account-drawer-avatar" />
              <div className="account-drawer-info">
                <span className="account-drawer-name">{username}</span>
                <span className="account-drawer-sub">Current</span>
              </div>
              <svg className="account-drawer-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            {accounts.filter(a => a.u !== username).map(a => (
              <div key={a.u} className="account-drawer-item" onClick={() => { setShowAccountPicker(false); switchAccount(a) }}>
                <img src={`https://mineskin.eu/helm/${a.u}/100`} alt="" className="account-drawer-avatar" />
                <div className="account-drawer-info">
                  <span className="account-drawer-name">{a.u}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="account-drawer-footer">
            <div className="account-drawer-item" onClick={() => { setShowAccountPicker(false); handleMsLogin() }}>
              <div className="account-drawer-add-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              </div>
              <span className="account-drawer-name">Add account</span>
            </div>
            <div className="account-drawer-item" onClick={() => { setShowAccountPicker(false); handleLogout() }}>
              <div className="account-drawer-logout-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              </div>
              <span className="account-drawer-name">Sign out</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sidebar Button ── */
function SideBtn({ id, icon, tab, setTab }: { id: string; icon: string; tab: string; setTab: (t: any) => void }) {
  return (
    <button className={`sidebar-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} title={id}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={icon} />
      </svg>
    </button>
  )
}

/* ── Home ── */
function HomeTab({ username, selectedVer, servers, launching, launchPid, onLaunch, onKill, onlineList, friends, hasSubscription }: {
  username: string; selectedVer: string; servers: { name: string; online: string }[]
  launching: boolean; launchPid: number | null
  onLaunch: (v: string, s?: { resolution?: string; loader?: string }) => void; onKill: () => void
  onlineList: any[]; friends: any[]; hasSubscription: boolean
}) {
  const [news, setNews] = useState<any[]>([])
  const [selectedNews, setSelectedNews] = useState<any>(null)
  const fetchNews = () => {
    fetch(`${API}/api/launcher/metadata`)
      .then(r => r.json()).then(d => {
        if (Array.isArray(d.announcements)) setNews(d.announcements.slice(0, 5))
      }).catch(() => {})
  }

  useEffect(() => { fetchNews()   }, [])

  return (
    <div className="home-grid">
      <div className="home-main">
        <div className="panel hero-card">
          <div className="hero-body">
            <div className="hero-sub"><span className={`status-dot ${launchPid ? 'running' : ''}`} />{launchPid ? 'Running' : 'Ready to Play'}</div>
            <h1 className="hero-title">Welcome back, {username}</h1>
            <div className="hero-tags">
              <span className="hero-tag">{(VERSIONS.find(v => v.id === selectedVer) || { label: selectedVer }).label}</span>
              <span className="hero-tag">Fabric</span>
            </div>
            {launchPid ? (
              <button className="hero-btn" style={{ background: 'rgba(255,100,100,0.15)', color: 'rgba(255,255,255,0.7)' }} onClick={onKill}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                KILL GAME
              </button>
            ) : (
              <button className="hero-btn" disabled={launching} onClick={() => onLaunch(selectedVer)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                {launching ? 'LAUNCHING...' : 'LAUNCH GAME'}
              </button>
            )}
          </div>
          <div className="hero-art">
            <svg width="160" height="140" viewBox="0 0 160 140" fill="none">
              <rect x="60" y="10" width="8" height="20" rx="2" fill="rgba(255,255,255,0.08)" />
              <rect x="20" y="60" width="20" height="8" rx="2" fill="rgba(255,255,255,0.06)" />
              <rect x="120" y="60" width="20" height="8" rx="2" fill="rgba(255,255,255,0.06)" />
              <rect x="56" y="110" width="16" height="20" rx="2" fill="rgba(255,255,255,0.08)" />
              <rect x="28" y="28" width="12" height="12" rx="2" fill="rgba(255,255,255,0.06)" />
              <rect x="120" y="28" width="12" height="12" rx="2" fill="rgba(255,255,255,0.05)" />
              <rect x="72" y="68" width="16" height="16" rx="2" fill="rgba(255,255,255,0.04)" />
            </svg>
          </div>
        </div>

        {servers.length > 0 && (
        <div className="panel">
          <div className="panel-title">Quick Launch</div>
          <div className="server-strip">
            {servers.map(s => (
              <div key={s.name} className="server-chip">
                <span className="d" />
                {s.name} <span style={{ color: 'rgba(255,255,255,0.15)' }}>{s.online}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        <div className="panel">
          <div className="panel-title">Latest News</div>
          {news.length === 0 ? (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', padding: '6px 0' }}>No news yet</div>
          ) : (
            <div className="news-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {news.map((item, i) => (
                <div key={item.id || i} className="news-item" onClick={() => setSelectedNews(item)} style={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12 }}>
                  {item.image && <div className="news-img-wrap"><img src={item.image} alt="" className="news-img" /></div>}
                  <div className="news-meta">
                    <span className="news-tag">{item.tag || 'Update'}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                  <div className="news-title">{item.title}</div>
                  <div className="news-desc">{item.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedNews && (
          <div className="modal-overlay" onClick={() => setSelectedNews(null)}>
            <div className="modal-content news-modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedNews(null)}>×</button>
              {selectedNews.image && <img src={selectedNews.image} alt="" className="news-modal-img" />}
              <div className="news-modal-meta">
                <span className="news-tag">{selectedNews.tag || 'Update'}</span>
                <span className="news-modal-date">{selectedNews.createdAt ? new Date(selectedNews.createdAt).toLocaleDateString() : ''}</span>
              </div>
              <h2 className="news-modal-title">{selectedNews.title}</h2>
              <div className="news-modal-text">{selectedNews.text}</div>
              {selectedNews.link && (
                <span className="news-modal-link" onClick={() => {
                  const api = (window as any).electronAPI
                  api?.openExternal ? api.openExternal(selectedNews.link) : window.open(selectedNews.link, '_blank')
                }}>Open Link →</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="home-side">
        <div className="panel">
          <div className="panel-title">Friends ({friends.length})</div>
          {friends.length === 0 ? (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', padding: '6px 0' }}>No friends added</div>
          ) : friends.map((f: any) => {
            const roleC = ({Owner:'#fbbf24',Admin:'#f87171',Developer:'#60a5fa',Tester:'#a78bfa',Partner:'#4ade80'} as any)[f.role] || ''
            return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 2, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: onlineList.some((o: any) => (o.id === f.id || o.name === f.name)) ? 'rgba(74,222,128,0.7)' : 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{f.name}</span>
              {f.role && <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', padding: '1px 5px', borderRadius: 3, color: roleC, background: roleC + '22', border: '1px solid ' + roleC + '44' }}>{f.role}</span>}
            </div>
            )
          })}
        </div>

        {!hasSubscription && (
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: 12, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>
              <div style={{ width: '100%', height: 60, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.1)' }}>Ad Space</span>
              </div>
              <span>Advertisement</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Instances ── */
function InstancesTab({ selectedVer, setSelectedVer, jvm, instances, onAdd, onRemove, onUpdate, onLaunch, launching, launchPid, onKill }: {
  selectedVer: string; setSelectedVer: (v: string) => void; jvm: string
  instances: any[]; onAdd: (i: any) => void; onRemove: (id: number) => void; onUpdate: (id: number, u: any) => void
  onLaunch: (v: string, s?: { resolution?: string; loader?: string }) => void; launching: boolean; launchPid: number | null; onKill: () => void
}) {
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState(INSTANCE_COLORS[0])
  const [selectedLoader, setSelectedLoader] = useState('Fabric')
  const [res, setRes] = useState('1280x720')
  const [banners, setBanners] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('Popular')
  const [managing, setManaging] = useState<any | null>(null)
  const [mods, setMods] = useState<any[]>([])
  const [editName, setEditName] = useState('')
  const [editRes, setEditRes] = useState('1280x720')
  const [editLoader, setEditLoader] = useState('Fabric')
  const loaders = ['Vanilla', 'Fabric', 'Forge']

  useEffect(() => {
    fetch(VERSION_BANNERS_API, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).then(d => {
      const map: Record<string, string> = {}
      for (const [ver, path] of Object.entries(d)) {
        map[ver] = `${API}${path}`
      }
      setBanners(map)
    }).catch(() => {})
  }, [])

  // Load mods when managing an instance
  useEffect(() => {
    if (!managing) return
    const api = (window as any).electronAPI
    if (!api?.listFiles) { setMods([]); return }
    api.listFiles(`profiles/${managing.version}/mods`).then(setMods).catch(() => setMods([]))
  }, [managing])

  const openManage = async (inst: any) => {
    setManaging(inst)
    setEditName(inst.name || '')
    setEditRes(inst.resolution || '1280x720')
    setEditLoader(inst.loader || 'Fabric')
  }

  const closeManage = () => {
    setManaging(null)
    setMods([])
  }

  const pickAndUploadMod = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.jar,.zip'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file || !managing) return
      await uploadModFile(file)
    }
    input.click()
  }

  const uploadModFile = async (file: File) => {
    if (!managing) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      const api = (window as any).electronAPI
      await api?.saveFile({ subdir: `profiles/${managing.version}/mods`, name: file.name.replace(/\.[^.]+$/, ''), dataUrl })
      const list = await api?.listFiles(`profiles/${managing.version}/mods`)
      setMods(list || [])
    }
    reader.readAsDataURL(file)
  }

  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = (e: any) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }
  const handleDragLeave = (e: any) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }
  const handleDrop = (e: any) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length) uploadModFile(files[0])
  }

  const deleteMod = async (name: string) => {
    if (!managing) return
    const api = (window as any).electronAPI
    await api?.deleteFile({ subdir: `profiles/${managing.version}/mods`, name })
    const list = await api?.listFiles(`profiles/${managing.version}/mods`)
    setMods(list || [])
  }

  const deleteInstance = async (inst: any) => {
    if (!confirm(`Delete instance "${inst.name}" and all its files?`)) return
    const api = (window as any).electronAPI
    await api?.deleteProfile(inst.version)
    onRemove(inst.id)
    closeManage()
  }

  const saveInstance = () => {
    if (!managing) return
    onUpdate(managing.id, { name: editName, resolution: editRes, loader: editLoader })
    setManaging({ ...managing, name: editName, resolution: editRes, loader: editLoader })
  }

  const createInstance = () => {
    const displayName = name.trim() || 'Instance'
    onAdd({ name: displayName, version: selectedVer, icon: selectedColor, resolution: res, loader: selectedLoader })
    setName('')
  }

  const launchInstance = (inst: any) => {
    onLaunch(inst.version, { resolution: inst.resolution, loader: inst.loader })
  }

  const getVersionInfo = (ver: string) => VERSIONS.find(v => v.id === ver) || { label: ver, sub: '', color: '#888' }

  const getBanner = (vId: string) => banners[vId]
  const selected = getVersionInfo(selectedVer)
  const bannerUrl = getBanner(selectedVer)

  const filteredVersions = VERSIONS.slice().filter(v =>
    v.label.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    if (sort === 'Oldest') return a.id.localeCompare(b.id)
    if (sort === 'Newest') return b.id.localeCompare(a.id)
    return b.id.localeCompare(a.id)
  })

  return (
    <div className="inst-wrap">
      {/* Top bar */}
      <div className="inst-topbar">
        <div className="inst-topbar-left">
          <div className="inst-logo">
            <div className="inst-logo-icon" />
            <span>String</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>
        </div>
        <div className="inst-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search versions..." />
        </div>
        <div className="inst-topbar-right">
          <select className="inst-sort" value={sort} onChange={e => setSort(e.target.value)}>
            <option>Popular</option>
            <option>Newest</option>
            <option>Oldest</option>
          </select>
          <button className="inst-profile-btn">
            <div className="inst-avatar" />
            View Profile
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="inst-main">
        {/* Version card grid */}
        <div className="inst-grid-wrap">
          <div className="inst-card-grid">
            {filteredVersions.map(v => {
              const b = getBanner(v.id)
              const isSel = selectedVer === v.id
              return (
                <button key={v.id} onClick={() => setSelectedVer(v.id)} className={`inst-card${isSel ? ' active' : ''}`}>
                  <div className="inst-card-bg" style={{ background: `linear-gradient(145deg, ${v.color}44 0%, ${v.color}22 35%, rgba(10,10,15,0.85) 100%)` }} />
                  {b && <img src={b} alt={v.label} className="inst-card-img" />}
                  <span className="inst-card-wm">{v.id}</span>
                  <div className="inst-card-overlay" />
                  <span className="inst-card-label">{v.label}</span>
                  <span className="inst-card-sub">{v.sub}</span>
                  {isSel && (
                    <div className="inst-card-check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg></div>
                  )}
                </button>
              )
            })}
          </div>
          {filteredVersions.length === 0 && (
            <div className="inst-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <p>No versions found</p>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="inst-side">
          <div className="inst-side-header">Selected Version</div>
          <div className="inst-side-preview">
            <div className="inst-side-preview-bg" style={{ background: `linear-gradient(145deg, ${selected.color}55, ${selected.color}22, rgba(10,10,15,0.9))` }} />
            {bannerUrl && <img src={bannerUrl} alt={selected.label} className="inst-side-preview-img" />}
            <div className="inst-side-preview-grad" />
          </div>
          <div className="inst-side-info">
            <div className="inst-side-version">
              <div className="inst-side-dot" style={{ background: selected.color }} />
              <span className="inst-side-name">Minecraft {selected.label}</span>
            </div>
            <p className="inst-side-desc">{selected.sub}</p>
            <div className="inst-side-status">
              <div className="inst-side-status-dot" />
              <span>using global minecraft</span>
            </div>
          </div>
          <div className="inst-side-controls">
            <div className="inst-field">
              <label>Version</label>
              <div className="inst-field-row">
                <select value={selectedVer} onChange={e => setSelectedVer(e.target.value)} className="inst-select">
                  {VERSIONS.slice().reverse().map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
                <button className="inst-gear"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
              </div>
            </div>
            <div className="inst-field">
              <label>Loader</label>
              <div className="inst-loader-row">
                {loaders.map(l => (
                  <button key={l} className={`inst-loader-btn${selectedLoader === l ? ' active' : ''}`} onClick={() => setSelectedLoader(l)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="inst-field">
              <label>Resolution</label>
              <select value={res} onChange={e => setRes(e.target.value)} className="inst-select">
                <option>854x480</option><option>1280x720</option><option>1920x1080</option>
              </select>
            </div>
            <div className="inst-field">
              <label>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="My Instance" className="inst-input" />
            </div>
            <div className="inst-field">
              <label>Accent</label>
              <div className="inst-color-row">
                {INSTANCE_COLORS.map(c => (
                  <div key={c} onClick={() => setSelectedColor(c)} className={`inst-color-dot${selectedColor === c ? ' active' : ''}`} style={{ background: c }} />
                ))}
              </div>
            </div>
            <button className="inst-launch-btn" onClick={createInstance}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><circle cx="12" cy="12" r="10"/></svg>
              Create Instance
            </button>
            <div className="inst-side-footer">
              <button><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>Settings</button>
              <button><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>About</button>
            </div>
          </div>

          <div className="inst-side-instances">
            <div className="inst-side-instances-hdr">
              <span>Your Instances</span>
              <span className="inst-side-instances-n">{instances.length}</span>
            </div>
            {instances.length === 0 ? (
              <div className="inst-side-empty">
                <div className="inst-side-empty-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
                <p>No instances yet</p>
                <span>Configure above and create one</span>
              </div>
            ) : (
              <div className="inst-side-instance-list">
                {instances.map(inst => {
                  const vi = getVersionInfo(inst.version)
                  const color = inst.icon || vi.color
                  return (
                    <div key={inst.id} className="inst-side-instance-row" onClick={() => openManage(inst)}>
                      <div className="inst-side-instance-icon" style={{ background: `linear-gradient(135deg, ${color}44, ${color}22)`, borderColor: `${color}33`, color }}>{inst.name[0]}</div>
                      <div className="inst-side-instance-info">
                        <div className="inst-side-instance-name">{inst.name}</div>
                        <div className="inst-side-instance-meta">{inst.version} &middot; {inst.loader || 'Fabric'}</div>
                      </div>
                      <button className="inst-side-play-btn" disabled={launching} onClick={e => { e.stopPropagation(); launchInstance(inst) }}>{launching ? '...' : 'Play'}</button>
                      <button className="inst-side-del-btn" onClick={e => { e.stopPropagation(); openManage(inst) }} title="Manage"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
                      <button className="inst-side-del-btn" onClick={e => { e.stopPropagation(); onRemove(inst.id) }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full-page Instance Manager */}
      {managing && (
        <div className="inst-manager-overlay" onClick={closeManage}>
          <div className="inst-manager" onClick={e => e.stopPropagation()}>
            <div className="inst-manager-header">
              <div>
                <div className="inst-manager-title">{managing.name}</div>
                <div className="inst-manager-sub">{managing.version} &middot; {editLoader}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button className="inst-manager-save" onClick={saveInstance}>Save</button>
                <button className="inst-manager-close" onClick={closeManage}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="inst-manager-body">
              <div className="inst-manager-section">
                <div className="inst-manager-section-title">Settings</div>
                <div className="inst-manager-settings">
                  <div className="inst-manager-field">
                    <label>Name</label>
                    <input className="inst-manager-input" value={editName} onChange={e => setEditName(e.target.value)} />
                  </div>
                  <div className="inst-manager-field">
                    <label>Resolution</label>
                    <select className="inst-manager-select" value={editRes} onChange={e => setEditRes(e.target.value)}>
                      <option>854x480</option><option>1280x720</option><option>1920x1080</option>
                    </select>
                  </div>
                  <div className="inst-manager-field">
                    <label>Loader</label>
                    <div className="inst-manager-loader-row">
                      {loaders.map(l => (
                        <button key={l} className={`inst-manager-loader-btn${editLoader === l ? ' active' : ''}`} onClick={() => setEditLoader(l)}>{l}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="inst-manager-section">
                <div className="inst-manager-section-title">Mods ({mods.length})</div>
                <div className="inst-manager-mods">
                  {mods.map(m => (
                    <div key={m.filename} className="inst-manager-mod-row">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink:0,color:'rgba(255,255,255,0.25)'}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="inst-manager-mod-name">{m.filename}</span>
                      <button className="inst-manager-mod-del" onClick={() => deleteMod(m.name)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                  {mods.length === 0 && <div className="inst-manager-mods-empty">No mods installed</div>}
                </div>
              </div>
              <div className="inst-manager-section">
                <div className="inst-manager-section-title">Add Mod</div>
                <div
                  className={`inst-manager-dropzone${dragOver ? ' drag-over' : ''}`}
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  onClick={pickAndUploadMod}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:0.4}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <div className="inst-manager-dropzone-text">{dragOver ? 'Drop mod here' : 'Drag & drop .jar or click to browse'}</div>
                </div>
              </div>
              <div className="inst-manager-section-danger">
                <button className="inst-manager-delete-btn" onClick={() => deleteInstance(managing)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  Delete Instance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Modrinth Browser ── */
function ModrinthTab({ instances }: { instances: any[] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [installMsg, setInstallMsg] = useState('')
  const [sort, setSort] = useState('relevance')
  const [showSort, setShowSort] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const [loader, setLoader] = useState('fabric')
  const [projectType, setProjectType] = useState('mod')
  const [gameVer, setGameVer] = useState('1.21.4')
  const [targetInst, setTargetInst] = useState('')
  const GAME_VERSIONS = ['1.21.4','1.21.3','1.21.1','1.21','1.20.6','1.20.4','1.20.1','1.19.4','1.18.2','1.17.1','1.16.5','1.15.2','1.14.4','1.12.2','1.8.9']

  const buildFacets = () => {
    const f: string[] = [`project_type:${projectType}`]
    if (loader) f.push(`categories:${loader}`)
    return encodeURIComponent(JSON.stringify([f]))
  }

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const facets = buildFacets()
      const r = await fetch(`${MR_API}/search?query=${encodeURIComponent(q)}&facets=${facets}&sort=${sort}&limit=30`)
      const d = await r.json()
      setResults(d.hits || [])
    } catch { setResults([]) }
    setLoading(false)
  }, [sort, loader, projectType])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(query), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, search])

  useEffect(() => {
    const handle = (e: MouseEvent) => { if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSort(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const installMod = async (projectId: string, projectTitle: string) => {
    const api = (window as any).electronAPI
    if (!api?.saveFile) {
      setInstallMsg('Install from in-app only')
      setTimeout(() => setInstallMsg(''), 2000)
      return
    }
    const inst = instances.find(i => i.id === Number(targetInst))
    if (instances.length > 0 && !inst) {
      setInstallMsg('Select an instance first')
      setTimeout(() => setInstallMsg(''), 2000)
      return
    }
    const targetVersion = inst ? inst.version : gameVer
    const targetLoader = inst ? inst.loader.toLowerCase() : loader
    setInstallMsg(`Installing ${projectTitle}...`)
    try {
      const r = await fetch(`${MR_API}/project/${projectId}/version?loaders=%5B%22${targetLoader}%22%5D&game_versions=%5B%22${targetVersion}%22%5D`)
      const versions = await r.json()
      if (versions?.length > 0) {
        const primaryFiles = versions[0].files || []
        const jarFile = primaryFiles.find((f: any) => f.filename.endsWith('.jar'))
        if (jarFile?.url) {
          const fileResp = await fetch(jarFile.url)
          const blob = await fileResp.blob()
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            const subdir = inst ? `profiles/${inst.version}/mods` : 'mods'
            api.saveFile({ subdir, name: jarFile.filename.replace('.jar',''), dataUrl }).then(() => {
              setInstallMsg(`${jarFile.filename} installed${inst ? ` to ${inst.name}` : ''}`)
              setTimeout(() => setInstallMsg(''), 3000)
            }).catch(() => {
              setInstallMsg('Save failed')
              setTimeout(() => setInstallMsg(''), 2000)
            })
          }
          reader.readAsDataURL(blob)
        } else {
          setInstallMsg('No JAR available')
          setTimeout(() => setInstallMsg(''), 2000)
        }
      } else {
        setInstallMsg(`No version for ${targetVersion} / ${targetLoader}`)
        setTimeout(() => setInstallMsg(''), 2000)
      }
    } catch {
      setInstallMsg('Install failed')
      setTimeout(() => setInstallMsg(''), 2000)
    }
  }

  const SORTS = ['relevance', 'downloads', 'follows', 'newest', 'updated']
  const LOADERS = ['fabric', 'forge', 'quilt', 'neoforge']
  const TYPES = ['mod', 'modpack', 'resourcepack', 'shader', 'datapack']

  return (
    <div className="tab-wrap modrinth-wrap" style={{ maxWidth: '1000px' }}>
      <h2 className="tab-title">Browse Mods</h2>
      <div className="mr-filters">
        <div className="mr-filter-row">
          <div className="mr-filter-group">
            <span className="mr-filter-label">Type</span>
            <div className="mr-filter-btns">
              {TYPES.map(t => (
                <button key={t} className={`mr-filter-btn ${projectType === t ? 'active' : ''}`} onClick={() => setProjectType(t)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="mr-filter-group">
            <span className="mr-filter-label">Loader</span>
            <div className="mr-filter-btns">
              {LOADERS.map(l => (
                <button key={l} className={`mr-filter-btn ${loader === l ? 'active' : ''}`} onClick={() => setLoader(l)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="mr-filter-group" ref={sortRef}>
            <span className="mr-filter-label">Sort</span>
            <div className="mr-sort-wrap">
              <button className="mr-sort-btn" onClick={() => setShowSort(!showSort)}>
                {sort}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showSort && <div className="mr-sort-drop">
                {SORTS.map(s => (
                  <div key={s} className={`mr-sort-item ${sort === s ? 'active' : ''}`} onClick={() => { setSort(s); setShowSort(false) }}>{s}</div>
                ))}
              </div>}
            </div>
          </div>
        </div>
        <div className="mr-filter-row">
          <input className="modrinth-search" placeholder="Search..." value={query} onChange={e => setQuery(e.target.value)} />
          <select className="mr-inst-select" value={gameVer} onChange={e => setGameVer(e.target.value)} style={{ flexShrink: 0, width: 100, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 16px', color: 'rgba(255,255,255,0.75)', fontSize: 13, outline: 'none', fontFamily: 'inherit', backdropFilter: 'blur(8px)' }}>
            {GAME_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      {instances.length > 0 && (
        <div className="panel" style={{ marginBottom: 12, padding: '10px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>Install to:</span>
          <select value={targetInst} onChange={e => setTargetInst(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 8px', color: 'rgba(255,255,255,0.7)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
            <option value="">Download (no instance)</option>
            {instances.map(i => <option key={i.id} value={i.id}>{i.name} ({i.version} / {i.loader})</option>)}
          </select>
        </div>
      )}
      {installMsg && <div className="panel" style={{ marginBottom: 12, padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{installMsg}</div>}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.2)' }}>Searching...</div>
      ) : results.length === 0 && query.trim() ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.15)' }}>No results found</div>
      ) : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.1)', fontSize: 13 }}>Search mods from Modrinth</div>
      ) : (
        <div className="modrinth-grid">
          {results.map((m: any) => (
            <div key={m.project_id} className="panel modrinth-card">
              <div className="mr-top">
                {m.icon_url && <div className="mr-icon"><img src={m.icon_url} alt="" /></div>}
                <div className="mr-info">
                  <div className="mr-name">{m.title}</div>
                  <div className="mr-author">{m.author}</div>
                </div>
              </div>
              <div className="mr-desc">{m.description}</div>
              <div className="mr-footer">
                <span className="mr-dls">{(m.downloads || 0).toLocaleString()} DL</span>
                <button className="mr-install-btn" onClick={() => installMod(m.project_id, m.title)}>Install</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Chat ── */
function ChatTab({ chatMsgs, onSend, onlineList, username, privateChatMsgs, onSendPrivate, partner, playerId, onClosePrivate, role, onDeleteMsg, chatLocked }: {
  chatMsgs: any[]; onSend: (t: string) => void; onlineList: any[]; username: string
  privateChatMsgs: any[]; onSendPrivate: (to: string, t: string) => void
  partner: string | null; playerId: string; onClosePrivate: () => void
  role: string; onDeleteMsg: (id: string) => void; chatLocked: boolean
}) {
  const [input, setInput] = useState('')
  const [privInput, setPrivInput] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const privRef = useRef<HTMLDivElement>(null)
  const privMsgs = privateChatMsgs.filter(m => m.fromId === partner || m.to === partner || m.fromId === playerId)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [chatMsgs])
  useEffect(() => { if (privRef.current) privRef.current.scrollTop = privRef.current.scrollHeight }, [privateChatMsgs, partner])

  const send = () => { if (input.trim()) { onSend(input.trim()); setInput('') } }

  const onlineNames = onlineList.map((o: any) => typeof o === 'string' ? o : o.name)

  const isStaff = role === 'Owner' || role === 'Admin'
  const roleColors: Record<string,string> = { Owner:'#fbbf24', Admin:'#f87171', Developer:'#60a5fa', Tester:'#a78bfa', Partner:'#4ade80' }
  const roleBadge = (r: string) => {
    const c = roleColors[r] || '#888'
    return <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', padding: '1px 5px', borderRadius: 3, marginLeft: 5, marginRight: 7, background: c + '22', color: c, border: '1px solid ' + c + '44' }}>{r}</span>
  }

  return (
    <div className="chat-tab">
      <div className="panel chat-main">
        <div className="chat-head">
          <h3>{partner ? `Private: ${onlineNames.find((n: string) => n === '') || 'Chat'}` : 'Global Chat'}{!partner && chatLocked && <span style={{ marginLeft: 6, fontSize: 9, color: '#f87171' }}>🔒 Locked</span>}</h3>
          <span className="chat-online">● {onlineList.length} online</span>
          {partner && <button className="chat-send" style={{ marginLeft: 'auto', fontSize: 10 }} onClick={onClosePrivate}>Back to global</button>}
        </div>

        <div className="chat-msgs" ref={partner ? privRef : ref}>
          {(partner ? privMsgs : chatMsgs).map((m, i) => (
            <div key={m.id || i} className={`chat-msg ${m.type === 'system' ? 'chat-system' : ''} ${m.fromId === playerId || m.sent ? 'chat-self' : ''}`}>
              {m.time && <span className="chat-time">{m.time}</span>}
              {m.username && !m.sent && <><span className="chat-who">{m.username}</span>{m.role ? roleBadge(m.role) : ''}</>}
              {m.sent && <span className="chat-who" style={{ color: 'rgba(255,255,255,0.2)' }}>you</span>}
              <span className="chat-body">{m.text}</span>
              {isStaff && m.id && <span className="chat-del" onClick={() => onDeleteMsg(m.id)}>✕</span>}
            </div>
          ))}
        </div>

        <div className="chat-foot">
          {partner ? (
            <>
              <input value={privInput} onChange={e => setPrivInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && privInput.trim() && (onSendPrivate(partner, privInput.trim()), setPrivInput(''))} placeholder="Private message..." />
              <button className="chat-send" onClick={() => { if (privInput.trim()) { onSendPrivate(partner, privInput.trim()); setPrivInput('') } }}>Send</button>
            </>
          ) : (
            <>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message..." />
              <button className="chat-send" onClick={send}>Send</button>
            </>
          )}
        </div>
      </div>
      <div className="chat-side">
        <div className="panel">
          <h4>Online ({onlineList.length})</h4>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', padding: '8px 0' }}>
            {onlineList.length} player{onlineList.length !== 1 ? 's' : ''} currently connected
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Friends ── */
function FriendsTab({ username, playerId, friends, setFriends, onStartPrivateChat, onSwitchTab }: {
  username: string; playerId: string; friends: any[]; setFriends: (f: any) => void
  onStartPrivateChat: (id: string) => void; onSwitchTab: (t: any) => void
}) {
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [friendError, setFriendError] = useState('')
  const [addingFriend, setAddingFriend] = useState('')

  const searchPlayers = async (q: string) => {
    setSearchQ(q)
    setFriendError('')
    if (q.trim().length < 1) { setSearchResults([]); return }
    try {
      const r = await fetch(`${API}/api/players/search?q=${encodeURIComponent(q)}`)
      const d = await r.json()
      const results = Array.isArray(d) ? d.filter((p: any) => p.id !== playerId) : []
      setSearchResults(results)
      if (results.length === 0) setFriendError('No players found')
    } catch { setSearchResults([]); setFriendError('Failed to search') }
  }

  const addFriend = async (friendId: string) => {
    setAddingFriend(friendId)
    setFriendError('')
    try {
      const r = await fetch(`${API}/api/friends/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, friendId }) })
      const d = await r.json()
      if (!r.ok || d.error) { setFriendError(d.error || 'Failed to add'); setAddingFriend(''); return }
      const r2 = await fetch(`${API}/api/friends?playerId=${playerId}`)
      const d2 = await r2.json()
      if (Array.isArray(d2)) setFriends(d2)
      setSearchQ(''); setSearchResults([])
    } catch { setFriendError('Network error — is the server online?') }
    setAddingFriend('')
  }

  const removeFriend = async (friendId: string) => {
    try {
      await fetch(`${API}/api/friends/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, friendId }) })
      const r = await fetch(`${API}/api/friends?playerId=${playerId}`)
      const d = await r.json()
      if (Array.isArray(d)) setFriends(d)
    } catch {}
  }

  const openChat = (f: any) => {
    onStartPrivateChat(f.id)
    onSwitchTab('chat')
  }

  return (
    <div className="tab-wrap" style={{ maxWidth: 500 }}>
      <h2 className="tab-title">Friends ({friends.length})</h2>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Add Friend</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="modrinth-search" style={{ flex: 1 }} placeholder="Search by username..." value={searchQ} onChange={e => searchPlayers(e.target.value)} />
        </div>
        {friendError && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,100,100,0.7)', padding: '4px 8px', background: 'rgba(255,100,100,0.08)', borderRadius: 6 }}>
            {friendError}
          </div>
        )}
        {searchResults.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {searchResults.map(p => (
              <div key={p.id} className="friend-row" style={{ cursor: 'pointer', borderRadius: 8, marginBottom: 2 }} onClick={() => addFriend(p.id)}>
                <div className="friend-av" style={{ background: 'rgba(255,255,255,0.08)' }}>{p.name[0]}</div>
                <div className="friend-info">
                  <div className="friend-name">{p.name}</div>
                  <div className="friend-act" style={{ color: 'rgba(255,255,255,0.25)' }}>Click to send request</div>
                </div>
                <button className="promo-sub" style={{ padding: '4px 10px', fontSize: 10 }} disabled={addingFriend === p.id} onClick={e => { e.stopPropagation(); addFriend(p.id) }}>
                  {addingFriend === p.id ? '...' : '+ Add'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="panel">
        <div className="panel-title">Your Friends</div>
        {friends.length === 0 ? (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', padding: '6px 0' }}>No friends yet</div>
        ) : (
          <div className="friend-strip">
            {friends.map((f, i) => (
              <div key={f.id || i} className="friend-row" style={{ cursor: 'pointer', borderRadius: 8 }} onClick={() => openChat(f)}>
                <div className="friend-av" style={{ background: 'rgba(255,255,255,0.06)' }}>{f.name[0]}</div>
                <div className="friend-info">
                  <div className="friend-name">{f.name} {f.role ? <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', padding: '1px 5px', borderRadius: 3, marginLeft: 4, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>{f.role}</span> : ''}</div>
                  <div className="friend-act">{f.activity || 'Offline'}</div>
                </div>
                <div className={`friend-dot ${f.online ? 'on' : 'off'}`} />
                <button className="topbar-icon" style={{ width: 26, height: 26, opacity: 0.4 }} onClick={e => { e.stopPropagation(); removeFriend(f.id) }} title="Remove">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Profile ── */
function ProfileTab({ username, playerId, uuid, skinUrl, setSkinUrl, capeUrl, setCapeUrl, mcToken, setMcToken, role }: {
  username: string; playerId: string; uuid: string; skinUrl: string; capeUrl: string
  setSkinUrl: (u: string) => void; setCapeUrl: (u: string) => void; mcToken: string; setMcToken: (t: string) => void; role: string
}) {
  const skinRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [ownedCapes, setOwnedCapes] = useState<any[]>([])
  const [capePreviews, setCapePreviews] = useState<Record<string, string>>({})
  const [autoRotate, setAutoRotate] = useState(false)
  const [showElytra, setShowElytra] = useState(false)
  const [skinVariant, setSkinVariant] = useState<'CLASSIC' | 'SLIM'>('CLASSIC')
  const [skinUploading, setSkinUploading] = useState(false)
  const [skinStatus, setSkinStatus] = useState('')
  const [previewSkinUrl, setPreviewSkinUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [savedSkins, setSavedSkins] = useState<{ name: string; url: string }[]>(() => {
    try { const d = localStorage.getItem('sc_saved_skins'); return d ? JSON.parse(d) : [] } catch { return [] }
  })
  // Force re-sync from localStorage on every mount
  useEffect(() => {
    try { const d = localStorage.getItem('sc_saved_skins'); if (d) setSavedSkins(JSON.parse(d)) } catch {}
  }, [])

  const saveSkin = async () => {
    const q = searchQuery.trim()
    if (!q || !previewSkinUrl) { setSkinStatus('Nothing to save'); return }
    const api = (window as any).electronAPI
    let url = previewSkinUrl
    if (api?.saveFile) {
      try {
        const res = await fetch(previewSkinUrl)
        const blob = await res.blob()
        const reader = new FileReader()
        const dataUrl = await new Promise<string>(resolve => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(blob) })
        const result = await api.saveFile({ subdir: 'skins', name: q, dataUrl })
        url = `file://${result.path.replace(/\\/g, '/')}`
      } catch {}
    }
    setSavedSkins(prev => {
      if (prev.some(s => s.name.toLowerCase() === q.toLowerCase())) {
        setSkinStatus('Already saved')
        return prev
      }
      const updated = [...prev, { name: q, url }]
      localStorage.setItem('sc_saved_skins', JSON.stringify(updated))
      setSkinStatus(`Saved ${q}'s skin`)
      return updated
    })
  }

  const loadSavedSkin = (name: string, url: string) => {
    setSearchQuery(name)
    setPreviewSkinUrl(url)
    setSkinStatus(`Previewing ${name}'s skin`)
  }

  const removeSavedSkin = (name: string) => {
    setSavedSkins(prev => {
      const updated = prev.filter(s => s.name.toLowerCase() !== name.toLowerCase())
      localStorage.setItem('sc_saved_skins', JSON.stringify(updated))
      return updated
    })
  }

  const _refreshToken = useCallback(async () => {
    const api = (window as any).electronAPI
    // Try silent refresh first
    if (api?.refreshToken) {
      try {
        const result = await api.refreshToken()
        if (result?.accessToken) {
          setMcToken(result.accessToken)
          localStorage.setItem('sc_mc_token', result.accessToken)
          return result.accessToken
        }
      } catch {}
    }
    // Fall back to full login flow (opens browser)
    if (api?.login) {
      try {
        const result = await api.login()
        if (result?.accessToken) {
          setMcToken(result.accessToken)
          localStorage.setItem('sc_mc_token', result.accessToken)
          return result.accessToken
        }
      } catch {}
    }
    return null
  }, [setMcToken])

  const _mcFetch = useCallback(async (url: string, opts?: { method?: string; body?: any; json?: boolean }): Promise<Response> => {
    let token = mcToken
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (opts?.json) headers['Content-Type'] = 'application/json'
    let res = await fetch(url, { method: opts?.method || 'GET', headers, body: opts?.body })
    if (res.status === 401) {
      const newToken = await _refreshToken()
      if (newToken) {
        token = newToken
        headers.Authorization = `Bearer ${token}`
        res = await fetch(url, { method: opts?.method || 'GET', headers, body: opts?.body })
      }
    }
    return res
  }, [mcToken, _refreshToken])

  useEffect(() => {
    let found = false
    let cancelled = false
    // Path 1: Minecraft API (requires mcToken)
    if (mcToken) {
      _mcFetch('https://api.minecraftservices.com/minecraft/profile').then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
        .then(d => {
          if (cancelled) return
          if (d?.capes?.length) {
            setOwnedCapes(d.capes)
            const active = d.capes.find((c: any) => c.state === 'ACTIVE')
            if (active?.url) { found = true; setCapeUrl(active.url.replace(/^http:/, 'https:')) }
            return
          }
          return _mcFetch('https://api.minecraftservices.com/minecraft/profile/capes').then(r => r.ok ? r.json() : null)
        })
        .then(capesData => {
          if (cancelled) return
          if (capesData?.length) {
            setOwnedCapes(capesData)
            const active = capesData.find((c: any) => c.state === 'ACTIVE')
            if (active?.url) { found = true; setCapeUrl(active.url.replace(/^http:/, 'https:')) }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!found && uuid && !cancelled) fetchSessionServerCape(uuid, setCapeUrl)
        })
    } else if (uuid) {
      // Path 2: no token available, try session server directly
      fetchSessionServerCape(uuid, setCapeUrl)
    }
    return () => { cancelled = true }
  }, [mcToken, uuid, _mcFetch])

  useEffect(() => {
    if (!skinRef.current) return
    if (viewerRef.current) { viewerRef.current.dispose(); viewerRef.current = null }
    const canvas = document.createElement('canvas')
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    skinRef.current.innerHTML = ''
    skinRef.current.appendChild(canvas)
    const rect = skinRef.current.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    try {
      const viewer = new SkinViewer({
        canvas, width: w, height: h,
        skin: previewSkinUrl || skinUrl || undefined,
        background: '#232336',
      })
      viewerRef.current = viewer
      viewer.autoRotate = autoRotate
      viewer.autoRotateSpeed = 1.5
      viewer.zoom = 0.9
      viewer.fov = 30
    } catch (e) { console.error('SkinViewer error:', e) }
    return () => { viewerRef.current?.dispose(); viewerRef.current = null }
  }, [previewSkinUrl || skinUrl, autoRotate])

  useEffect(() => {
    const v = viewerRef.current
    if (!v) return
    if (capeUrl) {
      const url = capeUrl.replace(/^http:/, 'https:')
      fetch(url).then(r => r.blob()).then(blob => {
        const reader = new FileReader()
        reader.onload = () => {
          try { v.loadCape(reader.result as string, { backEquipment: showElytra ? 'elytra' : 'cape' }) } catch (e) { console.error('Cape load error:', e) }
        }
        reader.readAsDataURL(blob)
      }).catch(() => {
        try { v.loadCape(url, { backEquipment: showElytra ? 'elytra' : 'cape' }) } catch (e) { console.error('Cape fallback error:', e) }
      })
    } else {
      v.resetCape()
    }
  }, [capeUrl, showElytra])

  // Use cape texture URLs directly with CSS crop
  useEffect(() => {
    const p: Record<string, string> = {}
    ownedCapes.forEach(c => {
      if (c?.url) p[c.id] = c.url.replace(/^http:/, 'https:')
    })
    setCapePreviews(p)
  }, [ownedCapes])

  const searchSkin = () => {
    const q = searchQuery.trim()
    if (!q) return
    const url = `https://mineskin.eu/skin/${encodeURIComponent(q)}`
    setPreviewSkinUrl(url)
    setSkinStatus(`Previewing ${q}'s skin`)
  }

  const applyPreviewSkin = () => {
    if (!previewSkinUrl || !mcToken) return
    setSkinUploading(true)
    setSkinStatus('Applying...')
    _mcFetch('https://api.minecraftservices.com/minecraft/profile/skins', {
      method: 'POST', json: true,
      body: JSON.stringify({ variant: skinVariant, url: previewSkinUrl }),
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }).then(() => {
      setSkinUrl(previewSkinUrl)
      setSkinStatus('Skin applied!')
      setPreviewSkinUrl('')
      setSearchQuery('')
      setTimeout(() => { setSkinStatus(''); setSkinUploading(false) }, 3000)
    }).catch(e => { setSkinStatus(`Error: ${e.message}`); setSkinUploading(false) })
  }

  const clearPreview = () => { setPreviewSkinUrl(''); setSkinStatus('') }

  const uploadSkin = () => {
    const file = fileRef.current?.files?.[0]
    if (!file || !mcToken) return
    setSkinUploading(true)
    setSkinStatus('Uploading...')
    const fd = new FormData()
    fd.append('variant', skinVariant)
    fd.append('file', file)
    _mcFetch('https://api.minecraftservices.com/minecraft/profile/skins', {
      method: 'POST',
      body: fd,
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }).then(() => {
      setSkinStatus('Skin changed!')
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(() => { setSkinStatus(''); setSkinUploading(false) }, 3000)
    }).catch(e => {
      setSkinStatus(`Error: ${e.message}`)
      setSkinUploading(false)
    })
  }

  const selectCape = (capeId: string) => {
    const capeInfo = ownedCapes.find((c: any) => c.id === capeId)
    if (capeInfo?.url && mcToken) {
      setCapeUrl(capeInfo.url)
      _mcFetch('https://api.minecraftservices.com/minecraft/profile/capes/active', {
        method: 'PUT', json: true,
        body: JSON.stringify({ capeId })
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then(p => {
          if (p?.capes) setOwnedCapes(p.capes)
        })
        .catch(e => console.error('Cape activate error:', e))
    }
  }

  return (
    <div className="tab-wrap" style={{ maxWidth: 'none', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2 className="tab-title">Profile</h2>
      <div className="profile-grid" style={{ flex: 1, minHeight: 0 }}>
        <div>
          <div className="panel profile-stat" style={{ marginBottom: 10, textAlign: 'center' }}>
            <h4>Username</h4>
            <p style={{ fontSize: 16 }}>{username}</p>
            {role && <span className="role-badge">{role}</span>}
          </div>
          <div className="skin-box" ref={skinRef} />
          <div className="skin-controls">
            <button className={`skin-ctrl-btn ${autoRotate ? 'active' : ''}`} onClick={() => setAutoRotate(!autoRotate)} title="Auto-rotate">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Rotate
            </button>
            <button className={`skin-ctrl-btn ${showElytra ? 'active' : ''}`} onClick={() => setShowElytra(!showElytra)} title="Toggle elytra">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2s-1.5 5-9 9c5-2 9-5 9-9z"/><path d="M2 22s5-1.5 9-9c-5 2-9 5-9 9z"/><path d="M13 11l-3 3"/></svg>
              Elytra
            </button>
            <button className="skin-ctrl-btn" onClick={() => { if (viewerRef.current) { viewerRef.current.resetCameraPose(); viewerRef.current.playerObject.rotation.y = 0; viewerRef.current.zoom = 0.9; } }} title="Reset view">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Reset
            </button>
          </div>
          <div className="profile-under">
            <div className="panel profile-stat">
              <h4>UUID</h4>
              <p className="sm">{uuid || 'N/A'}</p>
            </div>
            <div className="panel profile-stat">
              <h4>Player ID</h4>
              <p className="sm">{playerId}</p>
            </div>
          </div>
        </div>
        <div className="profile-cards">
            <div className="panel profile-stat">
              <h4>Owned Capes ({ownedCapes.length})</h4>
              <div className="cape-grid">
                {ownedCapes.length === 0 ? (
                  <p className="sm" style={{ color: 'rgba(255,255,255,0.2)' }}>{mcToken ? 'No capes owned — buy one at minecraft.net' : 'Sign in to view capes'}</p>
                ) : ownedCapes.map((c: any) => (
                  <div key={c.id} className={`cape-render-item ${capeUrl === c.url ? 'active' : ''}`} onClick={() => selectCape(c.id)} title={c.alias || c.id}>
                    <div className="cape-render-preview" style={{ backgroundImage: `url(${capePreviews[c.id] || c.url.replace(/^http:/, 'https:')})` }} />
                    <div className="cape-render-name">{c.alias || c.id.split('-')[0]}</div>
                    {c.state === 'ACTIVE' && <div className="cape-render-badge">Active</div>}
                  </div>
                ))}
              </div>
          </div>
          <div className="panel profile-stat skin-changer">
            <h4>Change Skin</h4>
            <div className="skin-search-row">
              <input className="skin-search-input" placeholder="Search IGN..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchSkin()} />
              <button className="skin-ctrl-btn" onClick={searchSkin} disabled={skinUploading} style={{ padding: '6px 12px' }}>Search</button>
            </div>
            {previewSkinUrl && (
              <div className="skin-preview-actions">
                <button className="skin-ctrl-btn active" onClick={applyPreviewSkin} disabled={skinUploading} style={{ flex: 1 }}>Apply Preview</button>
                <button className="skin-ctrl-btn" onClick={saveSkin} disabled={skinUploading} style={{ padding: '6px 10px' }}>Save</button>
                <button className="skin-ctrl-btn" onClick={clearPreview} style={{ padding: '6px 10px' }}>Cancel</button>
              </div>
            )}
            {skinStatus && <div className="skin-status">{skinStatus}</div>}
            <div className="skin-divider"><span>or upload PNG</span></div>
            <div className="skin-upload-row">
              <input ref={fileRef} type="file" accept="image/png" style={{ display: 'none' }} onChange={uploadSkin} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={`skin-ctrl-btn ${skinVariant === 'CLASSIC' ? 'active' : ''}`} onClick={() => setSkinVariant('CLASSIC')} style={{ fontSize: 10, padding: '4px 10px' }}>Classic</button>
                <button className={`skin-ctrl-btn ${skinVariant === 'SLIM' ? 'active' : ''}`} onClick={() => setSkinVariant('SLIM')} style={{ fontSize: 10, padding: '4px 10px' }}>Slim</button>
              </div>
              <button className="skin-ctrl-btn" onClick={() => fileRef.current?.click()} disabled={skinUploading} style={{ padding: '6px 12px' }}>
                {skinUploading ? 'Uploading...' : 'Choose PNG'}
              </button>
            </div>
            {savedSkins.length > 0 && (
              <>
                <div className="skin-divider"><span>saved skins</span></div>
                <div className="saved-skins-grid">
                  {savedSkins.map(s => (
                    <div key={s.name} className={`saved-skin-item ${previewSkinUrl === s.url ? 'active' : ''}`} onClick={() => loadSavedSkin(s.name, s.url)}>
                      <img src={`https://mineskin.eu/helm/${encodeURIComponent(s.name)}/100`} alt="" className="saved-skin-face" />
                      <span className="saved-skin-name">{s.name}</span>
                      <button className="saved-skin-remove" onClick={e => { e.stopPropagation(); removeSavedSkin(s.name) }}>×</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Settings ── */
function SettingsTab({ username, playerId, skinUrl, theme, setTheme, bgUrl, setBgUrl, bgOverlayColor, setBgOverlayColor, ram, setRam, jvm, setJvm, mcPath, setMcPath, servers, setServers, privacy, setPrivacy, hasSubscription, setHasSubscription, onLogout }: {
  username: string; playerId: string; skinUrl: string
  theme: string; setTheme: (t: string) => void; bgUrl: string; setBgUrl: (u: string) => void
  bgOverlayColor: string; setBgOverlayColor: (c: string) => void
  ram: number; setRam: (n: number) => void; jvm: string; setJvm: (s: string) => void
  mcPath: string; setMcPath: (p: string) => void
  servers: { name: string; online: string }[]; setServers: (s: any) => void
  privacy: { online: boolean; friendRequests: boolean; activity: boolean; notifications: boolean }; setPrivacy: (p: any) => void
  hasSubscription: boolean; setHasSubscription: (v: boolean) => void
  onLogout: () => void
}) {
  const [bgInputUrl, setBgInputUrl] = useState(bgUrl)
  useEffect(() => { setBgInputUrl(bgUrl) }, [bgUrl])
  const [bgColor, setBgColor] = useState(bgOverlayColor || '#1a1a2e')

  const handleBgUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '*/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = async e => {
          const dataUrl = e.target?.result as string
          const api = (window as any).electronAPI
          if (api?.saveFile) {
            const name = `bg_${Date.now()}`
            const result = await api.saveFile({ subdir: 'backgrounds', name, dataUrl })
            setBgUrl(`file://${result.path.replace(/\\/g, '/')}`)
          } else {
            setBgUrl(dataUrl)
          }
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  const applyBgColor = (color: string) => {
    setBgColor(color)
    setBgOverlayColor(color)
  }

  return (
    <div className="tab-wrap">
      <h2 className="tab-title">Settings</h2>
      <div className="settings-strip">

        <div className="panel set-section">
          <div className="set-title">Appearance</div>
          <div className="set-row">
            <span className="set-label">Theme</span>
            <div className="theme-picker">
              {THEMES.map(t => (
                <div key={t.id} className={`theme-dot ${theme === t.id ? 'active' : ''}`}
                  style={{ background: t.color }} onClick={() => setTheme(t.id)} title={t.label} />
              ))}
            </div>
          </div>

          <div className="set-title" style={{ paddingTop: 10 }}>Background</div>
          <div className="set-row">
            <span className="set-label">Solid Color</span>
            <input type="color" value={bgColor} onChange={e => applyBgColor(e.target.value)}
              style={{ width: 40, height: 30, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
          </div>
          <div className="set-row">
            <span className="set-label">Image / Video URL</span>
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              <input className="set-input" placeholder="https://... or data:..." value={bgInputUrl} onChange={e => { const v = e.target.value.trim().split(/\s+/)[0]; setBgInputUrl(v); setBgUrl(v) }} />
            </div>
          </div>
          <div className="set-row">
            <span className="set-label">Upload File</span>
            <button className="promo-sub" style={{ padding: '4px 12px', fontSize: 10 }} onClick={handleBgUpload}>
              {bgUrl ? 'Change' : 'Choose'}
            </button>
          </div>
          <div className="set-row">
            <span className="set-label">Video/GIF</span>
            <span className="set-val" style={{ fontSize: 10 }}>All file types accepted</span>
          </div>
          {bgUrl && (
            <div className="set-row">
              <span className="set-label" />
              <button className="promo-sub" style={{ padding: '4px 12px', fontSize: 10, background: 'rgba(255,100,100,0.15)', color: 'rgba(255,255,255,0.5)' }} onClick={() => { setBgUrl(DEFAULT_BG); setBgInputUrl('') }}>
                Remove Background
              </button>
              {bgUrl !== DEFAULT_BG && (
                <button className="promo-sub" style={{ padding: '4px 12px', fontSize: 10, background: 'rgba(100,200,255,0.15)', color: 'rgba(255,255,255,0.5)' }} onClick={() => { setBgUrl(DEFAULT_BG); setBgInputUrl('') }}>
                  Reset to Default
                </button>
              )}
            </div>
          )}
          <div className="bg-preview-wrap">
            <div className="bg-preview">
              {bgUrl ? (() => { const e = getEmbedUrl(bgUrl); if (e) return isEmbedIframe(bgUrl) ? <BgIframe src={muteEmbedUrl(e)} preview /> : <BgWebview src={e} preview muted />; if (isVideo(bgUrl)) return <video src={bgUrl} autoPlay loop muted playsInline className="bg-preview-video" />; return <img src={bgUrl} alt="" className="bg-preview-img" /> })() : null}
            </div>
          </div>
        </div>

        <div className="panel set-section">
          <div className="set-title">Performance</div>
          <div className="set-row">
            <span className="set-label">RAM — <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{ram} GB</strong></span>
            <input type="range" min={2} max={16} value={ram} onChange={e => setRam(+e.target.value)} />
          </div>
          <div className="set-row set-row-col">
            <span className="set-label">JVM Arguments</span>
            <input className="set-input set-mono" value={jvm} onChange={e => setJvm(e.target.value)} />
          </div>
        </div>

        <div className="panel set-section">
          <div className="set-title">Game</div>
          <div className="set-row">
            <span className="set-label">Minecraft Directory</span>
            <button className="promo-sub" style={{ padding: '4px 12px', fontSize: 10 }} onClick={async () => {
              const api = (window as any).electronAPI
              if (api?.selectMinecraftPath) {
                const p = await api.selectMinecraftPath()
                if (p) setMcPath(p)
              }
            }}>
              {mcPath ? 'Change' : 'Select'}
            </button>
          </div>
          {mcPath && <div className="set-row" style={{ paddingTop: 0 }}><span className="set-label" /><span className="set-val" style={{ fontSize: 9, wordBreak: 'break-all' }}>{mcPath}</span></div>}
        </div>

        <div className="panel set-section">
          <div className="set-title">Quick Launch Servers</div>
          {servers.map((s, i) => (
            <div key={i} className="set-row">
              <input className="set-input" style={{ width: 140 }} value={s.name} onChange={e => {
                const c = [...servers]; c[i] = { ...c[i], name: e.target.value }; setServers(c)
              }} />
              <input className="set-input" style={{ width: 80 }} value={s.online} onChange={e => {
                const c = [...servers]; c[i] = { ...c[i], online: e.target.value }; setServers(c)
              }} />
              <button style={{ background: 'none', border: 'none', color: 'rgba(255,100,100,0.5)', cursor: 'pointer', fontSize: 14 }} onClick={() => setServers(servers.filter((_, j) => j !== i))}>&#x2715;</button>
            </div>
          ))}
          <div className="set-row">
            <button className="promo-sub" style={{ padding: '4px 12px', fontSize: 10 }} onClick={() => setServers([...servers, { name: 'New Server', online: '0' }])}>
              + Add Server
            </button>
          </div>
        </div>

        <div className="panel set-section">
          <div className="set-title">Privacy</div>
          <div className="set-row">
            <span className="set-label">Show online status</span>
            <button className={`tog ${privacy.online ? 'on' : 'off'}`} onClick={() => setPrivacy({ ...privacy, online: !privacy.online })}>
              <span className="tog-knob" />
            </button>
          </div>
          <div className="set-row">
            <span className="set-label">Allow friend requests</span>
            <button className={`tog ${privacy.friendRequests ? 'on' : 'off'}`} onClick={() => setPrivacy({ ...privacy, friendRequests: !privacy.friendRequests })}>
              <span className="tog-knob" />
            </button>
          </div>
          <div className="set-row">
            <span className="set-label">Show activity</span>
            <button className={`tog ${privacy.activity ? 'on' : 'off'}`} onClick={() => setPrivacy({ ...privacy, activity: !privacy.activity })}>
              <span className="tog-knob" />
            </button>
          </div>
          <div className="set-row">
            <span className="set-label">Notifications</span>
            <button className={`tog ${privacy.notifications ? 'on' : 'off'}`} onClick={() => setPrivacy({ ...privacy, notifications: !privacy.notifications })}>
              <span className="tog-knob" />
            </button>
          </div>
        </div>

        <div className="panel set-section">
          <div className="set-title">Subscription</div>
          <div className="set-row">
            <span className="set-label" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              {hasSubscription ? '✓ Ads removed — thank you!' : 'Remove ads and support the project'}
            </span>
            {hasSubscription ? (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Active</span>
            ) : (
              <button className="promo-sub" style={{ padding: '4px 12px', fontSize: 10, background: 'rgba(255,255,255,0.08)' }} onClick={() => {
                const api = (window as any).electronAPI
                api?.openExternal ? api.openExternal('https://your-tebex-store.com') : window.open('https://your-tebex-store.com', '_blank')
              }}>Subscribe</button>
            )}
          </div>
        </div>

        <div className="panel set-section">
          <div className="set-title">Account</div>
          <div className="set-row"><span className="set-label">Username</span><span className="set-val">{username}</span></div>
          <div className="set-row"><span className="set-label">UUID</span><span className="set-val" style={{ fontSize: 9 }}>{playerId}</span></div>
          <div className="set-row">
            <span className="set-label">Sign out</span>
            <button className="promo-sub" style={{ padding: '4px 12px', fontSize: 10, background: 'rgba(255,100,100,0.15)', color: 'rgba(255,255,255,0.5)' }} onClick={onLogout}>Logout</button>
          </div>
        </div>

      </div>
    </div>
  )
}
