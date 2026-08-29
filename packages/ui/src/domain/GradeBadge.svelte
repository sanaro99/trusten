<script lang="ts">
import type { Grade } from '@trusten/shared/domain'

interface Props {
  grade: Grade
}

let { grade }: Props = $props()

const colorVar = $derived(`--trusten-grade-${grade.toLowerCase()}`)
</script>

<span
  class="inline-flex min-h-target min-w-target items-center justify-center rounded-xl font-bold text-3xl"
  style="color: var({colorVar}); border: 3px solid var({colorVar});"
  aria-label="Grade {grade}"
>
  {grade}
</span>
