# Requirements

Derived from the assignment brief and refined during the [architecture grilling session](./process/0001-architecture-grilling.md). Terms follow the [glossary](../GLOSSARY.md).

## Functional

**Menu**
- Show every Product grouped by Category, fetched from the API.
- Show Availability rather than exact Stock: available, "last N units" at 5 or fewer, or sold out. Sold-out Products stay visible, greyed out, disabled and moved to the end of their Category, because a regular Customer who cannot find a Product would otherwise wonder where it went.

**Cart**
- Add and remove Products, and change quantities, never beyond the known Stock.
- The Cart lives only on the Kiosk.

**Checkout**
- On confirmation, the server checks every price and reserves Stock.
- Changed prices, sold-out Products and partially available Products come back together. The Customer must choose "Continue with these changes" or "Edit order".

**Payment**
- Card through a simulated Card Terminal, or Pay at Pickup, in cash at the counter.
- After a Payment Declined or a Payment Failure: try another card (at most 3 attempts), Pay at Pickup, or Cancel.
- After an unknown outcome: Pay at Pickup or Cancel only, and a Refund is requested.

**Order**
- An Order exists only after a card approval or a Pay at Pickup choice.
- Show a short Order Code, then simulate printing the Receipt.
- Staff can mark an Order as Paid, Picked Up or Cancelled.

**Unattended Kiosk**
- After 60 s without a touch, ask "Still there?" with a 15 s countdown, then clear everything.
- Return to the start screen about 15 s after a finished Order.

## Non-functional

- **Latency**: API processing P95 under 300 ms, excluding the payment provider. Provider calls time out at 3 s. The worst case for the Customer is about 7 to 8 s, with visual feedback throughout.
- **Logs**: structured JSON, with a request id carried from the Kiosk through the API to the payment mock, and the Checkout and Order ids on every checkout log line.
- **Metrics**: P50, P95 and P99 histograms for API routes and for provider calls, plus counters for final Order statuses and failed Refunds, all exposed on `/metrics`.
- **Monitoring and alerts**: an opt-in Prometheus and Grafana profile with a ready-made dashboard and alerts on payment failure rate, P99 above target and failed Refunds.
- **Tests**:
  - unit tests for totals, retry classification and status transitions;
  - integration tests against a real Postgres and the payment mock with a fixed seed, covering every forced error, competition for the last unit and idempotency;
  - end-to-end tests for one happy path and one recovery path.
- **Running**: one `docker compose up` starts everything, with migrations and seed applied automatically. A Makefile provides `make up`, `make test` and `make demo`.
- **Kiosk experience**: landscape tablet, touch targets of at least 48 px, nothing that depends on hover, zoom and text selection disabled, high contrast, the total always visible, UI in English.
- **Documentation**: a README with context, usage and links to the ADRs.

## Constraints

- Backend in Node.js with TypeScript; frontend in React with TypeScript.
- Frontend, API and payment mock run on separate ports, as if they were separate repositories.
- The payment provider is a mock with simulated latency that fails about 5% of requests at random, and fails on demand through the `X-Force-Error` header.
- Data lives in PostgreSQL.

## Out of scope

Listed, with the reasons, in the [README](../README.md#out-of-scope-and-future-improvements).
