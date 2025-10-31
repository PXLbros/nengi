# Enhancements & Compatibility Notes

## Node.js v22 compatibility
- Running `npm start` under Node.js v22 aborts inside Node core because every test file uses `require = require('esm')(module)` to backport ES modules (`index.js:1`, `spec/proxy-spec.js:1`). Node 22 removed the internal `fs` hook that `esm` depends on, so the process aborts before Jasmine starts. Replace the shim by publishing native ESM (e.g. add `"type": "module"` with dual CJS entry via `exports`) or transpile the ES entrypoints during bundling.
- The native `@clusterws/cws` dependency no longer builds against Node v22 (`node_modules/@clusterws/cws/build_log.txt:53`). The addon refers to removed internals such as `node::BaseObject` and the V8 ArrayBuffer APIs, and a subsequent `require('@clusterws/cws')` throws because the `cws_linux_127` binding is missing. Swap the dependency for a maintained websocket server (`uWebSockets.js`, `ws` with clustering, etc.) or update the addon to N-API before declaring Node 22 support.
- Because both the server (`core/instance/Instance.js:18`) and bot client (`core/bot/Bot.js:21`) import `@clusterws/cws`, migrating away from it is prerequisite for running any part of the stack on Node 22.

## Functional and performance findings
- `Instance.removeComponent` forgets to pass the parent source id to `unregisterEntity`, so component entities stay in `sources` and never return their IDs to the pool (`core/instance/Instance.js:402` → `core/instance/Instance.js:320`). Pass the parent id to avoid leaking component entities and exhausting `IdPool`.
- `Channel.unsubscribe` calls `this.clients.delete(client)` even though the map is keyed by `client.id`, so entries never disappear (`core/instance/Channel.js:47`). Use the id key to prevent leaked client references and stale subscriptions.
- `getNextCommand` removes from the head of an array with `shift`, making command dequeue O(n) per call once many inputs arrive (`core/instance/Instance.js:213`). Track a head index or use a ring buffer/deque to keep dequeue cost constant.
- Recycling entity IDs uses `Array.prototype.unshift`, which is also O(n)` (`core/instance/IdPool.js:24`). Switching to `push` (the pool already behaves like a stack) keeps reclamation cost amortized O(1) and avoids per-frame copies when many IDs recycle.
- Visibility bookkeeping repeatedly splices from the middle of `cacheArr`, producing quadratic behavior when many entities leave view in one tick (`core/instance/Client.js:129`). Swap-with-last removal or a `Set` keeps the loop linear.
- `LatencyRecord` trims history with `shift`, which copies the remaining samples each call (`core/instance/LatencyRecord.js:49`). A circular buffer or `splice(0, n)` replacement avoids reallocating on every ping.
- Checking `this.noInterps.indexOf(id)` inside the visible-entity loop makes each frame O(n²) with many non-interpolated IDs (`core/instance/Instance.js:726`). Store the flag in a `Set` for constant-time membership.
- `BasicSpace.queryArea` scans every entity and event each update (`core/instance/BasicSpace.js:128`). For large worlds, introduce a spatial index (quadtree, BVH, grid) or expose hooks so users can plug in one; it is one of the largest CPU costs in dense games.
- `createSnapshot` receives the current timestamp but immediately re-computes `Date.now()` for each client (`core/instance/Instance.js:627`), doubling the system call frequency per tick. Reuse the value passed in from `update`.

## Developer experience opportunities
- Drop the legacy `esm` shim entirely and publish modern dual-build artifacts (native ESM + CommonJS) via the `exports` map. This also simplifies bundlers and lets the same sources run unmodified in browsers.
- Replace the bespoke Jasmine + CommonJS test harness with an ESM-aware runner (Vitest, Jest 29+, Node’s built-in test runner). That removes the `require('esm')` workaround and makes it easier to run tests under modern Node versions.
- Add linting/formatting (ESLint + Prettier) and continuous integration so structural issues (e.g. `Channel.unsubscribe`) are caught automatically.
- Document and optionally wrap the websocket layer behind an adapter so users can choose `ws`, `uWebSockets.js`, or Workers. Abstracting this now eases the migration away from `@clusterws/cws` and lets projects swap transports for scaling.
- Consider publishing typed entrypoints (TypeScript or JSDoc typedefs) so the sizeable `index.d.ts` stays in sync with runtime changes; the current definition file carries `// TODO` placeholders and misses several properties.
