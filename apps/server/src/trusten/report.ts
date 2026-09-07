/**
 * Trusten — Report generation and screenshot annotation
 *
 * buildAnnotationScript()  — JS to inject a step-summary overlay before screenshotting
 * buildCleanupScript()     — JS to remove the overlay after the screenshot
 * generateReportHtml()     — Full HTML report with annotated screenshots
 */

import {
  CATEGORY_LABELS,
  getPatternContent,
  SEVERITY_COLOR,
  SHOWN_LEVELS,
  toShownLevel,
} from '@trusten/ui/content'
import type { DetectedPattern, ScanResult, WorkflowStep } from './types'

// ─── Screenshot annotation ───

/**
 * Returns a JS expression that draws a labeled bounding box around each detected
 * dark-pattern element, evaluated via browser.evaluate() right before the step
 * screenshot. The box is colored by severity and labeled with the pattern
 * category only — the full explanation lives in the report caption, not on the
 * image. The most severe locatable element is scrolled into view first.
 *
 * `stepNumber`/`totalSteps`/`action` are kept for call-site compatibility; the
 * step context is shown in the report, not painted onto the screenshot.
 */
export function buildAnnotationScript(
  _stepNumber: number,
  _totalSteps: number,
  _action: string,
  patterns: DetectedPattern[],
): string {
  const sevOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }
  const slim = [...patterns]
    .sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9))
    .slice(0, 8)
    .map((p) => ({
      cat:
        CATEGORY_LABELS[p.category as string] ??
        String(p.category).replace(/_/g, ' '),
      sev: p.severity,
      sel: p.element?.selector ?? '',
      text: (p.element?.text ?? '').trim().slice(0, 48),
    }))

  const pJson = JSON.stringify(slim)
  const sevJson = JSON.stringify(SEVERITY_COLOR)

  return `(function(){
    try {
      document.querySelectorAll('[data-trusten-box]').forEach(function(e){ e.remove(); });
      var patterns = ${pJson};
      var SEV = ${sevJson};
      if (!patterns.length) return 'boxes:0';

      function deepestMatch(needle){
        needle = needle.toLowerCase();
        var nodes = document.body ? document.body.querySelectorAll('*') : [];
        var match = null;
        for (var i=0;i<nodes.length;i++){
          var el = nodes[i];
          if ((el.textContent||'').toLowerCase().indexOf(needle) !== -1){
            var r = el.getBoundingClientRect();
            if (r.width>0 && r.height>0) match = el; /* keep deepest in tree order */
          }
        }
        return match;
      }
      function locate(p){
        if (p.sel){ try { var el=document.querySelector(p.sel); if(el) return el; } catch(e){} }
        if (p.text && p.text.length>=4) return deepestMatch(p.text);
        return null;
      }

      // Scroll the most severe locatable pattern into view so it is captured.
      for (var s=0;s<patterns.length;s++){
        var firstEl=locate(patterns[s]);
        if (firstEl){ try{ firstEl.scrollIntoView({block:'center',inline:'nearest'}); }catch(e){} break; }
      }

      var vh = window.innerHeight || 800;
      var drawn=0;
      patterns.forEach(function(p){
        if (drawn>=6) return;
        var el=locate(p);
        if(!el) return;
        var r=el.getBoundingClientRect();
        if(r.width<2||r.height<2) return;
        if(r.bottom<0 || r.top>vh) return; /* off-screen → no visible box */
        var color=SEV[p.sev]||'#e0651b';
        var box=document.createElement('div');
        box.setAttribute('data-trusten-box','1');
        box.style.cssText='position:fixed;z-index:2147483646;pointer-events:none;border:2.5px solid '+color+';border-radius:5px;box-shadow:0 0 0 2px rgba(255,255,255,.7);left:'+(r.left-3)+'px;top:'+(r.top-3)+'px;width:'+(r.width+6)+'px;height:'+(r.height+6)+'px;';
        document.documentElement.appendChild(box);
        var lt=r.top-22; if(lt<2) lt=r.top+4;
        var label=document.createElement('div');
        label.setAttribute('data-trusten-box','1');
        label.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;left:'+(r.left-3)+'px;top:'+lt+'px;background:'+color+';color:#fff;font:700 11px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:2px 8px;border-radius:5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);';
        label.textContent=p.cat;
        document.documentElement.appendChild(label);
        drawn++;
      });
      return 'boxes:'+drawn;
    } catch(e){ return 'error:'+String(e); }
  })()`
}

