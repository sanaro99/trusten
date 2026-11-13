/**
 * Where the visitor is in the guided tour. Kept in localStorage so the tour
 * survives page loads, and read only in the browser.
 */
import type { ScanHistoryRow } from '@trusten/shared/api'
import { goto } from '$app/navigation'
import { api } from '$lib/api'
import {
  pickExample,
  pickJourney,
  stepPath,
  type TourPicks,
  tourSteps,
} from './tour'

const KEY = 'trusten-tour'

interface Saved {
  index: number
  picks: TourPicks
}

function read(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!saved || typeof saved.index !== 'number') return null
    return { index: saved.index, picks: saved.picks ?? {} }
  } catch {
    return null
  }
}

class TourState {
  active = $state(false)
  index = $state(0)
  picks = $state<TourPicks>({})

  load() {
    const saved = read()
    if (!saved) return
    this.active = true
    this.index = saved.index
    this.picks = saved.picks
  }

  begin(picks: TourPicks) {
    this.picks = picks
    this.index = 0
    this.active = true
    this.save()
  }

  go(index: number) {
    this.index = index
    this.save()
  }

  end() {
    this.active = false
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* Storage may be unavailable; the tour still closes. */
    }
  }

  private save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ index: this.index, picks: this.picks }),
      )
    } catch {
      /* Without storage the tour still works until the page reloads. */
    }
  }
}

export const tour = new TourState()

/** Start the tour from any page: picks saved results, then opens step one. */
export async function startTour(
  loadHistory: () => Promise<{ scans: ScanHistoryRow[] }>,
): Promise<void> {
  let picks: TourPicks = {}
  try {
    const { scans } = await loadHistory()
    picks = { example: pickExample(scans), journey: pickJourney(scans) }
  } catch {
    /* Without the library, the tour skips the saved-result steps. */
  }
  tour.begin(picks)
}

/** Start the tour and open its first step. */
export async function beginTour(): Promise<void> {
  await startTour(() => api.getHistory(100))
  const first = tourSteps(tour.picks)[0]
  if (first) await goto(stepPath(first, tour.picks))
}
