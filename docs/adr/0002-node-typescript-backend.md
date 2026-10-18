---
status: accepted
---

# Backend in Node.js with TypeScript

The checkout API is written in Node.js with TypeScript, so the whole stack (React frontend, API and payment mock) uses one language.

## Why this option

- The team we are building for works mostly in Python and Node, so both are in bounds.
- One language end to end means one toolchain, one test runner and request/response types that line up with the frontend's, which already is TypeScript ([ADR-0001](./0001-frontend-react-typescript.md)).
- TypeScript makes typing mandatory rather than a convention.
- It is the stack we are fastest in, which matters for a few-day budget.

The workload is small and I/O bound (read the menu, write an order, call the payment provider), so runtime performance does not separate the options.

## Considered option

**Python (e.g. FastAPI).** Rejected, though it would meet the requirements. It would split the stack into two languages and two toolchains, and typing would rely on discipline instead of the compiler.

## Consequences

- Concurrency comes from the event loop; the main process stays single-threaded.
- Heavy CPU work, if it ever shows up, leaves the loop (worker threads or another process).
