import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const files = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'config.js',
  'options.html',
  'options.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
]

function origin(value: string): string {
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('A Trusten HTTP(S) origin is required')
  return url.origin
}

export async function extensionEntries(
  serviceOrigin: string,
  dashboardOrigin = serviceOrigin,
  supplied?: Map<string, Buffer>,
): Promise<Map<string, Buffer>> {
  const service = origin(serviceOrigin)
  const dashboard = origin(dashboardOrigin)
  const entries = new Map<string, Buffer>(supplied)
  if (!supplied)
    for (const name of files)
      entries.set(name, await readFile(new URL(name, import.meta.url)))
  const manifest = JSON.parse(entries.get('manifest.json')!.toString())
  manifest.host_permissions = [`${service}/*`]
  entries.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)))
  const config = entries
    .get('config.js')!
    .toString()
    .replace(
      /const TRUSTEN_DEFAULTS = \{[\s\S]*?\n\}/,
      `const TRUSTEN_DEFAULTS = ${JSON.stringify({ serverOrigin: service, dashboardOrigin: dashboard })}`,
    )
  entries.set('config.js', Buffer.from(config))
  return entries
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Store a small, dependency-free ZIP. Entry paths come only from the fixed file list. */
export function zipEntries(entries: Map<string, Buffer>): Buffer {
  const chunks: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const [filename, bytes] of entries) {
    const name = Buffer.from(filename)
    const crc = crc32(bytes)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x21, 12) // 1980-01-01, the earliest DOS date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(bytes.length, 18)
    local.writeUInt32LE(bytes.length, 22)
    local.writeUInt16LE(name.length, 26)
    chunks.push(local, name, bytes)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(bytes.length, 20)
    central.writeUInt32LE(bytes.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    directory.push(central, name)
    offset += local.length + name.length + bytes.length
  }
  const central = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.size, 8)
  end.writeUInt16LE(entries.size, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, central, end])
}

export async function buildExtensionZip(
  serviceOrigin: string,
  dashboardOrigin = serviceOrigin,
  supplied?: Map<string, Buffer>,
): Promise<Buffer> {
  return zipEntries(
    await extensionEntries(serviceOrigin, dashboardOrigin, supplied),
  )
}

// CLI: bun apps/trusten-ext/package.ts https://trusten.example [dashboard-origin] [output.zip]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { writeFile } = await import('node:fs/promises')
  const service = process.argv[2] || 'http://localhost:9200'
  const dashboard =
    process.argv[3] || (process.argv[2] ? service : 'http://localhost:5173')
  const destination = process.argv[4] || 'trusten-extension.zip'
  await writeFile(destination, await buildExtensionZip(service, dashboard))
  console.log(`Created ${destination}`)
}
