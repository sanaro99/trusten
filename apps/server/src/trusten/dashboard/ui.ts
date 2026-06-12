/**
 * Trusten Dashboard — HTML/CSS/JS UI Templates
 *
 * Server-side rendered HTML. No separate frontend build required.
 *
 * Design language: warm, editorial, calm — inspired by Anthropic — with a
 * purple primary, ivory neutrals, and a deep-aubergine "ink" for dark surfaces.
 */

import type { DomainSummary, GlobalStats, ScanHistoryRow } from '../db'
import type { DetectedPattern, ScanResult, WorkflowStep } from '../types'

// ─── Design tokens ───

const GRADE_COLOR: Record<string, string> = {
  A: '#15a05a',
  B: '#7d9b1f',
  C: '#cf8a00',
  D: '#e0651b',
  F: '#d23b34',
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#d23b34',
  high: '#e0651b',
  medium: '#cf8a00',
  low: '#15a05a',
}

const SEVERITY_BG: Record<string, string> = {
  critical: '#fbeceb',
  high: '#fbefe6',
  medium: '#fbf3e0',
  low: '#e9f6ef',
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

export function layout(
  title: string,
  body: string,
  extraHead = '',
  activeNav = '',
): string {
  const navLink = (href: string, label: string, key: string) =>
    `<a href="${href}" class="${activeNav === key ? 'active' : ''}">${label}</a>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} — Trusten</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;450;500;600;700&display=swap" rel="stylesheet"/>
${extraHead}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  /* Brand purple */
  --p-50:#f6f4fe;--p-100:#ede9fe;--p-200:#ddd6fe;--p-300:#c4b5fd;
  --p-400:#a78bfa;--p-500:#8b5cf6;--p-600:#7c3aed;--p-700:#6d28d9;
  --p-800:#5b21b6;--p-900:#4c1d95;
  --primary:#7c3aed;--primary-dark:#6d28d9;--primary-soft:#ede9fe;

  /* Deep aubergine ink (dark surfaces) */
  --ink:#1b1430;--ink-2:#271c45;--ink-soft:#b3a9cf;--ink-faint:#8579a8;

  /* Warm ivory neutrals */
  --bg:#faf9f6;--bg-warm:#f3f0e9;--card:#ffffff;
  --border:#e9e3d8;--border-strong:#dcd4c5;
  --text:#211c2e;--muted:#6c6577;--muted-2:#9791a6;

  --radius:16px;--radius-md:12px;--radius-sm:9px;
  --shadow-sm:0 1px 2px rgba(27,20,48,.05),0 1px 3px rgba(27,20,48,.05);
  --shadow:0 2px 6px rgba(27,20,48,.04),0 10px 30px rgba(27,20,48,.07);
  --shadow-lg:0 18px 60px rgba(27,20,48,.14);
  --serif:'Fraunces',Georgia,'Times New Roman',serif;
  --sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
}
html{-webkit-text-size-adjust:100%}
body{font-family:var(--sans);background:var(--bg);color:var(--text);min-height:100vh;line-height:1.55;font-feature-settings:'cv02','cv03','cv04','cv11';-webkit-font-smoothing:antialiased}
a{color:var(--primary-dark);text-decoration:none}
a:hover{color:var(--primary)}
h1,h2,h3,h4{font-family:var(--serif);font-weight:600;letter-spacing:-.01em;line-height:1.15;color:var(--text)}
::selection{background:var(--p-200);color:var(--ink)}

/* Nav */
.nav{position:sticky;top:0;z-index:100;height:64px;display:flex;align-items:center;gap:28px;padding:0 28px;
  background:rgba(250,249,246,.82);backdrop-filter:saturate(160%) blur(12px);border-bottom:1px solid var(--border)}
.nav-brand{display:flex;align-items:center;gap:10px;color:var(--text);font-weight:600;font-size:1.12rem;font-family:var(--serif);letter-spacing:-.01em}
.nav-brand:hover{color:var(--text)}
.nav-brand .mark{width:28px;height:28px;flex-shrink:0}
.nav-links{display:flex;gap:2px;flex:1}
.nav-links a{color:var(--muted);padding:7px 13px;border-radius:9px;font-size:.9rem;font-weight:500;transition:color .15s,background .15s}
.nav-links a:hover{color:var(--text);background:rgba(124,58,237,.06)}
.nav-links a.active{color:var(--primary-dark);background:var(--primary-soft)}
.nav-right{display:flex;align-items:center;gap:10px}
.nav-cta{display:inline-flex;align-items:center;gap:7px;background:var(--primary);color:#fff;padding:8px 15px;border-radius:10px;font-size:.86rem;font-weight:600;transition:background .15s,transform .1s}
.nav-cta:hover{background:var(--primary-dark);color:#fff}
.nav-cta:active{transform:scale(.98)}
@media(max-width:760px){.nav{gap:14px;padding:0 16px;overflow-x:auto}.nav-links{gap:0}.nav-links a{padding:7px 9px}}

/* Containers */
.container{max-width:1120px;margin:0 auto;padding:0 28px}
.container-narrow{max-width:920px;margin:0 auto;padding:0 28px}
.section{padding:52px 0}
.section-sm{padding:36px 0}
@media(max-width:640px){.container,.container-narrow{padding:0 18px}.section{padding:36px 0}}

/* Hero */
.hero{position:relative;overflow:hidden;background:var(--ink);color:#fff;padding:88px 0 96px}
.hero::before{content:'';position:absolute;inset:0;background:
  radial-gradient(620px 420px at 78% -8%,rgba(139,92,246,.42),transparent 60%),
  radial-gradient(520px 360px at 12% 108%,rgba(124,58,237,.30),transparent 62%);pointer-events:none}
.hero::after{content:'';position:absolute;inset:0;opacity:.5;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
  background-size:46px 46px;mask-image:radial-gradient(circle at 50% 30%,#000,transparent 75%)}
.hero-inner{position:relative;z-index:1;max-width:760px;margin:0 auto;padding:0 28px;text-align:center}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.76rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--p-200);background:rgba(167,139,250,.14);border:1px solid rgba(167,139,250,.25);padding:6px 14px;border-radius:999px;margin-bottom:26px}
.hero h1{font-family:var(--serif);font-size:3.3rem;font-weight:600;color:#fff;letter-spacing:-.02em;line-height:1.06}
.hero .lede{color:#d9d2ec;font-size:1.18rem;line-height:1.55;max-width:620px;margin:20px auto 0}
@media(max-width:640px){.hero{padding:60px 0 64px}.hero h1{font-size:2.3rem}.hero .lede{font-size:1.04rem}}

/* Scan box */
.scan-box{display:flex;gap:8px;background:#fff;border-radius:16px;padding:8px;margin:38px auto 0;max-width:600px;
  box-shadow:0 20px 50px rgba(0,0,0,.32),0 0 0 1px rgba(255,255,255,.06)}
.scan-field{flex:1;display:flex;align-items:center;gap:10px;padding:0 14px;min-width:0}
.scan-field svg{color:var(--muted-2);flex-shrink:0}
.scan-field input{flex:1;border:none;outline:none;background:transparent;font-family:var(--sans);font-size:1rem;color:var(--text);min-width:0;padding:14px 0}
.scan-field input::placeholder{color:var(--muted-2)}
.scan-aux{display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:22px}
.scan-aux .hint{color:var(--ink-soft);font-size:.86rem;max-width:520px;text-align:center}
.link-light{color:#fff;font-weight:600;font-size:.95rem;display:inline-flex;align-items:center;gap:6px;border-bottom:1px solid rgba(255,255,255,.35);padding-bottom:1px}
.link-light:hover{color:#fff;border-color:#fff}
@media(max-width:560px){.scan-box{flex-direction:column}.scan-box .btn{justify-content:center}}

/* Page header (interior pages) */
.page-header{padding:46px 0 0}
.page-header .kicker{font-size:.78rem;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--primary-dark);margin-bottom:10px}
.page-header h1{font-size:2.3rem;font-weight:600}
.page-header p{color:var(--muted);font-size:1.06rem;margin-top:10px;max-width:680px}

/* Cards */
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-sm)}
.card-pad{padding:26px}
.card-ink{background:var(--ink);color:#fff;border:1px solid var(--ink-2);border-radius:var(--radius)}

/* Section heading */
.sec-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:18px}
.sec-head h2{font-size:1.32rem;font-weight:600}
.sec-head .sec-link{font-size:.86rem;font-weight:500}

/* Grid */
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.grid-2-wide{display:grid;grid-template-columns:1.35fr 1fr;gap:26px}
@media(max-width:880px){.grid-4{grid-template-columns:repeat(2,1fr)}.grid-3,.grid-2,.grid-2-wide{grid-template-columns:1fr}}
@media(max-width:520px){.grid-4{grid-template-columns:1fr}}

/* Stat cards (editorial) */
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-md);padding:22px 24px}
.stat-val{font-family:var(--serif);font-size:2.3rem;font-weight:600;line-height:1;letter-spacing:-.02em}
.stat-label{color:var(--muted);font-size:.8rem;font-weight:500;margin-top:8px;letter-spacing:.01em}

/* Mini stat (used in report headers) */
.mini-stat{background:rgba(124,58,237,.04);border:1px solid var(--border);border-radius:var(--radius-sm);padding:13px 16px}
.mini-stat .v{font-family:var(--serif);font-size:1.45rem;font-weight:600;line-height:1}
.mini-stat .l{color:var(--muted);font-size:.74rem;font-weight:500;margin-top:5px;text-transform:uppercase;letter-spacing:.05em}

/* Score ring */
.score-ring-wrap{display:flex;flex-direction:column;align-items:center;gap:12px}
.score-ring{position:relative}
.score-ring svg{transform:rotate(-90deg)}
.score-ring-text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.score-ring-num{font-family:var(--serif);font-size:2.4rem;font-weight:600;line-height:1}
.score-ring-grade{font-size:.82rem;font-weight:700;letter-spacing:.1em;opacity:.85;margin-top:2px}

/* Grade badge */
.grade{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;font-weight:700;font-size:.92rem;color:#fff;flex-shrink:0;font-family:var(--sans)}

/* Pattern cards */
.pattern-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-md);padding:20px 22px;margin-bottom:12px;border-left:3px solid currentColor;box-shadow:var(--shadow-sm)}
.pattern-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:8px}
.pattern-cat{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:3px}
.pattern-title{font-family:var(--serif);font-size:1.02rem;font-weight:600;color:var(--text)}
.pattern-desc{font-size:.92rem;line-height:1.6;color:#473f57}
.pattern-evidence{margin-top:12px;padding:11px 14px;background:var(--bg-warm);border:1px solid var(--border);border-radius:9px;font-size:.79rem;color:#5b5468;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word;max-height:104px;overflow:hidden}
.pattern-evidence.expanded{max-height:none}
.expand-btn{background:none;border:none;color:var(--primary-dark);cursor:pointer;font-size:.8rem;font-weight:600;margin-top:7px;padding:0}
.expand-btn:hover{color:var(--primary)}

/* Severity badge */
.sev{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em}

/* Severity overview bar */
.sev-summary{display:flex;flex-wrap:wrap;gap:10px}
.sev-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:999px;font-size:.84rem;font-weight:600;border:1px solid var(--border)}
.sev-pill .dot{width:8px;height:8px;border-radius:50%}

/* Tables */
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th{text-align:left;padding:13px 18px;background:var(--bg-warm);border-bottom:1px solid var(--border);color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;font-weight:600;white-space:nowrap}
th:first-child{border-top-left-radius:var(--radius)}
th:last-child{border-top-right-radius:var(--radius)}
td{padding:14px 18px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tbody tr{transition:background .12s}
tbody tr:hover td{background:var(--p-50)}
.t-domain{font-weight:600;color:var(--text)}
.t-domain:hover{color:var(--primary-dark)}

/* Forms */
.form-label{display:block;font-size:.86rem;font-weight:600;color:var(--text);margin-bottom:9px}
.form-input{width:100%;padding:13px 15px;border:1px solid var(--border-strong);border-radius:11px;font-family:var(--sans);font-size:.96rem;color:var(--text);background:#fff;outline:none;transition:border-color .15s,box-shadow .15s}
.form-input::placeholder{color:var(--muted-2)}
.form-input:focus{border-color:var(--p-400);box-shadow:0 0 0 4px rgba(124,58,237,.13)}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;border:none;border-radius:11px;font-family:var(--sans);font-size:.92rem;font-weight:600;cursor:pointer;transition:background .15s,box-shadow .15s,transform .1s,border-color .15s,color .15s;white-space:nowrap}
.btn:active{transform:scale(.985)}
.btn-primary{background:var(--primary);color:#fff;box-shadow:0 1px 2px rgba(76,29,149,.3)}
.btn-primary:hover{background:var(--primary-dark);color:#fff}
.btn-primary:disabled{background:var(--p-300);cursor:default;box-shadow:none}
.btn-outline{background:#fff;border:1px solid var(--border-strong);color:var(--text)}
.btn-outline:hover{border-color:var(--p-400);color:var(--primary-dark);background:var(--p-50)}
.btn-ghost-light{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);color:#fff}
.btn-ghost-light:hover{background:rgba(255,255,255,.16);color:#fff}
.btn-sm{padding:8px 14px;font-size:.82rem;border-radius:9px}
.btn-lg{padding:15px 26px;font-size:1rem}
.btn-block{width:100%}

/* Tabs */
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:26px}
.tab{padding:11px 16px;cursor:pointer;font-size:.92rem;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .15s,border-color .15s}
.tab:hover{color:var(--text)}
.tab.active{color:var(--primary-dark);border-bottom-color:var(--primary)}
.tab-panel{display:none}
.tab-panel.active{display:block}

/* Score bar */
.score-bar-wrap{display:flex;align-items:center;gap:10px}
.score-bar{flex:1;height:7px;background:var(--bg-warm);border-radius:999px;overflow:hidden;min-width:60px}
.score-bar-fill{height:100%;border-radius:999px;transition:width .6s ease}

/* Tags */
.reg-tag{display:inline-block;padding:3px 9px;border-radius:7px;font-size:.72rem;font-weight:600;background:var(--p-50);color:var(--p-700);border:1px solid var(--p-100);margin:2px 4px 2px 0}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;font-size:.8rem;font-weight:500;background:var(--bg-warm);border:1px solid var(--border);color:var(--muted)}

/* Feature / how-it-works */
.feature{padding:24px}
.feature .ico{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--primary-soft);color:var(--primary-dark);margin-bottom:16px}
.feature h3{font-size:1.12rem;font-weight:600;margin-bottom:7px}
.feature p{color:var(--muted);font-size:.92rem;line-height:1.6}
.step-num{font-family:var(--serif);font-size:.95rem;font-weight:600;color:var(--primary-dark);background:var(--primary-soft);width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center}

/* What-gets-audited list */
.audit-list{list-style:none;display:flex;flex-direction:column;gap:16px}
.audit-list li{display:flex;gap:13px}
.audit-list .ai{width:38px;height:38px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.15rem;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
.audit-list strong{font-size:.92rem;color:#fff}
.audit-list span{color:var(--ink-soft);font-size:.82rem;line-height:1.5}

/* Checkbox option rows */
.opt{display:flex;align-items:flex-start;gap:11px;padding:13px 15px;border:1px solid var(--border);border-radius:11px;cursor:pointer;transition:border-color .15s,background .15s}
.opt:hover{border-color:var(--p-300);background:var(--p-50)}
.opt input{margin-top:2px;width:16px;height:16px;accent-color:var(--primary);flex-shrink:0}
.opt span{min-width:0}
.opt .ot{display:block;font-size:.9rem;font-weight:600;color:var(--text)}
.opt .od{display:block;font-size:.8rem;color:var(--muted);margin-top:3px;font-weight:400;line-height:1.45}
.wf-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:560px){.wf-grid{grid-template-columns:1fr}}

/* Empty state */
.empty{text-align:center;padding:56px 28px;color:var(--muted)}
.empty .ei{width:52px;height:52px;border-radius:14px;background:var(--primary-soft);color:var(--primary-dark);display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.empty h3{font-size:1.15rem;margin-bottom:6px;color:var(--text)}
.empty p{font-size:.92rem}

/* Loader */
.loader{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* Toast */
#toast{position:fixed;bottom:24px;right:24px;background:var(--ink);color:#fff;padding:14px 20px;border-radius:12px;font-size:.9rem;font-weight:500;opacity:0;transform:translateY(10px);transition:all .25s;z-index:999;max-width:380px;box-shadow:var(--shadow-lg)}
#toast.show{opacity:1;transform:none}
#toast.error{background:#b3231c}

/* Footer */
.site-footer{border-top:1px solid var(--border);padding:30px 0;margin-top:40px}
.site-footer .container{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:.84rem}
.site-footer a{color:var(--muted)}
.site-footer a:hover{color:var(--primary-dark)}

/* Utilities */
.mt-8{margin-top:8px}.mt-12{margin-top:12px}.mt-16{margin-top:16px}.mt-24{margin-top:24px}.mt-32{margin-top:32px}
.mb-8{margin-bottom:8px}.mb-16{margin-bottom:16px}.mb-24{margin-bottom:24px}
.flex{display:flex}.items-center{align-items:center}.flex-wrap{flex-wrap:wrap}
.gap-8{gap:8px}.gap-12{gap:12px}.gap-16{gap:16px}
.text-muted{color:var(--muted)}.text-sm{font-size:.86rem}.text-xs{font-size:.78rem}
.font-bold{font-weight:600}.font-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.break-all{word-break:break-all}
</style>
</head>
<body>
<nav class="nav">
  <a href="/trusten" class="nav-brand">
    ${brandMark(28)}
    Trusten
  </a>
  <div class="nav-links">
    ${navLink('/trusten', 'Dashboard', 'dashboard')}
    ${navLink('/trusten/audit', 'Audit a site', 'audit')}
    ${navLink('/trusten/history', 'Scan history', 'history')}
    ${navLink('/trusten/leaderboard', 'Leaderboard', 'leaderboard')}
  </div>
  <div class="nav-right">
    <a href="/trusten/audit" class="nav-cta">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      New audit
    </a>
  </div>
</nav>
${body}
<footer class="site-footer">
  <div class="container">
    <div class="flex items-center gap-8">${brandMark(18)} <span>Trusten — dark-pattern detection & consumer-trust auditing</span></div>
    <div class="flex gap-16">
      <a href="/trusten/leaderboard">Leaderboard</a>
      <a href="/trusten/history">History</a>
      <a href="/trusten/audit">Run an audit</a>
    </div>
  </div>
</footer>
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

// ─── Brand mark (purple shield) ───

function brandMark(size = 28): string {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="tg${size}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6d28d9"/>
  </linearGradient></defs>
  <path d="M16 2.5 4.5 7.2v8.1c0 7.9 4.8 13.9 11.5 16 6.7-2.1 11.5-8.1 11.5-16V7.2L16 2.5Z" fill="url(#tg${size})"/>
  <path d="M11 16.4l3.2 3.2 6-6.4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`
}

// ─── Homepage ───

export function homePage(
  stats: GlobalStats,
  recent: ScanHistoryRow[],
  domains: DomainSummary[],
): string {
  const body = `
<section class="hero">
  <div class="hero-inner">
    <span class="eyebrow">${brandMark(15)} Dark-pattern detection</span>
    <h1>Find out where the web<br/>is working against you.</h1>
    <p class="lede">Trusten scans any site for manipulative “dark patterns”, grades it on an A–F trust scale, and maps every finding to the regulations it likely violates.</p>
    <form class="scan-box" id="scanForm">
      <div class="scan-field">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <input id="urlInput" type="url" placeholder="Paste a URL, e.g. example.com" required/>
      </div>
      <button type="submit" class="btn btn-primary btn-lg" id="quickBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        Quick Scan
      </button>
    </form>
    <div class="scan-aux">
      <button type="button" class="link-light" id="auditBtn">Or run a full multi-step audit →</button>
      <span class="hint">Quick Scan reads one page in seconds. A full audit walks checkout, signup, pricing &amp; cancellation flows on a headless browser.</span>
    </div>
  </div>
</section>

<div class="container section-sm">
  <div class="grid-4">
    ${statCard(stats.totalScans.toLocaleString(), 'Sites scanned')}
    ${statCard(stats.totalDomains.toLocaleString(), 'Unique domains')}
    ${statCard(stats.totalPatterns.toLocaleString(), 'Dark patterns found', '#d23b34')}
    ${statCard(stats.avgScore ? `${stats.avgScore}` : '—', 'Avg trust score', '#7c3aed')}
  </div>
</div>

<div class="container section-sm">
  <div class="grid-2-wide">
    <div>
      <div class="sec-head">
        <h2>Recently scanned</h2>
        <a class="sec-link" href="/trusten/history">View all →</a>
      </div>
      <div class="card">
        ${
          recent.length === 0
            ? emptyState(
                'No scans yet',
                'Paste a URL above to run your first scan.',
              )
            : `<div class="table-wrap"><table>
              <thead><tr><th>Domain</th><th>Score</th><th>Patterns</th><th>Type</th><th>When</th></tr></thead>
              <tbody>
                ${recent
                  .slice(0, 8)
                  .map(
                    (r) => `
                <tr>
                  <td><a class="t-domain" href="/trusten/site/${esc(r.domain)}">${esc(r.domain)}</a></td>
                  <td><div class="flex items-center gap-8"><span class="grade" style="background:${GRADE_COLOR[r.scoreGrade] ?? '#6c6577'}">${esc(r.scoreGrade)}</span> <span class="text-sm text-muted">${r.scoreNumeric}</span></div></td>
                  <td>${patternCountBadge(r.patternCount)}</td>
                  <td><span class="text-sm text-muted">${esc(r.scanType)}${r.workflowId ? ` · ${esc(r.workflowId)}` : ''}</span></td>
                  <td class="text-sm text-muted">${relTime(r.createdAt)}</td>
                </tr>`,
                  )
                  .join('')}
              </tbody>
            </table></div>`
        }
      </div>
    </div>

    <div>
      <div class="sec-head">
        <h2>Cleanest sites</h2>
        <a class="sec-link" href="/trusten/leaderboard">Full board →</a>
      </div>
      <div class="card">
        ${
          domains.length === 0
            ? emptyState('No data yet', 'Scan a few sites to build the board.')
            : `<div class="table-wrap"><table>
              <thead><tr><th>Domain</th><th>Trust score</th><th>Scans</th></tr></thead>
              <tbody>
                ${domains
                  .slice(0, 8)
                  .map(
                    (d) => `
                <tr>
                  <td><a class="t-domain" href="/trusten/site/${esc(d.domain)}">${esc(d.domain)}</a></td>
                  <td>
                    <div class="score-bar-wrap">
                      <span class="grade" style="background:${GRADE_COLOR[d.latestGrade] ?? '#6c6577'}">${esc(d.latestGrade)}</span>
                      <div class="score-bar"><div class="score-bar-fill" style="width:${d.latestScore}%;background:${GRADE_COLOR[d.latestGrade] ?? '#6c6577'}"></div></div>
                      <span class="text-sm text-muted">${d.latestScore}</span>
                    </div>
                  </td>
                  <td class="text-sm text-muted">${d.scanCount}</td>
                </tr>`,
                  )
                  .join('')}
              </tbody>
            </table></div>`
        }
      </div>
    </div>
  </div>
</div>

<div class="container section">
  <div class="sec-head"><h2>How Trusten works</h2></div>
  <div class="grid-3">
    ${feature(
      iconSearch(),
      'Quick Scan',
      'Drop in a URL — or scan the page you’re on with the browser extension. Trusten reads the live DOM, runs 11 analyzers, and returns a grade in seconds.',
    )}
    ${feature(
      iconRoute(),
      'Full Audit',
      'Trusten drives a headless browser through checkout, signup, pricing and cancellation flows — capturing an annotated screenshot per step and a session video.',
    )}
    ${feature(
      iconShieldCheck(),
      'Regulatory mapping',
      'Every finding maps to the laws it likely breaks — across 14 frameworks including GDPR, the FTC Act, the EU DSA and CCPA/CPRA — with downloadable PDF evidence.',
    )}
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
  window.location='/trusten/audit'+(url?('?url='+encodeURIComponent(url)):'');
});
</script>`

  return layout('Dashboard', body, '', 'dashboard')
}

// ─── Domain Report Page ───

export function domainPage(
  domain: string,
  summary: DomainSummary | null,
  scans: ScanHistoryRow[],
): string {
  const grade = summary?.latestGrade ?? 'F'
  const score = summary?.latestScore ?? 0
  const color = GRADE_COLOR[grade] ?? '#6c6577'

  const body = `
<div class="container section-sm">
  <div class="card card-pad" style="margin-top:24px">
    <div class="flex items-center flex-wrap" style="gap:32px">
      <div class="score-ring-wrap">
        ${scoreRing(score, grade, 132)}
      </div>
      <div style="flex:1;min-width:220px">
        <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:6px">Domain trust report</div>
        <h1 style="font-size:2rem;word-break:break-word">${esc(domain)}</h1>
        <p class="text-muted mt-8">${summary ? `${summary.scanCount} scan${summary.scanCount !== 1 ? 's' : ''} · ${summary.totalPatterns} patterns found · last scanned ${relTime(summary.latestScanAt)}` : 'Not yet scanned'}</p>
        <div class="flex gap-8 mt-16 flex-wrap">
          <button class="btn btn-primary btn-sm" onclick="triggerScan('https://${esc(domain)}','quick')">Quick Scan</button>
          <a class="btn btn-outline btn-sm" href="/trusten/audit?url=https://${esc(domain)}">Run full audit</a>
        </div>
      </div>
      ${
        summary
          ? `
      <div class="grid-3" style="gap:12px;min-width:300px;flex:1">
        ${miniStat(summary.totalPatterns.toString(), 'Total patterns', '#d23b34')}
        ${miniStat(summary.criticalCount.toString(), 'Critical', '#d23b34')}
        ${miniStat(summary.highCount.toString(), 'High', '#e0651b')}
        ${miniStat(`${summary.avgScore}`, 'Avg score', color)}
        ${miniStat(summary.scanCount.toString(), 'Scans', '#7c3aed')}
        ${miniStat(relTime(summary.latestScanAt), 'Last scan', '#6c6577')}
      </div>`
          : ''
      }
    </div>
  </div>
</div>

<div class="container section-sm">
  <div class="sec-head"><h2>Scan history</h2></div>
  <div class="card">
    ${
      scans.length === 0
        ? emptyState(
            `No scans yet for ${esc(domain)}`,
            'Use the buttons above to start a scan.',
          )
        : `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Score</th><th>Patterns</th><th>Critical</th><th>Type</th><th></th></tr></thead>
          <tbody>
            ${scans
              .map(
                (s) => `
            <tr>
              <td class="text-sm">${s.createdAt.slice(0, 16).replace('T', ' ')}</td>
              <td><div class="flex items-center gap-8"><span class="grade" style="background:${GRADE_COLOR[s.scoreGrade] ?? '#6c6577'}">${esc(s.scoreGrade)}</span> <span class="text-sm text-muted">${s.scoreNumeric}</span></div></td>
              <td>${patternCountBadge(s.patternCount)}</td>
              <td>${s.criticalCount > 0 ? `<span style="color:#d23b34;font-weight:700">${s.criticalCount}</span>` : '<span class="text-muted">0</span>'}</td>
              <td class="text-sm text-muted">${esc(s.scanType)}${s.workflowId ? ` · ${esc(s.workflowId)}` : ''}</td>
              <td><a class="btn btn-outline btn-sm" href="/trusten/scan/${esc(s.id)}">View</a></td>
            </tr>`,
              )
              .join('')}
          </tbody>
        </table></div>`
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
<div class="container-narrow section">
  <div class="card">
    ${emptyState('Scan not found', `The scan ID <code>${esc(id)}</code> does not exist in the database.`)}
    <div style="text-align:center;padding:0 0 40px"><a class="btn btn-primary" href="/trusten">Back to Dashboard</a></div>
  </div>
</div>`,
    )
  }

  const grade = scan.score.grade
  const score = scan.score.numeric
  const color = GRADE_COLOR[grade] ?? '#6c6577'

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

  const sevCounts = {
    critical: scan.patterns.filter((p) => p.severity === 'critical').length,
    high: scan.patterns.filter((p) => p.severity === 'high').length,
    medium: scan.patterns.filter((p) => p.severity === 'medium').length,
    low: scan.patterns.filter((p) => p.severity === 'low').length,
  }

  const body = `
<div class="container section-sm">
  <div class="card card-pad" style="margin-top:24px">
    <div class="flex items-center flex-wrap" style="gap:32px">
      <div class="score-ring-wrap">
        ${scoreRing(score, grade, 132)}
      </div>
      <div style="flex:1;min-width:220px">
        <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:6px">${esc(scan.scanType)} scan result</div>
        <h1 style="font-size:1.7rem;word-break:break-word">${esc(scan.domain)}</h1>
        <p class="text-sm text-muted mt-8 break-all">${esc(scan.url)}</p>
        <p class="text-sm text-muted mt-8">${scan.startedAt.slice(0, 16).replace('T', ' ')} UTC</p>
        <div class="flex gap-8 mt-16 flex-wrap">
          <a class="btn btn-outline btn-sm" href="/trusten/site/${esc(scan.domain)}">All scans for domain</a>
          ${scan.pdfPath ? `<a class="btn btn-outline btn-sm" href="/trusten/report/${esc(scan.id)}/pdf">↓ Download PDF</a>` : ''}
          ${scan.videoPath ? `<a class="btn btn-outline btn-sm" href="#recording">▶ Watch recording</a>` : ''}
        </div>
      </div>
      <div class="grid-3" style="gap:12px;min-width:280px;flex:1">
        ${miniStat(scan.patterns.length.toString(), 'Patterns', score < 50 ? '#d23b34' : '#7c3aed')}
        ${miniStat(sevCounts.critical.toString(), 'Critical', '#d23b34')}
        ${miniStat(sevCounts.high.toString(), 'High', '#e0651b')}
        ${miniStat(sortedCategories.length.toString(), 'Categories', '#7c3aed')}
        ${miniStat(regs.size.toString(), 'Regulations', '#6d28d9')}
        ${miniStat(`${score}`, 'Trust score', color)}
      </div>
    </div>
    ${
      scan.patterns.length > 0
        ? `<div class="sev-summary mt-24" style="padding-top:22px;border-top:1px solid var(--border)">
        ${(['critical', 'high', 'medium', 'low'] as const)
          .filter((s) => sevCounts[s] > 0)
          .map(
            (s) =>
              `<span class="sev-pill"><span class="dot" style="background:${SEVERITY_COLOR[s]}"></span>${sevCounts[s]} ${s}</span>`,
          )
          .join('')}
        ${
          regs.size > 0
            ? `<span style="flex:1"></span><span class="text-sm text-muted" style="align-self:center">Violates: ${[
                ...regs,
              ]
                .slice(0, 4)
                .map((r) => `<span class="reg-tag">${esc(r)}</span>`)
                .join('')}${regs.size > 4 ? ` +${regs.size - 4}` : ''}</span>`
            : ''
        }
      </div>`
        : ''
    }
  </div>
</div>

<div class="container section-sm">
  ${
    scan.videoPath
      ? `
  <div class="card" id="recording" style="overflow:hidden;margin-bottom:24px">
    <div class="card-pad" style="padding-bottom:18px;border-bottom:1px solid var(--border)">
      <h3 style="font-size:1.1rem;display:flex;align-items:center;gap:9px">🎬 Session recording</h3>
      <p class="text-sm text-muted mt-8">The full automated browse, exactly as it happened.</p>
    </div>
    <video controls preload="metadata" style="width:100%;max-height:540px;background:#000;display:block"
      src="/trusten/report/${esc(scan.id)}/video">
      Your browser does not support embedded video.
    </video>
  </div>`
      : ''
  }
  ${
    scan.patterns.length === 0
      ? `
  <div class="card card-pad" style="text-align:center;padding:56px 28px">
    <div class="ei" style="width:60px;height:60px;border-radius:16px;background:#e9f6ef;color:#15a05a;display:flex;align-items:center;justify-content:center;margin:0 auto 18px">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </div>
    <h2 style="color:#15a05a;margin-bottom:8px">No dark patterns detected</h2>
    <p class="text-muted">This scan found no manipulative patterns on the page at the time of scanning.</p>
  </div>`
      : `
  <div class="tabs">
    <div class="tab active" data-tab="patterns" onclick="switchTab('patterns')">Findings (${scan.patterns.length})</div>
    ${scan.workflowSteps?.length ? `<div class="tab" data-tab="workflow" onclick="switchTab('workflow')">Workflow steps (${scan.workflowSteps.length})</div>` : ''}
  </div>

  <div class="tab-panel active" data-panel="patterns">
    ${sortedCategories
      .map(
        ([cat, patterns]) => `
    <div style="margin-bottom:30px">
      <h3 class="flex items-center gap-8 mb-16" style="font-size:1.08rem">
        <span class="sev" style="background:${SEVERITY_BG[patterns[0].severity]};color:${SEVERITY_COLOR[patterns[0].severity]}">${patterns[0].severity}</span>
        ${esc(CATEGORY_LABELS[cat] ?? cat)} <span class="text-muted text-sm" style="font-family:var(--sans);font-weight:400">${patterns.length} finding${patterns.length !== 1 ? 's' : ''}</span>
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
      .map((step, i) => workflowStepCard(scan.id, step, i))
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
<div class="container">
  <div class="page-header">
    <div class="kicker">Full site audit</div>
    <h1>Walk the journeys that hide the tricks.</h1>
    <p>Run fixed workflows — checkout, signup, cookies, pricing, cancellation — or let the agent auto-discover journeys tailored to this site. Watch it live while it works.</p>
  </div>
</div>

<div class="container section-sm">
  <div class="grid-2-wide">
    <div>
      <div class="card card-pad">
        <form id="auditForm">
          <label class="form-label" for="auditUrl">Website URL</label>
          <input class="form-input mb-24" id="auditUrl" type="url" placeholder="https://example.com" value="${esc(prefillUrl)}" required/>

          <label class="form-label">Mode</label>
          <div class="mb-24" style="display:flex;flex-direction:column;gap:10px">
            <label class="opt">
              <input type="checkbox" id="discoverToggle"/>
              <span><span class="ot">🧭 Auto-discover workflows</span><span class="od">Let the agent explore the site and plan tailored journeys (falls back to fixed workflows if no LLM is configured).</span></span>
            </label>
            <label class="opt">
              <input type="checkbox" id="watchToggle"/>
              <span><span class="ot">👁 Watch live</span><span class="od">Stream the headless browser here while it scans, with real-time step progress.</span></span>
            </label>
          </div>

          <div id="wfSection">
            <label class="form-label">Workflows to run</label>
            <div class="wf-grid mb-24">
              ${[
                ['checkout', '🛒 Checkout'],
                ['signup', '📝 Signup'],
                ['cookie_consent', '🍪 Cookie consent'],
                ['pricing', '💰 Pricing'],
                ['cancellation', '❌ Cancellation'],
              ]
                .map(
                  ([wf, label]) =>
                    `<label class="opt" style="align-items:center">
                  <input type="checkbox" name="workflow" value="${wf}" checked/>
                  <span class="ot">${label}</span>
                </label>`,
                )
                .join('')}
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-lg" id="auditSubmit">
            Start audit
          </button>
        </form>
      </div>
    </div>

    <div>
      <div class="card-ink card-pad">
        <h3 style="color:#fff;font-size:1.18rem;margin-bottom:18px">What gets audited?</h3>
        <ul class="audit-list">
          ${[
            [
              '🛒',
              'Checkout flow',
              'Drip pricing, basket sneaking, urgency tactics at checkout',
            ],
            [
              '📝',
              'Signup flow',
              'Forced registration, preselected opt-ins, dark consent',
            ],
            [
              '🍪',
              'Cookie consent',
              'Cookie walls, asymmetric accept/reject, hidden opt-out',
            ],
            [
              '💰',
              'Pricing page',
              'Comparison prevention, hidden fees, biased plan display',
            ],
            [
              '❌',
              'Cancellation flow',
              'Roach motel, guilt-trip language, friction tactics',
            ],
          ]
            .map(
              ([icon, name, desc]) => `
          <li>
            <span class="ai">${icon}</span>
            <div><strong>${name}</strong><br/><span>${desc}</span></div>
          </li>`,
            )
            .join('')}
        </ul>
        <p class="text-xs" style="color:var(--ink-faint);margin-top:20px;line-height:1.6">Audits run on a headless Chromium browser and respect robots.txt and per-domain rate limits. Expect 2–5 minutes per workflow.</p>
      </div>
    </div>
  </div>

  <div id="auditStatus" style="display:none" class="card card-pad mt-24">
    <div class="flex items-center gap-16">
      <span class="loader" style="border-color:rgba(124,58,237,.25);border-top-color:var(--primary);width:28px;height:28px;border-width:3px"></span>
      <div>
        <strong id="statusTitle" style="font-size:1.05rem">Running audit…</strong>
        <p class="text-sm text-muted mt-8" id="statusMsg">This may take 2–5 minutes per workflow.</p>
      </div>
    </div>
    <div id="progressList" class="mt-16"></div>
    <div id="planBox" class="mt-16"></div>
    <div id="liveBox" class="mt-16" style="display:none">
      <div class="text-sm font-bold mb-8">👁 Live view</div>
      <img id="liveView" alt="live scan" style="width:100%;border:1px solid var(--border);border-radius:12px;background:#0b0814;display:block"/>
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
      document.getElementById('auditStatus').scrollIntoView({behavior:'smooth',block:'nearest'});
      if(watch) openLive(data.jobId);
      pollJob(data.jobId,url,workflows);
    } else {
      showToast(data.error||'Failed to start audit',true);
      btn.disabled=false;btn.innerHTML='Start audit';
    }
  }catch(err){
    showToast('Error: '+err.message,true);
    btn.disabled=false;btn.innerHTML='Start audit';
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
      title.textContent=data.status==='done'?'Audit complete':(data.status==='failed'?'Audit failed':('Running: '+data.currentStep));
      if(data.status==='done'){ msg.textContent='Redirecting to results…'; }
      else if(data.status==='failed'){ msg.textContent=data.error||'Unknown error'; }
      if(data.plan&&data.plan.length){
        planBox.innerHTML='<div class="text-sm font-bold mb-8">Discovered workflows</div>'+data.plan.map(p=>'<div class="text-sm mb-8">🧭 <strong>'+escapeHtml(p.name)+'</strong> ('+p.steps+' steps) — '+escapeHtml(p.description)+'</div>').join('');
      }
      if(data.completedWorkflows&&data.completedWorkflows.length){
        prog.innerHTML=data.completedWorkflows.map(w=>'<div class="flex items-center gap-8 mb-8 text-sm"><span style="color:#15a05a;font-weight:700">✓</span> '+escapeHtml(w)+' complete</div>').join('');
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

  return layout('Full Site Audit', body, '', 'audit')
}

// ─── History Page ───

export function historyPage(scans: ScanHistoryRow[]): string {
  const body = `
<div class="container">
  <div class="page-header">
    <div class="kicker">Scan history</div>
    <h1>Every scan, in one place.</h1>
    <p>All scans stored in the local database, newest first.</p>
  </div>
</div>
<div class="container section-sm">
  <div class="card">
    ${
      scans.length === 0
        ? emptyState('No scans yet', 'Submit a URL on the dashboard to begin.')
        : `<div class="table-wrap"><table>
          <thead><tr><th>Domain</th><th>URL</th><th>Score</th><th>Patterns</th><th>Type</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${scans
              .map(
                (s) => `
            <tr>
              <td><a class="t-domain" href="/trusten/site/${esc(s.domain)}">${esc(s.domain)}</a></td>
              <td class="text-sm text-muted font-mono" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.url)}</td>
              <td><div class="flex items-center gap-8"><span class="grade" style="background:${GRADE_COLOR[s.scoreGrade] ?? '#6c6577'}">${esc(s.scoreGrade)}</span> <span class="text-sm text-muted">${s.scoreNumeric}</span></div></td>
              <td>${patternCountBadge(s.patternCount)}</td>
              <td class="text-sm text-muted">${esc(s.scanType)}${s.workflowId ? ` · ${esc(s.workflowId)}` : ''}</td>
              <td class="text-sm text-muted">${s.createdAt.slice(0, 16).replace('T', ' ')}</td>
              <td><a class="btn btn-outline btn-sm" href="/trusten/scan/${esc(s.id)}">View</a></td>
            </tr>`,
              )
              .join('')}
          </tbody>
        </table></div>`
    }
  </div>