/** Returns a JS expression that removes the bounding boxes + labels. */
export function buildCleanupScript(): string {
  return `(function(){
    document.querySelectorAll('[data-trusten-box]').forEach(function(e){ e.remove(); });
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
    A: '#15a05a',
    B: '#7d9b1f',
    C: '#cf8a00',
    D: '#e0651b',
    F: '#d23b34',
  }
  const SEV_COLORS: Record<string, string> = {
    critical: '#d23b34',
    high: '#e0651b',
    medium: '#cf8a00',
    low: '#15a05a',
  }
  const SEV_BG: Record<string, string> = {
    critical: '#fbeceb',
    high: '#fbefe6',
    medium: '#fbf3e0',
    low: '#e9f6ef',
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
    '<div style="background:#1b1430;padding:14px 16px;border-radius:16px 16px 0 0;flex-shrink:0">',
      '<div style="display:flex;justify-content:space-between;align-items:center">',
        '<div>',
          '<div style="display:flex;align-items:center;gap:8px">',
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Z" fill="#7c3aed"/><path d="m8.5 12 2.4 2.4L15.5 9.7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
            '<span style="color:#fff;font-weight:700;font-size:14px">Trusten</span>',
            '<span style="color:#a99fc4;font-size:11px;font-weight:500">dark pattern scan</span>',
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
    '<div style="padding:10px 14px;border-top:1px solid #f1f5f9;background:#faf9f6;border-radius:0 0 16px 16px;flex-shrink:0">',
      '<a href="' + dashUrl + '" target="_blank" style="display:block;text-align:center;background:#7c3aed;color:#fff;text-decoration:none;font-size:12px;font-weight:600;padding:9px 12px;border-radius:9px">',
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

const REPORT_GRADE_COLORS: Record<string, string> = {
  A: '#176b55',
  B: '#3f7350',
  C: '#925113',
  D: '#a13f24',
  F: '#8f2d46',
}

const REPORT_HEADLINES: Record<string, string> = {
  A: 'This website looks fair',
  B: 'This website looks mostly fair',
  C: 'This website uses some unfair tricks',
  D: 'This website uses several unfair tricks',
  F: 'Be careful on this website',
}

/** Generate a complete, self-contained HTML report from a ScanResult. */
export function generateReportHtml(
  result: ScanResult,
  workflowName?: string,
): string {
  const gradeColor = REPORT_GRADE_COLORS[result.score.grade] ?? '#5b469a'
  const date = new Date(result.completedAt).toLocaleString()

  const seriousPatterns = result.patterns.filter(
    (p) => toShownLevel(p.severity) === 'serious',
  )
  const worthKnowingPatterns = result.patterns.filter(
    (p) => toShownLevel(p.severity) === 'worth-knowing',
  )
  const minorPatterns = result.patterns.filter(
    (p) => toShownLevel(p.severity) === 'minor',
  )

  const workflowSteps = result.workflowSteps ?? []
  const completedSteps = workflowSteps.filter(
    (step) =>
      !step.status || step.status === 'reached' || step.status === 'observed',
  ).length
  const limited =
    workflowSteps.length > 0 && completedSteps < workflowSteps.length
  const findingNoun = result.patterns.length === 1 ? 'concern' : 'concerns'
  const resultHeadline = limited
    ? 'Limited check'
    : REPORT_HEADLINES[result.score.grade]

  const coverageHtml = workflowSteps.length
    ? `<div class="coverage-card ${limited ? 'coverage-limited' : 'coverage-complete'}">
        <div class="coverage-icon" aria-hidden="true">${limited ? '!' : '&#10003;'}</div>
        <div>
          <div class="coverage-title">${limited ? 'We could not complete the whole journey' : 'Journey completed'}</div>
          <div class="coverage-copy">${completedSteps} of ${workflowSteps.length} steps completed. ${limited ? 'This result only describes the pages Trusten could check.' : 'Trusten reached every planned step.'}</div>
        </div>
      </div>`
    : `<div class="coverage-card coverage-complete">
        <div class="coverage-icon" aria-hidden="true">&#10003;</div>
        <div><div class="coverage-title">Page check</div><div class="coverage-copy">This result describes the page Trusten could inspect.</div></div>
      </div>`

  const stepsHtml = workflowSteps
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
<title>Trusten website check — ${escapeHtml(result.domain)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
  :root { --canvas:#efecf7; --surface:#f4f1f9; --rim:#d9d3e5; --ink:#292638; --muted:#5f596e; --violet:#5b469a; --deep-violet:#493777; --highlight:#fff; --shadow:#c9c2d8 }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: var(--canvas); color: var(--ink); font-size: 14px; line-height: 1.65; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  h1, h2, h3, .domain, .grade { letter-spacing: -0.025em }
  .page { max-width: 960px; margin: 0 auto; padding: 32px 24px }
  /* Header */
  .header { background: linear-gradient(145deg,#624ba1,#493777); color: #fff; border-radius: 22px; padding: 30px 34px; margin-bottom: 24px; position: relative; overflow: hidden; box-shadow: 10px 10px 24px rgba(143,132,165,.48),-10px -10px 24px rgba(255,255,255,.9) }
  .header::before { content: ''; position: absolute; inset: 0; background: radial-gradient(420px 260px at 90% -20%, rgba(255,255,255,.22), transparent 62%); pointer-events: none }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; position: relative }
  .logo { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #e4dbf7; margin-bottom: 8px }
  .domain { font-size: 26px; font-weight: 750; word-break: break-all }
  .url { font-size: 12px; color: #ded4f1; margin-top: 4px; word-break: break-all }
  .meta { font-size: 11px; color: #ded4f1; margin-top: 8px }
  /* Score card */
  .score-card { display: flex; align-items: center; gap: 14px; max-width: 360px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); border-radius: 16px; padding: 16px 20px; box-shadow: inset 2px 2px 5px rgba(48,32,80,.24),inset -2px -2px 5px rgba(255,255,255,.12) }
  .grade { display:flex;align-items:center;justify-content:center;width:58px;height:58px;flex-shrink:0;border-radius:50%;background:#f4f1f9;font-size:34px;font-weight:800;line-height:1;color:${gradeColor};box-shadow:inset 3px 3px 7px #c9c2d8,inset -3px -3px 7px #fff }
  .score-headline { font-size: 17px; line-height: 1.25; font-weight: 750; color: #fff }
  .score-label { font-size: 11px; color: #e4dbf7; margin-top: 4px }
  /* Severity bar */
  .severity-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; position: relative }
  .sev-pill { display: flex; align-items: center; gap: 6px; padding: 6px 13px; border-radius: 999px; font-size: 12px; font-weight: 600 }
  .sev-serious { background: #f5e5eb; color: #8f2d46 }
  .sev-worth-knowing { background: #f8edda; color: #925113 }
  .sev-minor { background: #e1f0eb; color: #176b55 }
  /* Section */
  .section { background: var(--surface); border-radius: 18px; border: 1px solid var(--rim); padding: 26px; margin-bottom: 20px; box-shadow:7px 7px 16px rgba(160,150,181,.4),-7px -7px 16px rgba(255,255,255,.88) }
  .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: var(--deep-violet); margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--rim) }
  .coverage-card { display:flex;gap:13px;align-items:flex-start;border-radius:14px;padding:15px 17px;margin-bottom:20px;border:1px solid var(--rim);background:var(--surface);box-shadow:5px 5px 11px rgba(160,150,181,.38),-5px -5px 11px rgba(255,255,255,.86) }
  .coverage-icon { width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800 }
  .coverage-complete .coverage-icon { color:#176b55;background:#e1f0eb }
  .coverage-limited .coverage-icon { color:#925113;background:#f8edda }
  .coverage-title { font-size:13px;font-weight:750;color:var(--ink) }
  .coverage-copy { margin-top:2px;font-size:12px;color:var(--muted) }
  /* Workflow step */
  .step { margin-bottom: 28px; padding-bottom: 28px; border-bottom: 1px solid var(--rim) }
  .step:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none }
  .step-header { display: flex; align-items: center; gap: 11px; margin-bottom: 12px }
  .step-num { width: 32px; height: 32px; border-radius: 50%; background: var(--violet); color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow:3px 3px 7px #c9c2d8,-3px -3px 7px #fff }
  .step-action { font-size: 14px; font-weight: 700; color: var(--ink) }
  .step-url { font-size: 11px; color: var(--muted); margin-top: 2px; word-break: break-all }
  .step-img { width: 100%; border-radius: 12px; border: 1px solid var(--rim); display: block; margin: 12px 0 }
  .step-patterns { margin-top: 10px }
  .no-patterns { font-size: 12px; color: #176b55; font-weight: 650 }
  /* Pattern item */
  .pattern { padding: 15px 17px; border-radius: 12px; border-left: 4px solid; margin-bottom: 11px; background: #efecf7; border-top: 1px solid var(--rim); border-right: 1px solid var(--rim); border-bottom: 1px solid var(--rim); box-shadow:inset 2px 2px 5px rgba(160,150,181,.3),inset -2px -2px 5px rgba(255,255,255,.78) }
  .pattern-serious { border-left-color: #8f2d46 }
  .pattern-worth-knowing { border-left-color: #925113 }
  .pattern-minor { border-left-color: #176b55 }
  .pattern-top { display: flex; align-items: center; gap: 8px; margin-bottom: 5px }
  .pattern-sev { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 8px; border-radius: 999px; color: #fff }
  .pattern-sev-serious { background: #8f2d46 }
  .pattern-sev-worth-knowing { background: #925113 }
  .pattern-sev-minor { background: #176b55 }
  .pattern-category { font-size: 13px; color: var(--ink); font-weight: 700 }
  .pattern-desc { font-size: 13px; color: var(--ink); margin-bottom: 7px }
  .pattern-why { font-size: 12px; color: var(--muted); margin-bottom: 8px }
  .pattern-evidence { font-size: 11px; color: var(--muted); background: #e8e3f1; padding: 8px 11px; border-radius: 8px; word-break: break-word }
  .pattern-regs { margin-top: 7px; font-size: 10px; color: var(--deep-violet); font-weight: 550 }
  .confidence { font-size: 10px; color: var(--muted); margin-left: auto }
  /* Footer */
  .footer { text-align: center; font-size: 11px; color: var(--muted); margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--rim) }
  @media print {
    body { background: #fff }
    .page { padding: 0 }
    .section { break-inside: avoid; border: 1px solid var(--rim); box-shadow:none }
    .header, .coverage-card { box-shadow:none }
    .step { break-inside: avoid }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-top">
      <div>
        <div class="logo">Trusten · Website check</div>
        <div class="domain">${escapeHtml(result.domain)}</div>
        <div class="url">${escapeHtml(displayUrl(result.url))}</div>
        <div class="meta">
          ${workflowName ? `Journey: <strong>${escapeHtml(publicWorkflowName(workflowName))}</strong> · ` : ''}
          Checked: ${date}
        </div>
      </div>
      <div class="score-card">
        <div class="grade">${result.score.grade}</div>
        <div class="score-details">
          <div class="score-headline">${resultHeadline}</div>
          <div class="score-label">${limited ? 'Provisional grade' : 'Grade'} ${result.score.grade} for the pages checked</div>
          <div class="score-label" style="margin-top:4px;color:#fff">${result.patterns.length} ${findingNoun} found</div>
        </div>
      </div>
    </div>
    <div class="severity-row">
      ${seriousPatterns.length ? `<div class="sev-pill sev-serious">${seriousPatterns.length} Serious</div>` : ''}
      ${worthKnowingPatterns.length ? `<div class="sev-pill sev-worth-knowing">${worthKnowingPatterns.length} Worth knowing</div>` : ''}
      ${minorPatterns.length ? `<div class="sev-pill sev-minor">${minorPatterns.length} Minor</div>` : ''}
      ${result.patterns.length === 0 ? '<div class="sev-pill sev-minor">No concerns found on the pages checked</div>' : ''}
    </div>
  </div>

  ${coverageHtml}

  <div class="section"><div class="section-title">What Trusten found</div><p style="color:var(--ink)">${result.patterns.length ? `Trusten found ${result.patterns.length} ${findingNoun} on the pages it checked. Read each concern below to see what it means and what Trusten saw.` : 'Trusten did not find a concern on the pages it checked. This does not guarantee that every part of the website is free from unfair design.'}</p></div>

  ${stepsHtml ? `<div class="section"><div class="section-title">Pages and steps checked</div>${stepsHtml}</div>` : ''}

  ${patternsHtml ? `<div class="section"><div class="section-title">Concerns found (${result.patterns.length})</div>${patternsHtml}</div>` : ''}

  <div class="footer">
    Generated by Trusten · ${date} · Results describe only the pages Trusten could check.
  </div>
</div>
</body>
</html>`
}

