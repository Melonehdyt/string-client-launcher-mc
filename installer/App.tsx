import { useState, useEffect, useRef, CSSProperties } from 'react'

// ─── types ───────────────────────────────────────────────────────────────────

type Step = 'welcome' | 'license' | 'location' | 'installing' | 'done'

const STEPS: Step[] = ['welcome', 'license', 'location', 'installing', 'done']

const STEP_LABELS: Record<Step, string> = {
  welcome: 'Welcome',
  license: 'License',
  location: 'Location',
  installing: 'Installing',
  done: 'Complete',
}

const LICENSE_TEXT = `ELECTRON APP — END USER LICENSE AGREEMENT

Copyright © 2026 Orbital Systems, Inc. All rights reserved.

IMPORTANT — READ CAREFULLY: This End User License Agreement ("EULA") is a legal agreement between you (either an individual or a single entity) and Orbital Systems, Inc. ("Orbital") for the software product identified above, which includes computer software and may include associated media, printed materials, and online or electronic documentation ("SOFTWARE PRODUCT").

By installing, copying, or otherwise using the SOFTWARE PRODUCT, you agree to be bound by the terms of this EULA. If you do not agree to the terms of this EULA, do not install or use the SOFTWARE PRODUCT.

1. GRANT OF LICENSE
Orbital grants you a non-exclusive, non-transferable license to install and use one copy of the SOFTWARE PRODUCT on a single computer for your personal or internal business purposes.

2. RESTRICTIONS
You may not: (a) sublicense, sell, resell, transfer, assign, or otherwise commercially exploit the SOFTWARE PRODUCT; (b) modify or make derivative works based upon the SOFTWARE PRODUCT; (c) reverse engineer or access the SOFTWARE PRODUCT in order to build a competitive product.

3. OWNERSHIP
The SOFTWARE PRODUCT is licensed, not sold. Orbital retains all right, title, and interest in and to the SOFTWARE PRODUCT, including all intellectual property rights therein.

4. DISCLAIMER OF WARRANTIES
THE SOFTWARE PRODUCT IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT.

5. LIMITATION OF LIABILITY
IN NO EVENT SHALL ORBITAL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES.`

const INSTALL_STEPS = [
  { label: 'Verifying system requirements', duration: 800 },
  { label: 'Extracting core files', duration: 1400 },
  { label: 'Installing runtime dependencies', duration: 1800 },
  { label: 'Configuring application modules', duration: 1200 },
  { label: 'Writing registry entries', duration: 700 },
  { label: 'Creating shortcuts', duration: 500 },
  { label: 'Finalizing installation', duration: 900 },
]

// ─── shared style primitives ──────────────────────────────────────────────────

const glass: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
}

const glassStrong: CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  border: '1px solid rgba(255,255,255,0.12)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
}

// ─── button styles ────────────────────────────────────────────────────────────

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

// ─── sub-components ───────────────────────────────────────────────────────────

