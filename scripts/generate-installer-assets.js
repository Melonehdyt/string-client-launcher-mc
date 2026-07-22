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

function drawSidebar(x, y, w, h) {
  const t = y / h
  const bg = lerpColor('#0d0d1a', '#1a1a3e', t)
  const accent = x < 3 ? '#6366f1' : bg
  return { b: parseInt(accent.slice(5,7),16), g: parseInt(accent.slice(3,5),16), r: parseInt(accent.slice(1,3),16) }
}

function drawHeader(x, y, w, h) {
  const bg = '#0d0d1a'
  return { b: parseInt(bg.slice(5,7),16), g: parseInt(bg.slice(3,5),16), r: parseInt(bg.slice(1,3),16) }
}

function lerpColor(a, b, t) {
  const ar = parseInt(a.slice(1,3),16), ag = parseInt(a.slice(3,5),16), ab = parseInt(a.slice(5,7),16)
  const br = parseInt(b.slice(1,3),16), bg = parseInt(b.slice(3,5),16), bb = parseInt(b.slice(5,7),16)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const b2 = Math.round(ab + (bb - ab) * t)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b2.toString(16).padStart(2,'0')}`
}

// Generate sidebar BMP (164x314) — Welcome/Finish page
const sidebar = createBMP(164, 314, (x, y, w, h) => {
  const t = y / h
  // Dark gradient #0d0d1a → #1a1a3e
  const r = Math.round(13 + (26 - 13) * t)
  const g = Math.round(13 + (26 - 13) * t)
  const b = Math.round(26 + (62 - 26) * t)
  // Accent line on left edge
  if (x < 3) return { b: 241, g: 102, r: 99 }
  return { b, g, r }
})
fs.writeFileSync(path.join(OUT_DIR, 'installerSidebar.bmp'), sidebar)
console.log('✓ installerSidebar.bmp (164x314)')

// Generate header BMP (150x57) — top of installer pages
const header = createBMP(150, 57, (x, y, w, h) => {
  return { b: 26, g: 13, r: 13 }
})
fs.writeFileSync(path.join(OUT_DIR, 'installerHeader.bmp'), header)
console.log('✓ installerHeader.bmp (150x57)')

// Generate welcome banner (164x314 version for installer)
console.log('✓ Done — installer assets ready')
