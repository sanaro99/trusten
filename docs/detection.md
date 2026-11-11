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

- Start at **100**. Each finding weighs by severity: critical 25, high 15, medium 8,
  low 3. Findings below 0.7 confidence (shown as "less sure") count half.
- Within one category, repeats have diminishing returns (each counts half the previous),
  and a category never takes more than 1.5× its strongest finding. A banner repeated on
  every page can't sink a site on its own, but distinct kinds of trick add up fully.
  Minimum 0.
- Grades: **A** 80–100 · **B** 60–79 · **C** 40–59 · **D** 20–39 · **F** 0–19.
- A critical finding caps the score at 59, and a high-severity finding caps it at 79,
  so a serious concern cannot produce a reassuring A/B verdict. Overlapping findings
  from text and vision are consolidated before scoring; distinct identified choices remain separate.
- Severity reflects the evidence, not the keyword. Pressure or stock wording on its own is
  "worth knowing" (medium); a countdown element or timer code beside deadline wording is
  serious (high). Words that only look like pressure out of context are not flagged:
  times of day ("starts at 10:30"), dated deadlines ("sale ends December 31"), list
  headings like "Most popular" away from plans or billing, privacy opt-out controls, and
  retail fine print ("Limited quantities. No rainchecks."). `fairness.test.ts` pins these
  cases and checks that every manipulative fixture grades below every honest one.
- Timers are flagged immediately as time pressure. Trusten does not wait for a timer to
  expire or claim it is fabricated without supporting evidence. Per-customer quantity
  limits are distinguished from low-stock claims.
- LLM-derived detections only count when confidence ≥ 0.7; the same input always yields the
  same score.

## Regulatory mapping

Every category maps to one or more provisions across **14 frameworks** (`regulatory/mapping.ts`):
FTC Act §5, GDPR, EU DSA, CCPA/CPRA, India DPDP, UK Online Safety Act, EU CRD, Australian
Consumer Law, Canada PIPEDA, Japan APPI, Brazil LGPD, Korea PIPA, Singapore PDPA, EU UCPD.
Each violation carries the regulation, the specific article/section, and a plain-language
explanation of how the pattern violates it. Reporting is factual ("N patterns detected"), not
editorializing.
