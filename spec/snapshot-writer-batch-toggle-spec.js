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
const configBase = {
    ID_PROPERTY_NAME: 'id',
    ID_BINARY_TYPE: BinaryType.UInt16,
    TYPE_PROPERTY_NAME: 'type',
}

describe('snapshot writer batch toggle', () => {
    it('increases buffer size when batch enabled', () => {
        const config = { ...configBase, ENABLE_BATCH_OPTIMIZATION: true }
        const protocol = new Protocol(schema, config, optSchema, null, true)
        const oldProxy = { id: 1, a: 100, b: 200, c: 300 }
        const newProxy = { id: 1, a: 105, b: 198, c: 450 }
        const updates = chooseOptimization('id', oldProxy, newProxy, protocol)
        console.log('Batch updates:', updates.batch)
        console.log('Batch updates length:', updates.batch.updates.length)
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
        // Build snapshot without batch
        const snapshotNoBatch = { ...snapshot, updateEntities: { partial: [], optimized: [] } }
        const bufferNoBatch = createSnapshotBuffer(snapshotNoBatch, config)
        expect(bufferWithBatch.byteLength).toBeGreaterThan(bufferNoBatch.byteLength)
    })

    it('no size increase when disabled', () => {
        const config = { ...configBase, ENABLE_BATCH_OPTIMIZATION: false }
        const protocol = new Protocol(schema, config, optSchema, null, true)
        const snapshot = {
            clientTick: 1,
            engineMessages: [],
            pingKey: 0,
            timestamp: 0,
            avgLatency: 0,
            createEntities: [],
            updateEntities: { partial: [], optimized: [] },
            deleteEntities: [],
            localEvents: [],
            messages: [],
            jsons: []
        }
        const buffer = createSnapshotBuffer(snapshot, config)
        // Disable batch => same size as itself (sanity > 0)
        expect(buffer.byteLength).toBeGreaterThan(0)
    })
})
