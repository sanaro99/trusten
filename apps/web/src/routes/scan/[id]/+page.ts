import { error } from '@sveltejs/kit'
import { api } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params, fetch }) => {
  try {
    return { scan: await api.getScan(params.id, fetch) }
  } catch {
    // A real 404, replacing the soft "not found" card served with a 200.
    throw error(404, 'We could not find that result.')
  }
}
