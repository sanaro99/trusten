<script lang="ts">
import type { Severity } from '@trusten/shared/domain'
import { SHOWN_LEVELS, toShownLevel } from '../content/severity'

interface Props {
  severity: Severity
}

let { severity }: Props = $props()

const level = $derived(toShownLevel(severity))
const content = $derived(SHOWN_LEVELS[level])
</script>

<!--
  Colour is never the only signal: this tag always carries the word and an
  icon too, so it survives greyscale printing and colour-blind readers.
-->
<span
  data-level={level}
  aria-label="{content.label}. {content.meaning}"
  class="inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold text-sm"
  style="color: var({content.colorVar});"
>
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    {#if level === 'serious'}
      <path d="M8 1 L15 14 H1 Z" fill="none" stroke="currentColor" stroke-width="2" />
      <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="2" />
    {:else if level === 'worth-knowing'}
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2" />
      <line x1="8" y1="7" x2="8" y2="12" stroke="currentColor" stroke-width="2" />
      <circle cx="8" cy="4.5" r="1" fill="currentColor" />
    {:else}
      <circle cx="8" cy="8" r="4" fill="currentColor" />
    {/if}
  </svg>
  {content.label}
</span>
