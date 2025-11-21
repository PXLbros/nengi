import { describe, it, expect } from 'vitest'
import nengi from '../index.js'
import BinaryType from '../core/binary/BinaryType.js'
import defaults from '../core/defaults.js'

class TestEntity {
  constructor(x, y) { this.x = x; this.y = y }
}
TestEntity.protocol = { x: BinaryType.Float32, y: BinaryType.Float32 }

const makeConfig = () => ({
  ...defaults,
  HIDE_LOGO: true,
  UPDATE_RATE: 20,
  protocols: {
    entities: [ ['TestEntity', TestEntity] ],
    messages: [], basics: [], components: [], localMessages: [], commands: []
  }
})

describe('Integration: Snapshot buffer roundtrip', () => {
  it('captures and re-parses creation snapshot then update snapshot', async () => {
    const config = makeConfig()
    const port = 8097
    const instance = new nengi.Instance(config, { port })

    // accept handshakes
    instance.onConnect((client, handshake, accept) => { accept({ accepted: true, text: 'ok' }) })

    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false
    bot.onConnect(() => { connected = true })
    bot.connect(`ws://localhost:${port}/nengi`, {})
    for (let i = 0; i < 80 && !connected; i++) { await new Promise(r => setTimeout(r, 25)) }
    expect(connected).toBe(true)

    // add entity
    const entity = new TestEntity(0, 0)
    entity.protocol = TestEntity.prototype.protocol
    instance.addEntity(entity)

    // run ticks until creation delivered
    for (let t = 0; t < 4; t++) { instance.update(); await new Promise(r => setTimeout(r, 10)) }
    expect(instance.lastSnapshotBuffer).toBeTruthy()
    // client side should have at least one snapshot with a createEntities payload
    const hasCreate = bot.snapshots.some(s => s.createEntities && s.createEntities.length > 0)
    expect(hasCreate).toBe(true)

    // mutate entity after creation phase
    entity.x = 5.5
    entity.y = -3.25
    for (let t = 0; t < 3; t++) { instance.update(); await new Promise(r => setTimeout(r, 10)) }
    // verify at least one client snapshot has partial update referencing our entity id
    const entId = entity[config.ID_PROPERTY_NAME]
    const hasPartial = bot.snapshots.some(ws => ws.updateEntities.some(u => u && u[config.ID_PROPERTY_NAME] === entId && u.prop === 'x'))
    expect(hasPartial).toBe(true)
  }, 10000)
})
