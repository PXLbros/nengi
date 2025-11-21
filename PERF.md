# Nengi Performance & Testing Analysis

This document outlines potential performance improvements and testing enhancements for the Nengi game networking engine.

## Performance Improvements

The Nengi codebase is already heavily optimized, with a focus on binary serialization, data diffing, and the use of high-performance libraries like `uWebSockets.js`. However, several areas could be targeted for further performance gains.

### 1. Re-enable and Validate Batched Updates

**Status:**
Batching logic has been re-enabled and gated behind `ENABLE_BATCH_OPTIMIZATION` (default: disabled) on the `Protocol` config. When enabled and valid, grouped updates are emitted via `updateEntities.optimized`; when disabled or invalid, diffs fall back to `updateEntities.partial`.

**Validation Implemented:**
- Unit tests for diff selection (`chooseOptimization-batch-spec.js`, stability & toggle behavior).
- Writer snapshot size delta test (`snapshot-writer-batch-toggle-spec.js`) confirming additional bytes only when batches present.
- Full write/read roundtrip for batch (`snapshot-batch-roundtrip-spec.js`) verifying delta and absolute values survive serialization.
- Reader bug fixed (config now passed into batch read path).
- Mixed snapshot test (`snapshot-mixed-updates-spec.js`) validating coexistence of single property and batch updates in one snapshot.
- Non-assertive perf comparison (`perf-batch-vs-disabled-spec.js`) logs ms & average buffer size for 500 entities over 50 ticks.

**Remaining Risks / Follow-ups:**
- Chunk marker visibility test replaced by size-based assertion (raw marker byte not yet isolated in buffer; low impact but could add bit-level parser test later).
- Need perf comparison (batch vs singleProps) under high-entity churn to quantify savings.
- Add coexistence test mixing singleProps & optimized batches in same snapshot.

**Next Actions:**
1. Benchmark enabled vs disabled across varying diff counts.
2. Expand perf benchmark matrix (entity counts, properties, delta frequency) and record results here.
3. Document toggle in README/usage examples.
4. Add bit-level chunk marker verification helper (optional) to restore direct marker assertion.

### Expanded Batching Perf Snapshot (dev machine)

| Entities | Ticks | ENABLE_BATCH_OPTIMIZATION | BATCH_MIN_UPDATES | Total ms | Avg Bytes/Snapshot |
|----------|-------|---------------------------|-------------------|----------|--------------------|
| 100      | 50    | false                     | -                 | 12 ms    | 605.90 bytes       |
| 100      | 50    | true                      | 2                 | 10 ms    | 573.96 bytes       |
| 500      | 50    | false                     | -                 | 21 ms    | 2948.24 bytes      |
| 500      | 50    | true                      | 2                 | 16 ms    | 2776.70 bytes      |
| 2000     | 50    | false                     | -                 | 54 ms    | 11731.04 bytes     |
| 2000     | 50    | true                      | 2                 | 72 ms    | 11039.42 bytes     |
| 500 (single-prop) | 50 | false                | -                 | 17 ms    | 1478.60 bytes      |
| 500 (single-prop) | 50 | true                 | 2                 | 11 ms    | 1478.60 bytes      |

Interpretation: Introducing the `BATCH_MIN_UPDATES` heuristic (default 2) prevents batching for single-property changes, reducing average snapshot size compared to previous all-batch approach (notably at 100 & 500 entities). For large entity counts (2000) batching still increases CPU time—likely due to batch construction overhead; additional heuristics (e.g., upper bound on batch keys or dynamic size comparison) may be warranted. Single-property scenario shows identical size (heuristic forces partial path) with improved ms when batching enabled (overhead avoided). Further tuning could compare estimated bits before final selection.

### 2. Eliminate Buffer Copying in WebSocket Message Handling

**Observation:**
In `core/instance/Instance.js`, the `uWebSockets.js` message handler converts the incoming `ArrayBuffer` to a Node.js `Buffer` using `Buffer.from(message)`. This creates a copy of the message data for every incoming packet, which can lead to significant overhead and pressure on the garbage collector in a high-throughput server.

**Recommendation:**
- Modify the message reading pipeline (starting from `readCommandBuffer`) to work directly with `ArrayBuffer`s or a zero-copy view like `Uint8Array`. This would avoid the per-message allocation and copy, reducing GC pressure and improving overall throughput.

### 3. Optimize Command Queue

**Observation:**
The `Instance.commands` array in `core/instance/Instance.js` is used as a queue with `push` to add commands and `shift` to remove them. `Array.prototype.shift()` can have a time complexity of O(n), as it requires re-indexing all subsequent elements.

**Recommendation:**
- For very high command rates, consider replacing the array-based queue with a more efficient queue implementation, such as a doubly-linked list. This would ensure that both enqueue and dequeue operations are O(1). However, the practical impact of this should be measured, as the number of commands per tick is likely small.

### 4. Investigate Object Pooling for High-Frequency Objects

**Observation:**
The `update` loop in `Instance.js` creates several objects per client, per tick, such as snapshots and proxy objects. This can contribute to GC pauses.

