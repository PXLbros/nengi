# Nengi Performance & Testing Analysis

This document outlines potential performance improvements and testing enhancements for the Nengi game networking engine.

## Performance Improvements

The Nengi codebase is already heavily optimized, with a focus on binary serialization, data diffing, and the use of high-performance libraries like `uWebSockets.js`. However, several areas could be targeted for further performance gains.

### 1. Re-enable and Validate Batched Updates

**Observation:**
The entity update optimization logic in `core/snapshot/entityUpdate/chooseOptimization.js` has a feature for batching property updates, which is currently disabled (`var isBatchValid = false`). Batching is a powerful optimization that reduces the overhead of sending multiple small updates by combining them into a single, larger update. The logic to check for batch validity exists in `core/snapshot/entityUpdate/isBatchAtomiclyValid.js` and appears to be correct.

**Recommendation:**
- Re-enable the `isBatchAtomiclyValid` check in `chooseOptimization.js`.
- Thoroughly test the batching functionality to ensure it is working as expected under various conditions (e.g., with different entity protocols and update patterns).
- Benchmark the performance with and without batching to quantify the improvement. This should be the highest priority performance enhancement to investigate.

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
- [ ] Add tests for smaller bit-width integer variants (`UInt2`..`UInt12`, `Int2`..`Int12`).
- [ ] Add exhaustive randomized fuzz tests for `BitBuffer.getBits/setBits` over mixed offsets & lengths.
- [ ] Add snapshot reader/writer isolated roundtrip tests.
- [ ] Add direct tests for diff optimization logic in `chooseOptimization.js` (single vs batch vs none).

### Next Planned Steps

1. Extend tests to cover small-width integer types and ensure no off-by-one errors in packing bits.
2. Introduce randomized property-based tests (e.g., generate values within bounds, serialize/deserialize, assert equality) for robustness.
3. Begin snapshot system unit tests (serialize/deserialize flow) before moving to integration tests.
4. After core unit coverage improves, start client-side `Interpolator` sequence tests.

