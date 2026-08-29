import { render, screen } from '@testing-library/svelte'
import { DarkPatternCategory, Regulation } from '@trusten/shared/domain'
import { describe, expect, test } from 'vitest'
import FindingCard from './FindingCard.svelte'

const pattern = {
  id: 'p-1',
  category: DarkPatternCategory.FAKE_URGENCY,
  severity: 'critical' as const,
  confidence: 0.87,
  description:
    'Urgency language detected: "Only 2 left". Manufactured time pressure exploits loss aversion.',
  element: {
    selector: '.countdown',
    text: 'Only 2 left — order in 5:00',
    html: '<div>Only 2 left</div>',
    boundingBox: { x: 100, y: 200, width: 300, height: 48 },
  },
  evidence: {},
  regulatoryViolations: [
    {
      regulation: Regulation.EU_UCPD,
      article: 'Annex I, Para 7',
      description: 'UCPD blacklists falsely stating limited availability.',
    },
  ],
  detectedAt: '2026-08-28T10:00:00.000Z',
  url: 'https://example.com/checkout',
  pageTitle: 'Checkout',
}

const props = {
  pattern,
  index: 1,
  screenshotUrl: '/shot.png',
  imageSize: { width: 1280, height: 3000 },
}

describe('FindingCard', () => {
  test('leads with the plain name, not the taxonomy name', () => {
    render(FindingCard, { props })
    expect(screen.getByText('A fake deadline')).toBeTruthy()
    expect(screen.queryByText(/fake_urgency/i)).toBeNull()
  })

  test('quotes what the site actually said', () => {
    const { container } = render(FindingCard, { props })
    expect(container.querySelector('blockquote')?.textContent).toContain(
      'Only 2 left',
    )
  })

  test('shows no confidence number anywhere', () => {
    const { container } = render(FindingCard, { props })
    expect(container.textContent).not.toContain('0.87')
    expect(container.textContent).not.toMatch(/confidence/i)
  })

  test('keeps the technical explanation behind a disclosure', () => {
    render(FindingCard, { props })
    // Present in the DOM but inside a collapsed <details>.
    const details = screen
      .getByText('How we worked this out')
      .closest('details')
    expect(details).toBeTruthy()
    expect(details?.hasAttribute('open')).toBe(false)
  })

  test('labels the legal disclosure as a question, not as jargon', () => {
    render(FindingCard, { props })
    expect(screen.getByText('Is this allowed?')).toBeTruthy()
    expect(screen.queryByText(/regulatory violation/i)).toBeNull()
  })

  test('hedges a middling finding instead of stating it', () => {
    render(FindingCard, {
      props: { ...props, pattern: { ...pattern, confidence: 0.72 } },
    })
    expect(screen.getByText(/This looks like/)).toBeTruthy()
  })

  test('frames a contested category’s citations as what regulators have pointed to, not as an established breach', () => {
    const contestedPattern = {
      ...pattern,
      category: DarkPatternCategory.GAMIFICATION_PRESSURE,
      regulatoryViolations: [
        {
          regulation: Regulation.EU_DSA,
          article: 'Article 25',
          description:
            'DSA prohibits manipulative interface design ("dark patterns").',
        },
      ],
    }
    render(FindingCard, {
      props: { ...props, pattern: contestedPattern },
    })
    expect(screen.getByText(/rules regulators have pointed to/i)).toBeTruthy()
  })

  test('does not add that framing for a settled category', () => {
    render(FindingCard, { props })
    expect(screen.queryByText(/rules regulators have pointed to/i)).toBeNull()
  })
})
