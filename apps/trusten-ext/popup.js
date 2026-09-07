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
  critical: '#8f2d46',
  high: '#a13f24',
  medium: '#925113',
  low: '#176b55',
}
const SEV_BG = {
  critical: '#f6e8ed',
  high: '#f7ebe6',
  medium: '#f5eee2',
  low: '#e7f1ed',
}
const GRADE_COLOR = {
  A: '#176b55',
  B: '#3f7350',
  C: '#925113',
  D: '#a13f24',
  F: '#8f2d46',
}
const SEV_LABEL = {
  critical: 'Serious',
  high: 'Important',
  medium: 'Worth knowing',
  low: 'Minor',
}
const CAT_LABEL = {
  fake_urgency: 'Pressure to decide quickly',
  fake_scarcity: 'Pressure about limited stock',
  fake_social_proof: 'Unclear popularity claims',
  confirmshaming: 'A choice designed to make you feel guilty',
  trick_wording: 'Confusing wording',
  visual_interference: 'An important choice is hard to see',
  basket_sneaking: 'An unexpected item may be added',
  drip_pricing: 'Costs are shown late',
  bait_and_switch: 'An action changes after you choose it',
  roach_motel: 'Easy to join, hard to leave',
  forced_continuity: 'A trial may continue automatically',
  hard_to_cancel: 'Cancelling is made difficult',
  forced_registration: 'An account is required',
  forced_sharing: 'Sharing is required to continue',
  gamification_pressure: 'Rewards are used to push a choice',
  preselected_options: 'Choices are picked for you',
  hidden_defaults: 'Settings are picked without being clear',
  repeated_prompts: 'The website keeps asking after you say no',
  disguised_ads: 'An advert looks like ordinary content',
  comparison_prevention: 'Options are hard to compare',
  information_hiding: 'Important information is hard to find',
  privacy_zuckering: 'A privacy choice is confusing',
  cookie_wall: 'Cookies are required to continue',
  dark_consent: 'The consent choice is unclear',
  fake_hierarchy: 'One choice is made much easier to notice',
}