</div>`

  return layout('Scan History', body, '', 'history')
}

// ─── Leaderboard Page ───

export function leaderboardPage(domains: DomainSummary[]): string {
  const body = `
<div class="container">
  <div class="page-header">
    <div class="kicker">Leaderboard</div>
    <h1>Who treats their users best?</h1>
    <p>Every scanned domain ranked by trust score — higher is cleaner.</p>
  </div>
</div>
<div class="container section-sm">
  <div class="card">
    ${
      domains.length === 0
        ? emptyState(
            'No data yet',
            'Scan some websites to populate the leaderboard.',
          )
        : `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Domain</th><th>Trust score</th><th>Patterns</th><th>Critical</th><th>Scans</th><th>Last scanned</th></tr></thead>
          <tbody>
            ${domains
              .map(
                (d, i) => `
            <tr>
              <td class="text-muted text-sm font-bold" style="font-family:var(--serif)">${i + 1}</td>
              <td><a class="t-domain" href="/trusten/site/${esc(d.domain)}">${esc(d.domain)}</a></td>
              <td>
                <div class="score-bar-wrap">
                  <span class="grade" style="background:${GRADE_COLOR[d.latestGrade] ?? '#6c6577'}">${esc(d.latestGrade)}</span>
                  <div class="score-bar" style="max-width:130px">
                    <div class="score-bar-fill" style="width:${d.latestScore}%;background:${GRADE_COLOR[d.latestGrade] ?? '#6c6577'}"></div>
                  </div>
                  <span class="text-sm text-muted">${d.latestScore}</span>
                </div>
              </td>
              <td>${patternCountBadge(d.totalPatterns)}</td>
              <td>${d.criticalCount > 0 ? `<span style="color:#d23b34;font-weight:700">${d.criticalCount}</span>` : '<span class="text-muted">0</span>'}</td>
              <td class="text-sm text-muted">${d.scanCount}</td>
              <td class="text-sm text-muted">${relTime(d.latestScanAt)}</td>
            </tr>`,
              )
              .join('')}
          </tbody>
        </table></div>`
    }
  </div>
