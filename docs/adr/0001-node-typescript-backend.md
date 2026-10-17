---
status: accepted
---

# Backend in Node.js with TypeScript

The checkout backend must sustain many connections at the same time and will be written by multiple teams. We chose Node.js with TypeScript as the runtime and language.

## Why this option

- Asynchronous I/O is native in Node, which fits many simultaneous connections.
- TypeScript brings strong typing and a better development experience.
- Package management stays with npm, which we prefer to Python's environment and dependency management.

## Considered option

**Python.** Rejected.

- Async exists, but it is more confusing.
- The ecosystem mixes synchronous and asynchronous code.
- Typing is optional: with multiple teams and multiple developers, that stops being a guarantee.
- Environment and dependency management is confusing.
- Package management lags behind npm.
- In pure CPU, CPython is slower.
- The GIL prevents real parallelism across threads.

## Consequences

- The concurrency this choice buys is the event loop's, for I/O.
- The main process stays single-threaded.
- Heavy CPU work, if it shows up, leaves that loop (worker threads or another process).
- New backend code is written in TypeScript, so typing does not depend on convention.
