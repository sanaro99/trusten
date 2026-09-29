// Downloaded packages replace these defaults with the hosting Trusten origin.
const TRUSTEN_DEFAULTS = {
  serverOrigin: 'http://localhost:9200',
  dashboardOrigin: 'http://localhost:5173',
}

function trustenOrigin(value) {
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      'Use an http:// or https:// Trusten address without a username or password.',
    )
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error(
      'Use the Trusten origin only, for example https://trusten.example.',
    )
  return url.origin
}

// biome-ignore lint/correctness/noUnusedVariables: Shared browser global called by popup.js and options.js.
async function loadTrustenSettings() {
  const saved = await chrome.storage.local.get([
    'serverOrigin',
    'dashboardOrigin',
  ])
  return {
    serverOrigin: trustenOrigin(
      saved.serverOrigin || TRUSTEN_DEFAULTS.serverOrigin,
    ),
    dashboardOrigin: trustenOrigin(
      saved.dashboardOrigin || TRUSTEN_DEFAULTS.dashboardOrigin,
    ),
  }
}
