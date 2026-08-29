<script lang="ts">
interface Props {
  label: string
  children: import('svelte').Snippet
}

let { label, children }: Props = $props()
</script>

<details class="mt-3 border-border border-t pt-3">
  <summary
    class="flex min-h-target cursor-pointer items-center font-semibold text-purple"
  >
    {label}
  </summary>
  <div class="mt-2 text-text-muted text-sm">
    {@render children()}
  </div>
</details>
