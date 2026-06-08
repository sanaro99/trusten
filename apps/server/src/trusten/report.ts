/**
 * Trusten — Report generation and screenshot annotation
 *
 * buildAnnotationScript()  — JS to inject a step-summary overlay before screenshotting
 * buildCleanupScript()     — JS to remove the overlay after the screenshot
 * generateReportHtml()     — Full HTML report with annotated screenshots
 */

import type { DetectedPattern, ScanResult, WorkflowStep } from './types'

// ─── Severity styling ───

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#65a30d',
}

const GRADE_COLOR: Record<string, string> = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#d97706',
  D: '#ea580c',
  F: '#dc2626',
}

// ─── Screenshot annotation ───

/**
 * Returns a JS expression that injects a floating annotation panel onto the page.
 * Must be evaluated via browser.evaluate() before taking the step screenshot.
 */
export function buildAnnotationScript(
  stepNumber: number,
  totalSteps: number,
  action: string,
  patterns: DetectedPattern[],
): string {
  const critical = patterns.filter((p) => p.severity === 'critical')
  const high = patterns.filter((p) => p.severity === 'high')
  const medium = patterns.filter((p) => p.severity === 'medium')
  const low = patterns.filter((p) => p.severity === 'low')

  const badgeHtml = [
    critical.length
      ? `<span style="background:#dc2626;color:#fff;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;margin-right:4px">${critical.length} CRITICAL</span>`
      : '',
    high.length
      ? `<span style="background:#ea580c;color:#fff;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;margin-right:4px">${high.length} HIGH</span>`
      : '',
    medium.length
      ? `<span style="background:#d97706;color:#fff;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;margin-right:4px">${medium.length} MEDIUM</span>`
      : '',
    low.length
      ? `<span style="background:#65a30d;color:#fff;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;margin-right:4px">${low.length} LOW</span>`
      : '',
  ].join('')

  const topPatterns = patterns
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 }
      return order[a.severity] - order[b.severity]
    })
    .slice(0, 4)
    .map(
      (p) =>
        `<div style="margin-top:4px;font-size:11px;opacity:0.9">` +
        `<span style="color:${SEVERITY_COLOR[p.severity] ?? '#aaa'};font-weight:600;text-transform:uppercase;font-size:10px">${p.severity}</span>` +
        ` ${escapeHtml(p.description.slice(0, 70))}${p.description.length > 70 ? '…' : ''}` +
        `</div>`,
    )
    .join('')

  const noPatterns =
    patterns.length === 0
      ? `<div style="margin-top:6px;font-size:11px;color:#86efac">✓ No dark patterns detected at this step</div>`
      : ''

  const actionText = escapeHtml(action.slice(0, 80))

  const overlayHtml = `
<div style="
  position:fixed;top:12px;right:12px;z-index:2147483647;
  background:rgba(10,10,20,0.93);color:#f1f5f9;
  border-radius:10px;padding:12px 16px;font-family:system-ui,sans-serif;
  max-width:320px;box-shadow:0 4px 24px rgba(0,0,0,0.6);
  border:1px solid rgba(255,255,255,0.12);line-height:1.4;
">
  <div style="font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px">
    TRUSTEN · Step ${stepNumber} of ${totalSteps}
  </div>
  <div style="font-size:12px;color:#e2e8f0;margin-bottom:8px;font-weight:500">${actionText}</div>
  <div>${patterns.length > 0 ? badgeHtml : ''}</div>
  ${topPatterns}
  ${noPatterns}
  ${patterns.length > 4 ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px">+${patterns.length - 4} more patterns</div>` : ''}
