import { describe, it, expect } from 'vitest'
import Protocol from '../core/protocol/Protocol.js'
import createSnapshotBuffer from '../core/snapshot/writer/createSnapshotBuffer.js'
import readSnapshotBuffer from '../core/snapshot/reader/readSnapshotBuffer.js'
import BinaryType from '../core/binary/BinaryType.js'
import chooseOptimization from '../core/snapshot/entityUpdate/chooseOptimization.js'

const schema = {
  id: { type: BinaryType.UInt16 },
  a: { type: BinaryType.UInt16 },
  b: { type: BinaryType.UInt16 },
  c: { type: BinaryType.UInt16 },
  d: { type: BinaryType.UInt16 }
}
const optSchema = {
  a: { type: BinaryType.Int16, delta: true },
  b: { type: BinaryType.Int16, delta: true },
  c: { type: BinaryType.UInt16, delta: false }
}
const config = {
  ID_PROPERTY_NAME: 'id',
  ID_BINARY_TYPE: BinaryType.UInt16,
  TYPE_PROPERTY_NAME: 'type',
  ENABLE_BATCH_OPTIMIZATION: true
}

// Minimal entity cache stub for reader
const entityCache = {
  getEntity(id) {
    return { protocol }
  }
}
let protocol

describe('snapshot mixed partial + optimized updates', () => {
  it('contains both singleProps and batch updates and roundtrips', () => {
    protocol = new Protocol(schema, config, optSchema, null, true)
    // Two entities: one produces batch, one single prop only
    const old1 = { id: 1, a: 100, b: 200, c: 300, d: 5 }
    const new1 = { id: 1, a: 105, b: 198, c: 450, d: 5 } // batch: a,b,c changed; d unchanged
    const old2 = { id: 2, a: 10, b: 20, c: 30, d: 7 }
    const new2 = { id: 2, a: 10, b: 20, c: 30, d: 8 } // only d changed (not optimized), expect single prop

    const updates1 = chooseOptimization('id', old1, new1, protocol)
    const updates2 = chooseOptimization('id', old2, new2, protocol)

    expect(updates1.batch.updates.length).toBe(3)
    // updates2 should have 1 single prop (d)
    const singles2 = updates2.singleProps.filter(Boolean)
    expect(singles2.length).toBe(1)
    expect(singles2[0].prop).toBe('d')

    const snapshot = {
      clientTick: 42,
      engineMessages: [],
      pingKey: 0,
      timestamp: 0,
      avgLatency: 0,
      createEntities: [],
      updateEntities: {
        partial: singles2, // only entity 2 single prop
        optimized: [updates1.batch] // entity 1 batch
      },
      deleteEntities: [],
      localEvents: [],
      messages: [],
      jsons: []
    }

    const buffer = createSnapshotBuffer(snapshot, config)
    const resolverFn = (id) => protocol
    const read = readSnapshotBuffer(buffer.toBuffer(), { entities: [] }, config, () => {}, () => {}, resolverFn)

    // Verify client tick
    expect(read.clientTick).toBe(42)
    // Partial should have 1 entry
    expect(read.updateEntities.partial.length).toBe(1)
    expect(read.updateEntities.partial[0].prop).toBe('d')
    // Optimized should have 1 batch with 3 updates
    expect(read.updateEntities.optimized.length).toBe(1)
    expect(read.updateEntities.optimized[0].updates.length).toBe(3)
  })
})
