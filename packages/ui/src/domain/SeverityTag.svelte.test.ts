import { render, screen } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import SeverityTag from './SeverityTag.svelte'

describe('SeverityTag', () => {
  test('shows the plain word, not the internal level', () => {
    render(SeverityTag, { props: { severity: 'critical' } })
    expect(screen.getByText('Serious')).toBeTruthy()
    expect(screen.queryByText('critical')).toBeNull()
  })

  test('collapses high to the same shown level as critical', () => {
    render(SeverityTag, { props: { severity: 'high' } })
    expect(screen.getByText('Serious')).toBeTruthy()
  })

  test('carries an accessible label, not colour alone', () => {
    const { container } = render(SeverityTag, { props: { severity: 'medium' } })
    const tag = container.querySelector('[data-level]')
    expect(tag?.getAttribute('aria-label')).toContain('Worth knowing')
  })

  test('renders an icon alongside the word', () => {
    const { container } = render(SeverityTag, { props: { severity: 'low' } })
    expect(container.querySelector('svg')).toBeTruthy()
  })
})
