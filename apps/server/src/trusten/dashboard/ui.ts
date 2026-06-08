/**
 * Trusten Dashboard — HTML/CSS/JS UI Templates
 *
 * Server-side rendered HTML. No separate frontend build required.
 * Inspired by Google PageSpeed Insights — but for dark patterns.
 */

import type { DomainSummary, GlobalStats, ScanHistoryRow } from '../db'
import type { DetectedPattern, ScanResult } from '../types'

// ─── Design tokens ───

const GRADE_COLOR: Record<string, string> = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#d97706',
  D: '#ea580c',
  F: '#dc2626',
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#16a34a',
}

const SEVERITY_BG: Record<string, string> = {
  critical: '#fef2f2',
  high: '#fff7ed',
  medium: '#fffbeb',
  low: '#f0fdf4',
}

const CATEGORY_LABELS: Record<string, string> = {
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
  gamification_pressure: 'Gamification Pressure',
  preselected_options: 'Preselected Options',
  hidden_defaults: 'Hidden Defaults',
  repeated_prompts: 'Repeated Prompts',
  disguised_ads: 'Disguised Ads',
  comparison_prevention: 'Comparison Prevention',
  information_hiding: 'Information Hiding',
  privacy_zuckering: 'Privacy Zuckering',
  cookie_wall: 'Cookie Wall',
  dark_consent: 'Dark Consent',
  fake_hierarchy: 'Fake Hierarchy',
}

// ─── Shared layout ───

export function layout(title: string, body: string, extraHead = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} — Trusten</title>
${extraHead}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#0f172a;--navy2:#1e293b;--teal:#0ea5e9;--teal2:#38bdf8;
  --bg:#f8fafc;--card:#fff;--border:#e2e8f0;--muted:#64748b;--text:#0f172a;
  --radius:12px;--shadow:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06);
  --shadow-lg:0 4px 6px rgba(0,0,0,.07),0 10px 40px rgba(0,0,0,.1);
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;line-height:1.5}
a{color:var(--teal);text-decoration:none}
a:hover{text-decoration:underline}

