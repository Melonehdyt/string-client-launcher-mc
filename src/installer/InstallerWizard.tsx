import { useState, useEffect, useRef, CSSProperties } from 'react'
import logo from '../assets/logo.png'

const APP_NAME = 'String Client'
const APP_VERSION = '1.0.0'
const BG_VIDEO = 'https://stringclient.com/media/launcherbackground.mp4'

type Step = 'welcome' | 'license' | 'location' | 'installing' | 'done'

const STEPS: Step[] = ['welcome', 'license', 'location', 'installing', 'done']

const STEP_LABELS: Record<Step, string> = {
  welcome: 'Welcome',
  license: 'License',
  location: 'Location',
  installing: 'Installing',
  done: 'Complete',
}

const LICENSE_TEXT = `STRING CLIENT — END USER LICENSE AGREEMENT

Copyright © 2026 String Client. All rights reserved.

IMPORTANT — READ CAREFULLY: This End User License Agreement ("EULA") is a legal agreement between you (either an individual or a single entity) and String Client for the software product identified above, which includes computer software and may include associated media, printed materials, and online or electronic documentation ("SOFTWARE PRODUCT").

By installing, copying, or otherwise using the SOFTWARE PRODUCT, you agree to be bound by the terms of this EULA. If you do not agree to the terms of this EULA, do not install or use the SOFTWARE PRODUCT.

1. GRANT OF LICENSE
String Client grants you a non-exclusive, non-transferable license to install and use one copy of the SOFTWARE PRODUCT on a single computer for your personal use.

2. RESTRICTIONS
You may not: (a) sublicense, sell, resell, transfer, assign, or otherwise commercially exploit the SOFTWARE PRODUCT; (b) modify or make derivative works based upon the SOFTWARE PRODUCT; (c) reverse engineer or access the SOFTWARE PRODUCT in order to build a competitive product.

3. OWNERSHIP
The SOFTWARE PRODUCT is licensed, not sold. String Client retains all right, title, and interest in and to the SOFTWARE PRODUCT, including all intellectual property rights therein.

4. DISCLAIMER OF WARRANTIES
THE SOFTWARE PRODUCT IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT.

5. LIMITATION OF LIABILITY
IN NO EVENT SHALL STRING CLIENT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES.

6. THIRD-PARTY SERVICES
This software interacts with Mojang Studios and Microsoft services. You must comply with their respective terms of service.`

const INSTALL_STEPS = [
  { label: 'Verifying system requirements', duration: 800 },
  { label: 'Extracting core files', duration: 1400 },
  { label: 'Installing runtime dependencies', duration: 1800 },
  { label: 'Configuring application modules', duration: 1200 },
  { label: 'Writing registry entries', duration: 700 },
  { label: 'Creating shortcuts', duration: 500 },
  { label: 'Finalizing installation', duration: 900 },
]

const glass: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
}

const primaryBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '9px 20px',
  borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(255,255,255,0.12)',
  color: '#ffffff',
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  transition: 'all 0.2s ease',
  letterSpacing: '0.01em',
  boxShadow: '0 2px 12px rgba(255,255,255,0.08)',
}

const ghostBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '9px 16px',
  borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.5)',
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  transition: 'all 0.2s ease',
  letterSpacing: '0.01em',
}

function StepDot({ active, done, label, idx }: { active: boolean; done: boolean; label: string; idx: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: done || active ? 1 : 0.25 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
        transition: 'all 0.3s ease',
        ...(done
          ? { background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff' }
          : active
          ? { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.6)', color: '#fff', boxShadow: '0 0 10px rgba(255,255,255,0.2)' }
          : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)' }),
      }}>
        {done ? '✓' : idx + 1}
      </div>
      <span style={{
        fontSize: 11, fontWeight: active ? 600 : 400,
        letterSpacing: '0.04em',
        color: done ? 'rgba(255,255,255,0.8)' : active ? '#fff' : 'rgba(255,255,255,0.3)',
        transition: 'color 0.3s ease',
      }}>
        {label}
      </span>
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 32 }}>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: -20, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
          animation: 'pulse-glow 3s ease-in-out infinite',
        }} />
        <img src={logo} alt={APP_NAME} style={{
          width: 80, height: 80, borderRadius: 22,
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          objectFit: 'cover',
        }} />
      </div>

      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 12, textTransform: 'uppercase' }}>
          Setup Wizard
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff', margin: 0, marginBottom: 12, lineHeight: 1.2 }}>
          Welcome to {APP_NAME}
        </h1>
        <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.38)', lineHeight: 1.7, margin: 0 }}>
          This wizard will guide you through installing {APP_NAME} v{APP_VERSION} on your machine. The process takes less than a minute.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Platform', value: 'Windows' },
          { label: 'Size', value: '~250 MB' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            ...glass, borderRadius: 8, padding: '6px 14px',
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}>{label}</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      <button onClick={onNext} style={primaryBtn}>
        Get Started
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: 6 }}>
          <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

function LicenseStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [agreed, setAgreed] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (!ref.current) return
    const { scrollTop, scrollHeight, clientHeight } = ref.current
    if (scrollTop + clientHeight >= scrollHeight - 20) setScrolled(true)
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 20 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 6 }}>Step 01</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>License Agreement</h2>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.32)', margin: '6px 0 0', lineHeight: 1.6 }}>Please read and accept the terms before continuing.</p>
      </div>

      <div ref={ref} onScroll={handleScroll} style={{ ...glass, borderRadius: 12, padding: '16px 20px', flex: 1, overflowY: 'auto', maxHeight: 260, position: 'relative' }}>
        <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, lineHeight: 1.8, color: 'rgba(255,255,255,0.38)', whiteSpace: 'pre-wrap', margin: 0 }}>
          {LICENSE_TEXT}
        </pre>
        {!scrolled && (
          <div style={{
            position: 'sticky', bottom: 0, left: 0, right: 0, height: 48,
            background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4,
            fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace',
          }}>SCROLL TO READ ↓</div>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}>
        <div onClick={() => setAgreed(a => !a)} style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, transition: 'all 0.2s ease',
          border: agreed ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.15)',
          background: agreed ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {agreed && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          I have read and agree to the <span style={{ color: 'rgba(255,255,255,0.85)' }}>End User License Agreement</span>
        </span>
      </label>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <button onClick={onBack} style={ghostBtn}>← Back</button>
        <button onClick={onNext} disabled={!agreed} style={{ ...primaryBtn, opacity: agreed ? 1 : 0.25, cursor: agreed ? 'pointer' : 'not-allowed' }}>
          Accept & Continue →
        </button>
      </div>
    </div>
  )
}

