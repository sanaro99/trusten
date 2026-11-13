import { onMount } from 'svelte'

/** Two-digit minutes and seconds, e.g. 299 → "04:59". */
export function clockLabel(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0')
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`
}

/**
 * A countdown that quietly starts again when it reaches zero, like the fake
 * "sale ends" timers the practice shop imitates. Call during component setup.
 */
export function countdown(total: number) {
  let left = $state(total)
  onMount(() => {
    const id = setInterval(() => {
      left = left <= 1 ? total : left - 1
    }, 1000)
    return () => clearInterval(id)
  })
  return {
    get label() {
      return clockLabel(left)
    },
  }
}
