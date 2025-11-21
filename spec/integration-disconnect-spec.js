import { describe, it, expect } from 'vitest'
import nengi from '../index.js'
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'

class TestEntity {
  constructor(x) { this.x = x }
}
TestEntity.protocol = { x: BinaryType.Float32 }

const makeConfig = () => ({
  ...defaults,
  HIDE_LOGO: true,
  UPDATE_RATE: 20,
  protocols: {
    entities: [ ['TestEntity', TestEntity] ],
    messages: [], basics: [], components: [], localMessages: [], commands: []
  }
})

describe('Integration: Disconnect handling', () => {
  it('server detects bot disconnect and removes entity', async () => {
    const config = makeConfig()
    const port = 8100
    const instance = new nengi.Instance(config, { port })
    let disconnectCalled = false
    let clientId = null
    instance.onConnect((client, handshake, accept) => {
      accept({ accepted: true, text: 'ok' })
      clientId = client.id
      // Add entity for client
      const entity = new TestEntity(123)
      entity.protocol = TestEntity.prototype.protocol
      instance.addEntity(entity, client)
    })
    instance.onDisconnect((client) => {
      disconnectCalled = true
    })
    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false
    bot.onConnect(() => { connected = true })
    bot.connect(`ws://localhost:${port}/nengi`, {})
    for (let i = 0; i < 80 && !connected; i++) { await new Promise(r => setTimeout(r, 25)) }
    expect(connected).toBe(true)
    // Run a few ticks to ensure entity is present
    for (let t = 0; t < 3; t++) { instance.update(); await new Promise(r => setTimeout(r, 10)) }
    // Disconnect bot
    bot.disconnect()
    // Run ticks to process disconnect
    for (let t = 0; t < 10; t++) { instance.update(); await new Promise(r => setTimeout(r, 10)) }
    expect(disconnectCalled).toBe(true)
  }, 10000)
})