// ─── Internal renderers ───

const STEP_STATUS_STYLE: Record<string, [string, string, string]> = {
  reached: ['Completed', '#176b55', '#e1f0eb'],
  observed: ['Checked here', '#5b469a', '#e8e3f1'],
  'not-reached': ["Couldn't continue", '#925113', '#f8edda'],
  skipped: ['Not attempted', '#5f596e', '#e8e3f1'],
  'no-navigation': ["Couldn't continue", '#8f2d46', '#f5e5eb'],
}

function stepStatusBadge(step: WorkflowStep): string {
  const s = step.status ? STEP_STATUS_STYLE[step.status] : undefined
  if (!s) return ''
  return `<span style="flex-shrink:0;align-self:flex-start;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;padding:3px 9px;border-radius:999px;color:${s[1]};background:${s[2]}">${s[0]}</span>`
}

function renderStep(step: WorkflowStep): string {
  const skipped = step.status === 'skipped' || step.status === 'no-navigation'
  const action = publicStepAction(step.action)
  const outcome = publicStepOutcome(step)
  const imgHtml = step.screenshot
    ? `<img class="step-img" src="data:image/jpeg;base64,${step.screenshot}" alt="Page seen while Trusten tried to ${escapeHtml(action.toLowerCase())}">`
    : `<div style="background:#e8e3f1;border-radius:10px;padding:20px;text-align:center;color:#5f596e;font-size:12px;margin:12px 0">${skipped ? 'No page was checked for this step.' : 'No image was available for this step.'}</div>`

  const patternsHtml = skipped
    ? `<div style="font-size:12px;color:#5f596e">${outcome}</div>`
    : step.patternsFound.length === 0
      ? `<div class="no-patterns">No concerns found on this page</div>`
      : step.patternsFound
          .slice(0, 6)
          .map((p) => renderPattern(p))
          .join('')

  return `
<div class="step">
  <div class="step-header">
    <div class="step-num">${step.stepNumber}</div>
    <div style="flex:1">
      <div class="step-action">${escapeHtml(action)}</div>
      <div class="step-url">${escapeHtml(displayUrl(step.url))}</div>
      ${outcome && !skipped ? `<div class="step-url">${outcome}</div>` : ''}
    </div>
    ${stepStatusBadge(step)}
  </div>
  ${imgHtml}
  <div class="step-patterns">${patternsHtml}</div>
</div>`
}

