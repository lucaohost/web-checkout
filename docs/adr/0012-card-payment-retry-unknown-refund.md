---
status: accepted
---

# Card payment: one automatic retry, unknown outcomes and Refunds

A card charge can end in four ways, and each one needs a different answer. Getting this wrong either charges the Customer twice or leaves them stuck at the screen with no way out. Every Payment Attempt uses the provider key described in [ADR-0009](./0009-idempotency-keys.md), `{checkoutId}:{attemptNumber}`.

## Outcomes of a Payment Attempt

- **Approved.** The Order is created as Paid and the Stock Reservation is consumed ([ADR-0010](./0010-stock-reservation.md)).
- **Payment Declined.** Never retried automatically. Declines are business answers, and asking again only repeats them.
- **Payment Failure** (timeout, `5xx`, connection error). Retried **once**, automatically, after 200 to 400 ms with jitter, using the same provider key. If the retry also fails, the API asks the provider for the status of that key (`GET /payments/:key`):
  - approved: the attempt counts as approved;
  - declined: it counts as a Payment Declined;
  - not found: a definitive Payment Failure, since nothing was charged;
  - the status query itself fails: the outcome is **unknown**.
- **Unknown.** The Customer may or may not have been charged. A Refund is requested for that attempt right away, and no further card attempt is allowed in this Checkout.

## What the Customer can do next

| After | Options on the screen |
| --- | --- |
| A Payment Declined or a definitive Payment Failure | Try another card, Pay at Pickup, Cancel |
| An unknown outcome, or the third attempt | Pay at Pickup, Cancel |

A Checkout allows at most 3 card attempts. The automatic retry is part of its attempt and does not count as a new one.

## Pay at Pickup

Choosing Pay at Pickup, either from the start or after a failed attempt, creates the Order as Payment Pending right away and consumes the Stock Reservation. After an unknown outcome, the Order is flagged "card charge unconfirmed", and the Receipt tells the Customer that if their card was charged, it will be refunded.

## Time budget

- Each provider call times out after 3 s.
- The worst case (timeout, retry, timeout, status query) stays around 7 to 8 s, with the kiosk showing progress the whole time.
- The kiosk's own request timeout is 10 s. After it, the kiosk resends with the same idempotency key, which either replays the result or reports that the request is still in progress. If every resend loses its response too, the kiosk calls `GET /checkouts/:id`. An Order on that Checkout is shown as the Receipt; anything else is explained on the payment screen, not only back on the Menu.

## Refunds

- **When.** After an unknown outcome, and when an Order paid by card is cancelled ([ADR-0013](./0013-order-lifecycle-staff-endpoints.md)). An Order paid in cash at the counter is refunded in cash at the counter, without calling the provider.
- **Never blocking the Customer.** The API records the Refund as `REQUESTED` and calls `POST /payments/:key/refund` in the background. The Refund becomes `COMPLETED`, or `FAILED` after 5 tries with exponential backoff driven by the periodic sweep.
- **Idempotent at the provider.** A Refund addresses the attempt's key, so repeating it never refunds twice. A provider answer of "nothing to refund" counts as `COMPLETED`.
- **Never silent.** A `FAILED` Refund writes an error log and increments a metric that feeds an alert.

## Considered options

- **Retrying every error, including declines.** Rejected. A decline repeats itself, wastes the Customer's time and can look like fraud to the issuer.
- **More than one automatic retry.** Rejected. Each retry can add 3 s for someone standing at the screen.
- **Offering another card after an unknown outcome.** Rejected. It risks charging the Customer twice.
- **Waiting for the Refund before letting the Customer go.** Rejected. The Customer gets their food; the Refund is the snack bar's problem, tracked and alerted.
