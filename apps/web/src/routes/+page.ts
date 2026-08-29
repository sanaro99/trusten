import { api } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch }) => {
  return { stats: await api.getStats(fetch) }
}
