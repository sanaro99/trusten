<script lang="ts">
import '@trusten/ui/tokens.css'
import '../app.css'
import favicon from '$lib/assets/favicon.svg'

let { children } = $props()
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-bg text-text text-base">
	{@render children()}
</div>
