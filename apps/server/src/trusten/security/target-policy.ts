import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type TargetPolicyErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_SCHEME'
  | 'CREDENTIALS_NOT_ALLOWED'
  | 'UNSAFE_PORT'
  | 'DNS_LOOKUP_FAILED'
  | 'NO_ADDRESSES'
  | 'NON_PUBLIC_ADDRESS'

export class TargetPolicyError extends Error {
  constructor(
    readonly code: TargetPolicyErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'TargetPolicyError'
  }
}

export interface AuthorizedTarget {
  /** Canonical URL safe to pass to the browser. Fragments are removed. */
  url: string
  hostname: string
  /** Every address returned by DNS, after normalization and validation. */
  addresses: readonly string[]
}

export type TargetResolver = (hostname: string) => Promise<readonly string[]>

export interface TargetPolicyOptions {
  resolver?: TargetResolver
  /** Explicit ports allowed in addition to the scheme's default port. */
  allowedPorts?: readonly number[]
}

const defaultResolver: TargetResolver = async (hostname) => {
  const answers = await lookup(hostname, { all: true, verbatim: true })
  return answers.map((answer) => answer.address)
}

/**
 * Validate a browser target at the point of use. Call this for the initial
 * document and again for every redirect and browser request; an earlier DNS
 * answer is not a durable authorization because DNS can change.
 */
export async function authorizeTarget(
  input: string,
  options: TargetPolicyOptions = {},
): Promise<AuthorizedTarget> {
  let target: URL
  try {
    target = new URL(input)
  } catch (cause) {
    throw new TargetPolicyError(
      'INVALID_URL',
      'Target is not a valid URL',
      cause,
    )
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new TargetPolicyError(
      'UNSUPPORTED_SCHEME',
      'Only HTTP and HTTPS targets are allowed',
    )
  }
  if (target.username || target.password) {
    throw new TargetPolicyError(
      'CREDENTIALS_NOT_ALLOWED',
      'Credentials in target URLs are not allowed',
    )
  }

  const port = target.port ? Number(target.port) : undefined
  const defaultPort = target.protocol === 'https:' ? 443 : 80
  const allowedPorts = new Set([defaultPort, ...(options.allowedPorts ?? [])])
  if (
    port !== undefined &&
    (!Number.isInteger(port) || !allowedPorts.has(port))
  ) {
    throw new TargetPolicyError('UNSAFE_PORT', 'Target port is not allowed')
  }

  const hostname = stripIpv6Brackets(target.hostname).toLowerCase()
  let addresses: readonly string[]
  if (isIP(hostname)) {
    addresses = [hostname]
  } else {
    try {
      addresses = await (options.resolver ?? defaultResolver)(hostname)
    } catch (cause) {
      throw new TargetPolicyError(
        'DNS_LOOKUP_FAILED',
        'Target hostname could not be resolved',
        cause,
      )
    }
  }

  const normalized = [...new Set(addresses.map(normalizeAddress))]
  if (normalized.length === 0) {
    throw new TargetPolicyError(
      'NO_ADDRESSES',
      'Target hostname has no addresses',
    )
  }
  for (const address of normalized) {
    if (!isPublicAddress(address)) {
      throw new TargetPolicyError(
        'NON_PUBLIC_ADDRESS',
        'Target resolves to a non-public address',
      )
    }
  }

  target.hash = ''
  return { url: target.href, hostname, addresses: normalized }
}

export function isPublicAddress(input: string): boolean {
  const address = normalizeAddress(input)
  const version = isIP(address)
  if (version === 4) return isPublicIpv4(address)
  if (version !== 6) return false

  const bytes = parseIpv6(address)
  if (!bytes) return false

  // IPv4-mapped addresses must inherit the embedded IPv4 classification.
  if (
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  ) {
    return isPublicIpv4(bytes.slice(12).join('.'))
  }

  // Public Internet IPv6 destinations are global unicast (2000::/3).
  if (!inPrefix(bytes, parseIpv6('2000::')!, 3)) return false

  // Exceptions inside global unicast that are reserved for documentation,
  // benchmarking, ORCHID, Teredo, or tunnelling rather than ordinary hosts.
  const blocked: Array<[string, number]> = [
    ['2001::', 32],
    ['2001:2::', 48],
    ['2001:10::', 28],
    ['2001:20::', 28],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20],
  ]
  return !blocked.some(([prefix, bits]) =>
    inPrefix(bytes, parseIpv6(prefix)!, bits),
  )
}

function normalizeAddress(address: string): string {
  const value = stripIpv6Brackets(address.trim().toLowerCase())
  const zone = value.indexOf('%')
  return zone === -1 ? value : value.slice(0, zone)
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  const value =
    (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0
  const blocked: Array<[number, number]> = [
    [0x00000000, 8],
    [0x0a000000, 8],
    [0x64400000, 10],
    [0x7f000000, 8],
    [0xa9fe0000, 16],
    [0xac100000, 12],
    [0xc0000000, 24],
    [0xc0000200, 24],
    [0xc0586300, 24],
    [0xc0a80000, 16],
    [0xc6120000, 15],
    [0xc6336400, 24],
    [0xcb007100, 24],
    [0xe0000000, 4],
    [0xf0000000, 4],
  ]
  return !blocked.some(([prefix, bits]) => inIpv4Prefix(value, prefix, bits))
}

function inIpv4Prefix(value: number, prefix: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (value & mask) >>> 0 === (prefix & mask) >>> 0
}

function parseIpv6(address: string): number[] | null {
  let value = address
  const ipv4Match = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)
  if (ipv4Match) {
    const ipv4 = ipv4Match[1].split('.').map(Number)
    if (ipv4.length !== 4 || ipv4.some((part) => part < 0 || part > 255)) {
      return null
    }
    const replacement = `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`
    value = value.slice(0, -ipv4Match[1].length) + replacement
  }

  const halves = value.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null
  const words = [...left, ...Array(missing).fill('0'), ...right]
  if (
    words.length !== 8 ||
    words.some((word) => !/^[0-9a-f]{1,4}$/i.test(word))
  ) {
    return null
  }
  return words.flatMap((word) => {
    const number = Number.parseInt(word, 16)
    return [number >>> 8, number & 0xff]
  })
}

function inPrefix(address: number[], prefix: number[], bits: number): boolean {
  const wholeBytes = Math.floor(bits / 8)
  for (let index = 0; index < wholeBytes; index++) {
    if (address[index] !== prefix[index]) return false
  }
  const remaining = bits % 8
  if (remaining === 0) return true
  const mask = (0xff << (8 - remaining)) & 0xff
  return (address[wholeBytes] & mask) === (prefix[wholeBytes] & mask)
}
