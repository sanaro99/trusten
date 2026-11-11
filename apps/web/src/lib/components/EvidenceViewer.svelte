<script lang="ts">
import type { BoundingBox } from '@trusten/shared/domain'
import { focusView } from '$lib/evidence'

interface Props {
  src?: string
  box?: BoundingBox
  /** Plain description of what the picture shows. */
  alt: string
  caption: string
  /** Short label drawn on the highlight, such as the concern number. */
  marker?: string
}

let { src, box, alt, caption, marker }: Props = $props()
// Keyed by picture, so switching concerns never shows a stale size or state.
let failedFor = $state<string>()
let wholeFor = $state<string>()
let loaded = $state<{ src: string; ratio: number }>()

const failed = $derived(failedFor !== undefined && failedFor === src)
const whole = $derived(wholeFor !== undefined && wholeFor === src)
/** Image height divided by width, known once the picture loads. */
const ratio = $derived(loaded && loaded.src === src ? loaded.ratio : undefined)
const view = $derived(box && ratio && !whole ? focusView(box, ratio) : null)
const pct = (value: number) => `${(value * 100).toFixed(3)}%`

function onLoad(event: Event) {
  const img = event.currentTarget as HTMLImageElement
  if (img.naturalWidth > 0 && src)
    loaded = { src, ratio: img.naturalHeight / img.naturalWidth }
}
</script>

<figure class="evidence-viewer m-0">
  {#if src && !failed}
    <div
      class="evidence-image relative overflow-hidden rounded-box"
      style:aspect-ratio={view ? `1 / ${view.height}` : undefined}
    >
      <div
        class={view ? 'absolute' : 'relative'}
        style:width={view ? pct(view.zoom) : '100%'}
        style:left={view ? pct(view.left) : undefined}
        style:top={view ? pct(view.top / view.height) : undefined}
      >
        <img {src} {alt} class="block h-auto w-full" onload={onLoad} onerror={() => (failedFor = src)} />
        {#if box}
          <div
            class="evidence-highlight"
            style:left={pct(box.x)}
            style:top={pct(box.y)}
            style:width={pct(box.width)}
            style:height={pct(box.height)}
            aria-hidden="true"
          >
            {#if marker}<span class="evidence-marker">{marker}</span>{/if}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="evidence-image grid min-h-48 place-items-center rounded-box p-6 text-center text-sm text-base-content/70">
      {failed ? 'This picture could not be loaded.' : 'No picture was saved for this.'}
    </div>
  {/if}
  <figcaption class="mt-2 text-sm text-base-content/70" aria-live="polite">
    {caption}
    {#if src && !failed && box && ratio}
      · <button type="button" class="link link-primary" onclick={() => (wholeFor = whole ? undefined : src)}>{whole ? 'Zoom to the concern' : 'Show whole page'}</button>
    {/if}
    {#if src && !failed && !src.startsWith('data:')}
      · <a class="link link-primary" href={src} target="_blank" rel="noopener">Open full size</a>
    {/if}
  </figcaption>
</figure>