</div>`

  return layout('Leaderboard', body, '', 'leaderboard')
}

// ─── Shared components ───

function scoreRing(score: number, grade: string, size = 132): string {
  const color = GRADE_COLOR[grade] ?? '#6c6577'
  const r = 54
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return `
<div class="score-ring" style="width:${size}px;height:${size}px">
  <svg width="${size}" height="${size}" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${r}" stroke="#ece7dd" stroke-width="9" fill="none"/>
    <circle cx="60" cy="60" r="${r}" stroke="${color}" stroke-width="9" fill="none"
      stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
  </svg>
  <div class="score-ring-text">
    <span class="score-ring-num" style="color:${color}">${Math.round(score)}</span>
    <span class="score-ring-grade" style="color:${color}">GRADE ${grade}</span>
  </div>
</div>`
}

function statCard(value: string, label: string, color = ''): string {
  return `<div class="stat-card"><div class="stat-val"${color ? ` style="color:${color}"` : ''}>${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`
}

function miniStat(value: string, label: string, color = '#211c2e'): string {
  return `<div class="mini-stat">
    <div class="v" style="color:${color}">${esc(value)}</div>
    <div class="l">${esc(label)}</div>
  </div>`
}

function feature(icon: string, title: string, desc: string): string {
  return `<div class="card feature">
    <div class="ico">${icon}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(desc)}</p>
  </div>`
}

function emptyState(title: string, desc: string): string {
  return `<div class="empty">
    <div class="ei"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div>
    <h3>${title}</h3>
    <p>${desc}</p>
  </div>`
}

function patternCard(p: DetectedPattern): string {
  const color = SEVERITY_COLOR[p.severity] ?? '#6c6577'
  const bg = SEVERITY_BG[p.severity] ?? '#f4f1ea'
  const evidence = p.evidence?.domSnapshot ?? p.element?.text ?? ''
  const regs = p.regulatoryViolations ?? []
  return `
