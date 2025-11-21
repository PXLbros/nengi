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
  c: { type: BinaryType.UInt16 }
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

describe('snapshot batch roundtrip', () => {
  it('writes and reads optimized batch with correct values', () => {
    protocol = new Protocol(schema, config, optSchema, null, true)
    const oldProxy = { id: 1, a: 100, b: 200, c: 300 }
    const newProxy = { id: 1, a: 105, b: 198, c: 450 }
    const updates = chooseOptimization('id', oldProxy, newProxy, protocol)

    expect(updates.batch.updates.length).toBe(3)

    const snapshot = {
      clientTick: 1,
      engineMessages: [],
      pingKey: 0,
      timestamp: 0,
      avgLatency: 0,
      createEntities: [],
      updateEntities: { partial: [], optimized: [updates.batch] },
      deleteEntities: [],
      localEvents: [],
      messages: [],
      jsons: []
    }

    const buffer = createSnapshotBuffer(snapshot, config)
    const read = readSnapshotBuffer(buffer.toBuffer(), { entities: [] }, config, () => {}, () => {}, entityCache)

    expect(read.updateEntities.optimized.length).toBe(1)
    const batch = read.updateEntities.optimized[0]
    // Validate id
    expect(batch.id).toBe(1)
    // Validate update ordering and values
    const a = batch.updates.find(u => u.prop === 'a')
    const b = batch.updates.find(u => u.prop === 'b')
    const c = batch.updates.find(u => u.prop === 'c')
    expect(a.value).toBe(5) // delta
    expect(b.value).toBe(-2) // delta
    expect(c.value).toBe(450) // absolute
  })
})
