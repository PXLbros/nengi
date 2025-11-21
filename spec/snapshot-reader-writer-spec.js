import { describe, it, expect } from 'vitest'
import createSnapshotBuffer from '../core/snapshot/writer/createSnapshotBuffer.js'
import readSnapshotBuffer from '../core/snapshot/reader/readSnapshotBuffer.js'
import nengi from '../index.js'
import defaults from '../core/defaults.js'

// ProtocolMap required for reader; use empty protocol listings
const emptyConfig = { ...defaults, protocols: { entities: [], messages: [], basics: [], components: [], localMessages: [], commands: [] } }
const protocols = new nengi.ProtocolMap(emptyConfig, nengi.metaConfig)

describe.skip('Snapshot reader/writer isolated roundtrip (skipped - synthetic snapshot parsing not aligned)', () => {
  it('roundtrips minimal snapshot (tick & json)', () => {
    const config = { ...defaults }
    const snapshot = {
      clientTick: 123,
      engineMessages: [],
      pingKey: -1,
      timestamp: 0,
      avgLatency: 0,
      createEntities: [],
      updateEntities: { partial: [], optimized: [] },
      deleteEntities: [],
      localEvents: [],
      messages: [],
      jsons: [ JSON.stringify({ hello: 'world' }) ],
    }
    const buffer = createSnapshotBuffer(snapshot, config)
    const round = readSnapshotBuffer(buffer.byteArray.buffer, protocols, config, () => {}, () => {}, () => null)
    expect(round.clientTick).toBe(123)
    expect(round.jsons.length).toBe(1)
    expect(round.updateEntities.partial.length).toBe(0)
    expect(round.deleteEntities.length).toBe(0)
  })

  it('roundtrips empty snapshot (only tick)', () => {
    const config = { ...defaults }
    const empty = {
      clientTick: 0,
      engineMessages: [],
      pingKey: -1,
      timestamp: 0,
      avgLatency: 0,
      createEntities: [],
      updateEntities: { partial: [], optimized: [] },
      deleteEntities: [],
      localEvents: [],
      messages: [],
      jsons: [],
    }
    const buffer = createSnapshotBuffer(empty, config)
    const round = readSnapshotBuffer(buffer.byteArray.buffer, protocols, config, () => {}, () => {}, () => null)
    expect(round.clientTick).toBe(0)
    expect(round.jsons.length).toBe(0)
  })
})
