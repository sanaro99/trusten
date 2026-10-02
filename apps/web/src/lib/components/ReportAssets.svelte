<script lang="ts">
import type { ScanDetail } from '@trusten/shared/api'

let { scan }: { scan: ScanDetail } = $props()
</script>

{#if scan.pdfPath || scan.htmlPath || scan.videoPath}
  <section class="card mt-8" aria-label="Saved report and recording">
    <div class="card-body p-6">
      <h2 class="m-0 text-2xl font-bold">Saved evidence</h2>
      <div class="mt-3 flex flex-wrap gap-3">
        {#if scan.pdfPath}
          <a class="btn btn-outline" href="/trusten/report/{encodeURIComponent(scan.id)}/pdf">Download report</a>
        {:else if scan.htmlPath}
          <a class="btn btn-outline" href="/trusten/report/{encodeURIComponent(scan.id)}/html">Open HTML report</a>
        {/if}
      </div>
      {#if scan.videoPath}
        <details class="collapse-arrow collapse mt-4 border border-base-300 bg-base-200">
          <summary class="collapse-title font-semibold text-primary">Watch the recorded check</summary>
          <div class="collapse-content">
            <!-- The recording contains silent browser frames, with no speech or audio. -->
            <!-- svelte-ignore a11y_media_has_caption -->
            <video class="mt-2 max-h-[36rem] w-full rounded-box bg-neutral" src="/trusten/report/{encodeURIComponent(scan.id)}/video" controls preload="none" aria-label="Recording of the website check"></video>
          </div>
        </details>
      {/if}
    </div>
  </section>
{/if}
