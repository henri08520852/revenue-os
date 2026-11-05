// Packs linkedin-extension/ into public/revenue-os-linkedin.zip (runs before every build,
// so the download in Einstellungen always matches the code). No dependencies.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SRC = path.join(__dirname, '..', 'linkedin-extension')
const OUT = path.join(__dirname, '..', 'public', 'revenue-os-linkedin.zip')
const ROOT = 'linkedin-extension/'

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = buf => {
  let c = 0xffffffff
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const files = fs.readdirSync(SRC).filter(f => fs.statSync(path.join(SRC, f)).isFile()).sort()
const locals = [], centrals = []
let offset = 0
for (const f of files) {
  const data = fs.readFileSync(path.join(SRC, f))
  const comp = zlib.deflateRawSync(data)
  const name = Buffer.from(ROOT + f)
  const crc = crc32(data)
  const head = Buffer.alloc(30)
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6)
  head.writeUInt16LE(8, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12)
  head.writeUInt32LE(crc, 14); head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22)
  head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28)
  locals.push(head, name, comp)
  const cen = Buffer.alloc(46)
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8)
  cen.writeUInt16LE(8, 10); cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14)
  cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24)
  cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42)
  centrals.push(cen, name)
  offset += 30 + name.length + comp.length
}
const cenBuf = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, Buffer.concat([...locals, cenBuf, end]))
console.log(`Extension zip: ${files.length} files → public/revenue-os-linkedin.zip`)
