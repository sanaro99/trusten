import { render } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import EvidenceShot from './EvidenceShot.svelte'

describe('EvidenceShot smoke', () => {
  test('renders with a box', () => {
    const { container } = render(EvidenceShot, {
      props: {
        src: 'data:image/png;base64,',
        box: { x: 10, y: 10, width: 50, height: 20 },
        image: { width: 1280, height: 3000 },
        alt: 'test',
      },
    })
    expect(container.querySelector('img')).toBeTruthy()
    expect(container.querySelector('rect')).toBeTruthy()
  })

  test('renders without a box and without caption when static', () => {
    const { container } = render(EvidenceShot, {
      props: {
        src: 'data:image/png;base64,',
        image: { width: 1280, height: 3000 },
        alt: 'test',
        isStatic: true,
      },
    })
    expect(container.querySelector('rect')).toBeFalsy()
    expect(container.querySelector('figcaption')).toBeFalsy()
  })

  test('renders a full evidence image when its natural size is unavailable', () => {
    const { container } = render(EvidenceShot, {
      props: {
        src: '/trusten/report/scan-1/screenshot/2',
        alt: 'The checkout page after adding an item',
      },
    })
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/trusten/report/scan-1/screenshot/2',
    )
    expect(container.querySelector('figcaption')?.textContent).toContain(
      'checkout page',
    )
  })
})