function renderPattern(p: DetectedPattern): string {
  const content = getPatternContent(p.category)
  const shownLevel = toShownLevel(p.severity)
  const shown = SHOWN_LEVELS[shownLevel]
  const evidenceText = (p.element?.text?.trim() || p.description).slice(0, 220)
  const regs = (p.regulatoryViolations ?? [])
    .map((r) => `${r.regulation} ${r.article ?? ''}`.trim())
    .join(', ')
  const confidenceLabel =
    p.confidence >= 0.8
      ? 'Clear evidence'
      : p.confidence >= 0.6
        ? 'Possible concern'
        : 'Needs a closer look'

  return `
<div class="pattern pattern-${shownLevel}">
  <div class="pattern-top">
    <span class="pattern-sev pattern-sev-${shownLevel}">${shown.label}</span>
    <span class="pattern-category">${escapeHtml(content.name)}</span>
    <span class="confidence">${confidenceLabel}</span>
  </div>
  <div class="pattern-desc">${escapeHtml(genericWebsiteLanguage(content.what))}</div>
  <div class="pattern-why"><strong>Why this matters:</strong> ${escapeHtml(genericWebsiteLanguage(content.why))}</div>
  ${evidenceText ? `<div class="pattern-evidence"><strong>What Trusten saw:</strong> “${escapeHtml(evidenceText)}”</div>` : ''}
  ${regs ? `<div class="pattern-regs">${content.contested ? 'Rules regulators have pointed to' : 'Rules connected to this concern'}: ${escapeHtml(regs)}</div>` : ''}
</div>`
}

