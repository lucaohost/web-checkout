# web-checkout

Self-service checkout for a snack bar. A customer walks up to a tablet mounted at the counter, browses the menu, builds an order, pays and walks away, with no cashier to ask for help.

## Documentation

- [Requirements](./docs/requirements.md): functional, non-functional and constraints.
- [Architecture](./docs/architecture.md): containers, the checkout and payment flow, lifecycles and the data model.
- [Glossary](./GLOSSARY.md): the vocabulary used across code and docs.
- [Architecture decisions](#architecture-decisions): the ADRs, listed below.

## Run it

Needs Docker and Node 24. From a Unix machine (or Windows with Docker Desktop):

```bash
docker compose up --build
```

Then open [http://localhost:8080](http://localhost:8080). The API is on port 3000 (`/docs` is the Swagger UI; staff calls take `X-Staff-Key: dev-staff-key`). The payment mock is on port 4000. Force a card outcome from a browser extension with `X-Force-Error` (`timeout`, `server_error`, `declined`, `insufficient_funds`, `invalid_card`, `slow`).

```bash
make test          # payment-mock, API (Postgres via Testcontainers) and kiosk unit/UI tests
make typecheck
docker compose --profile observability up --build   # Prometheus :9090 and Grafana :3001
```

Without Compose, start Postgres (`docker compose up -d postgres`), then `node src/server.ts` in `apps/payment-mock` and `apps/api`, and `npm run dev` in `apps/web`.

## How this was built

Design came before code. A Cursor agent questioned the first draft through every branch of the decision tree, using the skills versioned in [`.cursor/skills`](./.cursor/skills/), and the glossary and ADRs were written as each decision was settled. The [session record](./docs/process/0001-architecture-grilling.md) shows what the agent found, and where the human overrode it. Later steps are recorded in [`docs/process`](./docs/process/).

## Scope

The time budget goes, in order, to:

1. **A robust core flow**: menu, cart, payment and order, including what happens when payment, stock or the network misbehave, and a kiosk-friendly experience for someone alone at the screen.
2. **A visible process**: how the project went from an empty folder to a finished thing.
3. **Observability**: structured logs and latency metrics always on; Prometheus, Grafana and alerts as an opt-in extra.

### Service level objectives

- API processing, excluding the payment provider: P95 under 300 ms.
- Payment provider call: 3 s timeout.
- Worst case the Customer waits, including one automatic retry and a status check: about 7 to 8 s, with visual feedback the whole time.

### Out of scope, and future improvements

- **Offline mode.** The kiosk shows a friendly error and retries when the network drops; ordering offline (PWA, service worker) is not built, since payment needs the network anyway.
- **Product customization and upsell**: sizes, extras, "no onions", suggestions at checkout.
- **Internationalization.** The UI is in English, with its texts kept in one place so a translation can be added.
- **Admin screen.** Products, categories and stock come from a seed script.
- **Counter screen for staff** to follow Orders and move them between statuses; until then, staff use the API through Swagger UI ([ADR-0013](./docs/adr/0013-order-lifecycle-staff-endpoints.md)).
- **Waste tracking.** Cancelling an Order returns its units to Stock, which assumes ready-made Products; prepared-to-order Products should be recorded as waste instead.
- **Automatic cancellation of unpaid Pay at Pickup Orders**, once the snack bar defines how long to wait.
- **Authentication**: per-kiosk credentials and per-person staff accounts instead of a shared staff key ([ADR-0008](./docs/adr/0008-kiosk-security-baseline.md)).
- **Redis for the Menu cache**, once there are several API instances ([ADR-0011](./docs/adr/0011-menu-cache-in-memory.md)).

## Architecture decisions

- [0001: Frontend in React with TypeScript](./docs/adr/0001-frontend-react-typescript.md)
- [0002: Backend in Node.js with TypeScript](./docs/adr/0002-node-typescript-backend.md)
- [0003: Fastify as the HTTP framework](./docs/adr/0003-fastify-http-framework.md)
- [0004: PostgreSQL as the database](./docs/adr/0004-postgres-database.md)
- [0005: Drizzle for data access](./docs/adr/0005-drizzle-data-access.md)
- [0006: Payment mock as a separate service](./docs/adr/0006-payment-mock-separate-service.md)
- [0007: One repository, three independent apps, an OpenAPI contract](./docs/adr/0007-monorepo-openapi-contract.md)
- [0008: Kiosk security baseline: no authentication for Customers, a shared key for staff](./docs/adr/0008-kiosk-security-baseline.md)
- [0009: Idempotency keys on state-changing kiosk requests](./docs/adr/0009-idempotency-keys.md)
- [0010: Stock is reserved when the Checkout starts](./docs/adr/0010-stock-reservation.md)
- [0011: Menu cached in API memory, Stock never cached](./docs/adr/0011-menu-cache-in-memory.md)
- [0012: Card payment: one automatic retry, unknown outcomes and Refunds](./docs/adr/0012-card-payment-retry-unknown-refund.md)
- [0013: Order lifecycle driven by staff endpoints, without a screen](./docs/adr/0013-order-lifecycle-staff-endpoints.md)
