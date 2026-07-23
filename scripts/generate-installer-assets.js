const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', 'buildResources')

function createBMP(width, height, drawPixel) {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const fileSize = 14 + 40 + pixelDataSize

  const buf = Buffer.alloc(fileSize)
  let off = 0
  // BITMAPFILEHEADER (14 bytes)
  buf.write('BM', off, 2, 'ascii'); off += 2
  buf.writeUInt32LE(fileSize, off); off += 4
  buf.writeUInt16LE(0, off); off += 2
  buf.writeUInt16LE(0, off); off += 2
  buf.writeUInt32LE(14 + 40, off); off += 4
  // BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, off); off += 4
  buf.writeInt32LE(width, off); off += 4
  buf.writeInt32LE(height, off); off += 4
  buf.writeUInt16LE(1, off); off += 2
  buf.writeUInt16LE(24, off); off += 2
  buf.writeUInt32LE(0, off); off += 4
  buf.writeUInt32LE(pixelDataSize, off); off += 4
  buf.writeInt32LE(2835, off); off += 4
  buf.writeInt32LE(2835, off); off += 4
  buf.writeUInt32LE(0, off); off += 4
  buf.writeUInt32LE(0, off); off += 4
  // Pixel data (bottom-up BGR)
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const { b, g, r } = drawPixel(x, y, width, height)
      buf.writeUInt8(b, off); off += 1
      buf.writeUInt8(g, off); off += 1
      buf.writeUInt8(r, off); off += 1
    }
    off += rowSize - width * 3
  }
  return buf
}

// ── Sidebar bitmap (164x314) — Welcome/Finish page ──
const sidebar = createBMP(164, 314, (x, y, w, h) => {
  const t = y / h
  // Deep dark gradient #0a0a14 → #16163a
  let r = Math.round(10 + (22 - 10) * Math.pow(t, 0.7))
  let g = Math.round(10 + (22 - 10) * Math.pow(t, 0.7))
  let b = Math.round(20 + (58 - 20) * Math.pow(t, 0.7))

  // Accent stripe on left edge (#6366f1)
  if (x < 4) {
    const fade = 1 - (x / 4)
    r = Math.round(r + (99 - r) * fade * 0.7)
    g = Math.round(g + (102 - g) * fade * 0.7)
    b = Math.round(b + (241 - b) * fade * 0.7)
  }

  // Subtle diagonal lines pattern at the bottom
  const distFromBottom = h - y
  if (distFromBottom < 80) {
    const phase = (x + y) % 12
    if (phase < 1) {
      r = Math.min(255, r + 15)
      g = Math.min(255, g + 15)
      b = Math.min(255, b + 30)
    }
  }

  // Vignette: slightly darker at edges
  const edgeX = Math.min(x, w - x) / w
  const edgeY = Math.min(y, h - y) / h
  const vignette = 1 - (1 - Math.min(edgeX, edgeY)) * 0.15
  r = Math.round(r * vignette)
  g = Math.round(g * vignette)
  b = Math.round(b * vignette)

  return { b, g, r }
})
fs.writeFileSync(path.join(OUT_DIR, 'installerSidebar.bmp'), sidebar)
console.log('✓ installerSidebar.bmp (164x314)')

// ── Header bitmap (150x57) — shown at top of directory/instfiles pages ──
const header = createBMP(150, 57, (x, y, w, h) => {
  // Dark gradient #0e0e1a → #12122a
  const t = y / h
  const g = Math.round(14 + (18 - 14) * t)
  const b = Math.round(26 + (42 - 26) * t)
  return { b, g: g, r: 14 }
})
fs.writeFileSync(path.join(OUT_DIR, 'installerHeader.bmp'), header)
console.log('✓ installerHeader.bmp (150x57)')

// ── Small icon bar bitmap (bottom of installer) ──
const iconBar = createBMP(164, 30, (x, y, w, h) => {
  return { b: 14, g: 10, r: 10 }
})
fs.writeFileSync(path.join(OUT_DIR, 'installerIconBar.bmp'), iconBar)
console.log('✓ installerIconBar.bmp (164x30)')

console.log('✓ All installer assets generated')