function publicWorkflowName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('checkout') || lower.includes('purchase'))
    return 'Check the buying journey'
  if (lower.includes('cancel')) return 'Check how cancellation works'
  if (lower.includes('sign') || lower.includes('account'))
    return 'Check account sign-up'
  if (lower.includes('privacy') || lower.includes('cookie'))
    return 'Check privacy choices'
  return 'Check the website journey'
}

function publicStepAction(action: string): string {
  const lower = action.toLowerCase()
  if (lower.includes('cookie') || lower.includes('consent'))
    return 'Check privacy choices'
  if (lower.includes('search')) return 'Search the website'
  if (lower.includes('basket') || lower.includes('cart'))
    return 'Add an item to the basket'
  if (lower.includes('checkout') || lower.includes('payment'))
    return 'Review the checkout'
  if (lower.includes('cancel')) return 'Look for a way to cancel'
  if (
    lower.includes('sign') ||
    lower.includes('register') ||
    lower.includes('account')
  )
    return 'Try to create an account'
  if (
    lower.includes('product') ||
    lower.includes('result') ||
    lower.includes('item')
  )
    return 'Open an item'
  return 'Check this part of the website'
}

function publicStepOutcome(step: WorkflowStep): string {
  if (step.status === 'not-reached') {
    return 'The website did not move to the next part of the journey.'
  }
  if (step.status === 'skipped') {
    return 'Trusten did not try this because an earlier step could not be completed.'
  }
  if (step.status === 'no-navigation') {
    return 'Trusten could not continue this part of the journey.'
  }
  return ''
}

function displayUrl(value: string): string {
  try {
    const parsed = new URL(value)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value
  }
}

function genericWebsiteLanguage(value: string): string {
  return value
    .replace(/\bShops\b/g, 'Websites')
    .replace(/\bShop\b/g, 'Website')
    .replace(/\bShoppers\b/g, 'People')
    .replace(/\bShopper\b/g, 'Person')
    .replace(/\bshops\b/gi, 'websites')
    .replace(/\bshop\b/gi, 'website')
    .replace(/\bshoppers\b/gi, 'people')
    .replace(/\bshopper\b/gi, 'person')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
