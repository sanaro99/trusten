<script lang="ts">
import type { BoundingBox } from '@trusten/shared/domain'
import { computeCrop, type ImageSize } from './crop'

interface Props {
  src: string
  box?: BoundingBox
  /** Natural size of the screenshot. */
  image?: ImageSize
  /** Plain description of what the picture shows. */
  alt: string
  /** Render without interactivity — the mode the PDF report uses. */
  isStatic?: boolean
  displayWidth?: number
}

let {
  src,
  box,
  image,
  alt,
  isStatic = false,
  displayWidth = 640,
}: Props = $props()

const crop = $derived(
  image
    ? computeCrop(box, image, { padding: 48, minWidth: 480, displayWidth })
    : null,
)
const displayHeight = $derived(crop ? Math.round(crop.height * crop.scale) : 0)
</script>

{#if !image}
  <figure class="m-0 block! w-full">
    <div class="overflow-hidden rounded-box border border-base-300 bg-neutral shadow-inner">
      <img {src} {alt} class="block max-h-[34rem] w-full object-contain" loading="lazy" />
    </div>
    {#if !isStatic}
      <figcaption class="mt-2 text-sm text-base-content/60">{alt}</figcaption>
    {/if}
  </figure>
{:else if crop}
<figure class="m-0 block! w-full">
  <div
    class="relative overflow-hidden rounded-xl border border-border"
    style="width: {displayWidth}px; height: {displayHeight}px; max-width: 100%;"
  >
    <img
      {src}
      {alt}
      class="absolute max-w-none origin-top-left"
      style="
        left: {-crop.x * crop.scale}px;
        top: {-crop.y * crop.scale}px;
        width: {image.width * crop.scale}px;
      "
    />

    {#if box}
      <!-- Drawn over a clean screenshot rather than burned into it. -->
      <svg
        class="pointer-events-none absolute inset-0"
        width={displayWidth}
        height={displayHeight}
        aria-hidden="true"
      >
        <rect
          x={(box.x - crop.x) * crop.scale}
          y={(box.y - crop.y) * crop.scale}
          width={box.width * crop.scale}
          height={box.height * crop.scale}
          fill="none"
          stroke="var(--trusten-level-serious)"
          stroke-width="3"
          rx="4"
        />
      </svg>
    {/if}
  </div>

  {#if !isStatic}
    <figcaption class="mt-2 text-sm text-text-muted">{alt}</figcaption>
  {/if}
</figure>
{/if}
