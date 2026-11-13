# Demo mode

Trusten has a demo hub, a guided tour, and a practice shop for showing the product to others.

## Starting it

- **`/demo`** explains the features and a shopper's journey, and has a **Start the guided
  tour** button. It is linked as **Demo** in the main menu and footer.
- **Take the two-minute tour** on the home page starts the tour too.
- Add **`?tour=1`** to any address (for example `https://trusten.example/demo?tour=1`) to
  start the tour as soon as the page opens. Share that link before a presentation.

## The guided tour

A card in the corner walks through the real site: the quick check, a saved result and its
evidence, the results library, full checks, the Chrome extension, and the practice shop.
Each step outlines the part of the page it describes. Visitors can go back, hide the card,
or end the tour at any time. Progress is kept in the browser's local storage, so it
survives page loads.

The tour never runs a live check. When it starts, it picks saved results from the public
library (`apps/web/src/lib/demo/tour.ts`):

- **Result step:** the newest one-page check with complete coverage and at least one
  finding, preferring real websites to the practice shop.
- **Journey step:** the newest full check that followed a journey, preferring one with
  findings. When the library has none, the step is left out.

Run a full check before presenting so the journey step has something to show.

## The practice shop

`/demo/shop` and `/demo/shop/cart` are a made-up store with deliberate tricks: a
countdown that restarts, low-stock and "people are looking" claims, pre-ticked add-ons, a
guilt-trip decline, fees that only appear in the cart, and a hard-to-cancel trial. A banner
says it is a practice page; it has no Trusten header and is marked `noindex`.

Use it to show the Chrome extension: open the shop, click the Trusten icon, choose
**Check this page**, then **Highlight these choices**. Extension checks are saved to the
public library like any other check.
