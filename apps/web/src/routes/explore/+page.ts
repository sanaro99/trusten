import { api } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch }) => {
  // Client-side filtering below this size; revisit past ~2,000 rows (spec 12).
  try {
    return {
      history: await api.getHistory(200, fetch),
      historyUnavailable: false,
    }
  } catch {
    return {
      history: { scans: [], total: 0 },
      historyUnavailable: true,
    }
  }
}
