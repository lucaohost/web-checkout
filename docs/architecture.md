# Architecture

Four views of the system. The reasoning behind each choice lives in the [ADRs](./adr/), and the vocabulary in the [glossary](../GLOSSARY.md).

## Containers

```mermaid
flowchart LR
    customer(["Customer"])
    staff(["Staff"])

    subgraph kiosk["Kiosk (tablet)"]
        web["web<br/>React + TypeScript"]
    end

    api["api<br/>Node.js + Fastify"]
    db[("PostgreSQL")]
    mock["payment-mock<br/>Node.js + Fastify"]

    subgraph obs["Observability (optional Compose profile)"]
        prom["Prometheus"]
        graf["Grafana"]
    end

    customer --> web
    web -- "HTTP/JSON<br/>Idempotency-Key" --> api
    staff -- "Swagger UI<br/>X-Staff-Key" --> api
    api -- "SQL via Drizzle" --> db
    api -- "HTTP/JSON<br/>provider key" --> mock
    prom -- "scrapes /metrics" --> api
    graf --> prom
```

`web`, `api` and `payment-mock` run on separate ports and share no code; the frontend's API types are generated from the API's OpenAPI document ([ADR-0007](./adr/0007-monorepo-openapi-contract.md)).

## Checkout and payment

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant K as Kiosk (web)
    participant A as api
    participant D as PostgreSQL
    participant P as payment-mock

    C->>K: Confirm order
    K->>A: POST /checkouts (Idempotency-Key, items and seen prices)
    A->>D: Compare prices, reserve stock (one transaction)
    alt Price changed or stock short
        A-->>K: 409 with every conflict
        K->>C: Continue with these changes, or Edit order
    else Reserved
        A-->>K: 201 checkout id and total
    end

    C->>K: Pay by card, tap the Card Terminal
    K->>A: POST /checkouts/:id/payment CARD (Idempotency-Key)
    A->>P: POST /payments (provider key)
    alt Approved
        A->>D: Create Order as Paid, consume reservation
        A-->>K: 201 Order Code
    else Declined
        A-->>K: 402 Try another card, Pay at Pickup, Cancel
    else Failure (timeout or 5xx)
        A->>P: Retry once with the same provider key
        opt Retry also fails
            A->>P: GET /payments/:key
        end
        alt Approved, declined or not found
            A-->>K: 201 or 402, as above
        else Still unknown
            A->>D: Record Refund as requested
            A-->>K: 402 Pay at Pickup, Cancel
            A--)P: POST /payments/:key/refund (background)
        end
    end

    opt Customer chooses Pay at Pickup
        K->>A: POST /checkouts/:id/payment PAY_AT_PICKUP (Idempotency-Key)
        A->>D: Create Order as Payment Pending, consume reservation
        A-->>K: 201 Order Code
    end

    K->>C: Printing receipt, then Order Code on screen
```

Details: [ADR-0009](./adr/0009-idempotency-keys.md) (keys), [ADR-0010](./adr/0010-stock-reservation.md) (reservation and conflicts), [ADR-0012](./adr/0012-card-payment-retry-unknown-refund.md) (retry, unknown outcomes and Refunds).

## Lifecycles

A Checkout holds the Stock Reservation until it becomes an Order or is abandoned:

```mermaid
stateDiagram-v2
    [*] --> Active: Cart confirmed, stock reserved
    Active --> Consumed: Card approved or Pay at Pickup
    Active --> Released: Customer cancels, idle reset or 3 min expiry
    Consumed --> [*]
    Released --> [*]
```

An Order moves after the Customer has left the Kiosk, through staff endpoints ([ADR-0013](./adr/0013-order-lifecycle-staff-endpoints.md)):

```mermaid
stateDiagram-v2
    state "Payment Pending" as PaymentPending
    state "Picked Up" as PickedUp

    [*] --> Paid: Card approved
    [*] --> PaymentPending: Pay at Pickup
    PaymentPending --> Paid: Paid at the counter
    PaymentPending --> Cancelled: Staff cancels
    Paid --> PickedUp: Staff hands it over
    Paid --> Cancelled: Staff cancels, card refunded
    PickedUp --> [*]
    Cancelled --> [*]
```

## Data model

Conceptual; column names may change during implementation.

```mermaid
erDiagram
    categories ||--o{ products : groups
    products ||--o{ checkout_items : "reserved in"
    checkouts ||--|{ checkout_items : reserves
    checkouts ||--o{ payment_attempts : has
    checkouts ||--o| orders : becomes
    orders ||--|{ order_items : contains
    products ||--o{ order_items : "sold in"
    payment_attempts ||--o{ refunds : "refunded by"

    categories {
        uuid id PK
        text name
        int sort_order
    }
    products {
        uuid id PK
        uuid category_id FK
        text name
        int price_cents
        int stock "units neither sold nor reserved"
    }
    checkouts {
        uuid id PK
        text kiosk_id
        text status "ACTIVE, CONSUMED, RELEASED"
        int total_cents
        timestamptz expires_at
    }
    checkout_items {
        uuid checkout_id FK
        uuid product_id FK
        int quantity
        int unit_price_cents
    }
    payment_attempts {
        uuid id PK
        uuid checkout_id FK
        int attempt_number
        text provider_key "checkoutId:attemptNumber"
        text outcome "APPROVED, DECLINED, FAILED, UNKNOWN"
        text error_code
    }
    orders {
        uuid id PK
        uuid checkout_id FK
        text code "short, such as A-042"
        text kiosk_id
        text status "PAYMENT_PENDING, PAID, PICKED_UP, CANCELLED"
        text payment_method "CARD, PAY_AT_PICKUP"
        bool card_charge_unconfirmed
        int total_cents
    }
    order_items {
        uuid order_id FK
        uuid product_id FK
        int quantity
        int unit_price_cents "fixed when the Order was placed"
    }
    refunds {
        uuid id PK
        uuid payment_attempt_id FK
        text status "REQUESTED, COMPLETED, FAILED"
        int tries
        text last_error
    }
    idempotency_keys {
        uuid key PK
        text kiosk_id
        text route
        text body_fingerprint
        text state "IN_PROGRESS, COMPLETED"
        int response_status
        jsonb response_body
    }
```
