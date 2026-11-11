/**
 * Pages used to check that Trusten's verdicts separate fair websites from
 * manipulative ones. Honest pages contain words that look like pressure out of
 * context; manipulative pages combine several distinct tricks.
 */

export interface FairnessPage {
  name: string
  url: string
  html: string
}

const page = (title: string, body: string) =>
  `<html><head><title>${title}</title></head><body>${body}</body></html>`

// Verbatim from bestbuy.com's footer (captured 2026-11-10).
const PRIVACY_CONTROLS_FOOTER = `<footer><ul>
<li><a href="/privacy">Privacy</a></li>
<li><a href="/ca-privacy">CA Privacy Rights</a></li>
<li><a href="/do-not-sell">Do Not Sell or Share My Personal Information</a></li>
<li><a href="/limit-use">Limit Use of My Sensitive Personal Information</a></li>
<li><a href="/targeted-ads">Targeted Advertising Opt Out</a></li>
<li><a href="/supply-chain">CA Supply Chain Transparency Act</a></li>
<li><a href="/cookies">Cookie settings</a></li>
</ul></footer>`

export const HONEST_PAGES: FairnessPage[] = [
  {
    name: 'local news article',
    url: 'https://citygazette.example/news/park',
    html: page(
      'Council approves new park',
      `<article><h1>Council approves new park</h1>
<p>Construction starts at 10:30 on Monday. Don't miss the public meeting on Thursday.</p>
<p>The council voted 7-2 after a two-hour debate.</p></article>
<aside><h2>Most popular</h2><ul><li>Weather this week</li><li>Local elections</li></ul></aside>
${PRIVACY_CONTROLS_FOOTER}`,
    ),
  },
  {
    name: 'store with a dated seasonal sale',
    url: 'https://homegoods.example/sale',
    html: page(
      'Winter sale',
      `<nav><a>Most popular</a> <a>New arrivals</a> <a>Bedding</a></nav>
<h1>Winter sale</h1>
<p>Our annual sale ends December 31, 2026. Prices return to normal on January 1.</p>
<ul><li>Wool blanket — $59.00</li><li>Linen sheets — $89.00</li></ul>
<button>Add to cart</button>
${PRIVACY_CONTROLS_FOOTER}`,
    ),
  },
  {
    name: 'recipe blog',
    url: 'https://bakes.example/sourdough',
    html: page(
      'Easy sourdough',
      `<h1>Easy sourdough</h1>
<p>Bake for 45 minutes, then rest for 1:00 hour before slicing.</p>
<p>Trending recipes this week: focaccia, bagels.</p>
<p>Don't miss our newsletter — one email a month. <a>Unsubscribe anytime</a>.</p>`,
    ),
  },
  {
    name: 'neutral software pricing',
    url: 'https://notes.example/pricing',
    html: page(
      'Pricing',
      `<h1>Pricing</h1>
<div class="pricing-grid">
<div class="plan"><h2>Free</h2><p>$0 / month</p><button>Choose Free</button></div>
<div class="plan"><h2>Pro</h2><p>$8 / month</p><button>Choose Pro</button></div>
</div>
<p>Cancel anytime from your account settings.</p>`,
    ),
  },
]

export const MANIPULATIVE_PAGES: FairnessPage[] = [
  {
    name: 'shop with a resetting countdown',
    url: 'https://megadeals.example/headphones',
    html: page(
      'MegaDeals Headphones',
      `<h1>Pro Wireless Headphones</h1><p class="price">$49.99 <s>$199.99</s></p>
<div class="countdown-timer" id="deal-timer">09:59</div><p>Hurry! Offer expires in 10 minutes</p>
<p>Only 2 left in stock! 37 people are viewing this right now.</p>
<label><input type="checkbox" checked name="insurance"> Add Protection Plan ($14.99)</label>
<button class="btn-big">Buy now</button><a style="font-size:9px;color:#ccc">No thanks, I don't like saving money</a>
<script>let timer=600;setInterval(()=>{timer--; if(timer<=0)timer=600; document.getElementById('deal-timer').textContent=Math.floor(timer/60)+':'+(timer%60)},1000)</script>`,
    ),
  },
  {
    name: 'subscription trap',
    url: 'https://streamly.example/join',
    html: page(
      'Join Streamly',
      `<div class="pricing">
<div class="plan"><h2>Basic</h2><p>$4.99 / month</p></div>
<div class="plan featured"><span class="badge">Most popular</span><h2>Premium</h2><p>$19.99 / month</p></div>
</div>
<label><input type="checkbox" checked name="auto_renew"> Automatically renew my membership</label>
<label><input type="checkbox" checked name="marketing"> Send me partner offers</label>
<p>A $6.99 service fee will be added at checkout.</p>
<button class="cta-primary">Start my membership</button>
<a class="decline">No thanks, I prefer paying full price</a>
<p>To cancel, call our retention team during business hours.</p>`,
    ),
  },
  {
    name: 'flash sale with an unnamed countdown',
    url: 'https://flashbuy.example/deal',
    html: page(
      'Flash deal',
      `<div class="x1a2b"><span>Flash sale</span> <span class="q9z">02:14:33</span></div>
<h1>Smart Watch</h1><p>$29.99</p>
<p>Only 4 left at this price.</p>
<label><input type="checkbox" checked name="warranty"> Add 3-year warranty ($19.99)</label>
<button>Buy now</button>`,
    ),
  },
  {
    name: 'consent wall that shares data',
    url: 'https://quiz.example/',
    html: page(
      'Personality quiz',
      `<div class="cookie-consent-banner"><p>We use cookies.</p>
<button class="accept-all big-primary">Accept all</button></div>
<p>By continuing, we share your information with our partners for advertising.</p>
<p>Only 3 spots left today! Act now — this offer ends tonight.</p>`,
    ),
  },
]