function LocationStep({ onNext, onBack, installPath, onPathChange }: {
  onNext: (opts: { desktopShortcut: boolean; startMenuShortcut: boolean }) => void; onBack: () => void
  installPath: string; onPathChange: (p: string) => void
}) {
  const [desktopShortcut, setDesktopShortcut] = useState(true)
  const [startMenuShortcut, setStartMenuShortcut] = useState(true)
  const api = (window as any).electronAPI

  const handleBrowse = async () => {
    if (api?.selectInstallPath) {
      const p = await api.selectInstallPath()
      if (p) onPathChange(p)
    }
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 20 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 6 }}>Step 02</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Installation Location</h2>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.32)', margin: '6px 0 0' }}>Choose where {APP_NAME} will be installed and configure options.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>Install Path</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ ...glass, borderRadius: 8, flex: 1, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <path d="M1 3.5A1.5 1.5 0 012.5 2h2.586a1 1 0 01.707.293L7 3.5h4.5A1.5 1.5 0 0113 5v5.5A1.5 1.5 0 0111.5 12h-9A1.5 1.5 0 011 10.5v-7z" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" fill="none"/>
            </svg>
            <input
              value={installPath}
              readOnly
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.8)', padding: '10px 0' }}
            />
          </div>
          <button onClick={handleBrowse} style={{ ...ghostBtn, padding: '0 14px', fontSize: 11 }}>Browse</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: 'JetBrains Mono, monospace' }}>
          <span>Required: ~250 MB</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 2 }}>Shortcuts</label>
        {[
          { key: 'desktop', label: 'Desktop Shortcut', desc: 'Add shortcut to your desktop', on: desktopShortcut, toggle: () => setDesktopShortcut(d => !d), required: false },
          { key: 'startmenu', label: 'Start Menu Entry', desc: 'Add to Windows Start Menu', on: startMenuShortcut, toggle: () => setStartMenuShortcut(d => !d), required: false },
        ].map(({ key, label, desc, on, toggle, required }) => (
          <div
            key={key}
            onClick={() => !required && toggle()}
            style={{
              ...glass, borderRadius: 9, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: required ? 'default' : 'pointer',
              transition: 'background 0.2s ease',
              border: on ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0, transition: 'all 0.2s ease',
              border: on ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.15)',
              background: on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {on && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{label}</span>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 'auto' }}>
        <button onClick={onBack} style={ghostBtn}>← Back</button>
        <button onClick={() => onNext({ desktopShortcut, startMenuShortcut })} style={primaryBtn}>Install Now →</button>
      </div>
    </div>
  )
}

function InstallingStep({ onDone, installPromise }: { onDone: () => void; installPromise: Promise<any> }) {
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [log, setLog] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const api = (window as any).electronAPI

  useEffect(() => {
    if (api?.onInstallLog) {
      api.onInstallLog((msg: string) => {
        setLog(prev => [...prev, msg])
      })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let start = Date.now()
    const tick = () => {
      if (cancelled || done) return
      const elapsed = Date.now() - start
      const pct = Math.min(Math.round((elapsed / 30000) * 85), 85)
      setProgress(pct)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => { cancelled = true }
  }, [done])

  useEffect(() => {
    installPromise.then((result: any) => {
      if (result.error) {
        setLog(prev => [...prev, `✗ ${result.error}`])
        setError(result.error)
        setDone(true)
      } else {
        setLog(prev => [...prev, '✓ Installation complete!'])
        setProgress(100)
        setDone(true)
      }
    }).catch((e: any) => {
      setLog(prev => [...prev, `✗ ${e.message}`])
      setError(e.message)
      setDone(true)
    })
  }, [])

  useEffect(() => {
    if (done && !error) {
      const t = setTimeout(() => onDone(), 1500)
      return () => clearTimeout(t)
    }
  }, [done, error])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 24 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 6 }}>Step 03</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
          {error ? 'Installation Failed' : done ? 'Installation Complete' : `Installing ${APP_NAME}`}
        </h2>
        <p style={{ fontSize: 12.5, color: error ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.32)', margin: '6px 0 0' }}>
          {error ? error : done ? 'All components installed successfully.' : 'Please wait while files are copied...'}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <div style={{ position: 'relative', width: 96, height: 96 }}>
          <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle
              cx="48" cy="48" r="40" fill="none"
              stroke={error ? 'rgba(255,80,80,0.8)' : done ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)'}
              strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - progress / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.2s linear' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {done
              ? error
                ? <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M8 8l12 12M20 8l-12 12" stroke="rgba(255,80,80,0.9)" strokeWidth="2" strokeLinecap="round"/></svg>
                : <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 14l7 7 11-12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : <>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#fff', lineHeight: 1 }}>{progress}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono, monospace' }}>%</span>
                </>
            }
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 10, position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress}%`, borderRadius: 2,
              background: error ? 'rgba(255,80,80,0.8)' : 'rgba(255,255,255,0.85)',
              boxShadow: error ? '0 0 8px rgba(255,80,80,0.3)' : '0 0 8px rgba(255,255,255,0.3)',
            }} />
            {!done && (
              <div style={{
                position: 'absolute', top: 0, height: '100%', width: 60,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                animation: 'shimmer 1.2s ease-in-out infinite', left: `${progress}%`,
              }} />
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
          <button onClick={() => onDone()} style={primaryBtn}>Back to Setup</button>
        </div>
      )}

      <div ref={logRef} style={{ ...glass, borderRadius: 10, padding: '12px 16px', flex: 1, overflowY: 'auto', maxHeight: 130, fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, lineHeight: 1.8 }}>
        {log.map((line, i) => (
          <div key={i} style={{ color: line.startsWith('✓') ? 'rgba(255,255,255,0.55)' : line.startsWith('✗') ? 'rgba(255,80,80,0.6)' : 'rgba(255,255,255,0.32)' }}>{line}</div>
        ))}
        {!done && <span style={{ color: 'rgba(255,255,255,0.4)', animation: 'pulse-glow 1s ease-in-out infinite' }}>▋</span>}
      </div>
    </div>
  )
}

function DoneStep({ onFinish, installPath }: { onFinish: () => void; installPath: string }) {
  const [launchAfter, setLaunchAfter] = useState(true)
  const api = (window as any).electronAPI

  const handleFinish = () => {
    localStorage.setItem('sc_installed', 'true')
    if (launchAfter && api?.launchInstalled) {
      api.launchInstalled(installPath)
    }
    onFinish()
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 28, textAlign: 'center' }}>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: -24, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)',
          animation: 'pulse-glow 2.5s ease-in-out infinite',
        }} />
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 32px rgba(255,255,255,0.08)',
        }}>
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
            <path d="M6 15l7 7 11-13" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <div style={{ maxWidth: 320 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em', marginBottom: 10 }}>{APP_NAME} Installed</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.7, margin: 0 }}>
          Version {APP_VERSION} has been successfully installed. Shortcuts have been added to your desktop and Start Menu.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', maxWidth: 360 }}>
        {[
          { label: 'Version', value: APP_VERSION },
          { label: 'Size', value: '~250 MB' },
          { label: 'Location', value: installPath.replace(/^.*[\\/]/, '...') },
          { label: 'Build', value: 'release' },
        ].map(({ label, value }) => (
          <div key={label} style={{ ...glass, borderRadius: 9, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.8)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
          </div>
        ))}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}>
        <div onClick={() => setLaunchAfter(a => !a)} style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, transition: 'all 0.2s ease',
          border: launchAfter ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.15)',
          background: launchAfter ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {launchAfter && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          Launch <span style={{ color: 'rgba(255,255,255,0.85)' }}>{APP_NAME}</span> now
        </span>
      </label>

      <button onClick={handleFinish} style={primaryBtn}>
        Finish
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginLeft: 6 }}>
          <path d="M2 11L11 2M11 2H5M11 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

export default function InstallerWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome')
  const [installPath, setInstallPath] = useState('')
  const [installPromise, setInstallPromise] = useState<Promise<any> | null>(null)
  const api = (window as any).electronAPI

  useEffect(() => {
    if (api?.getDefaultInstallPath) {
      api.getDefaultInstallPath().then((p: string) => {
        if (p) setInstallPath(p)
      })
    }
  }, [])

  const next = () => setStep(s => STEPS[STEPS.indexOf(s) + 1] as Step)
  const back = () => setStep(s => STEPS[STEPS.indexOf(s) - 1] as Step)

  const startInstall = (opts: { desktopShortcut: boolean; startMenuShortcut: boolean }) => {
    setStep('installing')

    if (api?.installApp) {
      const promise = api.installApp({ installPath, ...opts })
      setInstallPromise(promise)
    }
  }

  const stepIdx = STEPS.indexOf(step)

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
      {/* Title bar */}
      <div style={{...(Object.assign({ WebkitAppRegion: 'drag' } as any, {
        height: 36, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 12px 0 16px',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        zIndex: 10, position: 'relative',
      }))}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={logo} alt={APP_NAME} style={{ width: 18, height: 18, borderRadius: 5, objectFit: 'cover' }} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.02em' }}>{APP_NAME} Setup</span>
        </div>
        <div style={{...(Object.assign({ WebkitAppRegion: 'no-drag' } as any, { display: 'flex', gap: 4 }))}}>
          <button
            onClick={() => (window as any).electronAPI?.minimize()}
            style={{
              width: 36, height: 24, border: 'none', background: 'transparent',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              fontFamily: 'JetBrains Mono, monospace', transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >—</button>
          <button
            onClick={() => (window as any).electronAPI?.close()}
            style={{
              width: 36, height: 24, border: 'none', background: 'transparent',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              fontFamily: 'JetBrains Mono, monospace', transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,60,60,0.25)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
          >✕</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <video autoPlay muted loop playsInline style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', filter: 'grayscale(100%) contrast(1.15) brightness(0.6)',
        }}>
          <source src={BG_VIDEO} type="video/mp4" />
        </video>

        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)', pointerEvents: 'none' }} />

        {/* Sidebar */}
        <div style={{
          width: 176, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          display: 'flex', flexDirection: 'column', padding: '28px 20px', gap: 6,
          position: 'relative', zIndex: 1,
        }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={logo} alt={APP_NAME} style={{
                width: 28, height: 28, borderRadius: 7,
                objectFit: 'cover',
              }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{APP_NAME}</div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace' }}>v{APP_VERSION}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {STEPS.slice(0, -1).map((s, i) => {
              const si = STEPS.indexOf(step)
              return (
                <StepDot
                  key={s}
                  idx={i}
                  label={STEP_LABELS[s]}
                  active={si === i || (s === 'installing' && si === STEPS.indexOf('done'))}
                  done={si > i && !(s === 'installing' && si === STEPS.indexOf('installing'))}
                />
              )
            })}
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.7 }}>
              <div>String Client</div>
              <div>© 2026</div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: '32px 36px', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}>
          {step === 'welcome' && <WelcomeStep onNext={next} />}
          {step === 'license' && <LicenseStep onNext={next} onBack={back} />}
          {step === 'location' && <LocationStep onNext={(opts) => startInstall(opts)} onBack={back} installPath={installPath} onPathChange={setInstallPath} />}
          {step === 'installing' && installPromise && <InstallingStep onDone={() => setStep('done')} installPromise={installPromise} />}
          {step === 'done' && <DoneStep onFinish={onComplete} installPath={installPath} />}
        </div>
      </div>
    </div>
  )
}
