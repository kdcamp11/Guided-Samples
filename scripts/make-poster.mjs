// Generates a lightweight branded placeholder poster for the walkthrough video.
// The recorder overwrites this with a real first-frame thumbnail; this default
// just guarantees the landing embed never shows an empty video state.
//
//   node scripts/make-poster.mjs
//
// Zero dependencies — encodes a PNG by hand (gradient + play glyph).

import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'demo', 'grace-walkthrough-poster.png')
const W = 1024, H = 640

const buf = Buffer.alloc(W * H * 3)
const set = (x, y, r, g, b) => { const i = (y * W + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b }

// Subtle vertical gradient (near-black, matches the video letterbox).
for (let y = 0; y < H; y++) {
  const t = y / (H - 1)
  const r = Math.round(18 * (1 - t) + 4 * t)
  const g = Math.round(18 * (1 - t) + 4 * t)
  const b = Math.round(22 * (1 - t) + 6 * t)
  for (let x = 0; x < W; x++) set(x, y, r, g, b)
}

// Centered "play" triangle, lightly blended.
const cx = W / 2, cy = H / 2, tw = 120, th = 130
const ax = cx - tw / 2, ay1 = cy - th / 2, ay2 = cy + th / 2, bx = cx + tw / 2
const sign = (px, py, x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2)
for (let y = Math.floor(ay1) - 1; y <= Math.ceil(ay2) + 1; y++) {
  for (let x = Math.floor(ax) - 1; x <= Math.ceil(bx) + 1; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const d1 = sign(x, y, ax, ay1, bx, cy)
    const d2 = sign(x, y, bx, cy, ax, ay2)
    const d3 = sign(x, y, ax, ay2, ax, ay1)
    const inside = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
    if (inside) {
      const i = (y * W + x) * 3
      const a = 0.92
      buf[i] = Math.round(buf[i] * (1 - a) + 235 * a)
      buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + 235 * a)
      buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + 235 * a)
    }
  }
}

// ── Minimal PNG encoder (truecolor, 8-bit, no interlace) ──────────────────────
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
})()
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td), 0)
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2

const raw = Buffer.alloc(H * (W * 3 + 1))
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0
  buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, png)
console.log(`Wrote ${path.relative(ROOT, OUT)} (${(png.length / 1024).toFixed(1)} KB)`)
