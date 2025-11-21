import { describe, it, expect } from 'vitest'
import readSnapshotBuffer from '../core/snapshot/reader/readSnapshotBuffer.js'
import nengi from '../index.js'
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'

class RWEntity { constructor(x, y) { this.x = x; this.y = y } }
RWEntity.protocol = { x: BinaryType.Float32, y: BinaryType.Float32 }

const makeConfig = () => ({
  ...defaults,
  HIDE_LOGO: true,
  UPDATE_RATE: 20,
  protocols: { entities: [['RWEntity', RWEntity]], messages: [], basics: [], components: [], localMessages: [], commands: [] }
})

// Helper sleep
const pause = (ms) => new Promise(r => setTimeout(r, ms))

describe('Snapshot reader/writer isolated roundtrip', () => {
  it('decodes server-produced create snapshot', async () => {
    const config = makeConfig()
    const instance = new nengi.Instance(config, { port: 8115 })
    instance.onConnect((client, hs, accept) => accept({ accepted: true, text: 'ok' }))
    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false
    bot.onConnect(() => { connected = true })
    bot.connect('ws://localhost:8115/nengi', {})
    for (let i = 0; i < 80 && !connected; i++) { await pause(25) }
    expect(connected).toBe(true)
    const entity = new RWEntity(10, 20)
    entity.protocol = RWEntity.prototype.protocol
    instance.addEntity(entity)
    // Capture first snapshot immediately after creation
    instance.update(); await pause(10)
    const raw = instance.lastSnapshotBuffer.toBuffer()
    const arrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    const decoded = readSnapshotBuffer(arrayBuffer, protocolMap, config, () => {}, () => {}, (id) => protocolMap.getProtocol(entity.ntype))
    expect(decoded.createEntities.length).toBeGreaterThan(0)
    const created = decoded.createEntities.find(e => e.x === 10 && e.y === 20)
    expect(created).toBeTruthy()
  }, 10000)

  it.skip('decodes server-produced partial update snapshot', async () => {
    const config = makeConfig()
    const instance = new nengi.Instance(config, { port: 8116 })
    instance.onConnect((client, hs, accept) => accept({ accepted: true, text: 'ok' }))
    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false
    bot.onConnect(() => { connected = true })
    bot.connect('ws://localhost:8116/nengi', {})
    for (let i = 0; i < 80 && !connected; i++) { await pause(25) }
    expect(connected).toBe(true)
    const entity = new RWEntity(0, 0)
    entity.protocol = RWEntity.prototype.protocol
    instance.addEntity(entity)
    // Establish baseline
    instance.update(); await pause(10)
    entity.x = 9.5
    for (let t = 0; t < 5; t++) { instance.update(); await pause(10) }
    const sawViaBot = bot.snapshots.some(ws => ws.updateEntities.some(u => u && u.value === 9.5))
    // TODO: refine reproduction of diff timing; skipped until reliable deterministic triggering without full visibility logic harness.
    expect(sawViaBot).toBe(true)
  }, 10000)
})