</div>`

  // Inject the overlay — return the element ID for type-safe cleanup
  const escaped = JSON.stringify(overlayHtml)
  return `(function(){
    var existing = document.getElementById('__trusten_overlay__');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.id = '__trusten_overlay__';
    el.innerHTML = ${escaped};
    document.body.appendChild(el);
    return '__trusten_overlay__';
  })()`
}

/** Returns a JS expression that removes the annotation overlay. */
export function buildCleanupScript(): string {
  return `(function(){
    var el = document.getElementById('__trusten_overlay__');
    if (el) el.remove();
    return true;
  })()`
}

/**
 * Returns a JS expression that injects a persistent, interactive dark pattern
 * overlay directly onto the live page. Calling it again while the panel is
 * visible toggles it off (acts as a toggle).
 *
 * Used by analyzeCurrentPage() to annotate the active tab in-place.
 */
export function buildLiveAnnotationScript(
  patterns: DetectedPattern[],
  grade: string,
  numericScore: number,
  scanId: string,
  serverPort = 9200,
): string {
  const GRADE_COLORS: Record<string, string> = {
    A: '#16a34a',
    B: '#65a30d',
    C: '#d97706',
    D: '#ea580c',
    F: '#dc2626',
  }
  const SEV_COLORS: Record<string, string> = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#d97706',
    low: '#16a34a',
  }
  const SEV_BG: Record<string, string> = {
    critical: '#fef2f2',
    high: '#fff7ed',
    medium: '#fffbeb',
    low: '#f0fdf4',
  }
  const CAT_LABELS: Record<string, string> = {
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

  const gradeColor = GRADE_COLORS[grade] ?? '#dc2626'

  // Slim down pattern data for injection
  const pData = patterns.slice(0, 20).map((p) => ({
    cat: CAT_LABELS[p.category as string] ?? p.category,
    sev: p.severity,
    desc: p.description.slice(0, 200),
    sel: p.element?.selector ?? '',
    reg: p.regulatoryViolations[0]?.regulation ?? '',
  }))

  const pJson = JSON.stringify(pData)
  const sevColorsJson = JSON.stringify(SEV_COLORS)
  const sevBgJson = JSON.stringify(SEV_BG)
  const gradeColorJson = JSON.stringify(gradeColor)
  const gradeJson = JSON.stringify(grade)
  const dashUrl = JSON.stringify(
    `http://localhost:${serverPort}/trusten/scan/${scanId}`,
  )

  return `(function() {
  var PANEL_ID = '__trusten_live__';
  var HL_ATTR = 'data-trusten-hl';

  function removeAll() {
    var p = document.getElementById(PANEL_ID);
    if (p) p.remove();
    document.querySelectorAll('[' + HL_ATTR + ']').forEach(function(el) {
      el.removeAttribute(HL_ATTR);
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.boxShadow = '';
    });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Toggle off if already shown
  if (document.getElementById(PANEL_ID)) { removeAll(); return 'hidden'; }

  var patterns = ${pJson};
  var grade = ${gradeJson};
  var numericScore = ${numericScore};
  var gradeColor = ${gradeColorJson};
  var sevColors = ${sevColorsJson};
  var sevBg = ${sevBgJson};
  var dashUrl = ${dashUrl};

  // ── Highlight page elements for patterns with CSS selectors ──
  var highlighted = 0;
  patterns.forEach(function(p) {
    if (!p.sel || highlighted >= 6) return;
    try {
      var els = document.querySelectorAll(p.sel);
      els.forEach(function(el) {
        if (highlighted >= 6) return;
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        el.setAttribute(HL_ATTR, '1');
        var color = sevColors[p.sev] || '#ea580c';
        el.style.outline = '3px solid ' + color;
        el.style.outlineOffset = '2px';
        el.style.boxShadow = '0 0 0 6px ' + color + '22';
        highlighted++;
      });
    } catch(e) {}
  });

  // ── Build the floating panel ──
  var critCount = patterns.filter(function(p) { return p.sev === 'critical'; }).length;
  var highCount = patterns.filter(function(p) { return p.sev === 'high'; }).length;

  var patternRows = patterns.map(function(p, i) {
    var color = sevColors[p.sev] || '#aaa';
    var bg = sevBg[p.sev] || '#f8fafc';
    var reg = p.reg ? '<div style="font-size:10px;color:#94a3b8;margin-top:3px">' + esc(p.reg) + '</div>' : '';
    return '<div style="padding:10px 14px;border-bottom:1px solid #f1f5f9;background:' + bg + ';' + (i === 0 ? 'border-radius:0' : '') + '">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
        '<span style="background:' + color + ';color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:999px">' + esc(p.sev) + '</span>' +
        '<span style="font-size:12px;font-weight:600;color:#1e293b">' + esc(p.cat) + '</span>' +
      '</div>' +
      '<div style="font-size:11px;color:#475569;line-height:1.45">' + esc(p.desc) + '</div>' +
      reg +
    '</div>';
  }).join('');

  if (patterns.length === 0) {
    patternRows = '<div style="padding:20px 16px;text-align:center;color:#16a34a;font-size:13px">✓ No dark patterns detected on this page</div>';
  }

  var badgeSummary = '';
  if (critCount > 0) badgeSummary += '<span style="background:#dc2626;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-right:4px">' + critCount + ' CRITICAL</span>';
  if (highCount > 0) badgeSummary += '<span style="background:#ea580c;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-right:4px">' + highCount + ' HIGH</span>';

  var panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px', 'width:360px',
    'max-height:calc(100vh - 32px)', 'overflow:hidden',
    'background:#fff', 'border-radius:16px',
    'box-shadow:0 20px 60px rgba(0,0,0,0.25),0 0 0 1px rgba(0,0,0,0.08)',
    'z-index:2147483647',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'font-size:14px', 'line-height:1.5', 'display:flex', 'flex-direction:column'
  ].join(';');

  panel.innerHTML = [
    '<div style="background:#0f172a;padding:14px 16px;border-radius:16px 16px 0 0;flex-shrink:0">',
      '<div style="display:flex;justify-content:space-between;align-items:center">',
        '<div>',
          '<div style="display:flex;align-items:center;gap:8px">',
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#0ea5e9" stroke-width="2"/><path d="M12 7v5l3 3" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round"/></svg>',
            '<span style="color:#fff;font-weight:700;font-size:14px">Trusten</span>',
            '<span style="color:#475569;font-size:11px;font-weight:500">dark pattern scan</span>',
          '</div>',
          '<div style="margin-top:4px">' + badgeSummary + '</div>',
        '</div>',
        '<div style="display:flex;align-items:center;gap:8px">',
          '<div style="text-align:center">',
            '<div style="font-size:26px;font-weight:900;color:' + gradeColor + ';line-height:1">' + grade + '</div>',
            '<div style="font-size:10px;color:#64748b">' + numericScore + '/100</div>',
          '</div>',
          '<button onclick="(function(){var p=document.getElementById(\\'' + PANEL_ID + '\\');if(p)p.remove();document.querySelectorAll(\\'[' + HL_ATTR + ']\\').forEach(function(el){el.removeAttribute(\\'' + HL_ATTR + '\\');el.style.outline=\\'\\';el.style.outlineOffset=\\'\\';el.style.boxShadow=\\'\\';});})()" style="background:rgba(255,255,255,0.1);border:none;color:#94a3b8;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0">×</button>',
        '</div>',
      '</div>',
    '</div>',
    '<div style="overflow-y:auto;flex:1">' + patternRows + '</div>',
    '<div style="padding:10px 14px;border-top:1px solid #f1f5f9;background:#f8fafc;border-radius:0 0 16px 16px;flex-shrink:0">',
      '<a href="' + dashUrl + '" target="_blank" style="display:block;text-align:center;background:#0f172a;color:#fff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 12px;border-radius:8px">',
        'View full report in Trusten dashboard →',
      '</a>',
    '</div>',
  ].join('');

  var target = document.body || document.documentElement;
  if (!target) return 'error:no-document-body';
  target.appendChild(panel);

  // Keyboard dismiss
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { removeAll(); document.removeEventListener('keydown', esc); }
  });

  return 'shown:' + patterns.length;
})()`
}

