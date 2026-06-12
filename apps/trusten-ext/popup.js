/**
 * Trusten Extension — Popup Logic
 *
 * Flow:
 *   1. Get current tab URL
 *   2. User clicks "Scan" → executeScript captures live DOM
 *   3. POST to /trusten/api/analyze-page (no navigation — uses current page state)
 *   4. Render results (grade, pattern list)
 *   5. "Highlight on Page" → executeScript injects the Trusten overlay
 */

const SERVER = 'http://localhost:9200'

// ─── State ───────────────────────────────────────────────────────────────────

let currentTab = null
let scanResult = null
let overlayActive = false

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEV_COLOR = {
  critical: '#d23b34',
  high: '#e0651b',
  medium: '#cf8a00',
  low: '#15a05a',
}
const SEV_BG = {
  critical: '#fbeceb',
  high: '#fbefe6',
  medium: '#fbf3e0',
  low: '#e9f6ef',
}
const GRADE_COLOR = {
  A: '#15a05a',
  B: '#7d9b1f',
  C: '#cf8a00',
  D: '#e0651b',
  F: '#d23b34',
}
const CAT_LABEL = {
  fake_urgency: 'Fake Urgency',
  fake_scarcity: 'Fake Scarcity',
  fake_social_proof: 'Fake Social Proof',
  confirmshaming: 'Confirmshaming',
  trick_wording: 'Trick Wording',
  visual_interference: 'Visual Interference',
  basket_sneaking: 'Basket Sneaking',
  drip_pricing: 'Drip Pricing',
  bait_and_switch: 'Bait & Switch',
  roach_motel: 'Roach Motel',
  forced_continuity: 'Forced Continuity',
  hard_to_cancel: 'Hard to Cancel',
  forced_registration: 'Forced Registration',
  forced_sharing: 'Forced Sharing',
  gamification_pressure: 'Gamification',
  preselected_options: 'Preselected Options',
  hidden_defaults: 'Hidden Defaults',
  repeated_prompts: 'Repeated Prompts',
  disguised_ads: 'Disguised Ads',
  comparison_prevention: 'Comparison Prevention',
  information_hiding: 'Info Hiding',
  privacy_zuckering: 'Privacy Zuckering',
  cookie_wall: 'Cookie Wall',
  dark_consent: 'Dark Consent',
  fake_hierarchy: 'Fake Hierarchy',
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncateUrl(url, max = 50) {
  try {
    const u = new URL(url)
    const short = u.hostname + (u.pathname !== '/' ? u.pathname : '')
    return short.length > max ? `${short.slice(0, max)}…` : short
  } catch {
    return url.slice(0, max)
  }
}

// ─── State transitions ────────────────────────────────────────────────────────

function showState(name) {
  document.getElementById('stateIdle').style.display =
    name === 'idle' ? 'block' : 'none'
  document.getElementById('stateLoading').style.display =
    name === 'loading' ? 'block' : 'none'
  document.getElementById('stateError').style.display =
    name === 'error' ? 'block' : 'none'
  document.getElementById('stateResults').style.display =
    name === 'results' ? 'block' : 'none'
}

function showError(title, msg) {
  document.getElementById('errorTitle').textContent = title
  document.getElementById('errorMsg').textContent = msg
  showState('error')
}

// ─── Render results ───────────────────────────────────────────────────────────

function renderResults(data) {
  const { grade, score, domain, summary, patterns } = data

  const gradeColor = GRADE_COLOR[grade] ?? '#dc2626'
  const circle = document.getElementById('gradeCircle')
  circle.style.borderColor = gradeColor
  circle.style.color = gradeColor
  document.getElementById('gradeLetter').textContent = grade
  document.getElementById('gradeNum').textContent = `${score}/100`
  document.getElementById('resultDomain').textContent = domain
  document.getElementById('resultSummary').textContent = summary

  // Severity badge summary
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const p of patterns) counts[p.severity] = (counts[p.severity] ?? 0) + 1

  const badgesEl = document.getElementById('severityBadges')
  badgesEl.innerHTML = ''
  if (patterns.length === 0) {
    badgesEl.innerHTML = '<span class="badge badge-clean">✓ Clean</span>'
  } else {
    for (const sev of ['critical', 'high', 'medium', 'low']) {
      if (counts[sev] > 0) {
        badgesEl.innerHTML += `<span class="badge badge-${sev}">${counts[sev]} ${sev.toUpperCase()}</span>`
      }
    }
  }

  // Pattern list
  const header = document.getElementById('patternsHeader')
  header.textContent =
    patterns.length === 0
      ? ''
      : `${patterns.length} Pattern${patterns.length !== 1 ? 's' : ''} Detected`

  const list = document.getElementById('patternsList')
  list.innerHTML = ''

  if (patterns.length === 0) {
    list.innerHTML =
      '<div class="no-patterns">✓ No dark patterns detected on this page</div>'
  } else {
    for (const p of patterns) {
      const color = SEV_COLOR[p.severity] ?? '#94a3b8'
      const bg = SEV_BG[p.severity] ?? '#f8fafc'
      const cat = CAT_LABEL[p.category] ?? p.category
      const reg = p.regulatoryViolations?.[0]?.regulation ?? ''
      const row = document.createElement('div')
      row.className = 'pattern-row'
      row.style.background = bg
      row.innerHTML = `
        <span class="pattern-badge" style="background:${esc(color)}">${esc(p.severity)}</span>
        <div class="pattern-right">
          <div class="pattern-cat">${esc(cat)}</div>
          <div class="pattern-desc">${esc(p.description.slice(0, 180))}</div>
          ${reg ? `<div class="pattern-reg">${esc(reg)}</div>` : ''}
        </div>
      `
      list.appendChild(row)
    }
  }

  // Full report link
  const reportLink = document.getElementById('btnFullReport')
  reportLink.href = `${SERVER}/trusten/scan/${data.scanId}`

  showState('results')
}

