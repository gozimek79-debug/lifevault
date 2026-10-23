import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = y * (size * 4 + 1) + 1 + x * 4
    raw[i] = r
    raw[i + 1] = g
    raw[i + 2] = b
    raw[i + 3] = 255
  }
  const bg = [17, 94, 89]
  const paper = [245, 245, 244]
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x += 1) set(x, y, bg[0], bg[1], bg[2])
  }
  const s = size
  const top = Math.round(s * 0.22)
  const mid = Math.round(s * 0.46)
  const left = Math.round(s * 0.28)
  const right = Math.round(s * 0.72)
  const bottom = Math.round(s * 0.78)
  for (let y = top; y <= mid; y += 1) {
    const t = (y - top) / (mid - top)
    const x0 = Math.round(s * 0.5 - t * s * 0.26)
    const x1 = Math.round(s * 0.5 + t * s * 0.26)
    for (let x = x0; x <= x1; x += 1) set(x, y, paper[0], paper[1], paper[2])
  }
  for (let y = mid; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) set(x, y, paper[0], paper[1], paper[2])
  }
  const doorL = Math.round(s * 0.44)
  const doorR = Math.round(s * 0.56)
  const doorT = Math.round(s * 0.56)
  for (let y = doorT; y <= bottom; y += 1) {
    for (let x = doorL; x <= doorR; x += 1) set(x, y, bg[0], bg[1], bg[2])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync(new URL('../public/icon-192.png', import.meta.url), png(192))
writeFileSync(new URL('../public/icon-512.png', import.meta.url), png(512))
