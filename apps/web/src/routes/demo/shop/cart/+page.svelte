<script lang="ts">
import PracticeBanner from '$lib/demo/PracticeBanner.svelte'
import { countdown } from '$lib/demo/timer.svelte'

const timer = countdown(10 * 60)
let placed = $state(false)
</script>

<svelte:head>
  <title>Your cart — The Practice Shop</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PracticeBanner />

<main id="main-content" class="shop">
  <header class="shop-header">
    <a class="shop-brand" href="/demo/shop">The Practice Shop</a>
    <nav aria-label="Shop">
      <a href="/demo/shop">Sneakers</a>
      <a href="/demo/shop/cart">Cart (2)</a>
    </nav>
  </header>

  <h1>Your cart</h1>
  <p id="cart-timer" class="reserved">Your items are reserved for <strong>{timer.label}</strong>. After that, we can't promise they'll still be available.</p>

  <table class="cart">
    <tbody>
      <tr><td>Trail Runner sneakers</td><td>$59.00</td></tr>
      <tr id="added-plan"><td>2-year protection plan (added for you)</td><td>$9.99</td></tr>
      <tr id="service-fee"><td>Service fee</td><td>$6.50</td></tr>
      <tr id="processing-fee"><td>Card processing fee</td><td>$3.99</td></tr>
    </tbody>
    <tfoot>
      <tr><th>Total</th><th>$79.48</th></tr>
    </tfoot>
  </table>

  <label class="donate"><input id="round-up" type="checkbox" checked /> Round up my order and add a $5 tip for our team</label>

  <button id="place-order" class="buy" type="button" onclick={() => (placed = true)}>Place order</button>
  <a id="decline-shipping" class="decline" href="/demo/shop">No, I don't want free shipping</a>

  {#if placed}
    <p class="placed" role="status">This is a practice page, so nothing was ordered and no payment was taken.</p>
  {/if}
</main>

<style>
  .shop { max-width: 48rem; margin: 0 auto; padding: 1.5rem; font-family: Georgia, 'Times New Roman', serif; color: #1f1b2b; }
  .shop-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 2px solid #1f1b2b; }
  .shop-brand { font-size: 1.6rem; font-weight: 700; color: inherit; text-decoration: none; }
  .shop-header nav { display: flex; gap: 1.25rem; }
  .shop-header nav a { color: inherit; }
  h1 { font-size: 2rem; margin: 1.5rem 0 .5rem; }
  .reserved { background: #fff4e5; border: 1px solid #f0c68a; padding: .75rem 1rem; border-radius: .5rem; }
  .reserved strong { font-variant-numeric: tabular-nums; }
  .cart { width: 100%; border-collapse: collapse; margin: 1.25rem 0; font-size: 1.05rem; }
  .cart td, .cart th { padding: .7rem 0; border-bottom: 1px solid #d9d3e5; text-align: left; }
  .cart td:last-child, .cart th:last-child { text-align: right; }
  .donate { display: block; margin-bottom: 1.25rem; }
  .buy { display: block; width: 100%; background: #1f1b2b; color: #fff; padding: 1rem; border: 0; border-radius: .75rem; font: inherit; font-size: 1.2rem; font-weight: 700; cursor: pointer; }
  .decline { display: block; margin-top: .5rem; text-align: center; font-size: .75rem; color: #9a94a8; }
  .placed { margin-top: 1rem; padding: .75rem 1rem; background: #e7f1ed; border-radius: .5rem; }
</style>