// ─── Overlay injection ────────────────────────────────────────────────────────

/**
 * This function is serialized and executed inside the page context.
 * It must be completely self-contained — no closure references.
 */
function __trustenInjectOverlay(
  patterns,
  grade,
  numericScore,
  scanId,
  serverPort,
) {
  var PANEL_ID = '__trusten_live__'
  var HL_ATTR = 'data-trusten-hl'

  function removeAll() {
    var p = document.getElementById(PANEL_ID)
    if (p) p.remove()
    document.querySelectorAll(`[${HL_ATTR}]`).forEach((el) => {
      el.removeAttribute(HL_ATTR)
      el.style.outline = ''
      el.style.outlineOffset = ''
      el.style.boxShadow = ''
    })
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // Toggle off if already visible
  if (document.getElementById(PANEL_ID)) {
    removeAll()
    return 'hidden'
  }

  var SEV_COLOR = {
    critical: '#d23b34',
    high: '#e0651b',
    medium: '#cf8a00',
    low: '#15a05a',
  }
  var SEV_BG = {
    critical: '#fbeceb',
    high: '#fbefe6',
    medium: '#fbf3e0',
    low: '#e9f6ef',
  }
  var GRADE_COLOR = {
    A: '#15a05a',
    B: '#7d9b1f',
    C: '#cf8a00',
    D: '#e0651b',
    F: '#d23b34',
  }
  var CAT_LABEL = {
    fake_urgency: 'Fake Urgency',
    fake_scarcity: 'Fake Scarcity',
    fake_social_proof: 'Fake Social Proof',
    confirmshaming: 'Confirmshaming',
    trick_wording: 'Trick Wording',
    visual_interference: 'Visual Interference',
    basket_sneaking: 'Basket Sneaking',
    drip_pricing: 'Drip Pricing',
    bait_and_switch: 'Bait & Switch',
    roach_motel: 'Roach Motel',
    forced_continuity: 'Forced Continuity',
    hard_to_cancel: 'Hard to Cancel',
    forced_registration: 'Forced Registration',
    forced_sharing: 'Forced Sharing',
    gamification_pressure: 'Gamification',
    preselected_options: 'Preselected Options',
    hidden_defaults: 'Hidden Defaults',
    repeated_prompts: 'Repeated Prompts',
    disguised_ads: 'Disguised Ads',
    comparison_prevention: 'Comparison Prevention',
    information_hiding: 'Info Hiding',
    privacy_zuckering: 'Privacy Zuckering',
    cookie_wall: 'Cookie Wall',
    dark_consent: 'Dark Consent',
    fake_hierarchy: 'Fake Hierarchy',
  }

  var gradeColor = GRADE_COLOR[grade] || '#dc2626'
  var dashUrl = `http://localhost:${serverPort}/trusten/scan/${scanId}`

  // Highlight elements with CSS selectors
  var highlighted = 0
  patterns.forEach((p) => {
    if (!p.element || !p.element.selector || highlighted >= 6) return
    try {
      document.querySelectorAll(p.element.selector).forEach((el) => {
        if (highlighted >= 6) return
        var rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        el.setAttribute(HL_ATTR, '1')
        var color = SEV_COLOR[p.severity] || '#ea580c'
        el.style.outline = `3px solid ${color}`
        el.style.outlineOffset = '2px'
        el.style.boxShadow = `0 0 0 6px ${color}22`
        highlighted++
      })
    } catch (_e) {}
  })

  // Build panel HTML
  var critCount = patterns.filter((p) => p.severity === 'critical').length
  var highCount = patterns.filter((p) => p.severity === 'high').length

  var badgeSummary = ''
  if (critCount > 0)
    badgeSummary += `<span style="background:#dc2626;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-right:4px">${critCount} CRITICAL</span>`
  if (highCount > 0)
    badgeSummary += `<span style="background:#ea580c;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-right:4px">${highCount} HIGH</span>`

  var patternRows = patterns
    .slice(0, 20)
    .map((p, _i) => {
      var color = SEV_COLOR[p.severity] || '#aaa'
      var bg = SEV_BG[p.severity] || '#f8fafc'
      var cat = CAT_LABEL[p.category] || p.category
      var desc = (p.description || '').slice(0, 180)
      var reg = p.regulatoryViolations?.[0]
        ? p.regulatoryViolations[0].regulation
        : ''
      return (
        '<div style="padding:10px 14px;border-bottom:1px solid #f1f5f9;background:' +
        bg +
        '">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
        '<span style="background:' +
        color +
        ';color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:999px">' +
        esc(p.severity) +
        '</span>' +
        '<span style="font-size:12px;font-weight:600;color:#1e293b">' +
        esc(cat) +
        '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#475569;line-height:1.45">' +
        esc(desc) +
        '</div>' +
        (reg
          ? `<div style="font-size:10px;color:#94a3b8;margin-top:3px">${esc(reg)}</div>`
          : '') +
        '</div>'
      )
    })
    .join('')

  if (patterns.length === 0) {
    patternRows =
      '<div style="padding:20px 16px;text-align:center;color:#16a34a;font-size:13px">✓ No dark patterns detected</div>'
  }

  var closeScript =
    "var p=document.getElementById('__trusten_live__');if(p)p.remove();document.querySelectorAll('[data-trusten-hl]').forEach(function(e){e.removeAttribute('data-trusten-hl');e.style.outline='';e.style.outlineOffset='';e.style.boxShadow='';})"

  var panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.style.cssText = [
    'position:fixed',
    'top:16px',
    'right:16px',
    'width:360px',
    'max-height:calc(100vh - 32px)',
    'overflow:hidden',
    'background:#fff',
    'border-radius:16px',
    'box-shadow:0 20px 60px rgba(0,0,0,0.25),0 0 0 1px rgba(0,0,0,0.08)',
    'z-index:2147483647',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'font-size:14px',
    'line-height:1.5',
    'display:flex',
    'flex-direction:column',
  ].join(';')

  panel.innerHTML =
    '<div style="background:#1b1430;padding:14px 16px;border-radius:16px 16px 0 0;flex-shrink:0">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<div>' +
    '<div style="display:flex;align-items:center;gap:8px">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Z" fill="#7c3aed"/><path d="m8.5 12 2.4 2.4L15.5 9.7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>' +
    '<span style="color:#fff;font-weight:700;font-size:14px">Trusten</span>' +
    '<span style="color:#a99fc4;font-size:11px">dark pattern scan</span>' +
    '</div>' +
    '<div style="margin-top:4px">' +
    badgeSummary +
    '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px">' +
    '<div style="text-align:center">' +
    '<div style="font-size:26px;font-weight:900;color:' +
    gradeColor +
    ';line-height:1">' +
    grade +
    '</div>' +
    '<div style="font-size:10px;color:#64748b">' +
    numericScore +
    '/100</div>' +
    '</div>' +
    '<button onclick="' +
    closeScript.replace(/"/g, '&quot;') +
    '" style="background:rgba(255,255,255,0.1);border:none;color:#94a3b8;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">×</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div style="overflow-y:auto;flex:1">' +
    patternRows +
    '</div>' +
    '<div style="padding:10px 14px;border-top:1px solid #f1f5f9;background:#faf9f6;border-radius:0 0 16px 16px;flex-shrink:0">' +
    '<a href="' +
    dashUrl +
    '" target="_blank" style="display:block;text-align:center;background:#7c3aed;color:#fff;text-decoration:none;font-size:12px;font-weight:600;padding:9px 12px;border-radius:9px">' +
    'View full report in Trusten dashboard →' +
    '</a>' +
    '</div>'

  var target = document.body || document.documentElement
  if (!target) return 'error:no-body'
  target.appendChild(panel)

  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      removeAll()
      document.removeEventListener('keydown', onEsc)
    }
  })

  return `shown:${patterns.length}`
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

