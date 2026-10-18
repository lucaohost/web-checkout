---
status: accepted
---

# One repository, three independent apps, an OpenAPI contract

The code lives in one repository as `apps/web`, `apps/api` and `apps/payment-mock`, each on its own port and each self-contained, as if they were separate repositories: no imports between them and no shared package. The API publishes an OpenAPI document generated from its route schemas ([ADR-0003](./0003-fastify-http-framework.md)), and the frontend generates its API types from that document.

## Considered options

- **A shared types package.** Rejected. Convenient, but it couples the apps at build time, which breaks the separate-repositories boundary the project is meant to simulate.
- **Separate repositories.** Rejected. Reviewers would need to clone and start three repositories.

## Consequences

- Changing the API contract means regenerating the frontend types; a stale contract shows up as a type error, not a runtime surprise.
