<script lang="ts">
interface Props {
  label: string
  children: import('svelte').Snippet
}

let { label, children }: Props = $props()
</script>

<details class="collapse-arrow collapse mt-3 bg-base-200">
  <summary
    class="collapse-title min-h-target cursor-pointer font-semibold text-primary"
  >
    {label}
  </summary>
  <div class="collapse-content text-base-content/65 text-sm">
    {@render children()}
  </div>
</details>