/* Nav */
.nav{background:var(--navy);padding:0 24px;display:flex;align-items:center;gap:24px;height:60px;position:sticky;top:0;z-index:100}
.nav-brand{display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;font-size:1.15rem;text-decoration:none!important}
.nav-brand svg{opacity:.9}
.nav-links{display:flex;gap:4px;flex:1}
.nav-links a{color:#94a3b8;padding:6px 12px;border-radius:6px;font-size:.875rem;transition:color .15s,background .15s}
.nav-links a:hover,.nav-links a.active{color:#fff;background:rgba(255,255,255,.1);text-decoration:none}
.nav-right{display:flex;align-items:center;gap:12px}

/* Hero / page header */
.page-header{background:linear-gradient(135deg,var(--navy) 0%,#1e3a5f 100%);color:#fff;padding:48px 0 40px}
.page-header .container{max-width:1100px;margin:0 auto;padding:0 24px}
.page-header h1{font-size:2rem;font-weight:800;margin-bottom:8px}
.page-header p{color:#94a3b8;font-size:1.05rem}

/* Container */
.container{max-width:1100px;margin:0 auto;padding:0 24px}
.section{padding:40px 0}

/* Cards */
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
.card-pad{padding:24px}

/* Grid */
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media(max-width:768px){.grid-4,.grid-3,.grid-2{grid-template-columns:1fr}}

/* Stat cards */
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;text-align:center}
.stat-val{font-size:2rem;font-weight:800;line-height:1;margin-bottom:4px}
.stat-label{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;font-weight:600}

/* Score ring */
.score-ring-wrap{display:flex;flex-direction:column;align-items:center;gap:12px}
.score-ring{position:relative;width:140px;height:140px}
.score-ring svg{transform:rotate(-90deg)}
.score-ring-text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.score-ring-num{font-size:2.2rem;font-weight:900;line-height:1}
.score-ring-grade{font-size:.9rem;font-weight:700;opacity:.8}

/* Grade badge */
.grade{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;font-weight:800;font-size:.9rem;color:#fff;flex-shrink:0}

/* Pattern cards */
.pattern-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:12px;border-left:4px solid currentColor}
.pattern-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}
.pattern-cat{font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;font-weight:700;opacity:.7;margin-bottom:2px}
.pattern-desc{font-size:.9rem;line-height:1.55;color:#334155}
.pattern-evidence{margin-top:10px;padding:10px 14px;background:#f1f5f9;border-radius:8px;font-size:.8rem;color:var(--muted);font-family:monospace;white-space:pre-wrap;word-break:break-word;max-height:100px;overflow:hidden}
.pattern-evidence.expanded{max-height:none}
.expand-btn{background:none;border:none;color:var(--teal);cursor:pointer;font-size:.78rem;margin-top:6px;padding:0}

/* Severity badge */
.sev{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em}

/* Tables */
table{width:100%;border-collapse:collapse;font-size:.875rem}
th{text-align:left;padding:10px 14px;background:#f8fafc;border-bottom:2px solid var(--border);color:var(--muted);font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
td{padding:12px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#fafafa}

/* Forms */
.form-row{display:flex;gap:12px;align-items:stretch}
.form-input{flex:1;padding:12px 16px;border:1px solid var(--border);border-radius:8px;font-size:.95rem;outline:none;transition:border-color .15s,box-shadow .15s}
.form-input:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(14,165,233,.15)}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border:none;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;transition:opacity .15s,transform .1s;white-space:nowrap}
.btn:hover{opacity:.9}
.btn:active{transform:scale(.98)}
.btn-primary{background:var(--teal);color:#fff}
.btn-outline{background:#fff;border:1px solid var(--border);color:var(--text)}
.btn-sm{padding:7px 14px;font-size:.8rem}

/* Tabs */
.tabs{display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:24px}
.tab{padding:10px 18px;cursor:pointer;font-size:.875rem;font-weight:500;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s}
.tab.active{color:var(--teal);border-bottom-color:var(--teal)}
.tab-panel{display:none}
.tab-panel.active{display:block}

/* Domain score bar */
.score-bar-wrap{display:flex;align-items:center;gap:10px}
.score-bar{flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden}
.score-bar-fill{height:100%;border-radius:4px;transition:width .6s ease}

/* Regulatory tags */
.reg-tag{display:inline-block;padding:2px 7px;border-radius:4px;font-size:.7rem;font-weight:600;background:#eff6ff;color:#1d4ed8;margin:2px}

/* Search hero */
.search-hero{background:var(--navy);padding:56px 24px;text-align:center}
.search-hero h1{color:#fff;font-size:2.5rem;font-weight:900;margin-bottom:12px}
.search-hero p{color:#94a3b8;font-size:1.05rem;margin-bottom:32px;max-width:560px;margin-left:auto;margin-right:auto}
.search-box{max-width:640px;margin:0 auto}

/* Empty state */
.empty{text-align:center;padding:48px 24px;color:var(--muted)}
.empty h3{font-size:1.1rem;margin-bottom:6px;color:#475569}

/* Loader */
.loader{display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* Toast */
#toast{position:fixed;bottom:24px;right:24px;background:var(--navy);color:#fff;padding:14px 20px;border-radius:10px;font-size:.875rem;opacity:0;transform:translateY(8px);transition:all .25s;z-index:999;max-width:360px}
#toast.show{opacity:1;transform:none}
#toast.error{background:#dc2626}

.mt-8{margin-top:8px}
.mt-16{margin-top:16px}
.mt-24{margin-top:24px}
.mb-8{margin-bottom:8px}
.mb-16{margin-bottom:16px}
.flex{display:flex}
.items-center{align-items:center}
.gap-8{gap:8px}
.gap-16{gap:16px}
.text-muted{color:var(--muted)}
.text-sm{font-size:.875rem}
.font-bold{font-weight:700}
.font-mono{font-family:monospace}
</style>
</head>
<body>
<nav class="nav">
  <a href="/trusten" class="nav-brand">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
    </svg>
    Trusten
  </a>
  <div class="nav-links">
    <a href="/trusten">Dashboard</a>
    <a href="/trusten/audit">Audit a Site</a>
    <a href="/trusten/history">Scan History</a>
    <a href="/trusten/leaderboard">Leaderboard</a>
  </div>
</nav>
${body}
<div id="toast"></div>
<script>
function showToast(msg,isError=false){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className=isError?'show error':'show';
  clearTimeout(t._t);t._t=setTimeout(()=>t.className='',3500);
}
function switchTab(name){
  document.querySelectorAll('.tab,.tab-panel').forEach(el=>{
    const active=el.dataset.tab===name||el.dataset.panel===name;
    el.classList.toggle('active',active);
  });
}
function toggleImg(wrap){
  const img=wrap.querySelector('img');
  if(!img)return;
  if(img.style.maxHeight==='none'){img.style.maxHeight='480px';}
  else{img.style.maxHeight='none';}
}
document.querySelectorAll('.expand-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const ev=btn.previousElementSibling;
    ev.classList.toggle('expanded');
    btn.textContent=ev.classList.contains('expanded')?'Show less':'Show more';
  });
});
</script>
</body>
</html>`
}

// ─── Homepage ───

export function homePage(
  stats: GlobalStats,
  recent: ScanHistoryRow[],
  domains: DomainSummary[],
): string {
  const body = `
<div class="search-hero">
  <h1>Are you being manipulated online?</h1>
  <p>Trusten scans websites for dark patterns — manipulative UI/UX tactics that trick users into decisions they'd never make with full information.</p>
  <div class="search-box">
    <form class="form-row" id="scanForm">
      <input class="form-input" id="urlInput" type="url" placeholder="https://example.com" required style="background:#1e293b;border-color:#334155;color:#fff"/>
      <button type="submit" class="btn btn-primary" id="quickBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        Quick Scan
      </button>
      <button type="button" class="btn btn-outline" id="auditBtn" style="background:#1e293b;border-color:#334155;color:#94a3b8">
        Full Audit
      </button>
    </form>
  </div>
</div>

<div class="container section">
  <div class="grid-4">
    ${statCard(stats.totalScans.toLocaleString(), 'Sites Scanned')}
    ${statCard(stats.totalDomains.toLocaleString(), 'Unique Domains')}
    ${statCard(stats.totalPatterns.toLocaleString(), 'Dark Patterns Found')}
    ${statCard(stats.avgScore ? `${stats.avgScore}/100` : '—', 'Avg Trust Score')}
  </div>

  <div class="grid-2 mt-24">
    <div>
      <h2 class="font-bold mb-16" style="font-size:1.1rem">Recently Scanned</h2>
      <div class="card">
        ${
          recent.length === 0
            ? `<div class="empty"><h3>No scans yet</h3><p>Submit a URL above to get started.</p></div>`
            : `<table>
              <thead><tr><th>Domain</th><th>Score</th><th>Patterns</th><th>Type</th><th>When</th></tr></thead>
              <tbody>
                ${recent
                  .slice(0, 10)
                  .map(
                    (r) => `
                <tr>
                  <td><a href="/trusten/site/${esc(r.domain)}">${esc(r.domain)}</a></td>
                  <td><span class="grade" style="background:${GRADE_COLOR[r.scoreGrade] ?? '#64748b'}">${esc(r.scoreGrade)}</span> <span class="text-sm text-muted">${r.scoreNumeric}/100</span></td>
                  <td>${r.patternCount > 0 ? `<span style="color:#dc2626;font-weight:600">${r.patternCount}</span>` : '<span style="color:#16a34a">0</span>'}</td>
                  <td><span class="text-sm text-muted">${r.scanType}${r.workflowId ? ` · ${r.workflowId}` : ''}</span></td>
                  <td class="text-sm text-muted">${relTime(r.createdAt)}</td>
                </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>

    <div>
      <h2 class="font-bold mb-16" style="font-size:1.1rem">Domain Leaderboard</h2>
      <div class="card">
        ${
          domains.length === 0
            ? `<div class="empty"><h3>No data yet</h3></div>`
            : `<table>
              <thead><tr><th>Domain</th><th>Score</th><th>Scans</th></tr></thead>
              <tbody>
                ${domains
                  .slice(0, 10)
                  .map(
                    (d) => `
                <tr>
                  <td><a href="/trusten/site/${esc(d.domain)}">${esc(d.domain)}</a></td>
                  <td>
                    <div class="score-bar-wrap">
                      <span class="grade" style="background:${GRADE_COLOR[d.latestGrade] ?? '#64748b'}">${esc(d.latestGrade)}</span>
                      <div class="score-bar"><div class="score-bar-fill" style="width:${d.latestScore}%;background:${GRADE_COLOR[d.latestGrade] ?? '#64748b'}"></div></div>
                      <span class="text-sm text-muted">${d.latestScore}</span>
                    </div>
                  </td>
                  <td class="text-sm text-muted">${d.scanCount}</td>
                </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>
  </div>
</div>

<script>
const form=document.getElementById('scanForm');
const urlInput=document.getElementById('urlInput');
const quickBtn=document.getElementById('quickBtn');
const auditBtn=document.getElementById('auditBtn');

form.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const url=urlInput.value.trim();
  if(!url)return;
  quickBtn.innerHTML='<span class="loader"></span> Scanning…';
  quickBtn.disabled=true;
  try{
    const res=await fetch('/trusten/api/quick-scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const data=await res.json();
    if(data.scanId){window.location='/trusten/scan/'+data.scanId;}
    else if(data.domain){window.location='/trusten/site/'+data.domain;}
    else showToast(data.error||'Scan failed',true);
  }catch(err){showToast('Network error: '+err.message,true);}
  finally{quickBtn.innerHTML='Quick Scan';quickBtn.disabled=false;}
});

auditBtn.addEventListener('click',()=>{
  const url=urlInput.value.trim();
  if(!url){showToast('Enter a URL first',true);return;}
  window.location='/trusten/audit?url='+encodeURIComponent(url);
});
</script>`

  return layout('Dashboard', body)
}

// ─── Domain Report Page ───

export function domainPage(
  domain: string,
  summary: DomainSummary | null,
  scans: ScanHistoryRow[],
): string {
  const grade = summary?.latestGrade ?? 'F'
  const score = summary?.latestScore ?? 0
  const color = GRADE_COLOR[grade] ?? '#64748b'

  const _allPatterns: DetectedPattern[] = []
  for (const _scan of scans) {
    // We don't have patterns in history rows — point users to individual scans
  }

  const body = `
<div class="page-header">
  <div class="container">
    <div class="flex items-center gap-16" style="flex-wrap:wrap;gap:24px">
      <div class="score-ring-wrap">
        ${scoreRing(score, grade, 140)}
      </div>
      <div style="flex:1;min-width:200px">
        <p class="text-sm text-muted mb-8" style="color:#94a3b8">Dark Pattern Trust Score</p>
        <h1>${esc(domain)}</h1>
        <p style="color:#94a3b8;margin-top:6px">${summary ? `${summary.scanCount} scan${summary.scanCount !== 1 ? 's' : ''} · ${summary.totalPatterns} patterns found · Last scanned ${relTime(summary.latestScanAt)}` : 'Not yet scanned'}</p>
        <div class="flex gap-8 mt-16" style="flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="triggerScan('https://${esc(domain)}','quick')">Quick Scan</button>
          <a class="btn btn-outline btn-sm" href="/trusten/audit?url=https://${esc(domain)}">Full Audit</a>
        </div>
      </div>
      ${
        summary
          ? `
      <div class="grid-3" style="gap:12px;min-width:300px">
        ${miniStat(summary.totalPatterns.toString(), 'Total Patterns', '#dc2626')}
        ${miniStat(summary.criticalCount.toString(), 'Critical', '#dc2626')}
        ${miniStat(summary.highCount.toString(), 'High', '#ea580c')}
        ${miniStat(`${summary.avgScore}/100`, 'Avg Score', color)}
        ${miniStat(summary.scanCount.toString(), 'Scans', '#0ea5e9')}
        ${miniStat(relTime(summary.latestScanAt), 'Last Scan', '#64748b')}
      </div>`
          : ''
      }
    </div>
  </div>
</div>

<div class="container section">
  <h2 class="font-bold mb-16" style="font-size:1.1rem">Scan History</h2>
  <div class="card">
    ${
      scans.length === 0
        ? `<div class="empty"><h3>No scans yet for ${esc(domain)}</h3><p>Use the buttons above to start a scan.</p></div>`
        : `<table>
          <thead><tr><th>Date</th><th>Score</th><th>Patterns</th><th>Critical</th><th>Type</th><th></th></tr></thead>
          <tbody>
            ${scans
              .map(
                (s) => `
            <tr>
              <td class="text-sm">${s.createdAt.slice(0, 16).replace('T', ' ')}</td>
              <td><span class="grade" style="background:${GRADE_COLOR[s.scoreGrade] ?? '#64748b'}">${esc(s.scoreGrade)}</span> <span class="text-sm text-muted">${s.scoreNumeric}/100</span></td>
              <td>${patternCountBadge(s.patternCount)}</td>
              <td>${s.criticalCount > 0 ? `<span style="color:#dc2626;font-weight:700">${s.criticalCount}</span>` : '<span class="text-muted">0</span>'}</td>
              <td class="text-sm text-muted">${s.scanType}${s.workflowId ? ` · ${s.workflowId}` : ''}</td>
              <td><a class="btn btn-outline btn-sm" href="/trusten/scan/${esc(s.id)}">View</a></td>
            </tr>`,
              )
              .join('')}
          </tbody>
        </table>`
    }
  </div>
</div>

<script>
async function triggerScan(url,type){
  showToast('Starting '+type+' scan…');
  const res=await fetch('/trusten/api/quick-scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
  const data=await res.json();
  if(data.scanId)window.location='/trusten/scan/'+data.scanId;
  else showToast(data.error||'Scan failed',true);
}
</script>`

  return layout(`${domain} — Domain Report`, body)
}

// ─── Scan Detail Page ───

export function scanPage(scan: ScanResult | null, id: string): string {
  if (!scan) {
    return layout(
      'Scan Not Found',
      `
<div class="container section">
  <div class="empty">
    <h3>Scan not found</h3>
    <p>The scan ID <code>${esc(id)}</code> does not exist in the database.</p>
    <a class="btn btn-primary mt-24" href="/trusten">Back to Dashboard</a>
  </div>
</div>`,
    )
  }

  const grade = scan.score.grade
  const score = scan.score.numeric
  const color = GRADE_COLOR[grade] ?? '#64748b'

  // Group patterns by category
  const byCategory: Record<string, DetectedPattern[]> = {}
  for (const p of scan.patterns) {
    if (!byCategory[p.category]) byCategory[p.category] = []
    byCategory[p.category].push(p)
  }

  // Sort categories by severity
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  const sortedCategories = Object.entries(byCategory).sort(([, a], [, b]) => {
    const aMax = Math.min(...a.map((p) => sevOrder[p.severity] ?? 3))
    const bMax = Math.min(...b.map((p) => sevOrder[p.severity] ?? 3))
    return aMax - bMax
  })

  // Collect unique regulatory violations
  const regs = new Set<string>()
  for (const p of scan.patterns) {
    for (const v of p.regulatoryViolations ?? []) {
      regs.add(v.regulation)
    }
  }

  const body = `
<div class="page-header">
  <div class="container">
    <div class="flex items-center gap-16" style="flex-wrap:wrap;gap:24px">
      <div class="score-ring-wrap">
        ${scoreRing(score, grade, 140)}
      </div>
      <div style="flex:1;min-width:200px">
        <p class="text-sm mb-8" style="color:#94a3b8">Scan Result</p>
        <h1 style="font-size:1.5rem;word-break:break-all">${esc(scan.domain)}</h1>
        <p style="color:#94a3b8;margin-top:4px;font-size:.875rem">${esc(scan.url)}</p>
        <p style="color:#64748b;margin-top:8px;font-size:.875rem">${scan.scanType.charAt(0).toUpperCase() + scan.scanType.slice(1)} scan · ${scan.startedAt.slice(0, 16).replace('T', ' ')} UTC</p>
        ${regs.size > 0 ? `<div class="mt-16">${[...regs].map((r) => `<span class="reg-tag">${esc(r)}</span>`).join('')}</div>` : ''}
        <div class="flex gap-8 mt-16">
          <a class="btn btn-outline btn-sm" href="/trusten/site/${esc(scan.domain)}">All scans for domain</a>
          ${scan.pdfPath ? `<a class="btn btn-outline btn-sm" href="/trusten/report/${esc(scan.id)}/pdf">Download PDF</a>` : ''}
          ${scan.videoPath ? `<a class="btn btn-outline btn-sm" href="#recording">▶ Watch Recording</a>` : ''}
        </div>
      </div>
      <div class="grid-3" style="gap:12px;min-width:260px">
        ${miniStat(scan.patterns.length.toString(), 'Patterns Found', score < 50 ? '#dc2626' : '#0ea5e9')}
        ${miniStat(scan.patterns.filter((p) => p.severity === 'critical').length.toString(), 'Critical', '#dc2626')}
        ${miniStat(scan.patterns.filter((p) => p.severity === 'high').length.toString(), 'High', '#ea580c')}
        ${miniStat(sortedCategories.length.toString(), 'Categories', '#8b5cf6')}
        ${miniStat(regs.size.toString(), 'Regulations', '#0891b2')}
        ${miniStat(`${score}/100`, 'Trust Score', color)}
      </div>
    </div>
  </div>
</div>

<div class="container section">
  ${
    scan.videoPath
      ? `
  <div class="card" id="recording" style="overflow:hidden;margin-bottom:24px;border-top:3px solid var(--teal)">
    <div class="card-pad" style="border-bottom:1px solid var(--border)">
      <h3 class="font-bold flex items-center gap-8" style="font-size:.95rem">
        <span>🎬</span> Session Recording
        <span class="text-sm text-muted">— the full automated browse, exactly as it happened</span>
      </h3>
    </div>
    <video controls preload="metadata" style="width:100%;max-height:520px;background:#000;display:block"
      src="/trusten/report/${esc(scan.id)}/video">
      Your browser does not support embedded video.
    </video>
  </div>`
      : ''
  }
  ${
    scan.patterns.length === 0
      ? `
  <div class="card card-pad" style="text-align:center;padding:48px">
    <div style="font-size:3rem;margin-bottom:16px">✅</div>
    <h2 style="color:#16a34a;margin-bottom:8px">No Dark Patterns Detected</h2>
    <p class="text-muted">This scan found no manipulative patterns on the page at the time of scanning.</p>
  </div>`
      : `
  <div class="tabs">
    <div class="tab active" data-tab="patterns" onclick="switchTab('patterns')">Patterns (${scan.patterns.length})</div>
    ${scan.workflowSteps?.length ? `<div class="tab" data-tab="workflow" onclick="switchTab('workflow')">Workflow Steps (${scan.workflowSteps.length})</div>` : ''}
  </div>

  <div class="tab-panel active" data-panel="patterns">
    ${sortedCategories
      .map(
        ([cat, patterns]) => `
    <div style="margin-bottom:28px">
      <h3 class="mb-8 flex items-center gap-8" style="font-size:.95rem">
        <span class="sev" style="background:${SEVERITY_BG[patterns[0].severity]};color:${SEVERITY_COLOR[patterns[0].severity]}">${patterns[0].severity}</span>
        ${esc(CATEGORY_LABELS[cat] ?? cat)} <span class="text-muted text-sm">(${patterns.length})</span>
      </h3>
      ${patterns.map((p) => patternCard(p)).join('')}
    </div>`,
      )
      .join('')}
  </div>

  ${
    scan.workflowSteps?.length
      ? `
  <div class="tab-panel" data-panel="workflow">
    ${scan.workflowSteps
      .map((step, i) => {
        const hasScreenshot =
          (step as typeof step & { screenshotPath?: string }).screenshotPath ||
          (step.screenshot &&
            step.screenshot !== '[captured]' &&
            step.screenshot !== '[saved]')
        const screenshotSrc = `/trusten/report/${esc(scan.id)}/screenshot/${step.stepNumber}`
        const stepPatterns = step.patternsFound ?? []
        const critCount = stepPatterns.filter(
          (p: DetectedPattern) => p.severity === 'critical',
        ).length
        const highCount = stepPatterns.filter(
          (p: DetectedPattern) => p.severity === 'high',
        ).length

        return `
    <div class="card mb-16" style="overflow:hidden;border-top:3px solid var(--teal)">
      <div class="card-pad" style="border-bottom:1px solid var(--border)">
        <div class="flex items-center gap-8 mb-8">
          <span style="background:var(--teal);color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:800;flex-shrink:0">${i + 1}</span>
          <div style="flex:1;min-width:0">
            <div class="text-sm font-bold" style="word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(step.url)}</div>
            <div class="text-sm text-muted mt-8">${esc(step.action.slice(0, 180))}</div>
          </div>
          <div class="flex gap-8" style="flex-shrink:0">
            ${critCount > 0 ? `<span class="sev" style="background:#fef2f2;color:#dc2626">${critCount} critical</span>` : ''}
            ${highCount > 0 ? `<span class="sev" style="background:#fff7ed;color:#ea580c">${highCount} high</span>` : ''}
            ${stepPatterns.length === 0 ? '<span class="sev" style="background:#f0fdf4;color:#16a34a">clean</span>' : ''}
          </div>
        </div>
      </div>
      ${
        hasScreenshot
          ? `
      <div style="position:relative;background:#000;text-align:center;cursor:pointer" onclick="toggleImg(this)">
        <img src="${screenshotSrc}"
          alt="Step ${i + 1} screenshot"
          loading="lazy"
          style="max-width:100%;max-height:480px;object-fit:contain;display:block;margin:0 auto"
          onerror="this.parentElement.style.display='none'"
        />
        ${
          stepPatterns.length > 0
            ? `
        <div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.7);color:#fff;border-radius:6px;padding:4px 10px;font-size:.75rem;font-weight:700">
          ${stepPatterns.length} pattern${stepPatterns.length !== 1 ? 's' : ''} detected
        </div>`
            : ''
        }
      </div>`
          : `
      <div style="background:#f1f5f9;padding:24px;text-align:center;color:var(--muted);font-size:.8rem">
        No screenshot captured for this step
      </div>`
      }
      ${
        stepPatterns.length > 0
          ? `
      <div class="card-pad" style="padding-top:12px;padding-bottom:12px;background:#fafafa;border-top:1px solid var(--border)">
        <div class="text-sm font-bold mb-8">Patterns found at this step:</div>
        ${stepPatterns
          .slice(0, 4)
          .map(
            (p: DetectedPattern) => `
        <div class="flex gap-8 mb-8 items-center">
          <span class="sev" style="background:${SEVERITY_BG[p.severity]};color:${SEVERITY_COLOR[p.severity]};flex-shrink:0">${p.severity}</span>
          <span class="text-sm">${esc(CATEGORY_LABELS[p.category] ?? p.category)}: ${esc(p.description.slice(0, 100))}</span>
        </div>`,
          )
          .join('')}
        ${stepPatterns.length > 4 ? `<div class="text-sm text-muted">+${stepPatterns.length - 4} more — see Patterns tab</div>` : ''}
      </div>`
          : ''
      }
    </div>`
      })
      .join('')}
  </div>`
      : ''
  }
  `
  }
</div>`

  return layout(`${scan.domain} Scan — ${grade} Grade`, body)
}

// ─── Audit Submission Page ───

export function auditPage(prefillUrl = ''): string {
  const body = `
<div class="page-header">
  <div class="container">
    <h1>Full Site Audit</h1>
    <p>Run fixed workflows (checkout, signup, cookies, pricing, cancellation) — or let the agent auto-discover journeys for this site. Optionally watch it live.</p>
  </div>
</div>

<div class="container section">
  <div class="grid-2">
    <div>
      <div class="card card-pad">
        <h2 class="font-bold mb-16">Submit a Domain for Audit</h2>
        <form id="auditForm">
          <label class="text-sm font-bold mb-8 flex" style="display:block">Website URL</label>
          <input class="form-input mb-16" id="auditUrl" type="url" placeholder="https://example.com" value="${esc(prefillUrl)}" required style="display:block;width:100%"/>

          <div class="mb-16" style="display:flex;flex-direction:column;gap:10px">
            <label class="flex items-center gap-8 text-sm" style="cursor:pointer">
              <input type="checkbox" id="discoverToggle"/> 🧭 <strong>Auto-discover workflows</strong> — let the agent explore the site and plan tailored journeys
            </label>
            <label class="flex items-center gap-8 text-sm" style="cursor:pointer">
              <input type="checkbox" id="watchToggle"/> 👁 <strong>Watch live</strong> — stream the browser here while it scans
            </label>
          </div>

          <div id="wfSection">
            <label class="text-sm font-bold mb-8 flex" style="display:block">Workflows to run</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">
              ${[
                'checkout',
                'signup',
                'cookie_consent',
                'pricing',
                'cancellation',
              ]
                .map(
                  (wf) =>
                    `<label class="flex items-center gap-8 text-sm" style="cursor:pointer">
                  <input type="checkbox" name="workflow" value="${wf}" checked/> ${wf.replace('_', ' ')}
                </label>`,
                )
                .join('')}
            </div>
          </div>
          <button type="submit" class="btn btn-primary" id="auditSubmit" style="width:100%">
            Start Audit
          </button>
        </form>
      </div>
    </div>

    <div>
      <div class="card card-pad" style="background:var(--navy);color:#fff;border-color:#1e293b">
        <h3 class="font-bold mb-16">What gets audited?</h3>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:12px">
          ${[
            [
              '🛒',
              'Checkout Flow',
              'Drip pricing, basket sneaking, urgency tactics at checkout',
            ],
            [
              '📝',
              'Signup Flow',
              'Forced registration, preselected opt-ins, dark consent',
            ],
            [
              '🍪',
              'Cookie Consent',
              'Cookie walls, asymmetric accept/reject, hidden opt-out',
            ],
            [
              '💰',
              'Pricing Page',
              'Comparison prevention, hidden fees, biased plan display',
            ],
            [
              '❌',
              'Cancellation Flow',
              'Roach motel, guilt-trip language, friction tactics',
            ],
          ]
            .map(
              ([icon, name, desc]) => `
          <li class="flex gap-8">
            <span style="font-size:1.2rem">${icon}</span>
            <div><strong class="text-sm">${name}</strong><br><span style="color:#94a3b8;font-size:.8rem">${desc}</span></div>
          </li>`,
            )
            .join('')}
        </ul>
      </div>
    </div>
  </div>

  <div id="auditStatus" style="display:none" class="card card-pad mt-24">
    <div class="flex items-center gap-16">
      <span class="loader" style="border-color:rgba(14,165,233,.3);border-top-color:var(--teal);width:28px;height:28px;border-width:3px"></span>
      <div>
        <strong id="statusTitle">Running audit…</strong>
        <p class="text-sm text-muted mt-8" id="statusMsg">This may take 2–5 minutes per workflow.</p>
      </div>
    </div>
    <div id="progressList" class="mt-16"></div>
    <div id="planBox" class="mt-16"></div>
    <div id="liveBox" class="mt-16" style="display:none">
      <div class="text-sm font-bold mb-8">👁 Live view</div>
      <img id="liveView" alt="live scan" style="width:100%;border:1px solid var(--border);border-radius:8px;background:#000;display:block"/>
    </div>
  </div>
</div>

<script>
const form=document.getElementById('auditForm');
const discoverToggle=document.getElementById('discoverToggle');
const watchToggle=document.getElementById('watchToggle');
const wfSection=document.getElementById('wfSection');
discoverToggle.addEventListener('change',()=>{ wfSection.style.display=discoverToggle.checked?'none':'block'; });

function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

form.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const url=document.getElementById('auditUrl').value.trim();
  const mode=discoverToggle.checked?'discover':'fixed';
  const watch=watchToggle.checked;
  const workflows=[...document.querySelectorAll('input[name="workflow"]:checked')].map(el=>el.value);
  if(!url){showToast('Enter a URL',true);return;}
  if(mode==='fixed'&&!workflows.length){showToast('Select at least one workflow',true);return;}

  const btn=document.getElementById('auditSubmit');
  btn.disabled=true;btn.innerHTML='<span class="loader"></span> Starting…';

  try{
    const res=await fetch('/trusten/api/audit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,workflows,mode,watch})});
    const data=await res.json();
    if(data.jobId){
      document.getElementById('auditStatus').style.display='block';
      if(watch) openLive(data.jobId);
      pollJob(data.jobId,url,workflows);
    } else {
      showToast(data.error||'Failed to start audit',true);
      btn.disabled=false;btn.innerHTML='Start Audit';
    }
  }catch(err){
    showToast('Error: '+err.message,true);
    btn.disabled=false;btn.innerHTML='Start Audit';
  }
});

function openLive(jobId){
  const box=document.getElementById('liveBox');
  const img=document.getElementById('liveView');
  const msg=document.getElementById('statusMsg');
  box.style.display='block';
  try{
    const proto=location.protocol==='https:'?'wss':'ws';
    const ws=new WebSocket(proto+'://'+location.host+'/trusten/api/jobs/'+jobId+'/live');
    ws.onmessage=(ev)=>{
      try{
        const e=JSON.parse(ev.data);
        if(e.type==='frame'&&e.data){ img.src='data:image/jpeg;base64,'+e.data; }
        else if(e.type==='progress'&&e.action){ msg.textContent=e.action; }
        else if(e.type==='done'||e.type==='error'){ try{ws.close();}catch(_){} }
      }catch(_){}
    };
    ws.onerror=()=>{};
  }catch(_){}
}

async function pollJob(jobId,url,workflows){
  const title=document.getElementById('statusTitle');
  const msg=document.getElementById('statusMsg');
  const prog=document.getElementById('progressList');
  const planBox=document.getElementById('planBox');
  let done=false;

  while(!done){
    await new Promise(r=>setTimeout(r,3000));
    try{
      const res=await fetch('/trusten/api/audit/'+jobId);
      const data=await res.json();
      title.textContent=data.status==='done'?'Audit complete!':(data.status==='failed'?'Audit failed':('Running: '+data.currentStep));
      if(data.status==='done'){ msg.textContent='Redirecting to results…'; }
      else if(data.status==='failed'){ msg.textContent=data.error||'Unknown error'; }
      if(data.plan&&data.plan.length){
        planBox.innerHTML='<div class="text-sm font-bold mb-8">Discovered workflows</div>'+data.plan.map(p=>'<div class="text-sm mb-8">🧭 <strong>'+escapeHtml(p.name)+'</strong> ('+p.steps+' steps) — '+escapeHtml(p.description)+'</div>').join('');
      }
      if(data.completedWorkflows&&data.completedWorkflows.length){
        prog.innerHTML=data.completedWorkflows.map(w=>'<div class="flex items-center gap-8 mb-8 text-sm"><span style="color:#16a34a">✓</span> '+escapeHtml(w)+' complete</div>').join('');
      }
      if(data.status==='done'){
        done=true;
        setTimeout(()=>window.location='/trusten/site/'+encodeURIComponent(data.domain),1800);
      } else if(data.status==='failed'){
        done=true;
        showToast(data.error||'Audit failed',true);
      }
    }catch(_){}
  }
}
</script>`

  return layout('Full Site Audit', body)
}

// ─── History Page ───

export function historyPage(scans: ScanHistoryRow[]): string {
  const body = `
<div class="page-header">
  <div class="container">
    <h1>Scan History</h1>
    <p>All scans stored in the local database.</p>
  </div>
</div>
<div class="container section">
  <div class="card">
    ${
      scans.length === 0
        ? `<div class="empty"><h3>No scans yet</h3><p>Submit a URL on the dashboard to begin.</p></div>`
        : `<table>
          <thead><tr><th>Domain</th><th>URL</th><th>Score</th><th>Patterns</th><th>Type</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${scans
              .map(
                (s) => `
            <tr>
              <td><a href="/trusten/site/${esc(s.domain)}">${esc(s.domain)}</a></td>
              <td class="text-sm text-muted font-mono" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.url)}</td>
              <td><span class="grade" style="background:${GRADE_COLOR[s.scoreGrade] ?? '#64748b'}">${esc(s.scoreGrade)}</span> <span class="text-sm text-muted">${s.scoreNumeric}/100</span></td>
              <td>${patternCountBadge(s.patternCount)}</td>
              <td class="text-sm text-muted">${s.scanType}${s.workflowId ? ` · ${s.workflowId}` : ''}</td>
              <td class="text-sm text-muted">${s.createdAt.slice(0, 16).replace('T', ' ')}</td>
              <td><a class="btn btn-outline btn-sm" href="/trusten/scan/${esc(s.id)}">View</a></td>
            </tr>`,
              )
              .join('')}
          </tbody>
        </table>`
    }
  </div>
</div>`

  return layout('Scan History', body)
}

// ─── Leaderboard Page ───

export function leaderboardPage(domains: DomainSummary[]): string {
  const body = `
<div class="page-header">
  <div class="container">
    <h1>Site Leaderboard</h1>
    <p>All scanned domains ranked by trust score — higher is cleaner.</p>
  </div>
</div>
<div class="container section">
  <div class="card">
    ${
      domains.length === 0
        ? `<div class="empty"><h3>No data yet</h3><p>Scan some websites to populate the leaderboard.</p></div>`
        : `<table>
          <thead><tr><th>#</th><th>Domain</th><th>Trust Score</th><th>Patterns</th><th>Critical</th><th>Scans</th><th>Last Scanned</th></tr></thead>
          <tbody>
            ${domains
              .map(
                (d, i) => `
            <tr>
              <td class="text-muted text-sm font-bold">${i + 1}</td>
              <td><a href="/trusten/site/${esc(d.domain)}">${esc(d.domain)}</a></td>
              <td>
                <div class="score-bar-wrap">
                  <span class="grade" style="background:${GRADE_COLOR[d.latestGrade] ?? '#64748b'}">${esc(d.latestGrade)}</span>
                  <div class="score-bar" style="max-width:120px">
                    <div class="score-bar-fill" style="width:${d.latestScore}%;background:${GRADE_COLOR[d.latestGrade] ?? '#64748b'}"></div>
                  </div>
                  <span class="text-sm text-muted">${d.latestScore}/100</span>
                </div>
              </td>
              <td>${patternCountBadge(d.totalPatterns)}</td>
              <td>${d.criticalCount > 0 ? `<span style="color:#dc2626;font-weight:700">${d.criticalCount}</span>` : '<span class="text-muted">0</span>'}</td>
              <td class="text-sm text-muted">${d.scanCount}</td>
              <td class="text-sm text-muted">${relTime(d.latestScanAt)}</td>
            </tr>`,
              )
              .join('')}
          </tbody>
        </table>`
    }
  </div>
</div>`

  return layout('Leaderboard', body)
}

// ─── Shared components ───

function scoreRing(score: number, grade: string, size = 140): string {
  const color = GRADE_COLOR[grade] ?? '#64748b'
  const r = 54
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return `
<div class="score-ring" style="width:${size}px;height:${size}px">
  <svg width="${size}" height="${size}" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${r}" stroke="#e2e8f0" stroke-width="10" fill="none"/>
    <circle cx="60" cy="60" r="${r}" stroke="${color}" stroke-width="10" fill="none"
      stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
  </svg>
  <div class="score-ring-text">
    <span class="score-ring-num" style="color:${color}">${Math.round(score)}</span>
    <span class="score-ring-grade" style="color:${color}">${grade}</span>
  </div>
</div>`
}

function statCard(value: string, label: string): string {
  return `<div class="stat-card"><div class="stat-val">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`
}

function miniStat(value: string, label: string, color = '#0f172a'): string {
  return `<div class="stat-card" style="padding:12px 16px">
    <div class="stat-val" style="font-size:1.3rem;color:${color}">${esc(value)}</div>
    <div class="stat-label">${esc(label)}</div>
  </div>`
}

function patternCard(p: DetectedPattern): string {
  const color = SEVERITY_COLOR[p.severity] ?? '#64748b'
  const bg = SEVERITY_BG[p.severity] ?? '#f8fafc'
  const evidence = p.evidence?.domSnapshot ?? p.element?.text ?? ''
  const regs = p.regulatoryViolations ?? []
  return `
<div class="pattern-card" style="border-left-color:${color}">
  <div class="pattern-header">
    <span class="sev" style="background:${bg};color:${color}">${p.severity}</span>
    <div style="flex:1">
      <div class="pattern-cat" style="color:${color}">${esc(CATEGORY_LABELS[p.category] ?? p.category)}${p.source === 'deep-cache' ? ` <span style="background:#eef2ff;color:#4338ca;border-radius:4px;padding:1px 6px;font-size:.62rem;letter-spacing:.03em;margin-left:6px">FROM FULL AUDIT${p.cachedAt ? ` · ${esc(String(p.cachedAt).slice(0, 10))}` : ''}</span>` : ''}</div>
      <div class="pattern-desc">${esc(p.description)}</div>
    </div>
    <span class="text-sm text-muted" style="white-space:nowrap">${Math.round(p.confidence * 100)}% confident</span>
  </div>
  ${
    evidence
      ? `<div class="pattern-evidence">${esc(evidence.slice(0, 300))}</div>
    ${evidence.length > 300 ? `<button class="expand-btn">Show more</button>` : ''}`
      : ''
  }
  ${
    regs.length > 0
      ? `<div class="mt-8">${regs
          .slice(0, 4)
          .map(
            (v) =>
              `<span class="reg-tag" title="${esc(v.description)}">${esc(v.regulation)}</span>`,
          )
          .join('')}</div>`
      : ''
  }
</div>`
}

function patternCountBadge(count: number): string {
  if (count === 0) return '<span style="color:#16a34a;font-weight:600">0</span>'
  if (count >= 5)
    return `<span style="color:#dc2626;font-weight:700">${count}</span>`
  return `<span style="color:#ea580c;font-weight:600">${count}</span>`
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function relTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return iso.slice(0, 10)
  } catch {
    return iso.slice(0, 10)
  }
}