function StepDot({ active, done, label, idx }: { active: boolean; done: boolean; label: string; idx: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: done || active ? 1 : 0.25 }}>
      <div style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'JetBrains Mono, monospace',
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
        fontSize: 11,
        fontWeight: active ? 600 : 400,
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
          position: 'absolute',
          inset: -20,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
          animation: 'pulse-glow 3s ease-in-out infinite',
        }} />
        <div style={{
          width: 80,
          height: 80,
          borderRadius: 22,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}>
          <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
            <circle cx="19" cy="19" r="8" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" fill="none" />
            <ellipse cx="19" cy="19" rx="18" ry="7" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" fill="none" />
            <ellipse cx="19" cy="19" rx="18" ry="7" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" fill="none" transform="rotate(60 19 19)" />
            <ellipse cx="19" cy="19" rx="18" ry="7" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" fill="none" transform="rotate(120 19 19)" />
            <circle cx="19" cy="19" r="2.5" fill="rgba(255,255,255,0.95)" />
          </svg>
        </div>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 12, textTransform: 'uppercase' }}>
          Setup Wizard
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff', margin: 0, marginBottom: 12, lineHeight: 1.2 }}>
          Welcome to Orbital
        </h1>
        <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.38)', lineHeight: 1.7, margin: 0 }}>
          This wizard will guide you through installing Orbital v3.2.1 on your machine. The process takes less than a minute.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Platform', value: 'macOS 14.5' },
          { label: 'Arch', value: 'arm64' },
          { label: 'Size', value: '142 MB' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            ...glass,
            borderRadius: 8,
            padding: '6px 14px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
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

function LocationStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [path, setPath] = useState('/Applications/Orbital.app')
  const [components, setComponents] = useState({ core: true, cli: true, updater: true, themes: false })
  const totalSize = (components.core ? 98 : 0) + (components.cli ? 12 : 0) + (components.updater ? 8 : 0) + (components.themes ? 24 : 0)

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 20 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 6 }}>Step 02</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Installation Location</h2>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.32)', margin: '6px 0 0' }}>Choose where Orbital will be installed and select components.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>Install Path</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ ...glass, borderRadius: 8, flex: 1, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <path d="M1 3.5A1.5 1.5 0 012.5 2h2.586a1 1 0 01.707.293L7 3.5h4.5A1.5 1.5 0 0113 5v5.5A1.5 1.5 0 0111.5 12h-9A1.5 1.5 0 011 10.5v-7z" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" fill="none"/>
            </svg>
            <input
              value={path}
              onChange={e => setPath(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.8)', padding: '10px 0' }}
            />
          </div>
          <button style={{ ...ghostBtn, padding: '0 14px', fontSize: 11 }}>Browse</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: 'JetBrains Mono, monospace' }}>
          <span>Available: 284.2 GB</span>
          <span>Required: {totalSize} MB</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 2 }}>Components</label>
        {([
          { key: 'core', label: 'Core Application', desc: 'Required runtime and UI', size: '98 MB', required: true },
          { key: 'cli', label: 'Command Line Tools', desc: 'Terminal integration', size: '12 MB', required: false },
          { key: 'updater', label: 'Auto-Updater', desc: 'Keeps Orbital up to date', size: '8 MB', required: false },
          { key: 'themes', label: 'Additional Themes', desc: 'Extended theme library', size: '24 MB', required: false },
        ] as const).map(({ key, label, desc, size, required }) => (
          <div
            key={key}
            onClick={() => !required && setComponents(c => ({ ...c, [key]: !c[key] }))}
            style={{
              ...glass,
              borderRadius: 9,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: required ? 'default' : 'pointer',
              transition: 'background 0.2s ease',
              border: components[key] ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0, transition: 'all 0.2s ease',
              border: components[key] ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.15)',
              background: components[key] ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {components[key] && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{label}</span>
                {required && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em' }}>required</span>}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{desc}</div>
            </div>
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>{size}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 'auto' }}>
        <button onClick={onBack} style={ghostBtn}>← Back</button>
        <button onClick={onNext} style={primaryBtn}>Install Now →</button>
      </div>
    </div>
  )
}

function InstallingStep({ onDone }: { onDone: () => void }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let currentStep = 0
    let currentProgress = 0

    function runStep(idx: number) {
      if (cancelled || idx >= INSTALL_STEPS.length) {
        if (!cancelled) { setDone(true); setProgress(100); setTimeout(() => !cancelled && onDone(), 1200) }
        return
      }
      const step = INSTALL_STEPS[idx]
      setStepIdx(idx)
      setLog(l => [...l, `→ ${step.label}...`])
      const startProgress = currentProgress
      const endProgress = Math.round(((idx + 1) / INSTALL_STEPS.length) * 100)
      const startTime = Date.now()
      const tick = () => {
        if (cancelled) return
        const elapsed = Date.now() - startTime
        const t = Math.min(elapsed / step.duration, 1)
        const eased = 1 - Math.pow(1 - t, 3)
        setProgress(Math.round(startProgress + (endProgress - startProgress) * eased))
        if (t < 1) { requestAnimationFrame(tick) }
        else {
          currentProgress = endProgress
          currentStep = idx + 1
          setLog(l => [...l, `✓ Done (${(step.duration / 1000).toFixed(1)}s)`])
          setTimeout(() => runStep(currentStep), 80)
        }
      }
      requestAnimationFrame(tick)
    }

    runStep(0)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 24 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 6 }}>Step 03</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
          {done ? 'Installation Complete' : 'Installing Orbital'}
        </h2>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.32)', margin: '6px 0 0' }}>
          {done ? 'All components installed successfully.' : `${INSTALL_STEPS[Math.min(stepIdx, INSTALL_STEPS.length - 1)].label}…`}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <div style={{ position: 'relative', width: 96, height: 96 }}>
          <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle
              cx="48" cy="48" r="40" fill="none"
              stroke={done ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)'}
              strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - progress / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.1s linear' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {done
              ? <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 14l7 7 11-12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
              background: 'rgba(255,255,255,0.85)', transition: 'width 0.1s linear',
              boxShadow: '0 0 8px rgba(255,255,255,0.3)',
            }} />
            {!done && (
              <div style={{
                position: 'absolute', top: 0, height: '100%', width: 60,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                animation: 'shimmer 1.2s ease-in-out infinite', left: `${progress}%`,
              }} />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {INSTALL_STEPS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0, transition: 'all 0.3s ease',
                  background: i < stepIdx || done ? 'rgba(255,255,255,0.7)' : i === stepIdx && !done ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.1)',
                  boxShadow: i === stepIdx && !done ? '0 0 6px rgba(255,255,255,0.5)' : 'none',
                }} />
                <span style={{
                  fontSize: 11,
                  color: i < stepIdx || done ? 'rgba(255,255,255,0.55)' : i === stepIdx && !done ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                  transition: 'color 0.3s ease',
                  fontFamily: i === stepIdx && !done ? 'JetBrains Mono, monospace' : 'inherit',
                }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={logRef} style={{ ...glass, borderRadius: 10, padding: '12px 16px', flex: 1, overflowY: 'auto', maxHeight: 130, fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, lineHeight: 1.8 }}>
        {log.map((line, i) => (
          <div key={i} style={{ color: line.startsWith('✓') ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.32)' }}>{line}</div>
        ))}
        {!done && <span style={{ color: 'rgba(255,255,255,0.4)', animation: 'pulse-glow 1s ease-in-out infinite' }}>▋</span>}
      </div>
    </div>
  )
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
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
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em', marginBottom: 10 }}>Orbital Installed</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.7, margin: 0 }}>
          Version 3.2.1 has been successfully installed. A shortcut has been added to your Applications folder.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', maxWidth: 360 }}>
        {[
          { label: 'Version', value: '3.2.1' },
          { label: 'Installed', value: '118 MB' },
          { label: 'Location', value: '/Applications' },
          { label: 'Build', value: 'stable-2026' },
        ].map(({ label, value }) => (
          <div key={label} style={{ ...glass, borderRadius: 9, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.8)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onFinish} style={ghostBtn}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginRight: 5 }}>
            <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="7" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="1" y="7" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="7" y="7" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          View Apps
        </button>
        <button onClick={onFinish} style={primaryBtn}>
          Launch Orbital
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginLeft: 6 }}>
            <path d="M2 11L11 2M11 2H5M11 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [step, setStep] = useState<Step>('welcome')

  const next = () => setStep(s => STEPS[STEPS.indexOf(s) + 1] as Step)
  const back = () => setStep(s => STEPS[STEPS.indexOf(s) - 1] as Step)
  const startInstall = () => setStep('installing')

  const stepIdx = STEPS.indexOf(step)

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>

      {/* Installer window */}
      <div style={{
        borderRadius: 20,
        width: '100%',
        maxWidth: 720,
        minHeight: 520,
        display: 'flex',
        overflow: 'hidden',
        boxShadow: '0 40px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)',
        margin: 24,
        position: 'relative',
      }}>
        {/* Video inside the installer window */}
        <video
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'grayscale(100%) contrast(1.15) brightness(0.6)',
          }}
        >
          <source src="https://stringclient.com/media/launcherbackground.mp4" type="video/mp4" />
        </video>

        {/* Dark overlay so glass content stays readable */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)', pointerEvents: 'none' }} />
        {/* Sidebar */}
        <div style={{
          width: 176,
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          display: 'flex',
          flexDirection: 'column',
          padding: '28px 20px',
          gap: 6,
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="3" stroke="rgba(255,255,255,0.85)" strokeWidth="1" fill="none"/>
                  <ellipse cx="6.5" cy="6.5" rx="6" ry="2.4" stroke="rgba(255,255,255,0.4)" strokeWidth="0.9" fill="none"/>
                  <ellipse cx="6.5" cy="6.5" rx="6" ry="2.4" stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" fill="none" transform="rotate(60 6.5 6.5)"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>Orbital</div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace' }}>v3.2.1</div>
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
              <div>Orbital Systems</div>
              <div>© 2026</div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: '32px 36px', display: 'flex', flexDirection: 'column', minHeight: 520, position: 'relative', zIndex: 1, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}>
          {step === 'welcome' && <WelcomeStep onNext={next} />}
          {step === 'license' && <LicenseStep onNext={next} onBack={back} />}
          {step === 'location' && <LocationStep onNext={startInstall} onBack={back} />}
          {step === 'installing' && <InstallingStep onDone={() => setStep('done')} />}
          {step === 'done' && <DoneStep onFinish={() => setStep('welcome')} />}
        </div>
      </div>
    </div>
  )
}
