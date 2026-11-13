<script lang="ts">
import PracticeBanner from '$lib/demo/PracticeBanner.svelte'
import { countdown } from '$lib/demo/timer.svelte'

// The "sale" restarts every five minutes: the trick Trusten should catch.
const timer = countdown(5 * 60)
</script>

<svelte:head>
  <title>Trail Runner sneakers — The Practice Shop</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PracticeBanner />

<main id="main-content" class="shop">
  <header class="shop-header">
    <a class="shop-brand" href="/demo/shop">The Practice Shop</a>
    <nav aria-label="Shop">
      <a href="/demo/shop">Sneakers</a>
      <a href="/demo/shop/cart">Cart (0)</a>
    </nav>
  </header>

  <div id="sale-banner" class="sale-banner" role="status">
    Flash sale ends in <strong id="sale-timer">{timer.label}</strong>, hurry before it's gone!
  </div>

  <section class="product">
    <div class="product-photo" aria-hidden="true">
      <svg viewBox="0 0 240 120" width="100%" height="100%"><path d="M20 82c24-2 42-18 58-38 10 10 26 16 44 16 26 0 52 10 76 22 14 7 22 12 22 20H20z" fill="#5b469a" /><path d="M20 102h220v8H20z" fill="#292638" /><circle cx="96" cy="58" r="4" fill="#efecf7" /><circle cx="112" cy="62" r="4" fill="#efecf7" /></svg>
    </div>

    <div class="product-info">
      <p class="product-kicker">Bestseller</p>
      <h1>Trail Runner sneakers</h1>
      <p class="price"><s>$120.00</s> <strong>$59.00</strong> <span class="save">Save 51% today only</span></p>

      <p id="stock-warning" class="stock">Only 2 left in stock. Order soon!</p>
      <p id="viewers" class="viewers">27 people are looking at this right now</p>
      <p class="sold">Sold 1,284 times in the last 24 hours</p>

      <fieldset class="extras">
        <legend>Add extras</legend>
        <label><input id="protection-plan" type="checkbox" checked /> Add 2-year protection plan (+$9.99)</label>
        <label><input id="partner-emails" type="checkbox" checked /> Send me marketing emails and offers from partners</label>
      </fieldset>

      <a id="add-to-cart" class="buy" href="/demo/shop/cart">Add to cart</a>
      <a id="decline-offer" class="decline" href="/demo/shop/cart">No thanks, I prefer paying full price</a>

      <section class="membership" aria-labelledby="membership-title">
        <h2 id="membership-title">Join Runner Club for free shipping</h2>
        <p id="membership-terms" class="fine-print">Free for 7 days, then $14.99/month. Renews automatically. To cancel, call us Monday to Friday, 9am to 11am.</p>
      </section>
    </div>
  </section>
</main>

<style>
  .shop { max-width: 72rem; margin: 0 auto; padding: 1.5rem; font-family: Georgia, 'Times New Roman', serif; color: #1f1b2b; }
  .shop-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 2px solid #1f1b2b; }
  .shop-brand { font-size: 1.6rem; font-weight: 700; color: inherit; text-decoration: none; }
  .shop-header nav { display: flex; gap: 1.25rem; }
  .shop-header nav a { color: inherit; }
  .sale-banner { margin: 1.25rem 0; padding: .9rem 1rem; background: #b3261e; color: #fff; font-size: 1.1rem; text-align: center; border-radius: .5rem; }
  .sale-banner strong { font-variant-numeric: tabular-nums; font-size: 1.3rem; }
  .product { display: grid; gap: 2rem; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); align-items: start; }
  .product-photo { aspect-ratio: 4 / 3; background: #ded7ef; border-radius: 1rem; display: grid; place-items: center; padding: 2rem; }
  .product-kicker { margin: 0; text-transform: uppercase; letter-spacing: .1em; font-size: .8rem; color: #b3261e; font-weight: 700; }
  h1 { margin: .25rem 0 .5rem; font-size: 2.4rem; line-height: 1.1; }
  .price { font-size: 1.4rem; margin: 0 0 1rem; }
  .price s { color: #716a80; }
  .save { font-size: .95rem; color: #b3261e; font-weight: 700; }
  .stock { color: #b3261e; font-weight: 700; margin: .25rem 0; }
  .viewers, .sold { margin: .25rem 0; color: #5f596e; }
  .extras { border: 1px solid #d9d3e5; border-radius: .75rem; padding: .75rem 1rem; margin: 1.25rem 0; display: grid; gap: .5rem; }
  .extras legend { font-weight: 700; padding: 0 .25rem; }
  .buy { display: block; text-align: center; background: #1f1b2b; color: #fff; padding: 1rem; border-radius: .75rem; font-size: 1.2rem; font-weight: 700; text-decoration: none; }
  .decline { display: block; margin-top: .5rem; text-align: center; font-size: .75rem; color: #9a94a8; }
  .membership { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #d9d3e5; }
  .membership h2 { font-size: 1.1rem; margin: 0 0 .25rem; }
  .fine-print { font-size: .7rem; color: #9a94a8; margin: 0; }
</style>
