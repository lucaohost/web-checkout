---
status: accepted
---

# Payment mock as a separate service

The external payment provider is simulated by its own service, `payment-mock`, on its own port, called by the API over real HTTP. Timeouts, connection errors and slow responses only behave like the real thing across a real network hop; a module inside the API would fake them.

The mock exposes three operations, all addressed by the provider key of a Payment Attempt ([ADR-0009](./0009-idempotency-keys.md)):

- `POST /payments` charges a card. Repeating a charge with the same key returns the original result instead of charging again.
- `GET /payments/:key` reports the outcome of a charge, or that it does not exist.
- `POST /payments/:key/refund` refunds a charge. Repeating it never refunds twice, and refunding a charge that never happened answers "nothing to refund".

The mock adds simulated latency and fails about 5% of requests at random. A request can force a specific outcome with the `X-Force-Error` header:
- for charges: `timeout`, `server_error`, `declined`, `insufficient_funds`, `invalid_card` or `slow`;
- for refunds: `timeout` or `server_error`.

The API forwards the header only when `ALLOW_FORCE_ERROR` is true. That flag follows `NODE_ENV` when it is unset (on in development, off in production) and Compose sets it explicitly, because the API image runs with `NODE_ENV=production`. The card screen also has a collapsed demo control that sends the header for a decline or a timeout. Tests run the mock with a fixed seed so the random failures are reproducible.

## Considered options

- **Mock module inside the API.** Rejected. Network failures would be simulated in-process, so the retry and timeout handling would never meet a real socket.