<div class="pattern-card" style="border-left-color:${color}">
  <div class="pattern-header">
    <span class="sev" style="background:${bg};color:${color}">${p.severity}</span>
    <div style="flex:1">
      <div class="pattern-cat" style="color:${color}">${esc(CATEGORY_LABELS[p.category] ?? p.category)}${p.source === 'deep-cache' ? ` <span style="background:var(--p-50);color:var(--p-700);border:1px solid var(--p-100);border-radius:6px;padding:1px 7px;font-size:.62rem;letter-spacing:.03em;margin-left:6px">FROM FULL AUDIT${p.cachedAt ? ` · ${esc(String(p.cachedAt).slice(0, 10))}` : ''}</span>` : ''}</div>
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
      ? `<div class="mt-12">${regs
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

function workflowStepCard(
  scanId: string,
  step: WorkflowStep,
  i: number,
): string {
  const hasScreenshot =
    (step as WorkflowStep & { screenshotPath?: string }).screenshotPath ||
    (step.screenshot &&
      step.screenshot !== '[captured]' &&
      step.screenshot !== '[saved]')
  const screenshotSrc = `/trusten/report/${esc(scanId)}/screenshot/${step.stepNumber}`
  const stepPatterns = step.patternsFound ?? []
  const critCount = stepPatterns.filter((p) => p.severity === 'critical').length
  const highCount = stepPatterns.filter((p) => p.severity === 'high').length

  const header = `
      <div class="card-pad" style="padding-bottom:18px;border-bottom:1px solid var(--border)">
        <div class="flex items-center gap-12">
          <span style="background:var(--primary);color:#fff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700;flex-shrink:0;font-family:var(--serif)">${i + 1}</span>
          <div style="flex:1;min-width:0">
            <div class="text-sm font-bold" style="word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(step.url)}</div>
            <div class="text-sm text-muted mt-8">${esc(step.action.slice(0, 180))}</div>
          </div>
          <div class="flex gap-8" style="flex-shrink:0">
            ${critCount > 0 ? `<span class="sev" style="background:${SEVERITY_BG.critical};color:${SEVERITY_COLOR.critical}">${critCount} critical</span>` : ''}
            ${highCount > 0 ? `<span class="sev" style="background:${SEVERITY_BG.high};color:${SEVERITY_COLOR.high}">${highCount} high</span>` : ''}
            ${stepPatterns.length === 0 ? `<span class="sev" style="background:${SEVERITY_BG.low};color:${SEVERITY_COLOR.low}">clean</span>` : ''}
          </div>
        </div>
      </div>`

  const image = hasScreenshot
    ? `
      <div style="position:relative;background:#0b0814;text-align:center;cursor:zoom-in" onclick="toggleImg(this)">
        <img src="${screenshotSrc}"
          alt="Step ${i + 1} screenshot"
          loading="lazy"
          style="max-width:100%;max-height:480px;object-fit:contain;display:block;margin:0 auto"
          onerror="this.parentElement.style.display='none'"
        />
        ${
          stepPatterns.length > 0
            ? `
        <div style="position:absolute;top:10px;right:10px;background:rgba(11,8,20,.78);color:#fff;border-radius:8px;padding:5px 11px;font-size:.74rem;font-weight:700">
          ${stepPatterns.length} pattern${stepPatterns.length !== 1 ? 's' : ''} detected
        </div>`
            : ''
        }
      </div>`
    : `
      <div style="background:var(--bg-warm);padding:28px;text-align:center;color:var(--muted);font-size:.84rem">
        No screenshot captured for this step
      </div>`

  const findings =
    stepPatterns.length > 0
      ? `
      <div class="card-pad" style="padding-top:16px;padding-bottom:16px;background:var(--bg-warm)">
        <div class="text-sm font-bold mb-8">Patterns found at this step</div>
        ${stepPatterns
          .slice(0, 4)
          .map(
            (p) => `
        <div class="flex gap-8 mb-8 items-center">
          <span class="sev" style="background:${SEVERITY_BG[p.severity]};color:${SEVERITY_COLOR[p.severity]};flex-shrink:0">${p.severity}</span>
          <span class="text-sm">${esc(CATEGORY_LABELS[p.category] ?? p.category)}: ${esc(p.description.slice(0, 100))}</span>
        </div>`,
          )
          .join('')}
        ${stepPatterns.length > 4 ? `<div class="text-sm text-muted">+${stepPatterns.length - 4} more — see the Findings tab</div>` : ''}
      </div>`
      : ''

  return `
    <div class="card mb-16" style="overflow:hidden">${header}${image}${findings}
    </div>`
}

function patternCountBadge(count: number): string {
  if (count === 0) return '<span style="color:#15a05a;font-weight:700">0</span>'
  if (count >= 5)
    return `<span style="color:#d23b34;font-weight:700">${count}</span>`
  return `<span style="color:#e0651b;font-weight:700">${count}</span>`
}

// ─── Inline icons ───

function iconSearch(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`
}
function iconRoute(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h4a4 4 0 0 0 4-4V9"/><path d="M6 16V8"/></svg>`
}
function iconShieldCheck(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`
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
