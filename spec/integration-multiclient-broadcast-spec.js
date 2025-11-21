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

describe('Integration: Multi-client entity broadcast', () => {
  it('both bots receive entity create and update', async () => {
    const config = makeConfig()
    const port = 8098
    const instance = new nengi.Instance(config, { port })
    instance.onConnect((client, handshake, accept) => { accept({ accepted: true, text: 'ok' }) })

    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const botA = new nengi.Bot(config, protocolMap)
    const botB = new nengi.Bot(config, protocolMap)
    let connectedA = false, connectedB = false
    botA.onConnect(() => { connectedA = true })
    botB.onConnect(() => { connectedB = true })
    botA.connect(`ws://localhost:${port}/nengi`, {})
    botB.connect(`ws://localhost:${port}/nengi`, {})
    for (let i = 0; i < 80 && (!connectedA || !connectedB); i++) { await new Promise(r => setTimeout(r, 25)) }
    expect(connectedA).toBe(true)
    expect(connectedB).toBe(true)

    // add entity
    const entity = new TestEntity(1, 2)
    entity.protocol = TestEntity.prototype.protocol
    instance.addEntity(entity)
    for (let t = 0; t < 4; t++) { instance.update(); await new Promise(r => setTimeout(r, 10)) }

    // both bots should have received createEntities
    const hasCreateA = botA.snapshots.some(s => s.createEntities && s.createEntities.length > 0)
    const hasCreateB = botB.snapshots.some(s => s.createEntities && s.createEntities.length > 0)
    expect(hasCreateA).toBe(true)
    expect(hasCreateB).toBe(true)

    // update entity
    entity.x = 42
    entity.y = 99
    for (let t = 0; t < 3; t++) { instance.update(); await new Promise(r => setTimeout(r, 10)) }

    // both bots should have received updateEntities for the entity
    const entId = entity[config.ID_PROPERTY_NAME]
    const hasUpdateA = botA.snapshots.some(ws => ws.updateEntities.some(u => u && u[config.ID_PROPERTY_NAME] === entId && u.prop === 'x' && u.value === 42))
    const hasUpdateB = botB.snapshots.some(ws => ws.updateEntities.some(u => u && u[config.ID_PROPERTY_NAME] === entId && u.prop === 'x' && u.value === 42))
    expect(hasUpdateA).toBe(true)
    expect(hasUpdateB).toBe(true)
  }, 10000)
})
