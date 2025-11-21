import { describe, it, expect } from 'vitest'
import Interpolator from '../core/client/Interpolator.js'
import defaults from '../core/defaults.js'
import Binary from '../core/binary/Binary.js'
import BinaryType from '../core/binary/BinaryType.js'

describe('Interpolator sequence', () => {
    const config = { ...defaults, ID_PROPERTY_NAME: 'nid', TYPE_PROPERTY_NAME: 'ntype' }
    it('interpolates between two snapshots', () => {
        // Setup two snapshots with entity value changing
        const float32Type = BinaryType.Float32
        // Patch binaryType with interp function
        Binary[float32Type].interp = (a, b, t) => a + (b - a) * t
        const entityA = {
            nid: 1,
            ntype: 0,
            protocol: { properties: { value: { type: float32Type, interp: true, path: ['value'] } } },
            value: 10
        }
        const entityB = { nid: 1, ntype: 0, protocol: entityA.protocol, value: 20 }
        const snapshotA = {
            tick: 1,
            timestamp: 1000,
            entities: new Map([[1, entityA]]),
            updateEntities: [{ nid: 1, prop: 'value', path: ['value'], value: 10 }],
            createEntities: [entityA],
            deleteEntities: [],
            noInterps: new Set(),
            processed: false,
            clientTick: 1,
            containsUpdateFor: () => false
        }
        const snapshotB = {
            tick: 2,
            timestamp: 1100,
            entities: new Map([[1, entityB]]),
            updateEntities: [{ nid: 1, prop: 'value', path: ['value'], value: 20 }],
            createEntities: [],
            deleteEntities: [],
            noInterps: new Set(),
            processed: false,
            clientTick: 2,
            containsUpdateFor: (nid, prop) => true // ensure interpolation logic triggers
        }
        const interp = new Interpolator(config)
        // Interpolate at halfway point
        const result = interp.interp([snapshotA, snapshotB], 1050, { cleanUp: () => {} })
        // Should interpolate value to 15
        const found = result.entities.flat().find(e => Array.isArray(e.updateEntities) && e.updateEntities.length)
        const update = found.updateEntities[0]
        expect(update.value).toBeCloseTo(15)
    })
})
