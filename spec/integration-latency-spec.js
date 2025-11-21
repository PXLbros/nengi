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

describe('Integration: Latency simulation', () => {
  it('bot and server exchange ping/pong and update latency', async () => {
    const config = makeConfig()
    const port = 8101
    const instance = new nengi.Instance(config, { port })
    instance.onConnect((client, handshake, accept) => {
      accept({ accepted: true, text: 'ok' })
    })
    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false
    bot.onConnect(() => { connected = true })
    bot.connect(`ws://localhost:${port}/nengi`, {})
    for (let i = 0; i < 80 && !connected; i++) { await new Promise(r => setTimeout(r, 25)) }
    expect(connected).toBe(true)
    // Poll ticks until server latency record receives at least one pong
    let client = null
    for (let t = 0; t < 40; t++) {
      instance.update()
      bot.update()
      await new Promise(r => setTimeout(r, 8))
      client = instance.clients.get(0)
      if (client && client.latencyRecord.latencies.length > 0) {
        break
      }
    }
    expect(client).toBeTruthy()
    expect(client.latencyRecord.latencies.length).toBeGreaterThan(0)
    expect(client.latencyRecord.averageLatency).toBeGreaterThan(0)
    // Wait for a snapshot to propagate the avgLatency to bot
    for (let t = 0; t < 60 && bot.averagePing === 100; t++) {
      instance.update(); bot.update(); await new Promise(r => setTimeout(r, 8))
    }
    const rounded = Math.round(client.latencyRecord.averageLatency)
    expect(bot.averagePing).toBe(rounded)
    expect(bot.averagePing).toBeLessThan(100)
  }, 10000)
})