function verdictText(grade, patternCount) {
  if (grade === 'A') return 'No clear concerns found on this page.'
  if (grade === 'B') return 'This page appears mostly fair.'
  if (grade === 'C')
    return `We found ${patternCount} ${patternCount === 1 ? 'choice' : 'choices'} worth a closer look.`
  if (grade === 'D')
    return 'This page uses several choices that may pressure you.'
  return 'This page may strongly pressure or mislead you.'
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
  const { grade, domain, patterns } = data

  const gradeColor = GRADE_COLOR[grade] ?? '#8f2d46'
  const circle = document.getElementById('gradeCircle')
  circle.style.borderColor = gradeColor
  circle.style.color = gradeColor
  document.getElementById('gradeLetter').textContent = grade
  document.getElementById('gradeNum').textContent = 'Trusten grade'
  document.getElementById('resultDomain').textContent = domain
  document.getElementById('resultSummary').textContent = verdictText(
    grade,
    patterns.length,
  )

  // Severity badge summary
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const p of patterns) counts[p.severity] = (counts[p.severity] ?? 0) + 1

  const badgesEl = document.getElementById('severityBadges')
  badgesEl.innerHTML = ''
  if (patterns.length === 0) {
    badgesEl.innerHTML =
      '<span class="badge badge-clean">No clear concerns</span>'
  } else {
    for (const sev of ['critical', 'high', 'medium', 'low']) {
      if (counts[sev] > 0) {
        badgesEl.innerHTML += `<span class="badge badge-${sev}">${counts[sev]} ${SEV_LABEL[sev]}</span>`
      }
    }
  }

  // Pattern list
  const header = document.getElementById('patternsHeader')
  header.textContent =
    patterns.length === 0
      ? ''
      : `${patterns.length} ${patterns.length === 1 ? 'thing' : 'things'} to know`

  const list = document.getElementById('patternsList')
  list.innerHTML = ''

  if (patterns.length === 0) {
    list.innerHTML =
      '<div class="no-patterns">✓ We did not find clear pressure tactics on this page</div>'
  } else {
    for (const p of patterns) {
      const color = SEV_COLOR[p.severity] ?? '#94a3b8'
      const bg = SEV_BG[p.severity] ?? '#f8fafc'
      const cat = CAT_LABEL[p.category] ?? 'Choice worth reviewing'
      const row = document.createElement('div')
      row.className = 'pattern-row'
      row.style.background = bg
      row.innerHTML = `
        <span class="pattern-badge" style="background:${esc(color)}">${esc(SEV_LABEL[p.severity] ?? 'Notice')}</span>
        <div class="pattern-right">
          <div class="pattern-cat">${esc(cat)}</div>
          <div class="pattern-desc">${esc(p.description.slice(0, 180))}</div>
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
function __trustenInjectOverlay(patterns, grade, scanId, serverPort) {
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
    critical: '#8f2d46',
    high: '#a13f24',
    medium: '#925113',
    low: '#176b55',
  }
  var SEV_BG = {
    critical: '#f6e8ed',
    high: '#f7ebe6',
    medium: '#f5eee2',
    low: '#e7f1ed',
  }
  var GRADE_COLOR = {
    A: '#176b55',
    B: '#3f7350',
    C: '#925113',
    D: '#a13f24',
    F: '#8f2d46',
  }
  var SEV_LABEL = {
    critical: 'Serious',
    high: 'Important',
    medium: 'Worth knowing',
    low: 'Minor',
  }
  var CAT_LABEL = {
    fake_urgency: 'Pressure to decide quickly',
    fake_scarcity: 'Pressure about limited stock',
    fake_social_proof: 'Unclear popularity claims',
    confirmshaming: 'A choice designed to make you feel guilty',
    trick_wording: 'Confusing wording',
    visual_interference: 'An important choice is hard to see',
    basket_sneaking: 'An unexpected item may be added',
    drip_pricing: 'Costs are shown late',
    bait_and_switch: 'An action changes after you choose it',
    roach_motel: 'Easy to join, hard to leave',
    forced_continuity: 'A trial may continue automatically',
    hard_to_cancel: 'Cancelling is made difficult',
    forced_registration: 'An account is required',
    forced_sharing: 'Sharing is required to continue',
    gamification_pressure: 'Rewards are used to push a choice',
    preselected_options: 'Choices are picked for you',
    hidden_defaults: 'Settings are picked without being clear',
    repeated_prompts: 'The website keeps asking after you say no',
    disguised_ads: 'An advert looks like ordinary content',
    comparison_prevention: 'Options are hard to compare',
    information_hiding: 'Important information is hard to find',
    privacy_zuckering: 'A privacy choice is confusing',
    cookie_wall: 'Cookies are required to continue',
    dark_consent: 'The consent choice is unclear',
    fake_hierarchy: 'One choice is much easier to notice',
  }

  var gradeColor = GRADE_COLOR[grade] || '#8f2d46'
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
    badgeSummary += `<span style="background:#8f2d46;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-right:4px">${critCount} serious</span>`
  if (highCount > 0)
    badgeSummary += `<span style="background:#a13f24;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-right:4px">${highCount} important</span>`

  var patternRows = patterns
    .slice(0, 20)
    .map((p, _i) => {
      var color = SEV_COLOR[p.severity] || '#aaa'
      var bg = SEV_BG[p.severity] || '#f8fafc'
      var cat = CAT_LABEL[p.category] || 'Choice worth reviewing'
      var desc = (p.description || '').slice(0, 180)
      return (
        '<div style="padding:10px 14px;border-bottom:1px solid #d9d3e5;background:' +
        bg +
        '">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
        '<span style="background:' +
        color +
        ';color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:999px">' +
        esc(SEV_LABEL[p.severity] || 'Notice') +
        '</span>' +
        '<span style="font-size:12px;font-weight:600;color:#1e293b">' +
        esc(cat) +
        '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#475569;line-height:1.45">' +
        esc(desc) +
        '</div>' +
        '</div>'
      )
    })
    .join('')

  if (patterns.length === 0) {
    patternRows =
      '<div style="padding:20px 16px;text-align:center;color:#176b55;font-size:13px">✓ We did not find clear pressure tactics on this page</div>'
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
    'background:#efecf7',
    'border-radius:16px',
    'box-shadow:10px 10px 26px rgba(41,38,56,0.28),-6px -6px 18px rgba(255,255,255,0.75),0 0 0 1px #d9d3e5',
    'z-index:2147483647',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'font-size:14px',
    'line-height:1.5',
    'display:flex',
    'flex-direction:column',
  ].join(';')

  panel.innerHTML =
    '<div style="background:#f4f1f9;padding:14px 16px;border-radius:16px 16px 0 0;flex-shrink:0;border-bottom:1px solid #d9d3e5">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<div>' +
    '<div style="display:flex;align-items:center;gap:8px">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Z" fill="#5b469a"/><path d="m8.5 12 2.4 2.4L15.5 9.7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>' +
    '<span style="color:#292638;font-weight:700;font-size:14px">Trusten</span>' +
    '<span style="color:#5f596e;font-size:11px">website check</span>' +
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
    '<div style="font-size:9px;color:#5f596e;text-transform:uppercase;font-weight:700">grade</div>' +
    '</div>' +
    '<button onclick="' +
    closeScript.replace(/"/g, '&quot;') +
    '" aria-label="Close Trusten highlights" style="background:#efecf7;border:1px solid #d9d3e5;color:#493777;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">×</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div style="overflow-y:auto;flex:1">' +
    patternRows +
    '</div>' +
    '<div style="padding:10px 14px;border-top:1px solid #d9d3e5;background:#f4f1f9;border-radius:0 0 16px 16px;flex-shrink:0">' +
    '<a href="' +
    dashUrl +
    '" target="_blank" rel="noopener" style="display:block;text-align:center;background:#5b469a;color:#fff;text-decoration:none;font-size:12px;font-weight:700;padding:10px 12px;border-radius:9px">' +
    'See the evidence in Trusten →' +
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
        'Trusten is not available right now',
        'Open Trusten on this computer, then try again.',
      )
    } else {
      showError(
        'We could not finish this check',
        'Please try again. If it still does not work, open Trusten for more help.',
      )
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
      args: [scanResult.patterns, scanResult.grade, scanResult.scanId, 9200],
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
        Hide highlights`
    } else {
      btn.classList.remove('active')
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        Highlight these choices`
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
