---
status: accepted
---

# Fastify as the HTTP framework

The API and the payment mock use Fastify. Its JSON Schema validation is built in, and the same schemas generate the OpenAPI contract ([ADR-0007](./0007-monorepo-openapi-contract.md)); structured logging through pino, with a per-request id, comes out of the box.

## Considered options

- **Express.** Rejected. Validation, schema-to-OpenAPI and structured logging would each be a library glued on by hand, and its typings are weaker.
- **NestJS.** Rejected. Modules, decorators and dependency injection are ceremony that a handful of endpoints does not pay back.