/**
 * Try the live-DOM endpoint first (analyze-page). If the server doesn't have
 * it yet (pre-rebuild binary), fall back to the URL-based quick-scan flow.
 */
async function runScan() {
  if (!currentTab) return

  showState('loading')
  overlayActive = false

  const url = currentTab.url

  // 1. Try to capture live DOM (works once server is rebuilt with new endpoint)
  let pageContent = null
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => ({
        url: location.href,
        html: document.documentElement.outerHTML.slice(0, 500_000),
        text: (document.body?.innerText ?? '').slice(0, 50_000),
        pageTitle: document.title,
      }),
    })
    pageContent = injection.result
  } catch {
    // Restricted page — fall through to URL-only scan
  }

  let data
  try {
    // 2a. Preferred: analyze-page (live DOM, sees logged-in state)
    if (pageContent) {
      const res = await fetch(`${SERVER}/trusten/api/analyze-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageContent),
      })
      if (res.ok) {
        data = await res.json()
      } else if (res.status !== 404) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Server error ${res.status}`)
      }
      // 404 = endpoint not yet deployed → fall through to quick-scan
    }

    // 2b. Fallback: quick-scan (navigates to URL in background tab)
    if (!data) {
      const scanRes = await fetch(`${SERVER}/trusten/api/quick-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!scanRes.ok) {
        const body = await scanRes.json().catch(() => ({}))
        throw new Error(body.error || `Server error ${scanRes.status}`)
      }
      const scanSummary = await scanRes.json()

      // Fetch full result (patterns, descriptions, selectors)
      const fullRes = await fetch(
        `${SERVER}/trusten/api/scan/${scanSummary.scanId}`,
      )
      if (!fullRes.ok) throw new Error(`Could not load scan details`)
      const full = await fullRes.json()

      data = {
        scanId: full.id,
        domain: full.domain,
        grade: full.score.grade,
        score: full.score.numeric,
        patternCount: full.patterns.length,
        summary: full.score.summary,
        patterns: full.patterns,
      }
    }
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      showError(
        'Trusten server not running',
        'Start the Trusten server (bun run start) on localhost:9200, then try again.',
      )
    } else {
      showError('Scan failed', err.message || String(err))
    }
    return
  }

  scanResult = data
  renderResults(data)
}

// ─── Annotation toggle ────────────────────────────────────────────────────────

async function toggleOverlay() {
  if (!currentTab || !scanResult) return

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: __trustenInjectOverlay,
      args: [
        scanResult.patterns,
        scanResult.grade,
        scanResult.score,
        scanResult.scanId,
        9200,
      ],
    })

    const status = injection?.result ?? ''
    overlayActive = status.startsWith('shown')
    const btn = document.getElementById('btnAnnotate')
    if (overlayActive) {
      btn.classList.add('active')
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
        Hide Overlay`
    } else {
      btn.classList.remove('active')
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        Highlight on Page`
    }
  } catch (err) {
    // Silently ignore — may happen on restricted pages
    console.warn('Trusten overlay injection failed:', err)
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  currentTab = tab

  const urlEl = document.getElementById('urlText')
  urlEl.textContent = truncateUrl(tab?.url ?? '—')
  urlEl.title = tab?.url ?? ''

  showState('idle')

  document.getElementById('btnScan').addEventListener('click', runScan)
  document.getElementById('btnRetry').addEventListener('click', runScan)
  document.getElementById('btnRescan').addEventListener('click', () => {
    scanResult = null
    overlayActive = false
    showState('idle')
  })
  document
    .getElementById('btnAnnotate')
    .addEventListener('click', toggleOverlay)
}

init()
