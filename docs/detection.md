# Detection, scoring & regulatory mapping

## Analyzers (11 modules, 24 categories)

Each analyzer is **hybrid**: deterministic rules first (regex, DOM/CSS, form/cookie/network
state), then optional LLM augmentation for ambiguous language. They take an `AnalyzerContext`
(URL, DOM, visible text, screenshot, network requests, cookies) and emit `DetectedPattern[]`.

| Analyzer | Categories |
|---|---|
| `UrgencyScarcityAnalyzer` | fake_urgency, fake_scarcity, fake_social_proof |
| `MisdirectionAnalyzer` | confirmshaming, trick_wording, visual_interference |
| `SneakingAnalyzer` | basket_sneaking, drip_pricing, bait_and_switch |
| `ObstructionAnalyzer` | roach_motel, forced_continuity, hard_to_cancel |
| `ForcedActionAnalyzer` | forced_registration, forced_sharing, gamification_pressure |
| `PreselectionAnalyzer` | preselected_options, hidden_defaults |
| `NaggingAnalyzer` | repeated_prompts, disguised_ads |
| `ComparisonPreventionAnalyzer` | comparison_prevention, information_hiding |
| `PrivacyAnalyzer` | privacy_zuckering, cookie_wall, dark_consent |
| `InterfaceManipulationAnalyzer` | fake_hierarchy |
| `VisualAnalyzer` | visual layout manipulation (screenshot-aware) |

Network + cookie capture (via Puppeteer) feeds drip-pricing/tracking/third-party-sharing and
httpOnly-cookie signals into `SneakingAnalyzer`/`PrivacyAnalyzer`.

## Scoring

Deterministic A–F grade computed in `scoring/engine.ts`:

- Start at **100**, deduct by severity: critical −15 (cap −45), high −8 (cap −32),
  medium −4 (cap −20), low −2 (cap −10). Minimum 0.
- Grades: **A** 80–100 · **B** 60–79 · **C** 40–59 · **D** 20–39 · **F** 0–19.
- LLM-derived detections only count when confidence ≥ 0.7; the same input always yields the
  same score.

## Regulatory mapping

Every category maps to one or more provisions across **14 frameworks** (`regulatory/mapping.ts`):
FTC Act §5, GDPR, EU DSA, CCPA/CPRA, India DPDP, UK Online Safety Act, EU CRD, Australian
Consumer Law, Canada PIPEDA, Japan APPI, Brazil LGPD, Korea PIPA, Singapore PDPA, EU UCPD.
Each violation carries the regulation, the specific article/section, and a plain-language
explanation of how the pattern violates it. Reporting is factual ("N patterns detected"), not
editorializing.
