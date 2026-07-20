import { useState, useRef, useEffect, useCallback } from 'react'
import { SkinViewer } from 'skinview3d'
import logo from './assets/logo.png'

const API = 'http://localhost:3001'
const WS = 'ws://localhost:3001'

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
const VERSIONS = ['1.21.4','1.21.1','1.20.4','1.20.1','1.19.4','1.18.2','1.17.1','1.16.5']
const DEFAULT_SERVERS = [
  { name: 'Hypixel', online: '54.2k' }, { name: 'GommeHD', online: '18.7k' },
  { name: 'Mineplex', online: '6.2k' }, { name: 'CubeCraft', online: '4.8k' },
]
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
      const params = new URLSearchParams({ autoplay: '1', mute: '0', controls: '0', modestbranding: '1', rel: '0', enablejsapi: '1' })
      if (t) {
        let sec = 0; const m = t.match(/(\d+)([hms])/g)
        if (m) m.forEach(x => { const n = parseInt(x); if (x.includes('h')) sec += n*3600; else if (x.includes('m')) sec += n*60; else sec += n })
        else sec = parseInt(t) || 0
        if (sec > 0) params.set('start', String(sec))
      }
      if (list) params.set('list', list)
      if (v) return `https://www.youtube.com/embed/${v}?${params.toString()}`
      if (list) return `https://www.youtube.com/embed/videoseries?${params.toString()}`
      if (p.pathname.startsWith('/embed/')) return u.includes('?') ? u.replace('?', '?autoplay=1&mute=0&') : u + '?autoplay=1&mute=0'
    }
    if (/vimeo/i.test(p.hostname)) {
      const id = p.pathname.split('/').filter(Boolean).pop()
      if (id) return `https://player.vimeo.com/video/${id}?autoplay=1&muted=0`
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
  const [selectedVer, setSelectedVer] = useState('1.21.4')
  const [ram, setRam] = useState(4)
  const [jvm, setJvm] = useState('-XX:+UseG1GC -Xss1M')
  const [mcPath, setMcPath] = useState('')
  const [instances, setInstances] = useState<any[]>([])
  const [servers, setServers] = useState(DEFAULT_SERVERS)
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
      setSkinUrl(d.skin || ''); setCapeUrl(d.cape || ''); setMcToken(d.token || '')
      const validBg = d.bg && (d.bg.startsWith('http://') || d.bg.startsWith('https://')) ? d.bg : DEFAULT_BG
      setTheme(d.theme || 'dark'); setBgUrl(validBg); setBgOverlayColor(d.overlay || ''); setRam(d.ram || 4)
      setJvm(d.jvm || '-XX:+UseG1GC -Xss1M'); setMcPath(d.mcPath || '')
      setInstances(d.instances || []); setServers(d.servers || DEFAULT_SERVERS)
      if (d.u) setLoggedIn(true)
    } catch {} }
  }, [])

  const save = useCallback(() => {
    localStorage.setItem('sc', JSON.stringify({ u: username, id: playerId, uuid, skin: skinUrl, cape: capeUrl, token: mcToken, theme, bg: bgUrl, overlay: bgOverlayColor, ram, jvm, mcPath, instances, servers }))
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
          else if (msg.type === 'online-update') setOnlineList(Array.isArray(msg.online) ? msg.online.map((o: any) => typeof o === 'string' ? o : o.name) : [])
          else if (msg.type === 'private-chat') setPrivateChatMsgs(prev => [...prev, { ...msg, time: msg.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
          else if (msg.type === 'notification') { if (notificationsEnabledRef.current) { setNotifications(prev => [{ id: Date.now(), ...msg, time: msg.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), read: false }, ...prev]); setNotifications(prev => { if (prev.length > 50) return prev.slice(0, 50); return prev }) } }
        } catch {}
      }
      ws.onclose = () => setWsConnected(false)
      wsRef.current = ws
      return () => ws.close()
    } catch {}
  }, [loggedIn, username, playerId])

  // Sync notification ref
  useEffect(() => { notificationsEnabledRef.current = privacy.notifications }, [privacy.notifications])

  // Fetch initial friends (filter out self on server side already, but double-check)
  useEffect(() => {
    if (!loggedIn || !playerId) return
    fetch(`${API}/api/friends?playerId=${playerId}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setFriends(d.filter((f: any) => f.id !== playerId)) }).catch(() => {})
  }, [loggedIn, playerId])

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

  const handleLaunch = useCallback(async (version: string) => {
    const api = (window as any).electronAPI
    if (!api?.launchMinecraft) return
    setLaunching(true)
    try {
      const result = await api.launchMinecraft({
        username, version, ram: ram * 1024, javaPath: undefined,
        mcPath: mcPath || undefined,
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
              <img src={logo} alt="Logo" style={{ width: 140, height: 140, borderRadius: '50%', opacity: 0.75, objectFit: 'cover', objectPosition: 'center', border: '2px solid rgba(255,255,255,0.12)', boxShadow: '0 0 16px rgba(255,255,255,0.06)' }} />
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
            <img src={logo} alt="Logo" style={{ width: 56, height: 56, borderRadius: '50%', opacity: 0.85, objectFit: 'cover', objectPosition: 'center', border: '2px solid rgba(255,255,255,0.12)', boxShadow: '0 0 12px rgba(255,255,255,0.06)' }} />
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
              <div className="topbar-badge"><span className="dot" />{wsConnected ? 'Connected' : 'Offline'}</div>
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
                onAdd={addInstance} onRemove={removeInstance}
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
                mcToken={mcToken}
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
function HomeTab({ username, selectedVer, servers, launching, launchPid, onLaunch, onKill, friends, onlineList, hasSubscription }: {
  username: string; selectedVer: string; servers: { name: string; online: string }[]
  launching: boolean; launchPid: number | null
  onLaunch: (v: string) => void; onKill: () => void
  friends: any[]; onlineList: string[]; hasSubscription: boolean
}) {
  const [news, setNews] = useState<any[]>([])
  const [selectedNews, setSelectedNews] = useState<any>(null)
  const fetchNews = () => {
    fetch('http://localhost:3001/api/news')
      .then(r => r.json()).then(d => {
        if (Array.isArray(d)) setNews(d.slice(0, 5))
      }).catch(() => {})
  }

  useEffect(() => { fetchNews()   }, [])

  const onlineFriends = friends.filter(f => onlineList.includes(f.name) || onlineList.includes(f.id))

  return (
    <div className="home-grid">
      <div className="home-main">
        <div className="panel hero-card">
          <div className="hero-body">
            <div className="hero-sub">{launchPid ? 'Running' : 'Ready to play'}</div>
            <h1 className="hero-title">Welcome back, {username}</h1>
            <div className="hero-tags">
              <span className="hero-tag">{selectedVer}</span>
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
          <div className="panel-title">Online Friends ({onlineFriends.length})</div>
          {onlineFriends.length === 0 ? (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', padding: '6px 0' }}>No friends online</div>
          ) : onlineFriends.map((f: any) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 2, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
              {f.name}
            </div>
          ))}
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
function InstancesTab({ selectedVer, setSelectedVer, jvm, instances, onAdd, onRemove, onLaunch, launching, launchPid, onKill }: {
  selectedVer: string; setSelectedVer: (v: string) => void; jvm: string
  instances: any[]; onAdd: (i: any) => void; onRemove: (id: number) => void
  onLaunch: (v: string) => void; launching: boolean; launchPid: number | null; onKill: () => void
}) {
  const [name, setName] = useState('My Instance')
  const [selectedIcon, setSelectedIcon] = useState('🌲')
  const [res, setRes] = useState('1280x720')
  const [editingId, setEditingId] = useState<number | null>(null)

  const createInstance = () => {
    onAdd({ name, version: selectedVer, icon: selectedIcon, resolution: res })
    setName('My Instance')
  }

  const launchInstance = (inst: any) => {
    onLaunch(inst.version)
  }

  return (
    <div className="tab-wrap" style={{ maxWidth: 'none' }}>
      <h2 className="tab-title">Instances</h2>
      <div className="instance-layout" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14 }}>
        <div className="panel" style={{ maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
          <div className="panel-title">Saved Instances</div>
          {instances.length === 0 ? (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', padding: '6px 0' }}>No instances yet. Create one!</div>
          ) : instances.map(inst => (
            <div key={inst.id} className={`inst-item ${editingId === inst.id ? 'active' : ''}`} onClick={() => setEditingId(inst.id)}>
              <span className="inst-icon" style={{ fontSize: 20 }}>{inst.icon || '🌲'}</span>
              <div className="inst-info">
                <span className="inst-name">{inst.name}</span>
                <span className="inst-meta">{inst.version} &middot; {inst.resolution || '1280x720'}</span>
              </div>
              <button className="promo-sub" style={{ padding: '3px 8px', fontSize: 9 }} onClick={e => { e.stopPropagation(); launchInstance(inst) }} disabled={launching}>
                {launching ? '...' : 'Play'}
              </button>
              <button style={{ background: 'none', border: 'none', color: 'rgba(255,100,100,0.5)', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} onClick={e => { e.stopPropagation(); onRemove(inst.id) }}>&#x2715;</button>
            </div>
          ))}
        </div>

        <div className="instance-edit">
          <div className="panel"><div className="panel-title">Instance Settings</div>
            <div className="set-row"><span className="set-label">Name</span><input className="set-input" style={{ width: 200 }} value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="set-row"><span className="set-label">Resolution</span>
              <select className="set-input" style={{ width: 110 }} value={res} onChange={e => setRes(e.target.value)}>
                <option>854x480</option><option>1280x720</option><option>1920x1080</option>
              </select>
            </div>
          </div>
          <div className="panel"><div className="panel-title">Version</div>
            <div className="ver-picker">
              {VERSIONS.map(v => (
                <button key={v} className={`ver-btn ${selectedVer === v ? 'active' : ''}`} onClick={() => setSelectedVer(v)}>{v}</button>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="panel-title" style={{ marginBottom: 8 }}>Icon</div>
              <div className="puzzle-grid">
                {['🌲','⛰️','🏜️','🏔️','🌊','🌋','🏝️','🏯','🏰','🌺','🍄','🌟'].map((e, i) => (
                  <div key={i} className={`puzzle-icon ${selectedIcon === e ? 'active' : ''}`} onClick={() => setSelectedIcon(e)}>{e}</div>
                ))}
              </div>
            </div>
          </div>
          <button className="hero-btn" style={{ alignSelf: 'flex-start' }} onClick={createInstance}>
            Create Instance
          </button>
        </div>
      </div>
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
    setInstallMsg(`Installing ${projectTitle}...`)
    try {
      const r = await fetch(`${MR_API}/project/${projectId}/version?loaders=%5B%22${loader}%22%5D&game_versions=%5B%221.21.4%22%5D`)
      const versions = await r.json()
      if (versions?.length > 0) {
        const primaryFiles = versions[0].files || []
        const jarFile = primaryFiles.find((f: any) => f.filename.endsWith('.jar'))
        if (jarFile?.url) {
          const a = document.createElement('a')
          a.href = jarFile.url; a.download = jarFile.filename
          document.body.appendChild(a); a.click(); a.remove()
          setInstallMsg(`Downloading ${jarFile.filename}...`)
          setTimeout(() => setInstallMsg(''), 3000)
        } else {
          setInstallMsg('No JAR available for this version')
          setTimeout(() => setInstallMsg(''), 2000)
        }
      } else {
        setInstallMsg('No compatible version found')
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
        <input className="modrinth-search" placeholder="Search..." value={query} onChange={e => setQuery(e.target.value)} />
      </div>
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
function ChatTab({ chatMsgs, onSend, onlineList, username, privateChatMsgs, onSendPrivate, partner, playerId, onClosePrivate }: {
  chatMsgs: any[]; onSend: (t: string) => void; onlineList: any[]; username: string
  privateChatMsgs: any[]; onSendPrivate: (to: string, t: string) => void
  partner: string | null; playerId: string; onClosePrivate: () => void
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

  return (
    <div className="chat-tab">
      <div className="panel chat-main">
        <div className="chat-head">
          <h3>{partner ? `Private: ${onlineNames.find((n: string) => n === '') || 'Chat'}` : 'Global Chat'}</h3>
          <span className="chat-online">● {onlineList.length} online</span>
          {partner && <button className="chat-send" style={{ marginLeft: 'auto', fontSize: 10 }} onClick={onClosePrivate}>Back to global</button>}
        </div>

        <div className="chat-msgs" ref={partner ? privRef : ref}>
          {(partner ? privMsgs : chatMsgs).map((m, i) => (
            <div key={i} className={`chat-msg ${m.type === 'system' ? 'chat-system' : ''} ${m.fromId === playerId || m.sent ? 'chat-self' : ''}`}>
              {m.time && <span className="chat-time">{m.time}</span>}
              {m.username && !m.sent && <span className="chat-who">{m.username}</span>}
              {m.sent && <span className="chat-who" style={{ color: 'rgba(255,255,255,0.2)' }}>you</span>}
              <span className="chat-body">{m.text}</span>
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
        <div className="panel"><h4>Online ({onlineList.length})</h4>
          {onlineList.map((o: any) => {
            const n = typeof o === 'string' ? o : o.name
            const id = typeof o === 'string' ? null : o.id
            return <div key={n} className="chat-user" onClick={() => id && onSendPrivate && onSendPrivate(id, '/')} style={{ cursor: id ? 'pointer' : 'default' }}><span className="d" />{n}</div>
          })}
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
  const API = 'http://localhost:3001'

  const searchPlayers = async (q: string) => {
    setSearchQ(q)
    if (q.trim().length < 1) { setSearchResults([]); return }
    try {
      const r = await fetch(`${API}/api/players/search?q=${encodeURIComponent(q)}`)
      const d = await r.json()
      setSearchResults(Array.isArray(d) ? d.filter((p: any) => p.id !== playerId) : [])
    } catch { setSearchResults([]) }
  }

  const addFriend = async (friendId: string) => {
    try {
      await fetch(`${API}/api/friends/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, friendId }) })
      const r = await fetch(`${API}/api/friends?playerId=${playerId}`)
      const d = await r.json()
      if (Array.isArray(d)) setFriends(d)
      setSearchQ(''); setSearchResults([])
    } catch {}
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
        {searchResults.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {searchResults.map(p => (
              <div key={p.id} className="friend-row" style={{ cursor: 'pointer', borderRadius: 8, marginBottom: 2 }} onClick={() => addFriend(p.id)}>
                <div className="friend-av" style={{ background: 'rgba(255,255,255,0.08)' }}>{p.name[0]}</div>
                <div className="friend-info">
                  <div className="friend-name">{p.name}</div>
                  <div className="friend-act" style={{ color: 'rgba(255,255,255,0.25)' }}>Click to send request</div>
                </div>
                <button className="promo-sub" style={{ padding: '4px 10px', fontSize: 10 }} onClick={e => { e.stopPropagation(); addFriend(p.id) }}>+ Add</button>
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
                  <div className="friend-name">{f.name}</div>
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
function ProfileTab({ username, playerId, uuid, skinUrl, setSkinUrl, capeUrl, setCapeUrl, mcToken }: {
  username: string; playerId: string; uuid: string; skinUrl: string; capeUrl: string
  setSkinUrl: (u: string) => void; setCapeUrl: (u: string) => void; mcToken: string
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

  useEffect(() => {
    let found = false
    // Path 1: Minecraft API (requires mcToken)
    if (mcToken) {
      fetch('https://api.minecraftservices.com/minecraft/profile', {
        headers: { Authorization: `Bearer ${mcToken}` }
      }).then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
        .then(d => {
          if (d?.capes?.length) {
            setOwnedCapes(d.capes)
            const active = d.capes.find((c: any) => c.state === 'ACTIVE')
            if (active?.url) { found = true; setCapeUrl(active.url.replace(/^http:/, 'https:')) }
            return
          }
          return fetch('https://api.minecraftservices.com/minecraft/profile/capes', {
            headers: { Authorization: `Bearer ${mcToken}` }
          }).then(r => r.ok ? r.json() : null)
        })
        .then(capesData => {
          if (capesData?.length) {
            setOwnedCapes(capesData)
            const active = capesData.find((c: any) => c.state === 'ACTIVE')
            if (active?.url) { found = true; setCapeUrl(active.url.replace(/^http:/, 'https:')) }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!found && uuid) fetchSessionServerCape(uuid, setCapeUrl)
        })
    } else if (uuid) {
      // Path 2: no token available, try session server directly
      fetchSessionServerCape(uuid, setCapeUrl)
    }
  }, [mcToken, uuid])

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
      try { v.loadCape(url, { backEquipment: showElytra ? 'elytra' : 'cape' }) } catch (e) { console.error('Cape load error:', e) }
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
    fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mcToken}`, 'Content-Type': 'application/json' },
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
    fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mcToken}` },
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
      fetch('https://api.minecraftservices.com/minecraft/profile/capes/active', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${mcToken}`, 'Content-Type': 'application/json' },
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
            <button className="promo-sub" style={{ padding: '4px 12px', fontSize: 10, background: 'rgba(255,255,255,0.05)' }} onClick={() => setServers(DEFAULT_SERVERS)}>
              Reset
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
