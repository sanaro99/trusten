/**
 * Tailwind preset exposing Trusten's design tokens as utilities, so no
 * component ever writes a literal colour.
 */
export default {
  theme: {
    extend: {
      colors: {
        purple: 'var(--trusten-purple)',
        'purple-strong': 'var(--trusten-purple-strong)',
        bg: 'var(--trusten-bg)',
        surface: 'var(--trusten-surface)',
        border: 'var(--trusten-border)',
        text: 'var(--trusten-text)',
        'text-muted': 'var(--trusten-text-muted)',
        serious: 'var(--trusten-level-serious)',
        'worth-knowing': 'var(--trusten-level-worth-knowing)',
        minor: 'var(--trusten-level-minor)',
        'grade-a': 'var(--trusten-grade-a)',
        'grade-b': 'var(--trusten-grade-b)',
        'grade-c': 'var(--trusten-grade-c)',
        'grade-d': 'var(--trusten-grade-d)',
        'grade-f': 'var(--trusten-grade-f)',
      },
      fontSize: {
        base: ['var(--trusten-text-base)', 'var(--trusten-line-height)'],
      },
      maxWidth: {
        measure: 'var(--trusten-measure)',
      },
      minHeight: {
        target: 'var(--trusten-target-min)',
      },
      minWidth: {
        target: 'var(--trusten-target-min)',
      },
    },
  },
}