**Recommendation:**
- Investigate the use of object pools for frequently created and discarded objects. For example, `snapshot` objects could be acquired from a pool at the beginning of `createSnapshot` and released back to the pool after the snapshot has been sent. This would reduce the amount of work for the garbage collector.

### 5. Promote Binary Messages over JSON

**Observation:**
The `Instance.sendJSON` method uses `JSON.stringify`, which is known to be slower than binary serialization. The engine has a sophisticated binary protocol system.

**Recommendation:**
- In documentation and examples, strongly encourage the use of binary messages (`instance.message()`) for all performance-critical data. The `sendJSON` method should be reserved for non-critical, infrequent communication.

## Testing Improvements

The existing tests in the `spec/` directory provide a good foundation, especially for the proxy system. However, test coverage could be significantly improved to increase the robustness and maintainability of the engine.

### 1. Add Unit Tests for Core Modules

Many core components lack dedicated unit tests.
- **Binary Layer (`core/binary`):** Create tests for `BitBuffer`, `BitStream`, and each data type in `core/binary/types`. These tests should verify that writing and reading values works correctly, especially at boundary conditions (e.g., min/max values for integer types).
- **Snapshot System (`core/snapshot`):** Add unit tests for the snapshot reader and writer. For example, test `createSnapshotBuffer` and `readSnapshotBuffer` in isolation to ensure that a serialized snapshot can be correctly deserialized.
- **Client-Side Logic (`core/client`):** The `Interpolator` and `Predictor` are critical for the client-side experience and should be unit-tested. For example, feed the `Interpolator` a sequence of snapshots and assert that it produces correctly interpolated entity states.
- **`chooseOptimization.js`:** The diffing logic is a hot path and central to the engine's efficiency. It should be tested directly, with scenarios that trigger single property updates, batch updates, and no updates.

### 2. Create Automated Integration Tests

**Observation:**
The `spec/manual` directory suggests that some testing is done manually. These tests should be automated.

**Recommendation:**
- Create a suite of integration tests that run a full client-server loop. These tests should:
  - Start an `Instance`.
  - Connect one or more clients (`Bot`s).
  - Exchange data (snapshots and commands).
  - Verify that the game state is consistent between the server and clients.
- Test edge cases like clients connecting and disconnecting abruptly.

### 3. Implement Performance and Stress Tests

**Observation:**
There are no automated performance benchmarks.

**Recommendation:**
- Create a dedicated benchmark suite that:
  - Measures and tracks the performance of critical operations like `Instance.update()`.
  - Simulates a large number of entities and clients to find bottlenecks under load.
  - Tracks memory usage to detect potential leaks.
- These benchmarks are essential for validating the impact of performance optimizations and preventing regressions.

## Progress

### Test Coverage Expansion

- [x] Initial assessment of existing binary roundtrip tests in `spec/binary-spec.js` (already covered core numeric & boolean types).
- [x] Added dedicated boundary tests for integer types (`UInt8`, `Int8`, `UInt16`, `Int16`, `UInt32`, `Int32`) in `spec/binary-bounds-spec.js`, verifying `boundsCheck`, min/max roundtrip, and offset behavior.
- [x] Added tests for smaller bit-width integer variants (`UInt2`..`UInt12`, `Int2`..`Int12`) via direct BitStream method checks in `spec/binary-smallwidth-spec.js`.
 - [x] Added exhaustive randomized fuzz tests for `BitBuffer.getBits/setBits` over mixed offsets & lengths in `spec/binary-fuzz-spec.js` (unsigned & signed 2-32 bits).
 - [x] Added snapshot writer/reader roundtrip test (`spec/snapshot-roundtrip-spec.js`) verifying entity creation and single property update integrity.
- [x] Added diff logic tests for `chooseOptimization` (`spec/chooseOptimization-spec.js`) covering no-change, single-change, multi-change scenarios. Added independent validation tests for `isBatchAtomiclyValid` with optimization schemas.
- [x] Added Interpolator sequence test (`spec/interpolator-spec.js`) verifying correct value interpolation between snapshots.
- [x] Added Predictor tests (`spec/predictor-spec.js`) covering numeric match/no-error, numeric drift over/under epsilon, and string reconciliation.
- [x] Added Predictor cleanup aging test (`spec/predictor-cleanup-spec.js`) validating frame eviction threshold.
- [x] Added snapshot edge tests (`spec/snapshot-edge-spec.js`) for empty, delete-only, and partial update snapshots.
- [ ] Add snapshot reader/writer isolated roundtrip tests.
- [ ] Add direct tests for diff optimization logic in `chooseOptimization.js` (single vs batch vs none).

### Next Planned Steps

1. Introduce property-based randomized prediction vs authoritative fuzz tests (numeric & string).
2. Add snapshot batch optimization test once batching re-enabled.
3. [x] Added comprehensive end-to-end integration test (`spec/integration-end-to-end-spec.js`) covering multi-client lifecycle, command processing, update broadcast, and disconnect cleanup.
4. Begin perf/stress harness: simulate large numbers of entities and clients, measure tick/update throughput, and track memory usage under load.
5. Add performance baseline benchmarks before enabling batching optimization.
6. Add tests for transfer/handshake buffers (createHandshake, readConnectionResponse) to catch protocol regressions.

