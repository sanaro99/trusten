/** Resolve after `ms` milliseconds. Shared so timeouts aren't re-inlined everywhere. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
