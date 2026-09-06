<script lang="ts">
import type { Grade } from '@trusten/shared/domain'

interface Props {
  grade: Grade
}

let { grade }: Props = $props()

const colorVar = $derived(`--trusten-grade-${grade.toLowerCase()}`)
</script>

<span
  class="inline-flex size-18 shrink-0 items-center justify-center rounded-box bg-base-200 font-bold text-4xl shadow-inner"
  style="color: var({colorVar}); border: 3px solid var({colorVar});"
  aria-label="Grade {grade}"
>
  {grade}
</span>
