# ReVizionedIt Designs — branded order flow

This extends the approved storefront. Customers choose products, customize the event, select photos and delivery, and review the order before the final Square-hosted payment screen.

## Current status

- Branded selection, cart, customization, photo previews, delivery and review are implemented.
- Server implementation stores order details and private photos before creating a Square payment link. The Square order reference ties the payment to the design order.
- Checkout is OFF by default. No real payment, Square sandbox transaction, or public deployment has been performed. The downloadable HTML is a local review copy; its photos remain in the browser tab.
- 12 automated checks cover prices, rush cutoff in Chicago time, validation, upload rejection, payment matching and disabled checkout.
- Browser screenshots could not be generated in the build environment. Phone/desktop visual testing and a Square sandbox end-to-end payment remain launch gates.

## Preview locally

Requires Node 24 or newer; there are no npm dependencies.

```sh
npm start
```

Open http://127.0.0.1:8787. Do not enter real customer data during review. The preview does not save a draft across page refreshes.

## What the owner must confirm

- Pricing is transcribed from the six price-list images embedded in the approved storefront, including 14 cups = $65 and 20 cups = $70.
- Close Friends includes five plastic cups as shown in the artwork; its previous short description omitted them.
- Cup styles in the picker are foam and plastic. Confirm that both use the posted cups-only prices.
- Add-on prices and units need a final owner check before enabling checkout. Game-board options and other specialty items are by inquiry until their variant prices are confirmed.
- Confirm pickup availability, processing time and rush acceptance rules for both cities. The current flow applies $30 when the event is fewer than 14 calendar days away; it does not reserve production capacity or guarantee delivery by the event date.
- Confirm the support email is active, and confirm the refund/turnaround wording before launch.

## Connect Square and host

1. Host this Node application behind HTTPS with a persistent, private disk for `ORDER_DATA_DIR`. Do not use an ephemeral filesystem. The server listens on 0.0.0.0 and uses the host-provided PORT (8787 locally). Serve only the `public` directory as static assets.
2. Set the variables listed in `.env.example` through the host's private environment settings, never in the downloadable HTML or chat. Start with Square sandbox credentials and the intended sandbox location ID.
3. Set `PUBLIC_ORIGIN` to the exact HTTPS site origin without a trailing slash. Set `SQUARE_WEBHOOK_URL` to that origin plus `/api/square-webhook`. Configure that URL in Square for `payment.created` and `payment.updated`, and save its signature key privately.
4. Set `OWNER_PASSWORD` to a unique password of at least 20 characters. The owner portal is `/owner`, username `owner`; do not share its password with customers. It shows order details and authorized photo downloads. Public APIs never return contact data or uploaded photos.
5. Configure verified tax handling in `checkout-config.json`. The included rules map supports explicit pickup-location or shipping state/ZIP rules only; it is not an automatic nationwide tax engine. Unknown locations are blocked. Before nationwide launch, replace `taxFor` with the merchant's appropriate address-aware tax calculation or configure verified supported regions. Do not populate guessed rates.
6. Rule keys are `pickup:springfield`, `pickup:chicago`, or `shipping:STATE:ZIP`. Each rule requires a numeric `percentage` and booleans `shippingTaxable` and `rushTaxable`. Zero is accepted only as an explicit merchant-reviewed setting. Do not enable checkout until pricing, taxes, policies, persistent storage and photo access have been reviewed.
7. Set `enabled` to true only for the configured test environment. Restart. Complete sandbox tests: successful payment, declined/cancelled payment, network retry, duplicate click, photo retrieval, rush date, shipping, both pickup locations and owner access. Confirm webhook signatures and status updates.
8. Switch private Square settings to production only after sandbox testing passes. Do a controlled authorized live verification before announcing the store.

Shipping addresses remain in the saved design order and owner portal. Square is used only for final payment, so it does not ask the customer to change their delivery destination after taxes are quoted. Photo files are not attached to Square itself. Square receives the design-order reference and a short event note; view full design instructions/photos in `/owner`.

Square payment confirmation uses a verified webhook or a server-side payment lookup. Returning from checkout alone does not mark an order paid. Duplicate retries reuse the same Square idempotency key. Prices are recalculated from the server catalog; client-supplied totals are ignored.

Owner operations still to configure at deployment: private-disk backups, photo/order retention and deletion, monitoring and an owner notification channel. Square's payment receipts are separate from any custom order-confirmation email. No custom emails or text messages are sent by this version. For public traffic, configure an appropriate rate limit at the hosting proxy in addition to the basic server limit.

## Tests

```sh
npm test
```

## Primary integration references

- https://developer.squareup.com/docs/checkout-api/square-order-checkout
- https://developer.squareup.com/docs/checkout-api/optional-checkout-configurations
- https://developer.squareup.com/docs/webhooks/step3validate
- https://developer.squareup.com/docs/changelog/connect-logs/2026-01-22

## Render setup

Upload the extracted storefront-ordering folder to GitHub, not the ZIP. In Render choose Web Service, Node, branch main, Root Directory storefront-ordering, Build Command npm install, Start Command npm start. Use a persistent disk mounted at /var/data and set ORDER_DATA_DIR=/var/data/orders before enabling checkout. Checkout stays disabled until Square and the launch checks above are complete.
