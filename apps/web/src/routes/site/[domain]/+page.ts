import { error } from '@sveltejs/kit'
import { api } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params, fetch }) => {
  try {
    return { detail: await api.getDomainDetail(params.domain, fetch) }
  } catch {
    throw error(404, 'We have not checked that site yet.')
  }
}
