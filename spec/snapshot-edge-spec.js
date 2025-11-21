import { describe, it, expect } from 'vitest'
import createSnapshotBuffer from '../core/snapshot/writer/createSnapshotBuffer.js'
import readSnapshotBuffer from '../core/snapshot/reader/readSnapshotBuffer.js'
import Protocol from '../core/protocol/Protocol.js'
import BinaryType from '../core/binary/BinaryType.js'
import defaults from '../core/defaults.js'

// entity protocol with numeric properties; id/type fields are auto injected by Protocol
const makeEntityProtocol = (config) => new Protocol({
  x: { type: BinaryType.Float32 },
  y: { type: BinaryType.Float32 }
}, config)

// protocol resolver for single prop reading (returns entity protocol regardless of id)
const resolver = () => entityProtocol

let entityProtocol

function makeBaseSnapshot(config) {
  return {
    clientTick: 1,
    timestamp: 1000,
    avgLatency: -1,
    pingKey: 0,
    engineMessages: [],
    createEntities: [],
    updateEntities: { partial: [], optimized: [] },
    deleteEntities: [],
    localEvents: [],
    messages: [],
    jsons: []
  }
}

describe('Snapshot edge cases', () => {
  it('roundtrips empty snapshot with no updates', () => {
    const config = defaults
    entityProtocol = makeEntityProtocol(config)

    const snapshot = makeBaseSnapshot(config)
    const bitBuffer = createSnapshotBuffer(snapshot, config)
    const read = readSnapshotBuffer(bitBuffer.toBuffer(), protocolsStub, config, () => {}, () => {}, resolver)

    expect(read.clientTick).toBe(snapshot.clientTick)
    expect(read.updateEntities.partial.length).toBe(0)
    expect(read.createEntities.length).toBe(0)
    expect(read.deleteEntities.length).toBe(0)
  })

  it('roundtrips delete-only snapshot', () => {
    const config = defaults
    entityProtocol = makeEntityProtocol(config)

    const snapshot = makeBaseSnapshot(config)
    snapshot.deleteEntities = [5,6,7]
    const bitBuffer = createSnapshotBuffer(snapshot, config)
    const read = readSnapshotBuffer(bitBuffer.toBuffer(), protocolsStub, config, () => {}, () => {}, resolver)

    expect(read.deleteEntities).toEqual([5,6,7])
    expect(read.updateEntities.partial.length).toBe(0)
    expect(read.createEntities.length).toBe(0)
  })

  it('roundtrips partial update snapshot', () => {
    const config = defaults
    entityProtocol = makeEntityProtocol(config)

    const snapshot = makeBaseSnapshot(config)
    // build proper partial update objects with required schema info
    const propX = entityProtocol.properties['x']
    const propY = entityProtocol.properties['y']
    snapshot.updateEntities.partial = [
      {
        id: 2,
        idType: config.ID_BINARY_TYPE,
        key: propX.key,
        keyType: entityProtocol.keyType,
        value: 10,
        valueType: propX.type,
        prop: 'x',
        path: propX.path
      },
      {
        id: 2,
        idType: config.ID_BINARY_TYPE,
        key: propY.key,
        keyType: entityProtocol.keyType,
        value: 20,
        valueType: propY.type,
        prop: 'y',
        path: propY.path
      }
    ]
    const bitBuffer = createSnapshotBuffer(snapshot, config)
    const read = readSnapshotBuffer(bitBuffer.toBuffer(), protocolsStub, config, () => {}, () => {}, resolver)

    expect(read.updateEntities.partial.length).toBe(2)
    expect(read.updateEntities.partial[0].value).toBe(10)
    expect(read.updateEntities.partial[1].value).toBe(20)
  })
})

// simple protocols stub implementing getProtocol/getIndex required by readMessages
const protocolsStub = {
  getProtocol: () => entityProtocol,
  getIndex: () => 0,
  getMetaProtocol: () => null
}
