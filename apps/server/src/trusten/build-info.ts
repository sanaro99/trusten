import { readFileSync } from 'node:fs'

/** Release version and commit of the running build, for /health and logs. */
export interface BuildInfo {
  version: string
  commit: string
}

function rootVersion(): string {
  try {
    const file = new URL('../../../../package.json', import.meta.url)
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      version?: unknown
    }
    return typeof parsed.version === 'string' ? parsed.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function readBuildInfo(env: NodeJS.ProcessEnv = process.env): BuildInfo {
  const commit = env.TRUSTEN_COMMIT?.trim()
  return {
    version: rootVersion(),
    commit:
      commit && /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 7) : 'dev',
  }
}
