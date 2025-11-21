import { describe, it, expect } from 'vitest'
import Protocol from '../core/protocol/Protocol.js'
import createSnapshotBuffer from '../core/snapshot/writer/createSnapshotBuffer.js'
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

describe('integration: snapshot batch chunk', () => {
    it('writes an optimized batch chunk increasing snapshot size', () => {
        const protocol = new Protocol(schema, config, optSchema, null, true)
        const oldProxy = { id: 1, a: 100, b: 200, c: 300 }
        const newProxy = { id: 1, a: 105, b: 198, c: 450 }
        const updates = chooseOptimization('id', oldProxy, newProxy, protocol)
        const snapshot = {
            clientTick: 1,
            engineMessages: [],
            pingKey: 0,
            timestamp: 0,
            avgLatency: 0,
            createEntities: [],
            updateEntities: { partial: [], optimized: updates.batch.updates.length ? [updates.batch] : [] },
            deleteEntities: [],
            localEvents: [],
            messages: [],
            jsons: []
        }
        const bufferWithBatch = createSnapshotBuffer(snapshot, config)

        // Build a snapshot without the optimized batch for comparison
        const snapshotNoBatch = { ...snapshot, updateEntities: { partial: [], optimized: [] } }
        const bufferNoBatch = createSnapshotBuffer(snapshotNoBatch, config)

        // Expect presence of batch to increase buffer size (writes marker + id + counts + values)
        expect(bufferWithBatch.byteArray.length).toBeGreaterThan(bufferNoBatch.byteArray.length)
    })
})
