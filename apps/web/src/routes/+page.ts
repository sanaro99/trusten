import { api } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch }) => {
  const [history, stats] = await Promise.all([
    api.getHistory(5, fetch).catch(() => ({ scans: [], total: 0 })),
    api.getStats(fetch).catch(() => ({
      totalScans: 0,
      totalDomains: 0,
      totalPatterns: 0,
      avgScore: 0,
      cleanSites: 0,
      dirtySites: 0,
    })),
  ])
  return { recent: history.scans, stats }
}