// ─── HTML report ───

/** Generate a complete, self-contained HTML report from a ScanResult. */
export function generateReportHtml(
  result: ScanResult,
  workflowName?: string,
): string {
  const gradeColor = GRADE_COLOR[result.score.grade] ?? '#64748b'
  const date = new Date(result.completedAt).toLocaleString()

  const criticalPatterns = result.patterns.filter(
    (p) => p.severity === 'critical',
  )
  const highPatterns = result.patterns.filter((p) => p.severity === 'high')
  const mediumPatterns = result.patterns.filter((p) => p.severity === 'medium')
  const lowPatterns = result.patterns.filter((p) => p.severity === 'low')

  const stepsHtml = (result.workflowSteps ?? [])
    .map((step: WorkflowStep) => renderStep(step))
    .join('\n')

  const patternsHtml = result.patterns
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 }
      return order[a.severity] - order[b.severity]
    })
    .map((p) => renderPattern(p))
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trusten Report — ${escapeHtml(result.domain)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; font-size: 14px; line-height: 1.6 }
  .page { max-width: 960px; margin: 0 auto; padding: 32px 24px }
  /* Header */
  .header { background: #0f172a; color: #f8fafc; border-radius: 12px; padding: 28px 32px; margin-bottom: 24px }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px }
  .logo { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px }
  .domain { font-size: 22px; font-weight: 700; word-break: break-all }
  .url { font-size: 12px; color: #64748b; margin-top: 4px; word-break: break-all }
  .meta { font-size: 11px; color: #64748b; margin-top: 8px }
  /* Score card */
  .score-card { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.05); border-radius: 10px; padding: 16px 20px }
  .grade { font-size: 48px; font-weight: 900; line-height: 1; color: ${gradeColor} }
  .score-details { }
  .score-num { font-size: 20px; font-weight: 700; color: #f1f5f9 }
  .score-label { font-size: 11px; color: #94a3b8; margin-top: 2px }
  /* Severity bar */
  .severity-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px }
  .sev-pill { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600 }
  .sev-critical { background: #fef2f2; color: #dc2626 }
  .sev-high     { background: #fff7ed; color: #ea580c }
  .sev-medium   { background: #fffbeb; color: #d97706 }
  .sev-low      { background: #f0fdf4; color: #16a34a }
  /* Section */
  .section { background: #fff; border-radius: 10px; border: 1px solid #e2e8f0; padding: 24px; margin-bottom: 20px }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9 }
  /* Workflow step */
  .step { margin-bottom: 28px; padding-bottom: 28px; border-bottom: 1px solid #f1f5f9 }
  .step:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none }
  .step-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px }
  .step-num { width: 28px; height: 28px; border-radius: 50%; background: #0f172a; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0 }
  .step-action { font-size: 13px; font-weight: 600; color: #334155 }
  .step-url { font-size: 11px; color: #94a3b8; margin-top: 2px; word-break: break-all }
  .step-img { width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; display: block; margin: 12px 0 }
  .step-patterns { margin-top: 10px }
  .no-patterns { font-size: 12px; color: #16a34a; font-weight: 500 }
  /* Pattern item */
  .pattern { padding: 12px; border-radius: 8px; border-left: 3px solid; margin-bottom: 10px; background: #fafafa }
  .pattern-critical { border-color: #dc2626 }
  .pattern-high     { border-color: #ea580c }
  .pattern-medium   { border-color: #d97706 }
  .pattern-low      { border-color: #65a30d }
  .pattern-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px }
  .pattern-sev { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 999px; color: #fff }
  .pattern-sev-critical { background: #dc2626 }
  .pattern-sev-high     { background: #ea580c }
  .pattern-sev-medium   { background: #d97706 }
  .pattern-sev-low      { background: #65a30d }
  .pattern-category { font-size: 11px; color: #64748b; font-weight: 500 }
  .pattern-desc { font-size: 13px; color: #334155; margin-bottom: 6px }
  .pattern-evidence { font-size: 11px; color: #64748b; background: #f1f5f9; padding: 6px 10px; border-radius: 4px; font-family: monospace; word-break: break-word }
  .pattern-regs { margin-top: 6px; font-size: 10px; color: #94a3b8 }
  .confidence { font-size: 10px; color: #94a3b8; margin-left: auto }
  /* Footer */
  .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0 }
  @media print {
    body { background: #fff }
    .page { padding: 0 }
    .section { break-inside: avoid; border: 1px solid #e2e8f0 }
    .step { break-inside: avoid }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-top">
      <div>
        <div class="logo">Trusten · Dark Pattern Audit Report</div>
        <div class="domain">${escapeHtml(result.domain)}</div>
        <div class="url">${escapeHtml(result.url)}</div>
        <div class="meta">
          ${workflowName ? `Workflow: <strong>${escapeHtml(workflowName)}</strong> · ` : ''}
          Scanned: ${date} · ID: ${result.id}
        </div>
      </div>
      <div class="score-card">
        <div class="grade">${result.score.grade}</div>
        <div class="score-details">
          <div class="score-num">${result.score.numeric}<span style="font-size:14px;font-weight:400;color:#94a3b8">/100</span></div>
          <div class="score-label">Trust Score</div>
          <div class="score-label" style="margin-top:4px;color:#f1f5f9">${result.patterns.length} pattern${result.patterns.length !== 1 ? 's' : ''} detected</div>
        </div>
      </div>
    </div>
    <div class="severity-row">
      ${criticalPatterns.length ? `<div class="sev-pill sev-critical">● ${criticalPatterns.length} Critical</div>` : ''}
      ${highPatterns.length ? `<div class="sev-pill sev-high">● ${highPatterns.length} High</div>` : ''}
      ${mediumPatterns.length ? `<div class="sev-pill sev-medium">● ${mediumPatterns.length} Medium</div>` : ''}
      ${lowPatterns.length ? `<div class="sev-pill sev-low">● ${lowPatterns.length} Low</div>` : ''}
      ${result.patterns.length === 0 ? '<div class="sev-pill sev-low">✓ No dark patterns found</div>' : ''}
    </div>
  </div>

  ${result.score.summary ? `<div class="section"><div class="section-title">Summary</div><p style="color:#334155">${escapeHtml(result.score.summary)}</p></div>` : ''}

  ${stepsHtml ? `<div class="section"><div class="section-title">Workflow Steps</div>${stepsHtml}</div>` : ''}

  ${patternsHtml ? `<div class="section"><div class="section-title">All Detected Patterns (${result.patterns.length})</div>${patternsHtml}</div>` : ''}

  <div class="footer">
    Generated by Trusten · ${date}
  </div>
</div>
</body>
</html>`
}

// ─── Internal renderers ───

function renderStep(step: WorkflowStep): string {
  const imgHtml = step.screenshot
    ? `<img class="step-img" src="data:image/jpeg;base64,${step.screenshot}" alt="Step ${step.stepNumber} screenshot">`
    : `<div style="background:#f1f5f9;border-radius:8px;padding:20px;text-align:center;color:#94a3b8;font-size:12px;margin:12px 0">No screenshot captured</div>`

  const patternsHtml =
    step.patternsFound.length === 0
      ? `<div class="no-patterns">✓ No dark patterns detected at this step</div>`
      : step.patternsFound
          .slice(0, 6)
          .map((p) => renderPattern(p))
          .join('')

  return `
<div class="step">
  <div class="step-header">
    <div class="step-num">${step.stepNumber}</div>
    <div>
      <div class="step-action">${escapeHtml(step.action)}</div>
      <div class="step-url">${escapeHtml(step.url)}</div>
    </div>
  </div>
  ${imgHtml}
  <div class="step-patterns">${patternsHtml}</div>
</div>`
}

function renderPattern(p: DetectedPattern): string {
  const evidenceText = (
    p.evidence?.domSnapshot ??
    p.evidence?.networkEvidence?.[0] ??
    ''
  ).slice(0, 200)
  const regs = (p.regulatoryViolations ?? [])
    .map((r) => `${r.regulation} ${r.article ?? ''}`.trim())
    .join(', ')

  return `
<div class="pattern pattern-${p.severity}">
  <div class="pattern-top">
    <span class="pattern-sev pattern-sev-${p.severity}">${p.severity}</span>
    <span class="pattern-category">${escapeHtml(p.category.replace(/_/g, ' '))}</span>
    <span class="confidence">${Math.round(p.confidence * 100)}% confidence</span>
  </div>
  <div class="pattern-desc">${escapeHtml(p.description)}</div>
  ${evidenceText ? `<div class="pattern-evidence">${escapeHtml(evidenceText)}</div>` : ''}
  ${regs ? `<div class="pattern-regs">Regulations: ${escapeHtml(regs)}</div>` : ''}
</div>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
