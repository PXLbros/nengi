import { describe, it, expect } from 'vitest'
import BinaryType from '../core/binary/BinaryType.js'
import createSnapshotBuffer from '../core/snapshot/writer/createSnapshotBuffer.js'
import readSnapshotBuffer from '../core/snapshot/reader/readSnapshotBuffer.js'
import EntityProtocol from '../core/protocol/EntityProtocol.js'
import defaults from '../core/defaults.js'

describe('Snapshot writer/reader roundtrip', () => {
    it('serializes and deserializes basic entity & single prop update', () => {
        const config = { ...defaults, protocols: { entities: [], messages: [], basics: [], components: [], localMessages: [], commands: [] } }

        const entitySchema = {
            value: { type: BinaryType.UInt16, interp: false, isArray: false }
        }
        const entityProtocol = new EntityProtocol(entitySchema, config)

        const protocols = {
            getProtocol: (index) => index === 0 ? entityProtocol : null,
            getIndex: (protocol) => protocol === entityProtocol ? 0 : -1,
            getMetaProtocol: () => null
        }

        const entity = {
            [config.ID_PROPERTY_NAME]: 1,
            [config.TYPE_PROPERTY_NAME]: 0,
            value: 1234,
            protocol: entityProtocol
        }

        const propData = entityProtocol.properties['value']
        const partialUpdate = {
            id: 1,
            idType: config.ID_BINARY_TYPE,
            key: propData.key,
            keyType: entityProtocol.keyType,
            value: 4321,
            valueType: propData.type,
            prop: 'value',
            path: propData.path
        }

        const snapshot = {
            tick: 5,
            clientTick: 4,
            pingKey: -1,
            avgLatency: 50,
            timestamp: -1,
            transferKey: -1,
            engineMessages: [],
            localEvents: [],
            messages: [],
            jsons: [],
            createEntities: [entity],
            deleteEntities: [],
            updateEntities: {
                full: [],
                partial: [partialUpdate],
                optimized: []
            }
        }

        const bitBuffer = createSnapshotBuffer(snapshot, config)
        const buffer = bitBuffer.toBuffer()

        const read = readSnapshotBuffer(buffer, protocols, config, () => {}, () => {}, () => entityProtocol)

        expect(read.clientTick).toBe(snapshot.clientTick)
        expect(read.createEntities.length).toBe(1)
        expect(read.createEntities[0].value).toBe(1234)
        expect(read.updateEntities.partial.length).toBe(1)
        expect(read.updateEntities.partial[0].value).toBe(4321)
    })
})
