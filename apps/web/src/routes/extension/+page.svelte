<svelte:head>
  <title>Trusten — Check the page you are viewing</title>
  <meta name="description" content="Install the Trusten Chrome extension to check the page you are viewing and highlight choices worth reviewing." />
</svelte:head>

<main id="main-content" class="mx-auto max-w-4xl px-5 py-12 sm:px-6 lg:py-16">
  <div class="eyebrow mb-5"><span aria-hidden="true"></span>Trusten in your browser</div>
  <h1 class="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Check the page you are viewing</h1>
  <p class="mt-5 max-w-2xl text-lg text-base-content/75">The Chrome extension checks the words and choices on your current page, including changes that appear after you sign in. Highlight what Trusten notices and open the evidence in your dashboard.</p>
  <a class="btn btn-primary mt-7" href="/extension/download" download="trusten-extension.zip">Download the Chrome extension <span aria-hidden="true">&darr;</span></a>

  <section class="card mt-10" aria-labelledby="install-title">
    <div class="card-body p-6 sm:p-8">
      <h2 id="install-title" class="m-0 text-2xl font-bold">Install in Chrome</h2>
      <ol class="mt-4 list-decimal space-y-4 pl-5 text-base-content/80">
        <li>Download the ZIP above and extract it to a folder you will keep.</li>
        <li>Type <code>chrome://extensions</code> in Chrome's address bar and enable <strong>Developer mode</strong>.</li>
        <li>Choose <strong>Load unpacked</strong> and select the extracted folder containing <code>manifest.json</code>.</li>
        <li>Open a website, click the Trusten toolbar icon, and choose <strong>Check this page</strong>.</li>
      </ol>
      <p class="mt-5 text-sm text-base-content/70">This download connects to the Trusten site you are using. To use another service or a local installation, open the extension's connection settings.</p>
    </div>
  </section>

  <section class="mt-9" aria-labelledby="privacy-title">
    <h2 id="privacy-title" class="text-xl font-bold">You choose when to check</h2>
    <p class="mt-3 text-base-content/75">When you click Check this page, the extension sends the page address, title, HTML, and visible text to your chosen Trusten service. Check pages you are comfortable sharing, especially when signed in. The extension does not automatically check your browsing history.</p>
    <p class="mt-3 text-base-content/75">Chrome internal pages and other protected pages cannot be checked. Page checks show what Trusten can verify from the current page; use <a href="/audit" class="link link-primary font-semibold">a full check</a> to follow more of a website's journey.</p>
  </section>
</main>
