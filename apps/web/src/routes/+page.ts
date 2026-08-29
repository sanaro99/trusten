import { api } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch }) => {
  const history = await api.getHistory(5, fetch).catch(() => ({
    scans: [],
    total: 0,
  }))
  return { recent: history.scans }
}
