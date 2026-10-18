---
status: accepted
---

# Stock is reserved when the Checkout starts

`POST /checkouts` creates a Stock Reservation for every Product in the Cart, before any payment. Each Product is decremented atomically and conditionally, `UPDATE ... SET stock = stock - :qty WHERE id = :id AND stock >= :qty`, in a single transaction. Several kiosks can compete for the last unit without explicit locks, and no card is charged for a Product that is already gone.

## Conflicts

If any Product is short, or any price differs from the price the kiosk showed, the transaction rolls back. The API answers `409` with every conflict at once:

- a sold-out Product, which is removed from the Cart;
- a partially available Product, whose quantity is reduced to what is left;
- a changed price, up or down, which is updated to the price in the database.

The kiosk shows all the changes on one screen, and the Customer must choose "Continue with these changes" or "Edit order". Nothing is resubmitted without that confirmation. Prices are always compared against the database, never against the Menu cache ([ADR-0011](./0011-menu-cache-in-memory.md)).

## Lifecycle

- **Active** for 3 minutes from creation.
- **Consumed** when the Order is created, either on an approved card payment or when the Customer chooses Pay at Pickup.
- **Released**, which returns the units to Stock, on `DELETE /checkouts/:id` (the Customer cancels, or the kiosk's idle reset fires) or on expiry, through a periodic sweep in the API.

The idle reset (60 s plus a 15 s countdown) fires long before the 3-minute expiry, so expiry mostly cleans up after kiosks that crashed or lost their connection. A payment request for an expired Checkout gets `410`, and the kiosk takes the Customer back to the Cart.

## Considered options

- **Validate stock only when submitting.** Rejected. Two kiosks can both pass validation for the last unit.
- **Decrement after the payment is approved.** Rejected. The Customer could be charged for a Product that sold out meanwhile, forcing a Refund.
- **Compute Availability as Stock minus active Reservations.** Rejected. Every read and every Checkout would need row locks. Keeping the stock column as the single number of sellable units is simpler.

## Consequences

- The stock column means units neither sold nor reserved. Availability reads it directly, so a Product reserved by another Customer briefly shows as sold out.
- While the API is down, expired Reservations are not released; the sweep catches up when it returns.
