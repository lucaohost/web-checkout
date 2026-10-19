# 0002: Implementation after the grilling session

**Date:** 18 October 2026.
**Follows:** [0001](./0001-architecture-grilling.md).

The architecture was implemented test-first, one vertical slice at a time: Menu and kiosk screen, payment-mock, Checkout and Stock reservation, card payment and Pay at Pickup, staff Order transitions, then the rest of the kiosk flow (conflicts, receipt, idle reset). Tests sit on the seams agreed before the first test: HTTP against the API with a real Postgres, HTTP against the payment-mock, the HTTP provider against a real mock process, domain tables for payment resolution and Order transitions, and the kiosk screens through React Testing Library with MSW.

Playwright end-to-end tests were left out of this pass. The Compose stack is the teammate path; the same flows are already locked by the API and kiosk suites, and installing browser binaries would have delayed a first clone-and-run. A later pass added Playwright tests that pay at the counter and by card against a real API, payment mock and kiosk.
